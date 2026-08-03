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
import {
  fechaArgentina,
  usuarioTieneAlcanceOperativoDiario,
  validarFechaConsultaOperativa
} from '../../Security/operationalDayScope.js';
import {
  anularCobroConfirmado,
  corregirMedioPagoCobroConfirmado,
  editarCobroConfirmado,
  CobroOperacionError,
  confirmarCobroPendiente,
  rechazarCobroPendiente,
  registrarCobro
} from '../../Services/Cobro/cobro.service.js';

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

const construirFiltros = (query) => {
  const where = ['c.sede_id = :sedeId'];
  const replacements = { sedeId: Number(query.sede_id) };
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
    const sedeId = Number(req.query.sede_id);
    const desdeScope = validarFechaConsultaOperativa({
      user: req.user,
      sedeId,
      fecha: req.query.desde,
      nombreCampo: 'Fecha desde'
    });
    const hastaScope = validarFechaConsultaOperativa({
      user: req.user,
      sedeId,
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

    const queryOperativa = usuarioTieneAlcanceOperativoDiario(req.user, sedeId)
      ? { ...req.query, desde: fechaArgentina(), hasta: fechaArgentina() }
      : req.query;
    const page = Math.max(Number(queryOperativa.page || 1), 1);
    const limit = Math.min(Math.max(Number(queryOperativa.limit || 20), 1), 100);
    const offset = (page - 1) * limit;
    const { whereSql, replacements } = construirFiltros(queryOperativa);

    const [rows, totalRows, resumenRows] = await Promise.all([
      db.query(
        `SELECT c.id, c.fecha_cobro, c.cliente_tipo, c.alumno_id,
          c.cliente_usuario_id, c.importe, c.descuentos, c.impuestos,
          c.total, c.moneda, c.estado,
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
          SUM(CASE WHEN c.estado = 'anulado' THEN 1 ELSE 0 END) AS anulados
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
        `SELECT * FROM cobros_detalles WHERE cobro_id = :id ORDER BY id ASC`,
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
      data: resultado.cobro
    });
  } catch (error) {
    return manejarErrorCobro(error, res, 'UR_AnularCobro_CTS');
  }
};
