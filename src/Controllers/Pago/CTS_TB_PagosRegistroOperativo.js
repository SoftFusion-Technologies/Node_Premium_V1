/*
 * Benjamin Orellana - 2026/06/15 - Registro operativo unificado de pagos PREMIUM.
 * Permite cobrar desde módulo Pagos o desde ficha de Alumno.
 */

import { Op } from 'sequelize';
import db from '../../DataBase/db.js';

import AlumnosModel from '../../Models/Alumno/MD_TB_Alumnos.js';
import AlumnosMembresiasModel from '../../Models/Alumno/MD_TB_AlumnosMembresias.js';

import PlanesModel from '../../Models/Plan/MD_TB_Planes.js';
import PlanesPreciosModel from '../../Models/Plan/MD_TB_PlanesPrecios.js';

import PagosModel from '../../Models/Pago/MD_TB_Pagos.js';
import PagosMensualidadesModel from '../../Models/Pago/MD_TB_PagosMensualidades.js';
import PagosMediosPagoModel from '../../Models/Pago/MD_TB_PagosMediosPago.js';

import SedesModel from '../../Models/Sede/MD_TB_Sedes.js';
import FinanzasMovimientosModel from '../../Models/Finanzas/MD_TB_FinanzasMovimientos.js';

const ESTADOS_MEMBRESIA_OPERATIVOS = ['pendiente_pago', 'activa', 'vencida'];
const ESTADOS_MENSUALIDAD_COBRABLES = ['pendiente', 'parcial', 'vencida'];

const responderError = (res, status, message, data = null) => {
  return res.status(status).json({
    ok: false,
    message,
    data
  });
};

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;

  const numberValue = Number(value);

  return Number.isNaN(numberValue) ? null : numberValue;
};

const esImporteValido = (value) => {
  const numberValue = Number(value);

  return !Number.isNaN(numberValue) && numberValue > 0;
};

const obtenerFechaActualDateOnly = () => {
  return new Date().toISOString().slice(0, 10);
};

const normalizarFechaDateOnly = (value) => {
  if (!value) return obtenerFechaActualDateOnly();

  const fecha = new Date(value);

  if (Number.isNaN(fecha.getTime())) return null;

  return fecha.toISOString().slice(0, 10);
};

const sumarDiasDateOnly = (fechaDateOnly, dias) => {
  const fecha = new Date(`${fechaDateOnly}T00:00:00Z`);

  if (Number.isNaN(fecha.getTime())) return null;

  fecha.setUTCDate(fecha.getUTCDate() + Number(dias));

  return fecha.toISOString().slice(0, 10);
};

const calcularSaldo = (montoTotal, montoPagado) => {
  const total = Number(montoTotal || 0);
  const pagado = Number(montoPagado || 0);

  return Math.max(total - pagado, 0).toFixed(2);
};

const determinarEstadoMensualidad = ({
  montoTotal,
  montoPagado,
  fechaVencimiento,
  estadoActual = 'pendiente'
}) => {
  if (estadoActual === 'anulada') return 'anulada';

  const saldo = Number(calcularSaldo(montoTotal, montoPagado));
  const fechaActual = obtenerFechaActualDateOnly();

  if (saldo <= 0) return 'pagada';
  if (fechaVencimiento && fechaVencimiento < fechaActual) return 'vencida';
  if (Number(montoPagado || 0) > 0 && saldo > 0) return 'parcial';

  return 'pendiente';
};

const buscarPrecioVigentePlan = async ({
  planId,
  sedeId,
  fechaConsulta,
  transaction
}) => {
  const whereBase = {
    plan_id: Number(planId),
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

  if (sedeId) {
    const precioSede = await PlanesPreciosModel.findOne({
      where: {
        ...whereBase,
        sede_id: Number(sedeId)
      },
      order: [
        ['fecha_desde', 'DESC'],
        ['id', 'DESC']
      ],
      transaction
    });

    if (precioSede) return precioSede;
  }

  return PlanesPreciosModel.findOne({
    where: {
      ...whereBase,
      sede_id: null
    },
    order: [
      ['fecha_desde', 'DESC'],
      ['id', 'DESC']
    ],
    transaction
  });
};

const obtenerMembresiaOperativa = async ({
  alumnoId,
  membresiaId,
  transaction
}) => {
  if (membresiaId) {
    return AlumnosMembresiasModel.findOne({
      where: {
        id: Number(membresiaId),
        alumno_id: Number(alumnoId)
      },
      transaction
    });
  }

  return AlumnosMembresiasModel.findOne({
    where: {
      alumno_id: Number(alumnoId),
      estado: {
        [Op.in]: ESTADOS_MEMBRESIA_OPERATIVOS
      }
    },
    order: [
      ['fecha_inicio', 'DESC'],
      ['id', 'DESC']
    ],
    transaction
  });
};

const crearMembresiaDesdePlan = async ({
  alumno,
  sedeId,
  planId,
  fechaInicio,
  descuentoValor = 0,
  descuentoPorcentaje = 0,
  observaciones,
  transaction
}) => {
  const sede = await SedesModel.findOne({
    where: {
      id: Number(sedeId),
      activo: 1
    },
    transaction
  });

  if (!sede) {
    return {
      ok: false,
      status: 404,
      message: 'La sede indicada no existe o está inactiva.'
    };
  }

  const plan = await PlanesModel.findOne({
    where: {
      id: Number(planId),
      activo: 1
    },
    transaction
  });

  if (!plan) {
    return {
      ok: false,
      status: 404,
      message: 'El plan indicado no existe o está inactivo.'
    };
  }

  const precioVigente = await buscarPrecioVigentePlan({
    planId,
    sedeId,
    fechaConsulta: fechaInicio,
    transaction
  });

  if (!precioVigente) {
    return {
      ok: false,
      status: 400,
      message: 'No hay precio vigente para el plan y sede indicados.'
    };
  }

  const precioLista = Number(precioVigente.precio || 0);
  const descuentoMonto = Number(descuentoValor || 0);
  const descuentoPorc = Number(descuentoPorcentaje || 0);
  const descuentoPorPorcentaje = precioLista * (descuentoPorc / 100);
  const precioFinal = Math.max(
    precioLista - descuentoMonto - descuentoPorPorcentaje,
    0
  );

  const clasesIncluidas = Number(
    plan.cantidad_clases_periodo ?? plan.clases_por_mes ?? 0
  );

  const fechaVencimiento = sumarDiasDateOnly(
    fechaInicio,
    Number(plan.duracion_dias || 0) - 1
  );

  if (!fechaVencimiento) {
    return {
      ok: false,
      status: 400,
      message: 'No se pudo calcular el vencimiento de la membresía.'
    };
  }

  const membresia = await AlumnosMembresiasModel.create(
    {
      alumno_id: Number(alumno.id),
      plan_id: Number(plan.id),
      sede_id: Number(sedeId),
      fecha_inicio: fechaInicio,
      fecha_vencimiento: fechaVencimiento,
      estado: 'pendiente_pago',
      precio_lista: precioLista.toFixed(2),
      descuento_valor: descuentoMonto.toFixed(2),
      descuento_porcentaje: descuentoPorc.toFixed(2),
      precio_final: precioFinal.toFixed(2),
      clases_incluidas: clasesIncluidas,
      clases_usadas: 0,
      clases_disponibles: clasesIncluidas,
      origen_alta: 'administracion',
      observaciones: observaciones || null
    },
    { transaction }
  );

  if (!alumno.sede_id || Number(alumno.sede_id) !== Number(sedeId)) {
    await alumno.update(
      {
        sede_id: Number(sedeId),
        fecha_inicio: alumno.fecha_inicio || fechaInicio,
        updated_at: new Date()
      },
      { transaction }
    );
  }

  return {
    ok: true,
    data: membresia
  };
};

const obtenerMensualidadCobrable = async ({
  alumnoId,
  membresiaId,
  mensualidadId,
  transaction
}) => {
  if (mensualidadId) {
    return PagosMensualidadesModel.findOne({
      where: {
        id: Number(mensualidadId),
        alumno_id: Number(alumnoId)
      },
      transaction
    });
  }

  return PagosMensualidadesModel.findOne({
    where: {
      alumno_id: Number(alumnoId),
      membresia_id: Number(membresiaId),
      estado: {
        [Op.in]: ESTADOS_MENSUALIDAD_COBRABLES
      },
      saldo: {
        [Op.gt]: 0
      }
    },
    order: [
      ['fecha_vencimiento', 'ASC'],
      ['id', 'ASC']
    ],
    transaction
  });
};

const crearMensualidadDesdeMembresia = async ({
  membresia,
  montoTotal,
  observaciones,
  transaction
}) => {
  const periodoDesde = membresia.fecha_inicio;
  const periodoHasta = membresia.fecha_vencimiento;
  const fechaEmision = obtenerFechaActualDateOnly();
  const fechaVencimiento = membresia.fecha_vencimiento;

  const fechaBase = new Date(`${periodoDesde}T00:00:00`);

  const periodoAnio = fechaBase.getFullYear();
  const periodoMes = fechaBase.getMonth() + 1;

  const total = Number(montoTotal ?? membresia.precio_final ?? 0);

  return PagosMensualidadesModel.create(
    {
      alumno_id: Number(membresia.alumno_id),
      membresia_id: Number(membresia.id),
      sede_id: Number(membresia.sede_id),
      periodo_anio: periodoAnio,
      periodo_mes: periodoMes,
      periodo_desde: periodoDesde,
      periodo_hasta: periodoHasta,
      fecha_emision: fechaEmision,
      fecha_vencimiento: fechaVencimiento,
      monto_total: total.toFixed(2),
      monto_pagado: Number(0).toFixed(2),
      saldo: total.toFixed(2),
      estado: 'pendiente',
      observaciones:
        observaciones ||
        'Mensualidad generada automáticamente al registrar pago.'
    },
    { transaction }
  );
};

const aplicarPagoConfirmadoEnMensualidad = async ({
  mensualidad,
  monto,
  transaction
}) => {
  if (!mensualidad) {
    return {
      ok: true,
      data: null
    };
  }

  if (mensualidad.estado === 'anulada') {
    return {
      ok: false,
      status: 400,
      message: 'No se puede cobrar una mensualidad anulada.'
    };
  }

  const montoPago = Number(monto);
  const saldoActual = Number(mensualidad.saldo || 0);

  if (montoPago > saldoActual) {
    return {
      ok: false,
      status: 400,
      message: 'El monto del pago no puede superar el saldo pendiente.'
    };
  }

  const nuevoMontoPagado = Number(mensualidad.monto_pagado || 0) + montoPago;
  const nuevoSaldo = calcularSaldo(mensualidad.monto_total, nuevoMontoPagado);
  const nuevoEstado = determinarEstadoMensualidad({
    montoTotal: mensualidad.monto_total,
    montoPagado: nuevoMontoPagado,
    fechaVencimiento: mensualidad.fecha_vencimiento,
    estadoActual: mensualidad.estado
  });

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
    data: mensualidad
  };
};

const crearMovimientoFinancieroPago = async ({ pago, transaction }) => {
  const fechaMovimiento = normalizarFechaDateOnly(pago.fecha_pago);

  return FinanzasMovimientosModel.create(
    {
      sede_id: Number(pago.sede_id),
      categoria_id: null,
      pago_id: Number(pago.id),
      tipo: 'ingreso',
      fecha: fechaMovimiento,
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
};

const sincronizarEstadosPostCobro = async ({
  alumno,
  membresia,
  mensualidad,
  pagoEstado,
  usuarioValidacionId = null,
  usuarioRegistroId = null,
  transaction
}) => {
  if (pagoEstado === 'pendiente_validacion') {
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
        updated_at: new Date()
      },
      { transaction }
    );

    return;
  }

  if (pagoEstado !== 'confirmado') return;

  const mensualidadPagada = mensualidad && Number(mensualidad.saldo || 0) <= 0;

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
          usuarioValidacionId ||
          usuarioRegistroId ||
          null,
        updated_at: new Date()
      },
      { transaction }
    );

    return;
  }

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
};

// Benjamin Orellana - 2026/06/15 - Busca deuda pendiente de una membresía antes de permitir renovación.
const obtenerMensualidadPendientePorMembresia = async ({
  alumnoId,
  membresiaId,
  transaction
}) => {
  return PagosMensualidadesModel.findOne({
    where: {
      alumno_id: Number(alumnoId),
      membresia_id: Number(membresiaId),
      estado: {
        [Op.in]: ESTADOS_MENSUALIDAD_COBRABLES
      },
      saldo: {
        [Op.gt]: 0
      }
    },
    order: [
      ['fecha_vencimiento', 'ASC'],
      ['id', 'ASC']
    ],
    transaction
  });
};

// Benjamin Orellana - 2026/06/15 - Devuelve la última membresía del alumno para renovar el próximo período.
const obtenerUltimaMembresiaAlumno = async ({ alumnoId, transaction }) => {
  return AlumnosMembresiasModel.findOne({
    where: {
      alumno_id: Number(alumnoId),
      estado: {
        [Op.in]: ['pendiente_pago', 'activa', 'vencida', 'congelada']
      }
    },
    order: [
      ['fecha_vencimiento', 'DESC'],
      ['fecha_inicio', 'DESC'],
      ['id', 'DESC']
    ],
    transaction
  });
};

// Benjamin Orellana - 2026/06/15 - Evita duplicar una renovación para el mismo período.
const obtenerMembresiaMismoPeriodo = async ({
  alumnoId,
  planId,
  sedeId,
  fechaInicio,
  fechaVencimiento,
  transaction
}) => {
  return AlumnosMembresiasModel.findOne({
    where: {
      alumno_id: Number(alumnoId),
      plan_id: Number(planId),
      sede_id: Number(sedeId),
      fecha_inicio: fechaInicio,
      fecha_vencimiento: fechaVencimiento
    },
    transaction
  });
};

export const CR_RegistrarPagoOperativo_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const alumnoId = toNumberOrNull(req.body.alumno_id || req.params.alumno_id);
    const membresiaId = toNumberOrNull(req.body.membresia_id);
    const mensualidadId = toNumberOrNull(req.body.mensualidad_id);
    const sedeIdBody = toNumberOrNull(req.body.sede_id);
    const planId = toNumberOrNull(req.body.plan_id);
    const medioPagoId = toNumberOrNull(req.body.medio_pago_id);

    const fechaInicio =
      normalizarFechaDateOnly(req.body.fecha_inicio) ||
      obtenerFechaActualDateOnly();

    const fechaPago = req.body.fecha_pago
      ? new Date(req.body.fecha_pago)
      : new Date();

    const montoBody = req.body.monto;

    if (!alumnoId) {
      await transaction.rollback();
      return responderError(res, 400, 'Debe indicar un alumno válido.');
    }

    if (!medioPagoId) {
      await transaction.rollback();
      return responderError(res, 400, 'Debe indicar un medio de pago válido.');
    }

    const alumno = await AlumnosModel.findByPk(alumnoId, { transaction });

    if (!alumno) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el alumno indicado.');
    }

    const medioPago = await PagosMediosPagoModel.findOne({
      where: {
        id: medioPagoId,
        activo: 1
      },
      transaction
    });

    if (!medioPago) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró el medio de pago o está inactivo.'
      );
    }

    if (
      Number(medioPago.requiere_comprobante) === 1 &&
      !req.body.comprobante_url
    ) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'Este medio de pago requiere comprobante.'
      );
    }

    let membresia = await obtenerMembresiaOperativa({
      alumnoId,
      membresiaId,
      transaction
    });

    if (!membresia) {
      if (!planId) {
        await transaction.rollback();
        return responderError(
          res,
          400,
          'El alumno no tiene membresía vigente. Debe seleccionar un plan para registrar el pago.'
        );
      }

      const sedeIdParaNuevaMembresia = sedeIdBody || alumno.sede_id;

      if (!sedeIdParaNuevaMembresia) {
        await transaction.rollback();
        return responderError(
          res,
          400,
          'El alumno no tiene sede asignada. Debe seleccionar una sede.'
        );
      }

      const resultadoMembresia = await crearMembresiaDesdePlan({
        alumno,
        sedeId: sedeIdParaNuevaMembresia,
        planId,
        fechaInicio,
        descuentoValor: req.body.descuento_valor,
        descuentoPorcentaje: req.body.descuento_porcentaje,
        observaciones: req.body.observaciones,
        transaction
      });

      if (!resultadoMembresia.ok) {
        await transaction.rollback();
        return responderError(
          res,
          resultadoMembresia.status,
          resultadoMembresia.message
        );
      }

      membresia = resultadoMembresia.data;
    }

    const sedeIdFinal = sedeIdBody || membresia.sede_id || alumno.sede_id;

    if (!sedeIdFinal) {
      await transaction.rollback();
      return responderError(res, 400, 'No se pudo resolver la sede del pago.');
    }

    let mensualidad = await obtenerMensualidadCobrable({
      alumnoId,
      membresiaId: membresia.id,
      mensualidadId,
      transaction
    });

    if (mensualidad && mensualidad.estado === 'anulada') {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'No se puede registrar pago sobre una mensualidad anulada.'
      );
    }

    if (!mensualidad) {
      const mensualidadYaPagada = await PagosMensualidadesModel.findOne({
        where: {
          alumno_id: Number(alumnoId),
          membresia_id: Number(membresia.id),
          estado: 'pagada',
          saldo: 0
        },
        order: [['id', 'DESC']],
        transaction
      });

      if (mensualidadYaPagada && !req.body.renovar_membresia) {
        await transaction.rollback();

        return responderError(
          res,
          409,
          'El alumno no tiene deuda pendiente para cobrar. Si querés cobrar un nuevo período, usá la opción renovar membresía.'
        );
      }

      mensualidad = await crearMensualidadDesdeMembresia({
        membresia,
        montoTotal: membresia.precio_final,
        observaciones: req.body.observaciones,
        transaction
      });
    }

    const montoPago =
      montoBody !== undefined && montoBody !== null && montoBody !== ''
        ? Number(montoBody)
        : Number(mensualidad.saldo || 0);

    if (!esImporteValido(montoPago)) {
      await transaction.rollback();
      return responderError(res, 400, 'El monto del pago debe ser mayor a 0.');
    }

    if (montoPago > Number(mensualidad.saldo || 0)) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El monto del pago no puede superar el saldo pendiente.'
      );
    }

    const estadoPago =
      req.body.estado ||
      (Number(medioPago.requiere_validacion) === 1
        ? 'pendiente_validacion'
        : 'confirmado');

    const usuarioRegistroId =
      req.user?.id ||
      req.user?.usuario_id ||
      req.body.usuario_registro_id ||
      null;

    const usuarioValidacionId =
      estadoPago === 'confirmado' ? usuarioRegistroId : null;

    if (estadoPago === 'confirmado') {
      const resultadoAplicacion = await aplicarPagoConfirmadoEnMensualidad({
        mensualidad,
        monto: montoPago,
        transaction
      });

      if (!resultadoAplicacion.ok) {
        await transaction.rollback();
        return responderError(
          res,
          resultadoAplicacion.status,
          resultadoAplicacion.message
        );
      }
    }

    const nuevoPago = await PagosModel.create(
      {
        mensualidad_id: Number(mensualidad.id),
        alumno_id: Number(alumno.id),
        sede_id: Number(sedeIdFinal),
        medio_pago_id: Number(medioPago.id),
        usuario_registro_id: usuarioRegistroId,
        usuario_validacion_id: usuarioValidacionId,
        fecha_pago: fechaPago,
        monto: Number(montoPago).toFixed(2),
        estado: estadoPago,
        referencia:
          req.body.referencia !== undefined && req.body.referencia !== null
            ? String(req.body.referencia).trim()
            : null,
        comprobante_url:
          req.body.comprobante_url !== undefined &&
          req.body.comprobante_url !== null
            ? String(req.body.comprobante_url).trim()
            : null,
        observaciones:
          req.body.observaciones !== undefined &&
          req.body.observaciones !== null
            ? String(req.body.observaciones).trim()
            : null
      },
      { transaction }
    );

    if (estadoPago === 'confirmado') {
      await crearMovimientoFinancieroPago({
        pago: nuevoPago,
        transaction
      });
    }

    await mensualidad.reload({ transaction });

    await sincronizarEstadosPostCobro({
      alumno,
      membresia,
      mensualidad,
      pagoEstado: estadoPago,
      usuarioValidacionId,
      usuarioRegistroId,
      transaction
    });

    await transaction.commit();

    const pagoCompleto = await PagosModel.findByPk(nuevoPago.id);

    return res.status(201).json({
      ok: true,
      message:
        estadoPago === 'confirmado'
          ? 'Pago registrado y confirmado correctamente.'
          : 'Pago registrado pendiente de validación.',
      data: {
        pago: pagoCompleto,
        alumno_id: Number(alumno.id),
        membresia_id: Number(membresia.id),
        mensualidad_id: Number(mensualidad.id),
        estado_pago: estadoPago
      }
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }

    console.error('Error CR_RegistrarPagoOperativo_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al registrar el pago operativo.'
    );
  }
};

// Benjamin Orellana - 2026/06/15 - Renueva membresía creando un nuevo período, mensualidad, pago e impacto financiero.
export const CR_RenovarMembresiaOperativa_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const alumnoId = toNumberOrNull(req.params.alumno_id || req.body.alumno_id);
    const membresiaId = toNumberOrNull(req.body.membresia_id);
    const planIdBody = toNumberOrNull(req.body.plan_id);
    const sedeIdBody = toNumberOrNull(req.body.sede_id);
    const medioPagoId = toNumberOrNull(req.body.medio_pago_id);

    const fechaPago = req.body.fecha_pago
      ? new Date(req.body.fecha_pago)
      : new Date();

    if (!alumnoId) {
      await transaction.rollback();
      return responderError(res, 400, 'Debe indicar un alumno válido.');
    }

    if (!medioPagoId) {
      await transaction.rollback();
      return responderError(res, 400, 'Debe indicar un medio de pago válido.');
    }

    const alumno = await AlumnosModel.findByPk(alumnoId, { transaction });

    if (!alumno) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el alumno indicado.');
    }

    const membresiaActual = membresiaId
      ? await AlumnosMembresiasModel.findOne({
          where: {
            id: Number(membresiaId),
            alumno_id: Number(alumnoId)
          },
          transaction
        })
      : await obtenerUltimaMembresiaAlumno({
          alumnoId,
          transaction
        });

    if (!membresiaActual) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'El alumno no tiene una membresía previa para renovar.'
      );
    }

    const deudaPendiente = await obtenerMensualidadPendientePorMembresia({
      alumnoId,
      membresiaId: membresiaActual.id,
      transaction
    });

    if (deudaPendiente) {
      await transaction.rollback();

      return responderError(
        res,
        409,
        'El alumno tiene deuda pendiente en la membresía actual. Primero registrá el pago pendiente antes de renovar.'
      );
    }

    const medioPago = await PagosMediosPagoModel.findOne({
      where: {
        id: Number(medioPagoId),
        activo: 1
      },
      transaction
    });

    if (!medioPago) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró el medio de pago o está inactivo.'
      );
    }

    if (
      Number(medioPago.requiere_comprobante) === 1 &&
      !req.body.comprobante_url
    ) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'Este medio de pago requiere comprobante.'
      );
    }

    const planId = planIdBody || membresiaActual.plan_id;
    const sedeId = sedeIdBody || membresiaActual.sede_id || alumno.sede_id;

    if (!planId) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'No se pudo resolver el plan para renovar la membresía.'
      );
    }

    if (!sedeId) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'No se pudo resolver la sede para renovar la membresía.'
      );
    }

    const fechaInicioRenovacion = req.body.fecha_inicio
      ? normalizarFechaDateOnly(req.body.fecha_inicio)
      : sumarDiasDateOnly(membresiaActual.fecha_vencimiento, 1);

    if (!fechaInicioRenovacion) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'No se pudo calcular la fecha de inicio de la renovación.'
      );
    }

    if (!fechaInicioRenovacion) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'No se pudo calcular la fecha de inicio de la renovación.'
      );
    }

    if (
      fechaInicioRenovacion <= membresiaActual.fecha_vencimiento &&
      !req.body.permitir_solapamiento
    ) {
      await transaction.rollback();

      return responderError(
        res,
        400,
        'La renovación debe iniciar después del vencimiento de la membresía actual.'
      );
    }

    const resultadoMembresia = await crearMembresiaDesdePlan({
      alumno,
      sedeId,
      planId,
      fechaInicio: fechaInicioRenovacion,
      descuentoValor: req.body.descuento_valor,
      descuentoPorcentaje: req.body.descuento_porcentaje,
      observaciones:
        req.body.observaciones ||
        `Renovación de membresía anterior #${membresiaActual.id}`,
      transaction
    });

    if (!resultadoMembresia.ok) {
      await transaction.rollback();
      return responderError(
        res,
        resultadoMembresia.status,
        resultadoMembresia.message
      );
    }

    const nuevaMembresia = resultadoMembresia.data;

    const membresiaDuplicada = await obtenerMembresiaMismoPeriodo({
      alumnoId,
      planId,
      sedeId,
      fechaInicio: nuevaMembresia.fecha_inicio,
      fechaVencimiento: nuevaMembresia.fecha_vencimiento,
      transaction
    });

    if (
      membresiaDuplicada &&
      Number(membresiaDuplicada.id) !== Number(nuevaMembresia.id)
    ) {
      await transaction.rollback();

      return responderError(
        res,
        409,
        'Ya existe una membresía registrada para ese mismo período.'
      );
    }

    const mensualidad = await crearMensualidadDesdeMembresia({
      membresia: nuevaMembresia,
      montoTotal: nuevaMembresia.precio_final,
      observaciones:
        req.body.observaciones ||
        `Mensualidad generada por renovación de membresía #${nuevaMembresia.id}`,
      transaction
    });

    const montoPago =
      req.body.monto !== undefined &&
      req.body.monto !== null &&
      req.body.monto !== ''
        ? Number(req.body.monto)
        : Number(mensualidad.saldo || 0);

    if (!esImporteValido(montoPago)) {
      await transaction.rollback();
      return responderError(res, 400, 'El monto del pago debe ser mayor a 0.');
    }

    if (montoPago > Number(mensualidad.saldo || 0)) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El monto del pago no puede superar el saldo pendiente.'
      );
    }

    const estadoPago =
      req.body.estado ||
      (Number(medioPago.requiere_validacion) === 1
        ? 'pendiente_validacion'
        : 'confirmado');

    const usuarioRegistroId =
      req.user?.id ||
      req.user?.usuario_id ||
      req.body.usuario_registro_id ||
      null;

    const usuarioValidacionId =
      estadoPago === 'confirmado' ? usuarioRegistroId : null;

    if (estadoPago === 'confirmado') {
      const resultadoAplicacion = await aplicarPagoConfirmadoEnMensualidad({
        mensualidad,
        monto: montoPago,
        transaction
      });

      if (!resultadoAplicacion.ok) {
        await transaction.rollback();
        return responderError(
          res,
          resultadoAplicacion.status,
          resultadoAplicacion.message
        );
      }
    }

    const nuevoPago = await PagosModel.create(
      {
        mensualidad_id: Number(mensualidad.id),
        alumno_id: Number(alumno.id),
        sede_id: Number(sedeId),
        medio_pago_id: Number(medioPago.id),
        usuario_registro_id: usuarioRegistroId,
        usuario_validacion_id: usuarioValidacionId,
        fecha_pago: fechaPago,
        monto: Number(montoPago).toFixed(2),
        estado: estadoPago,
        referencia:
          req.body.referencia !== undefined && req.body.referencia !== null
            ? String(req.body.referencia).trim()
            : null,
        comprobante_url:
          req.body.comprobante_url !== undefined &&
          req.body.comprobante_url !== null
            ? String(req.body.comprobante_url).trim()
            : null,
        observaciones:
          req.body.observaciones !== undefined &&
          req.body.observaciones !== null
            ? String(req.body.observaciones).trim()
            : `Pago por renovación de membresía #${nuevaMembresia.id}`
      },
      { transaction }
    );

    if (estadoPago === 'confirmado') {
      await crearMovimientoFinancieroPago({
        pago: nuevoPago,
        transaction
      });
    }

    await mensualidad.reload({ transaction });

    await sincronizarEstadosPostCobro({
      alumno,
      membresia: nuevaMembresia,
      mensualidad,
      pagoEstado: estadoPago,
      usuarioValidacionId,
      usuarioRegistroId,
      transaction
    });

    // Benjamin Orellana - 2026/06/15 - Si la renovación futura queda pendiente, no cambia el estado actual del alumno si todavía tiene cobertura vigente paga.
    if (estadoPago === 'pendiente_validacion') {
      const hoy = obtenerFechaActualDateOnly();

      const membresiaVigentePagada = await AlumnosMembresiasModel.findOne({
        where: {
          alumno_id: Number(alumno.id),
          id: {
            [Op.ne]: Number(nuevaMembresia.id)
          },
          estado: 'activa',
          fecha_inicio: {
            [Op.lte]: hoy
          },
          fecha_vencimiento: {
            [Op.gte]: hoy
          }
        },
        transaction
      });

      if (membresiaVigentePagada) {
        await alumno.update(
          {
            estado: 'activo',
            sede_id: Number(membresiaVigentePagada.sede_id),
            updated_at: new Date()
          },
          { transaction }
        );
      }
    }
    
    const hoy = obtenerFechaActualDateOnly();

    if (
      membresiaActual.fecha_vencimiento < hoy &&
      membresiaActual.estado !== 'vencida'
    ) {
      await membresiaActual.update(
        {
          estado: 'vencida',
          updated_at: new Date()
        },
        { transaction }
      );
    }

    await transaction.commit();

    const pagoCompleto = await PagosModel.findByPk(nuevoPago.id);

    return res.status(201).json({
      ok: true,
      message:
        estadoPago === 'confirmado'
          ? 'Membresía renovada y pago confirmado correctamente.'
          : 'Membresía renovada con pago pendiente de validación.',
      data: {
        pago: pagoCompleto,
        alumno_id: Number(alumno.id),
        membresia_anterior_id: Number(membresiaActual.id),
        membresia_nueva_id: Number(nuevaMembresia.id),
        mensualidad_id: Number(mensualidad.id),
        estado_pago: estadoPago,
        periodo: {
          desde: nuevaMembresia.fecha_inicio,
          hasta: nuevaMembresia.fecha_vencimiento
        }
      }
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }

    console.error('Error CR_RenovarMembresiaOperativa_CTS:', error);

    return responderError(res, 500, 'Error interno al renovar la membresía.');
  }
};
