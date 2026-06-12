/*
 * Benjamin Orellana - 2026/05/26 - Controlador Sequelize para anamnesis de alumnos PREMIUM.
 */

import { Op } from 'sequelize';

import db from '../../DataBase/db.js';
import AlumnosModel from '../../Models/Alumno/MD_TB_Alumnos.js';
import AlumnosAnamnesisModel from '../../Models/Alumno/MD_TB_AlumnosAnamnesis.js';
import UsuariosModel from '../../Models/Usuario/MD_TB_Usuarios.js';
import AlumnosAnamnesisHistorialModel from '../../Models/Alumno/MD_TB_AlumnosAnamnesisHistorial.js';

const ROLES_GLOBALES = ['SUPER_ADMIN', 'DIRECCION'];

const ROLES_OPERATIVOS_ALUMNOS = [
  'SUPER_ADMIN',
  'DIRECCION',
  'FRONT_COMERCIAL',
  'COORD_SEDE'
];

const ROLES_LECTURA_ANAMNESIS = [
  'SUPER_ADMIN',
  'DIRECCION',
  'FRONT_COMERCIAL',
  'COORD_SEDE',
  'PROFESOR'
];

const ORIGENES_CARGA_VALIDOS = ['alumno', 'profesor', 'administracion'];

const NIVELES_CONDICION_VALIDOS = [
  'muy_bajo',
  'bajo',
  'medio',
  'alto',
  'muy_alto'
];

const ESTADOS_REVISION_VALIDOS = ['pendiente', 'revisada', 'requiere_atencion'];

const normalizarTexto = (value) => {
  if (value === undefined || value === null) return null;

  const texto = String(value).trim();

  return texto.length > 0 ? texto : null;
};

const normalizarEnum = (value) => {
  const texto = normalizarTexto(value);

  return texto ? texto.toLowerCase() : null;
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

const usuarioPuedeOperarSede = (user, sedeId) => {
  // 1. Admin puede con todo
  if (usuarioEsGlobal(user)) return true;
  
  // 2. Si el alumno NO tiene sede (null) → permitir
  if (!sedeId) return true;
  
  // 3. Si tiene sede, solo permitir si es la misma que la del usuario
  const sedesPermitidas = obtenerSedesPermitidasUsuario(user);
  
  return sedesPermitidas.includes(Number(sedeId));
};

const validarRolOperacionAlumnos = (user) => {
  return ROLES_OPERATIVOS_ALUMNOS.includes(user?.rol_codigo);
};

const validarRolLecturaAnamnesis = (user) => {
  return ROLES_LECTURA_ANAMNESIS.includes(user?.rol_codigo);
};

const eliminarPasswordHash = (usuario = {}) => {
  if (!usuario) return null;

  const usuarioPlano =
    typeof usuario.toJSON === 'function' ? usuario.toJSON() : { ...usuario };

  delete usuarioPlano.password_hash;

  return usuarioPlano;
};

const buscarAlumnoConPermiso = async (alumnoId, user) => {
  const alumno = await AlumnosModel.findByPk(alumnoId);

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

const buscarAnamnesisConPermiso = async (anamnesisId, user) => {
  const anamnesis = await AlumnosAnamnesisModel.findByPk(anamnesisId);

  if (!anamnesis) {
    return {
      ok: false,
      status: 404,
      message: 'Anamnesis no encontrada.'
    };
  }

  const anamnesisPlano =
    typeof anamnesis.toJSON === 'function' ? anamnesis.toJSON() : anamnesis;

  const alumnoResult = await buscarAlumnoConPermiso(
    anamnesisPlano.alumno_id,
    user
  );

  if (!alumnoResult.ok) {
    return alumnoResult;
  }

  return {
    ok: true,
    anamnesis,
    alumno: alumnoResult.alumno
  };
};

const buscarAnamnesisPropia = async (anamnesisId, alumnoId) => {
  const anamnesis = await AlumnosAnamnesisModel.findOne({
    where: {
      id: anamnesisId,
      alumno_id: alumnoId
    }
  });

  if (!anamnesis) {
    return {
      ok: false,
      status: 404,
      message: 'Anamnesis no encontrada.'
    };
  }

  return {
    ok: true,
    anamnesis
  };
};

const construirAnamnesisRespuesta = async (anamnesis) => {
  if (!anamnesis) return null;

  const item =
    typeof anamnesis.toJSON === 'function' ? anamnesis.toJSON() : anamnesis;

  const [alumno, usuarioRegistro] = await Promise.all([
    item.alumno_id ? AlumnosModel.findByPk(item.alumno_id) : null,
    item.usuario_registro_id
      ? UsuariosModel.findByPk(item.usuario_registro_id)
      : null
  ]);

  return {
    ...item,
    alumno: alumno
      ? typeof alumno.toJSON === 'function'
        ? alumno.toJSON()
        : alumno
      : null,
    usuario_registro: usuarioRegistro
      ? eliminarPasswordHash(usuarioRegistro)
      : null
  };
};

const archivarAnamnesis = async (
  anamnesis,
  { usuarioModificacionId = null, origenModificacion = 'administracion', transaction }
) => {
  const snap =
    typeof anamnesis.toJSON === 'function' ? anamnesis.toJSON() : { ...anamnesis };

  await AlumnosAnamnesisHistorialModel.create(
    {
      anamnesis_id:              snap.id,
      alumno_id:                 snap.alumno_id,
      usuario_modificacion_id:   usuarioModificacionId,
      origen_modificacion:       origenModificacion,
      origen_carga:              snap.origen_carga,
      objetivo_principal:        snap.objetivo_principal,
      experiencia_previa:        snap.experiencia_previa,
      lesiones_actuales:         snap.lesiones_actuales,
      lesiones_pasadas:          snap.lesiones_pasadas,
      cirugias:                  snap.cirugias,
      dolores_frecuentes:        snap.dolores_frecuentes,
      enfermedades_relevantes:   snap.enfermedades_relevantes,
      medicacion:                snap.medicacion,
      actividad_fisica_actual:   snap.actividad_fisica_actual,
      disponibilidad_semanal:    snap.disponibilidad_semanal,
      nivel_condicion_fisica:    snap.nivel_condicion_fisica,
      observaciones_adicionales: snap.observaciones_adicionales,
      observaciones_profesor:    snap.observaciones_profesor,
      declara_aptitud:           snap.declara_aptitud,
      acepta_responsabilidad:    snap.acepta_responsabilidad,
      acepta_terminos_salud:     snap.acepta_terminos_salud,
      fecha_aceptacion:          snap.fecha_aceptacion,
      estado_revision:           snap.estado_revision,
      original_created_at:       snap.created_at,
      original_updated_at:       snap.updated_at,
      archivado_at:              new Date()
    },
    { transaction }
  );
};

const setIfPresent = (payload, body, key, normalizer = normalizarTexto) => {
  if (Object.prototype.hasOwnProperty.call(body, key)) {
    payload[key] = normalizer(body[key]);
  }
};

const buildAnamnesisPayload = ({
  body = {},
  modo = 'create',
  origenCargaDefault = 'administracion',
  usuarioRegistroId = null
}) => {
  const payload = {};

  if (modo === 'create') {
    payload.usuario_registro_id = usuarioRegistroId;
    payload.origen_carga =
      normalizarEnum(body.origen_carga) || origenCargaDefault;
  } else {
    setIfPresent(payload, body, 'origen_carga', normalizarEnum);
  }

  setIfPresent(payload, body, 'objetivo_principal', normalizarTexto);
  setIfPresent(payload, body, 'experiencia_previa', normalizarTexto);
  setIfPresent(payload, body, 'lesiones_actuales', normalizarTexto);
  setIfPresent(payload, body, 'lesiones_pasadas', normalizarTexto);
  setIfPresent(payload, body, 'cirugias', normalizarTexto);
  setIfPresent(payload, body, 'dolores_frecuentes', normalizarTexto);
  setIfPresent(payload, body, 'enfermedades_relevantes', normalizarTexto);
  setIfPresent(payload, body, 'medicacion', normalizarTexto);
  setIfPresent(payload, body, 'actividad_fisica_actual', normalizarTexto);
  setIfPresent(payload, body, 'disponibilidad_semanal', normalizarTexto);
  setIfPresent(payload, body, 'nivel_condicion_fisica', normalizarEnum);
  setIfPresent(payload, body, 'observaciones_adicionales', normalizarTexto);
  setIfPresent(payload, body, 'observaciones_profesor', normalizarTexto);

  if (Object.prototype.hasOwnProperty.call(body, 'declara_aptitud')) {
    payload.declara_aptitud = normalizarTinyint(body.declara_aptitud, 0);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'acepta_responsabilidad')) {
    payload.acepta_responsabilidad = normalizarTinyint(
      body.acepta_responsabilidad,
      0
    );
  }

  if (Object.prototype.hasOwnProperty.call(body, 'acepta_terminos_salud')) {
    payload.acepta_terminos_salud = normalizarTinyint(
      body.acepta_terminos_salud,
      0
    );
  }

  if (modo === 'create') {
    payload.estado_revision =
      normalizarEnum(body.estado_revision) || 'pendiente';

    if (
      Number(payload.declara_aptitud) === 1 ||
      Number(payload.acepta_responsabilidad) === 1 ||
      Number(payload.acepta_terminos_salud) === 1
    ) {
      payload.fecha_aceptacion = body.fecha_aceptacion || new Date();
    }
  } else {
    setIfPresent(payload, body, 'estado_revision', normalizarEnum);

    if (
      Object.prototype.hasOwnProperty.call(body, 'fecha_aceptacion') &&
      body.fecha_aceptacion
    ) {
      payload.fecha_aceptacion = body.fecha_aceptacion;
    }

    if (
      (payload.declara_aptitud === 1 ||
        payload.acepta_responsabilidad === 1 ||
        payload.acepta_terminos_salud === 1) &&
      !payload.fecha_aceptacion
    ) {
      payload.fecha_aceptacion = new Date();
    }
  }

  return payload;
};

const validarPayloadAnamnesis = (payload = {}, modo = 'create') => {
  const errores = [];

  if (
    payload.origen_carga &&
    !ORIGENES_CARGA_VALIDOS.includes(payload.origen_carga)
  ) {
    errores.push('El origen de carga indicado no es válido.');
  }

  if (
    payload.nivel_condicion_fisica &&
    !NIVELES_CONDICION_VALIDOS.includes(payload.nivel_condicion_fisica)
  ) {
    errores.push('El nivel de condición física indicado no es válido.');
  }

  if (
    payload.estado_revision &&
    !ESTADOS_REVISION_VALIDOS.includes(payload.estado_revision)
  ) {
    errores.push('El estado de revisión indicado no es válido.');
  }

  if (
    payload.disponibilidad_semanal &&
    payload.disponibilidad_semanal.length > 255
  ) {
    errores.push(
      'La disponibilidad semanal no puede superar los 255 caracteres.'
    );
  }

  return errores;
};

const aplicarScopeSedesAnamnesis = async (
  where = {},
  user = null,
  alumnoIdQuery = null
) => {
  if (alumnoIdQuery) {
    const alumnoResult = await buscarAlumnoConPermiso(alumnoIdQuery, user);

    if (!alumnoResult.ok) {
      return alumnoResult;
    }

    where.alumno_id = Number(alumnoIdQuery);

    return {
      ok: true,
      where
    };
  }

  if (usuarioEsGlobal(user)) {
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
      message: 'El usuario no tiene sedes asignadas.'
    };
  }

  const alumnos = await AlumnosModel.findAll({
    where: {
      sede_id: {
        [Op.in]: sedesPermitidas
      }
    },
    attributes: ['id']
  });

  const alumnosIds = alumnos.map((alumno) => alumno.id);

  where.alumno_id = {
    [Op.in]: alumnosIds.length ? alumnosIds : [0]
  };

  return {
    ok: true,
    where
  };
};

/*
 * Benjamin Orellana - 2026/05/26 - Lista anamnesis con filtros, búsqueda y paginación.
 */
export const OBR_AlumnosAnamnesis_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaAnamnesis(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar anamnesis.'
      });
    }

    const {
      alumno_id,
      q,
      origen_carga,
      estado_revision,
      nivel_condicion_fisica,
      page = 1,
      limit = 20,
      orderBy = 'created_at',
      orderDirection = 'DESC'
    } = req.query;

    const where = {};

    const scope = await aplicarScopeSedesAnamnesis(where, req.user, alumno_id);

    if (!scope.ok) {
      return res.status(scope.status).json({
        ok: false,
        message: scope.message
      });
    }

    const origenCargaNormalizado = normalizarEnum(origen_carga);
    const estadoRevisionNormalizado = normalizarEnum(estado_revision);
    const nivelCondicionNormalizado = normalizarEnum(nivel_condicion_fisica);

    if (origenCargaNormalizado) {
      if (!ORIGENES_CARGA_VALIDOS.includes(origenCargaNormalizado)) {
        return res.status(400).json({
          ok: false,
          message: 'Origen de carga inválido.',
          origenes_validos: ORIGENES_CARGA_VALIDOS
        });
      }

      where.origen_carga = origenCargaNormalizado;
    }

    if (estadoRevisionNormalizado) {
      if (!ESTADOS_REVISION_VALIDOS.includes(estadoRevisionNormalizado)) {
        return res.status(400).json({
          ok: false,
          message: 'Estado de revisión inválido.',
          estados_validos: ESTADOS_REVISION_VALIDOS
        });
      }

      where.estado_revision = estadoRevisionNormalizado;
    }

    if (nivelCondicionNormalizado) {
      if (!NIVELES_CONDICION_VALIDOS.includes(nivelCondicionNormalizado)) {
        return res.status(400).json({
          ok: false,
          message: 'Nivel de condición física inválido.',
          niveles_validos: NIVELES_CONDICION_VALIDOS
        });
      }

      where.nivel_condicion_fisica = nivelCondicionNormalizado;
    }

    const search = normalizarTexto(q);

    if (search) {
      where[Op.or] = [
        {
          objetivo_principal: {
            [Op.like]: `%${search}%`
          }
        },
        {
          experiencia_previa: {
            [Op.like]: `%${search}%`
          }
        },
        {
          lesiones_actuales: {
            [Op.like]: `%${search}%`
          }
        },
        {
          lesiones_pasadas: {
            [Op.like]: `%${search}%`
          }
        },
        {
          enfermedades_relevantes: {
            [Op.like]: `%${search}%`
          }
        },
        {
          observaciones_adicionales: {
            [Op.like]: `%${search}%`
          }
        },
        {
          observaciones_profesor: {
            [Op.like]: `%${search}%`
          }
        }
      ];
    }

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 20, 1), 200);
    const offset = (pageNumber - 1) * limitNumber;

    const allowedOrderFields = [
      'id',
      'alumno_id',
      'origen_carga',
      'nivel_condicion_fisica',
      'estado_revision',
      'fecha_aceptacion',
      'created_at',
      'updated_at'
    ];

    const safeOrderBy = allowedOrderFields.includes(orderBy)
      ? orderBy
      : 'created_at';

    const safeOrderDirection =
      String(orderDirection).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { rows, count } = await AlumnosAnamnesisModel.findAndCountAll({
      where,
      limit: limitNumber,
      offset,
      order: [[safeOrderBy, safeOrderDirection]]
    });

    const data = await Promise.all(
      rows.map((anamnesis) => construirAnamnesisRespuesta(anamnesis))
    );

    return res.status(200).json({
      ok: true,
      message: 'Anamnesis obtenidas correctamente.',
      total: count,
      page: pageNumber,
      limit: limitNumber,
      total_pages: Math.ceil(count / limitNumber),
      data
    });
  } catch (error) {
    console.error('Error OBR_AlumnosAnamnesis_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener las anamnesis.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Lista anamnesis de un alumno específico.
 */
export const OBR_AnamnesisPorAlumno_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaAnamnesis(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar anamnesis.'
      });
    }

    const { alumno_id } = req.params;

    const alumnoResult = await buscarAlumnoConPermiso(alumno_id, req.user);

    if (!alumnoResult.ok) {
      return res.status(alumnoResult.status).json({
        ok: false,
        message: alumnoResult.message
      });
    }

    const anamnesis = await AlumnosAnamnesisModel.findAll({
      where: {
        alumno_id: Number(alumno_id)
      },
      order: [['created_at', 'DESC']]
    });

    const data = await Promise.all(
      anamnesis.map((item) => construirAnamnesisRespuesta(item))
    );

    return res.status(200).json({
      ok: true,
      message: 'Anamnesis del alumno obtenidas correctamente.',
      data
    });
  } catch (error) {
    console.error('Error OBR_AnamnesisPorAlumno_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener las anamnesis del alumno.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Obtiene la última anamnesis de un alumno específico.
 */
export const OBR_AnamnesisActualPorAlumno_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaAnamnesis(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar anamnesis.'
      });
    }

    const { alumno_id } = req.params;

    const alumnoResult = await buscarAlumnoConPermiso(alumno_id, req.user);

    if (!alumnoResult.ok) {
      return res.status(alumnoResult.status).json({
        ok: false,
        message: alumnoResult.message
      });
    }

    const anamnesis = await AlumnosAnamnesisModel.findOne({
      where: {
        alumno_id: Number(alumno_id)
      },
      order: [['created_at', 'DESC']]
    });

    if (!anamnesis) {
      return res.status(404).json({
        ok: false,
        message: 'El alumno no tiene anamnesis cargada.'
      });
    }

    const data = await construirAnamnesisRespuesta(anamnesis);

    return res.status(200).json({
      ok: true,
      message: 'Anamnesis actual del alumno obtenida correctamente.',
      data
    });
  } catch (error) {
    console.error('Error OBR_AnamnesisActualPorAlumno_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener la anamnesis actual del alumno.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Obtiene una anamnesis por ID desde panel interno.
 */
export const OBR_AnamnesisPorId_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaAnamnesis(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar anamnesis.'
      });
    }

    const { id } = req.params;

    const result = await buscarAnamnesisConPermiso(id, req.user);

    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    const data = await construirAnamnesisRespuesta(result.anamnesis);

    return res.status(200).json({
      ok: true,
      message: 'Anamnesis obtenida correctamente.',
      data
    });
  } catch (error) {
    console.error('Error OBR_AnamnesisPorId_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener la anamnesis.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Lista anamnesis del alumno autenticado.
 */
export const OBR_MisAnamnesis_CTS = async (req, res) => {
  try {
    const alumnoId = req.alumno?.id || req.alumno?.alumno_id;

    const anamnesis = await AlumnosAnamnesisModel.findAll({
      where: {
        alumno_id: Number(alumnoId)
      },
      order: [['created_at', 'DESC']]
    });

    const data = await Promise.all(
      anamnesis.map((item) => construirAnamnesisRespuesta(item))
    );

    return res.status(200).json({
      ok: true,
      message: 'Mis anamnesis obtenidas correctamente.',
      data
    });
  } catch (error) {
    console.error('Error OBR_MisAnamnesis_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener mis anamnesis.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Obtiene la última anamnesis del alumno autenticado.
 */
export const OBR_MiAnamnesisActual_CTS = async (req, res) => {
  try {
    const alumnoId = req.alumno?.id || req.alumno?.alumno_id;

    const anamnesis = await AlumnosAnamnesisModel.findOne({
      where: {
        alumno_id: Number(alumnoId)
      },
      order: [['created_at', 'DESC']]
    });

    if (!anamnesis) {
      return res.status(404).json({
        ok: false,
        message: 'Todavía no tenés una anamnesis cargada.'
      });
    }

    const data = await construirAnamnesisRespuesta(anamnesis);

    return res.status(200).json({
      ok: true,
      message: 'Mi anamnesis actual obtenida correctamente.',
      data
    });
  } catch (error) {
    console.error('Error OBR_MiAnamnesisActual_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener mi anamnesis actual.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Crea anamnesis desde panel interno.
 */
export const CR_AlumnosAnamnesis_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionAlumnos(req.user)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para crear anamnesis.'
      });
    }

    const { alumno_id } = req.params;

    const alumnoResult = await buscarAlumnoConPermiso(alumno_id, req.user);

    if (!alumnoResult.ok) {
      await transaction.rollback();

      return res.status(alumnoResult.status).json({
        ok: false,
        message: alumnoResult.message
      });
    }

    const payload = buildAnamnesisPayload({
      body: req.body,
      modo: 'create',
      origenCargaDefault:
        req.user?.rol_codigo === 'PROFESOR' ? 'profesor' : 'administracion',
      usuarioRegistroId: req.user?.id || req.user?.usuario_id || null
    });

    const errores = validarPayloadAnamnesis(payload, 'create');

    if (errores.length > 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para crear la anamnesis.',
        errors: errores
      });
    }

    const nuevaAnamnesis = await AlumnosAnamnesisModel.create(
      {
        ...payload,
        alumno_id: Number(alumno_id)
      },
      {
        transaction
      }
    );

    await transaction.commit();

    const data = await construirAnamnesisRespuesta(nuevaAnamnesis);

    return res.status(201).json({
      ok: true,
      message: 'Anamnesis creada correctamente.',
      data
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error CR_AlumnosAnamnesis_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al crear la anamnesis.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Crea anamnesis desde portal alumno.
 */
export const CR_MiAnamnesis_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const alumnoId = req.alumno?.id || req.alumno?.alumno_id;

    const payload = buildAnamnesisPayload({
      body: req.body,
      modo: 'create',
      origenCargaDefault: 'alumno',
      usuarioRegistroId: req.user?.id || req.user?.usuario_id || null
    });

    payload.origen_carga = 'alumno';
    payload.estado_revision = 'pendiente';

    const errores = validarPayloadAnamnesis(payload, 'create');

    if (errores.length > 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para crear la anamnesis.',
        errors: errores
      });
    }

    const nuevaAnamnesis = await AlumnosAnamnesisModel.create(
      {
        ...payload,
        alumno_id: Number(alumnoId),
        observaciones_profesor: null
      },
      {
        transaction
      }
    );

    await transaction.commit();

    const data = await construirAnamnesisRespuesta(nuevaAnamnesis);

    return res.status(201).json({
      ok: true,
      message: 'Anamnesis creada correctamente.',
      data
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error CR_MiAnamnesis_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al crear mi anamnesis.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Actualiza anamnesis desde panel interno.
 */
export const UR_AlumnosAnamnesis_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (
      !validarRolOperacionAlumnos(req.user) &&
      req.user?.rol_codigo !== 'PROFESOR'
    ) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para actualizar anamnesis.'
      });
    }

    const { id } = req.params;

    const result = await buscarAnamnesisConPermiso(id, req.user);

    if (!result.ok) {
      await transaction.rollback();

      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    const payload = buildAnamnesisPayload({
      body: req.body,
      modo: 'update'
    });

    const errores = validarPayloadAnamnesis(payload, 'update');

    if (errores.length > 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para actualizar la anamnesis.',
        errors: errores
      });
    }

    // Archiva el estado actual ANTES de pisarlo.
    // Se omite si el cliente indicó que es solo un cambio de estado administrativo.
    if (!req.body.skip_archivo) {
      await archivarAnamnesis(result.anamnesis, {
        usuarioModificacionId: req.user?.id ?? null,
        origenModificacion:    normalizarEnum(req.body.origen_carga) || 'administracion',
        transaction
      });
    }

    await result.anamnesis.update(payload, { transaction });

    await transaction.commit();

    const data = await construirAnamnesisRespuesta(result.anamnesis);

    return res.status(200).json({
      ok: true,
      message: 'Anamnesis actualizada correctamente.',
      data
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error UR_AlumnosAnamnesis_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al actualizar la anamnesis.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Actualiza anamnesis propia desde portal alumno.
 */
export const UR_MiAnamnesis_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const alumnoId = req.alumno?.id || req.alumno?.alumno_id;
    const { id } = req.params;

    const result = await buscarAnamnesisPropia(id, alumnoId);

    if (!result.ok) {
      await transaction.rollback();

      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    const payload = buildAnamnesisPayload({
      body: req.body,
      modo: 'update'
    });

    delete payload.observaciones_profesor;
    delete payload.estado_revision;
    delete payload.origen_carga;

    const errores = validarPayloadAnamnesis(payload, 'update');

    if (errores.length > 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para actualizar la anamnesis.',
        errors: errores
      });
    }

    // El alumno siempre genera archivo: cualquier cambio suyo es contenido clínico.
    await archivarAnamnesis(result.anamnesis, {
      usuarioModificacionId: req.alumno?.usuario_app_id ?? null,
      origenModificacion:    'alumno',
      transaction
    });

    await result.anamnesis.update(
      { ...payload, estado_revision: 'pendiente' },
      { transaction }
    );

    await transaction.commit();

    const data = await construirAnamnesisRespuesta(result.anamnesis);

    return res.status(200).json({
      ok: true,
      message: 'Anamnesis actualizada correctamente.',
      data
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error UR_MiAnamnesis_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al actualizar mi anamnesis.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Revisa anamnesis desde panel interno/profesor.
 */
export const UR_RevisarAlumnosAnamnesis_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolLecturaAnamnesis(req.user)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para revisar anamnesis.'
      });
    }

    const { id } = req.params;

    const result = await buscarAnamnesisConPermiso(id, req.user);

    if (!result.ok) {
      await transaction.rollback();

      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    const estadoRevision =
      normalizarEnum(req.body.estado_revision) || 'revisada';

    if (!ESTADOS_REVISION_VALIDOS.includes(estadoRevision)) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Estado de revisión inválido.',
        estados_validos: ESTADOS_REVISION_VALIDOS
      });
    }

    // Archiva el estado actual ANTES de pisarlo.
    // Se omite si el cliente indicó que es solo un cambio de estado administrativo
    // (ej: marcar requiere_atencion sin modificar contenido clínico).
    if (!req.body.skip_archivo) {
      await archivarAnamnesis(result.anamnesis, {
        usuarioModificacionId: req.user?.id ?? null,
        origenModificacion:    req.user?.rol_codigo === 'PROFESOR' ? 'profesor' : 'administracion',
        transaction
      });
    }

    await result.anamnesis.update(
      {
        estado_revision: estadoRevision,
        observaciones_profesor:
          normalizarTexto(req.body.observaciones_profesor) ||
          result.anamnesis.observaciones_profesor
      },
      { transaction }
    );

    await transaction.commit();

    const data = await construirAnamnesisRespuesta(result.anamnesis);

    return res.status(200).json({
      ok: true,
      message: 'Anamnesis revisada correctamente.',
      data
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error UR_RevisarAlumnosAnamnesis_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al revisar la anamnesis.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Elimina anamnesis desde panel interno.
 */
export const DR_AlumnosAnamnesis_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionAlumnos(req.user)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para eliminar anamnesis.'
      });
    }

    const { id } = req.params;

    const result = await buscarAnamnesisConPermiso(id, req.user);

    if (!result.ok) {
      await transaction.rollback();

      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    await result.anamnesis.destroy({
      transaction
    });

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Anamnesis eliminada correctamente.'
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error DR_AlumnosAnamnesis_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al eliminar la anamnesis.'
    });
  }
};
