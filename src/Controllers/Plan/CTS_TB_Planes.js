/*
 * Benjamin Orellana - 2026/05/29 - Controlador Sequelize para gestión de planes PREMIUM.
 */

import { Op } from 'sequelize';
import db from '../../DataBase/db.js';
import PlanesModel from '../../Models/Plan/MD_TB_Planes.js';
// Benjamin Orellana - 2026/05/30 - Importa precios de planes para eliminarlos junto al plan.
import PlanesPreciosModel from '../../Models/Plan/MD_TB_PlanesPrecios.js';
const PERIODOS_VALIDOS = ['mensual', 'trimestral', 'semestral', 'anual'];

const CAMPOS_ORDEN_VALIDOS = [
  'id',
  'nombre',
  'codigo',
  'clases_por_mes',
  'cantidad_clases_periodo',
  'periodo',
  'duracion_dias',
  'permite_reserva',
  'permite_acumulacion',
  'activo',
  'created_at',
  'updated_at'
];

// Benjamin Orellana - 2026/05/29 - Normaliza paginación para listados de planes.
const obtenerPaginacion = (query) => {
  const page = Math.max(parseInt(query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit || '10', 10), 1), 100);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
};

// Benjamin Orellana - 2026/05/29 - Valida valores tipo TINYINT usados como booleanos.
const esTinyintValido = (valor) => {
  return valor === 0 || valor === 1 || valor === '0' || valor === '1';
};

// Benjamin Orellana - 2026/05/29 - Valida enteros obligatorios del modelo planes_planes.
const esEnteroValido = (valor) => {
  if (valor === null || valor === undefined || valor === '') return false;

  const numero = Number(valor);

  return Number.isInteger(numero) && numero >= 0;
};

// Benjamin Orellana - 2026/06/05 - Obtiene la fecha actual en formato DATE (YYYY-MM-DD)
const obtenerFechaActualDateOnly = () => {
  return new Date().toISOString().slice(0, 10);
};

// Benjamin Orellana - 2026/06/05 - Convierte valor a número o retorna null
const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;

  const numberValue = Number(value);

  return Number.isNaN(numberValue) ? null : numberValue;
};

// Benjamin Orellana - 2026/05/29 - Arma respuesta estándar de error.
const responderError = (res, status, message, data = null) => {
  return res.status(status).json({
    ok: false,
    message,
    data
  });
};

// Benjamin Orellana - 2026/05/29 - Valida payload de creación y edición de planes.
const validarPayloadPlan = (body, esCreacion = true) => {
  const errores = [];

  if (esCreacion || body.nombre !== undefined) {
    if (!body.nombre || String(body.nombre).trim() === '') {
      errores.push('El campo nombre es obligatorio.');
    }

    if (body.nombre && String(body.nombre).length > 120) {
      errores.push('El campo nombre no puede superar los 120 caracteres.');
    }
  }

  if (esCreacion || body.codigo !== undefined) {
    if (!body.codigo || String(body.codigo).trim() === '') {
      errores.push('El campo codigo es obligatorio.');
    }

    if (body.codigo && String(body.codigo).length > 80) {
      errores.push('El campo codigo no puede superar los 80 caracteres.');
    }
  }

  if (esCreacion || body.clases_por_mes !== undefined) {
    if (!esEnteroValido(body.clases_por_mes)) {
      errores.push('El campo clases_por_mes debe ser un número entero válido.');
    }
  }

  if (esCreacion || body.cantidad_clases_periodo !== undefined) {
    if (!esEnteroValido(body.cantidad_clases_periodo)) {
      errores.push(
        'El campo cantidad_clases_periodo debe ser un número entero válido.'
      );
    }
  }

  if (esCreacion || body.periodo !== undefined) {
    if (!body.periodo || !PERIODOS_VALIDOS.includes(body.periodo)) {
      errores.push(
        `El campo periodo debe ser uno de los siguientes valores: ${PERIODOS_VALIDOS.join(', ')}.`
      );
    }
  }

  if (esCreacion || body.duracion_dias !== undefined) {
    if (!esEnteroValido(body.duracion_dias)) {
      errores.push('El campo duracion_dias debe ser un número entero válido.');
    }
  }

  if (
    body.descripcion !== undefined &&
    body.descripcion !== null &&
    String(body.descripcion).length > 255
  ) {
    errores.push('El campo descripcion no puede superar los 255 caracteres.');
  }

  if (
    body.permite_reserva !== undefined &&
    !esTinyintValido(body.permite_reserva)
  ) {
    errores.push('El campo permite_reserva debe ser 0 o 1.');
  }

  if (
    body.permite_acumulacion !== undefined &&
    !esTinyintValido(body.permite_acumulacion)
  ) {
    errores.push('El campo permite_acumulacion debe ser 0 o 1.');
  }

  if (body.activo !== undefined && !esTinyintValido(body.activo)) {
    errores.push('El campo activo debe ser 0 o 1.');
  }

  return errores;
};

// Benjamin Orellana - 2026/05/29 - Lista planes con paginación y filtros.
export const OBR_Planes_CTS = async (req, res) => {
  try {
    const { page, limit, offset } = obtenerPaginacion(req.query);

    const {
      q,
      periodo,
      activo,
      permite_reserva,
      permite_acumulacion,
      clases_por_mes,
      order_by = 'id',
      order_direction = 'DESC'
    } = req.query;

    const where = {};

    if (q && String(q).trim() !== '') {
      where[Op.or] = [
        { nombre: { [Op.like]: `%${String(q).trim()}%` } },
        { codigo: { [Op.like]: `%${String(q).trim()}%` } },
        { descripcion: { [Op.like]: `%${String(q).trim()}%` } }
      ];
    }

    if (periodo) {
      if (!PERIODOS_VALIDOS.includes(periodo)) {
        return responderError(
          res,
          400,
          `El filtro periodo debe ser uno de los siguientes valores: ${PERIODOS_VALIDOS.join(', ')}.`
        );
      }

      where.periodo = periodo;
    }

    if (activo !== undefined) {
      if (!esTinyintValido(activo)) {
        return responderError(res, 400, 'El filtro activo debe ser 0 o 1.');
      }

      where.activo = Number(activo);
    }

    if (permite_reserva !== undefined) {
      if (!esTinyintValido(permite_reserva)) {
        return responderError(
          res,
          400,
          'El filtro permite_reserva debe ser 0 o 1.'
        );
      }

      where.permite_reserva = Number(permite_reserva);
    }

    if (permite_acumulacion !== undefined) {
      if (!esTinyintValido(permite_acumulacion)) {
        return responderError(
          res,
          400,
          'El filtro permite_acumulacion debe ser 0 o 1.'
        );
      }

      where.permite_acumulacion = Number(permite_acumulacion);
    }

    if (clases_por_mes !== undefined) {
      if (!esEnteroValido(clases_por_mes)) {
        return responderError(
          res,
          400,
          'El filtro clases_por_mes debe ser un número entero válido.'
        );
      }

      where.clases_por_mes = Number(clases_por_mes);
    }

    const campoOrden = CAMPOS_ORDEN_VALIDOS.includes(order_by)
      ? order_by
      : 'id';
    const direccionOrden =
      String(order_direction).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows } = await PlanesModel.findAndCountAll({
      where,
      limit,
      offset,
      order: [[campoOrden, direccionOrden]]
    });

    return res.status(200).json({
      ok: true,
      message: 'Planes obtenidos correctamente.',
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit),
      data: rows
    });
  } catch (error) {
    console.error('Error en OBR_Planes_CTS:', error);

    return responderError(res, 500, 'Error interno al obtener los planes.');
  }
};

// Benjamin Orellana - 2026/05/29 - Obtiene un plan por ID.
export const OBR_PlanPorId_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const plan = await PlanesModel.findByPk(id);

    if (!plan) {
      return responderError(res, 404, 'No se encontró el plan solicitado.');
    }

    return res.status(200).json({
      ok: true,
      message: 'Plan obtenido correctamente.',
      data: plan
    });
  } catch (error) {
    console.error('Error en OBR_PlanPorId_CTS:', error);

    return responderError(res, 500, 'Error interno al obtener el plan.');
  }
};

// Benjamin Orellana - 2026/06/01 - Lista pública de planes activos para formularios externos.
export const OBR_PlanesPublicos_CTS = async (req, res) => {
  try {
    const planes = await PlanesModel.findAll({
      attributes: ['id', 'nombre'],
      where: {
        activo: 1
      },
      order: [['id', 'ASC']]
    });

    return res.status(200).json({
      ok: true,
      message: 'Planes públicos obtenidos correctamente.',
      data: planes
    });
  } catch (error) {
    console.error('Error en OBR_PlanesPublicos_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener los planes públicos.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Crea un nuevo plan.
export const CR_Planes_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const errores = validarPayloadPlan(req.body, true);

    if (errores.length > 0) {
      await transaction.rollback();
      return responderError(res, 400, 'Hay errores de validación.', errores);
    }

    const {
      nombre,
      codigo,
      clases_por_mes,
      cantidad_clases_periodo,
      periodo,
      duracion_dias,
      descripcion,
      permite_reserva,
      permite_acumulacion,
      activo
    } = req.body;

    const codigo_normalizado = String(codigo).trim();

    const codigoExistente = await PlanesModel.findOne({
      where: {
        codigo: codigo_normalizado
      },
      transaction
    });

    if (codigoExistente) {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'Ya existe un plan registrado con ese codigo.'
      );
    }

    const nuevoPlan = await PlanesModel.create(
      {
        nombre: String(nombre).trim(),
        codigo: codigo_normalizado,
        clases_por_mes: Number(clases_por_mes),
        cantidad_clases_periodo: Number(cantidad_clases_periodo),
        periodo,
        duracion_dias: Number(duracion_dias),
        descripcion:
          descripcion !== undefined && descripcion !== null
            ? String(descripcion).trim()
            : null,
        permite_reserva:
          permite_reserva !== undefined ? Number(permite_reserva) : 1,
        permite_acumulacion:
          permite_acumulacion !== undefined ? Number(permite_acumulacion) : 0,
        activo: activo !== undefined ? Number(activo) : 1
      },
      { transaction }
    );

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      message: 'Plan creado correctamente.',
      data: nuevoPlan
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en CR_Planes_CTS:', error);

    if (error?.name === 'SequelizeUniqueConstraintError') {
      return responderError(
        res,
        409,
        'Ya existe un plan registrado con ese codigo.'
      );
    }

    return responderError(res, 500, 'Error interno al crear el plan.');
  }
};

// Benjamin Orellana - 2026/05/29 - Actualiza un plan existente.
export const UR_Planes_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const plan = await PlanesModel.findByPk(id, { transaction });

    if (!plan) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el plan solicitado.');
    }

    const errores = validarPayloadPlan(req.body, false);

    if (errores.length > 0) {
      await transaction.rollback();
      return responderError(res, 400, 'Hay errores de validación.', errores);
    }

    const datosActualizar = {};

    if (req.body.nombre !== undefined) {
      datosActualizar.nombre = String(req.body.nombre).trim();
    }

    if (req.body.codigo !== undefined) {
      const codigo_normalizado = String(req.body.codigo).trim();

      const codigoExistente = await PlanesModel.findOne({
        where: {
          codigo: codigo_normalizado,
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
          'Ya existe otro plan registrado con ese codigo.'
        );
      }

      datosActualizar.codigo = codigo_normalizado;
    }

    if (req.body.clases_por_mes !== undefined) {
      datosActualizar.clases_por_mes = Number(req.body.clases_por_mes);
    }

    if (req.body.cantidad_clases_periodo !== undefined) {
      datosActualizar.cantidad_clases_periodo = Number(
        req.body.cantidad_clases_periodo
      );
    }

    if (req.body.periodo !== undefined) {
      datosActualizar.periodo = req.body.periodo;
    }

    if (req.body.duracion_dias !== undefined) {
      datosActualizar.duracion_dias = Number(req.body.duracion_dias);
    }

    if (req.body.descripcion !== undefined) {
      datosActualizar.descripcion =
        req.body.descripcion !== null
          ? String(req.body.descripcion).trim()
          : null;
    }

    if (req.body.permite_reserva !== undefined) {
      datosActualizar.permite_reserva = Number(req.body.permite_reserva);
    }

    if (req.body.permite_acumulacion !== undefined) {
      datosActualizar.permite_acumulacion = Number(
        req.body.permite_acumulacion
      );
    }

    if (req.body.activo !== undefined) {
      datosActualizar.activo = Number(req.body.activo);
    }

    datosActualizar.updated_at = new Date();

    await plan.update(datosActualizar, { transaction });

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Plan actualizado correctamente.',
      data: plan
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_Planes_CTS:', error);

    if (error?.name === 'SequelizeUniqueConstraintError') {
      return responderError(
        res,
        409,
        'Ya existe un plan registrado con ese codigo.'
      );
    }

    return responderError(res, 500, 'Error interno al actualizar el plan.');
  }
};

// Benjamin Orellana - 2026/05/29 - Actualiza el estado activo de un plan.
export const UR_EstadoPlanes_CTS = async (req, res) => {
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

    const plan = await PlanesModel.findByPk(id, { transaction });

    if (!plan) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el plan solicitado.');
    }

    await plan.update(
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
          ? 'Plan activado correctamente.'
          : 'Plan desactivado correctamente.',
      data: plan
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_EstadoPlanes_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al actualizar el estado del plan.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Desactiva un plan mediante baja lógica.
export const DR_Planes_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const plan = await PlanesModel.findByPk(id, { transaction });

    if (!plan) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el plan solicitado.');
    }

    await plan.update(
      {
        activo: 0,
        updated_at: new Date()
      },
      { transaction }
    );

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Plan desactivado correctamente.',
      data: plan
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en DR_Planes_CTS:', error);

    return responderError(res, 500, 'Error interno al desactivar el plan.');
  }
};

// Benjamin Orellana - 2026/05/30 - Elimina físicamente un plan y sus precios asociados dentro de una transacción.
export const ER_Planes_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const plan = await PlanesModel.findByPk(id, { transaction });

    if (!plan) {
      await transaction.rollback();

      return responderError(res, 404, 'No se encontró el plan solicitado.');
    }

    const preciosEliminados = await PlanesPreciosModel.destroy({
      where: {
        plan_id: Number(id)
      },
      transaction
    });

    await plan.destroy({ transaction });

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message:
        preciosEliminados > 0
          ? 'Plan eliminado físicamente correctamente junto con sus precios asociados.'
          : 'Plan eliminado físicamente correctamente. No tenía precios asociados.',
      data: {
        id: Number(id),
        precios_eliminados: preciosEliminados
      }
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en ER_Planes_CTS:', error);

    if (error?.name === 'SequelizeForeignKeyConstraintError') {
      return responderError(
        res,
        409,
        'No se puede eliminar físicamente el plan porque tiene registros relacionados.'
      );
    }

    return responderError(
      res,
      500,
      'Error interno al eliminar físicamente el plan.'
    );
  }
};
/*
 * Benjamin Orellana - 2026/06/05 - Lista planes con filtro opcional por sede
 * Si no envía sede_id: devuelve TODOS los planes
 * Si envía sede_id: devuelve solo planes que tienen precio vigente en esa sede
 */
export const OBR_PlanesConPrecios_CTS = async (req, res) => {
  try {
    const { sede_id, fecha_consulta = obtenerFechaActualDateOnly() } = req.query;

    console.log('=== [OBR_PlanesConPrecios_CTS] sede_id:', sede_id);
    console.log('=== [OBR_PlanesConPrecios_CTS] fecha_consulta:', fecha_consulta);

    // CASO 1: Sin sede_id - devuelve TODOS los planes activos
    if (!sede_id) {
      console.log('=== [OBR_PlanesConPrecios_CTS] Devolviendo TODOS los planes');
      
      const planes = await PlanesModel.findAll({
        where: {
          activo: 1
        },
        order: [['id', 'ASC']]
      });

      return res.status(200).json({
        ok: true,
        message: 'Planes obtenidos correctamente.',
        total: planes.length,
        data: planes
      });
    }

    // CASO 2: Con sede_id - devuelve SOLO planes con precio vigente en esa sede
    const sedeIdNum = toNumberOrNull(sede_id);

    if (!sedeIdNum) {
      return res.status(400).json({
        ok: false,
        message: 'El parámetro sede_id debe ser un número válido.'
      });
    }

    console.log('=== [OBR_PlanesConPrecios] Buscando planes con precio vigente para sede:', sedeIdNum);

    // Buscar planes que tienen precio vigente en esa sede
    const planes = await PlanesModel.findAll({
      where: {
        activo: 1
      },
      include: [
        {
          model: PlanesPreciosModel,
          as: 'precios',
          where: {
            sede_id: sedeIdNum,
            activo: 1,
            fecha_desde: {
              [Op.lte]: fecha_consulta  // fecha_desde <= fecha_consulta
            },
            [Op.or]: [
              { fecha_hasta: null },  // Sin fecha fin (vigente indefinidamente)
              { fecha_hasta: { [Op.gte]: fecha_consulta } }  // O fecha_hasta >= fecha_consulta
            ]
          },
          attributes: ['id', 'precio', 'moneda', 'fecha_desde', 'fecha_hasta', 'activo'],
          required: true  // INNER JOIN - solo planes con precio vigente
        }
      ],
      order: [['id', 'ASC']]
    });

    console.log('=== [OBR_PlanesConPrecios] Planes encontrados:', planes.length);

    return res.status(200).json({
      ok: true,
      message: 'Planes obtenidos correctamente.',
      total: planes.length,
      sede_id: sedeIdNum,
      fecha_consulta: fecha_consulta,
      data: planes
    });
  } catch (error) {
    console.error('=== [OBR_PlanesConPrecios] ERROR ===', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener los planes.'
    });
  }
};