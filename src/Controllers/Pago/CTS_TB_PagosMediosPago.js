/*
 * Benjamin Orellana - 2026/05/29 - Controlador Sequelize para medios de pago PREMIUM.
 */

import { Op } from 'sequelize';
import db from '../../DataBase/db.js';
import PagosMediosPagoModel from '../../Models/Pago/MD_TB_PagosMediosPago.js';

const TIPOS_MEDIO_PAGO_VALIDOS = [
  'efectivo',
  'transferencia',
  'tarjeta',
  'debito_automatico',
  'otro'
];

const CAMPOS_ORDEN_VALIDOS = [
  'id',
  'nombre',
  'codigo',
  'tipo',
  'requiere_comprobante',
  'requiere_validacion',
  'activo',
  'created_at',
  'updated_at'
];

// Benjamin Orellana - 2026/05/29 - Normaliza paginación para listados de medios de pago.
const obtenerPaginacion = (query) => {
  const page = Math.max(parseInt(query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit || '10', 10), 1), 100);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
};

// Benjamin Orellana - 2026/05/29 - Valida valores TINYINT usados como booleanos.
const esTinyintValido = (valor) => {
  return valor === 0 || valor === 1 || valor === '0' || valor === '1';
};

// Benjamin Orellana - 2026/05/29 - Arma respuesta estándar de error.
const responderError = (res, status, message, data = null) => {
  return res.status(status).json({
    ok: false,
    message,
    data
  });
};

// Benjamin Orellana - 2026/05/29 - Valida payload de creación y edición de medios de pago.
const validarPayloadMedioPago = (body, esCreacion = true) => {
  const errores = [];

  if (esCreacion || body.nombre !== undefined) {
    if (!body.nombre || String(body.nombre).trim() === '') {
      errores.push('El campo nombre es obligatorio.');
    }

    if (body.nombre && String(body.nombre).length > 100) {
      errores.push('El campo nombre no puede superar los 100 caracteres.');
    }
  }

  if (esCreacion || body.codigo !== undefined) {
    if (!body.codigo || String(body.codigo).trim() === '') {
      errores.push('El campo codigo es obligatorio.');
    }

    if (body.codigo && String(body.codigo).length > 50) {
      errores.push('El campo codigo no puede superar los 50 caracteres.');
    }
  }

  if (esCreacion || body.tipo !== undefined) {
    if (!body.tipo || !TIPOS_MEDIO_PAGO_VALIDOS.includes(body.tipo)) {
      errores.push(
        `El campo tipo debe ser uno de los siguientes valores: ${TIPOS_MEDIO_PAGO_VALIDOS.join(', ')}.`
      );
    }
  }

  if (
    body.requiere_comprobante !== undefined &&
    !esTinyintValido(body.requiere_comprobante)
  ) {
    errores.push('El campo requiere_comprobante debe ser 0 o 1.');
  }

  if (
    body.requiere_validacion !== undefined &&
    !esTinyintValido(body.requiere_validacion)
  ) {
    errores.push('El campo requiere_validacion debe ser 0 o 1.');
  }

  if (body.activo !== undefined && !esTinyintValido(body.activo)) {
    errores.push('El campo activo debe ser 0 o 1.');
  }

  return errores;
};

// Benjamin Orellana - 2026/05/29 - Lista medios de pago con filtros y paginación.
export const OBR_PagosMediosPago_CTS = async (req, res) => {
  try {
    const { page, limit, offset } = obtenerPaginacion(req.query);

    const {
      q,
      tipo,
      activo,
      requiere_comprobante,
      requiere_validacion,
      order_by = 'id',
      order_direction = 'DESC'
    } = req.query;

    const where = {};

    if (q && String(q).trim() !== '') {
      where[Op.or] = [
        { nombre: { [Op.like]: `%${String(q).trim()}%` } },
        { codigo: { [Op.like]: `%${String(q).trim()}%` } }
      ];
    }

    if (tipo !== undefined && String(tipo).trim() !== '') {
      if (!TIPOS_MEDIO_PAGO_VALIDOS.includes(tipo)) {
        return responderError(
          res,
          400,
          `El filtro tipo debe ser uno de los siguientes valores: ${TIPOS_MEDIO_PAGO_VALIDOS.join(', ')}.`
        );
      }

      where.tipo = tipo;
    }

    if (activo !== undefined) {
      if (!esTinyintValido(activo)) {
        return responderError(res, 400, 'El filtro activo debe ser 0 o 1.');
      }

      where.activo = Number(activo);
    }

    if (requiere_comprobante !== undefined) {
      if (!esTinyintValido(requiere_comprobante)) {
        return responderError(
          res,
          400,
          'El filtro requiere_comprobante debe ser 0 o 1.'
        );
      }

      where.requiere_comprobante = Number(requiere_comprobante);
    }

    if (requiere_validacion !== undefined) {
      if (!esTinyintValido(requiere_validacion)) {
        return responderError(
          res,
          400,
          'El filtro requiere_validacion debe ser 0 o 1.'
        );
      }

      where.requiere_validacion = Number(requiere_validacion);
    }

    const campoOrden = CAMPOS_ORDEN_VALIDOS.includes(order_by)
      ? order_by
      : 'id';
    const direccionOrden =
      String(order_direction).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows } = await PagosMediosPagoModel.findAndCountAll({
      where,
      limit,
      offset,
      order: [[campoOrden, direccionOrden]]
    });

    return res.status(200).json({
      ok: true,
      message: 'Medios de pago obtenidos correctamente.',
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit),
      data: rows
    });
  } catch (error) {
    console.error('Error en OBR_PagosMediosPago_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener los medios de pago.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Obtiene un medio de pago por ID.
export const OBR_MedioPagoPorId_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const medioPago = await PagosMediosPagoModel.findByPk(id);

    if (!medioPago) {
      return responderError(
        res,
        404,
        'No se encontró el medio de pago solicitado.'
      );
    }

    return res.status(200).json({
      ok: true,
      message: 'Medio de pago obtenido correctamente.',
      data: medioPago
    });
  } catch (error) {
    console.error('Error en OBR_MedioPagoPorId_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener el medio de pago.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Lista medios de pago activos para selects y operación diaria.
export const OBR_MediosPagoActivos_CTS = async (req, res) => {
  try {
    const { tipo } = req.query;

    const where = {
      activo: 1
    };

    if (tipo !== undefined && String(tipo).trim() !== '') {
      if (!TIPOS_MEDIO_PAGO_VALIDOS.includes(tipo)) {
        return responderError(
          res,
          400,
          `El filtro tipo debe ser uno de los siguientes valores: ${TIPOS_MEDIO_PAGO_VALIDOS.join(', ')}.`
        );
      }

      where.tipo = tipo;
    }

    const mediosPago = await PagosMediosPagoModel.findAll({
      where,
      order: [
        ['nombre', 'ASC'],
        ['id', 'ASC']
      ]
    });

    return res.status(200).json({
      ok: true,
      message: 'Medios de pago activos obtenidos correctamente.',
      data: mediosPago
    });
  } catch (error) {
    console.error('Error en OBR_MediosPagoActivos_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener los medios de pago activos.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Crea un nuevo medio de pago.
export const CR_PagosMediosPago_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const errores = validarPayloadMedioPago(req.body, true);

    if (errores.length > 0) {
      await transaction.rollback();
      return responderError(res, 400, 'Hay errores de validación.', errores);
    }

    const {
      nombre,
      codigo,
      tipo,
      requiere_comprobante,
      requiere_validacion,
      activo
    } = req.body;

    const codigoNormalizado = String(codigo).trim();

    const codigoExistente = await PagosMediosPagoModel.findOne({
      where: {
        codigo: codigoNormalizado
      },
      transaction
    });

    if (codigoExistente) {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'Ya existe un medio de pago registrado con ese codigo.'
      );
    }

    const nuevoMedioPago = await PagosMediosPagoModel.create(
      {
        nombre: String(nombre).trim(),
        codigo: codigoNormalizado,
        tipo,
        requiere_comprobante:
          requiere_comprobante !== undefined ? Number(requiere_comprobante) : 0,
        requiere_validacion:
          requiere_validacion !== undefined ? Number(requiere_validacion) : 0,
        activo: activo !== undefined ? Number(activo) : 1
      },
      { transaction }
    );

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      message: 'Medio de pago creado correctamente.',
      data: nuevoMedioPago
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en CR_PagosMediosPago_CTS:', error);

    if (error?.name === 'SequelizeUniqueConstraintError') {
      return responderError(
        res,
        409,
        'Ya existe un medio de pago registrado con ese codigo.'
      );
    }

    return responderError(res, 500, 'Error interno al crear el medio de pago.');
  }
};

// Benjamin Orellana - 2026/05/29 - Actualiza un medio de pago existente.
export const UR_PagosMediosPago_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const medioPago = await PagosMediosPagoModel.findByPk(id, { transaction });

    if (!medioPago) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró el medio de pago solicitado.'
      );
    }

    const errores = validarPayloadMedioPago(req.body, false);

    if (errores.length > 0) {
      await transaction.rollback();
      return responderError(res, 400, 'Hay errores de validación.', errores);
    }

    const datosActualizar = {};

    if (req.body.nombre !== undefined) {
      datosActualizar.nombre = String(req.body.nombre).trim();
    }

    if (req.body.codigo !== undefined) {
      const codigoNormalizado = String(req.body.codigo).trim();

      const codigoExistente = await PagosMediosPagoModel.findOne({
        where: {
          codigo: codigoNormalizado,
          id: {
            [Op.ne]: id
          }
        },
        transaction
      });

      if (codigoExistente) {
        await transaction.rollback();
        return responderError(
          res,
          409,
          'Ya existe otro medio de pago registrado con ese codigo.'
        );
      }

      datosActualizar.codigo = codigoNormalizado;
    }

    if (req.body.tipo !== undefined) {
      datosActualizar.tipo = req.body.tipo;
    }

    if (req.body.requiere_comprobante !== undefined) {
      datosActualizar.requiere_comprobante = Number(
        req.body.requiere_comprobante
      );
    }

    if (req.body.requiere_validacion !== undefined) {
      datosActualizar.requiere_validacion = Number(
        req.body.requiere_validacion
      );
    }

    if (req.body.activo !== undefined) {
      datosActualizar.activo = Number(req.body.activo);
    }

    datosActualizar.updated_at = new Date();

    await medioPago.update(datosActualizar, { transaction });

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Medio de pago actualizado correctamente.',
      data: medioPago
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_PagosMediosPago_CTS:', error);

    if (error?.name === 'SequelizeUniqueConstraintError') {
      return responderError(
        res,
        409,
        'Ya existe un medio de pago registrado con ese codigo.'
      );
    }

    return responderError(
      res,
      500,
      'Error interno al actualizar el medio de pago.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Actualiza el estado activo de un medio de pago.
export const UR_EstadoMedioPago_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;
    const { activo } = req.body;

    if (!esTinyintValido(activo)) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El campo activo es obligatorio y debe ser 0 o 1.'
      );
    }

    const medioPago = await PagosMediosPagoModel.findByPk(id, { transaction });

    if (!medioPago) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró el medio de pago solicitado.'
      );
    }

    await medioPago.update(
      {
        activo: Number(activo),
        updated_at: new Date()
      },
      { transaction }
    );

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message:
        Number(activo) === 1
          ? 'Medio de pago activado correctamente.'
          : 'Medio de pago desactivado correctamente.',
      data: medioPago
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_EstadoMedioPago_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al actualizar el estado del medio de pago.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Desactiva un medio de pago mediante baja lógica.
export const DR_PagosMediosPago_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const medioPago = await PagosMediosPagoModel.findByPk(id, { transaction });

    if (!medioPago) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró el medio de pago solicitado.'
      );
    }

    await medioPago.update(
      {
        activo: 0,
        updated_at: new Date()
      },
      { transaction }
    );

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Medio de pago desactivado correctamente.',
      data: medioPago
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en DR_PagosMediosPago_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al desactivar el medio de pago.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Elimina físicamente un medio de pago de la tabla pagos_medios_pago.
export const ER_PagosMediosPago_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const medioPago = await PagosMediosPagoModel.findByPk(id, { transaction });

    if (!medioPago) {
      await transaction.rollback();

      return responderError(
        res,
        404,
        'No se encontró el medio de pago solicitado.'
      );
    }

    await medioPago.destroy({ transaction });

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Medio de pago eliminado físicamente correctamente.',
      data: {
        id: Number(id)
      }
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en ER_PagosMediosPago_CTS:', error);

    if (error?.name === 'SequelizeForeignKeyConstraintError') {
      return responderError(
        res,
        409,
        'No se puede eliminar físicamente el medio de pago porque tiene registros relacionados.'
      );
    }

    return responderError(
      res,
      500,
      'Error interno al eliminar físicamente el medio de pago.'
    );
  }
};
