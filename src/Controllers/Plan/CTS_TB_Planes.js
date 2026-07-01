/*
 * Benjamin Orellana - 2026/05/29 - Controlador Sequelize para gestión de planes PREMIUM.
 */

import { Op, QueryTypes } from 'sequelize';
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

// Benjamin Orellana - 2026/07/01 - Lista alumnos asignados a un plan con vencimiento, cupos, deuda y resumen operativo.
export const OBR_AlumnosAsignadosPlan_CTS = async (req, res) => {
  try {
    const { plan_id } = req.params;
    const {
      page = '1',
      limit = '20',
      q,
      sede_id,
      estado,
      estado_mensualidad,
      vigencia = 'todas',
      order_by = 'fecha_vencimiento',
      order_direction = 'ASC'
    } = req.query;

    const planId = toNumberOrNull(plan_id);

    if (!planId) {
      return responderError(
        res,
        400,
        'El parámetro plan_id debe ser un número válido.'
      );
    }

    const plan = await PlanesModel.findByPk(planId, {
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
    });

    if (!plan) {
      return responderError(res, 404, 'No se encontró el plan solicitado.');
    }

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const offsetNumber = (pageNumber - 1) * limitNumber;

    const estadosMembresiaValidos = [
      'pendiente_pago',
      'activa',
      'vencida',
      'cancelada',
      'congelada'
    ];
    const estadosMensualidadValidos = [
      'pendiente',
      'parcial',
      'pagada',
      'vencida',
      'anulada'
    ];
    const vigenciasValidas = ['todas', 'actuales', 'futuras', 'vencidas'];

    if (estado && !estadosMembresiaValidos.includes(String(estado))) {
      return responderError(
        res,
        400,
        `El filtro estado debe ser uno de los siguientes valores: ${estadosMembresiaValidos.join(', ')}.`
      );
    }

    if (
      estado_mensualidad &&
      !estadosMensualidadValidos.includes(String(estado_mensualidad))
    ) {
      return responderError(
        res,
        400,
        `El filtro estado_mensualidad debe ser uno de los siguientes valores: ${estadosMensualidadValidos.join(', ')}.`
      );
    }

    if (!vigenciasValidas.includes(String(vigencia))) {
      return responderError(
        res,
        400,
        `El filtro vigencia debe ser uno de los siguientes valores: ${vigenciasValidas.join(', ')}.`
      );
    }

    const sedeId = toNumberOrNull(sede_id);

    if (sede_id !== undefined && sede_id !== '' && !sedeId) {
      return responderError(
        res,
        400,
        'El parámetro sede_id debe ser un número válido.'
      );
    }

    const replacements = {
      planId,
      limit: limitNumber,
      offset: offsetNumber
    };
    const filtros = ['m.plan_id = :planId'];

    if (sedeId) {
      filtros.push('m.sede_id = :sedeId');
      replacements.sedeId = sedeId;
    }

    if (estado) {
      filtros.push('m.estado = :estado');
      replacements.estado = String(estado);
    }

    if (estado_mensualidad) {
      filtros.push('pm.estado = :estadoMensualidad');
      replacements.estadoMensualidad = String(estado_mensualidad);
    }

    if (q && String(q).trim() !== '') {
      filtros.push(`(
        a.nombre LIKE :q
        OR a.apellido LIKE :q
        OR CONCAT(a.nombre, ' ', a.apellido) LIKE :q
        OR a.dni LIKE :q
        OR a.telefono LIKE :q
        OR a.email LIKE :q
      )`);
      replacements.q = `%${String(q).trim()}%`;
    }

    if (vigencia === 'actuales') {
      filtros.push('CURDATE() BETWEEN m.fecha_inicio AND m.fecha_vencimiento');
    }

    if (vigencia === 'futuras') {
      filtros.push('m.fecha_inicio > CURDATE()');
    }

    if (vigencia === 'vencidas') {
      filtros.push('m.fecha_vencimiento < CURDATE()');
    }

    const whereSql = filtros.join('\n      AND ');

    const camposOrdenValidos = {
      alumno: 'alumno',
      sede: 'sede_nombre',
      estado: 'm.estado',
      fecha_inicio: 'm.fecha_inicio',
      fecha_vencimiento: 'm.fecha_vencimiento',
      dias_para_vencer: 'dias_para_vencer',
      clases_disponibles: 'm.clases_disponibles',
      saldo: 'saldo_mensualidad',
      created_at: 'm.created_at'
    };
    const campoOrden = camposOrdenValidos[order_by] || 'm.fecha_vencimiento';
    const direccionOrden =
      String(order_direction).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // Benjamin Orellana - 2026/07/01 - Obtiene la última mensualidad asociada a cada membresía para mostrar deuda y estado de cobro.
    const joinUltimaMensualidad = `
      LEFT JOIN pagos_mensualidades pm
        ON pm.id = (
          SELECT pm2.id
          FROM pagos_mensualidades pm2
          WHERE pm2.membresia_id = m.id
            AND pm2.alumno_id = m.alumno_id
          ORDER BY pm2.periodo_desde DESC, pm2.id DESC
          LIMIT 1
        )
    `;

    const countRows = await db.query(
      `
        SELECT COUNT(*) AS total
        FROM alumnos_membresias m
        INNER JOIN alumnos_alumnos a
          ON a.id = m.alumno_id
        LEFT JOIN sedes_sedes s
          ON s.id = m.sede_id
        ${joinUltimaMensualidad}
        WHERE ${whereSql}
      `,
      {
        replacements,
        type: QueryTypes.SELECT
      }
    );

    const resumenRows = await db.query(
      `
        SELECT
          COUNT(*) AS total_asignados,
          SUM(CASE WHEN m.estado = 'activa' THEN 1 ELSE 0 END) AS activos,
          SUM(CASE WHEN m.estado = 'pendiente_pago' THEN 1 ELSE 0 END) AS pendientes_pago,
          SUM(CASE WHEN m.estado = 'vencida' THEN 1 ELSE 0 END) AS vencidos,
          SUM(CASE WHEN m.estado = 'congelada' THEN 1 ELSE 0 END) AS congelados,
          SUM(CASE WHEN m.estado = 'cancelada' THEN 1 ELSE 0 END) AS cancelados,
          SUM(CASE WHEN m.fecha_inicio > CURDATE() THEN 1 ELSE 0 END) AS futuras,
          SUM(CASE WHEN CURDATE() BETWEEN m.fecha_inicio AND m.fecha_vencimiento THEN 1 ELSE 0 END) AS vigentes_fecha,
          SUM(CASE WHEN m.fecha_vencimiento < CURDATE() THEN 1 ELSE 0 END) AS vencidas_fecha,
          SUM(CASE WHEN DATEDIFF(m.fecha_vencimiento, CURDATE()) BETWEEN 0 AND 7 THEN 1 ELSE 0 END) AS vencen_7_dias,
          COALESCE(SUM(m.clases_incluidas), 0) AS clases_totales,
          COALESCE(SUM(m.clases_usadas), 0) AS clases_usadas,
          COALESCE(SUM(m.clases_disponibles), 0) AS clases_disponibles,
          COALESCE(SUM(m.precio_final), 0) AS importe_total_membresias,
          COALESCE(SUM(pm.saldo), 0) AS deuda_total,
          COALESCE(SUM(CASE WHEN pm.estado = 'pagada' THEN pm.monto_pagado ELSE 0 END), 0) AS total_pagado,
          SUM(CASE WHEN pm.estado = 'pendiente' THEN 1 ELSE 0 END) AS mensualidades_pendientes,
          SUM(CASE WHEN pm.estado = 'pagada' THEN 1 ELSE 0 END) AS mensualidades_pagadas
        FROM alumnos_membresias m
        INNER JOIN alumnos_alumnos a
          ON a.id = m.alumno_id
        LEFT JOIN sedes_sedes s
          ON s.id = m.sede_id
        ${joinUltimaMensualidad}
        WHERE ${whereSql}
      `,
      {
        replacements,
        type: QueryTypes.SELECT
      }
    );

    const dataRows = await db.query(
      `
        SELECT
          m.id AS membresia_id,
          m.alumno_id,
          CONCAT(a.nombre, ' ', a.apellido) AS alumno,
          a.nombre AS alumno_nombre,
          a.apellido AS alumno_apellido,
          a.dni,
          a.telefono,
          a.email,
          a.estado AS estado_alumno,
          a.ultima_asistencia,
          m.sede_id,
          s.nombre AS sede_nombre,
          s.codigo AS sede_codigo,
          m.estado AS estado_membresia,
          m.fecha_inicio,
          m.fecha_vencimiento,
          DATEDIFF(m.fecha_vencimiento, CURDATE()) AS dias_para_vencer,
          CASE
            WHEN m.fecha_inicio > CURDATE() THEN 'futura'
            WHEN CURDATE() BETWEEN m.fecha_inicio AND m.fecha_vencimiento THEN 'vigente'
            WHEN m.fecha_vencimiento < CURDATE() THEN 'vencida'
            ELSE 'sin_estado_fecha'
          END AS estado_vigencia,
          m.precio_lista,
          m.descuento_valor,
          m.descuento_porcentaje,
          m.precio_final,
          m.clases_incluidas,
          m.clases_usadas,
          m.clases_disponibles,
          m.origen_alta,
          m.created_at AS membresia_created_at,
          m.updated_at AS membresia_updated_at,
          pm.id AS mensualidad_id,
          pm.periodo_anio,
          pm.periodo_mes,
          pm.periodo_desde,
          pm.periodo_hasta,
          pm.fecha_vencimiento AS mensualidad_vencimiento,
          pm.estado AS estado_mensualidad,
          COALESCE(pm.monto_total, 0) AS monto_total_mensualidad,
          COALESCE(pm.monto_pagado, 0) AS monto_pagado_mensualidad,
          COALESCE(pm.saldo, 0) AS saldo_mensualidad
        FROM alumnos_membresias m
        INNER JOIN alumnos_alumnos a
          ON a.id = m.alumno_id
        LEFT JOIN sedes_sedes s
          ON s.id = m.sede_id
        ${joinUltimaMensualidad}
        WHERE ${whereSql}
        ORDER BY ${campoOrden} ${direccionOrden}, m.id DESC
        LIMIT :limit OFFSET :offset
      `,
      {
        replacements,
        type: QueryTypes.SELECT
      }
    );

    const total = Number(countRows?.[0]?.total || 0);
    const resumenBase = resumenRows?.[0] || {};
    const resumen = {
      total_asignados: Number(resumenBase.total_asignados || 0),
      activos: Number(resumenBase.activos || 0),
      pendientes_pago: Number(resumenBase.pendientes_pago || 0),
      vencidos: Number(resumenBase.vencidos || 0),
      congelados: Number(resumenBase.congelados || 0),
      cancelados: Number(resumenBase.cancelados || 0),
      futuras: Number(resumenBase.futuras || 0),
      vigentes_fecha: Number(resumenBase.vigentes_fecha || 0),
      vencidas_fecha: Number(resumenBase.vencidas_fecha || 0),
      vencen_7_dias: Number(resumenBase.vencen_7_dias || 0),
      clases_totales: Number(resumenBase.clases_totales || 0),
      clases_usadas: Number(resumenBase.clases_usadas || 0),
      clases_disponibles: Number(resumenBase.clases_disponibles || 0),
      importe_total_membresias: Number(
        resumenBase.importe_total_membresias || 0
      ),
      deuda_total: Number(resumenBase.deuda_total || 0),
      total_pagado: Number(resumenBase.total_pagado || 0),
      mensualidades_pendientes: Number(
        resumenBase.mensualidades_pendientes || 0
      ),
      mensualidades_pagadas: Number(resumenBase.mensualidades_pagadas || 0)
    };

    const data = dataRows.map((row) => ({
      membresia_id: Number(row.membresia_id),
      alumno_id: Number(row.alumno_id),
      alumno: row.alumno,
      alumno_nombre: row.alumno_nombre,
      alumno_apellido: row.alumno_apellido,
      dni: row.dni,
      telefono: row.telefono,
      email: row.email,
      estado_alumno: row.estado_alumno,
      ultima_asistencia: row.ultima_asistencia,
      sede: {
        id: row.sede_id ? Number(row.sede_id) : null,
        nombre: row.sede_nombre,
        codigo: row.sede_codigo
      },
      estado_membresia: row.estado_membresia,
      fecha_inicio: row.fecha_inicio,
      fecha_vencimiento: row.fecha_vencimiento,
      dias_para_vencer:
        row.dias_para_vencer !== null && row.dias_para_vencer !== undefined
          ? Number(row.dias_para_vencer)
          : null,
      estado_vigencia: row.estado_vigencia,
      precio_lista: Number(row.precio_lista || 0),
      descuento_valor: Number(row.descuento_valor || 0),
      descuento_porcentaje: Number(row.descuento_porcentaje || 0),
      precio_final: Number(row.precio_final || 0),
      clases_incluidas: Number(row.clases_incluidas || 0),
      clases_usadas: Number(row.clases_usadas || 0),
      clases_disponibles: Number(row.clases_disponibles || 0),
      origen_alta: row.origen_alta,
      mensualidad: row.mensualidad_id
        ? {
            id: Number(row.mensualidad_id),
            periodo_anio: Number(row.periodo_anio),
            periodo_mes:
              row.periodo_mes !== null && row.periodo_mes !== undefined
                ? Number(row.periodo_mes)
                : null,
            periodo_desde: row.periodo_desde,
            periodo_hasta: row.periodo_hasta,
            fecha_vencimiento: row.mensualidad_vencimiento,
            estado: row.estado_mensualidad,
            monto_total: Number(row.monto_total_mensualidad || 0),
            monto_pagado: Number(row.monto_pagado_mensualidad || 0),
            saldo: Number(row.saldo_mensualidad || 0)
          }
        : null,
      created_at: row.membresia_created_at,
      updated_at: row.membresia_updated_at
    }));

    return res.status(200).json({
      ok: true,
      message: 'Alumnos asignados al plan obtenidos correctamente.',
      plan,
      resumen,
      total,
      page: pageNumber,
      limit: limitNumber,
      total_pages: Math.ceil(total / limitNumber),
      filtros: {
        q: q || null,
        sede_id: sedeId || null,
        estado: estado || null,
        estado_mensualidad: estado_mensualidad || null,
        vigencia
      },
      data
    });
  } catch (error) {
    console.error('Error en OBR_AlumnosAsignadosPlan_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener los alumnos asignados al plan.'
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
    const { sede_id, fecha_consulta = obtenerFechaActualDateOnly() } =
      req.query;

    // CASO 1: Sin sede_id - devuelve TODOS los planes activos
    if (!sede_id) {
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
              [Op.lte]: fecha_consulta // fecha_desde <= fecha_consulta
            },
            [Op.or]: [
              { fecha_hasta: null }, // Sin fecha fin (vigente indefinidamente)
              { fecha_hasta: { [Op.gte]: fecha_consulta } } // O fecha_hasta >= fecha_consulta
            ]
          },
          attributes: [
            'id',
            'precio',
            'moneda',
            'fecha_desde',
            'fecha_hasta',
            'activo'
          ],
          required: true // INNER JOIN - solo planes con precio vigente
        }
      ],
      order: [['id', 'ASC']]
    });

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
