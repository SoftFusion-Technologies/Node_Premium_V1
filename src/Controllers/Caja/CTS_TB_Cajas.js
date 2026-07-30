/*
 * Benjamin Orellana - 2026/07/17 - Operaciones transaccionales de Caja PREMIUM.
 *
 * La caja física se calcula únicamente con movimientos cuyo medio es efectivo.
 * Transferencias, tarjetas y saldo a favor se informan por separado y nunca
 * incrementan el efectivo esperado.
 */
import { QueryTypes } from 'sequelize';

import db from '../../DataBase/db.js';
import CajasModel from '../../Models/Caja/MD_TB_Cajas.js';
import CajasMovimientosModel from '../../Models/Caja/MD_TB_CajasMovimientos.js';
import CajasSesionesModel from '../../Models/Caja/MD_TB_CajasSesiones.js';
import PagosMediosPagoModel from '../../Models/Pago/MD_TB_PagosMediosPago.js';
import SistemaAuditoriaLogsModel from '../../Models/Sistema/MD_TB_SistemaAuditoriaLogs.js';
import {
  fechaArgentina as obtenerFechaOperativaArgentina,
  usuarioTieneAlcanceOperativoDiario,
  validarFechaConsultaOperativa,
  validarRegistroDelDia
} from '../../Security/operationalDayScope.js';

const ESTADOS_SESION = ['abierta', 'cerrada', 'anulada'];
const TIPOS_MOVIMIENTO = ['ingreso', 'egreso'];

const redondear = (valor) =>
  Math.round((Number(valor || 0) + Number.EPSILON) * 100) / 100;
const numeroPositivo = (valor) => {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? redondear(numero) : null;
};
const numeroNoNegativo = (valor) => {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 ? redondear(numero) : null;
};
const texto = (valor, maximo = 500) => {
  if (valor === undefined || valor === null) return null;
  const normalizado = String(valor).trim();
  return normalizado ? normalizado.slice(0, maximo) : null;
};
const fechaArgentina = obtenerFechaOperativaArgentina;
const esFechaValida = (valor) =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(valor || ''));
const esBooleanoVerdadero = (valor) =>
  ['1', 'true', 'si', 'sí'].includes(
    String(valor === undefined || valor === null ? '' : valor)
      .trim()
      .toLowerCase()
  );
const usuarioId = (req) => Number(req.user?.id || req.user?.usuario_id || 0);

const errorRespuesta = (res, error, nombre) => {
  console.error(`Error ${nombre}:`, error);
  return res.status(500).json({
    ok: false,
    message: 'Ocurrió un error al operar la caja.'
  });
};

const obtenerOCrearCajaPrincipal = async (sedeId, transaction = null) => {
  let caja = await CajasModel.findOne({
    where: { sede_id: sedeId, activo: 1 },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });

  if (!caja) {
    caja = await CajasModel.create(
      {
        sede_id: sedeId,
        nombre: 'Caja principal',
        codigo: `CAJA-${sedeId}-PRINCIPAL`,
        activo: 1
      },
      { transaction }
    );
  }

  return caja;
};

const obtenerSesionActivaBloqueada = async ({ sedeId, transaction }) => {
  const sesion = await CajasSesionesModel.findOne({
    where: { sede_id: sedeId, estado: 'abierta' },
    order: [['id', 'DESC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!sesion) {
    const error = new Error('No hay una caja abierta para la sede activa.');
    error.status = 409;
    throw error;
  }

  return sesion;
};

const obtenerMedioEfectivo = async (transaction = null) => {
  const medio = await PagosMediosPagoModel.findOne({
    where: { codigo: 'EFECTIVO', activo: 1 },
    transaction
  });

  if (!medio) {
    const error = new Error('No existe un medio de pago EFECTIVO activo.');
    error.status = 409;
    throw error;
  }

  return medio;
};

const obtenerUltimaSesionCerrada = async (sedeId, transaction = null) =>
  CajasSesionesModel.findOne({
    where: { sede_id: Number(sedeId), estado: 'cerrada' },
    order: [
      ['fecha_cierre', 'DESC'],
      ['id', 'DESC']
    ],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });

const construirAperturaSugerida = (sesionAnterior) => {
  if (!sesionAnterior) {
    return {
      sesion_anterior_id: null,
      fecha_cierre_anterior: null,
      monto_sugerido: 0,
      monto_contado_anterior: null,
      monto_esperado_anterior: null,
      diferencia_cierre_anterior: null
    };
  }

  const plano =
    typeof sesionAnterior.toJSON === 'function'
      ? sesionAnterior.toJSON()
      : sesionAnterior;
  const montoContado =
    plano.monto_contado === null || plano.monto_contado === undefined
      ? null
      : redondear(plano.monto_contado);
  const montoEsperado =
    plano.monto_esperado === null || plano.monto_esperado === undefined
      ? null
      : redondear(plano.monto_esperado);

  return {
    sesion_anterior_id: Number(plano.id),
    fecha_cierre_anterior: plano.fecha_cierre || null,
    monto_sugerido: redondear(montoContado ?? montoEsperado ?? 0),
    monto_contado_anterior: montoContado,
    monto_esperado_anterior: montoEsperado,
    diferencia_cierre_anterior:
      plano.diferencia === null || plano.diferencia === undefined
        ? null
        : redondear(plano.diferencia)
  };
};

const registrarAuditoriaDiferenciaApertura = async ({
  req,
  sedeId,
  sesion,
  apertura,
  montoInicial,
  diferencia,
  observacion,
  transaction
}) => {
  if (Math.abs(diferencia) < 0.01) return;

  await SistemaAuditoriaLogsModel.create(
    {
      usuario_id: usuarioId(req) || null,
      sede_id: Number(sedeId),
      modulo: 'CAJA',
      accion: 'DIFERENCIA_APERTURA',
      entidad: 'cajas_sesiones',
      entidad_id: Number(sesion.id),
      descripcion: `Apertura con diferencia de ${diferencia.toFixed(2)} respecto del último cierre.`,
      valores_anteriores: {
        sesion_anterior_id: apertura.sesion_anterior_id,
        monto_sugerido: apertura.monto_sugerido
      },
      valores_nuevos: {
        monto_inicial: montoInicial,
        diferencia_apertura: diferencia,
        observacion: observacion || null
      },
      ip:
        req.headers['x-forwarded-for'] ||
        req.socket?.remoteAddress ||
        req.ip ||
        null,
      user_agent: req.headers['user-agent'] || null
    },
    { transaction }
  );
};

const listarMovimientosSesion = async (sesionId, transaction = null) =>
  db.query(
    `SELECT
       cm.id,
       cm.caja_sesion_id,
       cm.caja_id,
       cm.sede_id,
       cm.cobro_pago_id,
       cm.gasto_id,
       cm.medio_pago_id,
       cm.usuario_registro_id,
       cm.tipo,
       cm.origen,
       cm.fecha_movimiento,
       cm.monto,
       cm.descripcion,
       cm.estado,
       cm.referencia,
       cm.observaciones,
       mp.nombre AS medio_pago_nombre,
       mp.codigo AS medio_pago_codigo,
       mp.tipo AS medio_pago_tipo,
       CONCAT_WS(' ', ur.nombre, ur.apellido) AS usuario_nombre,
       c.id AS cobro_id,
       c.cliente_tipo,
       c.total AS cobro_total,
       COALESCE(cd.total_planes, 0) AS total_planes,
       COALESCE(cd.total_productos, 0) AS total_productos,
       COALESCE(cd.total_servicios, 0) AS total_servicios,
       cd.conceptos_nombres,
       COALESCE(
         NULLIF(CONCAT_WS(' ', aa.nombre, aa.apellido), ''),
         NULLIF(CONCAT_WS(' ', uc.nombre, uc.apellido), ''),
         'Sin cliente'
       ) AS cliente_nombre
     FROM cajas_movimientos cm
     LEFT JOIN pagos_medios_pago mp ON mp.id = cm.medio_pago_id
     LEFT JOIN usuarios_usuarios ur ON ur.id = cm.usuario_registro_id
     LEFT JOIN cobros_pagos cp ON cp.id = cm.cobro_pago_id
     LEFT JOIN cobros_cobros c ON c.id = cp.cobro_id
     LEFT JOIN (
       SELECT
         cobro_id,
         SUM(CASE WHEN tipo = 'plan' THEN total ELSE 0 END) AS total_planes,
         SUM(CASE WHEN tipo = 'producto' THEN total ELSE 0 END) AS total_productos,
         SUM(CASE WHEN tipo = 'servicio' THEN total ELSE 0 END) AS total_servicios,
         GROUP_CONCAT(
           DISTINCT nombre_snapshot
           ORDER BY nombre_snapshot
           SEPARATOR ' · '
         ) AS conceptos_nombres
       FROM cobros_detalles
       GROUP BY cobro_id
     ) cd ON cd.cobro_id = c.id
     LEFT JOIN alumnos_alumnos aa ON aa.id = c.alumno_id
     LEFT JOIN usuarios_usuarios uc ON uc.id = c.cliente_usuario_id
     WHERE cm.caja_sesion_id = :sesion_id
     ORDER BY cm.fecha_movimiento DESC, cm.id DESC`,
    {
      replacements: { sesion_id: Number(sesionId) },
      type: QueryTypes.SELECT,
      transaction
    }
  );

const calcularResumen = ({ sesion, movimientos }) => {
  const montoInicial = redondear(sesion?.monto_inicial);
  const vigentes = movimientos.filter((item) => item.estado === 'vigente');
  const porMedio = new Map();

  let ingresos = 0;
  let egresos = 0;
  let cobros = 0;
  let resto = 0;
  let efectivoNeto = 0;

  vigentes.forEach((item) => {
    const monto = redondear(item.monto);
    const signo = item.tipo === 'ingreso' ? 1 : -1;
    if (item.tipo === 'ingreso') ingresos += monto;
    else egresos += monto;

    if (item.origen === 'cobro' && item.tipo === 'ingreso') cobros += monto;
    else resto += signo * monto;

    const codigo = String(item.medio_pago_codigo || 'SIN_MEDIO').toUpperCase();
    const nombre = item.medio_pago_nombre || 'Sin medio';
    const tipo = item.medio_pago_tipo || 'otro';
    const actual = porMedio.get(codigo) || {
      codigo,
      nombre,
      tipo,
      ingresos: 0,
      egresos: 0,
      neto: 0
    };
    if (item.tipo === 'ingreso') actual.ingresos += monto;
    else actual.egresos += monto;
    actual.neto += signo * monto;
    porMedio.set(codigo, actual);

    if (tipo === 'efectivo' || codigo === 'EFECTIVO') {
      efectivoNeto += signo * monto;
    }
  });

  const efectivoEsperado = redondear(montoInicial + efectivoNeto);
  const montoContado =
    sesion?.monto_contado === null || sesion?.monto_contado === undefined
      ? null
      : redondear(sesion.monto_contado);

  return {
    monto_inicial: montoInicial,
    ingresos: redondear(ingresos),
    egresos: redondear(egresos),
    neto_movimientos: redondear(ingresos - egresos),
    cobros: redondear(cobros),
    resto: redondear(resto),
    efectivo_esperado: efectivoEsperado,
    monto_contado: montoContado,
    diferencia:
      montoContado === null ? null : redondear(montoContado - efectivoEsperado),
    total_operativo: redondear(ingresos - egresos),
    medios: Array.from(porMedio.values())
      .map((item) => ({
        ...item,
        ingresos: redondear(item.ingresos),
        egresos: redondear(item.egresos),
        neto: redondear(item.neto)
      }))
      .sort((a, b) => b.neto - a.neto)
  };
};

const cargarResumenSesion = async (sesion, transaction = null) => {
  if (!sesion) return null;
  const plano = typeof sesion.toJSON === 'function' ? sesion.toJSON() : sesion;
  const movimientos = await listarMovimientosSesion(plano.id, transaction);
  const caja = await CajasModel.findByPk(plano.caja_id, { transaction });

  return {
    sesion: {
      ...plano,
      caja: caja
        ? typeof caja.toJSON === 'function'
          ? caja.toJSON()
          : caja
        : null
    },
    resumen: calcularResumen({ sesion: plano, movimientos }),
    movimientos
  };
};

const responderErrorOperacion = async ({ res, error, transaction, nombre }) => {
  if (transaction && !transaction.finished) await transaction.rollback();
  if (error?.status) {
    return res.status(error.status).json({ ok: false, message: error.message });
  }
  return errorRespuesta(res, error, nombre);
};

export const OBR_AperturaSugeridaCaja_CTS = async (req, res) => {
  try {
    const sedeId = Number(req.query.sede_id);
    const sesionActiva = await CajasSesionesModel.findOne({
      where: { sede_id: sedeId, estado: 'abierta' },
      include: [{ model: CajasModel, as: 'caja' }],
      order: [['id', 'DESC']]
    });

    if (sesionActiva) {
      return res.status(200).json({
        ok: true,
        hay_sesion_activa: true,
        message: 'La sede ya tiene una caja abierta.',
        data: {
          sesion_activa: sesionActiva,
          apertura_sugerida: null
        }
      });
    }

    const anterior = await obtenerUltimaSesionCerrada(sedeId);
    const apertura = construirAperturaSugerida(anterior);

    return res.status(200).json({
      ok: true,
      hay_sesion_activa: false,
      message: anterior
        ? 'Saldo de apertura sugerido desde el último cierre.'
        : 'No existe un cierre anterior; la apertura sugerida es cero.',
      data: {
        sesion_activa: null,
        apertura_sugerida: apertura
      }
    });
  } catch (error) {
    return errorRespuesta(res, error, 'OBR_AperturaSugeridaCaja_CTS');
  }
};

export const OBR_CajaSesionActiva_CTS = async (req, res) => {
  try {
    const sedeId = Number(req.query.sede_id);
    const sesion = await CajasSesionesModel.findOne({
      where: { sede_id: sedeId, estado: 'abierta' },
      include: [{ model: CajasModel, as: 'caja' }],
      order: [['id', 'DESC']]
    });

    return res.status(200).json({ ok: true, data: sesion });
  } catch (error) {
    return errorRespuesta(res, error, 'OBR_CajaSesionActiva_CTS');
  }
};

export const OBR_ResumenCaja_CTS = async (req, res) => {
  try {
    const sedeId = Number(req.query.sede_id);
    const alcanceFecha = validarFechaConsultaOperativa({
      user: req.user,
      sedeId,
      fecha: req.query.fecha,
      nombreCampo: 'Fecha de caja'
    });
    if (!alcanceFecha.ok) {
      return res.status(alcanceFecha.status).json({
        ok: false,
        code: alcanceFecha.code,
        message: alcanceFecha.message
      });
    }
    const fecha = alcanceFecha.fecha;
    const sesionId = Number(req.query.sesion_id || 0);
    const priorizarAbierta =
      req.query.priorizar_abierta === undefined
        ? fecha === fechaArgentina()
        : esBooleanoVerdadero(req.query.priorizar_abierta);

    if (!esFechaValida(fecha)) {
      return res.status(400).json({
        ok: false,
        message: 'La fecha debe tener formato YYYY-MM-DD.'
      });
    }

    let sesion = null;
    if (sesionId > 0) {
      sesion = await CajasSesionesModel.findOne({
        where: { id: sesionId, sede_id: sedeId }
      });
    } else {
      /*
       * La pantalla informa explícitamente cuándo debe priorizarse la sesión
       * abierta. Así una caja iniciada el día anterior continúa visible al
       * recargar, sin depender de comparar la fecha del navegador con la del
       * servidor. Los clientes anteriores conservan el comportamiento para hoy.
       */
      if (priorizarAbierta) {
        sesion = await CajasSesionesModel.findOne({
          where: { sede_id: sedeId, estado: 'abierta' },
          order: [['id', 'DESC']]
        });
      }

      if (!sesion) {
        const [fila] = await db.query(
          `SELECT *
           FROM cajas_sesiones
           WHERE sede_id = :sede_id
             AND DATE(fecha_apertura) = :fecha
             AND estado IN ('abierta', 'cerrada')
           ORDER BY (estado = 'abierta') DESC, id DESC
           LIMIT 1`,
          {
            replacements: { sede_id: sedeId, fecha },
            type: QueryTypes.SELECT
          }
        );
        sesion = fila || null;
      }
    }

    if (sesion && usuarioTieneAlcanceOperativoDiario(req.user, sedeId)) {
      const planoSesion =
        typeof sesion.toJSON === 'function' ? sesion.toJSON() : sesion;
      const registroValido = validarRegistroDelDia({
        user: req.user,
        sedeId,
        fechaRegistro: planoSesion.fecha_apertura,
        mensaje:
          'El perfil operativo no puede consultar sesiones cerradas de días anteriores.'
      });

      if (!registroValido.ok && planoSesion.estado !== 'abierta') {
        return res.status(registroValido.status).json({
          ok: false,
          code: registroValido.code,
          message: registroValido.message
        });
      }
    }

    const data = await cargarResumenSesion(sesion);
    return res.status(200).json({
      ok: true,
      fecha,
      data,
      message: data
        ? 'Resumen de caja obtenido correctamente.'
        : 'No hay sesión de caja para la fecha seleccionada.'
    });
  } catch (error) {
    return errorRespuesta(res, error, 'OBR_ResumenCaja_CTS');
  }
};

export const OBR_SesionesCaja_CTS = async (req, res) => {
  try {
    const sedeId = Number(req.query.sede_id);
    const alcanceDesde = validarFechaConsultaOperativa({
      user: req.user,
      sedeId,
      fecha: req.query.desde,
      nombreCampo: 'Fecha desde'
    });
    const alcanceHasta = validarFechaConsultaOperativa({
      user: req.user,
      sedeId,
      fecha: req.query.hasta,
      nombreCampo: 'Fecha hasta'
    });
    const alcanceInvalido = !alcanceDesde.ok ? alcanceDesde : !alcanceHasta.ok ? alcanceHasta : null;
    if (alcanceInvalido) {
      return res.status(alcanceInvalido.status).json({
        ok: false,
        code: alcanceInvalido.code,
        message: alcanceInvalido.message
      });
    }
    const desde = alcanceDesde.fecha;
    const hasta = alcanceHasta.fecha;
    const estado = req.query.estado ? String(req.query.estado) : null;

    if (!esFechaValida(desde) || !esFechaValida(hasta)) {
      return res
        .status(400)
        .json({ ok: false, message: 'El rango de fechas no es válido.' });
    }
    if (estado && !ESTADOS_SESION.includes(estado)) {
      return res
        .status(400)
        .json({ ok: false, message: 'El estado de caja no es válido.' });
    }

    const sesiones = await db.query(
      `SELECT cs.*, cc.nombre AS caja_nombre, cc.codigo AS caja_codigo,
              CONCAT_WS(' ', ua.nombre, ua.apellido) AS usuario_apertura_nombre,
              CONCAT_WS(' ', uc.nombre, uc.apellido) AS usuario_cierre_nombre
       FROM cajas_sesiones cs
       INNER JOIN cajas_cajas cc ON cc.id = cs.caja_id
       LEFT JOIN usuarios_usuarios ua ON ua.id = cs.usuario_apertura_id
       LEFT JOIN usuarios_usuarios uc ON uc.id = cs.usuario_cierre_id
       WHERE cs.sede_id = :sede_id
         AND DATE(cs.fecha_apertura) BETWEEN :desde AND :hasta
         AND (:estado IS NULL OR cs.estado = :estado)
       ORDER BY cs.fecha_apertura DESC, cs.id DESC`,
      {
        replacements: { sede_id: sedeId, desde, hasta, estado },
        type: QueryTypes.SELECT
      }
    );

    return res.status(200).json({ ok: true, data: sesiones });
  } catch (error) {
    return errorRespuesta(res, error, 'OBR_SesionesCaja_CTS');
  }
};

export const CR_AbrirCajaPrincipal_CTS = async (req, res) => {
  const transaction = await db.transaction();
  try {
    const sedeId = Number(req.body.sede_id);
    const observaciones = texto(req.body.observaciones);
    const observacionDiferencia = texto(
      req.body.observacion_diferencia_apertura || req.body.observaciones_diferencia
    );

    const sesionAnterior = await obtenerUltimaSesionCerrada(sedeId, transaction);
    const apertura = construirAperturaSugerida(sesionAnterior);
    const montoInicial = numeroNoNegativo(
      req.body.monto_inicial ?? apertura.monto_sugerido
    );

    if (montoInicial === null) {
      const error = new Error(
        'El monto inicial debe ser un número mayor o igual a cero.'
      );
      error.status = 400;
      throw error;
    }

    const diferenciaApertura = redondear(
      montoInicial - Number(apertura.monto_sugerido || 0)
    );
    if (Math.abs(diferenciaApertura) >= 0.01 && !observacionDiferencia) {
      const error = new Error(
        'El monto contado no coincide con el último cierre. Indicá una observación para dejar la diferencia auditada.'
      );
      error.status = 400;
      throw error;
    }

    const existente = await CajasSesionesModel.findOne({
      where: { sede_id: sedeId, estado: 'abierta' },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (existente) {
      const cajaExistente = await CajasModel.findByPk(existente.caja_id, {
        transaction
      });

      await transaction.commit();
      return res.status(200).json({
        ok: true,
        message: 'La caja principal ya estaba abierta.',
        ya_estaba_abierta: true,
        data: {
          ...(typeof existente.toJSON === 'function'
            ? existente.toJSON()
            : existente),
          caja:
            typeof cajaExistente?.toJSON === 'function'
              ? cajaExistente.toJSON()
              : cajaExistente
        }
      });
    }

    const caja = await obtenerOCrearCajaPrincipal(sedeId, transaction);
    const sesion = await CajasSesionesModel.create(
      {
        caja_id: Number(caja.id),
        sede_id: sedeId,
        usuario_apertura_id: usuarioId(req),
        fecha_apertura: new Date(),
        monto_inicial: montoInicial.toFixed(2),
        sesion_anterior_id: apertura.sesion_anterior_id,
        monto_sugerido_apertura: Number(apertura.monto_sugerido).toFixed(2),
        diferencia_apertura: diferenciaApertura.toFixed(2),
        observacion_diferencia_apertura: observacionDiferencia,
        requiere_revision_apertura:
          Math.abs(diferenciaApertura) >= 0.01 ? 1 : 0,
        estado: 'abierta',
        // La clave única usa el id de caja: permite una sesión abierta por caja/sede.
        clave_abierta: Number(caja.id),
        observaciones: observaciones || 'Apertura desde módulo de Caja'
      },
      { transaction }
    );

    await registrarAuditoriaDiferenciaApertura({
      req,
      sedeId,
      sesion,
      apertura,
      montoInicial,
      diferencia: diferenciaApertura,
      observacion: observacionDiferencia,
      transaction
    });

    await transaction.commit();
    return res.status(201).json({
      ok: true,
      message:
        Math.abs(diferenciaApertura) >= 0.01
          ? 'Caja abierta con una diferencia de apertura registrada para revisión.'
          : 'Caja abierta correctamente.',
      apertura: {
        ...apertura,
        monto_inicial: montoInicial,
        diferencia_apertura: diferenciaApertura,
        requiere_revision: Math.abs(diferenciaApertura) >= 0.01
      },
      // Mantiene el contrato consumido por ConfirmarCobroPanel: data.id es la sesión.
      data: {
        ...(typeof sesion.toJSON === 'function' ? sesion.toJSON() : sesion),
        caja: typeof caja.toJSON === 'function' ? caja.toJSON() : caja
      }
    });
  } catch (error) {
    return responderErrorOperacion({
      res,
      error,
      transaction,
      nombre: 'CR_AbrirCajaPrincipal_CTS'
    });
  }
};

export const CR_MovimientoManualCaja_CTS = async (req, res) => {
  const transaction = await db.transaction();
  try {
    const sedeId = Number(req.body.sede_id);
    const tipo = String(req.body.tipo || '').toLowerCase();
    const monto = numeroPositivo(req.body.monto);
    const descripcion = texto(req.body.descripcion, 200);
    const observaciones = texto(req.body.observaciones);

    if (!TIPOS_MOVIMIENTO.includes(tipo)) {
      const error = new Error('El movimiento debe ser un ingreso o un egreso.');
      error.status = 400;
      throw error;
    }
    if (monto === null) {
      const error = new Error('El monto debe ser mayor a cero.');
      error.status = 400;
      throw error;
    }
    if (!descripcion) {
      const error = new Error('La descripción del movimiento es obligatoria.');
      error.status = 400;
      throw error;
    }

    const sesion = await obtenerSesionActivaBloqueada({ sedeId, transaction });
    const efectivo = await obtenerMedioEfectivo(transaction);

    if (tipo === 'egreso') {
      const movimientos = await listarMovimientosSesion(sesion.id, transaction);
      const resumen = calcularResumen({ sesion, movimientos });
      if (monto > resumen.efectivo_esperado + 0.009) {
        const error = new Error(
          'El retiro supera el efectivo esperado en caja.'
        );
        error.status = 409;
        throw error;
      }
    }

    const movimiento = await CajasMovimientosModel.create(
      {
        caja_sesion_id: Number(sesion.id),
        caja_id: Number(sesion.caja_id),
        sede_id: sedeId,
        medio_pago_id: Number(efectivo.id),
        usuario_registro_id: usuarioId(req),
        tipo,
        origen: 'manual',
        fecha_movimiento: new Date(),
        monto: monto.toFixed(2),
        descripcion,
        estado: 'vigente',
        referencia: `CAJA-MANUAL-${sesion.id}-${Date.now()}`,
        observaciones
      },
      { transaction }
    );

    await transaction.commit();
    return res.status(201).json({
      ok: true,
      message:
        tipo === 'ingreso'
          ? 'Ingreso registrado correctamente.'
          : 'Retiro registrado correctamente.',
      data: movimiento
    });
  } catch (error) {
    return responderErrorOperacion({
      res,
      error,
      transaction,
      nombre: 'CR_MovimientoManualCaja_CTS'
    });
  }
};

export const UR_RegistrarConteoCaja_CTS = async (req, res) => {
  const transaction = await db.transaction();
  try {
    const sedeId = Number(req.body.sede_id);
    const montoContado = numeroNoNegativo(req.body.monto_contado);
    if (montoContado === null) {
      const error = new Error(
        'El monto contado debe ser mayor o igual a cero.'
      );
      error.status = 400;
      throw error;
    }

    const sesion = await obtenerSesionActivaBloqueada({ sedeId, transaction });
    const movimientos = await listarMovimientosSesion(sesion.id, transaction);
    const resumen = calcularResumen({ sesion, movimientos });
    const diferencia = redondear(montoContado - resumen.efectivo_esperado);

    await sesion.update(
      {
        monto_esperado: resumen.efectivo_esperado.toFixed(2),
        monto_contado: montoContado.toFixed(2),
        diferencia: diferencia.toFixed(2),
        updated_at: new Date()
      },
      { transaction }
    );

    await transaction.commit();
    return res.status(200).json({
      ok: true,
      message: 'Conteo de efectivo guardado correctamente.',
      data: {
        monto_contado: montoContado,
        monto_esperado: resumen.efectivo_esperado,
        diferencia
      }
    });
  } catch (error) {
    return responderErrorOperacion({
      res,
      error,
      transaction,
      nombre: 'UR_RegistrarConteoCaja_CTS'
    });
  }
};

export const UR_CerrarCaja_CTS = async (req, res) => {
  const transaction = await db.transaction();
  try {
    const sedeId = Number(req.body.sede_id);
    const sesion = await obtenerSesionActivaBloqueada({ sedeId, transaction });
    const montoBody = req.body.monto_contado;
    const montoContado =
      montoBody === undefined || montoBody === null || montoBody === ''
        ? numeroNoNegativo(sesion.monto_contado)
        : numeroNoNegativo(montoBody);

    if (montoContado === null) {
      const error = new Error(
        'Antes de cerrar la caja debe registrar el efectivo contado.'
      );
      error.status = 400;
      throw error;
    }

    const movimientos = await listarMovimientosSesion(sesion.id, transaction);
    const resumen = calcularResumen({ sesion, movimientos });
    const diferencia = redondear(montoContado - resumen.efectivo_esperado);
    const observaciones = texto(req.body.observaciones);

    await sesion.update(
      {
        usuario_cierre_id: usuarioId(req),
        fecha_cierre: new Date(),
        monto_esperado: resumen.efectivo_esperado.toFixed(2),
        monto_contado: montoContado.toFixed(2),
        diferencia: diferencia.toFixed(2),
        estado: 'cerrada',
        clave_abierta: null,
        observaciones: observaciones || sesion.observaciones,
        updated_at: new Date()
      },
      { transaction }
    );

    await transaction.commit();
    return res.status(200).json({
      ok: true,
      message: 'Caja cerrada correctamente.',
      data: await cargarResumenSesion(sesion)
    });
  } catch (error) {
    return responderErrorOperacion({
      res,
      error,
      transaction,
      nombre: 'UR_CerrarCaja_CTS'
    });
  }
};
