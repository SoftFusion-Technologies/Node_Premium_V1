/*
 * Benjamin Orellana - 2026/07/07 - Helpers compartidos para controladores del módulo Gastos PREMIUM.
 */

import { Op } from 'sequelize';

import SedesModel from '../../Models/Sede/MD_TB_Sedes.js';
import { usuarioTieneAccesoTodasSedes } from '../../utils/usuariosAcceso.utils.js';
import GastosTiposModel from '../../Models/Gastos/MD_TB_GastosTipos.js';
import GastosProveedoresModel from '../../Models/Gastos/MD_TB_GastosProveedores.js';

export const ROLES_GASTOS_LECTURA = [
  'SUPER_ADMIN',
  'DIRECCION',
  'COORD_SEDE',
  'PROFESOR'
];
export const ROLES_GASTOS_OPERACION = [
  'SUPER_ADMIN',
  'DIRECCION',
  'COORD_SEDE',
  'PROFESOR'
];

export const ESTADOS_GASTO_VALIDOS = ['pendiente', 'pagado', 'anulado'];
export const ORIGENES_GASTO_VALIDOS = ['manual', 'periodico'];
export const ORIGENES_FONDOS_GASTO_VALIDOS = ['caja_sede', 'fuera_caja'];
export const FRECUENCIAS_GASTO_PERIODICO_VALIDAS = [
  'semanal',
  'quincenal',
  'mensual',
  'anual'
];

export const normalizarTexto = (value) => {
  if (value === undefined || value === null) return null;

  const texto = String(value).trim();

  return texto.length > 0 ? texto : null;
};

export const normalizarFecha = (value) => {
  return normalizarTexto(value);
};

export const obtenerFechaActualDateOnly = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
};

export const esFechaDateOnlyValida = (value) => {
  if (!value || typeof value !== 'string') return false;

  const regexFecha = /^\d{4}-\d{2}-\d{2}$/;

  if (!regexFecha.test(value)) return false;

  const fecha = new Date(`${value}T00:00:00Z`);

  return !Number.isNaN(fecha.getTime());
};

export const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;

  const numberValue = Number(value);

  return Number.isNaN(numberValue) ? null : numberValue;
};

export const normalizarTinyint = (value, defaultValue = 0) => {
  if (value === undefined || value === null || value === '') return defaultValue;

  if (
    value === true ||
    value === 'true' ||
    value === '1' ||
    Number(value) === 1
  ) {
    return 1;
  }

  if (
    value === false ||
    value === 'false' ||
    value === '0' ||
    Number(value) === 0
  ) {
    return 0;
  }

  return defaultValue;
};

export const normalizarDecimal = (value, defaultValue = 0) => {
  if (value === undefined || value === null || value === '') {
    return Number(defaultValue).toFixed(2);
  }

  const numberValue = Number(String(value).replace(',', '.'));

  if (Number.isNaN(numberValue)) return Number(defaultValue).toFixed(2);

  return numberValue.toFixed(2);
};

export const calcularImporteIva = ({ importeTotal, incluyeIva, ivaPorcentaje }) => {
  const total = Number(importeTotal || 0);
  const incluye = Number(incluyeIva || 0) === 1;
  const porcentaje = Number(ivaPorcentaje || 0);

  if (!incluye || total <= 0 || porcentaje <= 0) {
    return '0.00';
  }

  const divisor = 1 + porcentaje / 100;
  const importeIva = total - total / divisor;

  return importeIva.toFixed(2);
};

export const buildPagination = ({ page = 1, limit = 20 }) => {
  const pageNumber = Math.max(Number(page) || 1, 1);
  const limitNumber = Math.min(Math.max(Number(limit) || 20, 1), 200);
  const offset = (pageNumber - 1) * limitNumber;

  return {
    pageNumber,
    limitNumber,
    offset
  };
};

export const buildOrder = ({
  orderBy = 'created_at',
  orderDirection = 'DESC',
  allowedFields = []
}) => {
  const safeOrderBy = allowedFields.includes(orderBy) ? orderBy : 'created_at';
  const safeOrderDirection =
    String(orderDirection).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  return [[safeOrderBy, safeOrderDirection]];
};

export const usuarioEsGlobalGastos = (user) => {
  return usuarioTieneAccesoTodasSedes(user);
};

const obtenerRolesEfectivosUsuario = (user) => {
  const roles = new Set();

  if (user?.rol_codigo) roles.add(String(user.rol_codigo).toUpperCase());

  if (Array.isArray(user?.sedes)) {
    user.sedes.forEach((sede) => {
      const rol =
        sede?.asignacion?.rol_codigo || sede?.rol_codigo || user?.rol_codigo;
      if (rol) roles.add(String(rol).toUpperCase());
    });
  }

  return [...roles];
};

export const validarRolLecturaGastos = (user) => {
  return obtenerRolesEfectivosUsuario(user).some((rol) =>
    ROLES_GASTOS_LECTURA.includes(rol)
  );
};

export const validarRolOperacionGastos = (user) => {
  return obtenerRolesEfectivosUsuario(user).some((rol) =>
    ROLES_GASTOS_OPERACION.includes(rol)
  );
};

export const obtenerSedesPermitidasUsuario = (user) => {
  if (!user || !Array.isArray(user.sedes)) return [];

  return user.sedes
    .filter((sede) => {
      return (
        sede?.asignacion?.activo !== false &&
        sede?.asignacion?.puede_operar !== false
      );
    })
    .map((sede) => Number(sede.id || sede.sede_id))
    .filter(Boolean);
};

export const usuarioPuedeOperarSedeGastos = (user, sedeId) => {
  if (usuarioEsGlobalGastos(user)) return true;

  if (!sedeId) return false;

  const sedesPermitidas = obtenerSedesPermitidasUsuario(user);

  return sedesPermitidas.includes(Number(sedeId));
};

export const aplicarScopeSedesGastos = (where = {}, user = null, sedeIdQuery = null) => {
  if (usuarioEsGlobalGastos(user)) {
    if (sedeIdQuery) {
      where.sede_id = Number(sedeIdQuery);
    }

    return { ok: true, where };
  }

  const sedesPermitidas = obtenerSedesPermitidasUsuario(user);

  if (!sedesPermitidas.length) {
    return {
      ok: false,
      status: 403,
      message: 'El usuario no tiene sedes asignadas para consultar gastos.'
    };
  }

  if (sedeIdQuery) {
    if (!sedesPermitidas.includes(Number(sedeIdQuery))) {
      return {
        ok: false,
        status: 403,
        message: 'No tiene acceso a la sede indicada.'
      };
    }

    where.sede_id = Number(sedeIdQuery);

    return { ok: true, where };
  }

  where.sede_id = { [Op.in]: sedesPermitidas };

  return { ok: true, where };
};

export const aplicarScopeSedesGastosSql = (user = null, sedeIdQuery = null, alias = 'g') => {
  const condiciones = [];
  const replacements = {};

  if (usuarioEsGlobalGastos(user)) {
    if (sedeIdQuery) {
      condiciones.push(`${alias}.sede_id = :sede_id`);
      replacements.sede_id = Number(sedeIdQuery);
    }

    return { ok: true, condiciones, replacements };
  }

  const sedesPermitidas = obtenerSedesPermitidasUsuario(user);

  if (!sedesPermitidas.length) {
    return {
      ok: false,
      status: 403,
      message: 'El usuario no tiene sedes asignadas para consultar gastos.'
    };
  }

  if (sedeIdQuery) {
    if (!sedesPermitidas.includes(Number(sedeIdQuery))) {
      return {
        ok: false,
        status: 403,
        message: 'No tiene acceso a la sede indicada.'
      };
    }

    condiciones.push(`${alias}.sede_id = :sede_id`);
    replacements.sede_id = Number(sedeIdQuery);

    return { ok: true, condiciones, replacements };
  }

  condiciones.push(`${alias}.sede_id IN (:sedes_permitidas)`);
  replacements.sedes_permitidas = sedesPermitidas;

  return { ok: true, condiciones, replacements };
};

export const buscarSedeActiva = async (sedeId, transaction = null) => {
  if (!sedeId) return null;

  return SedesModel.findOne({
    where: {
      id: sedeId,
      activo: 1
    },
    transaction
  });
};

export const buscarTipoGastoActivo = async (tipoGastoId, transaction = null) => {
  if (!tipoGastoId) return null;

  return GastosTiposModel.findOne({
    where: {
      id: tipoGastoId,
      activo: 1
    },
    transaction
  });
};

export const buscarProveedorActivo = async (proveedorId, transaction = null) => {
  if (!proveedorId) return null;

  return GastosProveedoresModel.findOne({
    where: {
      id: proveedorId,
      activo: 1
    },
    transaction
  });
};

export const validarSedeTipoProveedor = async ({
  payload,
  user,
  transaction = null,
  validarSede = true,
  validarTipo = true,
  validarProveedor = true
}) => {
  const errores = [];

  if (validarSede && payload.sede_id) {
    if (!usuarioPuedeOperarSedeGastos(user, payload.sede_id)) {
      errores.push('No tiene acceso a la sede indicada.');
    } else {
      const sede = await buscarSedeActiva(payload.sede_id, transaction);

      if (!sede) {
        errores.push('La sede indicada no existe o está inactiva.');
      }
    }
  }

  if (validarSede && !payload.sede_id && !usuarioEsGlobalGastos(user)) {
    errores.push('La sede es obligatoria para usuarios no globales.');
  }

  if (validarTipo && payload.tipo_gasto_id) {
    const tipoGasto = await buscarTipoGastoActivo(payload.tipo_gasto_id, transaction);

    if (!tipoGasto) {
      errores.push('El tipo de gasto indicado no existe o está inactivo.');
    }
  }

  if (validarProveedor && payload.proveedor_id) {
    const proveedor = await buscarProveedorActivo(payload.proveedor_id, transaction);

    if (!proveedor) {
      errores.push('El proveedor indicado no existe o está inactivo.');
    }
  }

  return errores;
};

export const armarRespuestaAsociacionesBloqueantes = (asociaciones = []) => {
  const asociacionesConDatos = asociaciones.filter(
    (asociacion) => Number(asociacion.cantidad || 0) > 0
  );

  return {
    tiene_asociaciones: asociacionesConDatos.length > 0,
    asociaciones_detectadas: asociaciones.reduce((acc, asociacion) => {
      acc[asociacion.tabla] = Number(asociacion.cantidad || 0);
      return acc;
    }, {}),
    asociaciones: asociacionesConDatos
  };
};

export const manejarErrorControlador = ({ res, error, nombre }) => {
  console.error(`Error ${nombre}:`, error);

  if (
    error?.name === 'SequelizeForeignKeyConstraintError' ||
    error?.original?.code === 'ER_ROW_IS_REFERENCED_2'
  ) {
    return res.status(409).json({
      ok: false,
      message:
        'No se pudo completar la eliminación física porque existen asociaciones activas.',
      detalle: {
        tabla: error?.table || error?.original?.table || null,
        constraint:
          error?.index ||
          error?.constraint ||
          error?.original?.constraint ||
          null,
        campos: error?.fields || [],
        sqlMessage: error?.original?.sqlMessage || error?.message
      }
    });
  }

  return res.status(500).json({
    ok: false,
    message: 'Error interno del servidor.'
  });
};

export const sumarFechaPorFrecuencia = (fechaDateOnly, frecuencia) => {
  if (!esFechaDateOnlyValida(fechaDateOnly)) return null;

  const fecha = new Date(`${fechaDateOnly}T00:00:00Z`);

  if (frecuencia === 'semanal') {
    fecha.setUTCDate(fecha.getUTCDate() + 7);
  }

  if (frecuencia === 'quincenal') {
    fecha.setUTCDate(fecha.getUTCDate() + 15);
  }

  if (frecuencia === 'mensual') {
    fecha.setUTCMonth(fecha.getUTCMonth() + 1);
  }

  if (frecuencia === 'anual') {
    fecha.setUTCFullYear(fecha.getUTCFullYear() + 1);
  }

  return fecha.toISOString().slice(0, 10);
};

export const anexarSedesARegistros = async (registros = []) => {
  const planos = registros.map((registro) => {
    return typeof registro.toJSON === 'function' ? registro.toJSON() : { ...registro };
  });

  const sedeIds = [
    ...new Set(
      planos
        .map((registro) => Number(registro.sede_id))
        .filter(Boolean)
    )
  ];

  if (!sedeIds.length) {
    return planos.map((registro) => ({ ...registro, sede: null }));
  }

  const sedes = await SedesModel.findAll({
    where: {
      id: {
        [Op.in]: sedeIds
      }
    },
    attributes: ['id', 'nombre', 'codigo', 'activo']
  });

  const sedesMap = sedes.reduce((acc, sede) => {
    const plano = typeof sede.toJSON === 'function' ? sede.toJSON() : sede;
    acc[Number(plano.id)] = plano;
    return acc;
  }, {});

  return planos.map((registro) => ({
    ...registro,
    sede: registro.sede_id ? sedesMap[Number(registro.sede_id)] || null : null
  }));
};
