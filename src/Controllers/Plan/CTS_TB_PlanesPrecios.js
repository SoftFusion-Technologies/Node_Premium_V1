/*
 * Benjamin Orellana - 2026/05/29 - Controlador Sequelize para precios de planes PREMIUM.
 */

import { Op } from 'sequelize';
import db from '../../DataBase/db.js';
import PlanesPreciosModel from '../../Models/Plan/MD_TB_PlanesPrecios.js';
import PlanesModel from '../../Models/Plan/MD_TB_Planes.js';
import SedesModel from '../../Models/Sede/MD_TB_Sedes.js';

const CAMPOS_ORDEN_VALIDOS = [
  'id',
  'plan_id',
  'sede_id',
  'precio',
  'moneda',
  'fecha_desde',
  'fecha_hasta',
  'activo',
  'created_at',
  'updated_at'
];

// Benjamin Orellana - 2026/05/29 - Normaliza paginación para listados de precios de planes.
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

// Benjamin Orellana - 2026/05/29 - Valida identificadores numéricos.
const esIdValido = (valor) => {
  if (valor === null || valor === undefined || valor === '') return false;

  const numero = Number(valor);

  return Number.isInteger(numero) && numero > 0;
};

// Benjamin Orellana - 2026/05/29 - Valida importes DECIMAL.
const esImporteValido = (valor) => {
  if (valor === null || valor === undefined || valor === '') return false;

  const numero = Number(valor);

  return !Number.isNaN(numero) && numero >= 0;
};

// Benjamin Orellana - 2026/05/29 - Valida formato YYYY-MM-DD para campos DATEONLY.
const esFechaDateOnlyValida = (valor) => {
  if (!valor || typeof valor !== 'string') return false;

  const regexFecha = /^\d{4}-\d{2}-\d{2}$/;

  if (!regexFecha.test(valor)) return false;

  const fecha = new Date(`${valor}T00:00:00`);

  return !Number.isNaN(fecha.getTime());
};

// Benjamin Orellana - 2026/05/29 - Arma respuesta estándar de error.
const responderError = (res, status, message, data = null) => {
  return res.status(status).json({
    ok: false,
    message,
    data
  });
};

// Benjamin Orellana - 2026/05/29 - Include permitido según relaciones del módulo Plan.
const includePlanPrecio = [
  {
    model: PlanesModel,
    as: 'plan',
    attributes: [
      'id',
      'nombre',
      'codigo',
      'clases_por_mes',
      'cantidad_clases_periodo',
      'periodo',
      'duracion_dias',
      'activo'
    ]
  },
  {
    model: SedesModel,
    as: 'sede',
    required: false
  }
];

// Benjamin Orellana - 2026/05/29 - Valida payload de creación y edición de precios de planes.
const validarPayloadPlanPrecio = (body, esCreacion = true) => {
  const errores = [];

  if (esCreacion || body.plan_id !== undefined) {
    if (!esIdValido(body.plan_id)) {
      errores.push('El campo plan_id es obligatorio y debe ser un ID válido.');
    }
  }

  if (
    body.sede_id !== undefined &&
    body.sede_id !== null &&
    body.sede_id !== ''
  ) {
    if (!esIdValido(body.sede_id)) {
      errores.push('El campo sede_id debe ser un ID válido o null.');
    }
  }

  if (esCreacion || body.precio !== undefined) {
    if (!esImporteValido(body.precio)) {
      errores.push(
        'El campo precio es obligatorio y debe ser un importe válido mayor o igual a 0.'
      );
    }
  }

  if (esCreacion || body.moneda !== undefined) {
    if (!body.moneda || String(body.moneda).trim() === '') {
      errores.push('El campo moneda es obligatorio.');
    }

    if (body.moneda && String(body.moneda).length > 10) {
      errores.push('El campo moneda no puede superar los 10 caracteres.');
    }
  }

  if (esCreacion || body.fecha_desde !== undefined) {
    if (!esFechaDateOnlyValida(body.fecha_desde)) {
      errores.push(
        'El campo fecha_desde es obligatorio y debe tener formato YYYY-MM-DD.'
      );
    }
  }

  if (
    body.fecha_hasta !== undefined &&
    body.fecha_hasta !== null &&
    body.fecha_hasta !== ''
  ) {
    if (!esFechaDateOnlyValida(body.fecha_hasta)) {
      errores.push('El campo fecha_hasta debe tener formato YYYY-MM-DD.');
    }
  }

  if (
    body.fecha_desde &&
    body.fecha_hasta &&
    esFechaDateOnlyValida(body.fecha_desde) &&
    esFechaDateOnlyValida(body.fecha_hasta) &&
    body.fecha_hasta < body.fecha_desde
  ) {
    errores.push('El campo fecha_hasta no puede ser menor que fecha_desde.');
  }

  if (body.activo !== undefined && !esTinyintValido(body.activo)) {
    errores.push('El campo activo debe ser 0 o 1.');
  }

  return errores;
};

// Benjamin Orellana - 2026/05/29 - Lista precios de planes con filtros y paginación.
export const OBR_PlanesPrecios_CTS = async (req, res) => {
  try {
    const { page, limit, offset } = obtenerPaginacion(req.query);

    const {
      plan_id,
      sede_id,
      activo,
      moneda,
      fecha,
      order_by = 'id',
      order_direction = 'DESC'
    } = req.query;

    const where = {};

    if (plan_id !== undefined) {
      if (!esIdValido(plan_id)) {
        return responderError(
          res,
          400,
          'El filtro plan_id debe ser un ID válido.'
        );
      }

      where.plan_id = Number(plan_id);
    }

    if (sede_id !== undefined) {
      if (sede_id === 'null' || sede_id === '') {
        where.sede_id = null;
      } else {
        if (!esIdValido(sede_id)) {
          return responderError(
            res,
            400,
            'El filtro sede_id debe ser un ID válido o null.'
          );
        }

        where.sede_id = Number(sede_id);
      }
    }

    if (activo !== undefined) {
      if (!esTinyintValido(activo)) {
        return responderError(res, 400, 'El filtro activo debe ser 0 o 1.');
      }

      where.activo = Number(activo);
    }

    if (moneda !== undefined && String(moneda).trim() !== '') {
      where.moneda = String(moneda).trim();
    }

    if (fecha !== undefined && String(fecha).trim() !== '') {
      if (!esFechaDateOnlyValida(fecha)) {
        return responderError(
          res,
          400,
          'El filtro fecha debe tener formato YYYY-MM-DD.'
        );
      }

      where.fecha_desde = {
        [Op.lte]: fecha
      };

      where[Op.or] = [
        { fecha_hasta: null },
        {
          fecha_hasta: {
            [Op.gte]: fecha
          }
        }
      ];
    }

    const campoOrden = CAMPOS_ORDEN_VALIDOS.includes(order_by)
      ? order_by
      : 'id';
    const direccionOrden =
      String(order_direction).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows } = await PlanesPreciosModel.findAndCountAll({
      where,
      include: includePlanPrecio,
      limit,
      offset,
      order: [[campoOrden, direccionOrden]]
    });

    return res.status(200).json({
      ok: true,
      message: 'Precios de planes obtenidos correctamente.',
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit),
      data: rows
    });
  } catch (error) {
    console.error('Error en OBR_PlanesPrecios_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener los precios de planes.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Obtiene un precio de plan por ID.
export const OBR_PlanPrecioPorId_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const precioPlan = await PlanesPreciosModel.findByPk(id, {
      include: includePlanPrecio
    });

    if (!precioPlan) {
      return responderError(
        res,
        404,
        'No se encontró el precio de plan solicitado.'
      );
    }

    return res.status(200).json({
      ok: true,
      message: 'Precio de plan obtenido correctamente.',
      data: precioPlan
    });
  } catch (error) {
    console.error('Error en OBR_PlanPrecioPorId_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener el precio de plan.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Lista precios asociados a un plan.
export const OBR_PreciosPorPlan_CTS = async (req, res) => {
  try {
    const { plan_id } = req.params;
    const { page, limit, offset } = obtenerPaginacion(req.query);
    const { sede_id, activo } = req.query;

    if (!esIdValido(plan_id)) {
      return responderError(
        res,
        400,
        'El parámetro plan_id debe ser un ID válido.'
      );
    }

    const where = {
      plan_id: Number(plan_id)
    };

    if (sede_id !== undefined) {
      if (sede_id === 'null' || sede_id === '') {
        where.sede_id = null;
      } else {
        if (!esIdValido(sede_id)) {
          return responderError(
            res,
            400,
            'El filtro sede_id debe ser un ID válido o null.'
          );
        }

        where.sede_id = Number(sede_id);
      }
    }

    if (activo !== undefined) {
      if (!esTinyintValido(activo)) {
        return responderError(res, 400, 'El filtro activo debe ser 0 o 1.');
      }

      where.activo = Number(activo);
    }

    const { count, rows } = await PlanesPreciosModel.findAndCountAll({
      where,
      include: includePlanPrecio,
      limit,
      offset,
      order: [
        ['fecha_desde', 'DESC'],
        ['id', 'DESC']
      ]
    });

    return res.status(200).json({
      ok: true,
      message: 'Precios del plan obtenidos correctamente.',
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit),
      data: rows
    });
  } catch (error) {
    console.error('Error en OBR_PreciosPorPlan_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener los precios del plan.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Obtiene el precio vigente de un plan, con prioridad por sede y fallback global.
export const OBR_PrecioVigentePlan_CTS = async (req, res) => {
  try {
    const { plan_id } = req.params;
    const { sede_id, fecha } = req.query;

    if (!esIdValido(plan_id)) {
      return responderError(
        res,
        400,
        'El parámetro plan_id debe ser un ID válido.'
      );
    }

    const fechaConsulta =
      fecha && String(fecha).trim() !== ''
        ? String(fecha).trim()
        : new Date().toISOString().slice(0, 10);

    if (!esFechaDateOnlyValida(fechaConsulta)) {
      return responderError(
        res,
        400,
        'El filtro fecha debe tener formato YYYY-MM-DD.'
      );
    }

    const whereBase = {
      plan_id: Number(plan_id),
      activo: 1,
      fecha_desde: {
        [Op.lte]: fechaConsulta
      },
      [Op.or]: [
        { fecha_hasta: null },
        {
          fecha_hasta: {
            [Op.gte]: fechaConsulta
          }
        }
      ]
    };

    let precioVigente = null;

    if (sede_id !== undefined && sede_id !== null && sede_id !== '') {
      if (!esIdValido(sede_id)) {
        return responderError(
          res,
          400,
          'El filtro sede_id debe ser un ID válido.'
        );
      }

      precioVigente = await PlanesPreciosModel.findOne({
        where: {
          ...whereBase,
          sede_id: Number(sede_id)
        },
        include: includePlanPrecio,
        order: [
          ['fecha_desde', 'DESC'],
          ['id', 'DESC']
        ]
      });
    }

    if (!precioVigente) {
      precioVigente = await PlanesPreciosModel.findOne({
        where: {
          ...whereBase,
          sede_id: null
        },
        include: includePlanPrecio,
        order: [
          ['fecha_desde', 'DESC'],
          ['id', 'DESC']
        ]
      });
    }

    if (!precioVigente) {
      return responderError(
        res,
        404,
        'No se encontró un precio vigente para el plan solicitado.'
      );
    }

    return res.status(200).json({
      ok: true,
      message: 'Precio vigente del plan obtenido correctamente.',
      data: precioVigente
    });
  } catch (error) {
    console.error('Error en OBR_PrecioVigentePlan_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener el precio vigente del plan.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Crea un precio de plan.
export const CR_PlanesPrecios_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const errores = validarPayloadPlanPrecio(req.body, true);

    if (errores.length > 0) {
      await transaction.rollback();
      return responderError(res, 400, 'Hay errores de validación.', errores);
    }

    const {
      plan_id,
      sede_id,
      precio,
      moneda,
      fecha_desde,
      fecha_hasta,
      activo
    } = req.body;

    const plan = await PlanesModel.findByPk(plan_id, { transaction });

    if (!plan) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró el plan indicado en plan_id.'
      );
    }

    let sedeNormalizada = null;

    if (sede_id !== undefined && sede_id !== null && sede_id !== '') {
      const sede = await SedesModel.findByPk(sede_id, { transaction });

      if (!sede) {
        await transaction.rollback();
        return responderError(
          res,
          404,
          'No se encontró la sede indicada en sede_id.'
        );
      }

      sedeNormalizada = Number(sede_id);
    }

    const nuevoPrecioPlan = await PlanesPreciosModel.create(
      {
        plan_id: Number(plan_id),
        sede_id: sedeNormalizada,
        precio: Number(precio).toFixed(2),
        moneda: moneda !== undefined ? String(moneda).trim() : 'ARS',
        fecha_desde,
        fecha_hasta:
          fecha_hasta !== undefined && fecha_hasta !== '' ? fecha_hasta : null,
        activo: activo !== undefined ? Number(activo) : 1
      },
      { transaction }
    );

    await transaction.commit();

    const precioPlanCompleto = await PlanesPreciosModel.findByPk(
      nuevoPrecioPlan.id,
      {
        include: includePlanPrecio
      }
    );

    return res.status(201).json({
      ok: true,
      message: 'Precio de plan creado correctamente.',
      data: precioPlanCompleto
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en CR_PlanesPrecios_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al crear el precio de plan.'
    );
  }
};

// Benjamin Orellana - 2026/05/30 - Crea precios masivos de un plan por sede en una única transacción.
export const CR_PlanesPreciosMasivoPorSedes_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { plan_id } = req.params;
    const { moneda, fecha_desde, fecha_hasta, activo, precios } = req.body;

    if (!esIdValido(plan_id)) {
      await transaction.rollback();

      return responderError(
        res,
        400,
        'El parámetro plan_id debe ser un ID válido.'
      );
    }

    const plan = await PlanesModel.findByPk(plan_id, { transaction });

    if (!plan) {
      await transaction.rollback();

      return responderError(
        res,
        404,
        'No se encontró el plan indicado.'
      );
    }

    if (!Array.isArray(precios) || precios.length === 0) {
      await transaction.rollback();

      return responderError(
        res,
        400,
        'Debe enviar al menos un precio para crear.'
      );
    }

    if (!moneda || String(moneda).trim() === '') {
      await transaction.rollback();

      return responderError(res, 400, 'El campo moneda es obligatorio.');
    }

    if (String(moneda).length > 10) {
      await transaction.rollback();

      return responderError(
        res,
        400,
        'El campo moneda no puede superar los 10 caracteres.'
      );
    }

    if (!esFechaDateOnlyValida(fecha_desde)) {
      await transaction.rollback();

      return responderError(
        res,
        400,
        'El campo fecha_desde es obligatorio y debe tener formato YYYY-MM-DD.'
      );
    }

    if (
      fecha_hasta !== undefined &&
      fecha_hasta !== null &&
      fecha_hasta !== '' &&
      !esFechaDateOnlyValida(fecha_hasta)
    ) {
      await transaction.rollback();

      return responderError(
        res,
        400,
        'El campo fecha_hasta debe tener formato YYYY-MM-DD.'
      );
    }

    if (
      fecha_hasta &&
      esFechaDateOnlyValida(fecha_hasta) &&
      fecha_hasta < fecha_desde
    ) {
      await transaction.rollback();

      return responderError(
        res,
        400,
        'El campo fecha_hasta no puede ser menor que fecha_desde.'
      );
    }

    if (activo !== undefined && !esTinyintValido(activo)) {
      await transaction.rollback();

      return responderError(res, 400, 'El campo activo debe ser 0 o 1.');
    }

    const preciosNormalizados = [];

    for (const item of precios) {
      const sede_id = item?.sede_id;
      const precio = item?.precio;

      if (!esImporteValido(precio) || Number(precio) <= 0) {
        await transaction.rollback();

        return responderError(
          res,
          400,
          'Todos los precios deben ser importes válidos mayores a 0.'
        );
      }

      let sedeNormalizada = null;

      if (sede_id !== undefined && sede_id !== null && sede_id !== '') {
        if (!esIdValido(sede_id)) {
          await transaction.rollback();

          return responderError(
            res,
            400,
            'Cada sede_id debe ser un ID válido o null.'
          );
        }

        const sede = await SedesModel.findByPk(sede_id, { transaction });

        if (!sede) {
          await transaction.rollback();

          return responderError(
            res,
            404,
            `No se encontró la sede indicada con ID ${sede_id}.`
          );
        }

        sedeNormalizada = Number(sede_id);
      }

      preciosNormalizados.push({
        plan_id: Number(plan_id),
        sede_id: sedeNormalizada,
        precio: Number(precio).toFixed(2),
        moneda: String(moneda).trim(),
        fecha_desde,
        fecha_hasta:
          fecha_hasta !== undefined && fecha_hasta !== '' ? fecha_hasta : null,
        activo: activo !== undefined ? Number(activo) : 1
      });
    }

    const preciosCreados = await PlanesPreciosModel.bulkCreate(
      preciosNormalizados,
      {
        transaction,
        returning: true
      }
    );

    await transaction.commit();

    const idsCreados = preciosCreados.map((item) => item.id);

    const preciosCompletos = await PlanesPreciosModel.findAll({
      where: {
        id: idsCreados
      },
      include: includePlanPrecio,
      order: [['id', 'ASC']]
    });

    return res.status(201).json({
      ok: true,
      message: 'Precios del plan creados correctamente por sede.',
      total: preciosCompletos.length,
      data: preciosCompletos
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en CR_PlanesPreciosMasivoPorSedes_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al crear los precios del plan por sede.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Actualiza un precio de plan.
export const UR_PlanesPrecios_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const precioPlan = await PlanesPreciosModel.findByPk(id, { transaction });

    if (!precioPlan) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró el precio de plan solicitado.'
      );
    }

    const errores = validarPayloadPlanPrecio(req.body, false);

    if (errores.length > 0) {
      await transaction.rollback();
      return responderError(res, 400, 'Hay errores de validación.', errores);
    }

    const datosActualizar = {};

    if (req.body.plan_id !== undefined) {
      const plan = await PlanesModel.findByPk(req.body.plan_id, {
        transaction
      });

      if (!plan) {
        await transaction.rollback();
        return responderError(
          res,
          404,
          'No se encontró el plan indicado en plan_id.'
        );
      }

      datosActualizar.plan_id = Number(req.body.plan_id);
    }

    if (req.body.sede_id !== undefined) {
      if (req.body.sede_id === null || req.body.sede_id === '') {
        datosActualizar.sede_id = null;
      } else {
        const sede = await SedesModel.findByPk(req.body.sede_id, {
          transaction
        });

        if (!sede) {
          await transaction.rollback();
          return responderError(
            res,
            404,
            'No se encontró la sede indicada en sede_id.'
          );
        }

        datosActualizar.sede_id = Number(req.body.sede_id);
      }
    }

    if (req.body.precio !== undefined) {
      datosActualizar.precio = Number(req.body.precio).toFixed(2);
    }

    if (req.body.moneda !== undefined) {
      datosActualizar.moneda = String(req.body.moneda).trim();
    }

    if (req.body.fecha_desde !== undefined) {
      datosActualizar.fecha_desde = req.body.fecha_desde;
    }

    if (req.body.fecha_hasta !== undefined) {
      datosActualizar.fecha_hasta =
        req.body.fecha_hasta !== null && req.body.fecha_hasta !== ''
          ? req.body.fecha_hasta
          : null;
    }

    if (req.body.activo !== undefined) {
      datosActualizar.activo = Number(req.body.activo);
    }

    datosActualizar.updated_at = new Date();

    await precioPlan.update(datosActualizar, { transaction });

    await transaction.commit();

    const precioPlanActualizado = await PlanesPreciosModel.findByPk(id, {
      include: includePlanPrecio
    });

    return res.status(200).json({
      ok: true,
      message: 'Precio de plan actualizado correctamente.',
      data: precioPlanActualizado
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_PlanesPrecios_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al actualizar el precio de plan.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Actualiza el estado activo de un precio de plan.
export const UR_EstadoPlanesPrecios_CTS = async (req, res) => {
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

    const precioPlan = await PlanesPreciosModel.findByPk(id, { transaction });

    if (!precioPlan) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró el precio de plan solicitado.'
      );
    }

    await precioPlan.update(
      {
        activo: Number(activo),
        updated_at: new Date()
      },
      { transaction }
    );

    await transaction.commit();

    const precioPlanActualizado = await PlanesPreciosModel.findByPk(id, {
      include: includePlanPrecio
    });

    return res.status(200).json({
      ok: true,
      message:
        Number(activo) === 1
          ? 'Precio de plan activado correctamente.'
          : 'Precio de plan desactivado correctamente.',
      data: precioPlanActualizado
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_EstadoPlanesPrecios_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al actualizar el estado del precio de plan.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Desactiva un precio de plan mediante baja lógica.
export const DR_PlanesPrecios_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const precioPlan = await PlanesPreciosModel.findByPk(id, { transaction });

    if (!precioPlan) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el precio de plan solicitado.');
    }

    await precioPlan.update(
      {
        activo: 0,
        updated_at: new Date()
      },
      { transaction }
    );

    await transaction.commit();

    const precioPlanActualizado = await PlanesPreciosModel.findByPk(id, {
      include: includePlanPrecio
    });

    return res.status(200).json({
      ok: true,
      message: 'Precio de plan desactivado correctamente.',
      data: precioPlanActualizado
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en DR_PlanesPrecios_CTS:', error);

    return responderError(res, 500, 'Error interno al desactivar el precio de plan.');
  }
};

// Benjamin Orellana - 2026/05/29 - Elimina físicamente un precio de plan de la tabla planes_precios.
export const ER_PlanesPrecios_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const precioPlan = await PlanesPreciosModel.findByPk(id, { transaction });

    if (!precioPlan) {
      await transaction.rollback();

      return responderError(res, 404, 'No se encontró el precio de plan solicitado.');
    }

    await precioPlan.destroy({ transaction });

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Precio de plan eliminado físicamente correctamente.',
      data: {
        id: Number(id)
      }
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en ER_PlanesPrecios_CTS:', error);

    if (error?.name === 'SequelizeForeignKeyConstraintError') {
      return responderError(
        res,
        409,
        'No se puede eliminar físicamente el precio de plan porque tiene registros relacionados.'
      );
    }

    return responderError(res, 500, 'Error interno al eliminar físicamente el precio de plan.');
  }
};