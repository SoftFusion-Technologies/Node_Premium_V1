/*
 * Benjamin Orellana - 2026/07/07 - Controlador Sequelize para gastos periódicos PREMIUM.
 */

import { Op } from 'sequelize';

import db from '../../DataBase/db.js';
import GastosPeriodicosModel from '../../Models/Gastos/MD_TB_GastosPeriodicos.js';
import GastosGastosModel from '../../Models/Gastos/MD_TB_GastosGastos.js';
import GastosTiposModel from '../../Models/Gastos/MD_TB_GastosTipos.js';
import GastosProveedoresModel from '../../Models/Gastos/MD_TB_GastosProveedores.js';

import {
  anexarSedesARegistros,
  aplicarScopeSedesGastos,
  armarRespuestaAsociacionesBloqueantes,
  buildOrder,
  buildPagination,
  calcularImporteIva,
  esFechaDateOnlyValida,
  FRECUENCIAS_GASTO_PERIODICO_VALIDAS,
  manejarErrorControlador,
  normalizarDecimal,
  normalizarFecha,
  normalizarTexto,
  normalizarTinyint,
  obtenerFechaActualDateOnly,
  sumarFechaPorFrecuencia,
  toNumberOrNull,
  validarRolLecturaGastos,
  validarRolOperacionGastos,
  validarSedeTipoProveedor
} from './gastos.helpers.js';

const buildPayloadPeriodicoCreate = (body = {}) => {
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
  const fechaInicio = normalizarFecha(body.fecha_inicio);

  return {
    sede_id: toNumberOrNull(body.sede_id),
    tipo_gasto_id: toNumberOrNull(body.tipo_gasto_id),
    proveedor_id: toNumberOrNull(body.proveedor_id),
    nombre: normalizarTexto(body.nombre),
    descripcion: normalizarTexto(body.descripcion),
    importe_total: importeTotal,
    incluye_iva: incluyeIva,
    iva_porcentaje: ivaPorcentaje,
    importe_iva: importeIva,
    frecuencia: normalizarTexto(body.frecuencia) || 'mensual',
    fecha_inicio: fechaInicio,
    fecha_fin: normalizarFecha(body.fecha_fin),
    proxima_fecha_generacion:
      normalizarFecha(body.proxima_fecha_generacion) || fechaInicio,
    ultima_fecha_generada: normalizarFecha(body.ultima_fecha_generada),
    activo: normalizarTinyint(body.activo, 1),
    observacion: normalizarTexto(body.observacion)
  };
};

const buildPayloadPeriodicoUpdate = (body = {}) => {
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(body, 'sede_id')) payload.sede_id = toNumberOrNull(body.sede_id);
  if (Object.prototype.hasOwnProperty.call(body, 'tipo_gasto_id')) payload.tipo_gasto_id = toNumberOrNull(body.tipo_gasto_id);
  if (Object.prototype.hasOwnProperty.call(body, 'proveedor_id')) payload.proveedor_id = toNumberOrNull(body.proveedor_id);
  if (Object.prototype.hasOwnProperty.call(body, 'nombre')) payload.nombre = normalizarTexto(body.nombre);
  if (Object.prototype.hasOwnProperty.call(body, 'descripcion')) payload.descripcion = normalizarTexto(body.descripcion);
  if (Object.prototype.hasOwnProperty.call(body, 'frecuencia')) payload.frecuencia = normalizarTexto(body.frecuencia);
  if (Object.prototype.hasOwnProperty.call(body, 'fecha_inicio')) payload.fecha_inicio = normalizarFecha(body.fecha_inicio);
  if (Object.prototype.hasOwnProperty.call(body, 'fecha_fin')) payload.fecha_fin = normalizarFecha(body.fecha_fin);
  if (Object.prototype.hasOwnProperty.call(body, 'proxima_fecha_generacion')) payload.proxima_fecha_generacion = normalizarFecha(body.proxima_fecha_generacion);
  if (Object.prototype.hasOwnProperty.call(body, 'ultima_fecha_generada')) payload.ultima_fecha_generada = normalizarFecha(body.ultima_fecha_generada);
  if (Object.prototype.hasOwnProperty.call(body, 'activo')) payload.activo = normalizarTinyint(body.activo, 1);
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

const validarPayloadPeriodico = (payload = {}, modo = 'create') => {
  const errores = [];

  if (modo === 'create' && !payload.tipo_gasto_id) errores.push('El tipo de gasto es obligatorio.');
  if (modo === 'create' && !payload.nombre) errores.push('El nombre del gasto periódico es obligatorio.');
  if (modo === 'create' && !payload.fecha_inicio) errores.push('La fecha de inicio es obligatoria.');
  if (modo === 'create' && Number(payload.importe_total || 0) <= 0) errores.push('El importe total debe ser mayor a cero.');

  if (Object.prototype.hasOwnProperty.call(payload, 'tipo_gasto_id') && !payload.tipo_gasto_id) {
    errores.push('El tipo de gasto es obligatorio.');
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'nombre') && !payload.nombre) {
    errores.push('El nombre del gasto periódico no puede estar vacío.');
  }

  if (payload.nombre && payload.nombre.length > 160) errores.push('El nombre no puede superar los 160 caracteres.');
  if (payload.descripcion && payload.descripcion.length > 500) errores.push('La descripción no puede superar los 500 caracteres.');
  if (payload.observacion && payload.observacion.length > 500) errores.push('La observación no puede superar los 500 caracteres.');

  if (payload.frecuencia && !FRECUENCIAS_GASTO_PERIODICO_VALIDAS.includes(payload.frecuencia)) {
    errores.push('La frecuencia del gasto periódico no es válida.');
  }

  if (payload.fecha_inicio && !esFechaDateOnlyValida(payload.fecha_inicio)) {
    errores.push('La fecha de inicio debe tener formato YYYY-MM-DD.');
  }

  if (payload.fecha_fin && !esFechaDateOnlyValida(payload.fecha_fin)) {
    errores.push('La fecha de fin debe tener formato YYYY-MM-DD.');
  }

  if (payload.proxima_fecha_generacion && !esFechaDateOnlyValida(payload.proxima_fecha_generacion)) {
    errores.push('La próxima fecha de generación debe tener formato YYYY-MM-DD.');
  }

  if (payload.ultima_fecha_generada && !esFechaDateOnlyValida(payload.ultima_fecha_generada)) {
    errores.push('La última fecha generada debe tener formato YYYY-MM-DD.');
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'importe_total') && Number(payload.importe_total || 0) <= 0) {
    errores.push('El importe total debe ser mayor a cero.');
  }

  if (Number(payload.incluye_iva || 0) === 1 && Number(payload.iva_porcentaje || 0) <= 0) {
    errores.push('Si el gasto incluye IVA, el porcentaje de IVA debe ser mayor a cero.');
  }

  if (payload.fecha_inicio && payload.fecha_fin && payload.fecha_fin < payload.fecha_inicio) {
    errores.push('La fecha de fin no puede ser anterior a la fecha de inicio.');
  }

  return errores;
};

const construirWherePeriodicos = (query = {}) => {
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
  if (query.frecuencia) where.frecuencia = query.frecuencia;

  if (query.activo !== undefined && query.activo !== null && query.activo !== '') {
    where.activo = normalizarTinyint(query.activo, 1);
  }

  if (query.proxima_desde || query.proxima_hasta) {
    where.proxima_fecha_generacion = {};
    if (query.proxima_desde) where.proxima_fecha_generacion[Op.gte] = query.proxima_desde;
    if (query.proxima_hasta) where.proxima_fecha_generacion[Op.lte] = query.proxima_hasta;
  }

  return where;
};

const buildIncludePeriodicos = () => [
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
  }
];

export const OBR_GastosPeriodicos_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaGastos(req.user)) {
      return res.status(403).json({ ok: false, message: 'No tiene permisos para consultar gastos periódicos.' });
    }

    const { sede_id, page = 1, limit = 20, orderBy = 'proxima_fecha_generacion', orderDirection = 'ASC' } = req.query;
    const where = construirWherePeriodicos(req.query);
    const scope = aplicarScopeSedesGastos(where, req.user, sede_id);

    if (!scope.ok) {
      return res.status(scope.status).json({ ok: false, message: scope.message });
    }

    if (where.frecuencia && !FRECUENCIAS_GASTO_PERIODICO_VALIDAS.includes(where.frecuencia)) {
      return res.status(400).json({
        ok: false,
        message: 'Frecuencia inválida.',
        frecuencias_validas: FRECUENCIAS_GASTO_PERIODICO_VALIDAS
      });
    }

    const { pageNumber, limitNumber, offset } = buildPagination({ page, limit });
    const order = buildOrder({
      orderBy,
      orderDirection,
      allowedFields: ['id', 'nombre', 'frecuencia', 'fecha_inicio', 'fecha_fin', 'proxima_fecha_generacion', 'importe_total', 'activo', 'created_at', 'updated_at']
    });

    const { rows, count } = await GastosPeriodicosModel.findAndCountAll({
      where,
      include: buildIncludePeriodicos(),
      limit: limitNumber,
      offset,
      order,
      distinct: true
    });

    const data = await anexarSedesARegistros(rows);

    return res.status(200).json({
      ok: true,
      message: 'Gastos periódicos obtenidos correctamente.',
      total: count,
      page: pageNumber,
      limit: limitNumber,
      total_pages: Math.ceil(count / limitNumber),
      data
    });
  } catch (error) {
    return manejarErrorControlador({ res, error, nombre: 'OBR_GastosPeriodicos_CTS' });
  }
};

export const OBR_GastoPeriodicoPorId_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaGastos(req.user)) {
      return res.status(403).json({ ok: false, message: 'No tiene permisos para consultar gastos periódicos.' });
    }

    const { id } = req.params;
    const periodico = await GastosPeriodicosModel.findByPk(id, { include: buildIncludePeriodicos() });

    if (!periodico) {
      return res.status(404).json({ ok: false, message: 'Gasto periódico no encontrado.' });
    }

    const scope = aplicarScopeSedesGastos({}, req.user, periodico.sede_id);

    if (!scope.ok) {
      return res.status(scope.status).json({ ok: false, message: scope.message });
    }

    const [data] = await anexarSedesARegistros([periodico]);

    return res.status(200).json({ ok: true, message: 'Gasto periódico obtenido correctamente.', data });
  } catch (error) {
    return manejarErrorControlador({ res, error, nombre: 'OBR_GastoPeriodicoPorId_CTS' });
  }
};

export const CR_GastosPeriodicos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionGastos(req.user)) {
      await transaction.rollback();
      return res.status(403).json({ ok: false, message: 'No tiene permisos para crear gastos periódicos.' });
    }

    const payload = buildPayloadPeriodicoCreate(req.body);
    const errores = validarPayloadPeriodico(payload, 'create');
    const erroresRelaciones = await validarSedeTipoProveedor({ payload, user: req.user, transaction });
    errores.push(...erroresRelaciones);

    if (errores.length > 0) {
      await transaction.rollback();
      return res.status(400).json({ ok: false, message: 'Datos inválidos para crear el gasto periódico.', errors: errores });
    }

    const nuevoPeriodico = await GastosPeriodicosModel.create(payload, { transaction });
    await transaction.commit();

    const data = await GastosPeriodicosModel.findByPk(nuevoPeriodico.id, { include: buildIncludePeriodicos() });
    const [dataConSede] = await anexarSedesARegistros([data]);

    return res.status(201).json({ ok: true, message: 'Gasto periódico creado correctamente.', data: dataConSede });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    return manejarErrorControlador({ res, error, nombre: 'CR_GastosPeriodicos_CTS' });
  }
};

export const UR_GastosPeriodicos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionGastos(req.user)) {
      await transaction.rollback();
      return res.status(403).json({ ok: false, message: 'No tiene permisos para actualizar gastos periódicos.' });
    }

    const { id } = req.params;
    const periodico = await GastosPeriodicosModel.findByPk(id, { transaction });

    if (!periodico) {
      await transaction.rollback();
      return res.status(404).json({ ok: false, message: 'Gasto periódico no encontrado.' });
    }

    const scopeActual = aplicarScopeSedesGastos({}, req.user, periodico.sede_id);

    if (!scopeActual.ok) {
      await transaction.rollback();
      return res.status(scopeActual.status).json({ ok: false, message: scopeActual.message });
    }

    const payload = buildPayloadPeriodicoUpdate(req.body);
    const errores = validarPayloadPeriodico(payload, 'update');

    const payloadParaValidar = {
      sede_id: Object.prototype.hasOwnProperty.call(payload, 'sede_id') ? payload.sede_id : periodico.sede_id,
      tipo_gasto_id: Object.prototype.hasOwnProperty.call(payload, 'tipo_gasto_id') ? payload.tipo_gasto_id : periodico.tipo_gasto_id,
      proveedor_id: Object.prototype.hasOwnProperty.call(payload, 'proveedor_id') ? payload.proveedor_id : periodico.proveedor_id
    };

    const erroresRelaciones = await validarSedeTipoProveedor({ payload: payloadParaValidar, user: req.user, transaction });
    errores.push(...erroresRelaciones);

    if (errores.length > 0) {
      await transaction.rollback();
      return res.status(400).json({ ok: false, message: 'Datos inválidos para actualizar el gasto periódico.', errors: errores });
    }

    await periodico.update(payload, { transaction });
    await transaction.commit();

    const actualizado = await GastosPeriodicosModel.findByPk(id, { include: buildIncludePeriodicos() });
    const [data] = await anexarSedesARegistros([actualizado]);

    return res.status(200).json({ ok: true, message: 'Gasto periódico actualizado correctamente.', data });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    return manejarErrorControlador({ res, error, nombre: 'UR_GastosPeriodicos_CTS' });
  }
};

export const CR_GenerarGastoDesdePeriodico_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionGastos(req.user)) {
      await transaction.rollback();
      return res.status(403).json({ ok: false, message: 'No tiene permisos para generar gastos periódicos.' });
    }

    const { id } = req.params;
    const periodico = await GastosPeriodicosModel.findByPk(id, { transaction });

    if (!periodico) {
      await transaction.rollback();
      return res.status(404).json({ ok: false, message: 'Gasto periódico no encontrado.' });
    }

    const scope = aplicarScopeSedesGastos({}, req.user, periodico.sede_id);

    if (!scope.ok) {
      await transaction.rollback();
      return res.status(scope.status).json({ ok: false, message: scope.message });
    }

    if (Number(periodico.activo || 0) !== 1) {
      await transaction.rollback();
      return res.status(400).json({ ok: false, message: 'El gasto periódico no está activo para generar gastos.' });
    }

    const fechaGasto = normalizarFecha(req.body.fecha_gasto) || periodico.proxima_fecha_generacion || obtenerFechaActualDateOnly();
    // Benjamin Orellana - 2026/07/27 - Un periódico genera la obligación pendiente.
    // El egreso se registra después desde Gastos, al seleccionar medio de pago y caja.
    const estado = 'pendiente';
    const fechaPago = null;

    const errores = [];

    if (!esFechaDateOnlyValida(fechaGasto)) errores.push('La fecha del gasto debe tener formato YYYY-MM-DD.');
    if (periodico.fecha_fin && fechaGasto > periodico.fecha_fin) {
      errores.push('La fecha del gasto supera la fecha de fin del gasto periódico.');
    }

    if (errores.length > 0) {
      await transaction.rollback();
      return res.status(400).json({ ok: false, message: 'Datos inválidos para generar el gasto.', errors: errores });
    }

    const nuevoGasto = await GastosGastosModel.create(
      {
        sede_id: periodico.sede_id,
        tipo_gasto_id: periodico.tipo_gasto_id,
        proveedor_id: periodico.proveedor_id,
        gasto_periodico_id: periodico.id,
        nombre: normalizarTexto(req.body.nombre) || periodico.nombre,
        descripcion: normalizarTexto(req.body.descripcion) || periodico.descripcion,
        fecha_gasto: fechaGasto,
        fecha_pago: fechaPago,
        importe_total: periodico.importe_total,
        incluye_iva: periodico.incluye_iva,
        iva_porcentaje: periodico.iva_porcentaje,
        importe_iva: periodico.importe_iva,
        estado,
        origen: 'periodico',
        observacion: normalizarTexto(req.body.observacion) || periodico.observacion
      },
      { transaction }
    );

    const proximaFecha = sumarFechaPorFrecuencia(fechaGasto, periodico.frecuencia);

    await periodico.update(
      {
        ultima_fecha_generada: fechaGasto,
        proxima_fecha_generacion:
          periodico.fecha_fin && proximaFecha && proximaFecha > periodico.fecha_fin
            ? null
            : proximaFecha
      },
      { transaction }
    );

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      message: 'Gasto generado desde periódico correctamente.',
      data: nuevoGasto
    });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    return manejarErrorControlador({ res, error, nombre: 'CR_GenerarGastoDesdePeriodico_CTS' });
  }
};

export const DR_GastosPeriodicos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionGastos(req.user)) {
      await transaction.rollback();
      return res.status(403).json({ ok: false, message: 'No tiene permisos para eliminar gastos periódicos.' });
    }

    const { id } = req.params;
    const periodico = await GastosPeriodicosModel.findByPk(id, { transaction });

    if (!periodico) {
      await transaction.rollback();
      return res.status(404).json({ ok: false, message: 'Gasto periódico no encontrado.' });
    }

    const scope = aplicarScopeSedesGastos({}, req.user, periodico.sede_id);

    if (!scope.ok) {
      await transaction.rollback();
      return res.status(scope.status).json({ ok: false, message: scope.message });
    }

    const gastosGenerados = await GastosGastosModel.count({ where: { gasto_periodico_id: id }, transaction });
    const detalleAsociaciones = armarRespuestaAsociacionesBloqueantes([
      { tabla: 'gastos_gastos', cantidad: gastosGenerados }
    ]);

    if (detalleAsociaciones.tiene_asociaciones) {
      await transaction.rollback();
      return res.status(409).json({
        ok: false,
        message:
          'No se puede eliminar físicamente el gasto periódico porque ya generó gastos.',
        detalle:
          'Primero eliminá los gastos generados o conservá este periódico como referencia histórica.',
        ...detalleAsociaciones
      });
    }

    const data = typeof periodico.toJSON === 'function' ? periodico.toJSON() : periodico;
    await periodico.destroy({ transaction });
    await transaction.commit();

    return res.status(200).json({ ok: true, message: 'Gasto periódico eliminado físicamente correctamente.', data });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    return manejarErrorControlador({ res, error, nombre: 'DR_GastosPeriodicos_CTS' });
  }
};
