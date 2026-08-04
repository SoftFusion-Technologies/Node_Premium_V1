/*
 * Benjamin Orellana - 2026/05/29 - Controlador Sequelize para membresías de alumnos PREMIUM.
 */

import { Op } from 'sequelize';
import db from '../../DataBase/db.js';

import AlumnosMembresiasModel from '../../Models/Alumno/MD_TB_AlumnosMembresias.js';
import AlumnosModel from '../../Models/Alumno/MD_TB_Alumnos.js';
import PlanesModel from '../../Models/Plan/MD_TB_Planes.js';
import SedesModel from '../../Models/Sede/MD_TB_Sedes.js';
import { copiarRestriccionesPlan } from '../../Services/Agenda/agendaRestricciones.service.js';
import { imputarReservasPendientesMembresia } from '../../Services/Agenda/reservasPendientes.service.js';

const ESTADOS_MEMBRESIA_VALIDOS = [
  'pendiente_pago',
  'activa',
  'vencida',
  'cancelada',
  'congelada'
];

const ORIGENES_ALTA_VALIDOS = ['administracion', 'web', 'app', 'migracion'];

const CAMPOS_ORDEN_VALIDOS = [
  'id',
  'alumno_id',
  'plan_id',
  'sede_id',
  'fecha_inicio',
  'fecha_vencimiento',
  'estado',
  'precio_lista',
  'descuento_valor',
  'descuento_porcentaje',
  'precio_final',
  'clases_incluidas',
  'clases_usadas',
  'clases_disponibles',
  'origen_alta',
  'created_at',
  'updated_at'
];

// Benjamin Orellana - 2026/05/29 - Normaliza paginación para listados de membresías.
const obtenerPaginacion = (query) => {
  const page = Math.max(parseInt(query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit || '10', 10), 1), 100);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
};

// Benjamin Orellana - 2026/05/29 - Valida IDs numéricos.
const esIdValido = (valor) => {
  if (valor === null || valor === undefined || valor === '') return false;

  const numero = Number(valor);

  return Number.isInteger(numero) && numero > 0;
};

// Benjamin Orellana - 2026/05/29 - Valida enteros para clases.
const esEnteroValido = (valor) => {
  if (valor === null || valor === undefined || valor === '') return false;

  const numero = Number(valor);

  return Number.isInteger(numero) && numero >= 0;
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

// Benjamin Orellana - 2026/05/29 - Obtiene fecha actual en formato DATEONLY.
const obtenerFechaActualDateOnly = () => {
  return new Date().toISOString().slice(0, 10);
};

// Benjamin Orellana - 2026/05/29 - Arma respuesta estándar de error.
const responderError = (res, status, message, data = null) => {
  return res.status(status).json({
    ok: false,
    message,
    data
  });
};

// Benjamin Orellana - 2026/05/29 - Include permitido según relaciones reales del módulo Alumno.
const includeMembresia = [
  {
    model: AlumnosModel,
    as: 'alumno'
  },
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
    as: 'sede'
  }
];

// Benjamin Orellana - 2026/05/29 - Calcula precio final si no se envía explícitamente.
const calcularPrecioFinal = (
  precioLista,
  descuentoValor,
  descuentoPorcentaje
) => {
  const precio = Number(precioLista || 0);
  const descuentoMonto = Number(descuentoValor || 0);
  const porcentaje = Number(descuentoPorcentaje || 0);

  const descuentoPorPorcentaje = precio * (porcentaje / 100);
  const resultado = precio - descuentoMonto - descuentoPorPorcentaje;

  return Math.max(resultado, 0).toFixed(2);
};

// Benjamin Orellana - 2026/05/29 - Calcula clases disponibles si no se envía explícitamente.
const calcularClasesDisponibles = (clasesIncluidas, clasesUsadas) => {
  const incluidas = Number(clasesIncluidas || 0);
  const usadas = Number(clasesUsadas || 0);

  return Math.max(incluidas - usadas, 0);
};

// Benjamin Orellana - 2026/05/29 - Valida payload de creación y edición de membresías.
const validarPayloadMembresia = (body, esCreacion = true) => {
  const errores = [];

  if (esCreacion || body.alumno_id !== undefined) {
    if (!esIdValido(body.alumno_id)) {
      errores.push(
        'El campo alumno_id es obligatorio y debe ser un ID válido.'
      );
    }
  }

  if (esCreacion || body.plan_id !== undefined) {
    if (!esIdValido(body.plan_id)) {
      errores.push('El campo plan_id es obligatorio y debe ser un ID válido.');
    }
  }

  if (esCreacion || body.sede_id !== undefined) {
    if (!esIdValido(body.sede_id)) {
      errores.push('El campo sede_id es obligatorio y debe ser un ID válido.');
    }
  }

  if (esCreacion || body.fecha_inicio !== undefined) {
    if (!esFechaDateOnlyValida(body.fecha_inicio)) {
      errores.push(
        'El campo fecha_inicio es obligatorio y debe tener formato YYYY-MM-DD.'
      );
    }
  }

  if (esCreacion || body.fecha_vencimiento !== undefined) {
    if (!esFechaDateOnlyValida(body.fecha_vencimiento)) {
      errores.push(
        'El campo fecha_vencimiento es obligatorio y debe tener formato YYYY-MM-DD.'
      );
    }
  }

  if (
    body.fecha_inicio &&
    body.fecha_vencimiento &&
    esFechaDateOnlyValida(body.fecha_inicio) &&
    esFechaDateOnlyValida(body.fecha_vencimiento) &&
    body.fecha_vencimiento < body.fecha_inicio
  ) {
    errores.push(
      'El campo fecha_vencimiento no puede ser menor que fecha_inicio.'
    );
  }

  if (
    body.estado !== undefined &&
    !ESTADOS_MEMBRESIA_VALIDOS.includes(body.estado)
  ) {
    errores.push(
      `El campo estado debe ser uno de los siguientes valores: ${ESTADOS_MEMBRESIA_VALIDOS.join(', ')}.`
    );
  }

  if (body.precio_lista !== undefined && !esImporteValido(body.precio_lista)) {
    errores.push(
      'El campo precio_lista debe ser un importe válido mayor o igual a 0.'
    );
  }

  if (
    body.descuento_valor !== undefined &&
    !esImporteValido(body.descuento_valor)
  ) {
    errores.push(
      'El campo descuento_valor debe ser un importe válido mayor o igual a 0.'
    );
  }

  if (
    body.descuento_porcentaje !== undefined &&
    !esImporteValido(body.descuento_porcentaje)
  ) {
    errores.push(
      'El campo descuento_porcentaje debe ser un número válido mayor o igual a 0.'
    );
  }

  if (body.precio_final !== undefined && !esImporteValido(body.precio_final)) {
    errores.push(
      'El campo precio_final debe ser un importe válido mayor o igual a 0.'
    );
  }

  if (
    body.clases_incluidas !== undefined &&
    !esEnteroValido(body.clases_incluidas)
  ) {
    errores.push('El campo clases_incluidas debe ser un número entero válido.');
  }

  if (body.clases_usadas !== undefined && !esEnteroValido(body.clases_usadas)) {
    errores.push('El campo clases_usadas debe ser un número entero válido.');
  }

  if (
    body.clases_disponibles !== undefined &&
    !esEnteroValido(body.clases_disponibles)
  ) {
    errores.push(
      'El campo clases_disponibles debe ser un número entero válido.'
    );
  }

  if (
    body.clases_incluidas !== undefined &&
    body.clases_usadas !== undefined &&
    esEnteroValido(body.clases_incluidas) &&
    esEnteroValido(body.clases_usadas) &&
    Number(body.clases_usadas) > Number(body.clases_incluidas)
  ) {
    errores.push(
      'El campo clases_usadas no puede ser mayor que clases_incluidas.'
    );
  }

  if (
    body.origen_alta !== undefined &&
    !ORIGENES_ALTA_VALIDOS.includes(body.origen_alta)
  ) {
    errores.push(
      `El campo origen_alta debe ser uno de los siguientes valores: ${ORIGENES_ALTA_VALIDOS.join(', ')}.`
    );
  }

  return errores;
};

// Benjamin Orellana - 2026/05/29 - Lista membresías con filtros y paginación.
export const OBR_AlumnosMembresias_CTS = async (req, res) => {
  try {
    const { page, limit, offset } = obtenerPaginacion(req.query);

    const {
      q,
      alumno_id,
      plan_id,
      sede_id,
      estado,
      origen_alta,
      fecha_inicio_desde,
      fecha_inicio_hasta,
      vencimiento_desde,
      vencimiento_hasta,
      order_by = 'id',
      order_direction = 'DESC'
    } = req.query;

    const where = {};

    if (q && String(q).trim() !== '') {
      where.observaciones = {
        [Op.like]: `%${String(q).trim()}%`
      };
    }

    if (alumno_id !== undefined) {
      if (!esIdValido(alumno_id)) {
        return responderError(
          res,
          400,
          'El filtro alumno_id debe ser un ID válido.'
        );
      }

      where.alumno_id = Number(alumno_id);
    }

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
      if (!esIdValido(sede_id)) {
        return responderError(
          res,
          400,
          'El filtro sede_id debe ser un ID válido.'
        );
      }

      where.sede_id = Number(sede_id);
    }

    if (estado !== undefined) {
      if (!ESTADOS_MEMBRESIA_VALIDOS.includes(estado)) {
        return responderError(
          res,
          400,
          `El filtro estado debe ser uno de los siguientes valores: ${ESTADOS_MEMBRESIA_VALIDOS.join(', ')}.`
        );
      }

      where.estado = estado;
    }

    if (origen_alta !== undefined) {
      if (!ORIGENES_ALTA_VALIDOS.includes(origen_alta)) {
        return responderError(
          res,
          400,
          `El filtro origen_alta debe ser uno de los siguientes valores: ${ORIGENES_ALTA_VALIDOS.join(', ')}.`
        );
      }

      where.origen_alta = origen_alta;
    }

    if (fecha_inicio_desde || fecha_inicio_hasta) {
      where.fecha_inicio = {};

      if (fecha_inicio_desde) {
        if (!esFechaDateOnlyValida(fecha_inicio_desde)) {
          return responderError(
            res,
            400,
            'El filtro fecha_inicio_desde debe tener formato YYYY-MM-DD.'
          );
        }

        where.fecha_inicio[Op.gte] = fecha_inicio_desde;
      }

      if (fecha_inicio_hasta) {
        if (!esFechaDateOnlyValida(fecha_inicio_hasta)) {
          return responderError(
            res,
            400,
            'El filtro fecha_inicio_hasta debe tener formato YYYY-MM-DD.'
          );
        }

        where.fecha_inicio[Op.lte] = fecha_inicio_hasta;
      }
    }

    if (vencimiento_desde || vencimiento_hasta) {
      where.fecha_vencimiento = {};

      if (vencimiento_desde) {
        if (!esFechaDateOnlyValida(vencimiento_desde)) {
          return responderError(
            res,
            400,
            'El filtro vencimiento_desde debe tener formato YYYY-MM-DD.'
          );
        }

        where.fecha_vencimiento[Op.gte] = vencimiento_desde;
      }

      if (vencimiento_hasta) {
        if (!esFechaDateOnlyValida(vencimiento_hasta)) {
          return responderError(
            res,
            400,
            'El filtro vencimiento_hasta debe tener formato YYYY-MM-DD.'
          );
        }

        where.fecha_vencimiento[Op.lte] = vencimiento_hasta;
      }
    }

    const campoOrden = CAMPOS_ORDEN_VALIDOS.includes(order_by)
      ? order_by
      : 'id';
    const direccionOrden =
      String(order_direction).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows } = await AlumnosMembresiasModel.findAndCountAll({
      where,
      include: includeMembresia,
      limit,
      offset,
      order: [[campoOrden, direccionOrden]]
    });

    return res.status(200).json({
      ok: true,
      message: 'Membresías obtenidas correctamente.',
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit),
      data: rows
    });
  } catch (error) {
    console.error('Error en OBR_AlumnosMembresias_CTS:', error);

    return responderError(res, 500, 'Error interno al obtener las membresías.');
  }
};

// Benjamin Orellana - 2026/05/29 - Obtiene una membresía por ID.
export const OBR_MembresiaPorId_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const membresia = await AlumnosMembresiasModel.findByPk(id, {
      include: includeMembresia
    });

    if (!membresia) {
      return responderError(
        res,
        404,
        'No se encontró la membresía solicitada.'
      );
    }

    return res.status(200).json({
      ok: true,
      message: 'Membresía obtenida correctamente.',
      data: membresia
    });
  } catch (error) {
    console.error('Error en OBR_MembresiaPorId_CTS:', error);

    return responderError(res, 500, 'Error interno al obtener la membresía.');
  }
};

// Benjamin Orellana - 2026/05/29 - Lista membresías por alumno.
export const OBR_MembresiasPorAlumno_CTS = async (req, res) => {
  try {
    const { alumno_id } = req.params;
    const { page, limit, offset } = obtenerPaginacion(req.query);
    const { estado } = req.query;

    if (!esIdValido(alumno_id)) {
      return responderError(
        res,
        400,
        'El parámetro alumno_id debe ser un ID válido.'
      );
    }

    const where = {
      alumno_id: Number(alumno_id)
    };

    if (estado !== undefined) {
      if (!ESTADOS_MEMBRESIA_VALIDOS.includes(estado)) {
        return responderError(
          res,
          400,
          `El filtro estado debe ser uno de los siguientes valores: ${ESTADOS_MEMBRESIA_VALIDOS.join(', ')}.`
        );
      }

      where.estado = estado;
    }

    const { count, rows } = await AlumnosMembresiasModel.findAndCountAll({
      where,
      include: includeMembresia,
      limit,
      offset,
      order: [
        ['fecha_inicio', 'DESC'],
        ['id', 'DESC']
      ]
    });

    return res.status(200).json({
      ok: true,
      message: 'Membresías del alumno obtenidas correctamente.',
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit),
      data: rows
    });
  } catch (error) {
    console.error('Error en OBR_MembresiasPorAlumno_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener las membresías del alumno.'
    );
  }
};

// Benjamin Orellana - 2026/07/13 - Lista el historial de membresías del
// alumno autenticado. El ID se toma del token ALUMNO y no desde la URL.
export const OBR_MisMembresias_CTS = async (req, res) => {
  const alumnoId = req.alumno?.id || req.alumno?.alumno_id;

  if (!esIdValido(alumnoId)) {
    return responderError(
      res,
      401,
      'No se pudo identificar al alumno autenticado.'
    );
  }

  req.params = {
    ...req.params,
    alumno_id: Number(alumnoId)
  };

  return OBR_MembresiasPorAlumno_CTS(req, res);
};

// Benjamin Orellana - 2026/06/15 - Obtiene la membresía operativa vigente de un alumno.
export const OBR_MembresiaActivaAlumno_CTS = async (req, res) => {
  try {
    const { alumno_id } = req.params;
    const fecha = req.query.fecha || obtenerFechaActualDateOnly();

    if (!esIdValido(alumno_id)) {
      return responderError(
        res,
        400,
        'El parámetro alumno_id debe ser un ID válido.'
      );
    }

    if (!esFechaDateOnlyValida(fecha)) {
      return responderError(
        res,
        400,
        'El filtro fecha debe tener formato YYYY-MM-DD.'
      );
    }

    const membresia = await AlumnosMembresiasModel.findOne({
      where: {
        alumno_id: Number(alumno_id),
        estado: {
          [Op.in]: ['activa', 'pendiente_pago', 'congelada']
        },
        fecha_inicio: {
          [Op.lte]: fecha
        },
        fecha_vencimiento: {
          [Op.gte]: fecha
        }
      },
      include: includeMembresia,
      order: [
        ['fecha_inicio', 'DESC'],
        ['id', 'DESC']
      ]
    });

    if (!membresia) {
      return responderError(
        res,
        404,
        'No se encontró una membresía operativa vigente para el alumno solicitado.'
      );
    }

    return res.status(200).json({
      ok: true,
      message: 'Membresía operativa vigente del alumno obtenida correctamente.',
      data: membresia
    });
  } catch (error) {
    console.error('Error en OBR_MembresiaActivaAlumno_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener la membresía operativa vigente del alumno.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Crea una nueva membresía de alumno.
export const CR_AlumnosMembresias_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const errores = validarPayloadMembresia(req.body, true);

    if (errores.length > 0) {
      await transaction.rollback();
      return responderError(res, 400, 'Hay errores de validación.', errores);
    }

    const {
      alumno_id,
      plan_id,
      sede_id,
      fecha_inicio,
      fecha_vencimiento,
      estado,
      precio_lista,
      descuento_valor,
      descuento_porcentaje,
      precio_final,
      clases_incluidas,
      clases_usadas,
      clases_disponibles,
      origen_alta,
      observaciones
    } = req.body;

    const alumno = await AlumnosModel.findByPk(alumno_id, { transaction });

    if (!alumno) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró el alumno indicado en alumno_id.'
      );
    }

    const plan = await PlanesModel.findByPk(plan_id, { transaction });

    if (!plan) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró el plan indicado en plan_id.'
      );
    }

    const sede = await SedesModel.findByPk(sede_id, { transaction });

    if (!sede) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró la sede indicada en sede_id.'
      );
    }

    const precioListaNormalizado =
      precio_lista !== undefined ? Number(precio_lista) : 0;
    const descuentoValorNormalizado =
      descuento_valor !== undefined ? Number(descuento_valor) : 0;
    const descuentoPorcentajeNormalizado =
      descuento_porcentaje !== undefined ? Number(descuento_porcentaje) : 0;

    const clasesIncluidasNormalizadas =
      clases_incluidas !== undefined ? Number(clases_incluidas) : 0;

    const clasesUsadasNormalizadas =
      clases_usadas !== undefined ? Number(clases_usadas) : 0;

    const precioFinalNormalizado =
      precio_final !== undefined
        ? Number(precio_final).toFixed(2)
        : calcularPrecioFinal(
            precioListaNormalizado,
            descuentoValorNormalizado,
            descuentoPorcentajeNormalizado
          );

    const clasesDisponiblesNormalizadas =
      clases_disponibles !== undefined
        ? Number(clases_disponibles)
        : calcularClasesDisponibles(
            clasesIncluidasNormalizadas,
            clasesUsadasNormalizadas
          );

    const nuevaMembresia = await AlumnosMembresiasModel.create(
      {
        alumno_id: Number(alumno_id),
        plan_id: Number(plan_id),
        sede_id: Number(sede_id),
        fecha_inicio,
        fecha_vencimiento,
        estado: estado || 'pendiente_pago',
        precio_lista: precioListaNormalizado.toFixed(2),
        descuento_valor: descuentoValorNormalizado.toFixed(2),
        descuento_porcentaje: descuentoPorcentajeNormalizado.toFixed(2),
        precio_final: precioFinalNormalizado,
        clases_incluidas: clasesIncluidasNormalizadas,
        clases_usadas: clasesUsadasNormalizadas,
        clases_disponibles: clasesDisponiblesNormalizadas,
        origen_alta: origen_alta || 'administracion',
        agenda_restricciones: await copiarRestriccionesPlan({ planId: plan_id, transaction }),
        observaciones:
          observaciones !== undefined && observaciones !== null
            ? String(observaciones).trim()
            : null
      },
      { transaction }
    );

    if (nuevaMembresia.estado === 'activa') {
      await imputarReservasPendientesMembresia({ membresia: nuevaMembresia, transaction });
    }

    await transaction.commit();

    const membresiaCompleta = await AlumnosMembresiasModel.findByPk(
      nuevaMembresia.id,
      {
        include: includeMembresia
      }
    );

    return res.status(201).json({
      ok: true,
      message: 'Membresía creada correctamente.',
      data: membresiaCompleta
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en CR_AlumnosMembresias_CTS:', error);

    return responderError(res, 500, 'Error interno al crear la membresía.');
  }
};

// Benjamin Orellana - 2026/05/29 - Actualiza una membresía existente.
export const UR_AlumnosMembresias_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const membresia = await AlumnosMembresiasModel.findByPk(id, {
      transaction
    });

    if (!membresia) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró la membresía solicitada.'
      );
    }

    const errores = validarPayloadMembresia(req.body, false);

    if (errores.length > 0) {
      await transaction.rollback();
      return responderError(res, 400, 'Hay errores de validación.', errores);
    }

    const datosActualizar = {};

    if (req.body.alumno_id !== undefined) {
      const alumno = await AlumnosModel.findByPk(req.body.alumno_id, {
        transaction
      });

      if (!alumno) {
        await transaction.rollback();
        return responderError(
          res,
          404,
          'No se encontró el alumno indicado en alumno_id.'
        );
      }

      datosActualizar.alumno_id = Number(req.body.alumno_id);
    }

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
      datosActualizar.agenda_restricciones = await copiarRestriccionesPlan({
        planId: req.body.plan_id,
        transaction
      });
    }

    if (req.body.sede_id !== undefined) {
      const sede = await SedesModel.findByPk(req.body.sede_id, { transaction });

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

    if (req.body.fecha_inicio !== undefined) {
      datosActualizar.fecha_inicio = req.body.fecha_inicio;
    }

    if (req.body.fecha_vencimiento !== undefined) {
      datosActualizar.fecha_vencimiento = req.body.fecha_vencimiento;
    }

    if (req.body.estado !== undefined) {
      datosActualizar.estado = req.body.estado;
    }

    if (req.body.precio_lista !== undefined) {
      datosActualizar.precio_lista = Number(req.body.precio_lista).toFixed(2);
    }

    if (req.body.descuento_valor !== undefined) {
      datosActualizar.descuento_valor = Number(
        req.body.descuento_valor
      ).toFixed(2);
    }

    if (req.body.descuento_porcentaje !== undefined) {
      datosActualizar.descuento_porcentaje = Number(
        req.body.descuento_porcentaje
      ).toFixed(2);
    }

    if (req.body.precio_final !== undefined) {
      datosActualizar.precio_final = Number(req.body.precio_final).toFixed(2);
    }

    if (req.body.clases_incluidas !== undefined) {
      datosActualizar.clases_incluidas = Number(req.body.clases_incluidas);
    }

    if (req.body.clases_usadas !== undefined) {
      datosActualizar.clases_usadas = Number(req.body.clases_usadas);
    }

    if (req.body.clases_disponibles !== undefined) {
      datosActualizar.clases_disponibles = Number(req.body.clases_disponibles);
    }

    if (req.body.origen_alta !== undefined) {
      datosActualizar.origen_alta = req.body.origen_alta;
    }

    if (req.body.observaciones !== undefined) {
      datosActualizar.observaciones =
        req.body.observaciones !== null
          ? String(req.body.observaciones).trim()
          : null;
    }

    if (
      req.body.precio_final === undefined &&
      (req.body.precio_lista !== undefined ||
        req.body.descuento_valor !== undefined ||
        req.body.descuento_porcentaje !== undefined)
    ) {
      const precioListaBase =
        datosActualizar.precio_lista !== undefined
          ? datosActualizar.precio_lista
          : membresia.precio_lista;

      const descuentoValorBase =
        datosActualizar.descuento_valor !== undefined
          ? datosActualizar.descuento_valor
          : membresia.descuento_valor;

      const descuentoPorcentajeBase =
        datosActualizar.descuento_porcentaje !== undefined
          ? datosActualizar.descuento_porcentaje
          : membresia.descuento_porcentaje;

      datosActualizar.precio_final = calcularPrecioFinal(
        precioListaBase,
        descuentoValorBase,
        descuentoPorcentajeBase
      );
    }

    if (
      req.body.clases_disponibles === undefined &&
      (req.body.clases_incluidas !== undefined ||
        req.body.clases_usadas !== undefined)
    ) {
      const clasesIncluidasBase =
        datosActualizar.clases_incluidas !== undefined
          ? datosActualizar.clases_incluidas
          : membresia.clases_incluidas;

      const clasesUsadasBase =
        datosActualizar.clases_usadas !== undefined
          ? datosActualizar.clases_usadas
          : membresia.clases_usadas;

      datosActualizar.clases_disponibles = calcularClasesDisponibles(
        clasesIncluidasBase,
        clasesUsadasBase
      );
    }

    datosActualizar.updated_at = new Date();

    await membresia.update(datosActualizar, { transaction });

    if (membresia.estado === 'activa') {
      await imputarReservasPendientesMembresia({ membresia, transaction });
    }

    await transaction.commit();

    const membresiaActualizada = await AlumnosMembresiasModel.findByPk(id, {
      include: includeMembresia
    });

    return res.status(200).json({
      ok: true,
      message: 'Membresía actualizada correctamente.',
      data: membresiaActualizada
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_AlumnosMembresias_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al actualizar la membresía.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Actualiza el estado de una membresía.
export const UR_EstadoMembresia_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado || !ESTADOS_MEMBRESIA_VALIDOS.includes(estado)) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        `El campo estado es obligatorio y debe ser uno de los siguientes valores: ${ESTADOS_MEMBRESIA_VALIDOS.join(', ')}.`
      );
    }

    const membresia = await AlumnosMembresiasModel.findByPk(id, {
      transaction
    });

    if (!membresia) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró la membresía solicitada.'
      );
    }

    await membresia.update(
      {
        estado,
        updated_at: new Date()
      },
      { transaction }
    );

    if (estado === 'activa') {
      await imputarReservasPendientesMembresia({ membresia, transaction });
    }

    await transaction.commit();

    const membresiaActualizada = await AlumnosMembresiasModel.findByPk(id, {
      include: includeMembresia
    });

    return res.status(200).json({
      ok: true,
      message: 'Estado de membresía actualizado correctamente.',
      data: membresiaActualizada
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_EstadoMembresia_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al actualizar el estado de la membresía.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Congela una membresía.
export const UR_CongelarMembresia_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;
    const { observaciones } = req.body;

    const membresia = await AlumnosMembresiasModel.findByPk(id, {
      transaction
    });

    if (!membresia) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró la membresía solicitada.'
      );
    }

    await membresia.update(
      {
        estado: 'congelada',
        observaciones:
          observaciones !== undefined && observaciones !== null
            ? String(observaciones).trim()
            : membresia.observaciones,
        updated_at: new Date()
      },
      { transaction }
    );

    await transaction.commit();

    const membresiaActualizada = await AlumnosMembresiasModel.findByPk(id, {
      include: includeMembresia
    });

    return res.status(200).json({
      ok: true,
      message: 'Membresía congelada correctamente.',
      data: membresiaActualizada
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_CongelarMembresia_CTS:', error);

    return responderError(res, 500, 'Error interno al congelar la membresía.');
  }
};

// Benjamin Orellana - 2026/05/29 - Reactiva una membresía congelada.
export const UR_ReactivarMembresia_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;
    const { estado, observaciones } = req.body;

    const estadoDestino = estado || 'activa';

    if (!['activa', 'pendiente_pago'].includes(estadoDestino)) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El campo estado solo puede ser activa o pendiente_pago al reactivar una membresía.'
      );
    }

    const membresia = await AlumnosMembresiasModel.findByPk(id, {
      transaction
    });

    if (!membresia) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró la membresía solicitada.'
      );
    }

    await membresia.update(
      {
        estado: estadoDestino,
        observaciones:
          observaciones !== undefined && observaciones !== null
            ? String(observaciones).trim()
            : membresia.observaciones,
        updated_at: new Date()
      },
      { transaction }
    );

    if (estadoDestino === 'activa') {
      await imputarReservasPendientesMembresia({ membresia, transaction });
    }

    await transaction.commit();

    const membresiaActualizada = await AlumnosMembresiasModel.findByPk(id, {
      include: includeMembresia
    });

    return res.status(200).json({
      ok: true,
      message: 'Membresía reactivada correctamente.',
      data: membresiaActualizada
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_ReactivarMembresia_CTS:', error);

    return responderError(res, 500, 'Error interno al reactivar la membresía.');
  }
};

// Benjamin Orellana - 2026/05/29 - Cancela una membresía mediante baja lógica.
export const DR_AlumnosMembresias_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;
    const { observaciones } = req.body;

    const membresia = await AlumnosMembresiasModel.findByPk(id, {
      transaction
    });

    if (!membresia) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró la membresía solicitada.'
      );
    }

    await membresia.update(
      {
        estado: 'cancelada',
        observaciones:
          observaciones !== undefined && observaciones !== null
            ? String(observaciones).trim()
            : membresia.observaciones,
        updated_at: new Date()
      },
      { transaction }
    );

    await transaction.commit();

    const membresiaActualizada = await AlumnosMembresiasModel.findByPk(id, {
      include: includeMembresia
    });

    return res.status(200).json({
      ok: true,
      message: 'Membresía cancelada correctamente.',
      data: membresiaActualizada
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en DR_AlumnosMembresias_CTS:', error);

    return responderError(res, 500, 'Error interno al cancelar la membresía.');
  }
};

// Benjamin Orellana - 2026/05/29 - Elimina físicamente una membresía de la tabla alumnos_membresias.
export const ER_AlumnosMembresias_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const membresia = await AlumnosMembresiasModel.findByPk(id, {
      transaction
    });

    if (!membresia) {
      await transaction.rollback();

      return responderError(
        res,
        404,
        'No se encontró la membresía solicitada.'
      );
    }

    await membresia.destroy({ transaction });

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Membresía eliminada físicamente correctamente.',
      data: {
        id: Number(id)
      }
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en ER_AlumnosMembresias_CTS:', error);

    if (error?.name === 'SequelizeForeignKeyConstraintError') {
      return responderError(
        res,
        409,
        'No se puede eliminar físicamente la membresía porque tiene registros relacionados.'
      );
    }

    return responderError(
      res,
      500,
      'Error interno al eliminar físicamente la membresía.'
    );
  }
};
