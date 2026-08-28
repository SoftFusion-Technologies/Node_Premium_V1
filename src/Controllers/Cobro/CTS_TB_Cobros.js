/*
 * Benjamin Orellana - 2026/07/14 - Endpoints operativos de Nuevo Cobro.
 * La logica transaccional vive en Services/Cobro para poder reutilizarla
 * luego desde validaciones, anulaciones y otros canales de venta.
 */
import { QueryTypes } from 'sequelize';
import db from '../../DataBase/db.js';
import PagosMediosPagoModel from '../../Models/Pago/MD_TB_PagosMediosPago.js';
import AlumnosModel from '../../Models/Alumno/MD_TB_Alumnos.js';
import AlumnosSaldosModel from '../../Models/Alumno/MD_TB_AlumnosSaldos.js';
import UsuariosModel from '../../Models/Usuario/MD_TB_Usuarios.js';
import UsuariosSaldosModel from '../../Models/Usuario/MD_TB_UsuariosSaldos.js';
import UsuariosSaldosMovimientosModel from '../../Models/Usuario/MD_TB_UsuariosSaldosMovimientos.js';
import CajasSesionesModel from '../../Models/Caja/MD_TB_CajasSesiones.js';
import CajasMovimientosModel from '../../Models/Caja/MD_TB_CajasMovimientos.js';
import {
  fechaArgentina,
  usuarioTieneAlcanceOperativoDiario,
  validarFechaConsultaOperativa
} from '../../Security/operationalDayScope.js';
import {
  analizarAnulacionCobro,
  anularCobroConfirmado,
  corregirMedioPagoCobroConfirmado,
  editarCobroConfirmado,
  CobroOperacionError,
  confirmarCobroPendiente,
  rechazarCobroPendiente,
  registrarCobro
} from '../../Services/Cobro/cobro.service.js';

const redondearImporte = (valor) =>
  Math.round((Number(valor || 0) + Number.EPSILON) * 100) / 100;

const empleadoDisponibleEnSede = async ({ usuarioId, sedeId, transaction = null }) => {
  const rows = await db.query(
    `SELECT u.id, u.nombre, u.apellido
       FROM usuarios_usuarios u
      WHERE u.id = :usuarioId
        AND u.estado = 'activo'
        AND (
          u.acceso_todas_sedes = 1
          OR u.sede_principal_id = :sedeId
          OR EXISTS (
            SELECT 1
              FROM usuarios_sedes us
             WHERE us.usuario_id = u.id
               AND us.sede_id = :sedeId
               AND us.activo = 1
          )
        )
      LIMIT 1`,
    { replacements: { usuarioId, sedeId }, type: QueryTypes.SELECT, transaction },
  );
  return rows[0] || null;
};

const manejarErrorCobro = (error, res, contexto) => {
  if (error instanceof CobroOperacionError) {
    return res.status(error.status).json({
      ok: false,
      code: error.code,
      codigo: error.code,
      message: error.message
    });
  }
  console.error(`Error ${contexto}:`, error);
  return res
    .status(500)
    .json({ ok: false, message: 'Error interno al procesar el cobro.' });
};

// Benjamin Orellana - 2026/08/28 - El historial de Cobros puede consultar
// una sede concreta o el conjunto completo de sedes autorizadas del usuario.
// El scope SIEMPRE se construye desde req.user.sedes; omitir sede_id nunca
// equivale a quitar la restricción geográfica.
const resolverSedesCobrosConsulta = (req) => {
  const sedesPermitidas = Array.from(
    new Set(
      (Array.isArray(req.user?.sedes) ? req.user.sedes : [])
        .filter(
          (sede) =>
            sede?.asignacion?.activo !== false &&
            sede?.asignacion?.puede_operar !== false
        )
        .map((sede) => Number(sede?.id ?? sede?.sede_id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );

  if (!sedesPermitidas.length) {
    return {
      ok: false,
      status: 403,
      code: 'COBROS_SEDES_SCOPE_EMPTY',
      message: 'No tiene sedes habilitadas para consultar Cobros.'
    };
  }

  const sedeSolicitadaTexto = String(req.query?.sede_id || '').trim();

  if (
    !sedeSolicitadaTexto ||
    sedeSolicitadaTexto.toLowerCase() === 'todas'
  ) {
    return { ok: true, sedeIds: sedesPermitidas };
  }

  const sedeSolicitada = Number(sedeSolicitadaTexto);

  if (!Number.isInteger(sedeSolicitada) || sedeSolicitada <= 0) {
    return {
      ok: false,
      status: 400,
      code: 'COBROS_SEDE_INVALIDA',
      message: 'Debe indicar una sede válida.'
    };
  }

  if (!sedesPermitidas.includes(sedeSolicitada)) {
    return {
      ok: false,
      status: 403,
      code: 'COBROS_SEDE_DENEGADA',
      message: 'No tiene acceso a la sede indicada.'
    };
  }

  return { ok: true, sedeIds: [sedeSolicitada] };
};

const construirFiltros = (query, sedeIds) => {
  const where = [];
  const replacements = {};
  const sedes = Array.isArray(sedeIds)
    ? sedeIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    : [];

  if (sedes.length === 1) {
    where.push('c.sede_id = :sedeId');
    replacements.sedeId = sedes[0];
  } else {
    const placeholders = sedes.map((id, index) => {
      const key = `sedeScope${index}`;
      replacements[key] = id;
      return `:${key}`;
    });

    where.push(`c.sede_id IN (${placeholders.join(', ')})`);
  }

  const estado = String(query.estado || '').trim();
  const q = String(query.q || '').trim();

  if (estado) {
    where.push('c.estado = :estado');
    replacements.estado = estado;
  }
  if (query.desde) {
    where.push('DATE(c.fecha_cobro) >= :desde');
    replacements.desde = query.desde;
  }
  if (query.hasta) {
    where.push('DATE(c.fecha_cobro) <= :hasta');
    replacements.hasta = query.hasta;
  }
  if (query.medio_pago_id) {
    where.push(`EXISTS (
      SELECT 1 FROM cobros_pagos cp_f
      WHERE cp_f.cobro_id = c.id AND cp_f.medio_pago_id = :medioPagoId
        AND cp_f.estado IN ('confirmado', 'pendiente_validacion')
    )`);
    replacements.medioPagoId = Number(query.medio_pago_id);
  }
  if (q) {
    where.push(`(
      CAST(c.id AS CHAR) LIKE :q OR
      CONCAT_WS(' ', a.nombre, a.apellido) LIKE :q OR
      CONCAT_WS(' ', uc.nombre, uc.apellido) LIKE :q OR
      CONCAT_WS(' ', cobrador.nombre, cobrador.apellido) LIKE :q OR
      EXISTS (
        SELECT 1 FROM cobros_detalles cd_f
        WHERE cd_f.cobro_id = c.id AND cd_f.nombre_snapshot LIKE :q
      )
    )`);
    replacements.q = `%${q}%`;
  }

  return { whereSql: where.join(' AND '), replacements };
};

export const OBR_MediosPagoCobro_CTS = async (_req, res) => {
  try {
    const medios = await PagosMediosPagoModel.findAll({
      where: { activo: 1 },
      attributes: [
        'id',
        'nombre',
        'codigo',
        'tipo',
        'requiere_comprobante',
        'requiere_validacion',
        'orden',
        'impacta_caja'
      ],
      order: [['orden', 'ASC'], ['nombre', 'ASC']]
    });

    return res.status(200).json({
      ok: true,
      message: 'Medios de pago obtenidos correctamente.',
      data: medios
    });
  } catch (error) {
    console.error('Error OBR_MediosPagoCobro_CTS:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al consultar los medios de pago.'
    });
  }
};

// Benjamin Orellana - 2026/07/30 - Saldo mínimo necesario para completar un cobro.
// No expone movimientos, auditoría ni información financiera histórica del alumno.
export const OBR_SaldoDisponibleCobro_CTS = async (req, res) => {
  try {
    const alumnoId = Number(req.params.alumno_id);
    const sedeId = Number(req.query.sede_id);

    if (!Number.isInteger(alumnoId) || alumnoId <= 0) {
      return res.status(400).json({
        ok: false,
        message: 'Debe indicar un alumno válido.'
      });
    }

    if (!Number.isInteger(sedeId) || sedeId <= 0) {
      return res.status(400).json({
        ok: false,
        message: 'Debe indicar una sede válida.'
      });
    }

    const alumno = await AlumnosModel.findByPk(alumnoId, {
      attributes: ['id']
    });

    if (!alumno) {
      return res.status(404).json({
        ok: false,
        message: 'No se encontró el alumno seleccionado.'
      });
    }

    const cuenta = await AlumnosSaldosModel.findOne({
      where: { alumno_id: alumnoId },
      attributes: ['saldo', 'moneda']
    });

    return res.status(200).json({
      ok: true,
      data: {
        saldo: Number(cuenta?.saldo || 0),
        moneda: cuenta?.moneda || 'ARS'
      }
    });
  } catch (error) {
    console.error('Error OBR_SaldoDisponibleCobro_CTS:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al consultar el saldo disponible para el cobro.'
    });
  }
};


// Benjamin Orellana - 2026/08/11 - Lista deudas cobrables mínimas para el drawer de Cobros.
// Se expone con permiso cobros.registrar para no depender de permisos del módulo Pagos.
export const OBR_DeudasAlumnoCobro_CTS = async (req, res) => {
  try {
    const alumnoId = Number(req.params.alumno_id);
    const sedeId = Number(req.query.sede_id);

    if (!Number.isInteger(alumnoId) || alumnoId <= 0) {
      return res.status(400).json({ ok: false, message: 'Debe indicar un alumno válido.' });
    }
    if (!Number.isInteger(sedeId) || sedeId <= 0) {
      return res.status(400).json({ ok: false, message: 'Debe indicar una sede válida.' });
    }

    const rows = await db.query(
      `SELECT
         pm.id AS mensualidad_id,
         pm.alumno_id,
         pm.membresia_id,
         pm.sede_id,
         pm.periodo_desde,
         pm.periodo_hasta,
         pm.fecha_vencimiento,
         pm.monto_total,
         pm.monto_pagado,
         pm.saldo,
         pm.observaciones,
         COALESCE((
           SELECT SUM(ppv.monto)
           FROM pagos_pagos ppv
           WHERE ppv.mensualidad_id = pm.id
             AND ppv.estado = 'pendiente_validacion'
         ), 0) AS monto_en_validacion,
         GREATEST(
           pm.saldo - COALESCE((
             SELECT SUM(ppv2.monto)
             FROM pagos_pagos ppv2
             WHERE ppv2.mensualidad_id = pm.id
               AND ppv2.estado = 'pendiente_validacion'
           ), 0),
           0
         ) AS saldo_disponible,
         pm.estado,
         p.id AS plan_id,
         p.nombre AS plan_nombre
       FROM pagos_mensualidades pm
       LEFT JOIN alumnos_membresias am ON am.id = pm.membresia_id
       LEFT JOIN planes_planes p ON p.id = am.plan_id
       WHERE pm.alumno_id = :alumnoId
         AND pm.sede_id = :sedeId
         AND pm.estado IN ('pendiente','parcial','vencida')
         AND pm.saldo > 0
       ORDER BY
         CASE WHEN pm.fecha_vencimiento < CURDATE() THEN 0 ELSE 1 END,
         pm.fecha_vencimiento ASC,
         pm.id ASC`,
      {
        replacements: { alumnoId, sedeId },
        type: QueryTypes.SELECT
      }
    );

    return res.status(200).json({
      ok: true,
      data: rows.map((item) => ({
        ...item,
        mensualidad_id: Number(item.mensualidad_id),
        alumno_id: Number(item.alumno_id),
        membresia_id: item.membresia_id ? Number(item.membresia_id) : null,
        sede_id: Number(item.sede_id),
        plan_id: item.plan_id ? Number(item.plan_id) : null,
        monto_total: Number(item.monto_total || 0),
        monto_pagado: Number(item.monto_pagado || 0),
        saldo: Number(item.saldo || 0),
        monto_en_validacion: Number(item.monto_en_validacion || 0),
        saldo_disponible: Number(item.saldo_disponible || 0)
      }))
    });
  } catch (error) {
    console.error('Error OBR_DeudasAlumnoCobro_CTS:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al consultar las deudas disponibles para cobrar.'
    });
  }
};

// Benjamin Orellana - 2026/08/19 - Deudas de empleados derivadas de ventas
// fiadas/parciales. La venta original conserva el total y los cobros posteriores
// con detalle tipo deuda representan los pagos aplicados.
export const OBR_DeudasEmpleadoCobro_CTS = async (req, res) => {
  try {
    const usuarioId = Number(req.params.usuario_id);
    const sedeId = Number(req.query.sede_id);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      return res.status(400).json({ ok: false, message: 'Debe indicar un empleado válido.' });
    }
    if (!Number.isInteger(sedeId) || sedeId <= 0) {
      return res.status(400).json({ ok: false, message: 'Debe indicar una sede válida.' });
    }

    const rows = await db.query(
      `SELECT
         c.id AS cobro_origen_id,
         c.cliente_usuario_id,
         c.sede_id,
         DATE(c.fecha_cobro) AS fecha_emision,
         DATE(c.fecha_cobro) AS fecha_vencimiento,
         c.total AS monto_total,
         c.observaciones,
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
         COALESCE((
           SELECT SUM(cd2.total)
           FROM cobros_detalles cd2
           INNER JOIN cobros_cobros c2 ON c2.id = cd2.cobro_id
           WHERE cd2.tipo = 'deuda'
             AND cd2.referencia_id = c.id
             AND c2.cliente_tipo = 'empleado'
             AND c2.cliente_usuario_id = c.cliente_usuario_id
             AND c2.sede_id = c.sede_id
             AND c2.estado = 'pendiente_validacion'
         ), 0) AS monto_en_validacion,
         (
           SELECT GROUP_CONCAT(cd0.nombre_snapshot ORDER BY cd0.id SEPARATOR ', ')
           FROM cobros_detalles cd0
           WHERE cd0.cobro_id = c.id
             AND cd0.tipo IN ('producto','servicio')
         ) AS conceptos
       FROM cobros_cobros c
       WHERE c.cliente_tipo = 'empleado'
         AND c.cliente_usuario_id = :usuarioId
         AND c.sede_id = :sedeId
         AND c.estado = 'confirmado'
         AND EXISTS (
           SELECT 1 FROM cobros_detalles cdv
           WHERE cdv.cobro_id = c.id
             AND cdv.tipo IN ('producto','servicio')
         )
       ORDER BY c.fecha_cobro ASC, c.id ASC`,
      { replacements: { usuarioId, sedeId }, type: QueryTypes.SELECT }
    );

    const deudas = rows
      .map((item) => {
        const montoTotal = Number(item.monto_total || 0);
        const montoPagado = Number(item.pago_inicial || 0) + Number(item.pagos_deuda || 0);
        const saldo = Math.max(montoTotal - montoPagado, 0);
        const enValidacion = Number(item.monto_en_validacion || 0);
        return {
          mensualidad_id: Number(item.cobro_origen_id),
          cobro_origen_id: Number(item.cobro_origen_id),
          cliente_usuario_id: Number(item.cliente_usuario_id),
          sede_id: Number(item.sede_id),
          membresia_id: null,
          periodo_desde: item.fecha_emision,
          periodo_hasta: item.fecha_emision,
          fecha_vencimiento: item.fecha_vencimiento,
          monto_total: montoTotal,
          monto_pagado: montoPagado,
          saldo,
          monto_en_validacion: enValidacion,
          saldo_disponible: Math.max(saldo - enValidacion, 0),
          estado: saldo <= 0.009 ? 'pagada' : montoPagado > 0.009 ? 'parcial' : 'pendiente',
          plan_id: null,
          plan_nombre: null,
          observaciones: item.observaciones,
          etiqueta: `Compra #${Number(item.cobro_origen_id)}${item.conceptos ? ` · ${item.conceptos}` : ''}`
        };
      })
      .filter((item) => item.saldo > 0.009);

    return res.status(200).json({ ok: true, data: deudas });
  } catch (error) {
    console.error('Error OBR_DeudasEmpleadoCobro_CTS:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al consultar las deudas del empleado.'
    });
  }
};

// Benjamin Orellana - 2026/08/19 - Resumen financiero liviano para el
// selector de empleados de Nuevo Cobro. Devuelve saldo a favor y deuda total
// pendiente en una sola consulta, manteniendo el alcance de sede.
export const OBR_SituacionFinancieraEmpleadosCobro_CTS = async (req, res) => {
  try {
    const sedeId = Number(req.query.sede_id);
    const usuarioIds = Array.from(
      new Set(
        String(req.query.usuario_ids || '')
          .split(',')
          .map((item) => Number(item))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ).slice(0, 100);

    if (!Number.isInteger(sedeId) || sedeId <= 0) {
      return res.status(400).json({ ok: false, message: 'Debe indicar una sede válida.' });
    }
    if (usuarioIds.length === 0) {
      return res.status(200).json({ ok: true, data: [] });
    }

    const rows = await db.query(
      `SELECT
         u.id AS usuario_id,
         COALESCE(us.saldo, 0) AS saldo_favor,
         COALESCE((
           SELECT SUM(
             GREATEST(
               c.total
               - COALESCE((
                   SELECT SUM(cp0.monto)
                   FROM cobros_pagos cp0
                   WHERE cp0.cobro_id = c.id
                     AND cp0.estado = 'confirmado'
                 ), 0)
               - COALESCE((
                   SELECT SUM(cd1.total)
                   FROM cobros_detalles cd1
                   INNER JOIN cobros_cobros c1 ON c1.id = cd1.cobro_id
                   WHERE cd1.tipo = 'deuda'
                     AND cd1.referencia_id = c.id
                     AND c1.cliente_tipo = 'empleado'
                     AND c1.cliente_usuario_id = c.cliente_usuario_id
                     AND c1.sede_id = c.sede_id
                     AND c1.estado = 'confirmado'
                 ), 0),
               0
             )
           )
           FROM cobros_cobros c
           WHERE c.cliente_tipo = 'empleado'
             AND c.cliente_usuario_id = u.id
             AND c.sede_id = :sedeId
             AND c.estado = 'confirmado'
             AND EXISTS (
               SELECT 1
               FROM cobros_detalles cdv
               WHERE cdv.cobro_id = c.id
                 AND cdv.tipo IN ('producto', 'servicio')
             )
         ), 0) AS saldo_deudor
       FROM usuarios_usuarios u
       LEFT JOIN usuarios_saldos us ON us.usuario_id = u.id
       WHERE u.id IN (:usuarioIds)
         AND u.estado = 'activo'
         AND (
           u.acceso_todas_sedes = 1
           OR u.sede_principal_id = :sedeId
           OR EXISTS (
             SELECT 1
             FROM usuarios_sedes usem
             WHERE usem.usuario_id = u.id
               AND usem.sede_id = :sedeId
               AND usem.activo = 1
           )
         )
       ORDER BY u.id ASC`,
      {
        replacements: { sedeId, usuarioIds },
        type: QueryTypes.SELECT,
      },
    );

    return res.status(200).json({
      ok: true,
      data: rows.map((item) => ({
        usuario_id: Number(item.usuario_id),
        saldo_favor: redondearImporte(item.saldo_favor),
        saldo_deudor: redondearImporte(item.saldo_deudor),
      })),
    });
  } catch (error) {
    console.error('Error OBR_SituacionFinancieraEmpleadosCobro_CTS:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al consultar la situación financiera de los empleados.',
    });
  }
};

// Benjamin Orellana - 2026/08/19 - Saldo operativo de empleados.
export const OBR_SaldoDisponibleEmpleadoCobro_CTS = async (req, res) => {
  try {
    const usuarioId = Number(req.params.usuario_id);
    const sedeId = Number(req.query.sede_id);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      return res.status(400).json({ ok: false, message: 'Debe indicar un empleado válido.' });
    }
    if (!Number.isInteger(sedeId) || sedeId <= 0) {
      return res.status(400).json({ ok: false, message: 'Debe indicar una sede válida.' });
    }
    const empleado = await empleadoDisponibleEnSede({ usuarioId, sedeId });
    if (!empleado) {
      return res.status(404).json({ ok: false, message: 'El empleado no está disponible en la sede indicada.' });
    }
    const cuenta = await UsuariosSaldosModel.findOne({
      where: { usuario_id: usuarioId },
      attributes: ['saldo', 'moneda']
    });
    return res.status(200).json({
      ok: true,
      data: { saldo: Number(cuenta?.saldo || 0), moneda: cuenta?.moneda || 'ARS' }
    });
  } catch (error) {
    console.error('Error OBR_SaldoDisponibleEmpleadoCobro_CTS:', error);
    return res.status(500).json({ ok: false, message: 'Error al consultar el saldo del empleado.' });
  }
};

export const CR_CargarSaldoEmpleadoCobro_CTS = async (req, res) => {
  const transaction = await db.transaction();
  try {
    const usuarioClienteId = Number(req.params.usuario_id);
    const usuarioRegistroId = Number(req.user?.id || req.user?.usuario_id);
    const sedeId = Number(req.body?.sede_id);
    const medioPagoId = Number(req.body?.medio_pago_id);
    const monto = redondearImporte(req.body?.monto);
    const motivo = String(req.body?.motivo || 'Carga de saldo a favor').trim().slice(0, 255);
    const observaciones = String(req.body?.observaciones || '').trim().slice(0, 500) || null;

    if (!Number.isInteger(usuarioClienteId) || usuarioClienteId <= 0 || !Number.isInteger(usuarioRegistroId) || usuarioRegistroId <= 0) {
      throw Object.assign(new Error('Empleado o usuario inválido.'), { status: 400 });
    }
    if (!Number.isInteger(sedeId) || sedeId <= 0 || !Number.isInteger(medioPagoId) || medioPagoId <= 0) {
      throw Object.assign(new Error('Sede o medio de ingreso inválido.'), { status: 400 });
    }
    if (!Number.isFinite(monto) || monto <= 0) {
      throw Object.assign(new Error('El monto a cargar debe ser mayor a 0.'), { status: 400 });
    }

    const empleado = await empleadoDisponibleEnSede({ usuarioId: usuarioClienteId, sedeId, transaction });
    if (!empleado) {
      throw Object.assign(new Error('El empleado no está disponible en la sede indicada.'), { status: 404 });
    }
    const medio = await PagosMediosPagoModel.findOne({
      where: { id: medioPagoId, activo: 1 },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!medio || Number(medio.impacta_caja) !== 1 || String(medio.codigo || '').toUpperCase() === 'SALDO_FAVOR') {
      throw Object.assign(new Error('Seleccioná un medio válido que impacte Caja.'), { status: 409 });
    }
    const sesion = await CajasSesionesModel.findOne({
      where: { sede_id: sedeId, estado: 'abierta' },
      order: [['id', 'DESC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!sesion) {
      throw Object.assign(new Error('Abrí la caja de la sede antes de cargar saldo a favor.'), { status: 409 });
    }

    await UsuariosSaldosModel.findOrCreate({
      where: { usuario_id: usuarioClienteId },
      defaults: { saldo: '0.00', moneda: 'ARS' },
      transaction,
    });
    const cuenta = await UsuariosSaldosModel.findOne({
      where: { usuario_id: usuarioClienteId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const saldoAnterior = Number(cuenta.saldo || 0);
    const saldoNuevo = redondearImporte(saldoAnterior + monto);
    await cuenta.update({ saldo: saldoNuevo.toFixed(2), updated_at: new Date() }, { transaction });

    const movimientoSaldo = await UsuariosSaldosMovimientosModel.create({
      saldo_id: Number(cuenta.id),
      usuario_cliente_id: usuarioClienteId,
      sede_id: sedeId,
      usuario_registro_id: usuarioRegistroId,
      tipo: 'credito',
      origen: 'carga_saldo',
      monto: monto.toFixed(2),
      saldo_anterior: saldoAnterior.toFixed(2),
      saldo_nuevo: saldoNuevo.toFixed(2),
      cobro_id: null,
      referencia: null,
      motivo,
    }, { transaction });
    const referencia = `CARGA-SALDO-EMPLEADO-${movimientoSaldo.id}`;
    await movimientoSaldo.update({ referencia }, { transaction });
    const nombre = [empleado.nombre, empleado.apellido].filter(Boolean).join(' ').trim() || `Empleado #${usuarioClienteId}`;
    const movimientoCaja = await CajasMovimientosModel.create({
      caja_sesion_id: Number(sesion.id),
      caja_id: Number(sesion.caja_id),
      sede_id: sedeId,
      cobro_pago_id: null,
      gasto_id: null,
      medio_pago_id: medioPagoId,
      usuario_registro_id: usuarioRegistroId,
      tipo: 'ingreso',
      origen: 'manual',
      fecha_movimiento: new Date(),
      monto: monto.toFixed(2),
      descripcion: `Carga de saldo a favor · ${nombre}`.slice(0, 255),
      estado: 'vigente',
      referencia,
      observaciones: [motivo, observaciones].filter(Boolean).join(' | ').slice(0, 500) || null,
    }, { transaction });

    await transaction.commit();
    return res.status(201).json({
      ok: true,
      message: 'Saldo del empleado cargado y registrado en Caja correctamente.',
      data: {
        usuario_id: usuarioClienteId,
        sede_id: sedeId,
        monto_cargado: monto,
        saldo_anterior: saldoAnterior,
        saldo_nuevo: saldoNuevo,
        saldo_movimiento_id: Number(movimientoSaldo.id),
        caja_movimiento_id: Number(movimientoCaja.id),
        medio_pago_id: Number(medio.id),
        medio_pago_nombre: medio.nombre,
        referencia,
      },
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('Error CR_CargarSaldoEmpleadoCobro_CTS:', error);
    return res.status(Number(error?.status || 500)).json({
      ok: false,
      message: error?.message || 'Error interno al cargar saldo al empleado.'
    });
  }
};

export const CR_Cobros_CTS = async (req, res) => {
  try {
    const resultado = await registrarCobro({
      payload: req.body,
      usuario: req.user
    });

    return res.status(resultado.repetido ? 200 : 201).json({
      ok: true,
      repetido: resultado.repetido,
      message: resultado.repetido
        ? 'El cobro ya habÃ­a sido registrado. Se devolviÃ³ el resultado original.'
        : resultado.cobro.estado === 'pendiente_validacion'
          ? 'Cobro registrado y pendiente de validaciÃ³n.'
          : 'Cobro registrado correctamente.',
      data: resultado.cobro
    });
  } catch (error) {
    return manejarErrorCobro(error, res, 'CR_Cobros_CTS');
  }
};

export const OBR_Cobros_CTS = async (req, res) => {
  try {
    const scopeSedes = resolverSedesCobrosConsulta(req);

    if (!scopeSedes.ok) {
      return res.status(scopeSedes.status).json({
        ok: false,
        code: scopeSedes.code,
        message: scopeSedes.message
      });
    }

    const sedeIdOperativa =
      scopeSedes.sedeIds.length === 1 ? scopeSedes.sedeIds[0] : null;

    const desdeScope = validarFechaConsultaOperativa({
      user: req.user,
      sedeId: sedeIdOperativa,
      fecha: req.query.desde,
      nombreCampo: 'Fecha desde'
    });
    const hastaScope = validarFechaConsultaOperativa({
      user: req.user,
      sedeId: sedeIdOperativa,
      fecha: req.query.hasta,
      nombreCampo: 'Fecha hasta'
    });
    const scopeInvalido = !desdeScope.ok ? desdeScope : !hastaScope.ok ? hastaScope : null;
    if (scopeInvalido) {
      return res.status(scopeInvalido.status).json({
        ok: false,
        code: scopeInvalido.code,
        message: scopeInvalido.message
      });
    }

    const queryOperativa = usuarioTieneAlcanceOperativoDiario(
      req.user,
      sedeIdOperativa
    )
      ? { ...req.query, desde: fechaArgentina(), hasta: fechaArgentina() }
      : req.query;
    const page = Math.max(Number(queryOperativa.page || 1), 1);
    const limit = Math.min(Math.max(Number(queryOperativa.limit || 20), 1), 100);
    const offset = (page - 1) * limit;
    const { whereSql, replacements } = construirFiltros(
      queryOperativa,
      scopeSedes.sedeIds
    );

    const [rows, totalRows, resumenRows] = await Promise.all([
      db.query(
        `SELECT c.id, c.sede_id, s.nombre AS sede_nombre,
          c.fecha_cobro, c.cliente_tipo, c.alumno_id,
          c.cliente_usuario_id, c.importe, c.descuentos, c.impuestos,
          c.total, c.moneda, c.estado,
          CASE
            WHEN c.estado = 'confirmado' AND EXISTS (
              SELECT 1
              FROM cobros_detalles cd_ai
              INNER JOIN pagos_pagos pp_ai ON pp_ai.id = cd_ai.pago_id
              WHERE cd_ai.cobro_id = c.id
                AND cd_ai.tipo = 'plan'
                AND pp_ai.estado = 'anulado'
            ) THEN 1
            ELSE 0
          END AS anulacion_incompleta,
          COALESCE((
            SELECT SUM(cp_total.monto)
            FROM cobros_pagos cp_total
            WHERE cp_total.cobro_id = c.id
            AND cp_total.estado IN ('confirmado', 'pendiente_validacion')
          ), 0) AS total_pagado,
          CASE
            WHEN c.estado IN ('confirmado', 'pendiente_validacion') THEN
              GREATEST(c.total - COALESCE((
                SELECT SUM(cp_saldo.monto)
                FROM cobros_pagos cp_saldo
                WHERE cp_saldo.cobro_id = c.id
                AND cp_saldo.estado IN ('confirmado', 'pendiente_validacion')
              ), 0), 0)
            ELSE 0
          END AS saldo_pendiente,
          CASE
            WHEN c.cliente_tipo = 'alumno' THEN CONCAT_WS(' ', a.nombre, a.apellido)
            WHEN c.cliente_tipo = 'empleado' THEN CONCAT_WS(' ', uc.nombre, uc.apellido)
            ELSE 'Cobro sin cliente'
          END AS cliente_nombre,
          CONCAT_WS(' ', cobrador.nombre, cobrador.apellido) AS cobrador_nombre,
          GROUP_CONCAT(DISTINCT mp.nombre ORDER BY mp.nombre SEPARATOR ', ') AS medios_pago,
          COUNT(DISTINCT cd.id) AS conceptos_cantidad
        FROM cobros_cobros c
        INNER JOIN sedes_sedes s ON s.id = c.sede_id
        LEFT JOIN alumnos_alumnos a ON a.id = c.alumno_id
        LEFT JOIN usuarios_usuarios uc ON uc.id = c.cliente_usuario_id
        INNER JOIN usuarios_usuarios cobrador ON cobrador.id = c.cobrador_usuario_id
        LEFT JOIN cobros_detalles cd ON cd.cobro_id = c.id
        LEFT JOIN cobros_pagos cp ON cp.cobro_id = c.id
          AND cp.estado IN ('confirmado', 'pendiente_validacion')
        LEFT JOIN pagos_medios_pago mp ON mp.id = cp.medio_pago_id
        WHERE ${whereSql}
        GROUP BY c.id
        ORDER BY c.fecha_cobro DESC, c.id DESC
        LIMIT :limit OFFSET :offset`,
        {
          replacements: { ...replacements, limit, offset },
          type: QueryTypes.SELECT
        }
      ),
      db.query(
        `SELECT COUNT(*) AS total FROM cobros_cobros c
        LEFT JOIN alumnos_alumnos a ON a.id = c.alumno_id
        LEFT JOIN usuarios_usuarios uc ON uc.id = c.cliente_usuario_id
        INNER JOIN usuarios_usuarios cobrador ON cobrador.id = c.cobrador_usuario_id
        WHERE ${whereSql}`,
        { replacements, type: QueryTypes.SELECT }
      ),
      db.query(
        `SELECT COUNT(*) AS cantidad,
          COALESCE(SUM(CASE WHEN c.estado = 'confirmado' THEN (
            SELECT COALESCE(SUM(cp_confirmado.monto), 0)
            FROM cobros_pagos cp_confirmado
            WHERE cp_confirmado.cobro_id = c.id
              AND cp_confirmado.estado = 'confirmado'
          ) ELSE 0 END), 0) AS total_confirmado,
          SUM(CASE WHEN c.estado = 'pendiente_validacion' THEN 1 ELSE 0 END) AS pendientes,
          SUM(CASE WHEN c.estado = 'rechazado' THEN 1 ELSE 0 END) AS rechazados,
          SUM(CASE WHEN c.estado = 'anulado' THEN 1 ELSE 0 END) AS anulados,
          SUM(CASE
            WHEN c.estado = 'confirmado' AND EXISTS (
              SELECT 1
              FROM cobros_detalles cd_ai
              INNER JOIN pagos_pagos pp_ai ON pp_ai.id = cd_ai.pago_id
              WHERE cd_ai.cobro_id = c.id
                AND cd_ai.tipo = 'plan'
                AND pp_ai.estado = 'anulado'
            ) THEN 1
            ELSE 0
          END) AS anulaciones_incompletas
        FROM cobros_cobros c
        LEFT JOIN alumnos_alumnos a ON a.id = c.alumno_id
        LEFT JOIN usuarios_usuarios uc ON uc.id = c.cliente_usuario_id
        INNER JOIN usuarios_usuarios cobrador ON cobrador.id = c.cobrador_usuario_id
        WHERE ${whereSql}`,
        { replacements, type: QueryTypes.SELECT }
      )
    ]);

    const total = Number(totalRows[0]?.total || 0);
    return res.status(200).json({
      ok: true,
      data: rows,
      resumen: resumenRows[0] || {},
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.max(Math.ceil(total / limit), 1)
      }
    });
  } catch (error) {
    console.error('Error OBR_Cobros_CTS:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al consultar el historial de cobros.'
    });
  }
};


// Benjamin Orellana - 2026/08/19 - Buscador dedicado para la anulación
// centralizada. Pagina sobre TODO el histórico confirmado de la sede habilitada;
// la búsqueda no queda limitada a los primeros resultados ni al día actual.
export const OBR_CobrosAnulacionCandidatos_CTS = async (req, res) => {
  try {
    const sedeId = Number(req.query.sede_id);
    if (!Number.isInteger(sedeId) || sedeId <= 0) {
      return res.status(400).json({ ok: false, message: 'Debe indicar una sede válida.' });
    }

    const qTexto = String(req.query.q || '')
      .trim()
      .replace(/^#\s*/, '')
      .slice(0, 120);
    const pageSolicitada = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    // El page_size limita solamente cuánto se transporta por página; no limita
    // el universo de cobros que puede recorrerse/buscarse.
    const pageSize = Math.min(
      Math.max(Number.parseInt(req.query.page_size, 10) || 20, 5),
      100
    );
    const q = `%${qTexto}%`;

    const baseWhere = `
      FROM cobros_cobros c
      LEFT JOIN alumnos_alumnos a ON a.id = c.alumno_id
      LEFT JOIN usuarios_usuarios uc ON uc.id = c.cliente_usuario_id
      WHERE c.sede_id = :sedeId
        AND c.estado = 'confirmado'
        AND (
          :q = '%%'
          OR CAST(c.id AS CHAR) LIKE :q
          OR CONCAT_WS(' ', a.nombre, a.apellido) LIKE :q
          OR CONCAT_WS(' ', uc.nombre, uc.apellido) LIKE :q
          OR EXISTS (
            SELECT 1
            FROM cobros_detalles cd_busqueda
            WHERE cd_busqueda.cobro_id = c.id
              AND cd_busqueda.nombre_snapshot LIKE :q
          )
        )`;

    const countRows = await db.query(
      `SELECT COUNT(*) AS total ${baseWhere}`,
      {
        replacements: { sedeId, q },
        type: QueryTypes.SELECT
      }
    );

    const total = Number(countRows?.[0]?.total || 0);
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const page = Math.min(pageSolicitada, totalPages);
    const offset = (page - 1) * pageSize;

    const rows = await db.query(
      `SELECT
         c.id,
         c.fecha_cobro,
         c.cliente_tipo,
         c.alumno_id,
         c.cliente_usuario_id,
         c.total,
         c.estado,
         c.caja_sesion_id,
         CASE
           WHEN c.cliente_tipo = 'alumno' THEN CONCAT_WS(' ', a.nombre, a.apellido)
           WHEN c.cliente_tipo = 'empleado' THEN CONCAT_WS(' ', uc.nombre, uc.apellido)
           ELSE 'Cobro sin cliente'
         END AS cliente_nombre,
         GROUP_CONCAT(DISTINCT cd.nombre_snapshot ORDER BY cd.id SEPARATOR ' · ') AS conceptos,
         GROUP_CONCAT(DISTINCT mp.nombre ORDER BY mp.nombre SEPARATOR ', ') AS medios_pago,
         COALESCE((
           SELECT SUM(cp2.monto)
           FROM cobros_pagos cp2
           WHERE cp2.cobro_id = c.id
             AND cp2.estado = 'confirmado'
         ), 0) AS total_pagado
       FROM cobros_cobros c
       LEFT JOIN alumnos_alumnos a ON a.id = c.alumno_id
       LEFT JOIN usuarios_usuarios uc ON uc.id = c.cliente_usuario_id
       LEFT JOIN cobros_detalles cd ON cd.cobro_id = c.id
       LEFT JOIN cobros_pagos cp ON cp.cobro_id = c.id AND cp.estado = 'confirmado'
       LEFT JOIN pagos_medios_pago mp ON mp.id = cp.medio_pago_id
       WHERE c.sede_id = :sedeId
         AND c.estado = 'confirmado'
         AND (
           :q = '%%'
           OR CAST(c.id AS CHAR) LIKE :q
           OR CONCAT_WS(' ', a.nombre, a.apellido) LIKE :q
           OR CONCAT_WS(' ', uc.nombre, uc.apellido) LIKE :q
           OR EXISTS (
             SELECT 1
             FROM cobros_detalles cd_busqueda
             WHERE cd_busqueda.cobro_id = c.id
               AND cd_busqueda.nombre_snapshot LIKE :q
           )
         )
       GROUP BY c.id
       ORDER BY c.fecha_cobro DESC, c.id DESC
       LIMIT :pageSize OFFSET :offset`,
      {
        replacements: { sedeId, q, pageSize, offset },
        type: QueryTypes.SELECT
      }
    );

    const items = rows.map((row) => ({
      ...row,
      id: Number(row.id),
      total: Number(row.total || 0),
      total_pagado: Number(row.total_pagado || 0),
      saldo_pendiente: Math.max(
        Number(row.total || 0) - Number(row.total_pagado || 0),
        0
      )
    }));

    return res.status(200).json({
      ok: true,
      data: {
        items,
        pagination: {
          page,
          page_size: pageSize,
          total,
          total_pages: totalPages,
          has_previous: page > 1,
          has_next: page < totalPages
        }
      }
    });
  } catch (error) {
    console.error('Error OBR_CobrosAnulacionCandidatos_CTS:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al buscar cobros para anular.'
    });
  }
};

export const OBR_CobroAnulacionPreview_CTS = async (req, res) => {
  try {
    const resultado = await analizarAnulacionCobro({
      cobroId: req.params.id,
      sedeId: req.query.sede_id
    });
    return res.status(200).json({ ok: true, data: resultado });
  } catch (error) {
    return manejarErrorCobro(error, res, 'OBR_CobroAnulacionPreview_CTS');
  }
};

export const OBR_CobrosPendientesCount_CTS = async (req, res) => {
  try {
    const sedeId = Number(req.query.sede_id);

    if (!Number.isInteger(sedeId) || sedeId <= 0) {
      return res.status(400).json({
        ok: false,
        message: 'La sede es obligatoria para consultar cobros pendientes.'
      });
    }

    const soloHoy = usuarioTieneAlcanceOperativoDiario(req.user, sedeId);
    const rows = await db.query(
      `SELECT COUNT(*) AS cantidad
      FROM cobros_cobros
      WHERE sede_id = :sedeId
        AND estado = 'pendiente_validacion'
        AND (:soloHoy = 0 OR DATE(fecha_cobro) = :hoy)`,
      {
        replacements: {
          sedeId,
          soloHoy: soloHoy ? 1 : 0,
          hoy: fechaArgentina()
        },
        type: QueryTypes.SELECT
      }
    );

    return res.status(200).json({
      ok: true,
      data: { cantidad: Number(rows[0]?.cantidad || 0) }
    });
  } catch (error) {
    console.error('Error OBR_CobrosPendientesCount_CTS:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al consultar los cobros pendientes.'
    });
  }
};

export const OBR_CobroDetalle_CTS = async (req, res) => {
  try {
    const sedeId = Number(req.query.sede_id);
    const soloHoy = usuarioTieneAlcanceOperativoDiario(req.user, sedeId);
    const replacements = {
      id: Number(req.params.id),
      sedeId,
      soloHoy: soloHoy ? 1 : 0,
      hoy: fechaArgentina()
    };
    const cabeceras = await db.query(
      `SELECT c.*,
        COALESCE((
          SELECT SUM(cp_total.monto)
          FROM cobros_pagos cp_total
          WHERE cp_total.cobro_id = c.id
            AND cp_total.estado IN ('confirmado', 'pendiente_validacion')
        ), 0) AS total_pagado,
        CASE
          WHEN c.estado IN ('confirmado', 'pendiente_validacion') THEN
            GREATEST(c.total - COALESCE((
              SELECT SUM(cp_saldo.monto)
              FROM cobros_pagos cp_saldo
              WHERE cp_saldo.cobro_id = c.id
                AND cp_saldo.estado IN ('confirmado', 'pendiente_validacion')
            ), 0), 0)
          ELSE 0
        END AS saldo_pendiente,
        CASE
          WHEN c.cliente_tipo = 'alumno' THEN CONCAT_WS(' ', a.nombre, a.apellido)
          WHEN c.cliente_tipo = 'empleado' THEN CONCAT_WS(' ', uc.nombre, uc.apellido)
          ELSE 'Cobro sin cliente'
        END AS cliente_nombre,
        a.dni AS cliente_dni,
        CONCAT_WS(' ', cobrador.nombre, cobrador.apellido) AS cobrador_nombre,
        s.nombre AS sede_nombre, caja.nombre AS caja_nombre,
        CONCAT_WS(' ', anulador.nombre, anulador.apellido) AS anulador_nombre
      FROM cobros_cobros c
      LEFT JOIN alumnos_alumnos a ON a.id = c.alumno_id
      LEFT JOIN usuarios_usuarios uc ON uc.id = c.cliente_usuario_id
      INNER JOIN usuarios_usuarios cobrador ON cobrador.id = c.cobrador_usuario_id
      INNER JOIN sedes_sedes s ON s.id = c.sede_id
      INNER JOIN cajas_sesiones cs ON cs.id = c.caja_sesion_id
      INNER JOIN cajas_cajas caja ON caja.id = cs.caja_id
      LEFT JOIN usuarios_usuarios anulador ON anulador.id = c.usuario_anulacion_id
      WHERE c.id = :id AND c.sede_id = :sedeId
        AND (:soloHoy = 0 OR DATE(c.fecha_cobro) = :hoy)
      LIMIT 1`,
      { replacements, type: QueryTypes.SELECT }
    );
    if (!cabeceras[0])
      return res
        .status(404)
        .json({ ok: false, message: 'No se encontrÃ³ el cobro.' });

    const [detalles, pagos] = await Promise.all([
      db.query(
        `SELECT cd.*, pp.estado AS pago_estado
        FROM cobros_detalles cd
        LEFT JOIN pagos_pagos pp ON pp.id = cd.pago_id
        WHERE cd.cobro_id = :id
        ORDER BY cd.id ASC`,
        { replacements, type: QueryTypes.SELECT }
      ),
      db.query(
        `SELECT cp.*, mp.nombre AS medio_pago_nombre, mp.tipo AS medio_pago_tipo,
          mp.requiere_validacion, CONCAT_WS(' ', uv.nombre, uv.apellido) AS validador_nombre
        FROM cobros_pagos cp
        INNER JOIN pagos_medios_pago mp ON mp.id = cp.medio_pago_id
        LEFT JOIN usuarios_usuarios uv ON uv.id = cp.usuario_validacion_id
        WHERE cp.cobro_id = :id
          AND cp.estado IN ('confirmado', 'pendiente_validacion')
        ORDER BY cp.id ASC`,
        { replacements, type: QueryTypes.SELECT }
      )
    ]);

    return res
      .status(200)
      .json({ ok: true, data: { ...cabeceras[0], detalles, pagos } });
  } catch (error) {
    console.error('Error OBR_CobroDetalle_CTS:', error);
    return res
      .status(500)
      .json({ ok: false, message: 'Error al consultar el detalle del cobro.' });
  }
};

export const UR_ConfirmarCobro_CTS = async (req, res) => {
  try {
    const resultado = await confirmarCobroPendiente({
      cobroId: req.params.id,
      sedeId: req.body.sede_id,
      cajaSesionId: req.body.caja_sesion_id,
      usuario: req.user,
      observaciones: req.body.observaciones
    });
    return res.status(200).json({
      ok: true,
      repetido: resultado.repetido,
      message: resultado.repetido
        ? 'El cobro ya estaba confirmado.'
        : 'Cobro confirmado correctamente.',
      data: resultado.cobro
    });
  } catch (error) {
    return manejarErrorCobro(error, res, 'UR_ConfirmarCobro_CTS');
  }
};

export const UR_RechazarCobro_CTS = async (req, res) => {
  try {
    const resultado = await rechazarCobroPendiente({
      cobroId: req.params.id,
      sedeId: req.body.sede_id,
      usuario: req.user,
      motivo: req.body.motivo
    });
    return res.status(200).json({
      ok: true,
      repetido: resultado.repetido,
      message: resultado.repetido
        ? 'El cobro ya estaba rechazado.'
        : 'Cobro rechazado correctamente.',
      data: resultado.cobro
    });
  } catch (error) {
    return manejarErrorCobro(error, res, 'UR_RechazarCobro_CTS');
  }
};


export const UR_CorregirMedioPagoCobro_CTS = async (req, res) => {
  try {
    const resultado = await corregirMedioPagoCobroConfirmado({
      cobroId: req.params.id,
      sedeId: req.body.sede_id,
      medioPagoId: req.body.medio_pago_id,
      referencia: req.body.referencia,
      motivo: req.body.motivo,
      usuario: req.user,
      ip:
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress ||
        req.ip ||
        null,
      userAgent: req.headers['user-agent'] || null
    });

    return res.status(200).json({
      ok: true,
      repetido: resultado.repetido,
      message: resultado.repetido
        ? 'El cobro ya utiliza el medio de pago seleccionado.'
        : 'Medio de pago corregido correctamente.',
      data: resultado.cobro
    });
  } catch (error) {
    return manejarErrorCobro(error, res, 'UR_CorregirMedioPagoCobro_CTS');
  }
};


export const UR_EditarCobro_CTS = async (req, res) => {
  try {
    const resultado = await editarCobroConfirmado({
      cobroId: req.params.id,
      payload: req.body,
      usuario: req.user,
      ip:
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress ||
        req.ip ||
        null,
      userAgent: req.headers['user-agent'] || null
    });

    return res.status(200).json({
      ok: true,
      message:
        resultado.cobro?.estado === 'pendiente_validacion'
          ? 'Cobro actualizado y pendiente de validación.'
          : 'Cobro actualizado correctamente.',
      data: resultado.cobro
    });
  } catch (error) {
    return manejarErrorCobro(error, res, 'UR_EditarCobro_CTS');
  }
};

export const UR_AnularCobro_CTS = async (req, res) => {
  try {
    const resultado = await anularCobroConfirmado({
      cobroId: req.params.id,
      sedeId: req.body.sede_id,
      cajaSesionId: req.body.caja_sesion_id,
      usuario: req.user,
      motivo: req.body.motivo
    });
    return res.status(200).json({
      ok: true,
      repetido: resultado.repetido,
      message: resultado.repetido
        ? 'El cobro ya estaba anulado.'
        : 'Cobro anulado y operaciones revertidas correctamente.',
      data: resultado.cobro,
      resumen_anulacion: resultado.resumen_anulacion || null
    });
  } catch (error) {
    return manejarErrorCobro(error, res, 'UR_AnularCobro_CTS');
  }
};
