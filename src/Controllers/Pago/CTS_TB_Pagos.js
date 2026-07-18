/*
 * Benjamin Orellana - 2026/05/30 - Controlador Sequelize para pagos de alumnos PREMIUM.
 */

import { Op } from 'sequelize';
import db from '../../DataBase/db.js';

import PagosModel from '../../Models/Pago/MD_TB_Pagos.js';
import PagosMensualidadesModel from '../../Models/Pago/MD_TB_PagosMensualidades.js';
import PagosMediosPagoModel from '../../Models/Pago/MD_TB_PagosMediosPago.js';

import AlumnosModel from '../../Models/Alumno/MD_TB_Alumnos.js';
import AlumnosMembresiasModel from '../../Models/Alumno/MD_TB_AlumnosMembresias.js';
import SedesModel from '../../Models/Sede/MD_TB_Sedes.js';
import UsuariosModel from '../../Models/Usuario/MD_TB_Usuarios.js';

// Benjamin Orellana - 2026/05/30 - Modelo de movimientos financieros para registrar ingresos por pagos confirmados.
import FinanzasMovimientosModel from '../../Models/Finanzas/MD_TB_FinanzasMovimientos.js';

const ESTADOS_PAGO_VALIDOS = [
  'pendiente_validacion',
  'confirmado',
  'rechazado',
  'anulado'
];

const CAMPOS_ORDEN_VALIDOS = [
  'id',
  'mensualidad_id',
  'alumno_id',
  'sede_id',
  'medio_pago_id',
  'usuario_registro_id',
  'usuario_validacion_id',
  'fecha_pago',
  'monto',
  'estado',
  'referencia',
  'comprobante_url',
  'created_at',
  'updated_at'
];

// Benjamin Orellana - 2026/05/30 - Normaliza paginación para listados de pagos.
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

// Benjamin Orellana - 2026/05/30 - Valida importes DECIMAL para pagos.
const esImportePagoValido = (valor) => {
  if (valor === null || valor === undefined || valor === '') return false;

  const numero = Number(valor);

  return !Number.isNaN(numero) && numero > 0;
};

// Benjamin Orellana - 2026/05/30 - Valida fechas DATE.
const esFechaDateValida = (valor) => {
  if (!valor) return false;

  const fecha = new Date(valor);

  return !Number.isNaN(fecha.getTime());
};

// Benjamin Orellana - 2026/05/30 - Obtiene fecha actual en formato DATEONLY.
const obtenerFechaActualDateOnly = () => {
  return new Date().toISOString().slice(0, 10);
};

// Benjamin Orellana - 2026/05/30 - Arma respuesta estándar de error.
const responderError = (res, status, message, data = null) => {
  return res.status(status).json({
    ok: false,
    message,
    data
  });
};

// Benjamin Orellana - 2026/05/30 - Include permitido según relaciones reales del módulo Pago.
const includePago = [
  {
    model: PagosMensualidadesModel,
    as: 'mensualidad',
    required: false
  },
  {
    model: AlumnosModel,
    as: 'alumno'
  },
  {
    model: SedesModel,
    as: 'sede'
  },
  {
    model: PagosMediosPagoModel,
    as: 'medio_pago'
  }
];

// Benjamin Orellana - 2026/05/30 - Calcula saldo de una mensualidad.
const calcularSaldoMensualidad = (montoTotal, montoPagado) => {
  const total = Number(montoTotal || 0);
  const pagado = Number(montoPagado || 0);

  return Math.max(total - pagado, 0).toFixed(2);
};

// Benjamin Orellana - 2026/05/30 - Determina estado de mensualidad según pagos y vencimiento.
const determinarEstadoMensualidad = (
  montoTotal,
  montoPagado,
  fechaVencimiento,
  estadoActual = 'pendiente'
) => {
  const total = Number(montoTotal || 0);
  const pagado = Number(montoPagado || 0);
  const saldo = Number(calcularSaldoMensualidad(total, pagado));
  const fechaActual = obtenerFechaActualDateOnly();

  if (estadoActual === 'anulada') return 'anulada';

  if (saldo <= 0) return 'pagada';

  if (fechaVencimiento && fechaVencimiento < fechaActual) return 'vencida';

  if (pagado > 0 && saldo > 0) return 'parcial';

  return 'pendiente';
};

// Benjamin Orellana - 2026/05/30 - Valida payload de creación y edición de pagos.
const validarPayloadPago = (body, esCreacion = true) => {
  const errores = [];

  if (
    body.mensualidad_id !== undefined &&
    body.mensualidad_id !== null &&
    body.mensualidad_id !== ''
  ) {
    if (!esIdValido(body.mensualidad_id)) {
      errores.push('El campo mensualidad_id debe ser un ID válido o null.');
    }
  }

  if (esCreacion || body.alumno_id !== undefined) {
    if (!esIdValido(body.alumno_id)) {
      errores.push(
        'El campo alumno_id es obligatorio y debe ser un ID válido.'
      );
    }
  }

  if (esCreacion || body.sede_id !== undefined) {
    if (!esIdValido(body.sede_id)) {
      errores.push('El campo sede_id es obligatorio y debe ser un ID válido.');
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
    body.usuario_registro_id !== undefined &&
    body.usuario_registro_id !== null &&
    body.usuario_registro_id !== ''
  ) {
    if (!esIdValido(body.usuario_registro_id)) {
      errores.push(
        'El campo usuario_registro_id debe ser un ID válido o null.'
      );
    }
  }

  if (
    body.usuario_validacion_id !== undefined &&
    body.usuario_validacion_id !== null &&
    body.usuario_validacion_id !== ''
  ) {
    if (!esIdValido(body.usuario_validacion_id)) {
      errores.push(
        'El campo usuario_validacion_id debe ser un ID válido o null.'
      );
    }
  }

  if (body.fecha_pago !== undefined && !esFechaDateValida(body.fecha_pago)) {
    errores.push('El campo fecha_pago debe ser una fecha válida.');
  }

  if (esCreacion || body.monto !== undefined) {
    if (!esImportePagoValido(body.monto)) {
      errores.push('El campo monto es obligatorio y debe ser mayor a 0.');
    }
  }

  if (
    body.estado !== undefined &&
    !ESTADOS_PAGO_VALIDOS.includes(body.estado)
  ) {
    errores.push(
      `El campo estado debe ser uno de los siguientes valores: ${ESTADOS_PAGO_VALIDOS.join(', ')}.`
    );
  }

  if (
    body.referencia !== undefined &&
    body.referencia !== null &&
    String(body.referencia).length > 120
  ) {
    errores.push('El campo referencia no puede superar los 120 caracteres.');
  }

  if (
    body.comprobante_url !== undefined &&
    body.comprobante_url !== null &&
    String(body.comprobante_url).length > 255
  ) {
    errores.push(
      'El campo comprobante_url no puede superar los 255 caracteres.'
    );
  }

  return errores;
};

// Benjamin Orellana - 2026/05/30 - Valida relaciones base del pago.
const validarRelacionesPago = async (body, transaction) => {
  const {
    mensualidad_id,
    alumno_id,
    sede_id,
    medio_pago_id,
    usuario_registro_id,
    usuario_validacion_id
  } = body;

  const alumno = await AlumnosModel.findByPk(alumno_id, { transaction });

  if (!alumno) {
    return {
      ok: false,
      status: 404,
      message: 'No se encontró el alumno indicado en alumno_id.'
    };
  }

  const sede = await SedesModel.findByPk(sede_id, { transaction });

  if (!sede) {
    return {
      ok: false,
      status: 404,
      message: 'No se encontró la sede indicada en sede_id.'
    };
  }

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

  let mensualidad = null;

  if (
    mensualidad_id !== undefined &&
    mensualidad_id !== null &&
    mensualidad_id !== ''
  ) {
    mensualidad = await PagosMensualidadesModel.findByPk(mensualidad_id, {
      transaction
    });

    if (!mensualidad) {
      return {
        ok: false,
        status: 404,
        message: 'No se encontró la mensualidad indicada en mensualidad_id.'
      };
    }

    if (Number(mensualidad.alumno_id) !== Number(alumno_id)) {
      return {
        ok: false,
        status: 400,
        message: 'La mensualidad indicada no pertenece al alumno informado.'
      };
    }

    if (Number(mensualidad.sede_id) !== Number(sede_id)) {
      return {
        ok: false,
        status: 400,
        message: 'La mensualidad indicada no pertenece a la sede informada.'
      };
    }

    if (mensualidad.estado === 'anulada') {
      return {
        ok: false,
        status: 400,
        message: 'No se puede registrar un pago sobre una mensualidad anulada.'
      };
    }
  }

  if (
    usuario_registro_id !== undefined &&
    usuario_registro_id !== null &&
    usuario_registro_id !== ''
  ) {
    const usuarioRegistro = await UsuariosModel.findByPk(usuario_registro_id, {
      transaction
    });

    if (!usuarioRegistro) {
      return {
        ok: false,
        status: 404,
        message: 'No se encontró el usuario indicado en usuario_registro_id.'
      };
    }
  }

  if (
    usuario_validacion_id !== undefined &&
    usuario_validacion_id !== null &&
    usuario_validacion_id !== ''
  ) {
    const usuarioValidacion = await UsuariosModel.findByPk(
      usuario_validacion_id,
      { transaction }
    );

    if (!usuarioValidacion) {
      return {
        ok: false,
        status: 404,
        message: 'No se encontró el usuario indicado en usuario_validacion_id.'
      };
    }
  }

  return {
    ok: true,
    medioPago,
    mensualidad
  };
};

// Benjamin Orellana - 2026/05/30 - Convierte la fecha de pago a formato DATEONLY para finanzas_movimientos.
const obtenerFechaMovimientoDesdePago = (fechaPago) => {
  if (!fechaPago) return obtenerFechaActualDateOnly();

  const fecha = new Date(fechaPago);

  if (Number.isNaN(fecha.getTime())) return obtenerFechaActualDateOnly();

  return fecha.toISOString().slice(0, 10);
};

// Benjamin Orellana - 2026/05/30 - Registra ingreso financiero automático al confirmar un pago de alumno.
const crearMovimientoIngresoPagoAlumno = async (pago, transaction) => {
  if (!pago || !pago.id) {
    return {
      ok: false,
      status: 400,
      message:
        'No se pudo registrar el movimiento financiero porque el pago no es válido.'
    };
  }

  const movimientoExistente = await FinanzasMovimientosModel.findOne({
    where: {
      pago_id: Number(pago.id),
      tipo: 'ingreso',
      origen: 'pago_alumno',
      estado: 'vigente'
    },
    transaction
  });

  if (movimientoExistente) {
    return {
      ok: true,
      data: movimientoExistente
    };
  }

  const nuevoMovimiento = await FinanzasMovimientosModel.create(
    {
      sede_id:
        pago.sede_id !== undefined && pago.sede_id !== null
          ? Number(pago.sede_id)
          : null,
      categoria_id: null,
      pago_id: Number(pago.id),
      tipo: 'ingreso',
      fecha: obtenerFechaMovimientoDesdePago(pago.fecha_pago),
      descripcion: `Ingreso por pago de alumno #${pago.alumno_id}`,
      monto: Number(pago.monto).toFixed(2),
      origen: 'pago_alumno',
      comprobante_url: pago.comprobante_url || null,
      referencia: pago.referencia || `PAGO-${pago.id}`,
      usuario_registro_id:
        pago.usuario_validacion_id || pago.usuario_registro_id || null,
      estado: 'vigente',
      observaciones: pago.observaciones || null
    },
    { transaction }
  );

  return {
    ok: true,
    data: nuevoMovimiento
  };
};

// Benjamin Orellana - 2026/05/30 - Anula movimientos financieros vigentes asociados a un pago.
const anularMovimientoIngresoPagoAlumno = async (
  pago_id,
  observaciones,
  transaction,
  desvincularPago = false
) => {
  if (!pago_id) {
    return {
      ok: true,
      total: 0
    };
  }

  const movimientos = await FinanzasMovimientosModel.findAll({
    where: {
      pago_id: Number(pago_id),
      tipo: 'ingreso',
      origen: 'pago_alumno',
      estado: 'vigente'
    },
    transaction
  });

  for (const movimiento of movimientos) {
    await movimiento.update(
      {
        estado: 'anulado',
        pago_id: desvincularPago ? null : movimiento.pago_id,
        observaciones:
          observaciones !== undefined && observaciones !== null
            ? String(observaciones).trim()
            : movimiento.observaciones,
        updated_at: new Date()
      },
      { transaction }
    );
  }

  return {
    ok: true,
    total: movimientos.length
  };
};

// Benjamin Orellana - 2026/05/30 - Aplica un pago confirmado sobre una mensualidad.
const aplicarPagoConfirmadoEnMensualidad = async (
  mensualidad_id,
  montoPago,
  transaction
) => {
  if (!mensualidad_id) return null;

  const mensualidad = await PagosMensualidadesModel.findByPk(mensualidad_id, {
    transaction
  });

  if (!mensualidad) {
    return {
      ok: false,
      status: 404,
      message: 'No se encontró la mensualidad asociada al pago.'
    };
  }

  if (mensualidad.estado === 'anulada') {
    return {
      ok: false,
      status: 400,
      message: 'No se puede confirmar un pago sobre una mensualidad anulada.'
    };
  }

  const monto = Number(montoPago);
  const saldoActual = Number(mensualidad.saldo || 0);

  if (monto > saldoActual) {
    return {
      ok: false,
      status: 400,
      message:
        'El monto del pago no puede superar el saldo pendiente de la mensualidad.'
    };
  }

  const nuevoMontoPagado = Number(mensualidad.monto_pagado || 0) + monto;
  const nuevoSaldo = calcularSaldoMensualidad(
    mensualidad.monto_total,
    nuevoMontoPagado
  );
  const nuevoEstado = determinarEstadoMensualidad(
    mensualidad.monto_total,
    nuevoMontoPagado,
    mensualidad.fecha_vencimiento,
    mensualidad.estado
  );

  await mensualidad.update(
    {
      monto_pagado: nuevoMontoPagado.toFixed(2),
      saldo: nuevoSaldo,
      estado: nuevoEstado,
      updated_at: new Date()
    },
    { transaction }
  );

  return {
    ok: true,
    mensualidad
  };
};

// Benjamin Orellana - 2026/05/30 - Revierte el impacto de un pago confirmado sobre una mensualidad.
const revertirPagoConfirmadoEnMensualidad = async (
  mensualidad_id,
  montoPago,
  transaction
) => {
  if (!mensualidad_id) return null;

  const mensualidad = await PagosMensualidadesModel.findByPk(mensualidad_id, {
    transaction
  });

  if (!mensualidad) {
    return {
      ok: false,
      status: 404,
      message: 'No se encontró la mensualidad asociada al pago.'
    };
  }

  if (mensualidad.estado === 'anulada') {
    return {
      ok: true,
      mensualidad
    };
  }

  const monto = Number(montoPago);
  const montoPagadoActual = Number(mensualidad.monto_pagado || 0);
  const nuevoMontoPagado = Math.max(montoPagadoActual - monto, 0);
  const nuevoSaldo = calcularSaldoMensualidad(
    mensualidad.monto_total,
    nuevoMontoPagado
  );
  const nuevoEstado = determinarEstadoMensualidad(
    mensualidad.monto_total,
    nuevoMontoPagado,
    mensualidad.fecha_vencimiento,
    mensualidad.estado
  );

  await mensualidad.update(
    {
      monto_pagado: nuevoMontoPagado.toFixed(2),
      saldo: nuevoSaldo,
      estado: nuevoEstado,
      updated_at: new Date()
    },
    { transaction }
  );

  return {
    ok: true,
    mensualidad
  };
};

// Benjamin Orellana - 2026/06/15 - Sincroniza alumno y membresía luego de confirmar un pago.
const sincronizarAlumnoMembresiaPorPagoConfirmado = async (
  pago,
  transaction
) => {
  if (!pago || !pago.mensualidad_id) {
    return {
      ok: true,
      data: null
    };
  }

  const mensualidad = await PagosMensualidadesModel.findByPk(
    pago.mensualidad_id,
    { transaction }
  );

  if (!mensualidad) {
    return {
      ok: false,
      status: 404,
      message: 'No se encontró la mensualidad asociada al pago confirmado.'
    };
  }

  const alumno = await AlumnosModel.findByPk(pago.alumno_id, {
    transaction
  });

  if (!alumno) {
    return {
      ok: false,
      status: 404,
      message: 'No se encontró el alumno asociado al pago confirmado.'
    };
  }

  let membresia = null;

  if (mensualidad.membresia_id) {
    membresia = await AlumnosMembresiasModel.findByPk(
      mensualidad.membresia_id,
      { transaction }
    );
  }

  if (!membresia) {
    membresia = await AlumnosMembresiasModel.findOne({
      where: {
        alumno_id: Number(pago.alumno_id),
        sede_id: Number(pago.sede_id)
      },
      order: [
        ['fecha_inicio', 'DESC'],
        ['id', 'DESC']
      ],
      transaction
    });
  }

  if (!membresia) {
    return {
      ok: true,
      data: {
        alumno,
        mensualidad,
        membresia: null
      }
    };
  }

  const mensualidadPagada = mensualidad.estado === 'pagada';
  const mensualidadConSaldo = Number(mensualidad.saldo || 0) > 0;

  if (mensualidadPagada) {
    await membresia.update(
      {
        estado: 'activa',
        updated_at: new Date()
      },
      { transaction }
    );

    await alumno.update(
      {
        estado: 'activo',
        sede_id: Number(membresia.sede_id),
        fecha_inicio: alumno.fecha_inicio || membresia.fecha_inicio,
        usuario_validacion_id:
          alumno.usuario_validacion_id ||
          pago.usuario_validacion_id ||
          pago.usuario_registro_id ||
          null,
        updated_at: new Date()
      },
      { transaction }
    );

    return {
      ok: true,
      data: {
        alumno,
        mensualidad,
        membresia,
        estado_alumno: 'activo',
        estado_membresia: 'activa'
      }
    };
  }

  if (mensualidadConSaldo) {
    await membresia.update(
      {
        estado: 'pendiente_pago',
        updated_at: new Date()
      },
      { transaction }
    );

    await alumno.update(
      {
        estado: 'pendiente_pago',
        sede_id: Number(membresia.sede_id),
        updated_at: new Date()
      },
      { transaction }
    );

    return {
      ok: true,
      data: {
        alumno,
        mensualidad,
        membresia,
        estado_alumno: 'pendiente_pago',
        estado_membresia: 'pendiente_pago'
      }
    };
  }

  return {
    ok: true,
    data: {
      alumno,
      mensualidad,
      membresia
    }
  };
};

// Benjamin Orellana - 2026/06/15 - Normaliza texto de búsqueda para pagos.
const normalizarTextoBusqueda = (value) => {
  if (value === undefined || value === null) return null;

  const texto = String(value).trim().replace(/\s+/g, ' ');

  return texto.length > 0 ? texto : null;
};

// Benjamin Orellana - 2026/06/15 - Arma búsqueda flexible de alumno por nombre, apellido, DNI, email o teléfono.
const construirWhereBusquedaAlumnoPago = (search) => {
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

// Benjamin Orellana - 2026/06/15 - Obtiene IDs de alumnos para filtrar pagos por texto.
const buscarIdsAlumnosPorTexto = async (search) => {
  const texto = normalizarTextoBusqueda(search);

  if (!texto) return [];

  const alumnos = await AlumnosModel.findAll({
    where: construirWhereBusquedaAlumnoPago(texto),
    attributes: ['id'],
    limit: 500
  });

  return alumnos.map((alumno) => Number(alumno.id));
};
// Benjamin Orellana - 2026/05/30 - Lista pagos con filtros y paginación.
export const OBR_Pagos_CTS = async (req, res) => {
  try {
    const { page, limit, offset } = obtenerPaginacion(req.query);

    const {
      q,
      mensualidad_id,
      alumno_id,
      alumno_q,
      sede_id,
      medio_pago_id,
      estado,
      fecha_desde,
      fecha_hasta,
      order_by = 'id',
      order_direction = 'DESC'
    } = req.query;

    const where = {};

    const search = normalizarTextoBusqueda(q);

    if (search) {
      const alumnoIds = await buscarIdsAlumnosPorTexto(search);

      const condicionesBusqueda = [
        { referencia: { [Op.like]: `%${search}%` } },
        { comprobante_url: { [Op.like]: `%${search}%` } },
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

    if (mensualidad_id !== undefined) {
      if (mensualidad_id === 'null' || mensualidad_id === '') {
        where.mensualidad_id = null;
      } else {
        if (!esIdValido(mensualidad_id)) {
          return responderError(
            res,
            400,
            'El filtro mensualidad_id debe ser un ID válido o null.'
          );
        }

        where.mensualidad_id = Number(mensualidad_id);
      }
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
      const alumnoIds = await buscarIdsAlumnosPorTexto(alumno_q);

      where.alumno_id = alumnoIds.length
        ? {
            [Op.in]: alumnoIds
          }
        : -1;
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

    if (estado !== undefined) {
      if (!ESTADOS_PAGO_VALIDOS.includes(estado)) {
        return responderError(
          res,
          400,
          `El filtro estado debe ser uno de los siguientes valores: ${ESTADOS_PAGO_VALIDOS.join(', ')}.`
        );
      }

      where.estado = estado;
    }

    if (fecha_desde || fecha_hasta) {
      where.fecha_pago = {};

      if (fecha_desde) {
        if (!esFechaDateValida(fecha_desde)) {
          return responderError(
            res,
            400,
            'El filtro fecha_desde debe ser una fecha válida.'
          );
        }

        where.fecha_pago[Op.gte] = new Date(fecha_desde);
      }

      if (fecha_hasta) {
        if (!esFechaDateValida(fecha_hasta)) {
          return responderError(
            res,
            400,
            'El filtro fecha_hasta debe ser una fecha válida.'
          );
        }

        where.fecha_pago[Op.lte] = new Date(fecha_hasta);
      }
    }

    const campoOrden = CAMPOS_ORDEN_VALIDOS.includes(order_by)
      ? order_by
      : 'id';
    const direccionOrden =
      String(order_direction).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows } = await PagosModel.findAndCountAll({
      where,
      include: includePago,
      limit,
      offset,
      order: [[campoOrden, direccionOrden]]
    });

    return res.status(200).json({
      ok: true,
      message: 'Pagos obtenidos correctamente.',
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit),
      data: rows
    });
  } catch (error) {
    console.error('Error en OBR_Pagos_CTS:', error);

    return responderError(res, 500, 'Error interno al obtener los pagos.');
  }
};

// Benjamin Orellana - 2026/05/30 - Obtiene un pago por ID.
export const OBR_PagoPorId_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const pago = await PagosModel.findByPk(id, {
      include: includePago
    });

    if (!pago) {
      return responderError(res, 404, 'No se encontró el pago solicitado.');
    }

    return res.status(200).json({
      ok: true,
      message: 'Pago obtenido correctamente.',
      data: pago
    });
  } catch (error) {
    console.error('Error en OBR_PagoPorId_CTS:', error);

    return responderError(res, 500, 'Error interno al obtener el pago.');
  }
};

// Benjamin Orellana - 2026/05/30 - Lista pagos de un alumno.
export const OBR_PagosPorAlumno_CTS = async (req, res) => {
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
      if (!ESTADOS_PAGO_VALIDOS.includes(estado)) {
        return responderError(
          res,
          400,
          `El filtro estado debe ser uno de los siguientes valores: ${ESTADOS_PAGO_VALIDOS.join(', ')}.`
        );
      }

      where.estado = estado;
    }

    const { count, rows } = await PagosModel.findAndCountAll({
      where,
      include: includePago,
      limit,
      offset,
      order: [
        ['fecha_pago', 'DESC'],
        ['id', 'DESC']
      ]
    });

    return res.status(200).json({
      ok: true,
      message: 'Pagos del alumno obtenidos correctamente.',
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit),
      data: rows
    });
  } catch (error) {
    console.error('Error en OBR_PagosPorAlumno_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener los pagos del alumno.'
    );
  }
};

// Benjamin Orellana - 2026/05/30 - Lista pagos de una mensualidad.
export const OBR_PagosPorMensualidad_CTS = async (req, res) => {
  try {
    const { mensualidad_id } = req.params;
    const { page, limit, offset } = obtenerPaginacion(req.query);

    if (!esIdValido(mensualidad_id)) {
      return responderError(
        res,
        400,
        'El parámetro mensualidad_id debe ser un ID válido.'
      );
    }

    const { count, rows } = await PagosModel.findAndCountAll({
      where: {
        mensualidad_id: Number(mensualidad_id),
        sede_id: Number(req.financial_sede_id)
      },
      include: includePago,
      limit,
      offset,
      order: [
        ['fecha_pago', 'DESC'],
        ['id', 'DESC']
      ]
    });

    return res.status(200).json({
      ok: true,
      message: 'Pagos de la mensualidad obtenidos correctamente.',
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit),
      data: rows
    });
  } catch (error) {
    console.error('Error en OBR_PagosPorMensualidad_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener los pagos de la mensualidad.'
    );
  }
};

// Benjamin Orellana - 2026/05/30 - Lista historial de pagos de un alumno.
export const OBR_HistorialPagosAlumno_CTS = async (req, res) => {
  try {
    const { alumno_id } = req.params;
    const { page, limit, offset } = obtenerPaginacion(req.query);

    if (!esIdValido(alumno_id)) {
      return responderError(
        res,
        400,
        'El parámetro alumno_id debe ser un ID válido.'
      );
    }

    const { count, rows } = await PagosModel.findAndCountAll({
      where: {
        alumno_id: Number(alumno_id),
        sede_id: Number(req.financial_sede_id)
      },
      include: includePago,
      limit,
      offset,
      order: [
        ['fecha_pago', 'DESC'],
        ['id', 'DESC']
      ]
    });

    return res.status(200).json({
      ok: true,
      message: 'Historial de pagos del alumno obtenido correctamente.',
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit),
      data: rows
    });
  } catch (error) {
    console.error('Error en OBR_HistorialPagosAlumno_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener el historial de pagos del alumno.'
    );
  }
};

// Benjamin Orellana - 2026/07/13 - Consulta segura del historial para el
// portal del alumno. El ID se obtiene del token y nunca desde la URL.
export const OBR_MiHistorialPagos_CTS = async (req, res) => {
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

  return OBR_HistorialPagosAlumno_CTS(req, res);
};

// Benjamin Orellana - 2026/05/30 - Crea un pago.
export const CR_Pagos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const errores = validarPayloadPago(req.body, true);

    if (errores.length > 0) {
      await transaction.rollback();
      return responderError(res, 400, 'Hay errores de validación.', errores);
    }

    const validacionRelaciones = await validarRelacionesPago(
      req.body,
      transaction
    );

    if (!validacionRelaciones.ok) {
      await transaction.rollback();
      return responderError(
        res,
        validacionRelaciones.status,
        validacionRelaciones.message
      );
    }

    const {
      mensualidad_id,
      alumno_id,
      sede_id,
      medio_pago_id,
      usuario_registro_id,
      usuario_validacion_id,
      fecha_pago,
      monto,
      estado,
      referencia,
      comprobante_url,
      observaciones
    } = req.body;

    const estadoNormalizado =
      estado ||
      (Number(validacionRelaciones.medioPago.requiere_validacion) === 1
        ? 'pendiente_validacion'
        : 'confirmado');

    if (estadoNormalizado === 'confirmado' && mensualidad_id) {
      const aplicacionPago = await aplicarPagoConfirmadoEnMensualidad(
        mensualidad_id,
        monto,
        transaction
      );

      if (aplicacionPago && !aplicacionPago.ok) {
        await transaction.rollback();
        return responderError(
          res,
          aplicacionPago.status,
          aplicacionPago.message
        );
      }
    }

    const nuevoPago = await PagosModel.create(
      {
        mensualidad_id:
          mensualidad_id !== undefined &&
          mensualidad_id !== null &&
          mensualidad_id !== ''
            ? Number(mensualidad_id)
            : null,
        alumno_id: Number(alumno_id),
        sede_id: Number(sede_id),
        medio_pago_id: Number(medio_pago_id),
        usuario_registro_id:
          usuario_registro_id !== undefined &&
          usuario_registro_id !== null &&
          usuario_registro_id !== ''
            ? Number(usuario_registro_id)
            : null,
        usuario_validacion_id:
          usuario_validacion_id !== undefined &&
          usuario_validacion_id !== null &&
          usuario_validacion_id !== ''
            ? Number(usuario_validacion_id)
            : null,
        fecha_pago:
          fecha_pago !== undefined ? new Date(fecha_pago) : new Date(),
        monto: Number(monto).toFixed(2),
        estado: estadoNormalizado,
        referencia:
          referencia !== undefined && referencia !== null
            ? String(referencia).trim()
            : null,
        comprobante_url:
          comprobante_url !== undefined && comprobante_url !== null
            ? String(comprobante_url).trim()
            : null,
        observaciones:
          observaciones !== undefined && observaciones !== null
            ? String(observaciones).trim()
            : null
      },
      { transaction }
    );

    // Benjamin Orellana - 2026/05/30 - Si el pago nace confirmado, registra automáticamente el ingreso financiero.
    if (estadoNormalizado === 'confirmado') {
      const movimientoFinanciero = await crearMovimientoIngresoPagoAlumno(
        nuevoPago,
        transaction
      );

      if (!movimientoFinanciero.ok) {
        await transaction.rollback();
        return responderError(
          res,
          movimientoFinanciero.status,
          movimientoFinanciero.message
        );
      }
    }

    await transaction.commit();

    const pagoCompleto = await PagosModel.findByPk(nuevoPago.id, {
      include: includePago
    });

    return res.status(201).json({
      ok: true,
      message: 'Pago creado correctamente.',
      data: pagoCompleto
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en CR_Pagos_CTS:', error);

    return responderError(res, 500, 'Error interno al crear el pago.');
  }
};

// Benjamin Orellana - 2026/05/30 - Actualiza un pago existente sin alterar impacto financiero confirmado.
export const UR_Pagos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const pago = await PagosModel.findByPk(id, { transaction });

    if (!pago) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el pago solicitado.');
    }

    if (req.body.estado !== undefined) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'Para cambiar el estado del pago usá los endpoints específicos de confirmar, rechazar o anular.'
      );
    }

    const camposBloqueadosSiConfirmado = [
      'mensualidad_id',
      'alumno_id',
      'sede_id',
      'medio_pago_id',
      'monto'
    ];

    const intentaModificarCampoCritico = camposBloqueadosSiConfirmado.some(
      (campo) => req.body[campo] !== undefined
    );

    if (pago.estado === 'confirmado' && intentaModificarCampoCritico) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'No se pueden modificar campos críticos de un pago confirmado. Primero anulá el pago y luego registrá uno nuevo.'
      );
    }

    const errores = validarPayloadPago(req.body, false);

    if (errores.length > 0) {
      await transaction.rollback();
      return responderError(res, 400, 'Hay errores de validación.', errores);
    }

    const datosActualizar = {};

    if (req.body.mensualidad_id !== undefined) {
      if (req.body.mensualidad_id === null || req.body.mensualidad_id === '') {
        datosActualizar.mensualidad_id = null;
      } else {
        const mensualidad = await PagosMensualidadesModel.findByPk(
          req.body.mensualidad_id,
          { transaction }
        );

        if (!mensualidad) {
          await transaction.rollback();
          return responderError(
            res,
            404,
            'No se encontró la mensualidad indicada en mensualidad_id.'
          );
        }

        datosActualizar.mensualidad_id = Number(req.body.mensualidad_id);
      }
    }

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

    if (req.body.medio_pago_id !== undefined) {
      const medioPago = await PagosMediosPagoModel.findByPk(
        req.body.medio_pago_id,
        { transaction }
      );

      if (!medioPago) {
        await transaction.rollback();
        return responderError(
          res,
          404,
          'No se encontró el medio de pago indicado en medio_pago_id.'
        );
      }

      datosActualizar.medio_pago_id = Number(req.body.medio_pago_id);
    }

    if (req.body.usuario_registro_id !== undefined) {
      if (
        req.body.usuario_registro_id === null ||
        req.body.usuario_registro_id === ''
      ) {
        datosActualizar.usuario_registro_id = null;
      } else {
        const usuarioRegistro = await UsuariosModel.findByPk(
          req.body.usuario_registro_id,
          { transaction }
        );

        if (!usuarioRegistro) {
          await transaction.rollback();
          return responderError(
            res,
            404,
            'No se encontró el usuario indicado en usuario_registro_id.'
          );
        }

        datosActualizar.usuario_registro_id = Number(
          req.body.usuario_registro_id
        );
      }
    }

    if (req.body.usuario_validacion_id !== undefined) {
      if (
        req.body.usuario_validacion_id === null ||
        req.body.usuario_validacion_id === ''
      ) {
        datosActualizar.usuario_validacion_id = null;
      } else {
        const usuarioValidacion = await UsuariosModel.findByPk(
          req.body.usuario_validacion_id,
          { transaction }
        );

        if (!usuarioValidacion) {
          await transaction.rollback();
          return responderError(
            res,
            404,
            'No se encontró el usuario indicado en usuario_validacion_id.'
          );
        }

        datosActualizar.usuario_validacion_id = Number(
          req.body.usuario_validacion_id
        );
      }
    }

    if (req.body.fecha_pago !== undefined) {
      datosActualizar.fecha_pago = new Date(req.body.fecha_pago);
    }

    if (req.body.monto !== undefined) {
      datosActualizar.monto = Number(req.body.monto).toFixed(2);
    }

    if (req.body.referencia !== undefined) {
      datosActualizar.referencia =
        req.body.referencia !== null
          ? String(req.body.referencia).trim()
          : null;
    }

    if (req.body.comprobante_url !== undefined) {
      datosActualizar.comprobante_url =
        req.body.comprobante_url !== null
          ? String(req.body.comprobante_url).trim()
          : null;
    }

    if (req.body.observaciones !== undefined) {
      datosActualizar.observaciones =
        req.body.observaciones !== null
          ? String(req.body.observaciones).trim()
          : null;
    }

    datosActualizar.updated_at = new Date();

    await pago.update(datosActualizar, { transaction });

    await transaction.commit();

    const pagoActualizado = await PagosModel.findByPk(id, {
      include: includePago
    });

    return res.status(200).json({
      ok: true,
      message: 'Pago actualizado correctamente.',
      data: pagoActualizado
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_Pagos_CTS:', error);

    return responderError(res, 500, 'Error interno al actualizar el pago.');
  }
};

// Benjamin Orellana - 2026/06/15 - Sincroniza membresía y alumno luego de confirmar un pago pendiente.
const sincronizarMembresiaPorPagoConfirmado = async ({
  mensualidadId,
  transaction
}) => {
  if (!mensualidadId) return;

  const mensualidad = await PagosMensualidadesModel.findByPk(mensualidadId, {
    transaction
  });

  if (!mensualidad?.membresia_id) return;

  const membresia = await AlumnosMembresiasModel.findByPk(
    mensualidad.membresia_id,
    { transaction }
  );

  if (!membresia) return;

  if (
    mensualidad.estado === 'pagada' &&
    membresia.estado === 'pendiente_pago'
  ) {
    await membresia.update(
      {
        estado: 'activa',
        updated_at: new Date()
      },
      { transaction }
    );
  }

  const alumno = await AlumnosModel.findByPk(mensualidad.alumno_id, {
    transaction
  });

  if (!alumno || ['baja', 'congelado'].includes(alumno.estado)) return;

  const hoy = obtenerFechaActualDateOnly();

  const membresiaVigente = await AlumnosMembresiasModel.findOne({
    where: {
      alumno_id: Number(alumno.id),
      estado: 'activa',
      fecha_inicio: {
        [Op.lte]: hoy
      },
      fecha_vencimiento: {
        [Op.gte]: hoy
      }
    },
    order: [
      ['fecha_inicio', 'DESC'],
      ['id', 'DESC']
    ],
    transaction
  });

  if (membresiaVigente) {
    await alumno.update(
      {
        estado: 'activo',
        sede_id: Number(membresiaVigente.sede_id),
        updated_at: new Date()
      },
      { transaction }
    );
  }
};

// Benjamin Orellana - 2026/05/30 - Confirma un pago e impacta la mensualidad si corresponde.
// Benjamin Orellana - 2026/06/15 - Sincroniza alumno y membresía al confirmar pagos pendientes.
export const UR_ConfirmarPago_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;
    const { usuario_validacion_id, observaciones } = req.body;

    const pago = await PagosModel.findByPk(id, { transaction });

    if (!pago) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el pago solicitado.');
    }

    if (pago.estado === 'confirmado') {
      await transaction.rollback();
      return responderError(res, 400, 'El pago ya se encuentra confirmado.');
    }

    if (pago.estado === 'anulado') {
      await transaction.rollback();
      return responderError(res, 400, 'No se puede confirmar un pago anulado.');
    }

    if (pago.estado === 'rechazado') {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'No se puede confirmar un pago rechazado.'
      );
    }

    let usuarioValidacionNormalizado =
      pago.usuario_validacion_id ||
      req.user?.id ||
      req.user?.usuario_id ||
      null;

    if (
      usuario_validacion_id !== undefined &&
      usuario_validacion_id !== null &&
      usuario_validacion_id !== ''
    ) {
      if (!esIdValido(usuario_validacion_id)) {
        await transaction.rollback();
        return responderError(
          res,
          400,
          'El campo usuario_validacion_id debe ser un ID válido.'
        );
      }

      const usuarioValidacion = await UsuariosModel.findByPk(
        usuario_validacion_id,
        { transaction }
      );

      if (!usuarioValidacion) {
        await transaction.rollback();
        return responderError(
          res,
          404,
          'No se encontró el usuario indicado en usuario_validacion_id.'
        );
      }

      usuarioValidacionNormalizado = Number(usuario_validacion_id);
    }

    if (pago.mensualidad_id) {
      const aplicacionPago = await aplicarPagoConfirmadoEnMensualidad(
        pago.mensualidad_id,
        pago.monto,
        transaction
      );

      if (aplicacionPago && !aplicacionPago.ok) {
        await transaction.rollback();
        return responderError(
          res,
          aplicacionPago.status,
          aplicacionPago.message
        );
      }
    }

    await pago.update(
      {
        estado: 'confirmado',
        usuario_validacion_id: usuarioValidacionNormalizado,
        observaciones:
          observaciones !== undefined && observaciones !== null
            ? String(observaciones).trim()
            : pago.observaciones,
        updated_at: new Date()
      },
      { transaction }
    );

    await sincronizarMembresiaPorPagoConfirmado({
      mensualidadId: pago.mensualidad_id,
      transaction
    });

    const movimientoFinanciero = await crearMovimientoIngresoPagoAlumno(
      pago,
      transaction
    );

    if (!movimientoFinanciero.ok) {
      await transaction.rollback();
      return responderError(
        res,
        movimientoFinanciero.status,
        movimientoFinanciero.message
      );
    }

    const sincronizacion = await sincronizarAlumnoMembresiaPorPagoConfirmado(
      pago,
      transaction
    );

    if (!sincronizacion.ok) {
      await transaction.rollback();
      return responderError(res, sincronizacion.status, sincronizacion.message);
    }

    await transaction.commit();

    const pagoActualizado = await PagosModel.findByPk(id, {
      include: includePago
    });

    return res.status(200).json({
      ok: true,
      message: 'Pago confirmado correctamente.',
      data: pagoActualizado,
      sincronizacion: sincronizacion.data
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_ConfirmarPago_CTS:', error);

    return responderError(res, 500, 'Error interno al confirmar el pago.');
  }
};

// Benjamin Orellana - 2026/05/30 - Rechaza un pago pendiente de validación.
export const UR_RechazarPago_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;
    const { usuario_validacion_id, observaciones } = req.body;

    const pago = await PagosModel.findByPk(id, { transaction });

    if (!pago) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el pago solicitado.');
    }

    if (pago.estado === 'confirmado') {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'No se puede rechazar un pago confirmado. Para revertirlo, anulá el pago.'
      );
    }

    if (pago.estado === 'anulado') {
      await transaction.rollback();
      return responderError(res, 400, 'No se puede rechazar un pago anulado.');
    }

    let usuarioValidacionNormalizado = pago.usuario_validacion_id;

    if (
      usuario_validacion_id !== undefined &&
      usuario_validacion_id !== null &&
      usuario_validacion_id !== ''
    ) {
      if (!esIdValido(usuario_validacion_id)) {
        await transaction.rollback();
        return responderError(
          res,
          400,
          'El campo usuario_validacion_id debe ser un ID válido.'
        );
      }

      const usuarioValidacion = await UsuariosModel.findByPk(
        usuario_validacion_id,
        { transaction }
      );

      if (!usuarioValidacion) {
        await transaction.rollback();
        return responderError(
          res,
          404,
          'No se encontró el usuario indicado en usuario_validacion_id.'
        );
      }

      usuarioValidacionNormalizado = Number(usuario_validacion_id);
    }

    await pago.update(
      {
        estado: 'rechazado',
        usuario_validacion_id: usuarioValidacionNormalizado,
        observaciones:
          observaciones !== undefined && observaciones !== null
            ? String(observaciones).trim()
            : pago.observaciones,
        updated_at: new Date()
      },
      { transaction }
    );

    await transaction.commit();

    const pagoActualizado = await PagosModel.findByPk(id, {
      include: includePago
    });

    return res.status(200).json({
      ok: true,
      message: 'Pago rechazado correctamente.',
      data: pagoActualizado
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_RechazarPago_CTS:', error);

    return responderError(res, 500, 'Error interno al rechazar el pago.');
  }
};

// Benjamin Orellana - 2026/05/30 - Anula un pago y revierte la mensualidad si estaba confirmado.
export const UR_AnularPago_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;
    const { observaciones } = req.body;

    const pago = await PagosModel.findByPk(id, { transaction });

    if (!pago) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el pago solicitado.');
    }

    if (pago.estado === 'anulado') {
      await transaction.rollback();
      return responderError(res, 400, 'El pago ya se encuentra anulado.');
    }

    if (pago.estado === 'confirmado' && pago.mensualidad_id) {
      const reversionPago = await revertirPagoConfirmadoEnMensualidad(
        pago.mensualidad_id,
        pago.monto,
        transaction
      );

      if (reversionPago && !reversionPago.ok) {
        await transaction.rollback();
        return responderError(res, reversionPago.status, reversionPago.message);
      }
    }

    // Benjamin Orellana - 2026/05/30 - Anula el movimiento financiero asociado al pago confirmado.
    if (pago.estado === 'confirmado') {
      await anularMovimientoIngresoPagoAlumno(
        pago.id,
        observaciones,
        transaction
      );
    }

    await pago.update(
      {
        estado: 'anulado',
        observaciones:
          observaciones !== undefined && observaciones !== null
            ? String(observaciones).trim()
            : pago.observaciones,
        updated_at: new Date()
      },
      { transaction }
    );

    await transaction.commit();

    const pagoActualizado = await PagosModel.findByPk(id, {
      include: includePago
    });

    return res.status(200).json({
      ok: true,
      message: 'Pago anulado correctamente.',
      data: pagoActualizado
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_AnularPago_CTS:', error);

    return responderError(res, 500, 'Error interno al anular el pago.');
  }
};

// Benjamin Orellana - 2026/05/30 - Baja lógica de pago, cambia estado a anulado.
export const DR_Pagos_CTS = async (req, res) => {
  return UR_AnularPago_CTS(req, res);
};

// Benjamin Orellana - 2026/05/30 - Elimina físicamente un pago y revierte mensualidad si estaba confirmado.
export const ER_Pagos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const pago = await PagosModel.findByPk(id, { transaction });

    if (!pago) {
      await transaction.rollback();

      return responderError(res, 404, 'No se encontró el pago solicitado.');
    }

    if (pago.estado === 'confirmado' && pago.mensualidad_id) {
      const reversionPago = await revertirPagoConfirmadoEnMensualidad(
        pago.mensualidad_id,
        pago.monto,
        transaction
      );

      if (reversionPago && !reversionPago.ok) {
        await transaction.rollback();
        return responderError(res, reversionPago.status, reversionPago.message);
      }
    }

    // Benjamin Orellana - 2026/05/30 - Anula y desvincula movimientos financieros antes de eliminar físicamente el pago.
    if (pago.estado === 'confirmado') {
      await anularMovimientoIngresoPagoAlumno(
        pago.id,
        req.body?.observaciones,
        transaction,
        true
      );
    }

    await pago.destroy({ transaction });

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Pago eliminado físicamente correctamente.',
      data: {
        id: Number(id)
      }
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en ER_Pagos_CTS:', error);

    if (error?.name === 'SequelizeForeignKeyConstraintError') {
      return responderError(
        res,
        409,
        'No se puede eliminar físicamente el pago porque tiene registros relacionados.'
      );
    }

    return responderError(
      res,
      500,
      'Error interno al eliminar físicamente el pago.'
    );
  }
};
