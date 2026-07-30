/*
 * Benjamin Orellana - 2026/07/07 - Controlador Sequelize para proveedores de gastos PREMIUM.
 */

import { Op } from 'sequelize';

import db from '../../DataBase/db.js';
import { usuarioEsOperadorDiario } from '../../Security/operationalDayScope.js';
import GastosProveedoresModel from '../../Models/Gastos/MD_TB_GastosProveedores.js';
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

const buildPayloadProveedorCreate = (body = {}) => {
  return {
    nombre: normalizarTexto(body.nombre),
    cuit: normalizarTexto(body.cuit),
    telefono: normalizarTexto(body.telefono),
    email: normalizarTexto(body.email),
    direccion: normalizarTexto(body.direccion),
    observacion: normalizarTexto(body.observacion),
    activo: normalizarTinyint(body.activo, 1)
  };
};

const buildPayloadProveedorUpdate = (body = {}) => {
  const payload = {};
  const campos = ['nombre', 'cuit', 'telefono', 'email', 'direccion', 'observacion'];

  campos.forEach((campo) => {
    if (Object.prototype.hasOwnProperty.call(body, campo)) {
      payload[campo] = normalizarTexto(body[campo]);
    }
  });

  if (Object.prototype.hasOwnProperty.call(body, 'activo')) {
    payload.activo = normalizarTinyint(body.activo, 1);
  }

  return payload;
};

const validarPayloadProveedor = (payload = {}, modo = 'create') => {
  const errores = [];

  if (modo === 'create' && !payload.nombre) {
    errores.push('El nombre del proveedor es obligatorio.');
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'nombre') && !payload.nombre) {
    errores.push('El nombre del proveedor no puede estar vacío.');
  }

  if (payload.nombre && payload.nombre.length > 160) {
    errores.push('El nombre no puede superar los 160 caracteres.');
  }

  if (payload.cuit && payload.cuit.length > 20) {
    errores.push('El CUIT no puede superar los 20 caracteres.');
  }

  if (payload.telefono && payload.telefono.length > 40) {
    errores.push('El teléfono no puede superar los 40 caracteres.');
  }

  if (payload.email && payload.email.length > 120) {
    errores.push('El email no puede superar los 120 caracteres.');
  }

  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    errores.push('El email del proveedor no es válido.');
  }

  if (payload.direccion && payload.direccion.length > 180) {
    errores.push('La dirección no puede superar los 180 caracteres.');
  }

  if (payload.observacion && payload.observacion.length > 500) {
    errores.push('La observación no puede superar los 500 caracteres.');
  }

  return errores;
};

export const OBR_GastosProveedores_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaGastos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar proveedores de gastos.'
      });
    }

    const { q, activo, page = 1, limit = 50, orderBy = 'nombre', orderDirection = 'ASC' } = req.query;

    const where = {};
    const search = normalizarTexto(q);

    if (search) {
      where[Op.or] = [
        { nombre: { [Op.like]: `%${search}%` } },
        { cuit: { [Op.like]: `%${search}%` } },
        { telefono: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }

    if (activo !== undefined && activo !== null && activo !== '') {
      where.activo = normalizarTinyint(activo, 1);
    }

    const { pageNumber, limitNumber, offset } = buildPagination({ page, limit });
    const order = buildOrder({
      orderBy,
      orderDirection,
      allowedFields: ['id', 'nombre', 'cuit', 'activo', 'created_at', 'updated_at']
    });

    const { rows, count } = await GastosProveedoresModel.findAndCountAll({
      where,
      attributes: usuarioEsOperadorDiario(req.user)
        ? ['id', 'nombre', 'activo']
        : undefined,
      limit: limitNumber,
      offset,
      order
    });

    return res.status(200).json({
      ok: true,
      message: 'Proveedores de gastos obtenidos correctamente.',
      total: count,
      page: pageNumber,
      limit: limitNumber,
      total_pages: Math.ceil(count / limitNumber),
      data: rows
    });
  } catch (error) {
    return manejarErrorControlador({ res, error, nombre: 'OBR_GastosProveedores_CTS' });
  }
};

export const OBR_GastoProveedorPorId_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaGastos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar proveedores de gastos.'
      });
    }

    const { id } = req.params;
    const proveedor = await GastosProveedoresModel.findByPk(id, {
      attributes: usuarioEsOperadorDiario(req.user)
        ? ['id', 'nombre', 'activo']
        : undefined
    });

    if (!proveedor) {
      return res.status(404).json({
        ok: false,
        message: 'Proveedor no encontrado.'
      });
    }

    return res.status(200).json({
      ok: true,
      message: 'Proveedor obtenido correctamente.',
      data: proveedor
    });
  } catch (error) {
    return manejarErrorControlador({ res, error, nombre: 'OBR_GastoProveedorPorId_CTS' });
  }
};

export const CR_GastosProveedores_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionGastos(req.user)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para crear proveedores de gastos.'
      });
    }

    const payload = buildPayloadProveedorCreate(req.body);
    const errores = validarPayloadProveedor(payload, 'create');

    if (errores.length > 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para crear el proveedor.',
        errors: errores
      });
    }

    const nuevoProveedor = await GastosProveedoresModel.create(payload, { transaction });

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      message: 'Proveedor creado correctamente.',
      data: nuevoProveedor
    });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();

    return manejarErrorControlador({ res, error, nombre: 'CR_GastosProveedores_CTS' });
  }
};

export const UR_GastosProveedores_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionGastos(req.user)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para actualizar proveedores de gastos.'
      });
    }

    const { id } = req.params;
    const proveedor = await GastosProveedoresModel.findByPk(id, { transaction });

    if (!proveedor) {
      await transaction.rollback();

      return res.status(404).json({
        ok: false,
        message: 'Proveedor no encontrado.'
      });
    }

    const payload = buildPayloadProveedorUpdate(req.body);
    const errores = validarPayloadProveedor(payload, 'update');

    if (errores.length > 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para actualizar el proveedor.',
        errors: errores
      });
    }

    await proveedor.update(payload, { transaction });
    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Proveedor actualizado correctamente.',
      data: proveedor
    });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();

    return manejarErrorControlador({ res, error, nombre: 'UR_GastosProveedores_CTS' });
  }
};

export const DR_GastosProveedores_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionGastos(req.user)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para eliminar proveedores de gastos.'
      });
    }

    const { id } = req.params;
    const proveedor = await GastosProveedoresModel.findByPk(id, { transaction });

    if (!proveedor) {
      await transaction.rollback();

      return res.status(404).json({
        ok: false,
        message: 'Proveedor no encontrado.'
      });
    }

    const [gastosAsociados, periodicosAsociados] = await Promise.all([
      GastosGastosModel.count({ where: { proveedor_id: id }, transaction }),
      GastosPeriodicosModel.count({ where: { proveedor_id: id }, transaction })
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
          'No se puede eliminar físicamente el proveedor porque tiene gastos asociados.',
        detalle:
          'Primero reasigná o eliminá los gastos y gastos periódicos asociados a este proveedor.',
        ...detalleAsociaciones
      });
    }

    const data = typeof proveedor.toJSON === 'function' ? proveedor.toJSON() : proveedor;

    await proveedor.destroy({ transaction });
    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Proveedor eliminado físicamente correctamente.',
      data
    });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();

    return manejarErrorControlador({ res, error, nombre: 'DR_GastosProveedores_CTS' });
  }
};
