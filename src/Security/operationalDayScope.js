/*
 * Benjamin Orellana - 2026/07/29 - Alcance operativo diario para PREMIUM.
 * Profesor y Coordinador pueden operar Caja, Cobros y Gastos de su sede,
 * pero no consultar ni modificar información financiera de días anteriores.
 */

import { QueryTypes } from 'sequelize';

import db from '../DataBase/db.js';
import { usuarioTieneAccesoTodasSedes } from '../utils/usuariosAcceso.utils.js';

export const ROLES_OPERACION_DIARIA = ['PROFESOR', 'COORD_SEDE'];

const ZONA_HORARIA_ARGENTINA = 'America/Argentina/Buenos_Aires';

const normalizarRol = (valor) =>
  String(valor || '')
    .trim()
    .toUpperCase()
    .replaceAll(' ', '_');

// Benjamin Orellana - 2026/07/29 - Construye YYYY-MM-DD con formatToParts.
// No depende del formato devuelto por el locale, que en Node 18 puede producir
// MM/DD/YYYY incluso usando en-CA.
const formatearFechaIsoEnZona = (fecha) => {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_HORARIA_ARGENTINA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(fecha);

  const valores = partes.reduce((resultado, parte) => {
    if (parte.type === 'year' || parte.type === 'month' || parte.type === 'day') {
      resultado[parte.type] = parte.value;
    }

    return resultado;
  }, {});

  if (!valores.year || !valores.month || !valores.day) return null;

  return `${valores.year}-${valores.month}-${valores.day}`;
};

export const fechaArgentina = () => formatearFechaIsoEnZona(new Date());

export const fechaArgentinaDesdeDate = (valor) => {
  if (!valor) return null;

  if (typeof valor === 'string') {
    const fechaDateOnly = valor.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(fechaDateOnly)) {
      return fechaDateOnly;
    }
  }

  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return null;

  return formatearFechaIsoEnZona(fecha);
};

export const obtenerAsignacionSedeUsuario = (user, sedeId) => {
  const id = Number(sedeId);
  if (!id || !Array.isArray(user?.sedes)) return null;

  return (
    user.sedes.find((sede) => Number(sede?.id ?? sede?.sede_id) === id) || null
  );
};

export const obtenerRolEfectivoSede = (user, sedeId) => {
  if (usuarioTieneAccesoTodasSedes(user)) {
    return normalizarRol(user?.rol_codigo);
  }

  const sede = obtenerAsignacionSedeUsuario(user, sedeId);

  return normalizarRol(
    sede?.asignacion?.rol_codigo || sede?.rol_codigo || user?.rol_codigo
  );
};

export const usuarioEsOperadorDiario = (user) => {
  if (!user || usuarioTieneAccesoTodasSedes(user)) return false;

  if (ROLES_OPERACION_DIARIA.includes(normalizarRol(user?.rol_codigo))) {
    return true;
  }

  return (
    Array.isArray(user?.sedes) &&
    user.sedes.some((sede) =>
      ROLES_OPERACION_DIARIA.includes(
        normalizarRol(
          sede?.asignacion?.rol_codigo || sede?.rol_codigo || user?.rol_codigo
        )
      )
    )
  );
};

export const usuarioTieneAlcanceOperativoDiario = (user, sedeId) => {
  if (!usuarioEsOperadorDiario(user)) return false;

  if (!Number(sedeId)) return true;

  return ROLES_OPERACION_DIARIA.includes(obtenerRolEfectivoSede(user, sedeId));
};

export const validarFechaConsultaOperativa = ({
  user,
  sedeId,
  fecha,
  nombreCampo = 'fecha'
}) => {
  const hoy = fechaArgentina();

  if (!usuarioTieneAlcanceOperativoDiario(user, sedeId)) {
    return { ok: true, fecha: fecha || hoy, restringida: false, hoy };
  }

  if (fecha && String(fecha) !== hoy) {
    return {
      ok: false,
      status: 403,
      code: 'OPERATIONAL_DAY_ONLY',
      message: `El perfil operativo solo puede consultar información del día actual. ${nombreCampo}: ${hoy}.`,
      hoy
    };
  }

  return { ok: true, fecha: hoy, restringida: true, hoy };
};

export const validarRegistroDelDia = ({
  user,
  sedeId,
  fechaRegistro,
  mensaje = 'El perfil operativo solo puede acceder a registros del día actual.'
}) => {
  if (!usuarioTieneAlcanceOperativoDiario(user, sedeId)) {
    return { ok: true, restringida: false };
  }

  const fecha =
    typeof fechaRegistro === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaRegistro)
      ? fechaRegistro
      : fechaArgentinaDesdeDate(fechaRegistro);
  const hoy = fechaArgentina();

  if (!fecha || fecha !== hoy) {
    return {
      ok: false,
      status: 403,
      code: 'OPERATIONAL_DAY_ONLY',
      message: mensaje,
      hoy
    };
  }

  return { ok: true, restringida: true, hoy };
};

export const requireFechaOperativaActual = (req, res, next) => {
  const sedeId = Number(req.query?.sede_id || req.body?.sede_id || 0);

  if (!usuarioEsOperadorDiario(req.user)) {
    return next();
  }

  if (!sedeId) {
    return res.status(400).json({
      ok: false,
      code: 'OPERATIONAL_SEDE_REQUIRED',
      message: 'Debe indicar la sede activa para consultar la operación del día.'
    });
  }

  if (!usuarioTieneAlcanceOperativoDiario(req.user, sedeId)) {
    return res.status(403).json({
      ok: false,
      code: 'OPERATIONAL_SEDE_DENIED',
      message: 'No tiene acceso operativo a la sede indicada.'
    });
  }

  const hoy = fechaArgentina();
  const camposFecha = [
    'fecha',
    'desde',
    'hasta',
    'fecha_desde',
    'fecha_hasta',
    'fecha_gasto',
    'fecha_pago'
  ];
  const fechaInvalida = camposFecha.find(
    (campo) => req.query?.[campo] && String(req.query[campo]) !== hoy
  );

  if (fechaInvalida) {
    return res.status(403).json({
      ok: false,
      code: 'OPERATIONAL_DAY_ONLY',
      message: `El perfil operativo solo puede consultar información del día actual (${hoy}).`
    });
  }

  req.query.fecha = hoy;
  req.query.desde = hoy;
  req.query.hasta = hoy;
  req.query.fecha_desde = hoy;
  req.query.fecha_hasta = hoy;

  return next();
};

export const requireCobroDelDiaActual = async (req, res, next) => {
  try {
    const sedeId = Number(req.body?.sede_id || req.query?.sede_id || 0);

    if (!usuarioEsOperadorDiario(req.user)) {
      return next();
    }

    if (!sedeId) {
      return res.status(400).json({
        ok: false,
        code: 'OPERATIONAL_SEDE_REQUIRED',
        message: 'Debe indicar la sede activa para validar el cobro.'
      });
    }

    if (!usuarioTieneAlcanceOperativoDiario(req.user, sedeId)) {
      return res.status(403).json({
        ok: false,
        code: 'OPERATIONAL_SEDE_DENIED',
        message: 'No tiene acceso operativo a la sede indicada.'
      });
    }

    const cobroId = Number(req.params?.id || 0);
    if (!cobroId) {
      return res.status(400).json({
        ok: false,
        code: 'COBRO_ID_REQUIRED',
        message: 'Debe indicar un cobro válido.'
      });
    }

    const rows = await db.query(
      `SELECT id, DATE(fecha_cobro) AS fecha_cobro
       FROM cobros_cobros
       WHERE id = :id AND sede_id = :sede_id
       LIMIT 1`,
      {
        replacements: { id: cobroId, sede_id: sedeId },
        type: QueryTypes.SELECT
      }
    );

    if (!rows.length) return next();

    const validacion = validarRegistroDelDia({
      user: req.user,
      sedeId,
      fechaRegistro: rows[0].fecha_cobro,
      mensaje:
        'El perfil operativo no puede consultar ni modificar cobros de días anteriores.'
    });

    if (!validacion.ok) {
      return res.status(validacion.status).json({
        ok: false,
        code: validacion.code,
        message: validacion.message
      });
    }

    return next();
  } catch (error) {
    console.error('Error requireCobroDelDiaActual PREMIUM:', error);
    return res.status(500).json({
      ok: false,
      code: 'OPERATIONAL_DAY_SCOPE_ERROR',
      message: 'Error al validar la fecha operativa del cobro.'
    });
  }
};
