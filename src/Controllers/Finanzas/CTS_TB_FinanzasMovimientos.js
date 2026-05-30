/*
 * Benjamin Orellana - 2026/05/30 - Controlador Sequelize para movimientos financieros PREMIUM.
 */

import { Op, fn, col, literal } from 'sequelize';
import db from '../../DataBase/db.js';

import FinanzasMovimientosModel from '../../Models/Finanzas/MD_TB_FinanzasMovimientos.js';
import FinanzasCategoriasModel from '../../Models/Finanzas/MD_TB_FinanzasCategorias.js';

import SedesModel from '../../Models/Sede/MD_TB_Sedes.js';
import PagosModel from '../../Models/Pago/MD_TB_Pagos.js';
import UsuariosModel from '../../Models/Usuario/MD_TB_Usuarios.js';

const TIPOS_MOVIMIENTO_VALIDOS = ['ingreso', 'egreso'];

const ORIGENES_MOVIMIENTO_VALIDOS = [
  'manual',
  'pago_alumno',
  'arca',
  'importacion',
  'ajuste'
];

const ESTADOS_MOVIMIENTO_VALIDOS = ['vigente', 'anulado'];

const CAMPOS_ORDEN_VALIDOS = [
  'id',
  'sede_id',
  'categoria_id',
  'pago_id',
  'tipo',
  'fecha',
  'descripcion',
  'monto',
  'origen',
  'comprobante_url',
  'referencia',
  'usuario_registro_id',
  'estado',
  'created_at',
  'updated_at'
];

// Benjamin Orellana - 2026/05/30 - Include permitido según relaciones reales del módulo Finanzas.
const includeFinanzaMovimiento = [
  {
    model: SedesModel,
    as: 'sede',
    required: false
  },
  {
    model: FinanzasCategoriasModel,
    as: 'categoria',
    required: false
  },
  {
    model: PagosModel,
    as: 'pago',
    required: false
  },
  {
    model: UsuariosModel,
    as: 'usuario_registro',
    required: false,
    attributes: {
      exclude: [
        'password',
        'password_hash',
        'remember_token',
        'token',
        'refresh_token'
      ]
    }
  }
];

// Benjamin Orellana - 2026/05/30 - Normaliza paginación para listados de movimientos financieros.
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

// Benjamin Orellana - 2026/05/30 - Valida importes financieros.
const esImporteValido = (valor) => {
  if (valor === null || valor === undefined || valor === '') return false;

  const numero = Number(valor);

  return !Number.isNaN(numero) && numero >= 0;
};

// Benjamin Orellana - 2026/05/30 - Valida formato YYYY-MM-DD para campos DATEONLY.
const esFechaDateOnlyValida = (valor) => {
  if (!valor || typeof valor !== 'string') return false;

  const regexFecha = /^\d{4}-\d{2}-\d{2}$/;

  if (!regexFecha.test(valor)) return false;

  const fecha = new Date(`${valor}T00:00:00`);

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

// Benjamin Orellana - 2026/05/30 - Valida payload de creación y edición de movimientos financieros.
const validarPayloadMovimiento = (body, esCreacion = true) => {
  const errores = [];

  if (
    body.sede_id !== undefined &&
    body.sede_id !== null &&
    body.sede_id !== ''
  ) {
    if (!esIdValido(body.sede_id)) {
      errores.push('El campo sede_id debe ser un ID válido o null.');
    }
  }

  if (
    body.categoria_id !== undefined &&
    body.categoria_id !== null &&
    body.categoria_id !== ''
  ) {
    if (!esIdValido(body.categoria_id)) {
      errores.push('El campo categoria_id debe ser un ID válido o null.');
    }
  }

  if (
    body.pago_id !== undefined &&
    body.pago_id !== null &&
    body.pago_id !== ''
  ) {
    if (!esIdValido(body.pago_id)) {
      errores.push('El campo pago_id debe ser un ID válido o null.');
    }
  }

  if (esCreacion || body.tipo !== undefined) {
    if (!body.tipo || !TIPOS_MOVIMIENTO_VALIDOS.includes(body.tipo)) {
      errores.push(
        `El campo tipo debe ser uno de los siguientes valores: ${TIPOS_MOVIMIENTO_VALIDOS.join(', ')}.`
      );
    }
  }

  if (esCreacion || body.fecha !== undefined) {
    if (!esFechaDateOnlyValida(body.fecha)) {
      errores.push(
        'El campo fecha es obligatorio y debe tener formato YYYY-MM-DD.'
      );
    }
  }

  if (esCreacion || body.descripcion !== undefined) {
    if (!body.descripcion || String(body.descripcion).trim() === '') {
      errores.push('El campo descripcion es obligatorio.');
    }

    if (body.descripcion && String(body.descripcion).length > 255) {
      errores.push('El campo descripcion no puede superar los 255 caracteres.');
    }
  }

  if (esCreacion || body.monto !== undefined) {
    if (!esImporteValido(body.monto)) {
      errores.push(
        'El campo monto es obligatorio y debe ser un importe válido mayor o igual a 0.'
      );
    }
  }

  if (
    body.origen !== undefined &&
    !ORIGENES_MOVIMIENTO_VALIDOS.includes(body.origen)
  ) {
    errores.push(
      `El campo origen debe ser uno de los siguientes valores: ${ORIGENES_MOVIMIENTO_VALIDOS.join(', ')}.`
    );
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

  if (
    body.referencia !== undefined &&
    body.referencia !== null &&
    String(body.referencia).length > 120
  ) {
    errores.push('El campo referencia no puede superar los 120 caracteres.');
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
    body.estado !== undefined &&
    !ESTADOS_MOVIMIENTO_VALIDOS.includes(body.estado)
  ) {
    errores.push(
      `El campo estado debe ser uno de los siguientes valores: ${ESTADOS_MOVIMIENTO_VALIDOS.join(', ')}.`
    );
  }

  return errores;
};

// Benjamin Orellana - 2026/05/30 - Valida referencias FK usando modelos relacionados reales.
const validarReferenciasMovimiento = async (body, transaction) => {
  const { sede_id, categoria_id, pago_id, usuario_registro_id } = body;

  if (sede_id !== undefined && sede_id !== null && sede_id !== '') {
    const sede = await SedesModel.findByPk(sede_id, { transaction });

    if (!sede) {
      return {
        ok: false,
        status: 404,
        message: 'No se encontró la sede indicada en sede_id.'
      };
    }
  }

  if (
    categoria_id !== undefined &&
    categoria_id !== null &&
    categoria_id !== ''
  ) {
    const categoria = await FinanzasCategoriasModel.findByPk(categoria_id, {
      transaction
    });

    if (!categoria) {
      return {
        ok: false,
        status: 404,
        message: 'No se encontró la categoría indicada en categoria_id.'
      };
    }
  }

  if (pago_id !== undefined && pago_id !== null && pago_id !== '') {
    const pago = await PagosModel.findByPk(pago_id, { transaction });

    if (!pago) {
      return {
        ok: false,
        status: 404,
        message: 'No se encontró el pago indicado en pago_id.'
      };
    }
  }

  if (
    usuario_registro_id !== undefined &&
    usuario_registro_id !== null &&
    usuario_registro_id !== ''
  ) {
    const usuario = await UsuariosModel.findByPk(usuario_registro_id, {
      transaction
    });

    if (!usuario) {
      return {
        ok: false,
        status: 404,
        message: 'No se encontró el usuario indicado en usuario_registro_id.'
      };
    }
  }

  return {
    ok: true
  };
};

// Benjamin Orellana - 2026/05/30 - Arma filtros reutilizables para reportes financieros.
const armarWhereReporte = (query) => {
  const {
    sede_id,
    categoria_id,
    tipo,
    origen,
    estado = 'vigente',
    fecha_desde,
    fecha_hasta
  } = query;

  const where = {};

  if (sede_id !== undefined && sede_id !== '') {
    if (!esIdValido(sede_id)) {
      return {
        ok: false,
        status: 400,
        message: 'El filtro sede_id debe ser un ID válido.'
      };
    }

    where.sede_id = Number(sede_id);
  }

  if (categoria_id !== undefined && categoria_id !== '') {
    if (!esIdValido(categoria_id)) {
      return {
        ok: false,
        status: 400,
        message: 'El filtro categoria_id debe ser un ID válido.'
      };
    }

    where.categoria_id = Number(categoria_id);
  }

  if (tipo !== undefined) {
    if (!TIPOS_MOVIMIENTO_VALIDOS.includes(tipo)) {
      return {
        ok: false,
        status: 400,
        message: `El filtro tipo debe ser uno de los siguientes valores: ${TIPOS_MOVIMIENTO_VALIDOS.join(', ')}.`
      };
    }

    where.tipo = tipo;
  }

  if (origen !== undefined) {
    if (!ORIGENES_MOVIMIENTO_VALIDOS.includes(origen)) {
      return {
        ok: false,
        status: 400,
        message: `El filtro origen debe ser uno de los siguientes valores: ${ORIGENES_MOVIMIENTO_VALIDOS.join(', ')}.`
      };
    }

    where.origen = origen;
  }

  if (estado !== undefined) {
    if (!ESTADOS_MOVIMIENTO_VALIDOS.includes(estado)) {
      return {
        ok: false,
        status: 400,
        message: `El filtro estado debe ser uno de los siguientes valores: ${ESTADOS_MOVIMIENTO_VALIDOS.join(', ')}.`
      };
    }

    where.estado = estado;
  }

  if (fecha_desde || fecha_hasta) {
    where.fecha = {};

    if (fecha_desde) {
      if (!esFechaDateOnlyValida(fecha_desde)) {
        return {
          ok: false,
          status: 400,
          message: 'El filtro fecha_desde debe tener formato YYYY-MM-DD.'
        };
      }

      where.fecha[Op.gte] = fecha_desde;
    }

    if (fecha_hasta) {
      if (!esFechaDateOnlyValida(fecha_hasta)) {
        return {
          ok: false,
          status: 400,
          message: 'El filtro fecha_hasta debe tener formato YYYY-MM-DD.'
        };
      }

      where.fecha[Op.lte] = fecha_hasta;
    }
  }

  return {
    ok: true,
    where
  };
};

// Benjamin Orellana - 2026/05/30 - Lista movimientos financieros con filtros y relaciones.
export const OBR_FinanzasMovimientos_CTS = async (req, res) => {
  try {
    const { page, limit, offset } = obtenerPaginacion(req.query);

    const {
      q,
      sede_id,
      categoria_id,
      pago_id,
      tipo,
      origen,
      estado,
      usuario_registro_id,
      fecha_desde,
      fecha_hasta,
      order_by = 'id',
      order_direction = 'DESC'
    } = req.query;

    const where = {};

    if (q && String(q).trim() !== '') {
      where[Op.or] = [
        { descripcion: { [Op.like]: `%${String(q).trim()}%` } },
        { referencia: { [Op.like]: `%${String(q).trim()}%` } },
        { comprobante_url: { [Op.like]: `%${String(q).trim()}%` } },
        { observaciones: { [Op.like]: `%${String(q).trim()}%` } }
      ];
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

    if (categoria_id !== undefined) {
      if (categoria_id === 'null' || categoria_id === '') {
        where.categoria_id = null;
      } else {
        if (!esIdValido(categoria_id)) {
          return responderError(
            res,
            400,
            'El filtro categoria_id debe ser un ID válido o null.'
          );
        }

        where.categoria_id = Number(categoria_id);
      }
    }

    if (pago_id !== undefined) {
      if (pago_id === 'null' || pago_id === '') {
        where.pago_id = null;
      } else {
        if (!esIdValido(pago_id)) {
          return responderError(
            res,
            400,
            'El filtro pago_id debe ser un ID válido o null.'
          );
        }

        where.pago_id = Number(pago_id);
      }
    }

    if (tipo !== undefined) {
      if (!TIPOS_MOVIMIENTO_VALIDOS.includes(tipo)) {
        return responderError(
          res,
          400,
          `El filtro tipo debe ser uno de los siguientes valores: ${TIPOS_MOVIMIENTO_VALIDOS.join(', ')}.`
        );
      }

      where.tipo = tipo;
    }

    if (origen !== undefined) {
      if (!ORIGENES_MOVIMIENTO_VALIDOS.includes(origen)) {
        return responderError(
          res,
          400,
          `El filtro origen debe ser uno de los siguientes valores: ${ORIGENES_MOVIMIENTO_VALIDOS.join(', ')}.`
        );
      }

      where.origen = origen;
    }

    if (estado !== undefined) {
      if (!ESTADOS_MOVIMIENTO_VALIDOS.includes(estado)) {
        return responderError(
          res,
          400,
          `El filtro estado debe ser uno de los siguientes valores: ${ESTADOS_MOVIMIENTO_VALIDOS.join(', ')}.`
        );
      }

      where.estado = estado;
    }

    if (usuario_registro_id !== undefined) {
      if (usuario_registro_id === 'null' || usuario_registro_id === '') {
        where.usuario_registro_id = null;
      } else {
        if (!esIdValido(usuario_registro_id)) {
          return responderError(
            res,
            400,
            'El filtro usuario_registro_id debe ser un ID válido o null.'
          );
        }

        where.usuario_registro_id = Number(usuario_registro_id);
      }
    }

    if (fecha_desde || fecha_hasta) {
      where.fecha = {};

      if (fecha_desde) {
        if (!esFechaDateOnlyValida(fecha_desde)) {
          return responderError(
            res,
            400,
            'El filtro fecha_desde debe tener formato YYYY-MM-DD.'
          );
        }

        where.fecha[Op.gte] = fecha_desde;
      }

      if (fecha_hasta) {
        if (!esFechaDateOnlyValida(fecha_hasta)) {
          return responderError(
            res,
            400,
            'El filtro fecha_hasta debe tener formato YYYY-MM-DD.'
          );
        }

        where.fecha[Op.lte] = fecha_hasta;
      }
    }

    const campoOrden = CAMPOS_ORDEN_VALIDOS.includes(order_by)
      ? order_by
      : 'id';
    const direccionOrden =
      String(order_direction).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows } = await FinanzasMovimientosModel.findAndCountAll({
      where,
      include: includeFinanzaMovimiento,
      limit,
      offset,
      order: [[campoOrden, direccionOrden]]
    });

    return res.status(200).json({
      ok: true,
      message: 'Movimientos financieros obtenidos correctamente.',
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit),
      data: rows
    });
  } catch (error) {
    console.error('Error en OBR_FinanzasMovimientos_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener los movimientos financieros.'
    );
  }
};

// Benjamin Orellana - 2026/05/30 - Obtiene un movimiento financiero por ID con relaciones.
export const OBR_FinanzaMovimientoPorId_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const movimiento = await FinanzasMovimientosModel.findByPk(id, {
      include: includeFinanzaMovimiento
    });

    if (!movimiento) {
      return responderError(
        res,
        404,
        'No se encontró el movimiento financiero solicitado.'
      );
    }

    return res.status(200).json({
      ok: true,
      message: 'Movimiento financiero obtenido correctamente.',
      data: movimiento
    });
  } catch (error) {
    console.error('Error en OBR_FinanzaMovimientoPorId_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener el movimiento financiero.'
    );
  }
};

// Benjamin Orellana - 2026/05/30 - Lista movimientos financieros asociados a un pago.
export const OBR_FinanzasMovimientosPorPago_CTS = async (req, res) => {
  try {
    const { pago_id } = req.params;
    const { page, limit, offset } = obtenerPaginacion(req.query);

    if (!esIdValido(pago_id)) {
      return responderError(
        res,
        400,
        'El parámetro pago_id debe ser un ID válido.'
      );
    }

    const { count, rows } = await FinanzasMovimientosModel.findAndCountAll({
      where: {
        pago_id: Number(pago_id)
      },
      include: includeFinanzaMovimiento,
      limit,
      offset,
      order: [
        ['fecha', 'DESC'],
        ['id', 'DESC']
      ]
    });

    return res.status(200).json({
      ok: true,
      message: 'Movimientos financieros del pago obtenidos correctamente.',
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit),
      data: rows
    });
  } catch (error) {
    console.error('Error en OBR_FinanzasMovimientosPorPago_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener movimientos financieros del pago.'
    );
  }
};

// Benjamin Orellana - 2026/05/30 - Obtiene resumen financiero por filtros.
export const OBR_ResumenFinanciero_CTS = async (req, res) => {
  try {
    const armadoWhere = armarWhereReporte(req.query);

    if (!armadoWhere.ok) {
      return responderError(res, armadoWhere.status, armadoWhere.message);
    }

    const whereBase = armadoWhere.where;

    const totalIngresos = await FinanzasMovimientosModel.sum('monto', {
      where: {
        ...whereBase,
        tipo: 'ingreso'
      }
    });

    const totalEgresos = await FinanzasMovimientosModel.sum('monto', {
      where: {
        ...whereBase,
        tipo: 'egreso'
      }
    });

    const cantidadMovimientos = await FinanzasMovimientosModel.count({
      where: whereBase
    });

    const ingresos = Number(totalIngresos || 0);
    const egresos = Number(totalEgresos || 0);

    return res.status(200).json({
      ok: true,
      message: 'Resumen financiero obtenido correctamente.',
      data: {
        total_ingresos: ingresos.toFixed(2),
        total_egresos: egresos.toFixed(2),
        saldo: (ingresos - egresos).toFixed(2),
        cantidad_movimientos: cantidadMovimientos
      }
    });
  } catch (error) {
    console.error('Error en OBR_ResumenFinanciero_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener el resumen financiero.'
    );
  }
};

// Benjamin Orellana - 2026/05/30 - Obtiene reporte de cobros por sede.
export const OBR_ReporteCobrosPorSede_CTS = async (req, res) => {
  try {
    const armadoWhere = armarWhereReporte({
      ...req.query,
      tipo: 'ingreso',
      origen: req.query.origen || 'pago_alumno',
      estado: req.query.estado || 'vigente'
    });

    if (!armadoWhere.ok) {
      return responderError(res, armadoWhere.status, armadoWhere.message);
    }

    const movimientosPorSede = await FinanzasMovimientosModel.findAll({
      attributes: [
        'sede_id',
        [fn('COUNT', col('finanzas_movimientos.id')), 'cantidad_movimientos'],
        [fn('SUM', col('monto')), 'total_cobrado']
      ],
      where: armadoWhere.where,
      include: [
        {
          model: SedesModel,
          as: 'sede',
          required: false
        }
      ],
      group: ['sede_id', 'sede.id'],
      order: [[literal('total_cobrado'), 'DESC']]
    });

    const data = movimientosPorSede.map((item) => ({
      sede_id: item.get('sede_id'),
      sede: item.get('sede'),
      cantidad_movimientos: Number(item.get('cantidad_movimientos') || 0),
      total_cobrado: Number(item.get('total_cobrado') || 0).toFixed(2)
    }));

    const totalGeneral = data.reduce((acc, item) => {
      return acc + Number(item.total_cobrado || 0);
    }, 0);

    return res.status(200).json({
      ok: true,
      message: 'Reporte de cobros por sede obtenido correctamente.',
      data: {
        total_general: totalGeneral.toFixed(2),
        sedes: data
      }
    });
  } catch (error) {
    console.error('Error en OBR_ReporteCobrosPorSede_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener el reporte de cobros por sede.'
    );
  }
};

// Benjamin Orellana - 2026/05/30 - Crea un movimiento financiero.
export const CR_FinanzasMovimientos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const errores = validarPayloadMovimiento(req.body, true);

    if (errores.length > 0) {
      await transaction.rollback();
      return responderError(res, 400, 'Hay errores de validación.', errores);
    }

    const validacionReferencias = await validarReferenciasMovimiento(
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
      sede_id,
      categoria_id,
      pago_id,
      tipo,
      fecha,
      descripcion,
      monto,
      origen,
      comprobante_url,
      referencia,
      usuario_registro_id,
      estado,
      observaciones
    } = req.body;

    const nuevoMovimiento = await FinanzasMovimientosModel.create(
      {
        sede_id:
          sede_id !== undefined && sede_id !== null && sede_id !== ''
            ? Number(sede_id)
            : null,
        categoria_id:
          categoria_id !== undefined &&
          categoria_id !== null &&
          categoria_id !== ''
            ? Number(categoria_id)
            : null,
        pago_id:
          pago_id !== undefined && pago_id !== null && pago_id !== ''
            ? Number(pago_id)
            : null,
        tipo,
        fecha,
        descripcion: String(descripcion).trim(),
        monto: Number(monto).toFixed(2),
        origen: origen || 'manual',
        comprobante_url:
          comprobante_url !== undefined && comprobante_url !== null
            ? String(comprobante_url).trim()
            : null,
        referencia:
          referencia !== undefined && referencia !== null
            ? String(referencia).trim()
            : null,
        usuario_registro_id:
          usuario_registro_id !== undefined &&
          usuario_registro_id !== null &&
          usuario_registro_id !== ''
            ? Number(usuario_registro_id)
            : null,
        estado: estado || 'vigente',
        observaciones:
          observaciones !== undefined && observaciones !== null
            ? String(observaciones).trim()
            : null
      },
      { transaction }
    );

    await transaction.commit();

    const movimientoCompleto = await FinanzasMovimientosModel.findByPk(
      nuevoMovimiento.id,
      {
        include: includeFinanzaMovimiento
      }
    );

    return res.status(201).json({
      ok: true,
      message: 'Movimiento financiero creado correctamente.',
      data: movimientoCompleto
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en CR_FinanzasMovimientos_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al crear el movimiento financiero.'
    );
  }
};

// Benjamin Orellana - 2026/05/30 - Actualiza un movimiento financiero existente.
export const UR_FinanzasMovimientos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const movimiento = await FinanzasMovimientosModel.findByPk(id, {
      transaction
    });

    if (!movimiento) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró el movimiento financiero solicitado.'
      );
    }

    const errores = validarPayloadMovimiento(req.body, false);

    if (errores.length > 0) {
      await transaction.rollback();
      return responderError(res, 400, 'Hay errores de validación.', errores);
    }

    const validacionReferencias = await validarReferenciasMovimiento(
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

    if (req.body.sede_id !== undefined) {
      datosActualizar.sede_id =
        req.body.sede_id !== null && req.body.sede_id !== ''
          ? Number(req.body.sede_id)
          : null;
    }

    if (req.body.categoria_id !== undefined) {
      datosActualizar.categoria_id =
        req.body.categoria_id !== null && req.body.categoria_id !== ''
          ? Number(req.body.categoria_id)
          : null;
    }

    if (req.body.pago_id !== undefined) {
      datosActualizar.pago_id =
        req.body.pago_id !== null && req.body.pago_id !== ''
          ? Number(req.body.pago_id)
          : null;
    }

    if (req.body.tipo !== undefined) {
      datosActualizar.tipo = req.body.tipo;
    }

    if (req.body.fecha !== undefined) {
      datosActualizar.fecha = req.body.fecha;
    }

    if (req.body.descripcion !== undefined) {
      datosActualizar.descripcion = String(req.body.descripcion).trim();
    }

    if (req.body.monto !== undefined) {
      datosActualizar.monto = Number(req.body.monto).toFixed(2);
    }

    if (req.body.origen !== undefined) {
      datosActualizar.origen = req.body.origen;
    }

    if (req.body.comprobante_url !== undefined) {
      datosActualizar.comprobante_url =
        req.body.comprobante_url !== null
          ? String(req.body.comprobante_url).trim()
          : null;
    }

    if (req.body.referencia !== undefined) {
      datosActualizar.referencia =
        req.body.referencia !== null
          ? String(req.body.referencia).trim()
          : null;
    }

    if (req.body.usuario_registro_id !== undefined) {
      datosActualizar.usuario_registro_id =
        req.body.usuario_registro_id !== null &&
        req.body.usuario_registro_id !== ''
          ? Number(req.body.usuario_registro_id)
          : null;
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

    datosActualizar.updated_at = new Date();

    await movimiento.update(datosActualizar, { transaction });

    await transaction.commit();

    const movimientoActualizado = await FinanzasMovimientosModel.findByPk(id, {
      include: includeFinanzaMovimiento
    });

    return res.status(200).json({
      ok: true,
      message: 'Movimiento financiero actualizado correctamente.',
      data: movimientoActualizado
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_FinanzasMovimientos_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al actualizar el movimiento financiero.'
    );
  }
};

// Benjamin Orellana - 2026/05/30 - Actualiza estado de un movimiento financiero.
export const UR_EstadoFinanzaMovimiento_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado || !ESTADOS_MOVIMIENTO_VALIDOS.includes(estado)) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        `El campo estado es obligatorio y debe ser uno de los siguientes valores: ${ESTADOS_MOVIMIENTO_VALIDOS.join(', ')}.`
      );
    }

    const movimiento = await FinanzasMovimientosModel.findByPk(id, {
      transaction
    });

    if (!movimiento) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró el movimiento financiero solicitado.'
      );
    }

    await movimiento.update(
      {
        estado,
        updated_at: new Date()
      },
      { transaction }
    );

    await transaction.commit();

    const movimientoActualizado = await FinanzasMovimientosModel.findByPk(id, {
      include: includeFinanzaMovimiento
    });

    return res.status(200).json({
      ok: true,
      message: 'Estado del movimiento financiero actualizado correctamente.',
      data: movimientoActualizado
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_EstadoFinanzaMovimiento_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al actualizar el estado del movimiento financiero.'
    );
  }
};

// Benjamin Orellana - 2026/05/30 - Anula un movimiento financiero mediante baja lógica.
export const DR_FinanzasMovimientos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;
    const { observaciones } = req.body;

    const movimiento = await FinanzasMovimientosModel.findByPk(id, {
      transaction
    });

    if (!movimiento) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró el movimiento financiero solicitado.'
      );
    }

    await movimiento.update(
      {
        estado: 'anulado',
        observaciones:
          observaciones !== undefined && observaciones !== null
            ? String(observaciones).trim()
            : movimiento.observaciones,
        updated_at: new Date()
      },
      { transaction }
    );

    await transaction.commit();

    const movimientoActualizado = await FinanzasMovimientosModel.findByPk(id, {
      include: includeFinanzaMovimiento
    });

    return res.status(200).json({
      ok: true,
      message: 'Movimiento financiero anulado correctamente.',
      data: movimientoActualizado
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en DR_FinanzasMovimientos_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al anular el movimiento financiero.'
    );
  }
};

// Benjamin Orellana - 2026/05/30 - Elimina físicamente un movimiento financiero.
export const ER_FinanzasMovimientos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const movimiento = await FinanzasMovimientosModel.findByPk(id, {
      transaction
    });

    if (!movimiento) {
      await transaction.rollback();

      return responderError(
        res,
        404,
        'No se encontró el movimiento financiero solicitado.'
      );
    }

    await movimiento.destroy({ transaction });

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Movimiento financiero eliminado físicamente correctamente.',
      data: {
        id: Number(id)
      }
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en ER_FinanzasMovimientos_CTS:', error);

    if (error?.name === 'SequelizeForeignKeyConstraintError') {
      return responderError(
        res,
        409,
        'No se puede eliminar físicamente el movimiento financiero porque tiene registros relacionados.'
      );
    }

    return responderError(
      res,
      500,
      'Error interno al eliminar físicamente el movimiento financiero.'
    );
  }
};
