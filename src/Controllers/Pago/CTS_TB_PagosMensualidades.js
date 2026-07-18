/*
 * Benjamin Orellana - 2026/05/29 - Controlador Sequelize para mensualidades y deuda de alumnos PREMIUM.
 */

import { Op } from 'sequelize';
import db from '../../DataBase/db.js';

import PagosMensualidadesModel from '../../Models/Pago/MD_TB_PagosMensualidades.js';
import AlumnosModel from '../../Models/Alumno/MD_TB_Alumnos.js';
import AlumnosMembresiasModel from '../../Models/Alumno/MD_TB_AlumnosMembresias.js';
import SedesModel from '../../Models/Sede/MD_TB_Sedes.js';

const ESTADOS_MENSUALIDAD_VALIDOS = [
  'pendiente',
  'parcial',
  'pagada',
  'vencida',
  'anulada'
];

const CAMPOS_ORDEN_VALIDOS = [
  'id',
  'alumno_id',
  'membresia_id',
  'sede_id',
  'periodo_anio',
  'periodo_mes',
  'periodo_desde',
  'periodo_hasta',
  'fecha_emision',
  'fecha_vencimiento',
  'monto_total',
  'monto_pagado',
  'saldo',
  'estado',
  'created_at',
  'updated_at'
];

// Benjamin Orellana - 2026/05/29 - Normaliza paginación para listados de mensualidades.
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

// Benjamin Orellana - 2026/06/15 - Normaliza texto de búsqueda para mensualidades.
const normalizarTextoBusqueda = (value) => {
  if (value === undefined || value === null) return null;

  const texto = String(value).trim().replace(/\s+/g, ' ');

  return texto.length > 0 ? texto : null;
};

// Benjamin Orellana - 2026/06/15 - Permite buscar alumnos por nombre completo, DNI, email o teléfono.
const construirWhereBusquedaAlumnoMensualidad = (search) => {
  const terminos = String(search || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return {
    [Op.and]: terminos.map((termino) => {
      const condiciones = [
        { nombre: { [Op.like]: `%${termino}%` } },
        { apellido: { [Op.like]: `%${termino}%` } },
        { dni: { [Op.like]: `%${termino}%` } },
        { email: { [Op.like]: `%${termino}%` } },
        { telefono: { [Op.like]: `%${termino}%` } }
      ];

      if (/^\d+$/.test(termino)) {
        condiciones.push({ id: Number(termino) });
      }

      return {
        [Op.or]: condiciones
      };
    })
  };
};

// Benjamin Orellana - 2026/06/15 - Obtiene IDs de alumnos para filtrar mensualidades por texto.
const buscarIdsAlumnosMensualidadPorTexto = async (search) => {
  const texto = normalizarTextoBusqueda(search);

  if (!texto) return [];

  const alumnos = await AlumnosModel.findAll({
    where: construirWhereBusquedaAlumnoMensualidad(texto),
    attributes: ['id'],
    limit: 500
  });

  return alumnos.map((alumno) => Number(alumno.id));
};

// Benjamin Orellana - 2026/05/29 - Valida enteros no negativos.
const esEnteroValido = (valor) => {
  if (valor === null || valor === undefined || valor === '') return false;

  const numero = Number(valor);

  return Number.isInteger(numero) && numero >= 0;
};

// Benjamin Orellana - 2026/05/29 - Valida año de periodo.
const esAnioValido = (valor) => {
  if (!esEnteroValido(valor)) return false;

  const numero = Number(valor);

  return numero >= 2000 && numero <= 2100;
};

// Benjamin Orellana - 2026/05/29 - Valida mes de periodo.
const esMesValido = (valor) => {
  if (valor === null || valor === undefined || valor === '') return true;

  const numero = Number(valor);

  return Number.isInteger(numero) && numero >= 1 && numero <= 12;
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

// Benjamin Orellana - 2026/05/29 - Include permitido según relaciones reales del módulo Pago.
const includeMensualidad = [
  {
    model: AlumnosModel,
    as: 'alumno'
  },
  {
    model: AlumnosMembresiasModel,
    as: 'membresia',
    required: false
  },
  {
    model: SedesModel,
    as: 'sede'
  }
];

// Benjamin Orellana - 2026/05/29 - Calcula saldo de mensualidad.
const calcularSaldo = (montoTotal, montoPagado) => {
  const total = Number(montoTotal || 0);
  const pagado = Number(montoPagado || 0);

  return Math.max(total - pagado, 0).toFixed(2);
};

// Benjamin Orellana - 2026/05/29 - Determina estado automático según monto total, pagado y saldo.
const determinarEstadoPorSaldo = (
  montoTotal,
  montoPagado,
  estadoActual = 'pendiente'
) => {
  const total = Number(montoTotal || 0);
  const pagado = Number(montoPagado || 0);
  const saldo = Number(calcularSaldo(total, pagado));

  if (estadoActual === 'anulada') return 'anulada';
  if (estadoActual === 'vencida') return 'vencida';

  if (saldo <= 0 && total >= 0) return 'pagada';
  if (pagado > 0 && saldo > 0) return 'parcial';

  return 'pendiente';
};

// Benjamin Orellana - 2026/05/29 - Valida payload de creación y edición de mensualidades.
const validarPayloadMensualidad = (body, esCreacion = true) => {
  const errores = [];

  if (esCreacion || body.alumno_id !== undefined) {
    if (!esIdValido(body.alumno_id)) {
      errores.push(
        'El campo alumno_id es obligatorio y debe ser un ID válido.'
      );
    }
  }

  if (
    body.membresia_id !== undefined &&
    body.membresia_id !== null &&
    body.membresia_id !== ''
  ) {
    if (!esIdValido(body.membresia_id)) {
      errores.push('El campo membresia_id debe ser un ID válido o null.');
    }
  }

  if (esCreacion || body.sede_id !== undefined) {
    if (!esIdValido(body.sede_id)) {
      errores.push('El campo sede_id es obligatorio y debe ser un ID válido.');
    }
  }

  if (esCreacion || body.periodo_anio !== undefined) {
    if (!esAnioValido(body.periodo_anio)) {
      errores.push(
        'El campo periodo_anio es obligatorio y debe ser un año válido.'
      );
    }
  }

  if (body.periodo_mes !== undefined && !esMesValido(body.periodo_mes)) {
    errores.push(
      'El campo periodo_mes debe ser un número entre 1 y 12 o null.'
    );
  }

  if (esCreacion || body.periodo_desde !== undefined) {
    if (!esFechaDateOnlyValida(body.periodo_desde)) {
      errores.push(
        'El campo periodo_desde es obligatorio y debe tener formato YYYY-MM-DD.'
      );
    }
  }

  if (esCreacion || body.periodo_hasta !== undefined) {
    if (!esFechaDateOnlyValida(body.periodo_hasta)) {
      errores.push(
        'El campo periodo_hasta es obligatorio y debe tener formato YYYY-MM-DD.'
      );
    }
  }

  if (
    body.periodo_desde &&
    body.periodo_hasta &&
    esFechaDateOnlyValida(body.periodo_desde) &&
    esFechaDateOnlyValida(body.periodo_hasta) &&
    body.periodo_hasta < body.periodo_desde
  ) {
    errores.push(
      'El campo periodo_hasta no puede ser menor que periodo_desde.'
    );
  }

  if (esCreacion || body.fecha_emision !== undefined) {
    if (!esFechaDateOnlyValida(body.fecha_emision)) {
      errores.push(
        'El campo fecha_emision es obligatorio y debe tener formato YYYY-MM-DD.'
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

  if (esCreacion || body.monto_total !== undefined) {
    if (!esImporteValido(body.monto_total)) {
      errores.push(
        'El campo monto_total es obligatorio y debe ser un importe válido mayor o igual a 0.'
      );
    }
  }

  if (body.monto_pagado !== undefined && !esImporteValido(body.monto_pagado)) {
    errores.push(
      'El campo monto_pagado debe ser un importe válido mayor o igual a 0.'
    );
  }

  if (body.saldo !== undefined && !esImporteValido(body.saldo)) {
    errores.push(
      'El campo saldo debe ser un importe válido mayor o igual a 0.'
    );
  }

  if (
    body.monto_total !== undefined &&
    body.monto_pagado !== undefined &&
    esImporteValido(body.monto_total) &&
    esImporteValido(body.monto_pagado) &&
    Number(body.monto_pagado) > Number(body.monto_total)
  ) {
    errores.push('El campo monto_pagado no puede ser mayor que monto_total.');
  }

  if (
    body.estado !== undefined &&
    !ESTADOS_MENSUALIDAD_VALIDOS.includes(body.estado)
  ) {
    errores.push(
      `El campo estado debe ser uno de los siguientes valores: ${ESTADOS_MENSUALIDAD_VALIDOS.join(', ')}.`
    );
  }

  return errores;
};

// Benjamin Orellana - 2026/05/29 - Lista mensualidades con filtros y paginación.
export const OBR_PagosMensualidades_CTS = async (req, res) => {
  try {
    const { page, limit, offset } = obtenerPaginacion(req.query);

    const {
      q,
      alumno_id,
      alumno_q,
      membresia_id,
      sede_id,
      periodo_anio,
      periodo_mes,
      estado,
      fecha_emision_desde,
      fecha_emision_hasta,
      vencimiento_desde,
      vencimiento_hasta,
      con_saldo,
      order_by = 'id',
      order_direction = 'DESC'
    } = req.query;

    const where = {};

    const search = normalizarTextoBusqueda(q);

    if (search) {
      const alumnoIds = await buscarIdsAlumnosMensualidadPorTexto(search);

      const condicionesBusqueda = [
        { observaciones: { [Op.like]: `%${search}%` } }
      ];

      if (alumnoIds.length > 0) {
        condicionesBusqueda.push({
          alumno_id: {
            [Op.in]: alumnoIds
          }
        });
      }

      where[Op.or] = condicionesBusqueda;
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

    if (alumno_q !== undefined && String(alumno_q).trim() !== '') {
      const alumnoIds = await buscarIdsAlumnosMensualidadPorTexto(alumno_q);

      where.alumno_id = alumnoIds.length
        ? {
            [Op.in]: alumnoIds
          }
        : -1;
    }

    if (membresia_id !== undefined) {
      if (membresia_id === 'null' || membresia_id === '') {
        where.membresia_id = null;
      } else {
        if (!esIdValido(membresia_id)) {
          return responderError(
            res,
            400,
            'El filtro membresia_id debe ser un ID válido o null.'
          );
        }

        where.membresia_id = Number(membresia_id);
      }
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

    if (periodo_anio !== undefined) {
      if (!esAnioValido(periodo_anio)) {
        return responderError(
          res,
          400,
          'El filtro periodo_anio debe ser un año válido.'
        );
      }

      where.periodo_anio = Number(periodo_anio);
    }

    if (periodo_mes !== undefined) {
      if (!esMesValido(periodo_mes)) {
        return responderError(
          res,
          400,
          'El filtro periodo_mes debe ser un número entre 1 y 12.'
        );
      }

      where.periodo_mes = Number(periodo_mes);
    }

    if (estado !== undefined) {
      if (!ESTADOS_MENSUALIDAD_VALIDOS.includes(estado)) {
        return responderError(
          res,
          400,
          `El filtro estado debe ser uno de los siguientes valores: ${ESTADOS_MENSUALIDAD_VALIDOS.join(', ')}.`
        );
      }

      where.estado = estado;
    }

    if (fecha_emision_desde || fecha_emision_hasta) {
      where.fecha_emision = {};

      if (fecha_emision_desde) {
        if (!esFechaDateOnlyValida(fecha_emision_desde)) {
          return responderError(
            res,
            400,
            'El filtro fecha_emision_desde debe tener formato YYYY-MM-DD.'
          );
        }

        where.fecha_emision[Op.gte] = fecha_emision_desde;
      }

      if (fecha_emision_hasta) {
        if (!esFechaDateOnlyValida(fecha_emision_hasta)) {
          return responderError(
            res,
            400,
            'El filtro fecha_emision_hasta debe tener formato YYYY-MM-DD.'
          );
        }

        where.fecha_emision[Op.lte] = fecha_emision_hasta;
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

    if (con_saldo !== undefined) {
      if (!['1', 'true', true].includes(con_saldo)) {
        return responderError(
          res,
          400,
          'El filtro con_saldo solo admite 1 o true.'
        );
      }

      where.saldo = {
        [Op.gt]: 0
      };
    }

    const campoOrden = CAMPOS_ORDEN_VALIDOS.includes(order_by)
      ? order_by
      : 'id';
    const direccionOrden =
      String(order_direction).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows } = await PagosMensualidadesModel.findAndCountAll({
      where,
      include: includeMensualidad,
      limit,
      offset,
      order: [[campoOrden, direccionOrden]]
    });

    return res.status(200).json({
      ok: true,
      message: 'Mensualidades obtenidas correctamente.',
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit),
      data: rows
    });
  } catch (error) {
    console.error('Error en OBR_PagosMensualidades_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener las mensualidades.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Obtiene una mensualidad por ID.
export const OBR_MensualidadPorId_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const mensualidad = await PagosMensualidadesModel.findByPk(id, {
      include: includeMensualidad
    });

    if (!mensualidad) {
      return responderError(
        res,
        404,
        'No se encontró la mensualidad solicitada.'
      );
    }

    return res.status(200).json({
      ok: true,
      message: 'Mensualidad obtenida correctamente.',
      data: mensualidad
    });
  } catch (error) {
    console.error('Error en OBR_MensualidadPorId_CTS:', error);

    return responderError(res, 500, 'Error interno al obtener la mensualidad.');
  }
};

// Benjamin Orellana - 2026/05/29 - Lista mensualidades de un alumno.
export const OBR_MensualidadesPorAlumno_CTS = async (req, res) => {
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
      alumno_id: Number(alumno_id),
      sede_id: Number(req.financial_sede_id)
    };

    if (estado !== undefined) {
      if (!ESTADOS_MENSUALIDAD_VALIDOS.includes(estado)) {
        return responderError(
          res,
          400,
          `El filtro estado debe ser uno de los siguientes valores: ${ESTADOS_MENSUALIDAD_VALIDOS.join(', ')}.`
        );
      }

      where.estado = estado;
    }

    const { count, rows } = await PagosMensualidadesModel.findAndCountAll({
      where,
      include: includeMensualidad,
      limit,
      offset,
      order: [
        ['periodo_desde', 'DESC'],
        ['id', 'DESC']
      ]
    });

    return res.status(200).json({
      ok: true,
      message: 'Mensualidades del alumno obtenidas correctamente.',
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit),
      data: rows
    });
  } catch (error) {
    console.error('Error en OBR_MensualidadesPorAlumno_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener las mensualidades del alumno.'
    );
  }
};

// Benjamin Orellana - 2026/07/13 - Lista únicamente las mensualidades del
// alumno autenticado en el portal, tomando el ID desde su token.
export const OBR_MisMensualidades_CTS = async (req, res) => {
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

  return OBR_MensualidadesPorAlumno_CTS(req, res);
};

// Benjamin Orellana - 2026/05/29 - Lista mensualidades pendientes o parciales.
export const OBR_MensualidadesPendientes_CTS = async (req, res) => {
  try {
    const { page, limit, offset } = obtenerPaginacion(req.query);
    const { sede_id } = req.query;

    const where = {
      estado: {
        [Op.in]: ['pendiente', 'parcial']
      },
      saldo: {
        [Op.gt]: 0
      }
    };

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

    const { count, rows } = await PagosMensualidadesModel.findAndCountAll({
      where,
      include: includeMensualidad,
      limit,
      offset,
      order: [
        ['fecha_vencimiento', 'ASC'],
        ['id', 'ASC']
      ]
    });

    return res.status(200).json({
      ok: true,
      message: 'Mensualidades pendientes obtenidas correctamente.',
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit),
      data: rows
    });
  } catch (error) {
    console.error('Error en OBR_MensualidadesPendientes_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener mensualidades pendientes.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Lista mensualidades vencidas o con vencimiento superado y saldo pendiente.
export const OBR_MensualidadesVencidas_CTS = async (req, res) => {
  try {
    const { page, limit, offset } = obtenerPaginacion(req.query);
    const { sede_id, fecha } = req.query;

    const fechaConsulta = fecha || obtenerFechaActualDateOnly();

    if (!esFechaDateOnlyValida(fechaConsulta)) {
      return responderError(
        res,
        400,
        'El filtro fecha debe tener formato YYYY-MM-DD.'
      );
    }

    const where = {
      saldo: {
        [Op.gt]: 0
      },
      estado: {
        [Op.ne]: 'anulada'
      },
      [Op.or]: [
        { estado: 'vencida' },
        {
          fecha_vencimiento: {
            [Op.lt]: fechaConsulta
          },
          estado: {
            [Op.in]: ['pendiente', 'parcial']
          }
        }
      ]
    };

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

    const { count, rows } = await PagosMensualidadesModel.findAndCountAll({
      where,
      include: includeMensualidad,
      limit,
      offset,
      order: [
        ['fecha_vencimiento', 'ASC'],
        ['id', 'ASC']
      ]
    });

    return res.status(200).json({
      ok: true,
      message: 'Mensualidades vencidas obtenidas correctamente.',
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit),
      data: rows
    });
  } catch (error) {
    console.error('Error en OBR_MensualidadesVencidas_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener mensualidades vencidas.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Lista alumnos morosos según mensualidades vencidas con saldo pendiente.
export const OBR_AlumnosMorosos_CTS = async (req, res) => {
  try {
    const { page, limit, offset } = obtenerPaginacion(req.query);
    const { sede_id, fecha } = req.query;

    const fechaConsulta = fecha || obtenerFechaActualDateOnly();

    if (!esFechaDateOnlyValida(fechaConsulta)) {
      return responderError(
        res,
        400,
        'El filtro fecha debe tener formato YYYY-MM-DD.'
      );
    }

    const where = {
      saldo: {
        [Op.gt]: 0
      },
      estado: {
        [Op.ne]: 'anulada'
      },
      [Op.or]: [
        { estado: 'vencida' },
        {
          fecha_vencimiento: {
            [Op.lt]: fechaConsulta
          },
          estado: {
            [Op.in]: ['pendiente', 'parcial']
          }
        }
      ]
    };

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

    const { count, rows } = await PagosMensualidadesModel.findAndCountAll({
      where,
      include: includeMensualidad,
      limit,
      offset,
      order: [
        ['fecha_vencimiento', 'ASC'],
        ['alumno_id', 'ASC'],
        ['id', 'ASC']
      ]
    });

    return res.status(200).json({
      ok: true,
      message: 'Alumnos morosos obtenidos correctamente.',
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit),
      data: rows
    });
  } catch (error) {
    console.error('Error en OBR_AlumnosMorosos_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener alumnos morosos.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Crea una mensualidad manual.
export const CR_PagosMensualidades_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const errores = validarPayloadMensualidad(req.body, true);

    if (errores.length > 0) {
      await transaction.rollback();
      return responderError(res, 400, 'Hay errores de validación.', errores);
    }

    const {
      alumno_id,
      membresia_id,
      sede_id,
      periodo_anio,
      periodo_mes,
      periodo_desde,
      periodo_hasta,
      fecha_emision,
      fecha_vencimiento,
      monto_total,
      monto_pagado,
      saldo,
      estado,
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

    let membresiaNormalizada = null;

    if (
      membresia_id !== undefined &&
      membresia_id !== null &&
      membresia_id !== ''
    ) {
      const membresia = await AlumnosMembresiasModel.findByPk(membresia_id, {
        transaction
      });

      if (!membresia) {
        await transaction.rollback();
        return responderError(
          res,
          404,
          'No se encontró la membresía indicada en membresia_id.'
        );
      }

      membresiaNormalizada = Number(membresia_id);
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

    const montoTotalNormalizado = Number(monto_total);
    const montoPagadoNormalizado =
      monto_pagado !== undefined ? Number(monto_pagado) : 0;
    const saldoNormalizado =
      saldo !== undefined
        ? Number(saldo).toFixed(2)
        : calcularSaldo(montoTotalNormalizado, montoPagadoNormalizado);

    const estadoNormalizado =
      estado ||
      determinarEstadoPorSaldo(
        montoTotalNormalizado,
        montoPagadoNormalizado,
        'pendiente'
      );

    const nuevaMensualidad = await PagosMensualidadesModel.create(
      {
        alumno_id: Number(alumno_id),
        membresia_id: membresiaNormalizada,
        sede_id: Number(sede_id),
        periodo_anio: Number(periodo_anio),
        periodo_mes:
          periodo_mes !== undefined &&
          periodo_mes !== null &&
          periodo_mes !== ''
            ? Number(periodo_mes)
            : null,
        periodo_desde,
        periodo_hasta,
        fecha_emision,
        fecha_vencimiento,
        monto_total: montoTotalNormalizado.toFixed(2),
        monto_pagado: montoPagadoNormalizado.toFixed(2),
        saldo: saldoNormalizado,
        estado: estadoNormalizado,
        observaciones:
          observaciones !== undefined && observaciones !== null
            ? String(observaciones).trim()
            : null
      },
      { transaction }
    );

    await transaction.commit();

    const mensualidadCompleta = await PagosMensualidadesModel.findByPk(
      nuevaMensualidad.id,
      {
        include: includeMensualidad
      }
    );

    return res.status(201).json({
      ok: true,
      message: 'Mensualidad creada correctamente.',
      data: mensualidadCompleta
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en CR_PagosMensualidades_CTS:', error);

    return responderError(res, 500, 'Error interno al crear la mensualidad.');
  }
};

// Benjamin Orellana - 2026/05/29 - Genera una mensualidad desde una membresía existente.
export const CR_GenerarMensualidadDesdeMembresia_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { membresia_id } = req.params;

    if (!esIdValido(membresia_id)) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El parámetro membresia_id debe ser un ID válido.'
      );
    }

    const membresia = await AlumnosMembresiasModel.findByPk(membresia_id, {
      transaction
    });

    if (!membresia) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró la membresía indicada.');
    }

    const {
      periodo_anio,
      periodo_mes,
      periodo_desde,
      periodo_hasta,
      fecha_emision,
      fecha_vencimiento,
      monto_total,
      observaciones
    } = req.body;

    const periodoDesdeNormalizado = periodo_desde || membresia.fecha_inicio;
    const periodoHastaNormalizado =
      periodo_hasta || membresia.fecha_vencimiento;
    const fechaEmisionNormalizada =
      fecha_emision || obtenerFechaActualDateOnly();
    const fechaVencimientoNormalizada =
      fecha_vencimiento || membresia.fecha_vencimiento;

    if (!esFechaDateOnlyValida(periodoDesdeNormalizado)) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El campo periodo_desde debe tener formato YYYY-MM-DD.'
      );
    }

    if (!esFechaDateOnlyValida(periodoHastaNormalizado)) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El campo periodo_hasta debe tener formato YYYY-MM-DD.'
      );
    }

    if (!esFechaDateOnlyValida(fechaEmisionNormalizada)) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El campo fecha_emision debe tener formato YYYY-MM-DD.'
      );
    }

    if (!esFechaDateOnlyValida(fechaVencimientoNormalizada)) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El campo fecha_vencimiento debe tener formato YYYY-MM-DD.'
      );
    }

    if (periodoHastaNormalizado < periodoDesdeNormalizado) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El campo periodo_hasta no puede ser menor que periodo_desde.'
      );
    }

    const fechaBase = new Date(`${periodoDesdeNormalizado}T00:00:00`);
    const anioNormalizado =
      periodo_anio !== undefined
        ? Number(periodo_anio)
        : fechaBase.getFullYear();

    const mesNormalizado =
      periodo_mes !== undefined && periodo_mes !== null && periodo_mes !== ''
        ? Number(periodo_mes)
        : fechaBase.getMonth() + 1;

    if (!esAnioValido(anioNormalizado)) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El campo periodo_anio debe ser un año válido.'
      );
    }

    if (!esMesValido(mesNormalizado)) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El campo periodo_mes debe ser un número entre 1 y 12.'
      );
    }

    const montoTotalNormalizado =
      monto_total !== undefined
        ? Number(monto_total)
        : Number(membresia.precio_final || 0);

    if (!esImporteValido(montoTotalNormalizado)) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El campo monto_total debe ser un importe válido mayor o igual a 0.'
      );
    }

    const nuevaMensualidad = await PagosMensualidadesModel.create(
      {
        alumno_id: Number(membresia.alumno_id),
        membresia_id: Number(membresia.id),
        sede_id: Number(membresia.sede_id),
        periodo_anio: anioNormalizado,
        periodo_mes: mesNormalizado,
        periodo_desde: periodoDesdeNormalizado,
        periodo_hasta: periodoHastaNormalizado,
        fecha_emision: fechaEmisionNormalizada,
        fecha_vencimiento: fechaVencimientoNormalizada,
        monto_total: montoTotalNormalizado.toFixed(2),
        monto_pagado: Number(0).toFixed(2),
        saldo: montoTotalNormalizado.toFixed(2),
        estado: 'pendiente',
        observaciones:
          observaciones !== undefined && observaciones !== null
            ? String(observaciones).trim()
            : null
      },
      { transaction }
    );

    await transaction.commit();

    const mensualidadCompleta = await PagosMensualidadesModel.findByPk(
      nuevaMensualidad.id,
      {
        include: includeMensualidad
      }
    );

    return res.status(201).json({
      ok: true,
      message: 'Mensualidad generada desde membresía correctamente.',
      data: mensualidadCompleta
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en CR_GenerarMensualidadDesdeMembresia_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al generar la mensualidad desde membresía.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Actualiza una mensualidad existente.
export const UR_PagosMensualidades_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const mensualidad = await PagosMensualidadesModel.findByPk(id, {
      transaction
    });

    if (!mensualidad) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró la mensualidad solicitada.'
      );
    }

    const errores = validarPayloadMensualidad(req.body, false);

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

    if (req.body.membresia_id !== undefined) {
      if (req.body.membresia_id === null || req.body.membresia_id === '') {
        datosActualizar.membresia_id = null;
      } else {
        const membresia = await AlumnosMembresiasModel.findByPk(
          req.body.membresia_id,
          { transaction }
        );

        if (!membresia) {
          await transaction.rollback();
          return responderError(
            res,
            404,
            'No se encontró la membresía indicada en membresia_id.'
          );
        }

        datosActualizar.membresia_id = Number(req.body.membresia_id);
      }
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

    if (req.body.periodo_anio !== undefined) {
      datosActualizar.periodo_anio = Number(req.body.periodo_anio);
    }

    if (req.body.periodo_mes !== undefined) {
      datosActualizar.periodo_mes =
        req.body.periodo_mes !== null && req.body.periodo_mes !== ''
          ? Number(req.body.periodo_mes)
          : null;
    }

    if (req.body.periodo_desde !== undefined) {
      datosActualizar.periodo_desde = req.body.periodo_desde;
    }

    if (req.body.periodo_hasta !== undefined) {
      datosActualizar.periodo_hasta = req.body.periodo_hasta;
    }

    if (req.body.fecha_emision !== undefined) {
      datosActualizar.fecha_emision = req.body.fecha_emision;
    }

    if (req.body.fecha_vencimiento !== undefined) {
      datosActualizar.fecha_vencimiento = req.body.fecha_vencimiento;
    }

    if (req.body.monto_total !== undefined) {
      datosActualizar.monto_total = Number(req.body.monto_total).toFixed(2);
    }

    if (req.body.monto_pagado !== undefined) {
      datosActualizar.monto_pagado = Number(req.body.monto_pagado).toFixed(2);
    }

    if (req.body.saldo !== undefined) {
      datosActualizar.saldo = Number(req.body.saldo).toFixed(2);
    }

    if (req.body.estado !== undefined) {
      datosActualizar.estado = req.body.estado;
    }

    if (req.body.observaciones !== undefined) {
      datosActualizar.observaciones =
        req.body.observaciones !== null
          ? String(req.body.observaciones).trim()
          : null;
    }

    if (
      req.body.saldo === undefined &&
      (req.body.monto_total !== undefined ||
        req.body.monto_pagado !== undefined)
    ) {
      const montoTotalBase =
        datosActualizar.monto_total !== undefined
          ? datosActualizar.monto_total
          : mensualidad.monto_total;

      const montoPagadoBase =
        datosActualizar.monto_pagado !== undefined
          ? datosActualizar.monto_pagado
          : mensualidad.monto_pagado;

      datosActualizar.saldo = calcularSaldo(montoTotalBase, montoPagadoBase);
    }

    if (
      req.body.estado === undefined &&
      (req.body.monto_total !== undefined ||
        req.body.monto_pagado !== undefined ||
        req.body.saldo !== undefined)
    ) {
      const montoTotalBase =
        datosActualizar.monto_total !== undefined
          ? datosActualizar.monto_total
          : mensualidad.monto_total;

      const montoPagadoBase =
        datosActualizar.monto_pagado !== undefined
          ? datosActualizar.monto_pagado
          : mensualidad.monto_pagado;

      datosActualizar.estado = determinarEstadoPorSaldo(
        montoTotalBase,
        montoPagadoBase,
        mensualidad.estado
      );
    }

    datosActualizar.updated_at = new Date();

    await mensualidad.update(datosActualizar, { transaction });

    await transaction.commit();

    const mensualidadActualizada = await PagosMensualidadesModel.findByPk(id, {
      include: includeMensualidad
    });

    return res.status(200).json({
      ok: true,
      message: 'Mensualidad actualizada correctamente.',
      data: mensualidadActualizada
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_PagosMensualidades_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al actualizar la mensualidad.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Actualiza manualmente el estado de una mensualidad.
export const UR_EstadoMensualidad_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado || !ESTADOS_MENSUALIDAD_VALIDOS.includes(estado)) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        `El campo estado es obligatorio y debe ser uno de los siguientes valores: ${ESTADOS_MENSUALIDAD_VALIDOS.join(', ')}.`
      );
    }

    const mensualidad = await PagosMensualidadesModel.findByPk(id, {
      transaction
    });

    if (!mensualidad) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró la mensualidad solicitada.'
      );
    }

    await mensualidad.update(
      {
        estado,
        updated_at: new Date()
      },
      { transaction }
    );

    await transaction.commit();

    const mensualidadActualizada = await PagosMensualidadesModel.findByPk(id, {
      include: includeMensualidad
    });

    return res.status(200).json({
      ok: true,
      message: 'Estado de mensualidad actualizado correctamente.',
      data: mensualidadActualizada
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_EstadoMensualidad_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al actualizar el estado de la mensualidad.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Marca una mensualidad como vencida.
export const UR_MarcarMensualidadVencida_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const mensualidad = await PagosMensualidadesModel.findByPk(id, {
      transaction
    });

    if (!mensualidad) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró la mensualidad solicitada.'
      );
    }

    if (mensualidad.estado === 'pagada') {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'No se puede marcar como vencida una mensualidad pagada.'
      );
    }

    if (mensualidad.estado === 'anulada') {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'No se puede marcar como vencida una mensualidad anulada.'
      );
    }

    await mensualidad.update(
      {
        estado: 'vencida',
        updated_at: new Date()
      },
      { transaction }
    );

    await transaction.commit();

    const mensualidadActualizada = await PagosMensualidadesModel.findByPk(id, {
      include: includeMensualidad
    });

    return res.status(200).json({
      ok: true,
      message: 'Mensualidad marcada como vencida correctamente.',
      data: mensualidadActualizada
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_MarcarMensualidadVencida_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al marcar la mensualidad como vencida.'
    );
  }
};

// Benjamin Orellana - 2026/05/29 - Anula una mensualidad mediante baja lógica.
export const DR_PagosMensualidades_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;
    const { observaciones } = req.body;

    const mensualidad = await PagosMensualidadesModel.findByPk(id, {
      transaction
    });

    if (!mensualidad) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró la mensualidad solicitada.'
      );
    }

    await mensualidad.update(
      {
        estado: 'anulada',
        observaciones:
          observaciones !== undefined && observaciones !== null
            ? String(observaciones).trim()
            : mensualidad.observaciones,
        updated_at: new Date()
      },
      { transaction }
    );

    await transaction.commit();

    const mensualidadActualizada = await PagosMensualidadesModel.findByPk(id, {
      include: includeMensualidad
    });

    return res.status(200).json({
      ok: true,
      message: 'Mensualidad anulada correctamente.',
      data: mensualidadActualizada
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en DR_PagosMensualidades_CTS:', error);

    return responderError(res, 500, 'Error interno al anular la mensualidad.');
  }
};

// Benjamin Orellana - 2026/05/29 - Elimina físicamente una mensualidad de la tabla pagos_mensualidades.
export const ER_PagosMensualidades_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const mensualidad = await PagosMensualidadesModel.findByPk(id, {
      transaction
    });

    if (!mensualidad) {
      await transaction.rollback();

      return responderError(
        res,
        404,
        'No se encontró la mensualidad solicitada.'
      );
    }

    await mensualidad.destroy({ transaction });

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Mensualidad eliminada físicamente correctamente.',
      data: {
        id: Number(id)
      }
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en ER_PagosMensualidades_CTS:', error);

    if (error?.name === 'SequelizeForeignKeyConstraintError') {
      return responderError(
        res,
        409,
        'No se puede eliminar físicamente la mensualidad porque tiene registros relacionados.'
      );
    }

    return responderError(
      res,
      500,
      'Error interno al eliminar físicamente la mensualidad.'
    );
  }
};
