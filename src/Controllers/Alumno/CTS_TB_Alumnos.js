/*
 * Benjamin Orellana - 2026/05/26 - Controlador Sequelize para la gestión principal de alumnos PREMIUM.
 */

import { Op } from 'sequelize';

import db from '../../DataBase/db.js';

import AlumnosModel from '../../Models/Alumno/MD_TB_Alumnos.js';
import AlumnosMembresiasModel from '../../Models/Alumno/MD_TB_AlumnosMembresias.js';
import AlumnosContactosEmergenciaModel from "../../Models/Alumno/MD_TB_AlumnosContactosEmergencia.js";
import AlumnosAnamnesisModel from '../../Models/Alumno/MD_TB_AlumnosAnamnesis.js';
import PlanesModel from '../../Models/Plan/MD_TB_Planes.js';
import PlanesPreciosModel from '../../Models/Plan/MD_TB_PlanesPrecios.js';
import SedesModel from '../../Models/Sede/MD_TB_Sedes.js';
import UsuariosModel from '../../Models/Usuario/MD_TB_Usuarios.js';
import UsuariosRolesModel from '../../Models/Usuario/MD_TB_UsuariosRoles.js';
import { hashPassword } from '../../Security/auth.js';

const ESTADOS_ALUMNO_VALIDOS = [
  'pendiente_validacion',
  'activo',
  'pendiente_pago',
  'inactivo',
  'baja',
  'congelado',
  'prueba_clase_inicial'
];

const ORIGENES_REGISTRO_VALIDOS = ['interno', 'externo', 'importado'];

const ROLES_GLOBALES = ['SUPER_ADMIN', 'DIRECCION'];

const ROLES_OPERATIVOS_ALUMNOS = [
  'SUPER_ADMIN',
  'DIRECCION',
  'FRONT_COMERCIAL',
  'COORD_SEDE'
];

const ROLES_LECTURA_ALUMNOS = [
  'SUPER_ADMIN',
  'DIRECCION',
  'FRONT_COMERCIAL',
  'COORD_SEDE',
  'PROFESOR'
];

const normalizarTexto = (value) => {
  if (value === undefined || value === null) return null;

  const texto = String(value).trim();

  return texto.length > 0 ? texto : null;
};

const normalizarEmail = (value) => {
  const texto = normalizarTexto(value);

  return texto ? texto.toLowerCase() : null;
};

const normalizarTelefono = (value) => {
  const texto = normalizarTexto(value);

  if (!texto) return null;

  const soloNumeros = texto.replace(/\D/g, '');

  return soloNumeros || texto;
};

const normalizarDni = (value) => {
  const texto = normalizarTexto(value);

  if (!texto) return null;

  return texto.replace(/\D/g, '') || texto;
};

const normalizarFecha = (value) => {
  const texto = normalizarTexto(value);

  return texto || null;
};

const esFechaDateOnlyValida = (value) => {
  if (!value || typeof value !== 'string') return false;

  const regexFecha = /^\d{4}-\d{2}-\d{2}$/;

  if (!regexFecha.test(value)) return false;

  const fecha = new Date(`${value}T00:00:00`);

  return !Number.isNaN(fecha.getTime());
};

const obtenerFechaActualDateOnly = () => {
  return new Date().toISOString().slice(0, 10);
};

const sumarDiasDateOnly = (fechaDateOnly, dias) => {
  const fechaBase = new Date(`${fechaDateOnly}T00:00:00Z`);

  if (Number.isNaN(fechaBase.getTime())) {
    return null;
  }

  fechaBase.setUTCDate(fechaBase.getUTCDate() + Number(dias));

  return fechaBase.toISOString().slice(0, 10);
};

const normalizarTinyint = (value, defaultValue = 0) => {
  if (value === undefined || value === null || value === '')
    return defaultValue;

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

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;

  const numberValue = Number(value);

  return Number.isNaN(numberValue) ? null : numberValue;
};

const usuarioEsGlobal = (user) => {
  return ROLES_GLOBALES.includes(user?.rol_codigo);
};

const obtenerSedesPermitidasUsuario = (user) => {
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

/*
 * Benjamin Orellana - 2026/06/03 - Permite a roles globales operar alumnos aunque no tengan sede asignada.
 */
const usuarioPuedeOperarSede = (user, sedeId) => {
  if (usuarioEsGlobal(user)) return true;

  if (!sedeId) return false;

  const sedesPermitidas = obtenerSedesPermitidasUsuario(user);

  return sedesPermitidas.includes(Number(sedeId));
};

const validarRolOperacionAlumnos = (user) => {
  return ROLES_OPERATIVOS_ALUMNOS.includes(user?.rol_codigo);
};

const validarRolLecturaAlumnos = (user) => {
  return ROLES_LECTURA_ALUMNOS.includes(user?.rol_codigo);
};

const eliminarPasswordHash = (usuario = {}) => {
  if (!usuario) return null;

  const usuarioPlano =
    typeof usuario.toJSON === 'function' ? usuario.toJSON() : { ...usuario };

  delete usuarioPlano.password_hash;

  return usuarioPlano;
};

const buscarSedeActiva = async (sedeId) => {
  if (!sedeId) return null;

  return SedesModel.findOne({
    where: {
      id: sedeId,
      activo: 1
    }
  });
};

const buscarRolAlumno = async () => {
  return UsuariosRolesModel.findOne({
    where: {
      codigo: 'ALUMNO',
      activo: 1
    }
  });
};

const construirAlumnoRespuesta = async (alumno, transaction = null) => {
  if (!alumno) return null;

  const alumnoPlano =
    typeof alumno.toJSON === 'function' ? alumno.toJSON() : { ...alumno };

  const [
    sede,
    usuarioApp,
    usuarioAlta,
    usuarioValidacion,
    contactosEmergencia,
    membresias,
    membresiaActiva,
    anamnesis
  ] = await Promise.all([
    alumnoPlano.sede_id
      ? SedesModel.findByPk(alumnoPlano.sede_id, { transaction })
      : null,
    alumnoPlano.usuario_app_id
      ? UsuariosModel.findByPk(alumnoPlano.usuario_app_id, { transaction })
      : null,
    alumnoPlano.usuario_alta_id
      ? UsuariosModel.findByPk(alumnoPlano.usuario_alta_id, { transaction })
      : null,
    alumnoPlano.usuario_validacion_id
      ? UsuariosModel.findByPk(alumnoPlano.usuario_validacion_id, { transaction })
      : null,
    AlumnosContactosEmergenciaModel.findAll({
      where: {
        alumno_id: alumnoPlano.id
      },
      order: [
        ['principal', 'DESC'],
        ['id', 'ASC']
      ],
      transaction
    }),
    AlumnosMembresiasModel.findAll({
      where: {
        alumno_id: alumnoPlano.id
      },
      include: [
        {
          model: PlanesModel,
          as: 'plan',
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
        },
        {
          model: SedesModel,
          as: 'sede',
          attributes: ['id', 'nombre', 'codigo', 'activo']
        }
      ],
      order: [
        ['fecha_inicio', 'DESC'],
        ['id', 'DESC']
      ],
      transaction
    }),
    AlumnosMembresiasModel.findOne({
      where: {
        alumno_id: alumnoPlano.id
      },
      include: [
        {
          model: PlanesModel,
          as: 'plan',
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
        },
        {
          model: SedesModel,
          as: 'sede',
          attributes: ['id', 'nombre', 'codigo', 'activo']
        }
      ],
      order: [
        ['fecha_inicio', 'DESC'],
        ['id', 'DESC']
      ],
      transaction
    }),
      AlumnosAnamnesisModel.findOne({
      where: { alumno_id: alumnoPlano.id },
      order: [['id', 'DESC']],
      transaction
    })
  ]);

  return {
    ...alumnoPlano,
    sede: sede
      ? typeof sede.toJSON === 'function'
        ? sede.toJSON()
        : sede
      : null,
    usuario_app: usuarioApp ? eliminarPasswordHash(usuarioApp) : null,
    usuario_alta: usuarioAlta ? eliminarPasswordHash(usuarioAlta) : null,
    usuario_validacion: usuarioValidacion
      ? eliminarPasswordHash(usuarioValidacion)
      : null,
    contactos_emergencia: contactosEmergencia,
    membresias,
    membresia_actual: membresiaActiva,
    anamnesis,     
  };
};

const setIfPresent = (payload, body, key, normalizer = normalizarTexto) => {
  if (Object.prototype.hasOwnProperty.call(body, key)) {
    payload[key] = normalizer(body[key]);
  }
};

const buildAlumnoPayloadCreate = (body = {}, user = null) => {
  return {
    usuario_app_id: toNumberOrNull(body.usuario_app_id),
    sede_id: toNumberOrNull(body.sede_id),

    usuario_alta_id: user?.id || user?.usuario_id || null,
    usuario_validacion_id: null,

    origen_registro: normalizarTexto(body.origen_registro) || 'interno',

    nombre: normalizarTexto(body.nombre),
    apellido: normalizarTexto(body.apellido),
    dni: normalizarDni(body.dni),
    fecha_nacimiento: normalizarFecha(body.fecha_nacimiento),
    telefono: normalizarTelefono(body.telefono),
    email: normalizarEmail(body.email),
    domicilio: normalizarTexto(body.domicilio),
    localidad: normalizarTexto(body.localidad),
    provincia: normalizarTexto(body.provincia),

    fecha_inicio: normalizarFecha(body.fecha_inicio),

    estado: normalizarTexto(body.estado) || 'pendiente_validacion',

    fecha_baja: null,
    motivo_baja: null,

    fecha_congelamiento_desde: null,
    fecha_congelamiento_hasta: null,
    motivo_congelamiento: null,

    ultima_asistencia: null,
    dias_sin_actividad: null,

    acepta_terminos: normalizarTinyint(body.acepta_terminos, 0),
    fecha_aceptacion_terminos:
      normalizarTinyint(body.acepta_terminos, 0) === 1 ? new Date() : null,

    observaciones_admin: normalizarTexto(body.observaciones_admin)
  };
};

const buildAlumnoPayloadUpdate = (body = {}) => {
  const payload = {};

  setIfPresent(payload, body, 'sede_id', toNumberOrNull);
  setIfPresent(payload, body, 'nombre', normalizarTexto);
  setIfPresent(payload, body, 'apellido', normalizarTexto);
  setIfPresent(payload, body, 'dni', normalizarDni);
  setIfPresent(payload, body, 'fecha_nacimiento', normalizarFecha);
  setIfPresent(payload, body, 'telefono', normalizarTelefono);
  setIfPresent(payload, body, 'email', normalizarEmail);
  setIfPresent(payload, body, 'domicilio', normalizarTexto);
  setIfPresent(payload, body, 'localidad', normalizarTexto);
  setIfPresent(payload, body, 'provincia', normalizarTexto);
  setIfPresent(payload, body, 'fecha_inicio', normalizarFecha);
  setIfPresent(payload, body, 'observaciones_admin', normalizarTexto);

  if (Object.prototype.hasOwnProperty.call(body, 'acepta_terminos')) {
    payload.acepta_terminos = normalizarTinyint(body.acepta_terminos, 0);

    if (payload.acepta_terminos === 1) {
      payload.fecha_aceptacion_terminos =
        body.fecha_aceptacion_terminos || new Date();
    }
  }

  return payload;
};

const validarPayloadAlumno = (payload = {}, modo = 'create') => {
  const errores = [];

  if (modo === 'create' && !payload.sede_id) {
    errores.push('La sede del alumno es obligatoria.');
  }

  if (modo === 'create' && !payload.nombre) {
    errores.push('El nombre del alumno es obligatorio.');
  }

  if (modo === 'create' && !payload.apellido) {
    errores.push('El apellido del alumno es obligatorio.');
  }

  if (modo === 'create' && !payload.dni) {
    errores.push('El DNI del alumno es obligatorio.');
  }

  if (payload.nombre && payload.nombre.length > 120) {
    errores.push('El nombre no puede superar los 120 caracteres.');
  }

  if (payload.apellido && payload.apellido.length > 120) {
    errores.push('El apellido no puede superar los 120 caracteres.');
  }

  if (payload.dni && payload.dni.length > 20) {
    errores.push('El DNI no puede superar los 20 caracteres.');
  }

  if (payload.telefono && payload.telefono.length > 50) {
    errores.push('El teléfono no puede superar los 50 caracteres.');
  }

  if (payload.email && payload.email.length > 150) {
    errores.push('El email no puede superar los 150 caracteres.');
  }

  if (
    payload.origen_registro &&
    !ORIGENES_REGISTRO_VALIDOS.includes(payload.origen_registro)
  ) {
    errores.push('El origen de registro indicado no es válido.');
  }

  if (payload.estado && !ESTADOS_ALUMNO_VALIDOS.includes(payload.estado)) {
    errores.push('El estado del alumno indicado no es válido.');
  }

  return errores;
};

const verificarDniDuplicado = async (dni, alumnoIdExcluir = null) => {
  if (!dni) return null;

  const where = {
    dni
  };

  if (alumnoIdExcluir) {
    where.id = {
      [Op.ne]: alumnoIdExcluir
    };
  }

  return AlumnosModel.findOne({ where });
};

const verificarUsuarioAppDisponible = async (
  usuarioAppId,
  alumnoIdExcluir = null
) => {
  if (!usuarioAppId) return null;

  const where = {
    usuario_app_id: usuarioAppId
  };

  if (alumnoIdExcluir) {
    where.id = {
      [Op.ne]: alumnoIdExcluir
    };
  }

  return AlumnosModel.findOne({ where });
};

const verificarUsuarioLoginDuplicado = async ({ email, telefono }) => {
  const condiciones = [];

  if (email) {
    condiciones.push({ email });
  }

  if (telefono) {
    condiciones.push({ telefono });
  }

  if (!condiciones.length) return null;

  return UsuariosModel.findOne({
    where: {
      [Op.or]: condiciones
    }
  });
};

const aplicarScopeSedesAlumnos = (
  where = {},
  user = null,
  sedeIdQuery = null
) => {
  if (usuarioEsGlobal(user)) {
    if (sedeIdQuery) {
      where.sede_id = Number(sedeIdQuery);
    }

    return {
      ok: true,
      where
    };
  }

  const sedesPermitidas = obtenerSedesPermitidasUsuario(user);

  if (!sedesPermitidas.length) {
    return {
      ok: false,
      status: 403,
      message: 'El usuario no tiene sedes asignadas para consultar alumnos.'
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

    return {
      ok: true,
      where
    };
  }

  where.sede_id = {
    [Op.in]: sedesPermitidas
  };

  return {
    ok: true,
    where
  };
};

const buscarAlumnoPorIdConPermiso = async (id, user) => {
  const alumno = await AlumnosModel.findByPk(id);

  if (!alumno) {
    return {
      ok: false,
      status: 404,
      message: 'Alumno no encontrado.'
    };
  }

  const alumnoPlano =
    typeof alumno.toJSON === 'function' ? alumno.toJSON() : alumno;

  if (!usuarioPuedeOperarSede(user, alumnoPlano.sede_id)) {
    return {
      ok: false,
      status: 403,
      message: 'No tiene acceso al alumno indicado.'
    };
  }

  return {
    ok: true,
    alumno
  };
};

const buscarPlanActivo = async (planId, transaction = null) => {
  if (!planId) return null;

  return PlanesModel.findOne({
    where: {
      id: planId,
      activo: 1
    },
    transaction
  });
};

const buscarPrecioVigentePlan = async ({
  planId,
  sedeId,
  fechaConsulta,
  transaction = null
}) => {
  const whereBase = {
    plan_id: planId,
    activo: 1,
    fecha_desde: {
      [Op.lte]: fechaConsulta
    },
    [Op.or]: [
      {
        fecha_hasta: null
      },
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
        sede_id: sedeId
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

const construirFechaVencimientoMembresia = (fechaInicio, duracionDias) => {
  if (!fechaInicio || !duracionDias || Number(duracionDias) <= 0) {
    return null;
  }

  return sumarDiasDateOnly(fechaInicio, Number(duracionDias) - 1);
};

const construirPayloadContactoEmergenciaPublico = (body = {}) => {
  return {
    nombre: normalizarTexto(body.contacto_emergencia_nombre),
    parentesco: normalizarTexto(body.contacto_emergencia_parentesco),
    telefono: normalizarTelefono(body.contacto_emergencia_telefono),
    email: normalizarEmail(body.contacto_emergencia_email),
    principal: normalizarTinyint(body.contacto_emergencia_principal, 1)
  };
};

const normalizarContactosEmergenciaPublico = (body = {}) => {
  if (Array.isArray(body.contactos_emergencia)) {
    return body.contactos_emergencia.map((contacto, index) => ({
      nombre: normalizarTexto(contacto?.nombre),
      parentesco: normalizarTexto(contacto?.parentesco),
      telefono: normalizarTelefono(contacto?.telefono),
      email: normalizarEmail(contacto?.email),
      principal: normalizarTinyint(contacto?.principal, index === 0 ? 1 : 0)
    }));
  }

  const contactoUnico = construirPayloadContactoEmergenciaPublico(body);

  if (
    contactoUnico.nombre ||
    contactoUnico.parentesco ||
    contactoUnico.telefono ||
    contactoUnico.email
  ) {
    return [contactoUnico];
  }

  return [];
};

const validarContactosEmergenciaPublico = (contactos = []) => {
  const errores = [];

  if (!contactos.length) {
    errores.push('Debe enviar al menos un contacto de emergencia.');
    return errores;
  }

  contactos.forEach((contacto, index) => {
    const numeroContacto = index + 1;

    if (!contacto.nombre) {
      errores.push(
        `El nombre del contacto de emergencia ${numeroContacto} es obligatorio.`
      );
    }

    if (!contacto.telefono) {
      errores.push(
        `El teléfono del contacto de emergencia ${numeroContacto} es obligatorio.`
      );
    }

    if (contacto.nombre && contacto.nombre.length > 120) {
      errores.push(
        `El nombre del contacto de emergencia ${numeroContacto} no puede superar los 120 caracteres.`
      );
    }

    if (contacto.parentesco && contacto.parentesco.length > 80) {
      errores.push(
        `El parentesco del contacto de emergencia ${numeroContacto} no puede superar los 80 caracteres.`
      );
    }

    if (contacto.telefono && contacto.telefono.length > 50) {
      errores.push(
        `El teléfono del contacto de emergencia ${numeroContacto} no puede superar los 50 caracteres.`
      );
    }

    if (contacto.email && contacto.email.length > 150) {
      errores.push(
        `El email del contacto de emergencia ${numeroContacto} no puede superar los 150 caracteres.`
      );
    }
  });

  const principalAsignado = contactos.some((contacto) => contacto.principal === 1);

  if (!principalAsignado && contactos.length > 0) {
    contactos[0].principal = 1;
  }

  return errores;
};

const normalizarPrincipalContactosEmergenciaPublico = (contactos = []) => {
  if (!contactos.length) return contactos;

  const principalIndex = contactos.findIndex((contacto) => contacto.principal === 1);
  const indexPrincipalFinal = principalIndex >= 0 ? principalIndex : 0;

  return contactos.map((contacto, index) => ({
    ...contacto,
    principal: index === indexPrincipalFinal ? 1 : 0
  }));
};

const construirPayloadMembresiaPublica = ({
  alumnoId,
  plan,
  sedeId,
  fechaInicio,
  precioVigente
}) => {
  const precioLista = precioVigente ? Number(precioVigente.precio || 0) : 0;
  const clasesIncluidas = Number(
    plan.cantidad_clases_periodo ?? plan.clases_por_mes ?? 0
  );
  const fechaVencimiento = construirFechaVencimientoMembresia(
    fechaInicio,
    plan.duracion_dias
  );

  return {
    alumno_id: alumnoId,
    plan_id: plan.id,
    sede_id: sedeId,
    fecha_inicio: fechaInicio,
    fecha_vencimiento: fechaVencimiento,
    estado: 'pendiente_pago',
    precio_lista: precioLista.toFixed(2),
    descuento_valor: '0.00',
    descuento_porcentaje: '0.00',
    precio_final: precioLista.toFixed(2),
    clases_incluidas: clasesIncluidas,
    clases_usadas: 0,
    clases_disponibles: clasesIncluidas,
    origen_alta: 'web',
    observaciones: null
  };
};

const buscarAlumnoPorDniConPermiso = async (dni, user) => {
  const alumno = await AlumnosModel.findOne({
    where: {
      dni
    }
  });

  if (!alumno) {
    return {
      ok: false,
      status: 404,
      message: 'Alumno no encontrado.'
    };
  }

  const alumnoPlano =
    typeof alumno.toJSON === 'function' ? alumno.toJSON() : alumno;

  if (!usuarioPuedeOperarSede(user, alumnoPlano.sede_id)) {
    return {
      ok: false,
      status: 403,
      message: 'No tiene acceso al alumno indicado.'
    };
  }

  return {
    ok: true,
    alumno
  };
};

/*
 * Benjamin Orellana - 2026/05/26 - Lista alumnos con filtros, búsqueda, sede, estado y paginación.
 */
export const OBR_Alumnos_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaAlumnos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar alumnos.'
      });
    }

    const {
      q,
      sede_id,
      estado,
      origen_registro,
      page = 1,
      limit = 20,
      orderBy = 'created_at',
      orderDirection = 'DESC'
    } = req.query;

    const where = {};

    // Filtro por sede según permisos del usuario
    const scope = aplicarScopeSedesAlumnos(where, req.user, sede_id);

    if (!scope.ok) {
      return res.status(scope.status).json({
        ok: false,
        message: scope.message
      });
    }

    // Totales de la sede sin filtros de búsqueda
    const whereEstadisticas = { ...where };

    const [totalSede, activosSede] = await Promise.all([
      AlumnosModel.count({ where: whereEstadisticas }),
      AlumnosModel.count({ where: { ...whereEstadisticas, estado: 'activo' } })
    ]);

    if (estado) {
      if (!ESTADOS_ALUMNO_VALIDOS.includes(estado)) {
        return res.status(400).json({
          ok: false,
          message: 'Estado de alumno inválido.',
          estados_validos: ESTADOS_ALUMNO_VALIDOS
        });
      }

      where.estado = estado;
    }

    if (origen_registro) {
      if (!ORIGENES_REGISTRO_VALIDOS.includes(origen_registro)) {
        return res.status(400).json({
          ok: false,
          message: 'Origen de registro inválido.',
          origenes_validos: ORIGENES_REGISTRO_VALIDOS
        });
      }

      where.origen_registro = origen_registro;
    }

    const search = normalizarTexto(q);

    if (search) {
      where[Op.or] = [
        { nombre: { [Op.like]: `%${search}%` } },
        { apellido: { [Op.like]: `%${search}%` } },
        { dni: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { telefono: { [Op.like]: `%${search}%` } }
      ];
    }

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 20, 1), 200);
    const offset = (pageNumber - 1) * limitNumber;

    const allowedOrderFields = [
      'id',
      'nombre',
      'apellido',
      'dni',
      'estado',
      'fecha_inicio',
      'ultima_asistencia',
      'created_at',
      'updated_at'
    ];

    const safeOrderBy = allowedOrderFields.includes(orderBy)
      ? orderBy
      : 'created_at';

    const safeOrderDirection =
      String(orderDirection).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { rows, count } = await AlumnosModel.findAndCountAll({
      where,
      limit: limitNumber,
      offset,
      order: [[safeOrderBy, safeOrderDirection]]
    });

    const data = await Promise.all(
      rows.map((alumno) => construirAlumnoRespuesta(alumno))
    );

    return res.status(200).json({
      ok: true,
      message: 'Alumnos obtenidos correctamente.',
      estadisticas: {
        total: totalSede,
        activos: activosSede,
        cant_anamnesis_permanente: 0,
        cant_morosos: 0
      },
      total: count,
      page: pageNumber,
      limit: limitNumber,
      total_pages: Math.ceil(count / limitNumber),
      data
    });
  } catch (error) {
    console.error('Error OBR_Alumnos_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener los alumnos.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Obtiene un alumno por ID.
 */
export const OBR_AlumnoPorDni_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaAlumnos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar alumnos.'
      });
    }

    console.log('params:', req.params);

    const { dni } = req.params;

    console.log('dni:', dni);

    const result = await buscarAlumnoPorDniConPermiso(dni, req.user);

    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    const data = await construirAlumnoRespuesta(result.alumno);

    return res.status(200).json({
      ok: true,
      message: 'Alumno obtenido correctamente.',
      data
    });
  } catch (error) {
    console.error('Error OBR_AlumnoPorDni_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener el alumno.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Obtiene perfil del alumno autenticado desde el portal/app.
 */
export const OBR_AlumnoPerfil_CTS = async (req, res) => {
  try {
    const alumnoId = req.alumno?.id || req.alumno?.alumno_id;

    const alumno = await AlumnosModel.findByPk(alumnoId);

    if (!alumno) {
      return res.status(404).json({
        ok: false,
        message: 'Alumno autenticado no encontrado.'
      });
    }

    const data = await construirAlumnoRespuesta(alumno);

    return res.status(200).json({
      ok: true,
      message: 'Perfil del alumno obtenido correctamente.',
      data
    });
  } catch (error) {
    console.error('Error OBR_AlumnoPerfil_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener el perfil del alumno.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Crea un alumno desde el panel interno.
 */
export const CR_Alumnos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionAlumnos(req.user)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para crear alumnos.'
      });
    }

    const payload = buildAlumnoPayloadCreate(req.body, req.user);
    const errores = validarPayloadAlumno(payload, 'create');

    if (!usuarioPuedeOperarSede(req.user, payload.sede_id)) {
      errores.push('No tiene acceso a la sede indicada.');
    }

    if (errores.length > 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para crear el alumno.',
        errors: errores
      });
    }

    const sede = await buscarSedeActiva(payload.sede_id);

    if (!sede) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'La sede indicada no existe o está inactiva.'
      });
    }

    const existeDni = await verificarDniDuplicado(payload.dni);

    if (existeDni) {
      await transaction.rollback();

      return res.status(409).json({
        ok: false,
        message: 'Ya existe un alumno con ese DNI.'
      });
    }

    if (payload.usuario_app_id) {
      const usuarioApp = await UsuariosModel.findByPk(payload.usuario_app_id);

      if (!usuarioApp) {
        await transaction.rollback();

        return res.status(400).json({
          ok: false,
          message: 'El usuario app indicado no existe.'
        });
      }

      const usuarioAsignado = await verificarUsuarioAppDisponible(
        payload.usuario_app_id
      );

      if (usuarioAsignado) {
        await transaction.rollback();

        return res.status(409).json({
          ok: false,
          message: 'El usuario app indicado ya está asociado a otro alumno.'
        });
      }
    }

    if (payload.estado === 'activo') {
      payload.usuario_validacion_id =
        req.user?.id || req.user?.usuario_id || null;
    }

    const nuevoAlumno = await AlumnosModel.create(payload, {
      transaction
    });

    const data = await construirAlumnoRespuesta(nuevoAlumno, transaction);

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      message: 'Alumno creado correctamente.',
      data
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error CR_Alumnos_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al crear el alumno.'
    });
  }
};

export const CR_Alumnos_Publico_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const contactosEmergencia = normalizarPrincipalContactosEmergenciaPublico(
      normalizarContactosEmergenciaPublico(req.body)
    );

    const {
      nombre,
      apellido,
      dni,
      fecha_nacimiento,
      telefono,
      email,
      domicilio,
      sede_id,
      plan_id,
      fecha_inicio
    } = req.body;

    if (
      !nombre ||
      !apellido ||
      !dni ||
      !sede_id ||
      !plan_id
    ) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Faltan datos obligatorios para el registro.'
      });
    }

    const erroresContacto = validarContactosEmergenciaPublico(
      contactosEmergencia
    );

    if (erroresContacto.length > 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para el contacto de emergencia.',
        errors: erroresContacto
      });
    }

    if (fecha_inicio && !esFechaDateOnlyValida(fecha_inicio)) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'La fecha de inicio debe tener formato YYYY-MM-DD.'
      });
    }

    const fechaInicioNormalizada = fecha_inicio || obtenerFechaActualDateOnly();

    const sede = await SedesModel.findOne({
      where: {
        id: Number(sede_id),
        activo: 1
      },
      transaction
    });

    if (!sede) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'La sede indicada no existe o está inactiva.'
      });
    }

    const plan = await buscarPlanActivo(Number(plan_id), transaction);

    if (!plan) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'El plan indicado no existe o está inactivo.'
      });
    }

    if (!plan.duracion_dias || Number(plan.duracion_dias) <= 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'El plan indicado no tiene una duración válida.'
      });
    }

    const existeDni = await verificarDniDuplicado(dni);

    if (existeDni) {
      await transaction.rollback();

      return res.status(409).json({
        ok: false,
        message: 'Ya existe un alumno registrado con ese DNI.'
      });
    }

    const payloadAlumno = buildAlumnoPayloadCreate(
      {
        nombre,
        apellido,
        dni,
        fecha_nacimiento,
        telefono,
        email,
        domicilio,
        sede_id,
        fecha_inicio: fechaInicioNormalizada,
        origen_registro: 'externo'
      },
      null
    );

    payloadAlumno.estado = 'activo';
    payloadAlumno.usuario_validacion_id = null;

    const erroresAlumno = validarPayloadAlumno(payloadAlumno, 'create');

    if (erroresAlumno.length > 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para el registro.',
        errors: erroresAlumno
      });
    }

    const nuevoAlumno = await AlumnosModel.create(payloadAlumno, {
      transaction
    });

    const precioVigente = await buscarPrecioVigentePlan({
      planId: Number(plan.id),
      sedeId: Number(sede.id),
      fechaConsulta: fechaInicioNormalizada,
      transaction
    });

    const contactosCreados = await AlumnosContactosEmergenciaModel.bulkCreate(
      contactosEmergencia.map((contacto) => ({
        alumno_id: nuevoAlumno.id,
        ...contacto,
      })),
      {
        transaction
      }
    );

    const payloadMembresia = construirPayloadMembresiaPublica({
      alumnoId: nuevoAlumno.id,
      plan,
      sedeId: Number(sede.id),
      fechaInicio: fechaInicioNormalizada,
      precioVigente
    });

    const nuevaMembresia = await AlumnosMembresiasModel.create(
      payloadMembresia,
      {
        transaction
      }
    );

    const data = await construirAlumnoRespuesta(nuevoAlumno, transaction);

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      message: '¡Te registraste correctamente!',
      data,
      contactos_emergencia: contactosCreados,
      membresia: nuevaMembresia
    });

  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }

    console.error('Error en registro público:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al procesar el registro.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Actualiza datos principales de un alumno.
 */
export const UR_Alumnos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionAlumnos(req.user)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para actualizar alumnos.'
      });
    }

    const { id } = req.params;

    const result = await buscarAlumnoPorIdConPermiso(id, req.user);

    if (!result.ok) {
      await transaction.rollback();

      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    const alumno = result.alumno;
    const payload = buildAlumnoPayloadUpdate(req.body);
    const errores = validarPayloadAlumno(payload, 'update');

    if (payload.sede_id && !usuarioPuedeOperarSede(req.user, payload.sede_id)) {
      errores.push('No tiene acceso a la nueva sede indicada.');
    }

    if (errores.length > 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para actualizar el alumno.',
        errors: errores
      });
    }

    if (payload.sede_id) {
      const sede = await buscarSedeActiva(payload.sede_id);

      if (!sede) {
        await transaction.rollback();

        return res.status(400).json({
          ok: false,
          message: 'La sede indicada no existe o está inactiva.'
        });
      }
    }

    if (payload.dni) {
      const existeDni = await verificarDniDuplicado(payload.dni, id);

      if (existeDni) {
        await transaction.rollback();

        return res.status(409).json({
          ok: false,
          message: 'Ya existe otro alumno con ese DNI.'
        });
      }
    }

    await alumno.update(payload, {
      transaction
    });

    await transaction.commit();

    const data = await construirAlumnoRespuesta(alumno);

    return res.status(200).json({
      ok: true,
      message: 'Alumno actualizado correctamente.',
      data
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error UR_Alumnos_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al actualizar el alumno.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Cambia estado operativo de un alumno.
 */
export const UR_EstadoAlumnos_CTS = async (req, res) => {
  try {
    if (!validarRolOperacionAlumnos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para cambiar el estado del alumno.'
      });
    }

    const { id } = req.params;
    const estado = normalizarTexto(req.body.estado);

    if (!ESTADOS_ALUMNO_VALIDOS.includes(estado)) {
      return res.status(400).json({
        ok: false,
        message: 'Estado de alumno inválido.',
        estados_validos: ESTADOS_ALUMNO_VALIDOS
      });
    }

    const result = await buscarAlumnoPorIdConPermiso(id, req.user);

    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    const payload = {
      estado
    };

    if (estado === 'activo') {
      payload.usuario_validacion_id =
        req.user?.id || req.user?.usuario_id || null;
      payload.fecha_baja = null;
      payload.motivo_baja = null;
    }

    await result.alumno.update(payload);

    const data = await construirAlumnoRespuesta(result.alumno);

    return res.status(200).json({
      ok: true,
      message: 'Estado del alumno actualizado correctamente.',
      data
    });
  } catch (error) {
    console.error('Error UR_EstadoAlumnos_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al cambiar el estado del alumno.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Registra baja de un alumno.
 */
export const UR_BajaAlumnos_CTS = async (req, res) => {
  try {
    if (!validarRolOperacionAlumnos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para registrar bajas.'
      });
    }

    const { id } = req.params;

    const result = await buscarAlumnoPorIdConPermiso(id, req.user);

    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    await result.alumno.update({
      estado: 'baja',
      fecha_baja: req.body.fecha_baja || new Date(),
      motivo_baja: normalizarTexto(req.body.motivo_baja)
    });

    const data = await construirAlumnoRespuesta(result.alumno);

    return res.status(200).json({
      ok: true,
      message: 'Baja del alumno registrada correctamente.',
      data
    });
  } catch (error) {
    console.error('Error UR_BajaAlumnos_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al registrar la baja del alumno.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Congela membresía/estado operativo del alumno.
 */
export const UR_CongelarAlumnos_CTS = async (req, res) => {
  try {
    if (!validarRolOperacionAlumnos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para congelar alumnos.'
      });
    }

    const { id } = req.params;

    const result = await buscarAlumnoPorIdConPermiso(id, req.user);

    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    await result.alumno.update({
      estado: 'congelado',
      fecha_congelamiento_desde:
        req.body.fecha_congelamiento_desde || new Date(),
      fecha_congelamiento_hasta: normalizarFecha(
        req.body.fecha_congelamiento_hasta
      ),
      motivo_congelamiento: normalizarTexto(req.body.motivo_congelamiento)
    });

    const data = await construirAlumnoRespuesta(result.alumno);

    return res.status(200).json({
      ok: true,
      message: 'Alumno congelado correctamente.',
      data
    });
  } catch (error) {
    console.error('Error UR_CongelarAlumnos_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al congelar el alumno.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Reactiva un alumno desde baja, inactivo o congelado.
 */
export const UR_ReactivarAlumnos_CTS = async (req, res) => {
  try {
    if (!validarRolOperacionAlumnos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para reactivar alumnos.'
      });
    }

    const { id } = req.params;

    const result = await buscarAlumnoPorIdConPermiso(id, req.user);

    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    await result.alumno.update({
      estado: req.body.estado || 'activo',
      usuario_validacion_id: req.user?.id || req.user?.usuario_id || null,
      fecha_baja: null,
      motivo_baja: null,
      fecha_congelamiento_desde: null,
      fecha_congelamiento_hasta: null,
      motivo_congelamiento: null
    });

    const data = await construirAlumnoRespuesta(result.alumno);

    return res.status(200).json({
      ok: true,
      message: 'Alumno reactivado correctamente.',
      data
    });
  } catch (error) {
    console.error('Error UR_ReactivarAlumnos_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al reactivar el alumno.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Habilita acceso web/app para un alumno creando su usuario ALUMNO.
 */
export const UR_HabilitarAccesoAlumno_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionAlumnos(req.user)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para habilitar acceso de alumnos.'
      });
    }

    const { id } = req.params;

    const result = await buscarAlumnoPorIdConPermiso(id, req.user);

    if (!result.ok) {
      await transaction.rollback();

      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    const alumno = result.alumno;
    const alumnoPlano =
      typeof alumno.toJSON === 'function' ? alumno.toJSON() : alumno;

    if (alumnoPlano.usuario_app_id) {
      await transaction.rollback();

      return res.status(409).json({
        ok: false,
        message: 'El alumno ya tiene un usuario app/web asociado.'
      });
    }

    const rolAlumno = await buscarRolAlumno();

    if (!rolAlumno) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'No existe un rol ALUMNO activo para habilitar acceso.'
      });
    }

    const email = normalizarEmail(req.body.email || alumnoPlano.email);
    const telefono = normalizarTelefono(
      req.body.telefono || alumnoPlano.telefono
    );

    if (!email && !telefono) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'El alumno debe tener email o teléfono para habilitar acceso.'
      });
    }

    const password = normalizarTexto(req.body.password);

    if (!password || password.length < 6) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Debe indicar una contraseña de al menos 6 caracteres.'
      });
    }

    const usuarioDuplicado = await verificarUsuarioLoginDuplicado({
      email,
      telefono
    });

    if (usuarioDuplicado) {
      await transaction.rollback();

      return res.status(409).json({
        ok: false,
        message: 'Ya existe un usuario con ese email o teléfono.'
      });
    }

    const passwordHash = await hashPassword(password);

    const usuarioApp = await UsuariosModel.create(
      {
        rol_id: rolAlumno.id,
        sede_principal_id: alumnoPlano.sede_id,
        nombre: alumnoPlano.nombre,
        apellido: alumnoPlano.apellido,
        email,
        telefono,
        password_hash: passwordHash,
        estado: 'activo'
      },
      {
        transaction
      }
    );

    await alumno.update(
      {
        usuario_app_id: usuarioApp.id,
        email: email || alumnoPlano.email,
        telefono: telefono || alumnoPlano.telefono
      },
      {
        transaction
      }
    );

    await transaction.commit();

    const data = await construirAlumnoRespuesta(alumno);

    return res.status(200).json({
      ok: true,
      message: 'Acceso web/app del alumno habilitado correctamente.',
      data
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error UR_HabilitarAccesoAlumno_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al habilitar acceso del alumno.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Marca alumno como inactivo sin eliminarlo físicamente.
 */
export const DR_Alumnos_CTS = async (req, res) => {
  try {
    if (!validarRolOperacionAlumnos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para desactivar alumnos.'
      });
    }

    const { id } = req.params;

    const result = await buscarAlumnoPorIdConPermiso(id, req.user);

    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    await result.alumno.update({
      estado: 'inactivo'
    });

    const data = await construirAlumnoRespuesta(result.alumno);

    return res.status(200).json({
      ok: true,
      message: 'Alumno marcado como inactivo correctamente.',
      data
    });
  } catch (error) {
    console.error('Error DR_Alumnos_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al desactivar el alumno.'
    });
  }
};
