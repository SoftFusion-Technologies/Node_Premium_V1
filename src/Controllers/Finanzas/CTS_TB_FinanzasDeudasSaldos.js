/*
 * Benjamin Orellana - 2026/07/17
 * Listados financieros globales de deuda y saldo a favor.
 * Las operaciones continúan delegadas a los controladores transaccionales
 * existentes; este controlador sólo expone lectura, resumen y auditoría.
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

const idValido = (value) =>
  Number.isInteger(Number(value)) && Number(value) > 0;

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

const agregarBusqueda = ({ where, replacements, q }) => {
  const texto = String(q || "").trim().replace(/\s+/g, " ");
  if (!texto) return;

  where.push(`(
    CONCAT_WS(' ', a.nombre, a.apellido) LIKE :busqueda
    OR a.dni LIKE :busqueda
    OR a.email LIKE :busqueda
    OR a.telefono LIKE :busqueda
  )`);
  replacements.busqueda = `%${texto}%`;
};

export const OBR_DeudasFinanzas_CTS = async (req, res) => {
  try {
    const pagina = enteroPositivo(req.query.pagina || req.query.page, 1, 100000);
    const limite = enteroPositivo(req.query.limite || req.query.limit, 20, 100);
    const offset = (pagina - 1) * limite;
    const hoy = fechaArgentina();
    const where = [
      "pm.saldo > 0",
      "pm.estado IN ('pendiente','parcial','vencida')",
    ];
    const replacements = { hoy, limite, offset };

    agregarBusqueda({ where, replacements, q: req.query.q });

    if (req.query.sede_id) {
      if (!idValido(req.query.sede_id)) {
        return responderError(res, 400, "La sede indicada no es válida.");
      }
      where.push("pm.sede_id = :sedeId");
      replacements.sedeId = Number(req.query.sede_id);
    }

    const estado = String(req.query.estado || "todas").toLowerCase();
    if (!["todas", "pendiente", "parcial", "vencida"].includes(estado)) {
      return responderError(res, 400, "El estado de deuda no es válido.");
    }
    if (estado !== "todas") {
      where.push("pm.estado = :estado");
      replacements.estado = estado;
    }

    const situacion = String(req.query.situacion || "todas").toLowerCase();
    if (!["todas", "vencida", "por_vencer", "al_dia"].includes(situacion)) {
      return responderError(res, 400, "La situación de deuda no es válida.");
    }
    if (situacion === "vencida") {
      where.push("pm.fecha_vencimiento < :hoy");
    } else if (situacion === "por_vencer") {
      where.push("pm.fecha_vencimiento BETWEEN :hoy AND DATE_ADD(:hoy, INTERVAL 7 DAY)");
    } else if (situacion === "al_dia") {
      where.push("pm.fecha_vencimiento >= :hoy");
    }

    const desde = String(req.query.vencimiento_desde || "").trim();
    const hasta = String(req.query.vencimiento_hasta || "").trim();
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
    if (desde) {
      if (!dateOnly.test(desde)) {
        return responderError(res, 400, "La fecha desde debe usar YYYY-MM-DD.");
      }
      where.push("pm.fecha_vencimiento >= :desde");
      replacements.desde = desde;
    }
    if (hasta) {
      if (!dateOnly.test(hasta)) {
        return responderError(res, 400, "La fecha hasta debe usar YYYY-MM-DD.");
      }
      where.push("pm.fecha_vencimiento <= :hasta");
      replacements.hasta = hasta;
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const fromSql = `
      FROM pagos_mensualidades pm
      INNER JOIN alumnos_alumnos a ON a.id = pm.alumno_id
      LEFT JOIN alumnos_membresias am ON am.id = pm.membresia_id
      LEFT JOIN planes_planes p ON p.id = am.plan_id
      LEFT JOIN sedes_sedes s ON s.id = pm.sede_id
    `;

    const [resumenRows, rows] = await Promise.all([
      db.query(
        `SELECT
           COUNT(*) AS cantidad_deudas,
           COUNT(DISTINCT pm.alumno_id) AS cantidad_alumnos,
           COALESCE(SUM(pm.saldo), 0) AS deuda_total,
           COALESCE(SUM(CASE WHEN pm.fecha_vencimiento < :hoy THEN pm.saldo ELSE 0 END), 0) AS deuda_vencida,
           COALESCE(SUM(CASE WHEN pm.fecha_vencimiento >= :hoy THEN pm.saldo ELSE 0 END), 0) AS deuda_no_vencida
         ${fromSql} ${whereSql}`,
        { replacements, type: QueryTypes.SELECT },
      ),
      db.query(
        `SELECT
           pm.id, pm.alumno_id, pm.membresia_id, pm.sede_id,
           pm.periodo_desde, pm.periodo_hasta, pm.fecha_emision,
           pm.fecha_vencimiento, pm.monto_total, pm.monto_pagado,
           pm.saldo, pm.estado, pm.observaciones, pm.created_at,
           a.nombre, a.apellido, a.dni, a.telefono, a.email,
           a.estado AS alumno_estado,
           p.nombre AS plan_nombre,
           s.nombre AS sede_nombre,
           CASE
             WHEN pm.fecha_vencimiento < :hoy THEN 'vencida'
             WHEN pm.fecha_vencimiento <= DATE_ADD(:hoy, INTERVAL 7 DAY) THEN 'por_vencer'
             ELSE 'al_dia'
           END AS situacion
         ${fromSql} ${whereSql}
         ORDER BY
           CASE WHEN pm.fecha_vencimiento < :hoy THEN 0 ELSE 1 END,
           pm.fecha_vencimiento ASC, pm.id DESC
         LIMIT :limite OFFSET :offset`,
        { replacements, type: QueryTypes.SELECT },
      ),
    ]);

    const resumen = resumenRows[0] || {};
    const total = Number(resumen.cantidad_deudas || 0);

    return res.json({
      ok: true,
      data: rows,
      resumen: {
        cantidad_deudas: total,
        cantidad_alumnos: Number(resumen.cantidad_alumnos || 0),
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
    return responderError(res, 500, "Error interno al consultar las deudas.");
  }
};

export const OBR_SaldosFinanzas_CTS = async (req, res) => {
  try {
    const pagina = enteroPositivo(req.query.pagina || req.query.page, 1, 100000);
    const limite = enteroPositivo(req.query.limite || req.query.limit, 20, 100);
    const offset = (pagina - 1) * limite;
    const where = ["1 = 1"];
    const replacements = { limite, offset };

    agregarBusqueda({ where, replacements, q: req.query.q });

    if (req.query.sede_id) {
      if (!idValido(req.query.sede_id)) {
        return responderError(res, 400, "La sede indicada no es válida.");
      }
      where.push("a.sede_id = :sedeId");
      replacements.sedeId = Number(req.query.sede_id);
    }

    const estado = String(req.query.estado || "con_saldo").toLowerCase();
    if (!["con_saldo", "sin_saldo", "todos"].includes(estado)) {
      return responderError(res, 400, "El filtro de saldo no es válido.");
    }
    if (estado === "con_saldo") where.push("sa.saldo > 0");
    if (estado === "sin_saldo") where.push("sa.saldo = 0");

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const fromSql = `
      FROM alumnos_saldos sa
      INNER JOIN alumnos_alumnos a ON a.id = sa.alumno_id
      LEFT JOIN sedes_sedes s ON s.id = a.sede_id
    `;

    const [resumenRows, rows] = await Promise.all([
      db.query(
        `SELECT
           COUNT(*) AS cantidad_cuentas,
           COALESCE(SUM(CASE WHEN sa.saldo > 0 THEN 1 ELSE 0 END), 0) AS alumnos_con_saldo,
           COALESCE(SUM(sa.saldo), 0) AS saldo_total,
           COALESCE(MAX(sa.saldo), 0) AS saldo_mayor
         ${fromSql} ${whereSql}`,
        { replacements, type: QueryTypes.SELECT },
      ),
      db.query(
        `SELECT
           sa.id, sa.alumno_id, sa.moneda, sa.saldo, sa.created_at, sa.updated_at,
           a.nombre, a.apellido, a.dni, a.telefono, a.email,
           a.estado AS alumno_estado, a.sede_id,
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
           ) AS ultimo_movimiento_monto
         ${fromSql} ${whereSql}
         ORDER BY sa.saldo DESC, sa.updated_at DESC, sa.id DESC
         LIMIT :limite OFFSET :offset`,
        { replacements, type: QueryTypes.SELECT },
      ),
    ]);

    const resumen = resumenRows[0] || {};
    const total = Number(resumen.cantidad_cuentas || 0);

    return res.json({
      ok: true,
      data: rows,
      resumen: {
        cantidad_cuentas: total,
        alumnos_con_saldo: Number(resumen.alumnos_con_saldo || 0),
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
    return responderError(res, 500, "Error interno al consultar los saldos.");
  }
};
