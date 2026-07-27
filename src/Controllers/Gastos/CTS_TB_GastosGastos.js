/*
 * Benjamin Orellana - 2026/07/07 - Controlador Sequelize para gastos operativos PREMIUM.
 */

import { Op } from 'sequelize';

import db from '../../DataBase/db.js';
import GastosGastosModel from '../../Models/Gastos/MD_TB_GastosGastos.js';
import GastosTiposModel from '../../Models/Gastos/MD_TB_GastosTipos.js';
import GastosProveedoresModel from '../../Models/Gastos/MD_TB_GastosProveedores.js';
import GastosPeriodicosModel from '../../Models/Gastos/MD_TB_GastosPeriodicos.js';
import CajasMovimientosModel from '../../Models/Caja/MD_TB_CajasMovimientos.js';
import CajasSesionesModel from '../../Models/Caja/MD_TB_CajasSesiones.js';
import PagosMediosPagoModel from '../../Models/Pago/MD_TB_PagosMediosPago.js';

import {
  anexarSedesARegistros,
  aplicarScopeSedesGastos,
  buildOrder,
  buildPagination,
  calcularImporteIva,
  esFechaDateOnlyValida,
  ESTADOS_GASTO_VALIDOS,
  manejarErrorControlador,
  normalizarDecimal,
  normalizarFecha,
  normalizarTexto,
  normalizarTinyint,
  obtenerFechaActualDateOnly,
  ORIGENES_GASTO_VALIDOS,
  toNumberOrNull,
  validarRolLecturaGastos,
  validarRolOperacionGastos,
  validarSedeTipoProveedor
} from './gastos.helpers.js';

const ESTADO_MOVIMIENTO_VIGENTE = 'vigente';

const usuarioId = (req) =>
  Number(req.user?.id || req.user?.usuario_id || 0);

const crearErrorOperacion = (message, status = 409) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const obtenerMedioPagoCaja = async (medioPagoId, transaction) => {
  const id = toNumberOrNull(medioPagoId);

  if (!id) {
    throw crearErrorOperacion(
      'Debe seleccionar el medio de pago utilizado para registrar el gasto.',
      400
    );
  }

  const medioPago = await PagosMediosPagoModel.findOne({
    where: {
      id,
      activo: 1,
      impacta_caja: 1
    },
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!medioPago || String(medioPago.codigo || '').toUpperCase() === 'SALDO_FAVOR') {
    throw crearErrorOperacion(
      'El medio de pago seleccionado no está activo o no impacta en Caja.',
      400
    );
  }

  return medioPago;
};

const obtenerSesionAbierta = async (sedeId, transaction) => {
  if (!sedeId) {
    throw crearErrorOperacion(
      'La sede es obligatoria para registrar un gasto pagado en Caja.',
      400
    );
  }

  const sesion = await CajasSesionesModel.findOne({
    where: {
      sede_id: Number(sedeId),
      estado: 'abierta'
    },
    order: [['id', 'DESC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!sesion) {
    throw crearErrorOperacion(
      'No hay una caja abierta en la sede seleccionada. Abrí la caja antes de marcar el gasto como pagado.'
    );
  }

  return sesion;
};

const obtenerMovimientoGastoVigente = async (gastoId, transaction) => {
  return CajasMovimientosModel.findOne({
    where: {
      gasto_id: Number(gastoId),
      tipo: 'egreso',
      origen: 'gasto',
      estado: ESTADO_MOVIMIENTO_VIGENTE
    },
    order: [['id', 'DESC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });
};

const validarEfectivoDisponible = async ({
  sesion,
  medioPago,
  importe,
  transaction
}) => {
  const esEfectivo =
    String(medioPago.tipo || '').toLowerCase() === 'efectivo' ||
    String(medioPago.codigo || '').toUpperCase() === 'EFECTIVO';

  if (!esEfectivo) return;

  const movimientos = await CajasMovimientosModel.findAll({
    where: {
      caja_sesion_id: Number(sesion.id),
      estado: ESTADO_MOVIMIENTO_VIGENTE
    },
    transaction
  });
  const mediosIds = [
    ...new Set(
      movimientos
        .map((movimiento) => Number(movimiento.medio_pago_id))
        .filter(Boolean)
    )
  ];
  const medios = mediosIds.length
    ? await PagosMediosPagoModel.findAll({
        where: {
          id: {
            [Op.in]: mediosIds
          }
        },
        attributes: ['id', 'codigo', 'tipo'],
        transaction
      })
    : [];
  const mediosMap = medios.reduce((acc, medio) => {
    acc[Number(medio.id)] = medio;
    return acc;
  }, {});

  const efectivoNeto = movimientos.reduce((total, movimiento) => {
    const medio = mediosMap[Number(movimiento.medio_pago_id)];
    const movimientoEsEfectivo =
      String(medio?.tipo || '').toLowerCase() === 'efectivo' ||
      String(medio?.codigo || '').toUpperCase() === 'EFECTIVO';

    if (!movimientoEsEfectivo) return total;

    const monto = Number(movimiento.monto || 0);
    return total + (movimiento.tipo === 'ingreso' ? monto : -monto);
  }, 0);

  const efectivoEsperado =
    Number(sesion.monto_inicial || 0) + Number(efectivoNeto || 0);

  if (Number(importe || 0) > efectivoEsperado + 0.009) {
    throw crearErrorOperacion(
      'El gasto supera el efectivo esperado en la caja de la sede seleccionada.'
    );
  }
};

const registrarMovimientoCajaGasto = async ({
  gasto,
  medioPagoId,
  req,
  transaction
}) => {
  const existente = await obtenerMovimientoGastoVigente(gasto.id, transaction);

  if (existente) return existente;

  const medioPago = await obtenerMedioPagoCaja(medioPagoId, transaction);
  const sesion = await obtenerSesionAbierta(gasto.sede_id, transaction);
  const importe = Number(gasto.importe_total || 0);

  await validarEfectivoDisponible({
    sesion,
    medioPago,
    importe,
    transaction
  });

  return CajasMovimientosModel.create(
    {
      caja_sesion_id: Number(sesion.id),
      caja_id: Number(sesion.caja_id),
      sede_id: Number(gasto.sede_id),
      gasto_id: Number(gasto.id),
      medio_pago_id: Number(medioPago.id),
      usuario_registro_id: usuarioId(req),
      tipo: 'egreso',
      origen: 'gasto',
      fecha_movimiento: new Date(),
      monto: importe.toFixed(2),
      descripcion: `Gasto: ${String(gasto.nombre || '').slice(0, 248)}`,
      estado: ESTADO_MOVIMIENTO_VIGENTE,
      referencia: `GASTO-${gasto.id}`,
      observaciones: gasto.observacion || null
    },
    { transaction }
  );
};

const anularMovimientoCajaGasto = async ({
  movimiento,
  gasto,
  req,
  transaction
}) => {
  if (!movimiento) return;

  const sesion = await CajasSesionesModel.findByPk(movimiento.caja_sesion_id, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!sesion || sesion.estado !== 'abierta') {
    throw crearErrorOperacion(
      'No se puede revertir el gasto porque la caja donde se registró ya está cerrada. Conservá el gasto pagado y realizá un ajuste auditable desde Caja si corresponde.'
    );
  }

  const detalleReversion = `Movimiento anulado al cambiar el gasto #${gasto.id} a ${gasto.estado}. Usuario: ${usuarioId(req)}.`;
  const observaciones = [movimiento.observaciones, detalleReversion]
    .filter(Boolean)
    .join(' ')
    .slice(0, 500);

  await movimiento.update(
    {
      estado: 'anulado',
      observaciones,
      updated_at: new Date()
    },
    { transaction }
  );
};

const anexarMovimientosCajaAGastos = async (registros = []) => {
  const planos = registros.map((registro) =>
    typeof registro?.toJSON === 'function' ? registro.toJSON() : { ...registro }
  );
  const gastoIds = planos.map((registro) => Number(registro.id)).filter(Boolean);

  if (!gastoIds.length) return planos;

  const movimientos = await CajasMovimientosModel.findAll({
    where: {
      gasto_id: {
        [Op.in]: gastoIds
      }
    },
    order: [['id', 'DESC']]
  });

  const medioIds = [
    ...new Set(
      movimientos
        .map((movimiento) => Number(movimiento.medio_pago_id))
        .filter(Boolean)
    )
  ];
  const medios = medioIds.length
    ? await PagosMediosPagoModel.findAll({
        where: {
          id: {
            [Op.in]: medioIds
          }
        },
        attributes: ['id', 'nombre', 'codigo', 'tipo', 'impacta_caja']
      })
    : [];
  const mediosMap = medios.reduce((acc, medio) => {
    const plano = typeof medio.toJSON === 'function' ? medio.toJSON() : medio;
    acc[Number(plano.id)] = plano;
    return acc;
  }, {});
  const movimientosMap = movimientos.reduce((acc, movimiento) => {
    const plano =
      typeof movimiento.toJSON === 'function'
        ? movimiento.toJSON()
        : movimiento;
    const gastoId = Number(plano.gasto_id);

    if (!acc[gastoId]) acc[gastoId] = [];
    acc[gastoId].push({
      ...plano,
      medio_pago: plano.medio_pago_id
        ? mediosMap[Number(plano.medio_pago_id)] || null
        : null
    });
    return acc;
  }, {});

  return planos.map((registro) => ({
    ...registro,
    movimientos_caja: movimientosMap[Number(registro.id)] || []
  }));
};

const buildPayloadGastoCreate = (body = {}) => {
  const importeTotal = normalizarDecimal(body.importe_total, 0);
  const incluyeIva = normalizarTinyint(body.incluye_iva, 0);
  const ivaPorcentaje =
    incluyeIva === 1
      ? normalizarDecimal(body.iva_porcentaje === undefined ? 21 : body.iva_porcentaje, 21)
      : null;
  const importeIva =
    body.importe_iva !== undefined && body.importe_iva !== null && body.importe_iva !== ''
      ? normalizarDecimal(body.importe_iva, 0)
      : calcularImporteIva({ importeTotal, incluyeIva, ivaPorcentaje });

  return {
    sede_id: toNumberOrNull(body.sede_id),
    tipo_gasto_id: toNumberOrNull(body.tipo_gasto_id),
    proveedor_id: toNumberOrNull(body.proveedor_id),
    gasto_periodico_id: toNumberOrNull(body.gasto_periodico_id),
    nombre: normalizarTexto(body.nombre),
    descripcion: normalizarTexto(body.descripcion),
    fecha_gasto: normalizarFecha(body.fecha_gasto),
    fecha_pago:
      normalizarTexto(body.estado) === 'pagado'
        ? normalizarFecha(body.fecha_pago) || obtenerFechaActualDateOnly()
        : null,
    importe_total: importeTotal,
    incluye_iva: incluyeIva,
    iva_porcentaje: ivaPorcentaje,
    importe_iva: importeIva,
    estado: normalizarTexto(body.estado) || 'pendiente',
    origen: normalizarTexto(body.origen) || 'manual',
    observacion: normalizarTexto(body.observacion)
  };
};

const buildPayloadGastoUpdate = (body = {}) => {
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(body, 'sede_id')) payload.sede_id = toNumberOrNull(body.sede_id);
  if (Object.prototype.hasOwnProperty.call(body, 'tipo_gasto_id')) payload.tipo_gasto_id = toNumberOrNull(body.tipo_gasto_id);
  if (Object.prototype.hasOwnProperty.call(body, 'proveedor_id')) payload.proveedor_id = toNumberOrNull(body.proveedor_id);
  if (Object.prototype.hasOwnProperty.call(body, 'gasto_periodico_id')) payload.gasto_periodico_id = toNumberOrNull(body.gasto_periodico_id);
  if (Object.prototype.hasOwnProperty.call(body, 'nombre')) payload.nombre = normalizarTexto(body.nombre);
  if (Object.prototype.hasOwnProperty.call(body, 'descripcion')) payload.descripcion = normalizarTexto(body.descripcion);
  if (Object.prototype.hasOwnProperty.call(body, 'fecha_gasto')) payload.fecha_gasto = normalizarFecha(body.fecha_gasto);
  if (Object.prototype.hasOwnProperty.call(body, 'fecha_pago')) payload.fecha_pago = normalizarFecha(body.fecha_pago);
  if (Object.prototype.hasOwnProperty.call(body, 'estado')) payload.estado = normalizarTexto(body.estado);
  if (Object.prototype.hasOwnProperty.call(body, 'origen')) payload.origen = normalizarTexto(body.origen);
  if (Object.prototype.hasOwnProperty.call(body, 'observacion')) payload.observacion = normalizarTexto(body.observacion);

  const tocaImportes =
    Object.prototype.hasOwnProperty.call(body, 'importe_total') ||
    Object.prototype.hasOwnProperty.call(body, 'incluye_iva') ||
    Object.prototype.hasOwnProperty.call(body, 'iva_porcentaje') ||
    Object.prototype.hasOwnProperty.call(body, 'importe_iva');

  if (tocaImportes) {
    const importeTotal = normalizarDecimal(body.importe_total, 0);
    const incluyeIva = normalizarTinyint(body.incluye_iva, 0);
    const ivaPorcentaje =
      incluyeIva === 1
        ? normalizarDecimal(body.iva_porcentaje === undefined ? 21 : body.iva_porcentaje, 21)
        : null;
    const importeIva =
      body.importe_iva !== undefined && body.importe_iva !== null && body.importe_iva !== ''
        ? normalizarDecimal(body.importe_iva, 0)
        : calcularImporteIva({ importeTotal, incluyeIva, ivaPorcentaje });

    payload.importe_total = importeTotal;
    payload.incluye_iva = incluyeIva;
    payload.iva_porcentaje = ivaPorcentaje;
    payload.importe_iva = importeIva;
  }

  return payload;
};

const validarPayloadGasto = (payload = {}, modo = 'create') => {
  const errores = [];

  if (modo === 'create' && !payload.tipo_gasto_id) {
    errores.push('El tipo de gasto es obligatorio.');
  }

  if (modo === 'create' && !payload.nombre) {
    errores.push('El nombre del gasto es obligatorio.');
  }

  if (modo === 'create' && !payload.fecha_gasto) {
    errores.push('La fecha del gasto es obligatoria.');
  }

  if (modo === 'create' && Number(payload.importe_total || 0) <= 0) {
    errores.push('El importe total debe ser mayor a cero.');
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'tipo_gasto_id') && !payload.tipo_gasto_id) {
    errores.push('El tipo de gasto es obligatorio.');
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'nombre') && !payload.nombre) {
    errores.push('El nombre del gasto no puede estar vacío.');
  }

  if (payload.nombre && payload.nombre.length > 160) {
    errores.push('El nombre no puede superar los 160 caracteres.');
  }

  if (payload.descripcion && payload.descripcion.length > 500) {
    errores.push('La descripción no puede superar los 500 caracteres.');
  }

  if (payload.observacion && payload.observacion.length > 500) {
    errores.push('La observación no puede superar los 500 caracteres.');
  }

  if (payload.fecha_gasto && !esFechaDateOnlyValida(payload.fecha_gasto)) {
    errores.push('La fecha del gasto debe tener formato YYYY-MM-DD.');
  }

  if (payload.fecha_pago && !esFechaDateOnlyValida(payload.fecha_pago)) {
    errores.push('La fecha de pago debe tener formato YYYY-MM-DD.');
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'importe_total') && Number(payload.importe_total || 0) <= 0) {
    errores.push('El importe total debe ser mayor a cero.');
  }

  if (payload.estado && !ESTADOS_GASTO_VALIDOS.includes(payload.estado)) {
    errores.push('El estado del gasto indicado no es válido.');
  }

  if (payload.origen && !ORIGENES_GASTO_VALIDOS.includes(payload.origen)) {
    errores.push('El origen del gasto indicado no es válido.');
  }

  if (Number(payload.incluye_iva || 0) === 1 && Number(payload.iva_porcentaje || 0) <= 0) {
    errores.push('Si el gasto incluye IVA, el porcentaje de IVA debe ser mayor a cero.');
  }

  return errores;
};

const construirWhereGastos = (query = {}) => {
  const where = {};

  const search = normalizarTexto(query.q);

  if (search) {
    where[Op.or] = [
      { nombre: { [Op.like]: `%${search}%` } },
      { descripcion: { [Op.like]: `%${search}%` } },
      { observacion: { [Op.like]: `%${search}%` } }
    ];
  }

  if (query.tipo_gasto_id) where.tipo_gasto_id = Number(query.tipo_gasto_id);
  if (query.proveedor_id) where.proveedor_id = Number(query.proveedor_id);
  if (query.gasto_periodico_id) where.gasto_periodico_id = Number(query.gasto_periodico_id);
  if (query.estado) where.estado = query.estado;
  if (query.origen) where.origen = query.origen;

  if (query.fecha_desde || query.fecha_hasta) {
    where.fecha_gasto = {};

    if (query.fecha_desde) where.fecha_gasto[Op.gte] = query.fecha_desde;
    if (query.fecha_hasta) where.fecha_gasto[Op.lte] = query.fecha_hasta;
  }

  if (query.incluye_iva !== undefined && query.incluye_iva !== null && query.incluye_iva !== '') {
    where.incluye_iva = normalizarTinyint(query.incluye_iva, 0);
  }

  return where;
};

const buildIncludeGastos = () => [
  {
    model: GastosTiposModel,
    as: 'tipo_gasto',
    attributes: ['id', 'nombre', 'activo'],
    required: false
  },
  {
    model: GastosProveedoresModel,
    as: 'proveedor',
    attributes: ['id', 'nombre', 'cuit', 'telefono', 'email', 'activo'],
    required: false
  },
  {
    model: GastosPeriodicosModel,
    as: 'gasto_periodico',
    attributes: ['id', 'nombre', 'frecuencia', 'activo'],
    required: false
  }
];

export const OBR_Gastos_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaGastos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar gastos.'
      });
    }

    const {
      sede_id,
      page = 1,
      limit = 20,
      orderBy = 'fecha_gasto',
      orderDirection = 'DESC'
    } = req.query;

    const where = construirWhereGastos(req.query);
    const scope = aplicarScopeSedesGastos(where, req.user, sede_id);

    if (!scope.ok) {
      return res.status(scope.status).json({
        ok: false,
        message: scope.message
      });
    }

    if (where.estado && !ESTADOS_GASTO_VALIDOS.includes(where.estado)) {
      return res.status(400).json({
        ok: false,
        message: 'Estado de gasto inválido.',
        estados_validos: ESTADOS_GASTO_VALIDOS
      });
    }

    if (where.origen && !ORIGENES_GASTO_VALIDOS.includes(where.origen)) {
      return res.status(400).json({
        ok: false,
        message: 'Origen de gasto inválido.',
        origenes_validos: ORIGENES_GASTO_VALIDOS
      });
    }

    const { pageNumber, limitNumber, offset } = buildPagination({ page, limit });
    const order = buildOrder({
      orderBy,
      orderDirection,
      allowedFields: [
        'id',
        'nombre',
        'fecha_gasto',
        'fecha_pago',
        'importe_total',
        'estado',
        'origen',
        'created_at',
        'updated_at'
      ]
    });

    const { rows, count } = await GastosGastosModel.findAndCountAll({
      where,
      include: buildIncludeGastos(),
      limit: limitNumber,
      offset,
      order,
      distinct: true
    });

    const dataConSedes = await anexarSedesARegistros(rows);
    const data = await anexarMovimientosCajaAGastos(dataConSedes);

    return res.status(200).json({
      ok: true,
      message: 'Gastos obtenidos correctamente.',
      total: count,
      page: pageNumber,
      limit: limitNumber,
      total_pages: Math.ceil(count / limitNumber),
      data
    });
  } catch (error) {
    return manejarErrorControlador({ res, error, nombre: 'OBR_Gastos_CTS' });
  }
};

export const OBR_GastoPorId_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaGastos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar gastos.'
      });
    }

    const { id } = req.params;
    const gasto = await GastosGastosModel.findByPk(id, {
      include: buildIncludeGastos()
    });

    if (!gasto) {
      return res.status(404).json({
        ok: false,
        message: 'Gasto no encontrado.'
      });
    }

    const scope = aplicarScopeSedesGastos({}, req.user, gasto.sede_id);

    if (!scope.ok) {
      return res.status(scope.status).json({
        ok: false,
        message: scope.message
      });
    }

    const [dataConSede] = await anexarSedesARegistros([gasto]);
    const [data] = await anexarMovimientosCajaAGastos([dataConSede]);

    return res.status(200).json({
      ok: true,
      message: 'Gasto obtenido correctamente.',
      data
    });
  } catch (error) {
    return manejarErrorControlador({ res, error, nombre: 'OBR_GastoPorId_CTS' });
  }
};

export const CR_Gastos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionGastos(req.user)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para crear gastos.'
      });
    }

    const payload = buildPayloadGastoCreate(req.body);
    const errores = validarPayloadGasto(payload, 'create');

    const erroresRelaciones = await validarSedeTipoProveedor({
      payload,
      user: req.user,
      transaction
    });

    errores.push(...erroresRelaciones);

    if (payload.gasto_periodico_id) {
      const periodico = await GastosPeriodicosModel.findByPk(payload.gasto_periodico_id, {
        transaction
      });

      if (!periodico) {
        errores.push('El gasto periódico indicado no existe.');
      }
    }

    if (errores.length > 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para crear el gasto.',
        errors: errores
      });
    }

    const nuevoGasto = await GastosGastosModel.create(payload, { transaction });

    if (payload.estado === 'pagado') {
      await registrarMovimientoCajaGasto({
        gasto: nuevoGasto,
        medioPagoId: req.body.medio_pago_id,
        req,
        transaction
      });
    }

    await transaction.commit();

    const data = await GastosGastosModel.findByPk(nuevoGasto.id, {
      include: buildIncludeGastos()
    });
    const [dataConSede] = await anexarSedesARegistros([data]);
    const [dataConCaja] = await anexarMovimientosCajaAGastos([dataConSede]);

    return res.status(201).json({
      ok: true,
      message: 'Gasto creado correctamente.',
      data: dataConCaja
    });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();

    if (error?.status) {
      return res.status(error.status).json({
        ok: false,
        message: error.message
      });
    }

    return manejarErrorControlador({ res, error, nombre: 'CR_Gastos_CTS' });
  }
};

export const UR_Gastos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionGastos(req.user)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para actualizar gastos.'
      });
    }

    const { id } = req.params;
    const gasto = await GastosGastosModel.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!gasto) {
      await transaction.rollback();

      return res.status(404).json({
        ok: false,
        message: 'Gasto no encontrado.'
      });
    }

    const scopeActual = aplicarScopeSedesGastos({}, req.user, gasto.sede_id);

    if (!scopeActual.ok) {
      await transaction.rollback();

      return res.status(scopeActual.status).json({
        ok: false,
        message: scopeActual.message
      });
    }

    const payload = buildPayloadGastoUpdate(req.body);
    const errores = validarPayloadGasto(payload, 'update');

    const payloadParaValidar = {
      sede_id: Object.prototype.hasOwnProperty.call(payload, 'sede_id')
        ? payload.sede_id
        : gasto.sede_id,
      tipo_gasto_id: Object.prototype.hasOwnProperty.call(payload, 'tipo_gasto_id')
        ? payload.tipo_gasto_id
        : gasto.tipo_gasto_id,
      proveedor_id: Object.prototype.hasOwnProperty.call(payload, 'proveedor_id')
        ? payload.proveedor_id
        : gasto.proveedor_id
    };

    const erroresRelaciones = await validarSedeTipoProveedor({
      payload: payloadParaValidar,
      user: req.user,
      transaction
    });

    errores.push(...erroresRelaciones);

    if (Object.prototype.hasOwnProperty.call(payload, 'gasto_periodico_id') && payload.gasto_periodico_id) {
      const periodico = await GastosPeriodicosModel.findByPk(payload.gasto_periodico_id, {
        transaction
      });

      if (!periodico) {
        errores.push('El gasto periódico indicado no existe.');
      }
    }

    if (errores.length > 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para actualizar el gasto.',
        errors: errores
      });
    }

    const estadoSiguiente = String(
      Object.prototype.hasOwnProperty.call(payload, 'estado')
        ? payload.estado
        : gasto.estado
    ).toLowerCase();
    const movimientoVigente = await obtenerMovimientoGastoVigente(
      gasto.id,
      transaction
    );
    const cambiaSede =
      Object.prototype.hasOwnProperty.call(payload, 'sede_id') &&
      Number(payload.sede_id || 0) !== Number(gasto.sede_id || 0);
    const cambiaImporte =
      Object.prototype.hasOwnProperty.call(payload, 'importe_total') &&
      Math.abs(
        Number(payload.importe_total || 0) - Number(gasto.importe_total || 0)
      ) > 0.009;
    const cambiaMedio =
      movimientoVigente &&
      req.body.medio_pago_id !== undefined &&
      Number(req.body.medio_pago_id || 0) !==
        Number(movimientoVigente.medio_pago_id || 0);

    if (
      movimientoVigente &&
      estadoSiguiente === 'pagado' &&
      (cambiaSede || cambiaImporte || cambiaMedio)
    ) {
      await transaction.rollback();

      return res.status(409).json({
        ok: false,
        message:
          'No se puede modificar la sede, el importe o el medio de pago de un gasto que ya impactó en Caja. Primero revertí el gasto a pendiente.'
      });
    }

    if (estadoSiguiente === 'pagado') {
      payload.fecha_pago =
        payload.fecha_pago || gasto.fecha_pago || obtenerFechaActualDateOnly();
    } else if (Object.prototype.hasOwnProperty.call(payload, 'estado')) {
      payload.fecha_pago = null;
    }

    await gasto.update(payload, { transaction });

    if (estadoSiguiente === 'pagado' && !movimientoVigente) {
      await registrarMovimientoCajaGasto({
        gasto,
        medioPagoId: req.body.medio_pago_id,
        req,
        transaction
      });
    }

    if (
      movimientoVigente &&
      estadoSiguiente !== 'pagado'
    ) {
      await anularMovimientoCajaGasto({
        movimiento: movimientoVigente,
        gasto,
        req,
        transaction
      });
    }

    await transaction.commit();

    const actualizado = await GastosGastosModel.findByPk(id, {
      include: buildIncludeGastos()
    });
    const [dataConSede] = await anexarSedesARegistros([actualizado]);
    const [data] = await anexarMovimientosCajaAGastos([dataConSede]);

    return res.status(200).json({
      ok: true,
      message: 'Gasto actualizado correctamente.',
      data
    });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();

    if (error?.status) {
      return res.status(error.status).json({
        ok: false,
        message: error.message
      });
    }

    return manejarErrorControlador({ res, error, nombre: 'UR_Gastos_CTS' });
  }
};

export const DR_Gastos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionGastos(req.user)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para eliminar gastos.'
      });
    }

    const { id } = req.params;
    const gasto = await GastosGastosModel.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!gasto) {
      await transaction.rollback();

      return res.status(404).json({
        ok: false,
        message: 'Gasto no encontrado.'
      });
    }

    const scope = aplicarScopeSedesGastos({}, req.user, gasto.sede_id);

    if (!scope.ok) {
      await transaction.rollback();

      return res.status(scope.status).json({
        ok: false,
        message: scope.message
      });
    }

    const movimientosCaja = await CajasMovimientosModel.count({
      where: {
        gasto_id: Number(gasto.id)
      },
      transaction
    });

    if (movimientosCaja > 0 || gasto.estado === 'pagado') {
      await transaction.rollback();

      return res.status(409).json({
        ok: false,
        message:
          'No se puede eliminar físicamente un gasto que ya impactó en Caja.',
        detalle:
          'Conservá el registro para mantener la trazabilidad financiera. Si la caja sigue abierta, primero podés revertirlo a pendiente.',
        asociaciones_detectadas: {
          cajas_movimientos: Number(movimientosCaja)
        },
        asociaciones:
          movimientosCaja > 0
            ? [
                {
                  tabla: 'cajas_movimientos',
                  cantidad: Number(movimientosCaja)
                }
              ]
            : []
      });
    }

    const data = typeof gasto.toJSON === 'function' ? gasto.toJSON() : gasto;

    await gasto.destroy({ transaction });
    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Gasto eliminado físicamente correctamente.',
      data
    });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();

    if (error?.status) {
      return res.status(error.status).json({
        ok: false,
        message: error.message
      });
    }

    return manejarErrorControlador({ res, error, nombre: 'DR_Gastos_CTS' });
  }
};
