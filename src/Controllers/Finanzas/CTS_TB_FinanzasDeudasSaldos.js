/*
 * Benjamin Orellana - 2026/07/17
 * Listados financieros globales de deuda y saldo a favor.
 *
 * Benjamin Orellana - 2026/08/19
 * Consolida alumnos + empleados. Los empleados mantienen su cuenta corriente
 * operativa en usuarios_saldos y sus deudas se derivan de ventas fiadas /
 * parciales de cobros_cobros, sin duplicar movimientos ni crear otra deuda.
 */
import { QueryTypes } from "sequelize";
import db from "../../DataBase/db.js";

const responderError = (res, status, message) =>
  res.status(status).json({ ok: false, message, data: null });

const enteroPositivo = (value, fallback, max = 100) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
};

const fechaArgentina = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
};

const agregarBusquedaPersona = ({ where, replacements, q }) => {
  const texto = String(q || "").trim().replace(/\s+/g, " ");
  if (!texto) return;

  where.push(`(
    CONCAT_WS(' ', nombre, apellido) LIKE :busqueda
    OR COALESCE(dni, '') LIKE :busqueda
    OR COALESCE(email, '') LIKE :busqueda
    OR COALESCE(telefono, '') LIKE :busqueda
  )`);
  replacements.busqueda = `%${texto}%`;
};

// Benjamin Orellana - 2026/08/28 - El middleware financiero de listados
// entrega exactamente las sedes autorizadas. El controlador aplica ese scope
// tanto al resumen como a las filas; nunca ejecuta una lectura financiera sin
// restricción geográfica.
const construirFiltroSedesScope = ({ where, replacements, req }) => {
  const sedeIds = Array.isArray(req.financial_sede_ids)
    ? req.financial_sede_ids
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0)
    : [];

  if (!sedeIds.length) {
    const error = new Error(
      "No se pudo resolver el alcance de sedes para la consulta financiera."
    );
    error.status = 403;
    throw error;
  }

  if (sedeIds.length === 1) {
    where.push("sede_id = :sedeScope0");
    replacements.sedeScope0 = sedeIds[0];
    return;
  }

  const placeholders = sedeIds.map((id, index) => {
    const key = `sedeScope${index}`;
    replacements[key] = id;
    return `:${key}`;
  });

  where.push(`sede_id IN (${placeholders.join(", ")})`);
};

const SQL_DEUDAS_UNIFICADAS = `
WITH deudas_alumnos AS (
  SELECT
    pm.id AS id,
    'alumno' AS cliente_tipo,
    pm.alumno_id AS cliente_id,
    pm.alumno_id AS alumno_id,
    NULL AS usuario_id,
    NULL AS cobro_origen_id,
    pm.membresia_id,
    pm.sede_id,
    pm.periodo_desde,
    pm.periodo_hasta,
    pm.fecha_emision,
    pm.fecha_vencimiento,
    pm.monto_total,
    pm.monto_pagado,
    pm.saldo,
    pm.estado,
    pm.observaciones,
    pm.created_at,
    a.nombre,
    a.apellido,
    a.dni,
    a.telefono,
    a.email,
    a.estado AS persona_estado,
    a.estado AS alumno_estado,
    p.nombre AS plan_nombre,
    NULL AS etiqueta,
    s.nombre AS sede_nombre,
    CASE
      WHEN pm.fecha_vencimiento < :hoy THEN 'vencida'
      WHEN pm.fecha_vencimiento <= DATE_ADD(:hoy, INTERVAL 7 DAY) THEN 'por_vencer'
      ELSE 'al_dia'
    END AS situacion
  FROM pagos_mensualidades pm
  INNER JOIN alumnos_alumnos a ON a.id = pm.alumno_id
  LEFT JOIN alumnos_membresias am ON am.id = pm.membresia_id
  LEFT JOIN planes_planes p ON p.id = am.plan_id
  LEFT JOIN sedes_sedes s ON s.id = pm.sede_id
  WHERE pm.saldo > 0
    AND pm.estado IN ('pendiente','parcial','vencida')
),
ventas_empleados AS (
  SELECT
    c.id AS cobro_origen_id,
    c.cliente_usuario_id AS usuario_id,
    c.sede_id,
    DATE(c.fecha_cobro) AS fecha_emision,
    c.total AS monto_total,
    c.observaciones,
    c.created_at,
    COALESCE((
      SELECT SUM(cp0.monto)
      FROM cobros_pagos cp0
      WHERE cp0.cobro_id = c.id
        AND cp0.estado = 'confirmado'
    ), 0) AS pago_inicial,
    COALESCE((
      SELECT SUM(cd1.total)
      FROM cobros_detalles cd1
      INNER JOIN cobros_cobros c1 ON c1.id = cd1.cobro_id
      WHERE cd1.tipo = 'deuda'
        AND cd1.referencia_id = c.id
        AND c1.cliente_tipo = 'empleado'
        AND c1.cliente_usuario_id = c.cliente_usuario_id
        AND c1.sede_id = c.sede_id
        AND c1.estado = 'confirmado'
    ), 0) AS pagos_deuda,
    (
      SELECT GROUP_CONCAT(cd0.nombre_snapshot ORDER BY cd0.id SEPARATOR ', ')
      FROM cobros_detalles cd0
      WHERE cd0.cobro_id = c.id
        AND cd0.tipo IN ('producto','servicio')
    ) AS conceptos
  FROM cobros_cobros c
  WHERE c.cliente_tipo = 'empleado'
    AND c.cliente_usuario_id IS NOT NULL
    AND c.estado = 'confirmado'
    AND EXISTS (
      SELECT 1
      FROM cobros_detalles cdv
      WHERE cdv.cobro_id = c.id
        AND cdv.tipo IN ('producto','servicio')
    )
),
deudas_empleados AS (
  SELECT
    -ve.cobro_origen_id AS id,
    'empleado' AS cliente_tipo,
    ve.usuario_id AS cliente_id,
    NULL AS alumno_id,
    ve.usuario_id AS usuario_id,
    ve.cobro_origen_id,
    NULL AS membresia_id,
    ve.sede_id,
    ve.fecha_emision AS periodo_desde,
    ve.fecha_emision AS periodo_hasta,
    ve.fecha_emision,
    ve.fecha_emision AS fecha_vencimiento,
    ve.monto_total,
    (ve.pago_inicial + ve.pagos_deuda) AS monto_pagado,
    GREATEST(ve.monto_total - ve.pago_inicial - ve.pagos_deuda, 0) AS saldo,
    CASE
      WHEN ve.fecha_emision < :hoy THEN 'vencida'
      WHEN (ve.pago_inicial + ve.pagos_deuda) > 0.009 THEN 'parcial'
      ELSE 'pendiente'
    END AS estado,
    ve.observaciones,
    ve.created_at,
    u.nombre,
    u.apellido,
    NULL AS dni,
    NULL AS telefono,
    u.email,
    u.estado AS persona_estado,
    u.estado AS alumno_estado,
    NULL AS plan_nombre,
    CONCAT('Compra #', ve.cobro_origen_id,
      CASE WHEN ve.conceptos IS NOT NULL AND ve.conceptos <> ''
        THEN CONCAT(' · ', ve.conceptos) ELSE '' END
    ) AS etiqueta,
    s.nombre AS sede_nombre,
    CASE
      WHEN ve.fecha_emision < :hoy THEN 'vencida'
      WHEN ve.fecha_emision <= DATE_ADD(:hoy, INTERVAL 7 DAY) THEN 'por_vencer'
      ELSE 'al_dia'
    END AS situacion
  FROM ventas_empleados ve
  INNER JOIN usuarios_usuarios u ON u.id = ve.usuario_id
  LEFT JOIN sedes_sedes s ON s.id = ve.sede_id
  WHERE GREATEST(ve.monto_total - ve.pago_inicial - ve.pagos_deuda, 0) > 0.009
),
deudas AS (
  SELECT * FROM deudas_alumnos
  UNION ALL
  SELECT * FROM deudas_empleados
)
`;

export const OBR_DeudasFinanzas_CTS = async (req, res) => {
  try {
    const pagina = enteroPositivo(req.query.pagina || req.query.page, 1, 100000);
    const limite = enteroPositivo(req.query.limite || req.query.limit, 20, 200);
    const offset = (pagina - 1) * limite;
    const hoy = fechaArgentina();
    const where = ["saldo > 0"];
    const replacements = { hoy, limite, offset };

    agregarBusquedaPersona({ where, replacements, q: req.query.q });
    construirFiltroSedesScope({ where, replacements, req });

    const estado = String(req.query.estado || "todas").toLowerCase();
    if (!["todas", "pendiente", "parcial", "vencida"].includes(estado)) {
      return responderError(res, 400, "El estado de deuda no es válido.");
    }
    if (estado !== "todas") {
      where.push("estado = :estado");
      replacements.estado = estado;
    }

    const situacion = String(req.query.situacion || "todas").toLowerCase();
    if (!["todas", "vencida", "por_vencer", "al_dia"].includes(situacion)) {
      return responderError(res, 400, "La situación de deuda no es válida.");
    }
    if (situacion !== "todas") {
      where.push("situacion = :situacion");
      replacements.situacion = situacion;
    }

    const desde = String(req.query.vencimiento_desde || "").trim();
    const hasta = String(req.query.vencimiento_hasta || "").trim();
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
    if (desde) {
      if (!dateOnly.test(desde)) {
        return responderError(res, 400, "La fecha desde debe usar YYYY-MM-DD.");
      }
      where.push("fecha_vencimiento >= :desde");
      replacements.desde = desde;
    }
    if (hasta) {
      if (!dateOnly.test(hasta)) {
        return responderError(res, 400, "La fecha hasta debe usar YYYY-MM-DD.");
      }
      where.push("fecha_vencimiento <= :hasta");
      replacements.hasta = hasta;
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [resumenRows, rows] = await Promise.all([
      db.query(
        `${SQL_DEUDAS_UNIFICADAS}
         SELECT
           COUNT(*) AS cantidad_deudas,
           COUNT(DISTINCT CONCAT(cliente_tipo, ':', cliente_id)) AS cantidad_personas,
           COALESCE(SUM(saldo), 0) AS deuda_total,
           COALESCE(SUM(CASE WHEN situacion = 'vencida' THEN saldo ELSE 0 END), 0) AS deuda_vencida,
           COALESCE(SUM(CASE WHEN situacion <> 'vencida' THEN saldo ELSE 0 END), 0) AS deuda_no_vencida
         FROM deudas
         ${whereSql}`,
        { replacements, type: QueryTypes.SELECT },
      ),
      db.query(
        `${SQL_DEUDAS_UNIFICADAS}
         SELECT *
         FROM deudas
         ${whereSql}
         ORDER BY
           CASE WHEN situacion = 'vencida' THEN 0 ELSE 1 END,
           fecha_vencimiento ASC,
           created_at DESC,
           id DESC
         LIMIT :limite OFFSET :offset`,
        { replacements, type: QueryTypes.SELECT },
      ),
    ]);

    const resumen = resumenRows[0] || {};
    const total = Number(resumen.cantidad_deudas || 0);
    const cantidadPersonas = Number(resumen.cantidad_personas || 0);

    return res.json({
      ok: true,
      data: rows.map((row) => ({
        ...row,
        id: Number(row.id),
        cliente_id: Number(row.cliente_id),
        alumno_id: row.alumno_id ? Number(row.alumno_id) : null,
        usuario_id: row.usuario_id ? Number(row.usuario_id) : null,
        cobro_origen_id: row.cobro_origen_id ? Number(row.cobro_origen_id) : null,
        membresia_id: row.membresia_id ? Number(row.membresia_id) : null,
        sede_id: Number(row.sede_id),
        monto_total: Number(row.monto_total || 0),
        monto_pagado: Number(row.monto_pagado || 0),
        saldo: Number(row.saldo || 0),
      })),
      resumen: {
        cantidad_deudas: total,
        cantidad_personas: cantidadPersonas,
        // Alias conservado para no romper consumidores anteriores.
        cantidad_alumnos: cantidadPersonas,
        deuda_total: Number(resumen.deuda_total || 0),
        deuda_vencida: Number(resumen.deuda_vencida || 0),
        deuda_no_vencida: Number(resumen.deuda_no_vencida || 0),
      },
      paginacion: {
        pagina,
        limite,
        total,
        total_paginas: Math.max(Math.ceil(total / limite), 1),
      },
    });
  } catch (requestError) {
    console.error("Error OBR_DeudasFinanzas_CTS:", requestError);
    return responderError(
      res,
      Number(requestError?.status || 500),
      requestError?.message || "Error interno al consultar las deudas.",
    );
  }
};

const SQL_SALDOS_UNIFICADOS = `
WITH saldos_alumnos AS (
  SELECT
    sa.id AS id,
    'alumno' AS cliente_tipo,
    sa.alumno_id AS cliente_id,
    sa.alumno_id AS alumno_id,
    NULL AS usuario_id,
    sa.moneda,
    sa.saldo,
    sa.created_at,
    sa.updated_at,
    a.nombre,
    a.apellido,
    a.dni,
    a.telefono,
    a.email,
    a.estado AS persona_estado,
    a.estado AS alumno_estado,
    a.sede_id,
    s.nombre AS sede_nombre,
    (
      SELECT sm.created_at
      FROM alumnos_saldos_movimientos sm
      WHERE sm.saldo_id = sa.id
      ORDER BY sm.id DESC LIMIT 1
    ) AS ultimo_movimiento_fecha,
    (
      SELECT sm.tipo
      FROM alumnos_saldos_movimientos sm
      WHERE sm.saldo_id = sa.id
      ORDER BY sm.id DESC LIMIT 1
    ) AS ultimo_movimiento_tipo,
    (
      SELECT sm.monto
      FROM alumnos_saldos_movimientos sm
      WHERE sm.saldo_id = sa.id
      ORDER BY sm.id DESC LIMIT 1
    ) AS ultimo_movimiento_monto,
    (
      SELECT sm.origen
      FROM alumnos_saldos_movimientos sm
      WHERE sm.saldo_id = sa.id
      ORDER BY sm.id DESC LIMIT 1
    ) AS ultimo_movimiento_origen,
    (
      SELECT sm.motivo
      FROM alumnos_saldos_movimientos sm
      WHERE sm.saldo_id = sa.id
      ORDER BY sm.id DESC LIMIT 1
    ) AS ultimo_movimiento_motivo,
    (
      SELECT sm.referencia
      FROM alumnos_saldos_movimientos sm
      WHERE sm.saldo_id = sa.id
      ORDER BY sm.id DESC LIMIT 1
    ) AS ultimo_movimiento_referencia,
    (
      SELECT CONCAT_WS(' ', u2.nombre, u2.apellido)
      FROM alumnos_saldos_movimientos sm
      LEFT JOIN usuarios_usuarios u2 ON u2.id = sm.usuario_id
      WHERE sm.saldo_id = sa.id
      ORDER BY sm.id DESC LIMIT 1
    ) AS ultimo_movimiento_usuario
  FROM alumnos_saldos sa
  INNER JOIN alumnos_alumnos a ON a.id = sa.alumno_id
  LEFT JOIN sedes_sedes s ON s.id = a.sede_id
),
saldos_empleados AS (
  SELECT
    -us.id AS id,
    'empleado' AS cliente_tipo,
    us.usuario_id AS cliente_id,
    NULL AS alumno_id,
    us.usuario_id AS usuario_id,
    us.moneda,
    us.saldo,
    us.created_at,
    us.updated_at,
    u.nombre,
    u.apellido,
    NULL AS dni,
    NULL AS telefono,
    u.email,
    u.estado AS persona_estado,
    u.estado AS alumno_estado,
    s.id AS sede_id,
    s.nombre AS sede_nombre,
    (
      SELECT um.created_at
      FROM usuarios_saldos_movimientos um
      WHERE um.saldo_id = us.id
        AND um.sede_id = s.id
      ORDER BY um.id DESC LIMIT 1
    ) AS ultimo_movimiento_fecha,
    (
      SELECT um.tipo
      FROM usuarios_saldos_movimientos um
      WHERE um.saldo_id = us.id
        AND um.sede_id = s.id
      ORDER BY um.id DESC LIMIT 1
    ) AS ultimo_movimiento_tipo,
    (
      SELECT um.monto
      FROM usuarios_saldos_movimientos um
      WHERE um.saldo_id = us.id
        AND um.sede_id = s.id
      ORDER BY um.id DESC LIMIT 1
    ) AS ultimo_movimiento_monto,
    (
      SELECT um.origen
      FROM usuarios_saldos_movimientos um
      WHERE um.saldo_id = us.id
        AND um.sede_id = s.id
      ORDER BY um.id DESC LIMIT 1
    ) AS ultimo_movimiento_origen,
    (
      SELECT um.motivo
      FROM usuarios_saldos_movimientos um
      WHERE um.saldo_id = us.id
        AND um.sede_id = s.id
      ORDER BY um.id DESC LIMIT 1
    ) AS ultimo_movimiento_motivo,
    (
      SELECT um.referencia
      FROM usuarios_saldos_movimientos um
      WHERE um.saldo_id = us.id
        AND um.sede_id = s.id
      ORDER BY um.id DESC LIMIT 1
    ) AS ultimo_movimiento_referencia,
    (
      SELECT CONCAT_WS(' ', u2.nombre, u2.apellido)
      FROM usuarios_saldos_movimientos um
      LEFT JOIN usuarios_usuarios u2 ON u2.id = um.usuario_registro_id
      WHERE um.saldo_id = us.id
        AND um.sede_id = s.id
      ORDER BY um.id DESC LIMIT 1
    ) AS ultimo_movimiento_usuario
  FROM usuarios_saldos us
  INNER JOIN usuarios_usuarios u ON u.id = us.usuario_id
  INNER JOIN sedes_sedes s ON (
    u.acceso_todas_sedes = 1
    OR u.sede_principal_id = s.id
    OR EXISTS (
      SELECT 1
      FROM usuarios_sedes ux
      WHERE ux.usuario_id = u.id
        AND ux.sede_id = s.id
        AND ux.activo = 1
    )
  )
  WHERE u.estado = 'activo'
),
saldos AS (
  SELECT * FROM saldos_alumnos
  UNION ALL
  SELECT * FROM saldos_empleados
)
`;

export const OBR_SaldosFinanzas_CTS = async (req, res) => {
  try {
    const pagina = enteroPositivo(req.query.pagina || req.query.page, 1, 100000);
    const limite = enteroPositivo(req.query.limite || req.query.limit, 20, 200);
    const offset = (pagina - 1) * limite;
    const where = ["1 = 1"];
    const replacements = { limite, offset };

    agregarBusquedaPersona({ where, replacements, q: req.query.q });
    construirFiltroSedesScope({ where, replacements, req });

    const estado = String(req.query.estado || "con_saldo").toLowerCase();
    if (!["con_saldo", "sin_saldo", "todos"].includes(estado)) {
      return responderError(res, 400, "El filtro de saldo no es válido.");
    }
    if (estado === "con_saldo") where.push("saldo > 0");
    if (estado === "sin_saldo") where.push("saldo = 0");

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [resumenRows, rows] = await Promise.all([
      db.query(
        `${SQL_SALDOS_UNIFICADOS}
         SELECT
           COUNT(*) AS cantidad_cuentas,
           COALESCE(SUM(CASE WHEN saldo > 0 THEN 1 ELSE 0 END), 0) AS personas_con_saldo,
           COALESCE(SUM(saldo), 0) AS saldo_total,
           COALESCE(MAX(saldo), 0) AS saldo_mayor
         FROM saldos
         ${whereSql}`,
        { replacements, type: QueryTypes.SELECT },
      ),
      db.query(
        `${SQL_SALDOS_UNIFICADOS}
         SELECT *
         FROM saldos
         ${whereSql}
         ORDER BY saldo DESC, updated_at DESC, id DESC
         LIMIT :limite OFFSET :offset`,
        { replacements, type: QueryTypes.SELECT },
      ),
    ]);

    const resumen = resumenRows[0] || {};
    const total = Number(resumen.cantidad_cuentas || 0);
    const personasConSaldo = Number(resumen.personas_con_saldo || 0);

    return res.json({
      ok: true,
      data: rows.map((row) => ({
        ...row,
        id: Number(row.id),
        cliente_id: Number(row.cliente_id),
        alumno_id: row.alumno_id ? Number(row.alumno_id) : null,
        usuario_id: row.usuario_id ? Number(row.usuario_id) : null,
        sede_id: Number(row.sede_id),
        saldo: Number(row.saldo || 0),
        ultimo_movimiento_monto: Number(row.ultimo_movimiento_monto || 0),
      })),
      resumen: {
        cantidad_cuentas: total,
        personas_con_saldo: personasConSaldo,
        // Alias conservado para no romper consumidores anteriores.
        alumnos_con_saldo: personasConSaldo,
        saldo_total: Number(resumen.saldo_total || 0),
        saldo_mayor: Number(resumen.saldo_mayor || 0),
      },
      paginacion: {
        pagina,
        limite,
        total,
        total_paginas: Math.max(Math.ceil(total / limite), 1),
      },
    });
  } catch (requestError) {
    console.error("Error OBR_SaldosFinanzas_CTS:", requestError);
    return responderError(
      res,
      Number(requestError?.status || 500),
      requestError?.message || "Error interno al consultar los saldos.",
    );
  }
};
