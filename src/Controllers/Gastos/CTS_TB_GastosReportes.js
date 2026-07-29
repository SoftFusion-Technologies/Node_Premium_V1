/*
 * Benjamin Orellana - 2026/07/07 - Controlador de reportes y métricas de gastos PREMIUM.
 */

import { QueryTypes } from 'sequelize';

import db from '../../DataBase/db.js';

import {
  aplicarScopeSedesGastosSql,
  esFechaDateOnlyValida,
  manejarErrorControlador,
  normalizarFecha,
  normalizarTexto,
  validarRolLecturaGastos
} from './gastos.helpers.js';

const construirFiltrosReporteGastos = (
  query = {},
  user = null,
  alias = 'g'
) => {
  const errores = [];
  const condiciones = [];
  const replacements = {};

  const fechaDesde = normalizarFecha(query.fecha_desde);
  const fechaHasta = normalizarFecha(query.fecha_hasta);

  if (fechaDesde && !esFechaDateOnlyValida(fechaDesde)) {
    errores.push('La fecha desde debe tener formato YYYY-MM-DD.');
  }

  if (fechaHasta && !esFechaDateOnlyValida(fechaHasta)) {
    errores.push('La fecha hasta debe tener formato YYYY-MM-DD.');
  }

  if (fechaDesde && fechaHasta && fechaHasta < fechaDesde) {
    errores.push('La fecha hasta no puede ser anterior a la fecha desde.');
  }

  if (fechaDesde) {
    condiciones.push(`${alias}.fecha_gasto >= :fecha_desde`);
    replacements.fecha_desde = fechaDesde;
  }

  if (fechaHasta) {
    condiciones.push(`${alias}.fecha_gasto <= :fecha_hasta`);
    replacements.fecha_hasta = fechaHasta;
  }

  if (query.estado) {
    condiciones.push(`${alias}.estado = :estado`);
    replacements.estado = query.estado;
  }

  if (query.tipo_gasto_id) {
    condiciones.push(`${alias}.tipo_gasto_id = :tipo_gasto_id`);
    replacements.tipo_gasto_id = Number(query.tipo_gasto_id);
  }

  if (query.proveedor_id) {
    condiciones.push(`${alias}.proveedor_id = :proveedor_id`);
    replacements.proveedor_id = Number(query.proveedor_id);
  }

  if (
    query.incluye_iva !== undefined &&
    query.incluye_iva !== null &&
    query.incluye_iva !== ''
  ) {
    condiciones.push(`${alias}.incluye_iva = :incluye_iva`);
    replacements.incluye_iva = Number(query.incluye_iva) === 1 ? 1 : 0;
  }

  const search = normalizarTexto(query.q);

  if (search) {
    condiciones.push(
      `(${alias}.nombre LIKE :q OR ${alias}.descripcion LIKE :q OR ${alias}.observacion LIKE :q)`
    );
    replacements.q = `%${search}%`;
  }

  const scope = aplicarScopeSedesGastosSql(user, query.sede_id, alias);

  if (!scope.ok) {
    return scope;
  }

  condiciones.push(...scope.condiciones);
  Object.assign(replacements, scope.replacements);

  if (errores.length > 0) {
    return {
      ok: false,
      status: 400,
      message: 'Filtros inválidos para el reporte de gastos.',
      errors: errores
    };
  }

  return {
    ok: true,
    condiciones,
    replacements
  };
};

const buildWhereSql = (condiciones = []) => {
  return condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';
};

export const OBR_GastosResumen_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaGastos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar reportes de gastos.'
      });
    }

    const filtros = construirFiltrosReporteGastos(req.query, req.user, 'g');

    if (!filtros.ok) {
      return res.status(filtros.status).json({
        ok: false,
        message: filtros.message,
        errors: filtros.errors || undefined
      });
    }

    const whereSql = buildWhereSql(filtros.condiciones);

    const [resumen] = await db.query(
      `
        SELECT
          COUNT(g.id) AS cantidad_gastos,
          COALESCE(SUM(CASE WHEN g.estado <> 'anulado' THEN g.importe_total ELSE 0 END), 0) AS total_gastado,
          COALESCE(SUM(CASE WHEN g.estado = 'pagado' THEN g.importe_total ELSE 0 END), 0) AS total_pagado,
          COALESCE(SUM(CASE WHEN g.estado = 'pendiente' THEN g.importe_total ELSE 0 END), 0) AS total_pendiente,
          COALESCE(SUM(CASE WHEN g.estado = 'anulado' THEN g.importe_total ELSE 0 END), 0) AS total_anulado,
          COALESCE(SUM(CASE WHEN g.estado <> 'anulado' THEN g.importe_iva ELSE 0 END), 0) AS total_iva,
          COALESCE(AVG(CASE WHEN g.estado <> 'anulado' THEN g.importe_total ELSE NULL END), 0) AS ticket_promedio_gasto
        FROM gastos_gastos g
        ${whereSql}
      `,
      {
        replacements: filtros.replacements,
        type: QueryTypes.SELECT
      }
    );

    return res.status(200).json({
      ok: true,
      message: 'Resumen de gastos obtenido correctamente.',
      filtros: {
        fecha_desde: req.query.fecha_desde || null,
        fecha_hasta: req.query.fecha_hasta || null,
        sede_id: req.query.sede_id || null
      },
      data: resumen
    });
  } catch (error) {
    return manejarErrorControlador({
      res,
      error,
      nombre: 'OBR_GastosResumen_CTS'
    });
  }
};

export const OBR_GastosPorTipo_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaGastos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar reportes de gastos.'
      });
    }

    const filtros = construirFiltrosReporteGastos(
      {
        ...req.query,
        estado: req.query.estado || undefined
      },
      req.user,
      'g'
    );

    if (!filtros.ok) {
      return res.status(filtros.status).json({
        ok: false,
        message: filtros.message,
        errors: filtros.errors || undefined
      });
    }

    const whereSql = buildWhereSql(filtros.condiciones);

    const rows = await db.query(
      `
        SELECT
          gt.id AS tipo_gasto_id,
          gt.nombre AS tipo_gasto,
          COUNT(g.id) AS cantidad_gastos,
          SUM(CASE WHEN g.estado = 'pagado' THEN 1 ELSE 0 END) AS cantidad_pagados,
          SUM(CASE WHEN g.estado = 'pendiente' THEN 1 ELSE 0 END) AS cantidad_pendientes,
          SUM(CASE WHEN g.estado = 'anulado' THEN 1 ELSE 0 END) AS cantidad_anulados,
          COALESCE(
            SUM(CASE WHEN g.estado <> 'anulado' THEN g.importe_total ELSE 0 END),
            0
          ) AS total_gastado,
          COALESCE(
            SUM(CASE WHEN g.estado = 'pagado' THEN g.importe_total ELSE 0 END),
            0
          ) AS total_pagado,
          COALESCE(
            SUM(CASE WHEN g.estado = 'pendiente' THEN g.importe_total ELSE 0 END),
            0
          ) AS total_pendiente,
          COALESCE(
            SUM(CASE WHEN g.estado = 'anulado' THEN g.importe_total ELSE 0 END),
            0
          ) AS total_anulado,
          ROUND(
            COALESCE(
              SUM(CASE WHEN g.estado <> 'anulado' THEN g.importe_total ELSE 0 END),
              0
            ) * 100 /
            NULLIF((
              SELECT COALESCE(
                SUM(
                  CASE
                    WHEN g2.estado <> 'anulado' THEN g2.importe_total
                    ELSE 0
                  END
                ),
                0
              )
              FROM gastos_gastos g2
              ${buildWhereSql(
                filtros.condiciones.map((condicion) =>
                  condicion.replaceAll('g.', 'g2.')
                )
              )}
            ), 0),
            2
          ) AS porcentaje
        FROM gastos_gastos g
        INNER JOIN gastos_tipos gt
          ON gt.id = g.tipo_gasto_id
        ${whereSql}
        GROUP BY gt.id, gt.nombre
        ORDER BY total_gastado DESC
      `,
      {
        replacements: filtros.replacements,
        type: QueryTypes.SELECT
      }
    );

    return res.status(200).json({
      ok: true,
      message: 'Reporte de gastos por tipo obtenido correctamente.',
      data: rows
    });
  } catch (error) {
    return manejarErrorControlador({
      res,
      error,
      nombre: 'OBR_GastosPorTipo_CTS'
    });
  }
};

export const OBR_GastosPorSede_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaGastos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar reportes de gastos.'
      });
    }

    const filtros = construirFiltrosReporteGastos(req.query, req.user, 'g');

    if (!filtros.ok) {
      return res.status(filtros.status).json({
        ok: false,
        message: filtros.message,
        errors: filtros.errors || undefined
      });
    }

    filtros.condiciones.push("g.estado <> 'anulado'");
    const whereSql = buildWhereSql(filtros.condiciones);

    const rows = await db.query(
      `
        SELECT
          s.id AS sede_id,
          COALESCE(s.nombre, 'Sin sede') AS sede,
          COUNT(g.id) AS cantidad_gastos,
          COALESCE(SUM(g.importe_total), 0) AS total_gastado,
          COALESCE(SUM(g.importe_iva), 0) AS total_iva,
          COALESCE(AVG(g.importe_total), 0) AS ticket_promedio_gasto
        FROM gastos_gastos g
        LEFT JOIN sedes_sedes s
          ON s.id = g.sede_id
        ${whereSql}
        GROUP BY s.id, s.nombre
        ORDER BY total_gastado DESC
      `,
      {
        replacements: filtros.replacements,
        type: QueryTypes.SELECT
      }
    );

    return res.status(200).json({
      ok: true,
      message: 'Reporte de gastos por sede obtenido correctamente.',
      data: rows
    });
  } catch (error) {
    return manejarErrorControlador({
      res,
      error,
      nombre: 'OBR_GastosPorSede_CTS'
    });
  }
};

export const OBR_GastosPorProveedor_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaGastos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar reportes de gastos.'
      });
    }

    const filtros = construirFiltrosReporteGastos(req.query, req.user, 'g');

    if (!filtros.ok) {
      return res.status(filtros.status).json({
        ok: false,
        message: filtros.message,
        errors: filtros.errors || undefined
      });
    }

    filtros.condiciones.push("g.estado <> 'anulado'");
    const whereSql = buildWhereSql(filtros.condiciones);

    const rows = await db.query(
      `
        SELECT
          gp.id AS proveedor_id,
          COALESCE(gp.nombre, 'Sin proveedor') AS proveedor,
          COUNT(g.id) AS cantidad_gastos,
          COALESCE(SUM(g.importe_total), 0) AS total_gastado,
          COALESCE(SUM(g.importe_iva), 0) AS total_iva
        FROM gastos_gastos g
        LEFT JOIN gastos_proveedores gp
          ON gp.id = g.proveedor_id
        ${whereSql}
        GROUP BY gp.id, gp.nombre
        ORDER BY total_gastado DESC
      `,
      {
        replacements: filtros.replacements,
        type: QueryTypes.SELECT
      }
    );

    return res.status(200).json({
      ok: true,
      message: 'Reporte de gastos por proveedor obtenido correctamente.',
      data: rows
    });
  } catch (error) {
    return manejarErrorControlador({
      res,
      error,
      nombre: 'OBR_GastosPorProveedor_CTS'
    });
  }
};