import { QueryTypes } from 'sequelize';

import db from '../DataBase/db.js';
import { usuarioTieneAccesoTodasSedes } from '../utils/usuariosAcceso.utils.js';

const FUENTES = {
  alumno: {
    sql: 'SELECT sede_id FROM alumnos_alumnos WHERE id = :id LIMIT 1'
  },
  membresia: {
    sql: 'SELECT sede_id FROM alumnos_membresias WHERE id = :id LIMIT 1'
  },
  mensualidad: {
    sql: 'SELECT sede_id FROM pagos_mensualidades WHERE id = :id LIMIT 1'
  },
  pago: {
    sql: 'SELECT sede_id FROM pagos_pagos WHERE id = :id LIMIT 1'
  },
  metodo_recurrente: {
    sql: `SELECT a.sede_id
      FROM pagos_metodos_recurrentes pmr
      INNER JOIN alumnos_alumnos a ON a.id = pmr.alumno_id
      WHERE pmr.id = :id LIMIT 1`
  },
  cobro: {
    sql: 'SELECT sede_id FROM cobros_cobros WHERE id = :id LIMIT 1'
  }
};

const numeroId = (valor) => {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
};

const leerValor = (req, source) => {
  const ubicacion = source.location || 'params';
  const key = source.key || 'id';
  return req?.[ubicacion]?.[key];
};

const resolverSede = async (req, source) => {
  const valor = leerValor(req, source);

  if (source.entity === 'sede') {
    const sedeId = numeroId(valor);
    return sedeId ? { sedeId, encontrado: true } : null;
  }

  const id = numeroId(valor);
  if (!id) return null;

  const config = FUENTES[source.entity];
  if (!config) {
    throw new Error(`Fuente financiera no soportada: ${source.entity}`);
  }

  const rows = await db.query(config.sql, {
    replacements: { id },
    type: QueryTypes.SELECT
  });

  if (!rows.length) {
    return { sedeId: null, encontrado: false, entity: source.entity, id };
  }

  return {
    sedeId: numeroId(rows[0].sede_id),
    encontrado: true,
    entity: source.entity,
    id
  };
};

const asignacionSede = (user, sedeId) => {
  return Array.isArray(user?.sedes)
    ? user.sedes.find((sede) => Number(sede.id) === Number(sedeId))
    : null;
};

const responder = (res, status, code, message, extra = {}) => {
  return res.status(status).json({ ok: false, code, message, ...extra });
};

/*
 * Resuelve la sede desde la entidad real y no desde un ID de sede enviado por
 * el navegador. Si se informan varias fuentes (por ejemplo alumno +
 * mensualidad + sede), todas deben pertenecer a la misma sede.
 */
export const requireFinancialScope = ({
  sources = [],
  permission,
  requireFinanzas = true
} = {}) => {
  const fuentes = Array.isArray(sources) ? sources : [sources];

  return async (req, res, next) => {
    try {
      if (!req.user) {
        return responder(
          res,
          401,
          'USER_NOT_AUTHENTICATED',
          'Usuario no autenticado.'
        );
      }

      const resultados = [];
      for (const source of fuentes) {
        if (!source?.entity) continue;
        const resultado = await resolverSede(req, source);
        if (resultado) resultados.push(resultado);
      }

      if (!resultados.length) {
        return responder(
          res,
          400,
          'FINANCIAL_SCOPE_REQUIRED',
          'Debe indicar una sede o una entidad financiera válida.'
        );
      }

      const inexistente = resultados.find((item) => !item.encontrado);
      if (inexistente) {
        return responder(
          res,
          404,
          'FINANCIAL_ENTITY_NOT_FOUND',
          'No se encontró la entidad financiera solicitada.'
        );
      }

      const sedeIds = [...new Set(resultados.map((item) => item.sedeId))];
      if (sedeIds.some((item) => !item)) {
        return responder(
          res,
          409,
          'FINANCIAL_ENTITY_WITHOUT_SEDE',
          'La entidad financiera no tiene una sede válida asociada.'
        );
      }

      if (sedeIds.length !== 1) {
        return responder(
          res,
          409,
          'FINANCIAL_SCOPE_MISMATCH',
          'Las entidades indicadas pertenecen a sedes diferentes.'
        );
      }

      const sedeId = sedeIds[0];
      req.financial_sede_id = sedeId;

      if (usuarioTieneAccesoTodasSedes(req.user)) return next();

      const sede = asignacionSede(req.user, sedeId);
      const asignacion = sede?.asignacion;

      if (
        !sede ||
        !asignacion?.activo ||
        !asignacion?.puede_operar ||
        (requireFinanzas && !asignacion?.puede_ver_finanzas)
      ) {
        return responder(
          res,
          403,
          'FINANCIAL_SEDE_DENIED',
          'No tiene acceso financiero a la sede de este registro.'
        );
      }

      const permisosRequeridos = (Array.isArray(permission)
        ? permission
        : [permission]
      ).filter(Boolean);
      const tienePermisoLocal = permisosRequeridos.some((codigo) =>
        asignacion.permisos?.includes(codigo)
      );

      if (permisosRequeridos.length && !tienePermisoLocal) {
        return responder(
          res,
          403,
          'FINANCIAL_PERMISSION_DENIED',
          'No tiene permiso para realizar esta operación en la sede del registro.',
          { permisos_requeridos: permisosRequeridos }
        );
      }

      return next();
    } catch (error) {
      console.error('Error requireFinancialScope PREMIUM:', error);
      return responder(
        res,
        500,
        'FINANCIAL_SCOPE_ERROR',
        'Error al validar el alcance financiero.'
      );
    }
  };
};

export const sourceParam = (entity, key = 'id') => ({
  entity,
  location: 'params',
  key
});

export const sourceQuery = (entity, key = 'sede_id') => ({
  entity,
  location: 'query',
  key
});

export const sourceBody = (entity, key = 'sede_id') => ({
  entity,
  location: 'body',
  key
});
