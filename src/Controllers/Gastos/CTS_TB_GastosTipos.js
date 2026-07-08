/*
 * Benjamin Orellana - 2026/07/07 - Controlador Sequelize para tipos de gastos PREMIUM.
 */

import { Op } from 'sequelize';

import db from '../../DataBase/db.js';
import GastosTiposModel from '../../Models/Gastos/MD_TB_GastosTipos.js';
import GastosGastosModel from '../../Models/Gastos/MD_TB_GastosGastos.js';
import GastosPeriodicosModel from '../../Models/Gastos/MD_TB_GastosPeriodicos.js';

import {
  armarRespuestaAsociacionesBloqueantes,
  buildOrder,
  buildPagination,
  manejarErrorControlador,
  normalizarTexto,
  normalizarTinyint,
  validarRolLecturaGastos,
  validarRolOperacionGastos
} from './gastos.helpers.js';

const buildPayloadTipoGastoCreate = (body = {}) => {
  return {
    nombre: normalizarTexto(body.nombre),
    descripcion: normalizarTexto(body.descripcion),
    activo: normalizarTinyint(body.activo, 1)
  };
};

const buildPayloadTipoGastoUpdate = (body = {}) => {
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(body, 'nombre')) {
    payload.nombre = normalizarTexto(body.nombre);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'descripcion')) {
    payload.descripcion = normalizarTexto(body.descripcion);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'activo')) {
    payload.activo = normalizarTinyint(body.activo, 1);
  }

  return payload;
};

const validarPayloadTipoGasto = (payload = {}, modo = 'create') => {
  const errores = [];

  if (modo === 'create' && !payload.nombre) {
    errores.push('El nombre del tipo de gasto es obligatorio.');
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'nombre') && !payload.nombre) {
    errores.push('El nombre del tipo de gasto no puede estar vacío.');
  }

  if (payload.nombre && payload.nombre.length > 120) {
    errores.push('El nombre no puede superar los 120 caracteres.');
  }

  if (payload.descripcion && payload.descripcion.length > 255) {
    errores.push('La descripción no puede superar los 255 caracteres.');
  }

  return errores;
};

const verificarNombreDuplicado = async (nombre, tipoIdExcluir = null, transaction = null) => {
  if (!nombre) return null;

  const where = { nombre };

  if (tipoIdExcluir) {
    where.id = { [Op.ne]: tipoIdExcluir };
  }

  return GastosTiposModel.findOne({ where, transaction });
};

export const OBR_GastosTipos_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaGastos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar tipos de gastos.'
      });
    }

    const { q, activo, page = 1, limit = 50, orderBy = 'nombre', orderDirection = 'ASC' } = req.query;

    const where = {};

    const search = normalizarTexto(q);

    if (search) {
      where[Op.or] = [
        { nombre: { [Op.like]: `%${search}%` } },
        { descripcion: { [Op.like]: `%${search}%` } }
      ];
    }

    if (activo !== undefined && activo !== null && activo !== '') {
      where.activo = normalizarTinyint(activo, 1);
    }

    const { pageNumber, limitNumber, offset } = buildPagination({ page, limit });
    const order = buildOrder({
      orderBy,
      orderDirection,
      allowedFields: ['id', 'nombre', 'activo', 'created_at', 'updated_at']
    });

    const { rows, count } = await GastosTiposModel.findAndCountAll({
      where,
      limit: limitNumber,
      offset,
      order
    });

    return res.status(200).json({
      ok: true,
      message: 'Tipos de gastos obtenidos correctamente.',
      total: count,
      page: pageNumber,
      limit: limitNumber,
      total_pages: Math.ceil(count / limitNumber),
      data: rows
    });
  } catch (error) {
    return manejarErrorControlador({ res, error, nombre: 'OBR_GastosTipos_CTS' });
  }
};

export const OBR_GastoTipoPorId_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaGastos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar tipos de gastos.'
      });
    }

    const { id } = req.params;
    const tipo = await GastosTiposModel.findByPk(id);

    if (!tipo) {
      return res.status(404).json({
        ok: false,
        message: 'Tipo de gasto no encontrado.'
      });
    }

    return res.status(200).json({
      ok: true,
      message: 'Tipo de gasto obtenido correctamente.',
      data: tipo
    });
  } catch (error) {
    return manejarErrorControlador({ res, error, nombre: 'OBR_GastoTipoPorId_CTS' });
  }
};

export const CR_GastosTipos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionGastos(req.user)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para crear tipos de gastos.'
      });
    }

    const payload = buildPayloadTipoGastoCreate(req.body);
    const errores = validarPayloadTipoGasto(payload, 'create');

    if (errores.length > 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para crear el tipo de gasto.',
        errors: errores
      });
    }

    const duplicado = await verificarNombreDuplicado(payload.nombre, null, transaction);

    if (duplicado) {
      await transaction.rollback();

      return res.status(409).json({
        ok: false,
        message: 'Ya existe un tipo de gasto con ese nombre.'
      });
    }

    const nuevoTipo = await GastosTiposModel.create(payload, { transaction });

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      message: 'Tipo de gasto creado correctamente.',
      data: nuevoTipo
    });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();

    return manejarErrorControlador({ res, error, nombre: 'CR_GastosTipos_CTS' });
  }
};

export const UR_GastosTipos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionGastos(req.user)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para actualizar tipos de gastos.'
      });
    }

    const { id } = req.params;
    const tipo = await GastosTiposModel.findByPk(id, { transaction });

    if (!tipo) {
      await transaction.rollback();

      return res.status(404).json({
        ok: false,
        message: 'Tipo de gasto no encontrado.'
      });
    }

    const payload = buildPayloadTipoGastoUpdate(req.body);
    const errores = validarPayloadTipoGasto(payload, 'update');

    if (errores.length > 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para actualizar el tipo de gasto.',
        errors: errores
      });
    }

    if (payload.nombre) {
      const duplicado = await verificarNombreDuplicado(payload.nombre, id, transaction);

      if (duplicado) {
        await transaction.rollback();

        return res.status(409).json({
          ok: false,
          message: 'Ya existe otro tipo de gasto con ese nombre.'
        });
      }
    }

    await tipo.update(payload, { transaction });
    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Tipo de gasto actualizado correctamente.',
      data: tipo
    });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();

    return manejarErrorControlador({ res, error, nombre: 'UR_GastosTipos_CTS' });
  }
};

export const DR_GastosTipos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionGastos(req.user)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para eliminar tipos de gastos.'
      });
    }

    const { id } = req.params;
    const tipo = await GastosTiposModel.findByPk(id, { transaction });

    if (!tipo) {
      await transaction.rollback();

      return res.status(404).json({
        ok: false,
        message: 'Tipo de gasto no encontrado.'
      });
    }

    const [gastosAsociados, periodicosAsociados] = await Promise.all([
      GastosGastosModel.count({ where: { tipo_gasto_id: id }, transaction }),
      GastosPeriodicosModel.count({ where: { tipo_gasto_id: id }, transaction })
    ]);

    const detalleAsociaciones = armarRespuestaAsociacionesBloqueantes([
      { tabla: 'gastos_gastos', cantidad: gastosAsociados },
      { tabla: 'gastos_periodicos', cantidad: periodicosAsociados }
    ]);

    if (detalleAsociaciones.tiene_asociaciones) {
      await transaction.rollback();

      return res.status(409).json({
        ok: false,
        message:
          'No se puede eliminar físicamente el tipo de gasto porque tiene gastos asociados.',
        detalle:
          'Primero reasigná o eliminá los gastos y gastos periódicos asociados a este tipo.',
        ...detalleAsociaciones
      });
    }

    const data = typeof tipo.toJSON === 'function' ? tipo.toJSON() : tipo;

    await tipo.destroy({ transaction });
    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Tipo de gasto eliminado físicamente correctamente.',
      data
    });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();

    return manejarErrorControlador({ res, error, nombre: 'DR_GastosTipos_CTS' });
  }
};
