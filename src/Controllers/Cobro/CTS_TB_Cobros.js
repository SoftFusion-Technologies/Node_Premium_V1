/*
 * Benjamin Orellana - 2026/07/14 - Endpoints operativos de Nuevo Cobro.
 * La logica transaccional vive en Services/Cobro para poder reutilizarla
 * luego desde validaciones, anulaciones y otros canales de venta.
 */
import { QueryTypes } from 'sequelize';
import db from '../../DataBase/db.js';
import PagosMediosPagoModel from '../../Models/Pago/MD_TB_PagosMediosPago.js';
import {
  anularCobroConfirmado,
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
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const offset = (page - 1) * limit;
    const { whereSql, replacements } = construirFiltros(req.query);

    const [rows, totalRows, resumenRows] = await Promise.all([
      db.query(
        `SELECT c.id, c.fecha_cobro, c.cliente_tipo, c.alumno_id,
          c.cliente_usuario_id, c.importe, c.descuentos, c.impuestos,
          c.total, c.moneda, c.estado,
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
          COALESCE(SUM(CASE WHEN c.estado = 'confirmado' THEN c.total ELSE 0 END), 0) AS total_confirmado,
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

    const rows = await db.query(
      `SELECT COUNT(*) AS cantidad
      FROM cobros_cobros
      WHERE sede_id = :sedeId
        AND estado = 'pendiente_validacion'`,
      {
        replacements: { sedeId },
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
    const replacements = {
      id: Number(req.params.id),
      sedeId: Number(req.query.sede_id)
    };
    const cabeceras = await db.query(
      `SELECT c.*,
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
      WHERE c.id = :id AND c.sede_id = :sedeId LIMIT 1`,
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
        WHERE cp.cobro_id = :id ORDER BY cp.id ASC`,
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
