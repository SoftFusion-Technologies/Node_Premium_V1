/*
 * Benjamin Orellana - 2026/05/30 - Controlador Sequelize para métodos recurrentes de pago PREMIUM.
 */

import { Op } from 'sequelize';
import db from '../../DataBase/db.js';

import PagosMetodosRecurrentesModel from '../../Models/Pago/MD_TB_PagosMetodosRecurrentes.js';
import PagosMediosPagoModel from '../../Models/Pago/MD_TB_PagosMediosPago.js';
import AlumnosModel from '../../Models/Alumno/MD_TB_Alumnos.js';

const ESTADOS_METODO_RECURRENTE_VALIDOS = [
  'activo',
  'inactivo',
  'vencido',
  'error',
  'eliminado'
];

const CAMPOS_ORDEN_VALIDOS = [
  'id',
  'alumno_id',
  'medio_pago_id',
  'proveedor',
  'marca_tarjeta',
  'ultimos_cuatro',
  'titular',
  'estado',
  'fecha_alta',
  'fecha_baja',
  'created_at',
  'updated_at'
];

const ATRIBUTOS_SEGUROS_METODO_RECURRENTE = {
  exclude: ['customer_token', 'payment_method_token']
};

// Benjamin Orellana - 2026/05/30 - Include permitido según relaciones reales del módulo Pago.
const includeMetodoRecurrente = [
  {
    model: AlumnosModel,
    as: 'alumno'
  },
  {
    model: PagosMediosPagoModel,
    as: 'medio_pago'
  }
];

// Benjamin Orellana - 2026/05/30 - Normaliza paginación para listados de métodos recurrentes.
const obtenerPaginacion = (query) => {
  const page = Math.max(parseInt(query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit || '10', 10), 1), 100);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
};

// Benjamin Orellana - 2026/05/30 - Valida IDs numéricos.
const esIdValido = (valor) => {
  if (valor === null || valor === undefined || valor === '') return false;

  const numero = Number(valor);

  return Number.isInteger(numero) && numero > 0;
};

// Benjamin Orellana - 2026/05/30 - Valida fechas DATE.
const esFechaDateValida = (valor) => {
  if (!valor) return false;

  const fecha = new Date(valor);

  return !Number.isNaN(fecha.getTime());
};

// Benjamin Orellana - 2026/05/30 - Arma respuesta estándar de error.
const responderError = (res, status, message, data = null) => {
  return res.status(status).json({
    ok: false,
    message,
    data
  });
};

// Benjamin Orellana - 2026/05/30 - Valida payload de creación y edición de métodos recurrentes.
const validarPayloadMetodoRecurrente = (body, esCreacion = true) => {
  const errores = [];

  if (esCreacion || body.alumno_id !== undefined) {
    if (!esIdValido(body.alumno_id)) {
      errores.push(
        'El campo alumno_id es obligatorio y debe ser un ID válido.'
      );
    }
  }

  if (esCreacion || body.medio_pago_id !== undefined) {
    if (!esIdValido(body.medio_pago_id)) {
      errores.push(
        'El campo medio_pago_id es obligatorio y debe ser un ID válido.'
      );
    }
  }

  if (
    body.proveedor !== undefined &&
    body.proveedor !== null &&
    String(body.proveedor).length > 80
  ) {
    errores.push('El campo proveedor no puede superar los 80 caracteres.');
  }

  if (
    body.customer_token !== undefined &&
    body.customer_token !== null &&
    String(body.customer_token).length > 255
  ) {
    errores.push(
      'El campo customer_token no puede superar los 255 caracteres.'
    );
  }

  if (
    body.payment_method_token !== undefined &&
    body.payment_method_token !== null &&
    String(body.payment_method_token).length > 255
  ) {
    errores.push(
      'El campo payment_method_token no puede superar los 255 caracteres.'
    );
  }

  if (
    body.marca_tarjeta !== undefined &&
    body.marca_tarjeta !== null &&
    String(body.marca_tarjeta).length > 80
  ) {
    errores.push('El campo marca_tarjeta no puede superar los 80 caracteres.');
  }

  if (
    body.ultimos_cuatro !== undefined &&
    body.ultimos_cuatro !== null &&
    String(body.ultimos_cuatro).length > 4
  ) {
    errores.push('El campo ultimos_cuatro no puede superar los 4 caracteres.');
  }

  if (
    body.titular !== undefined &&
    body.titular !== null &&
    String(body.titular).length > 150
  ) {
    errores.push('El campo titular no puede superar los 150 caracteres.');
  }

  if (
    body.estado !== undefined &&
    !ESTADOS_METODO_RECURRENTE_VALIDOS.includes(body.estado)
  ) {
    errores.push(
      `El campo estado debe ser uno de los siguientes valores: ${ESTADOS_METODO_RECURRENTE_VALIDOS.join(', ')}.`
    );
  }

  if (body.fecha_alta !== undefined && !esFechaDateValida(body.fecha_alta)) {
    errores.push('El campo fecha_alta debe ser una fecha válida.');
  }

  if (
    body.fecha_baja !== undefined &&
    body.fecha_baja !== null &&
    body.fecha_baja !== ''
  ) {
    if (!esFechaDateValida(body.fecha_baja)) {
      errores.push('El campo fecha_baja debe ser una fecha válida o null.');
    }
  }

  if (
    body.motivo_baja !== undefined &&
    body.motivo_baja !== null &&
    String(body.motivo_baja).length > 255
  ) {
    errores.push('El campo motivo_baja no puede superar los 255 caracteres.');
  }

  return errores;
};

// Benjamin Orellana - 2026/05/30 - Valida existencia de relaciones principales.
const validarReferenciasMetodoRecurrente = async (body, transaction) => {
  const { alumno_id, medio_pago_id } = body;

  if (alumno_id !== undefined) {
    const alumno = await AlumnosModel.findByPk(alumno_id, { transaction });

    if (!alumno) {
      return {
        ok: false,
        status: 404,
        message: 'No se encontró el alumno indicado en alumno_id.'
      };
    }
  }

  if (medio_pago_id !== undefined) {
    const medioPago = await PagosMediosPagoModel.findByPk(medio_pago_id, {
      transaction
    });

    if (!medioPago) {
      return {
        ok: false,
        status: 404,
        message: 'No se encontró el medio de pago indicado en medio_pago_id.'
      };
    }
  }

  return {
    ok: true
  };
};

// Benjamin Orellana - 2026/05/30 - Obtiene un método recurrente seguro por ID, sin exponer tokens.
const obtenerMetodoRecurrenteSeguroPorId = async (id) => {
  return PagosMetodosRecurrentesModel.findByPk(id, {
    attributes: ATRIBUTOS_SEGUROS_METODO_RECURRENTE,
    include: includeMetodoRecurrente
  });
};

// Benjamin Orellana - 2026/05/30 - Lista métodos recurrentes con filtros y paginación.
export const OBR_PagosMetodosRecurrentes_CTS = async (req, res) => {
  try {
    const { page, limit, offset } = obtenerPaginacion(req.query);

    const {
      q,
      alumno_id,
      sede_id,
      medio_pago_id,
      proveedor,
      marca_tarjeta,
      ultimos_cuatro,
      estado,
      fecha_alta_desde,
      fecha_alta_hasta,
      order_by = 'id',
      order_direction = 'DESC'
    } = req.query;

    const where = {};

    if (!esIdValido(sede_id)) {
      return responderError(res, 400, 'Debe indicar una sede válida.');
    }

    const alumnosSede = await AlumnosModel.findAll({
      where: { sede_id: Number(sede_id) },
      attributes: ['id']
    });
    where.alumno_id = {
      [Op.in]: alumnosSede.map((alumno) => Number(alumno.id))
    };

    if (q && String(q).trim() !== '') {
      where[Op.or] = [
        { proveedor: { [Op.like]: `%${String(q).trim()}%` } },
        { marca_tarjeta: { [Op.like]: `%${String(q).trim()}%` } },
        { ultimos_cuatro: { [Op.like]: `%${String(q).trim()}%` } },
        { titular: { [Op.like]: `%${String(q).trim()}%` } },
        { motivo_baja: { [Op.like]: `%${String(q).trim()}%` } }
      ];
    }

    if (alumno_id !== undefined) {
      if (!esIdValido(alumno_id)) {
        return responderError(
          res,
          400,
          'El filtro alumno_id debe ser un ID válido.'
        );
      }

      const alumnoId = Number(alumno_id);
      if (!alumnosSede.some((alumno) => Number(alumno.id) === alumnoId)) {
        return responderError(
          res,
          403,
          'El alumno indicado no pertenece a la sede seleccionada.'
        );
      }
      where.alumno_id = alumnoId;
    }

    if (medio_pago_id !== undefined) {
      if (!esIdValido(medio_pago_id)) {
        return responderError(
          res,
          400,
          'El filtro medio_pago_id debe ser un ID válido.'
        );
      }

      where.medio_pago_id = Number(medio_pago_id);
    }

    if (proveedor !== undefined && String(proveedor).trim() !== '') {
      where.proveedor = {
        [Op.like]: `%${String(proveedor).trim()}%`
      };
    }

    if (marca_tarjeta !== undefined && String(marca_tarjeta).trim() !== '') {
      where.marca_tarjeta = {
        [Op.like]: `%${String(marca_tarjeta).trim()}%`
      };
    }

    if (ultimos_cuatro !== undefined && String(ultimos_cuatro).trim() !== '') {
      if (String(ultimos_cuatro).length > 4) {
        return responderError(
          res,
          400,
          'El filtro ultimos_cuatro no puede superar los 4 caracteres.'
        );
      }

      where.ultimos_cuatro = String(ultimos_cuatro).trim();
    }

    if (estado !== undefined) {
      if (!ESTADOS_METODO_RECURRENTE_VALIDOS.includes(estado)) {
        return responderError(
          res,
          400,
          `El filtro estado debe ser uno de los siguientes valores: ${ESTADOS_METODO_RECURRENTE_VALIDOS.join(', ')}.`
        );
      }

      where.estado = estado;
    }

    if (fecha_alta_desde || fecha_alta_hasta) {
      where.fecha_alta = {};

      if (fecha_alta_desde) {
        if (!esFechaDateValida(fecha_alta_desde)) {
          return responderError(
            res,
            400,
            'El filtro fecha_alta_desde debe ser una fecha válida.'
          );
        }

        where.fecha_alta[Op.gte] = new Date(fecha_alta_desde);
      }

      if (fecha_alta_hasta) {
        if (!esFechaDateValida(fecha_alta_hasta)) {
          return responderError(
            res,
            400,
            'El filtro fecha_alta_hasta debe ser una fecha válida.'
          );
        }

        where.fecha_alta[Op.lte] = new Date(fecha_alta_hasta);
      }
    }

    const campoOrden = CAMPOS_ORDEN_VALIDOS.includes(order_by)
      ? order_by
      : 'id';
    const direccionOrden =
      String(order_direction).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows } = await PagosMetodosRecurrentesModel.findAndCountAll({
      where,
      attributes: ATRIBUTOS_SEGUROS_METODO_RECURRENTE,
      include: includeMetodoRecurrente,
      limit,
      offset,
      order: [[campoOrden, direccionOrden]]
    });

    return res.status(200).json({
      ok: true,
      message: 'Métodos recurrentes obtenidos correctamente.',
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit),
      data: rows
    });
  } catch (error) {
    console.error('Error en OBR_PagosMetodosRecurrentes_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener los métodos recurrentes.'
    );
  }
};

// Benjamin Orellana - 2026/05/30 - Obtiene un método recurrente por ID.
export const OBR_MetodoRecurrentePorId_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const metodo = await obtenerMetodoRecurrenteSeguroPorId(id);

    if (!metodo) {
      return responderError(
        res,
        404,
        'No se encontró el método recurrente solicitado.'
      );
    }

    return res.status(200).json({
      ok: true,
      message: 'Método recurrente obtenido correctamente.',
      data: metodo
    });
  } catch (error) {
    console.error('Error en OBR_MetodoRecurrentePorId_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener el método recurrente.'
    );
  }
};

// Benjamin Orellana - 2026/05/30 - Lista métodos recurrentes de un alumno.
export const OBR_MetodosRecurrentesPorAlumno_CTS = async (req, res) => {
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
      if (!ESTADOS_METODO_RECURRENTE_VALIDOS.includes(estado)) {
        return responderError(
          res,
          400,
          `El filtro estado debe ser uno de los siguientes valores: ${ESTADOS_METODO_RECURRENTE_VALIDOS.join(', ')}.`
        );
      }

      where.estado = estado;
    }

    const { count, rows } = await PagosMetodosRecurrentesModel.findAndCountAll({
      where,
      attributes: ATRIBUTOS_SEGUROS_METODO_RECURRENTE,
      include: includeMetodoRecurrente,
      limit,
      offset,
      order: [
        ['fecha_alta', 'DESC'],
        ['id', 'DESC']
      ]
    });

    return res.status(200).json({
      ok: true,
      message: 'Métodos recurrentes del alumno obtenidos correctamente.',
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit),
      data: rows
    });
  } catch (error) {
    console.error('Error en OBR_MetodosRecurrentesPorAlumno_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener los métodos recurrentes del alumno.'
    );
  }
};

// Benjamin Orellana - 2026/05/30 - Crea un método recurrente de pago.
export const CR_PagosMetodosRecurrentes_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const errores = validarPayloadMetodoRecurrente(req.body, true);

    if (errores.length > 0) {
      await transaction.rollback();
      return responderError(res, 400, 'Hay errores de validación.', errores);
    }

    const validacionReferencias = await validarReferenciasMetodoRecurrente(
      req.body,
      transaction
    );

    if (!validacionReferencias.ok) {
      await transaction.rollback();
      return responderError(
        res,
        validacionReferencias.status,
        validacionReferencias.message
      );
    }

    const {
      alumno_id,
      medio_pago_id,
      proveedor,
      customer_token,
      payment_method_token,
      marca_tarjeta,
      ultimos_cuatro,
      titular,
      estado,
      fecha_alta,
      fecha_baja,
      motivo_baja
    } = req.body;

    const nuevoMetodo = await PagosMetodosRecurrentesModel.create(
      {
        alumno_id: Number(alumno_id),
        medio_pago_id: Number(medio_pago_id),
        proveedor:
          proveedor !== undefined && proveedor !== null
            ? String(proveedor).trim()
            : null,
        customer_token:
          customer_token !== undefined && customer_token !== null
            ? String(customer_token).trim()
            : null,
        payment_method_token:
          payment_method_token !== undefined && payment_method_token !== null
            ? String(payment_method_token).trim()
            : null,
        marca_tarjeta:
          marca_tarjeta !== undefined && marca_tarjeta !== null
            ? String(marca_tarjeta).trim()
            : null,
        ultimos_cuatro:
          ultimos_cuatro !== undefined && ultimos_cuatro !== null
            ? String(ultimos_cuatro).trim()
            : null,
        titular:
          titular !== undefined && titular !== null
            ? String(titular).trim()
            : null,
        estado: estado || 'activo',
        fecha_alta:
          fecha_alta !== undefined ? new Date(fecha_alta) : new Date(),
        fecha_baja:
          fecha_baja !== undefined && fecha_baja !== null && fecha_baja !== ''
            ? new Date(fecha_baja)
            : null,
        motivo_baja:
          motivo_baja !== undefined && motivo_baja !== null
            ? String(motivo_baja).trim()
            : null
      },
      { transaction }
    );

    await transaction.commit();

    const metodoSeguro = await obtenerMetodoRecurrenteSeguroPorId(
      nuevoMetodo.id
    );

    return res.status(201).json({
      ok: true,
      message: 'Método recurrente creado correctamente.',
      data: metodoSeguro
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en CR_PagosMetodosRecurrentes_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al crear el método recurrente.'
    );
  }
};

// Benjamin Orellana - 2026/05/30 - Actualiza un método recurrente de pago.
export const UR_PagosMetodosRecurrentes_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const metodo = await PagosMetodosRecurrentesModel.findByPk(id, {
      transaction
    });

    if (!metodo) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró el método recurrente solicitado.'
      );
    }

    const errores = validarPayloadMetodoRecurrente(req.body, false);

    if (errores.length > 0) {
      await transaction.rollback();
      return responderError(res, 400, 'Hay errores de validación.', errores);
    }

    const validacionReferencias = await validarReferenciasMetodoRecurrente(
      req.body,
      transaction
    );

    if (!validacionReferencias.ok) {
      await transaction.rollback();
      return responderError(
        res,
        validacionReferencias.status,
        validacionReferencias.message
      );
    }

    const datosActualizar = {};

    if (req.body.alumno_id !== undefined) {
      datosActualizar.alumno_id = Number(req.body.alumno_id);
    }

    if (req.body.medio_pago_id !== undefined) {
      datosActualizar.medio_pago_id = Number(req.body.medio_pago_id);
    }

    if (req.body.proveedor !== undefined) {
      datosActualizar.proveedor =
        req.body.proveedor !== null ? String(req.body.proveedor).trim() : null;
    }

    if (req.body.customer_token !== undefined) {
      datosActualizar.customer_token =
        req.body.customer_token !== null
          ? String(req.body.customer_token).trim()
          : null;
    }

    if (req.body.payment_method_token !== undefined) {
      datosActualizar.payment_method_token =
        req.body.payment_method_token !== null
          ? String(req.body.payment_method_token).trim()
          : null;
    }

    if (req.body.marca_tarjeta !== undefined) {
      datosActualizar.marca_tarjeta =
        req.body.marca_tarjeta !== null
          ? String(req.body.marca_tarjeta).trim()
          : null;
    }

    if (req.body.ultimos_cuatro !== undefined) {
      datosActualizar.ultimos_cuatro =
        req.body.ultimos_cuatro !== null
          ? String(req.body.ultimos_cuatro).trim()
          : null;
    }

    if (req.body.titular !== undefined) {
      datosActualizar.titular =
        req.body.titular !== null ? String(req.body.titular).trim() : null;
    }

    if (req.body.estado !== undefined) {
      datosActualizar.estado = req.body.estado;
    }

    if (req.body.fecha_alta !== undefined) {
      datosActualizar.fecha_alta = new Date(req.body.fecha_alta);
    }

    if (req.body.fecha_baja !== undefined) {
      datosActualizar.fecha_baja =
        req.body.fecha_baja !== null && req.body.fecha_baja !== ''
          ? new Date(req.body.fecha_baja)
          : null;
    }

    if (req.body.motivo_baja !== undefined) {
      datosActualizar.motivo_baja =
        req.body.motivo_baja !== null
          ? String(req.body.motivo_baja).trim()
          : null;
    }

    datosActualizar.updated_at = new Date();

    await metodo.update(datosActualizar, { transaction });

    await transaction.commit();

    const metodoSeguro = await obtenerMetodoRecurrenteSeguroPorId(id);

    return res.status(200).json({
      ok: true,
      message: 'Método recurrente actualizado correctamente.',
      data: metodoSeguro
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_PagosMetodosRecurrentes_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al actualizar el método recurrente.'
    );
  }
};

// Benjamin Orellana - 2026/05/30 - Actualiza el estado de un método recurrente.
export const UR_EstadoMetodoRecurrente_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;
    const { estado, motivo_baja } = req.body;

    if (!estado || !ESTADOS_METODO_RECURRENTE_VALIDOS.includes(estado)) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        `El campo estado es obligatorio y debe ser uno de los siguientes valores: ${ESTADOS_METODO_RECURRENTE_VALIDOS.join(', ')}.`
      );
    }

    const metodo = await PagosMetodosRecurrentesModel.findByPk(id, {
      transaction
    });

    if (!metodo) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró el método recurrente solicitado.'
      );
    }

    const datosActualizar = {
      estado,
      updated_at: new Date()
    };

    if (['inactivo', 'vencido', 'error', 'eliminado'].includes(estado)) {
      datosActualizar.fecha_baja = metodo.fecha_baja || new Date();
      datosActualizar.motivo_baja =
        motivo_baja !== undefined && motivo_baja !== null
          ? String(motivo_baja).trim()
          : metodo.motivo_baja;
    }

    if (estado === 'activo') {
      datosActualizar.fecha_baja = null;
      datosActualizar.motivo_baja = null;
    }

    await metodo.update(datosActualizar, { transaction });

    await transaction.commit();

    const metodoSeguro = await obtenerMetodoRecurrenteSeguroPorId(id);

    return res.status(200).json({
      ok: true,
      message: 'Estado del método recurrente actualizado correctamente.',
      data: metodoSeguro
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_EstadoMetodoRecurrente_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al actualizar el estado del método recurrente.'
    );
  }
};

// Benjamin Orellana - 2026/07/13 - Obtiene el ID del alumno autenticado en el
// portal. Estas operaciones nunca confían en un alumno_id enviado por cliente.
const obtenerAlumnoAutenticadoId = (req) => {
  const alumnoId = req.alumno?.id || req.alumno?.alumno_id;

  return esIdValido(alumnoId) ? Number(alumnoId) : null;
};

const validarPropiedadMetodoRecurrente = async (metodoId, alumnoId) => {
  if (!esIdValido(metodoId) || !esIdValido(alumnoId)) return null;

  return PagosMetodosRecurrentesModel.findOne({
    where: {
      id: Number(metodoId),
      alumno_id: Number(alumnoId)
    },
    attributes: ['id', 'alumno_id']
  });
};

// Benjamin Orellana - 2026/07/13 - Lista los métodos recurrentes propios.
export const OBR_MisMetodosRecurrentes_CTS = async (req, res) => {
  const alumnoId = obtenerAlumnoAutenticadoId(req);

  if (!alumnoId) {
    return responderError(
      res,
      401,
      'No se pudo identificar al alumno autenticado.'
    );
  }

  req.params = {
    ...req.params,
    alumno_id: alumnoId
  };

  return OBR_MetodosRecurrentesPorAlumno_CTS(req, res);
};

// Benjamin Orellana - 2026/07/13 - Registra un método recurrente para el
// alumno autenticado. El estado inicial se fuerza a activo.
export const CR_MiMetodoRecurrente_CTS = async (req, res) => {
  const alumnoId = obtenerAlumnoAutenticadoId(req);

  if (!alumnoId) {
    return responderError(
      res,
      401,
      'No se pudo identificar al alumno autenticado.'
    );
  }

  const camposPermitidos = [
    'medio_pago_id',
    'proveedor',
    'customer_token',
    'payment_method_token',
    'marca_tarjeta',
    'ultimos_cuatro',
    'titular',
    'fecha_alta'
  ];

  const datosMetodo = camposPermitidos.reduce((datos, campo) => {
    if (req.body?.[campo] !== undefined) {
      datos[campo] = req.body[campo];
    }

    return datos;
  }, {});

  req.body = {
    ...datosMetodo,
    alumno_id: alumnoId,
    estado: 'activo',
    fecha_baja: null,
    motivo_baja: null
  };

  return CR_PagosMetodosRecurrentes_CTS(req, res);
};

// Benjamin Orellana - 2026/07/13 - Permite al alumno actualizar únicamente
// los datos de su propio método recurrente.
export const UR_MiMetodoRecurrente_CTS = async (req, res) => {
  try {
    const alumnoId = obtenerAlumnoAutenticadoId(req);

    if (!alumnoId) {
      return responderError(
        res,
        401,
        'No se pudo identificar al alumno autenticado.'
      );
    }

    const metodoPropio = await validarPropiedadMetodoRecurrente(
      req.params?.id,
      alumnoId
    );

    if (!metodoPropio) {
      return responderError(
        res,
        404,
        'No se encontró el método recurrente solicitado.'
      );
    }

    const camposPermitidos = [
      'medio_pago_id',
      'proveedor',
      'customer_token',
      'payment_method_token',
      'marca_tarjeta',
      'ultimos_cuatro',
      'titular'
    ];

    req.body = camposPermitidos.reduce((datos, campo) => {
      if (req.body?.[campo] !== undefined) {
        datos[campo] = req.body[campo];
      }

      return datos;
    }, {});

    return UR_PagosMetodosRecurrentes_CTS(req, res);
  } catch (error) {
    console.error('Error en UR_MiMetodoRecurrente_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al actualizar el método recurrente.'
    );
  }
};

// Benjamin Orellana - 2026/07/13 - El alumno puede activar o pausar sólo su
// propio débito automático; no puede asignar estados administrativos.
export const UR_EstadoMiMetodoRecurrente_CTS = async (req, res) => {
  try {
    const alumnoId = obtenerAlumnoAutenticadoId(req);

    if (!alumnoId) {
      return responderError(
        res,
        401,
        'No se pudo identificar al alumno autenticado.'
      );
    }

    const estado = String(req.body?.estado || '').toLowerCase();

    if (!['activo', 'inactivo'].includes(estado)) {
      return responderError(
        res,
        400,
        'El alumno sólo puede activar o pausar el débito automático.'
      );
    }

    const metodoPropio = await validarPropiedadMetodoRecurrente(
      req.params?.id,
      alumnoId
    );

    if (!metodoPropio) {
      return responderError(
        res,
        404,
        'No se encontró el método recurrente solicitado.'
      );
    }

    req.body = {
      estado,
      motivo_baja:
        estado === 'inactivo'
          ? 'Método pausado por el alumno desde su portal.'
          : null
    };

    return UR_EstadoMetodoRecurrente_CTS(req, res);
  } catch (error) {
    console.error('Error en UR_EstadoMiMetodoRecurrente_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al actualizar el estado del método recurrente.'
    );
  }
};

// Benjamin Orellana - 2026/05/30 - Baja lógica de método recurrente, cambia estado a eliminado.
export const DR_PagosMetodosRecurrentes_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;
    const { motivo_baja } = req.body;

    const metodo = await PagosMetodosRecurrentesModel.findByPk(id, {
      transaction
    });

    if (!metodo) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró el método recurrente solicitado.'
      );
    }

    await metodo.update(
      {
        estado: 'eliminado',
        fecha_baja: new Date(),
        motivo_baja:
          motivo_baja !== undefined && motivo_baja !== null
            ? String(motivo_baja).trim()
            : metodo.motivo_baja,
        updated_at: new Date()
      },
      { transaction }
    );

    await transaction.commit();

    const metodoSeguro = await obtenerMetodoRecurrenteSeguroPorId(id);

    return res.status(200).json({
      ok: true,
      message: 'Método recurrente eliminado lógicamente correctamente.',
      data: metodoSeguro
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en DR_PagosMetodosRecurrentes_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al eliminar lógicamente el método recurrente.'
    );
  }
};

// Benjamin Orellana - 2026/05/30 - Elimina físicamente un método recurrente.
export const ER_PagosMetodosRecurrentes_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const metodo = await PagosMetodosRecurrentesModel.findByPk(id, {
      transaction
    });

    if (!metodo) {
      await transaction.rollback();

      return responderError(
        res,
        404,
        'No se encontró el método recurrente solicitado.'
      );
    }

    await metodo.destroy({ transaction });

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Método recurrente eliminado físicamente correctamente.',
      data: {
        id: Number(id)
      }
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en ER_PagosMetodosRecurrentes_CTS:', error);

    if (error?.name === 'SequelizeForeignKeyConstraintError') {
      return responderError(
        res,
        409,
        'No se puede eliminar físicamente el método recurrente porque tiene registros relacionados.'
      );
    }

    return responderError(
      res,
      500,
      'Error interno al eliminar físicamente el método recurrente.'
    );
  }
};
