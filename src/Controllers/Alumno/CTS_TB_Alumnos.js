/*
 * Benjamin Orellana - 2026/05/26 - Controlador Sequelize para la gestión principal de alumnos PREMIUM.
 */

import { Op, QueryTypes } from 'sequelize';

import db from '../../DataBase/db.js';

import AlumnosModel from '../../Models/Alumno/MD_TB_Alumnos.js';
import AlumnosMembresiasModel from '../../Models/Alumno/MD_TB_AlumnosMembresias.js';
import AlumnosContactosEmergenciaModel from '../../Models/Alumno/MD_TB_AlumnosContactosEmergencia.js';
import AlumnosAnamnesisModel from '../../Models/Alumno/MD_TB_AlumnosAnamnesis.js';
import AlumnosLoginModel from '../../Models/Alumno/MD_TB_AlumnosLogin.js';
import PagosMensualidadesModel from '../../Models/Pago/MD_TB_PagosMensualidades.js';
import PlanesModel from '../../Models/Plan/MD_TB_Planes.js';
import PlanesPreciosModel from '../../Models/Plan/MD_TB_PlanesPrecios.js';
import SedesModel from '../../Models/Sede/MD_TB_Sedes.js';
import UsuariosModel from '../../Models/Usuario/MD_TB_Usuarios.js';
import { usuarioTieneAccesoTodasSedes } from '../../utils/usuariosAcceso.utils.js';
import UsuariosRolesModel from '../../Models/Usuario/MD_TB_UsuariosRoles.js';
import SistemaAuditoriaLogsModel from '../../Models/Sistema/MD_TB_SistemaAuditoriaLogs.js';
import { hashPassword } from '../../Security/auth.js';
import {
  capitalizarTexto,
  normalizarEmail,
  normalizarTelefono,
  normalizarDni
} from '../../utils/texto.utils.js';
import bcrypt from 'bcryptjs';

export const ESTADOS_ALUMNO_VALIDOS = [
  'pendiente_validacion',
  'activo',
  'pendiente_pago',
  'inactivo',
  'baja',
  'congelado',
  'prueba_clase_inicial'
];

// Benjamin Orellana - 2026/07/30 - Estados permitidos en la edición rápida.
// Baja y congelamiento conservan sus flujos específicos porque requieren
// fechas, motivos y coordinación con la membresía.
const ESTADOS_ALUMNO_EDICION_RAPIDA = [
  'pendiente_validacion',
  'activo',
  'pendiente_pago',
  'inactivo',
  'prueba_clase_inicial'
];

const ESTADOS_MEMBRESIA_QUE_BLOQUEAN_CAMBIO_SEDE = [
  'activa',
  'pendiente_pago',
  'congelada'
];

const ORIGENES_REGISTRO_VALIDOS = ['interno', 'externo', 'importado'];

// Sergio Manrique - 2026/08/01 - Umbrales fijos de seguimiento comercial
// (ver filtros "Alumnos con X días de inactividad" / "X meses de cuota
// vencida" pedidos por Coordinación / Gerencia Operativa-Comercial).
const DIAS_INACTIVIDAD_VALIDOS = [5, 15];
const MESES_CUOTA_VENCIDA_VALIDOS = [1, 3];

// Sergio Manrique - 2026/08/01 - "Cliente perdido" definido por el PM como
// alumno con cuota vencida de al menos 1 mes (mismo criterio que el filtro
// "1 mes de cuota vencida").
const MESES_CUOTA_VENCIDA_CLIENTE_PERDIDO = 1;

export const ROLES_OPERATIVOS_ALUMNOS = [
  'SUPER_ADMIN',
  'DIRECCION',
  'FRONT_COMERCIAL',
  'COORD_SEDE'
];

export const ROLES_LECTURA_ALUMNOS = [
  'SUPER_ADMIN',
  'DIRECCION',
  'FRONT_COMERCIAL',
  'COORD_SEDE',
  'PROFESOR'
];

// Benjamin Orellana - 2026/06/15 - Permite buscar alumnos por nombre completo, DNI, email o teléfono.
export const construirWhereBusquedaAlumno = (search) => {
  const terminos = String(search || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return {
    [Op.and]: terminos.map((termino) => {
      const condiciones = [
        { nombre: { [Op.like]: `%${termino}%` } },
        { apellido: { [Op.like]: `%${termino}%` } },
        { dni: { [Op.like]: `%${termino}%` } },
        { email: { [Op.like]: `%${termino}%` } },
        { telefono: { [Op.like]: `%${termino}%` } }
      ];

      if (/^\d+$/.test(termino)) {
        condiciones.push({ id: Number(termino) });
      }

      return {
        [Op.or]: condiciones
      };
    })
  };
};

/*
 * Benjamin Orellana - 2026/07/13 - Construye un NOT EXISTS seguro para
 * filtrar alumnos que todavía no poseen registros en una tabla relacionada.
 * Se utilizan los nombres reales declarados por Sequelize para evitar
 * acoplar el controlador a nombres físicos escritos manualmente.
 */
export const construirFiltroSinRelacionAlumno = (
  modeloRelacionado,
  aliasRelacionado
) => {
  const queryGenerator = db.getQueryInterface().queryGenerator;
  const tablaRelacionada = queryGenerator.quoteTable(
    modeloRelacionado.getTableName()
  );
  const aliasPrincipal = queryGenerator.quoteIdentifier(AlumnosModel.name);
  const aliasRelacion = queryGenerator.quoteIdentifier(aliasRelacionado);
  const columnaIdAlumno = queryGenerator.quoteIdentifier('id');
  const columnaAlumnoRelacion = queryGenerator.quoteIdentifier('alumno_id');

  return db.literal(`
    NOT EXISTS (
      SELECT 1
      FROM ${tablaRelacionada} AS ${aliasRelacion}
      WHERE ${aliasRelacion}.${columnaAlumnoRelacion} = ${aliasPrincipal}.${columnaIdAlumno}
    )
  `);
};


/*
 * Benjamin Orellana - 2026/07/30 - Identifica alumnos con al menos una
 * mensualidad vencida y saldo pendiente. Se usa EXISTS para contar personas,
 * no mensualidades, y para respetar el alcance de sede aplicado al alumno.
 */
const construirFiltroAlumnoMoroso = () => construirFiltroAlumnoCuotaVencida(0);

/*
 * Benjamin Orellana - 2026/08/01 - Generaliza construirFiltroAlumnoMoroso
 * para exigir una antigüedad mínima de vencimiento (en meses). Con
 * mesesMinimos = 0 se comporta igual que antes (cualquier vencimiento);
 * con 1 o 3 se usa para los filtros de seguimiento comercial "1 mes de
 * cuota vencida" / "3 meses de cuotas vencidas".
 */
export const construirFiltroAlumnoCuotaVencida = (mesesMinimos = 0) => {
  const meses = Math.max(Number(mesesMinimos) || 0, 0);
  const queryGenerator = db.getQueryInterface().queryGenerator;
  const tablaMensualidades = queryGenerator.quoteTable(
    PagosMensualidadesModel.getTableName()
  );
  const aliasPrincipal = queryGenerator.quoteIdentifier(AlumnosModel.name);
  const aliasMensualidad = queryGenerator.quoteIdentifier(
    `cuota_vencida_filtro_${meses}`
  );
  const columnaIdAlumno = queryGenerator.quoteIdentifier('id');
  const columnaAlumnoRelacion = queryGenerator.quoteIdentifier('alumno_id');
  const columnaSaldo = queryGenerator.quoteIdentifier('saldo');
  const columnaEstado = queryGenerator.quoteIdentifier('estado');
  const columnaFechaVencimiento =
    queryGenerator.quoteIdentifier('fecha_vencimiento');
  const limiteFecha =
    meses > 0 ? `DATE_SUB(CURDATE(), INTERVAL ${meses} MONTH)` : 'CURDATE()';

  return db.literal(`
    EXISTS (
      SELECT 1
      FROM ${tablaMensualidades} AS ${aliasMensualidad}
      WHERE ${aliasMensualidad}.${columnaAlumnoRelacion} = ${aliasPrincipal}.${columnaIdAlumno}
        AND ${aliasMensualidad}.${columnaSaldo} > 0
        AND ${aliasMensualidad}.${columnaEstado} <> 'anulada'
        AND ${aliasMensualidad}.${columnaEstado} IN ('vencida', 'pendiente', 'parcial')
        AND ${aliasMensualidad}.${columnaFechaVencimiento} < ${limiteFecha}
    )
  `);
};

/*
 * Sergio Manrique - 2026/08/01 - Identifica alumnos con más de `diasMinimos`
 * sin registrar una asistencia real ('asistio'). Reutiliza el mismo criterio
 * que OBRS_AlumnosInactivos_CTS (Controllers/Alumno/CTS_TB_AlumnosAsistencias.js):
 * si nunca asistió, se compara contra su fecha_inicio.
 */
export const construirFiltroAlumnoInactivo = (diasMinimos) => {
  const dias = Math.max(Number(diasMinimos) || 0, 0);
  const queryGenerator = db.getQueryInterface().queryGenerator;
  const tablaAsistencias = queryGenerator.quoteTable('alumnos_asistencias');
  const aliasPrincipal = queryGenerator.quoteIdentifier(AlumnosModel.name);
  const aliasAsistencia = queryGenerator.quoteIdentifier(
    `asistencia_inactividad_filtro_${dias}`
  );
  const columnaId = queryGenerator.quoteIdentifier('id');
  const columnaAlumnoRelacion = queryGenerator.quoteIdentifier('alumno_id');
  const columnaFecha = queryGenerator.quoteIdentifier('fecha');
  const columnaEstadoAsistencia = queryGenerator.quoteIdentifier('estado');
  const columnaFechaInicio = queryGenerator.quoteIdentifier('fecha_inicio');

  return db.literal(`
    COALESCE(
      DATEDIFF(CURDATE(), (
        SELECT MAX(${aliasAsistencia}.${columnaFecha})
        FROM ${tablaAsistencias} AS ${aliasAsistencia}
        WHERE ${aliasAsistencia}.${columnaAlumnoRelacion} = ${aliasPrincipal}.${columnaId}
          AND ${aliasAsistencia}.${columnaEstadoAsistencia} = 'asistio'
      )),
      DATEDIFF(CURDATE(), ${aliasPrincipal}.${columnaFechaInicio})
    ) > ${dias}
  `);
};

/*
 * Sergio Manrique - 2026/08/02 - Etiqueta legible de seguimiento comercial
 * ("Inactivo hace 5 días", "Cuota vencida hace 1 mes", "Pendiente de
 * validación") a partir de los días reales calculados. Compartida entre el
 * listado de Alumnos (sub-etiqueta bajo el estado) y Recaptaciones.
 */
export const calcularEtiquetaSeguimiento = (diasInactividad, diasCuotaVencida, estadoAlumno) => {
  if (diasCuotaVencida !== null) {
    if (diasCuotaVencida >= 30) {
      const meses = Math.floor(diasCuotaVencida / 30);
      return `Cuota vencida hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
    }

    return `Cuota vencida hace ${diasCuotaVencida} día${diasCuotaVencida === 1 ? '' : 's'}`;
  }

  if (diasInactividad !== null) {
    return `Inactivo hace ${diasInactividad} día${diasInactividad === 1 ? '' : 's'}`;
  }

  // Autoregistros sin asistencias ni cuotas: no hay días que calcular, pero
  // igual necesitan seguimiento comercial para validarlos y darles de alta.
  if (estadoAlumno === 'pendiente_validacion') {
    return 'Pendiente de validación';
  }

  return null;
};

/*
 * Sergio Manrique - 2026/08/02 - Trae, para un lote de alumno_id, los días
 * de inactividad y los días de cuota vencida más antigua impaga. Se hace en
 * 2 consultas batched (no una por alumno) para no golpear la DB por fila.
 * Compartida entre el listado de Alumnos y Recaptaciones.
 */
export const obtenerDiasSeguimientoPorAlumnos = async (alumnoIds) => {
  if (!alumnoIds.length) {
    return { asistencias: new Map(), cuotasVencidas: new Map() };
  }

  const [filasAsistencias, filasCuotas] = await Promise.all([
    db.query(
      `
      SELECT a.id AS alumno_id,
        COALESCE(DATEDIFF(CURDATE(), MAX(aa.fecha)), DATEDIFF(CURDATE(), a.fecha_inicio)) AS dias_inactividad
      FROM alumnos_alumnos a
      LEFT JOIN alumnos_asistencias aa
        ON aa.alumno_id = a.id AND aa.estado = 'asistio'
      WHERE a.id IN (:alumnoIds)
      GROUP BY a.id, a.fecha_inicio
      `,
      { replacements: { alumnoIds }, type: QueryTypes.SELECT }
    ),
    db.query(
      `
      SELECT alumno_id, DATEDIFF(CURDATE(), MIN(fecha_vencimiento)) AS dias_cuota_vencida
      FROM pagos_mensualidades
      WHERE alumno_id IN (:alumnoIds)
        AND saldo > 0
        AND estado <> 'anulada'
        AND estado IN ('vencida', 'pendiente', 'parcial')
        AND fecha_vencimiento < CURDATE()
      GROUP BY alumno_id
      `,
      { replacements: { alumnoIds }, type: QueryTypes.SELECT }
    )
  ]);

  // Number(null) da 0 en JS, no NaN: hay que preservar el NULL explícitamente
  // para no confundir "sin días calculables" con "inactivo hace 0 días".
  const asistencias = new Map(
    filasAsistencias.map((fila) => [
      Number(fila.alumno_id),
      fila.dias_inactividad === null ? null : Number(fila.dias_inactividad)
    ])
  );
  const cuotasVencidas = new Map(
    filasCuotas.map((fila) => [
      Number(fila.alumno_id),
      fila.dias_cuota_vencida === null ? null : Number(fila.dias_cuota_vencida)
    ])
  );

  return { asistencias, cuotasVencidas };
};

const normalizarTexto = (value) => {
  if (value === undefined || value === null) return null;

  const texto = String(value).trim();

  return texto.length > 0 ? texto : null;
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

export const normalizarTinyint = (value, defaultValue = 0) => {
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
  return usuarioTieneAccesoTodasSedes(user);
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

  if (!sedeId) return true;

  const sedesPermitidas = obtenerSedesPermitidasUsuario(user);

  return sedesPermitidas.includes(Number(sedeId));
};

const validarRolOperacionAlumnos = (user) => {
  return ROLES_OPERATIVOS_ALUMNOS.includes(user?.rol_codigo);
};

export const validarRolLecturaAlumnos = (user) => {
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

export const construirAlumnoRespuesta = async (alumno, transaction = null) => {
  if (!alumno) return null;

  const alumnoPlano =
    typeof alumno.toJSON === 'function' ? alumno.toJSON() : { ...alumno };

  const [
    sede,
    usuarioApp,
    usuarioAlta,
    usuarioValidacion,
    contactosEmergencia,
    membresiaVigente,
    ultimaMembresia,
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
      ? UsuariosModel.findByPk(alumnoPlano.usuario_validacion_id, {
          transaction
        })
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
    AlumnosMembresiasModel.findOne({
      where: {
        alumno_id: alumnoPlano.id,
        estado: {
          [Op.in]: ['activa', 'pendiente_pago', 'congelada']
        },
        fecha_inicio: {
          [Op.lte]: obtenerFechaActualDateOnly()
        },
        fecha_vencimiento: {
          [Op.gte]: obtenerFechaActualDateOnly()
        }
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
    // Conserva el contrato histórico de `membresias` y garantiza que
    // `membresia_actual` priorice siempre la cobertura que incluye hoy. Una
    // renovación futura solo se usa como respaldo si no existe una vigente.
    membresias: membresiaVigente,
    membresia_actual: membresiaVigente || ultimaMembresia,
    anamnesis
  };
};

/*
 * Benjamin Orellana - 2026/07/13 - Obtiene métricas reales de actividad para
 * la ficha individual. Se consulta alumnos_asistencias y no las reservas:
 * reservar consume una clase, pero la asistencia se contabiliza cuando existe
 * el registro efectivo correspondiente.
 */
const obtenerResumenActividadAlumno = async (alumnoId, transaction = null) => {
  const [resumen] = await db.query(
    `
      SELECT
        COUNT(
          CASE
            WHEN aa.estado = 'asistio'
              AND aa.fecha BETWEEN DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND CURDATE()
            THEN 1
          END
        ) AS asistencias_30_dias,
        MAX(
          CASE
            WHEN aa.estado = 'asistio' AND aa.fecha <= CURDATE()
            THEN aa.fecha
          END
        ) AS ultima_asistencia_real,
        CASE
          WHEN MAX(
            CASE
              WHEN aa.estado = 'asistio' AND aa.fecha <= CURDATE()
              THEN aa.fecha
            END
          ) IS NULL THEN NULL
          ELSE GREATEST(
            TIMESTAMPDIFF(
              DAY,
              MAX(
                CASE
                  WHEN aa.estado = 'asistio' AND aa.fecha <= CURDATE()
                  THEN aa.fecha
                END
              ),
              CURDATE()
            ),
            0
          )
        END AS dias_sin_actividad
      FROM alumnos_asistencias aa
      WHERE aa.alumno_id = :alumnoId
    `,
    {
      replacements: { alumnoId },
      type: QueryTypes.SELECT,
      transaction
    }
  );

  return {
    asistencias_30_dias: Number(resumen?.asistencias_30_dias || 0),
    ultima_asistencia: resumen?.ultima_asistencia_real || null,
    dias_sin_actividad:
      resumen?.dias_sin_actividad === null ||
      resumen?.dias_sin_actividad === undefined
        ? null
        : Number(resumen.dias_sin_actividad)
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
  setIfPresent(payload, body, 'estado', normalizarTexto);
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

  const where = { dni };

  if (alumnoIdExcluir) {
    where.id = { [Op.ne]: alumnoIdExcluir };
  }

  return AlumnosModel.findOne({ where });
};

const verificarUsuarioAppDisponible = async (
  usuarioAppId,
  alumnoIdExcluir = null
) => {
  if (!usuarioAppId) return null;

  const where = { usuario_app_id: usuarioAppId };

  if (alumnoIdExcluir) {
    where.id = { [Op.ne]: alumnoIdExcluir };
  }

  return AlumnosModel.findOne({ where });
};

const verificarUsuarioLoginDuplicado = async ({ email, telefono }) => {
  const condiciones = [];

  if (email) condiciones.push({ email });
  if (telefono) condiciones.push({ telefono });
  if (!condiciones.length) return null;

  return UsuariosModel.findOne({
    where: { [Op.or]: condiciones }
  });
};

export const aplicarScopeSedesAlumnos = (
  where = {},
  user = null,
  sedeIdQuery = null
) => {
  if (usuarioEsGlobal(user)) {
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

    return { ok: true, where };
  }

  // Sergio Manrique - 2026/08/02 - Los alumnos autoregistrados (registro
  // público) se crean sin sede_id hasta que alguien los valida y les asigna
  // una sede. Como "NULL IN (...)" nunca es verdadero en SQL, sin este OR
  // esos alumnos quedaban invisibles para cualquier usuario no global
  // (COORD_SEDE/FRONT_COMERCIAL) incluso con "todas las sedes" seleccionado,
  // y nadie podía validarlos ni asignarles plan.
  where.sede_id = { [Op.or]: [{ [Op.in]: sedesPermitidas }, { [Op.is]: null }] };

  return { ok: true, where };
};

const buscarAlumnoPorIdConPermiso = async (id, user) => {
  const alumno = await AlumnosModel.findByPk(id);

  if (!alumno) {
    return { ok: false, status: 404, message: 'Alumno no encontrado.' };
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

  return { ok: true, alumno };
};

const buscarPlanActivo = async (planId, transaction = null) => {
  if (!planId) return null;

  return PlanesModel.findOne({
    where: { id: planId, activo: 1 },
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
    fecha_desde: { [Op.lte]: fechaConsulta },
    [Op.or]: [
      { fecha_hasta: null },
      { fecha_hasta: { [Op.gte]: fechaConsulta } }
    ]
  };

  if (sedeId) {
    const precioSede = await PlanesPreciosModel.findOne({
      where: { ...whereBase, sede_id: sedeId },
      order: [
        ['fecha_desde', 'DESC'],
        ['id', 'DESC']
      ],
      transaction
    });

    if (precioSede) return precioSede;
  }

  return PlanesPreciosModel.findOne({
    where: { ...whereBase, sede_id: null },
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

// Benjamin Orellana - 2026/07/30 - Normaliza una lista de IDs para operaciones
// masivas y evita procesar duplicados o valores inválidos.
const normalizarIdsAlumnos = (valores = []) => {
  if (!Array.isArray(valores)) return [];

  return [
    ...new Set(
      valores
        .map((valor) => Number(valor))
        .filter((valor) => Number.isInteger(valor) && valor > 0)
    )
  ];
};

const obtenerUsuarioIdRequest = (req) =>
  req.user?.id || req.user?.usuario_id || null;

const obtenerIpRequest = (req) =>
  req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || null;

const buscarMembresiaQueBloqueaCambioSede = async ({
  alumnoId,
  transaction
}) => {
  return AlumnosMembresiasModel.findOne({
    where: {
      alumno_id: Number(alumnoId),
      estado: { [Op.in]: ESTADOS_MEMBRESIA_QUE_BLOQUEAN_CAMBIO_SEDE },
      fecha_vencimiento: { [Op.gte]: obtenerFechaActualDateOnly() }
    },
    order: [
      ['fecha_inicio', 'ASC'],
      ['id', 'ASC']
    ],
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
};

const registrarAuditoriaActualizacionRapidaAlumno = async ({
  req,
  alumno,
  valoresAnteriores,
  valoresNuevos,
  origen = 'individual',
  transaction
}) => {
  const campos = Object.keys(valoresNuevos || {});

  if (!campos.length) return;

  await SistemaAuditoriaLogsModel.create(
    {
      usuario_id: obtenerUsuarioIdRequest(req),
      sede_id:
        valoresNuevos.sede_id ??
        valoresAnteriores.sede_id ??
        alumno.sede_id ??
        null,
      modulo: 'ALUMNOS',
      accion:
        origen === 'masiva'
          ? 'ACTUALIZACION_RAPIDA_MASIVA'
          : 'ACTUALIZACION_RAPIDA',
      entidad: 'alumnos_alumnos',
      entidad_id: Number(alumno.id),
      descripcion: `Actualización rápida de ${campos.join(', ')} para ${alumno.nombre} ${alumno.apellido}.`,
      valores_anteriores: valoresAnteriores,
      valores_nuevos: valoresNuevos,
      ip: obtenerIpRequest(req),
      user_agent: req.headers['user-agent'] || null
    },
    { transaction }
  );
};

const prepararActualizacionRapidaAlumno = async ({
  alumno,
  body,
  user,
  sedeDestino = null,
  transaction
}) => {
  const incluyeSede = Object.prototype.hasOwnProperty.call(body, 'sede_id');
  const incluyeEstado = Object.prototype.hasOwnProperty.call(body, 'estado');

  if (!incluyeSede && !incluyeEstado) {
    return {
      ok: false,
      status: 400,
      code: 'SIN_CAMBIOS',
      message: 'Debe indicar una sede, un estado o ambos.'
    };
  }

  const alumnoPlano =
    typeof alumno.toJSON === 'function' ? alumno.toJSON() : { ...alumno };

  if (
    incluyeEstado &&
    ['baja', 'congelado'].includes(normalizarTexto(alumnoPlano.estado))
  ) {
    return {
      ok: false,
      status: 409,
      code: 'ESTADO_REQUIERE_FLUJO_ESPECIFICO',
      message:
        'Los alumnos dados de baja o congelados deben modificarse desde su ficha mediante la operación específica.'
    };
  }

  const sedeIdNueva = incluyeSede ? toNumberOrNull(body.sede_id) : null;
  const estadoNuevo = incluyeEstado ? normalizarTexto(body.estado) : null;

  if (incluyeSede && !sedeIdNueva) {
    return {
      ok: false,
      status: 400,
      code: 'SEDE_INVALIDA',
      message: 'La sede indicada no es válida.'
    };
  }

  if (incluyeEstado && !ESTADOS_ALUMNO_EDICION_RAPIDA.includes(estadoNuevo)) {
    return {
      ok: false,
      status: 400,
      code: 'ESTADO_NO_PERMITIDO',
      message:
        'El estado indicado no está disponible en la edición rápida. Para baja o congelamiento utilice la operación específica.',
      estados_validos: ESTADOS_ALUMNO_EDICION_RAPIDA
    };
  }

  if (incluyeSede && !usuarioPuedeOperarSede(user, sedeIdNueva)) {
    return {
      ok: false,
      status: 403,
      code: 'SEDE_SIN_PERMISO',
      message: 'No tiene acceso para asignar la sede indicada.'
    };
  }

  if (incluyeSede && !sedeDestino) {
    return {
      ok: false,
      status: 400,
      code: 'SEDE_INACTIVA',
      message: 'La sede indicada no existe o está inactiva.'
    };
  }

  const sedeFinal = incluyeSede ? sedeIdNueva : alumnoPlano.sede_id;
  const estadoFinal = incluyeEstado ? estadoNuevo : alumnoPlano.estado;

  if (estadoFinal === 'activo' && !sedeFinal) {
    return {
      ok: false,
      status: 409,
      code: 'SEDE_REQUERIDA_PARA_ACTIVAR',
      message:
        'Para activar al alumno primero debe asignarle una sede. También puede seleccionar sede y estado en una sola acción masiva.'
    };
  }

  if (incluyeSede && Number(alumnoPlano.sede_id || 0) !== Number(sedeIdNueva)) {
    const membresiaBloqueante = await buscarMembresiaQueBloqueaCambioSede({
      alumnoId: alumnoPlano.id,
      transaction
    });

    if (
      membresiaBloqueante &&
      Number(membresiaBloqueante.sede_id || 0) !== Number(sedeIdNueva)
    ) {
      return {
        ok: false,
        status: 409,
        code: 'CAMBIO_SEDE_REQUIERE_FLUJO_MEMBRESIA',
        message:
          'El alumno tiene una membresía vigente, pendiente o congelada. Para cambiarlo de sede utilice la operación “Cambiar sede” de su ficha.',
        membresia_id: Number(membresiaBloqueante.id),
        sede_membresia_id: Number(membresiaBloqueante.sede_id || 0) || null
      };
    }
  }

  const payload = {};
  const valoresAnteriores = {};
  const valoresNuevos = {};

  if (incluyeSede && Number(alumnoPlano.sede_id || 0) !== Number(sedeIdNueva)) {
    payload.sede_id = sedeIdNueva;
    valoresAnteriores.sede_id = alumnoPlano.sede_id || null;
    valoresNuevos.sede_id = sedeIdNueva;
  }

  if (incluyeEstado && alumnoPlano.estado !== estadoNuevo) {
    payload.estado = estadoNuevo;
    valoresAnteriores.estado = alumnoPlano.estado;
    valoresNuevos.estado = estadoNuevo;

    if (estadoNuevo === 'activo') {
      payload.usuario_validacion_id = user?.id || user?.usuario_id || null;
      payload.fecha_baja = null;
      payload.motivo_baja = null;
    }
  }

  if (Object.keys(payload).length > 0) {
    payload.updated_at = new Date();
  }

  return {
    ok: true,
    payload,
    valoresAnteriores,
    valoresNuevos,
    sedeFinal,
    estadoFinal
  };
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

  const principalAsignado = contactos.some(
    (contacto) => contacto.principal === 1
  );

  if (!principalAsignado && contactos.length > 0) {
    contactos[0].principal = 1;
  }

  return errores;
};

const normalizarPrincipalContactosEmergenciaPublico = (contactos = []) => {
  if (!contactos.length) return contactos;

  const principalIndex = contactos.findIndex(
    (contacto) => contacto.principal === 1
  );
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
  const alumno = await AlumnosModel.findOne({ where: { dni } });

  if (!alumno) {
    return { ok: false, status: 404, message: 'Alumno no encontrado.' };
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

  return { ok: true, alumno };
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
      sin_plan,
      sin_anamnesis,
      sin_contacto_emergencia,
      sin_asistencias,
      dias_inactividad,
      meses_cuota_vencida,
      cliente_perdido,
      page = 1,
      limit = 20,
      orderBy = 'created_at',
      orderDirection = 'DESC'
    } = req.query;

    const where = {};

    const scope = aplicarScopeSedesAlumnos(where, req.user, sede_id);

    if (!scope.ok) {
      return res.status(scope.status).json({
        ok: false,
        message: scope.message
      });
    }

    const whereEstadisticas = { ...where };
    const whereAnamnesisPendiente = {
      ...whereEstadisticas,
      [Op.and]: [
        ...(whereEstadisticas[Op.and] || []),
        construirFiltroSinRelacionAlumno(
          AlumnosAnamnesisModel,
          'anamnesis_pendientes_estadisticas'
        )
      ]
    };
    const whereMorosos = {
      ...whereEstadisticas,
      [Op.and]: [
        ...(whereEstadisticas[Op.and] || []),
        construirFiltroAlumnoMoroso()
      ]
    };

    const [
      totalSede,
      activosSede,
      anamnesisPendientesSede,
      morososSede
    ] = await Promise.all([
      AlumnosModel.count({ where: whereEstadisticas }),
      AlumnosModel.count({ where: { ...whereEstadisticas, estado: 'activo' } }),
      AlumnosModel.count({ where: whereAnamnesisPendiente }),
      AlumnosModel.count({ where: whereMorosos })
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
      where[Op.and] = [
        ...(where[Op.and] || []),
        construirWhereBusquedaAlumno(search)
      ];
    }

    // Benjamin Orellana - 2026/07/13 - Filtros combinables de información pendiente.
    if (normalizarTinyint(sin_plan, 0) === 1) {
      where[Op.and] = [
        ...(where[Op.and] || []),
        construirFiltroSinRelacionAlumno(
          AlumnosMembresiasModel,
          'membresias_filtro'
        )
      ];
    }

    if (normalizarTinyint(sin_anamnesis, 0) === 1) {
      where[Op.and] = [
        ...(where[Op.and] || []),
        construirFiltroSinRelacionAlumno(
          AlumnosAnamnesisModel,
          'anamnesis_filtro'
        )
      ];
    }

    if (normalizarTinyint(sin_contacto_emergencia, 0) === 1) {
      where[Op.and] = [
        ...(where[Op.and] || []),
        construirFiltroSinRelacionAlumno(
          AlumnosContactosEmergenciaModel,
          'contactos_emergencia_filtro'
        )
      ];
    }

    if (normalizarTinyint(sin_asistencias, 0) === 1) {
      where.ultima_asistencia = { [Op.is]: null };
    }

    // Sergio Manrique - 2026/08/01 - Filtros de seguimiento comercial.
    if (dias_inactividad !== undefined && dias_inactividad !== '') {
      const diasNumero = Number(dias_inactividad);

      if (!DIAS_INACTIVIDAD_VALIDOS.includes(diasNumero)) {
        return res.status(400).json({
          ok: false,
          message: 'Valor de días de inactividad inválido.',
          valores_validos: DIAS_INACTIVIDAD_VALIDOS
        });
      }

      where[Op.and] = [
        ...(where[Op.and] || []),
        construirFiltroAlumnoInactivo(diasNumero)
      ];
    }

    if (meses_cuota_vencida !== undefined && meses_cuota_vencida !== '') {
      const mesesNumero = Number(meses_cuota_vencida);

      if (!MESES_CUOTA_VENCIDA_VALIDOS.includes(mesesNumero)) {
        return res.status(400).json({
          ok: false,
          message: 'Valor de meses de cuota vencida inválido.',
          valores_validos: MESES_CUOTA_VENCIDA_VALIDOS
        });
      }

      where[Op.and] = [
        ...(where[Op.and] || []),
        construirFiltroAlumnoCuotaVencida(mesesNumero)
      ];
    }

    if (normalizarTinyint(cliente_perdido, 0) === 1) {
      where[Op.and] = [
        ...(where[Op.and] || []),
        construirFiltroAlumnoCuotaVencida(MESES_CUOTA_VENCIDA_CLIENTE_PERDIDO)
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

    // Sergio Manrique - 2026/08/02 - Sub-etiqueta de seguimiento comercial
    // ("Inactivo hace 5 días", "Cuota vencida hace 1 mes") bajo el estado,
    // para que el equipo detecte a simple vista quién necesita seguimiento
    // sin tener que entrar a Recaptaciones. Misma función que usa ese módulo.
    const alumnoIds = rows.map((alumno) => alumno.id);
    const { asistencias, cuotasVencidas } = await obtenerDiasSeguimientoPorAlumnos(alumnoIds);

    const data = await Promise.all(
      rows.map(async (alumno) => {
        const base = await construirAlumnoRespuesta(alumno);
        const diasInactividad = asistencias.has(alumno.id) ? asistencias.get(alumno.id) : null;
        const diasCuotaVencida = cuotasVencidas.has(alumno.id)
          ? cuotasVencidas.get(alumno.id)
          : null;
        // A diferencia de Recaptaciones (donde el WHERE ya garantiza que el
        // alumno superó un umbral), acá hay que pisar el umbral a mano: si no
        // lo hacemos, un alumno que asistió ayer mostraría "Inactivo hace 1
        // día" solo por tener fecha_inicio, cuando en realidad está al día.
        const diasInactividadRelevante =
          diasInactividad !== null && diasInactividad >= 5 ? diasInactividad : null;

        return {
          ...base,
          dias_inactividad: diasInactividad,
          dias_cuota_vencida: diasCuotaVencida,
          etiqueta_seguimiento: calcularEtiquetaSeguimiento(
            diasInactividadRelevante,
            diasCuotaVencida,
            alumno.estado
          )
        };
      })
    );

    return res.status(200).json({
      ok: true,
      message: 'Alumnos obtenidos correctamente.',
      estadisticas: {
        total: totalSede,
        activos: activosSede,
        cant_anamnesis_permanente: anamnesisPendientesSede,
        cant_morosos: morososSede
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
 * Benjamin Orellana - 2026/07/13 - Lista de alumnos para el selector
 * de Nuevo Cobro. Evita cargar membresías, anamnesis y demás relaciones que
 * no son necesarias durante la búsqueda.
 */
export const OBR_AlumnosSelectorCobro_CTS = async (req, res) => {
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
      page = 1,
      limit = 40,
      orden = 'asc',
      situacion_financiera = 'todos'
    } = req.query;
    const where = {};
    const scope = aplicarScopeSedesAlumnos(where, req.user, sede_id);

    if (!scope.ok) {
      return res.status(scope.status).json({
        ok: false,
        message: scope.message
      });
    }

    const aliasAlumno = db
      .getQueryInterface()
      .queryGenerator.quoteIdentifier(AlumnosModel.name);
    const saldoFavorSql = `COALESCE((
      SELECT MAX(als.saldo)
      FROM alumnos_saldos AS als
      WHERE als.alumno_id = ${aliasAlumno}.id
    ), 0)`;
    const saldoDeudorSql = `COALESCE((
      SELECT SUM(pm.saldo)
      FROM pagos_mensualidades AS pm
      WHERE pm.alumno_id = ${aliasAlumno}.id
        AND pm.estado IN ('pendiente', 'parcial', 'vencida')
        AND pm.saldo > 0
    ), 0)`;
    const filtroFinanciero = String(situacion_financiera).trim().toLowerCase();
    const filtrosFinancierosValidos = ['todos', 'deuda', 'saldo_favor'];

    if (!filtrosFinancierosValidos.includes(filtroFinanciero)) {
      return res.status(400).json({
        ok: false,
        message: 'El filtro financiero debe ser todos, deuda o saldo_favor.'
      });
    }

    const search = normalizarTexto(q);

    if (search) {
      where[Op.and] = [
        ...(where[Op.and] || []),
        construirWhereBusquedaAlumno(search)
      ];
    }

    if (filtroFinanciero === 'deuda') {
      where[Op.and] = [
        ...(where[Op.and] || []),
        db.literal(`${saldoDeudorSql} > 0`)
      ];
    }

    if (filtroFinanciero === 'saldo_favor') {
      where[Op.and] = [
        ...(where[Op.and] || []),
        db.literal(`${saldoFavorSql} > 0`)
      ];
    }

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 40, 1), 100);
    const offset = (pageNumber - 1) * limitNumber;
    const direccionOrden =
      String(orden).trim().toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const { rows, count } = await AlumnosModel.findAndCountAll({
      where,
      attributes: [
        'id',
        'sede_id',
        'nombre',
        'apellido',
        'dni',
        'telefono',
        'email',
        'estado',
        [db.literal(saldoFavorSql), 'saldo_favor'],
        [db.literal(saldoDeudorSql), 'saldo_deudor']
      ],
      limit: limitNumber,
      offset,
      order: [
        ['nombre', direccionOrden],
        ['apellido', direccionOrden],
        ['id', direccionOrden]
      ]
    });

    return res.status(200).json({
      ok: true,
      message: 'Alumnos disponibles para cobro obtenidos correctamente.',
      total: count,
      page: pageNumber,
      limit: limitNumber,
      total_pages: Math.ceil(count / limitNumber),
      data: rows.map((alumno) =>
        typeof alumno.toJSON === 'function' ? alumno.toJSON() : alumno
      )
    });
  } catch (error) {
    console.error('Error OBR_AlumnosSelectorCobro_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener los alumnos disponibles para el cobro.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Obtiene un alumno por DNI.
 */
export const OBR_AlumnoPorDni_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaAlumnos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar alumnos.'
      });
    }

    const { dni } = req.params;

    const result = await buscarAlumnoPorDniConPermiso(dni, req.user);

    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    const [datosAlumno, resumenActividad] = await Promise.all([
      construirAlumnoRespuesta(result.alumno),
      obtenerResumenActividadAlumno(result.alumno.id)
    ]);

    const data = {
      ...datosAlumno,
      ...resumenActividad,
      ultima_asistencia:
        resumenActividad.ultima_asistencia ||
        datosAlumno.ultima_asistencia ||
        null,
      dias_sin_actividad:
        resumenActividad.dias_sin_actividad ??
        datosAlumno.dias_sin_actividad ??
        null
    };

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

    const [datosAlumno, resumenActividad] = await Promise.all([
      construirAlumnoRespuesta(alumno),
      obtenerResumenActividadAlumno(alumno.id)
    ]);

    const data = {
      ...datosAlumno,
      ...resumenActividad,
      ultima_asistencia:
        resumenActividad.ultima_asistencia ||
        datosAlumno.ultima_asistencia ||
        null,
      dias_sin_actividad:
        resumenActividad.dias_sin_actividad ??
        datosAlumno.dias_sin_actividad ??
        null
    };

    // Sergio Gustavo Manrique - 2026/06/11 - Verifica pendientes del alumno
    const pendientes = {
      anamnesis: !data.anamnesis,
      contactos: !data.contactos_emergencia?.length
    };

    return res.status(200).json({
      ok: true,
      message: 'Perfil del alumno obtenido correctamente.',
      data,
      pendientes
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

    const bodyConIdsNormalizados = {
      ...req.body,
      sede_id: toNumberOrNull(req.body.sede_id),
      plan_id: toNumberOrNull(req.body.plan_id),
      usuario_app_id: toNumberOrNull(req.body.usuario_app_id)
    };

    const payload = buildAlumnoPayloadCreate(bodyConIdsNormalizados, req.user);
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

    const nuevoAlumno = await AlumnosModel.create(payload, { transaction });

    /*
     * Benjamin Orellana - 2026/07/22 - Todo alumno creado desde el panel
     * interno recibe credenciales para el portal/app. El DNI normalizado se
     * utiliza como contraseña inicial y deberá cambiarse en el primer acceso.
     * La existencia de estas credenciales no habilita por sí sola la reserva
     * de turnos: esa operación debe exigir una membresía activa y vigente.
     */
    await AlumnosLoginModel.create(
      {
        alumno_id: nuevoAlumno.id,
        password_hash: await bcrypt.hash(payload.dni, 10),
        requiere_cambio_password: 1,
        estado: 'activo'
      },
      { transaction }
    );

    if (bodyConIdsNormalizados.plan_id) {
      const planId = bodyConIdsNormalizados.plan_id;

      if (!planId) {
        await transaction.rollback();

        return res.status(400).json({
          ok: false,
          message: 'El plan_id debe ser un número válido.'
        });
      }

      const plan = await PlanesModel.findOne({
        where: { id: planId, activo: 1 }
      });

      if (!plan) {
        await transaction.rollback();

        return res.status(404).json({
          ok: false,
          message: 'El plan indicado no existe o está inactivo.'
        });
      }

      const fechaInicio =
        normalizarFecha(bodyConIdsNormalizados.fecha_inicio) ||
        obtenerFechaActualDateOnly();

      if (!esFechaDateOnlyValida(fechaInicio)) {
        await transaction.rollback();

        return res.status(400).json({
          ok: false,
          message: 'La fecha de inicio debe ser válida (formato: YYYY-MM-DD).'
        });
      }

      const precioVigente = await buscarPrecioVigentePlan({
        planId,
        sedeId: Number(payload.sede_id),
        fechaConsulta: fechaInicio,
        transaction
      });

      if (!precioVigente) {
        await transaction.rollback();

        return res.status(400).json({
          ok: false,
          message:
            'No hay un precio vigente para este plan en la sede indicada.'
        });
      }

      const payloadMembresia = construirPayloadMembresiaPublica({
        alumnoId: nuevoAlumno.id,
        plan,
        sedeId: Number(payload.sede_id),
        fechaInicio,
        precioVigente
      });

      await AlumnosMembresiasModel.create(payloadMembresia, { transaction });
    }

    const data = await construirAlumnoRespuesta(nuevoAlumno, transaction);

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      message:
        'Alumno creado correctamente. Ya puede iniciar sesión con su DNI como contraseña inicial.',
      data: {
        ...data,
        acceso_alumno: {
          habilitado: true,
          usuario: nuevoAlumno.dni,
          requiere_cambio_password: true
        }
      }
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
    const { nombre, apellido, dni, telefono, email = null } = req.body;

    // Validación individual de cada campo obligatorio
    if (!nombre?.trim()) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        field: 'nombre',
        message: 'El nombre es obligatorio.'
      });
    }

    if (!apellido?.trim()) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        field: 'apellido',
        message: 'El apellido es obligatorio.'
      });
    }

    if (!dni?.trim()) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        field: 'dni',
        message: 'El DNI es obligatorio.'
      });
    }

    if (!telefono?.trim()) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        field: 'telefono',
        message: 'El teléfono es obligatorio.'
      });
    }

    // Normalización
    const nombreLimpio = capitalizarTexto(nombre);
    const apellidoLimpio = capitalizarTexto(apellido);

    const dniLimpio = normalizarDni(dni);
    const telefonoLimpio = normalizarTelefono(telefono);
    const emailLimpio = email?.trim() ? normalizarEmail(email) : null;

    // Validar email (el campo es opcional; solo se valida el formato si se ingresó)
    const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (emailLimpio && !regexEmail.test(emailLimpio)) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        field: 'email',
        message: 'El email ingresado no es válido.'
      });
    }

    // Validar teléfono
    if (telefonoLimpio.length < 6 || telefonoLimpio.length > 20) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        field: 'telefono',
        message: 'El teléfono ingresado no es válido.'
      });
    }

    // Validar DNI
    if (dniLimpio.length < 7 || dniLimpio.length > 12) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        field: 'dni',
        message: 'El DNI ingresado no es válido.'
      });
    }

    // Verificar duplicados en paralelo
    const [existeDni, existeTelefono, existeEmail] = await Promise.all([
      AlumnosModel.findOne({
        where: { dni: dniLimpio }
      }),
      AlumnosModel.findOne({
        where: { telefono: telefonoLimpio }
      }),
      emailLimpio
        ? AlumnosModel.findOne({
            where: { email: emailLimpio }
          })
        : null
    ]);

    if (existeDni) {
      await transaction.rollback();

      return res.status(409).json({
        ok: false,
        message: 'Ya existe un alumno registrado con ese DNI.'
      });
    }

    if (existeTelefono) {
      await transaction.rollback();

      return res.status(409).json({
        ok: false,
        message: 'Ya existe un alumno registrado con ese teléfono.'
      });
    }

    if (existeEmail) {
      await transaction.rollback();

      return res.status(409).json({
        ok: false,
        message: 'Ya existe un alumno registrado con ese email.'
      });
    }

    // Crear alumno
    const nuevoAlumno = await AlumnosModel.create(
      {
        nombre: nombreLimpio,
        apellido: apellidoLimpio,
        dni: dniLimpio,
        telefono: telefonoLimpio,
        email: emailLimpio,
        origen_registro: 'externo',
        estado: 'pendiente_validacion'
      },
      { transaction }
    );

    // Crear credenciales
    await AlumnosLoginModel.create(
      {
        alumno_id: nuevoAlumno.id,
        password_hash: await bcrypt.hash(dniLimpio, 10),
        requiere_cambio_password: 1,
        estado: 'activo'
      },
      { transaction }
    );

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      message:
        '¡Te registraste correctamente! Podés iniciar sesión con tu DNI como contraseña.',
      data: {
        id: nuevoAlumno.id,
        nombre: nuevoAlumno.nombre,
        apellido: nuevoAlumno.apellido,
        dni: nuevoAlumno.dni,
        telefono: nuevoAlumno.telefono,
        email: nuevoAlumno.email,
        estado: nuevoAlumno.estado
      }
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }

    console.error('Error CR_Alumnos_Publico_CTS:', error);

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

    // Benjamin Orellana - 2026/07/13 - El formulario administrativo puede
    // cambiar el estado junto con los demás datos del alumno. Al activarlo se
    // conservan las mismas reglas aplicadas por el endpoint específico.
    if (payload.estado === 'activo') {
      payload.usuario_validacion_id =
        req.user?.id || req.user?.usuario_id || null;
      payload.fecha_baja = null;
      payload.motivo_baja = null;
    }

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

    if (req.body.plan_id) {
      const planId = toNumberOrNull(req.body.plan_id);

      if (!planId) {
        await transaction.rollback();

        return res.status(400).json({
          ok: false,
          message: 'El plan_id debe ser un número válido.'
        });
      }

      const planExiste = await PlanesModel.findOne({
        where: { id: planId, activo: 1 },
        transaction
      });

      if (!planExiste) {
        await transaction.rollback();

        return res.status(404).json({
          ok: false,
          message: 'El plan indicado no existe o está inactivo.'
        });
      }

      const hoy = obtenerFechaActualDateOnly();
      const membresiaOperativa = await AlumnosMembresiasModel.findOne({
        where: {
          alumno_id: Number(id),
          estado: { [Op.in]: ['activa', 'pendiente_pago', 'congelada'] },
          fecha_inicio: { [Op.lte]: hoy },
          fecha_vencimiento: { [Op.gte]: hoy }
        },
        order: [
          ['fecha_inicio', 'DESC'],
          ['id', 'DESC']
        ],
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!membresiaOperativa) {
        await transaction.rollback();

        return res.status(409).json({
          ok: false,
          message:
            'El alumno no tiene una membresía vigente para asignar el plan. Generá una membresía desde Planes y pagos.'
        });
      }

      const clasesIncluidas = Number(
        planExiste.cantidad_clases_periodo || planExiste.clases_por_mes || 0
      );

      if (!Number.isInteger(clasesIncluidas) || clasesIncluidas <= 0) {
        await transaction.rollback();

        return res.status(409).json({
          ok: false,
          message: 'El plan indicado no tiene una cantidad de clases válida.'
        });
      }

      const clasesUsadas = Math.max(
        Number(membresiaOperativa.clases_usadas || 0),
        0
      );

      // La edición general regulariza solamente la cobertura vigente. Nunca
      // debe reescribir renovaciones futuras ni el historial de membresías.
      await membresiaOperativa.update(
        {
          plan_id: planId,
          clases_incluidas: clasesIncluidas,
          clases_usadas: clasesUsadas,
          clases_disponibles: Math.max(clasesIncluidas - clasesUsadas, 0),
          updated_at: new Date()
        },
        { transaction }
      );
    }

    await alumno.update(payload, { transaction });

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
 * Benjamin Orellana - 2026/07/30 - Actualiza sede y/o estado desde la tabla
 * principal sin exponer la edición completa del alumno.
 */
export const UR_ActualizacionRapidaAlumno_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionAlumnos(req.user)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para realizar esta operación.'
      });
    }

    const alumnoId = Number(req.params.id);

    if (!Number.isInteger(alumnoId) || alumnoId <= 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'El identificador del alumno no es válido.'
      });
    }

    const alumno = await AlumnosModel.findByPk(alumnoId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!alumno) {
      await transaction.rollback();

      return res.status(404).json({
        ok: false,
        message: 'Alumno no encontrado.'
      });
    }

    if (!usuarioPuedeOperarSede(req.user, alumno.sede_id)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene acceso al alumno indicado.'
      });
    }

    const incluyeSede = Object.prototype.hasOwnProperty.call(
      req.body || {},
      'sede_id'
    );
    const sedeId = incluyeSede ? toNumberOrNull(req.body.sede_id) : null;
    const sedeDestino = incluyeSede ? await buscarSedeActiva(sedeId) : null;

    const preparacion = await prepararActualizacionRapidaAlumno({
      alumno,
      body: req.body || {},
      user: req.user,
      sedeDestino,
      transaction
    });

    if (!preparacion.ok) {
      await transaction.rollback();

      return res.status(preparacion.status).json({
        ok: false,
        code: preparacion.code,
        message: preparacion.message,
        estados_validos: preparacion.estados_validos,
        membresia_id: preparacion.membresia_id,
        sede_membresia_id: preparacion.sede_membresia_id
      });
    }

    if (Object.keys(preparacion.payload).length > 0) {
      await alumno.update(preparacion.payload, { transaction });

      await registrarAuditoriaActualizacionRapidaAlumno({
        req,
        alumno,
        valoresAnteriores: preparacion.valoresAnteriores,
        valoresNuevos: preparacion.valoresNuevos,
        transaction
      });
    }

    await transaction.commit();

    const data = await construirAlumnoRespuesta(alumno);

    return res.status(200).json({
      ok: true,
      message:
        Object.keys(preparacion.payload).length > 0
          ? 'Alumno actualizado correctamente.'
          : 'El alumno ya tenía los valores seleccionados.',
      data
    });
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }

    console.error('Error UR_ActualizacionRapidaAlumno_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al actualizar rápidamente el alumno.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/07/30 - Aplica sede y/o estado a varios alumnos.
 * Los errores operativos se informan por alumno y no impiden actualizar al
 * resto; cualquier error inesperado sí revierte toda la transacción.
 */
export const UR_ActualizacionMasivaAlumnos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionAlumnos(req.user)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para realizar esta operación.'
      });
    }

    const alumnoIds = normalizarIdsAlumnos(req.body?.alumno_ids);
    const incluyeSede = Object.prototype.hasOwnProperty.call(
      req.body || {},
      'sede_id'
    );
    const incluyeEstado = Object.prototype.hasOwnProperty.call(
      req.body || {},
      'estado'
    );

    if (!alumnoIds.length) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Debe seleccionar al menos un alumno.'
      });
    }

    if (alumnoIds.length > 500) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'La operación masiva admite hasta 500 alumnos por solicitud.'
      });
    }

    if (!incluyeSede && !incluyeEstado) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Debe indicar una sede, un estado o ambos.'
      });
    }

    const sedeId = incluyeSede ? toNumberOrNull(req.body.sede_id) : null;
    const estado = incluyeEstado ? normalizarTexto(req.body.estado) : null;

    if (incluyeSede && !sedeId) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'La sede indicada no es válida.'
      });
    }

    if (incluyeEstado && !ESTADOS_ALUMNO_EDICION_RAPIDA.includes(estado)) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'El estado indicado no está disponible en la edición rápida.',
        estados_validos: ESTADOS_ALUMNO_EDICION_RAPIDA
      });
    }

    if (incluyeSede && !usuarioPuedeOperarSede(req.user, sedeId)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene acceso para asignar la sede indicada.'
      });
    }

    const sedeDestino = incluyeSede ? await buscarSedeActiva(sedeId) : null;

    if (incluyeSede && !sedeDestino) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'La sede indicada no existe o está inactiva.'
      });
    }

    const resultados = [];
    let actualizados = 0;
    let sinCambios = 0;
    let rechazados = 0;

    for (const alumnoId of alumnoIds) {
      const alumno = await AlumnosModel.findByPk(alumnoId, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!alumno) {
        rechazados += 1;
        resultados.push({
          alumno_id: alumnoId,
          ok: false,
          code: 'ALUMNO_NO_ENCONTRADO',
          message: 'Alumno no encontrado.'
        });
        continue;
      }

      if (!usuarioPuedeOperarSede(req.user, alumno.sede_id)) {
        rechazados += 1;
        resultados.push({
          alumno_id: alumnoId,
          ok: false,
          code: 'ALUMNO_SIN_PERMISO',
          message: 'No tiene acceso al alumno.'
        });
        continue;
      }

      const preparacion = await prepararActualizacionRapidaAlumno({
        alumno,
        body: {
          ...(incluyeSede ? { sede_id: sedeId } : {}),
          ...(incluyeEstado ? { estado } : {})
        },
        user: req.user,
        sedeDestino,
        transaction
      });

      if (!preparacion.ok) {
        rechazados += 1;
        resultados.push({
          alumno_id: alumnoId,
          nombre: `${alumno.nombre} ${alumno.apellido}`.trim(),
          ok: false,
          code: preparacion.code,
          message: preparacion.message
        });
        continue;
      }

      if (Object.keys(preparacion.payload).length === 0) {
        sinCambios += 1;
        resultados.push({
          alumno_id: alumnoId,
          nombre: `${alumno.nombre} ${alumno.apellido}`.trim(),
          ok: true,
          sin_cambios: true,
          message: 'Ya tenía los valores seleccionados.'
        });
        continue;
      }

      await alumno.update(preparacion.payload, { transaction });

      await registrarAuditoriaActualizacionRapidaAlumno({
        req,
        alumno,
        valoresAnteriores: preparacion.valoresAnteriores,
        valoresNuevos: preparacion.valoresNuevos,
        origen: 'masiva',
        transaction
      });

      actualizados += 1;
      resultados.push({
        alumno_id: alumnoId,
        nombre: `${alumno.nombre} ${alumno.apellido}`.trim(),
        ok: true,
        estado: alumno.estado,
        sede_id: alumno.sede_id
      });
    }

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message:
        rechazados > 0
          ? 'La actualización masiva finalizó con algunos alumnos rechazados.'
          : 'La actualización masiva finalizó correctamente.',
      data: {
        solicitados: alumnoIds.length,
        actualizados,
        sin_cambios: sinCambios,
        rechazados,
        resultados
      }
    });
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }

    console.error('Error UR_ActualizacionMasivaAlumnos_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al realizar la actualización masiva de alumnos.'
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

    const payload = { estado };

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
 * Sergio Gustavo Manrique - 2026/06/11
 * PATCH /alumnos/perfil
 * El alumno actualiza sus propios datos de contacto y domicilio.
 * No puede cambiar DNI, sede, estado ni campos administrativos.
 */
export const UR_AlumnoPerfil_CTS = async (req, res) => {
  try {
    const alumnoId = req.alumno?.id || req.alumno?.alumno_id;

    const {
      telefono,
      email,
      domicilio,
      localidad,
      provincia,
      fecha_nacimiento,
      sede_id
    } = req.body;

    const sedeId = toNumberOrNull(sede_id);

    // Benjamin Orellana - 2026/07/30 - La sede forma parte de los datos
    // personales obligatorios del primer acceso. El alumno puede elegir una
    // sede activa mientras no exista una membresía operativa en otra sede.
    if (
      !telefono?.trim() ||
      !domicilio?.trim() ||
      !localidad?.trim() ||
      !provincia?.trim() ||
      !fecha_nacimiento ||
      !sedeId
    ) {
      return res.status(400).json({
        ok: false,
        message: 'Todos los campos obligatorios deben estar completos.'
      });
    }

    const alumno = await AlumnosModel.findByPk(alumnoId);

    if (!alumno) {
      return res.status(404).json({
        ok: false,
        message: 'Alumno no encontrado.'
      });
    }

    const sedeSeleccionada = await buscarSedeActiva(sedeId);

    if (!sedeSeleccionada) {
      return res.status(400).json({
        ok: false,
        field: 'sede_id',
        message: 'La sede seleccionada no existe o está inactiva.'
      });
    }

    if (Number(alumno.sede_id || 0) !== Number(sedeId)) {
      const membresiaBloqueante = await buscarMembresiaQueBloqueaCambioSede({
        alumnoId
      });

      if (
        membresiaBloqueante &&
        Number(membresiaBloqueante.sede_id || 0) !== Number(sedeId)
      ) {
        return res.status(409).json({
          ok: false,
          code: 'CAMBIO_SEDE_REQUIERE_GESTION_ADMINISTRATIVA',
          field: 'sede_id',
          message:
            'Tu membresía está asociada a otra sede. Solicitá el cambio en recepción para conservar correctamente tu plan y tus turnos.'
        });
      }
    }

    // Normalización
    const emailNormalizado = email?.trim() ? normalizarEmail(email) : null;
    const telefonoNormalizado = normalizarTelefono(telefono);

    const domicilioNormalizado = capitalizarTexto(domicilio);
    const localidadNormalizada = capitalizarTexto(localidad);

    // El email no puede modificarse (solo se valida si el alumno ya tenía uno
    // cargado; si nunca cargó email no hay nada que comparar)
    if (alumno.email && emailNormalizado !== normalizarEmail(alumno.email)) {
      return res.status(403).json({
        ok: false,
        message: 'No está permitido modificar el email.'
      });
    }

    // Validar formato de email (si se envió uno)
    const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (emailNormalizado && !regexEmail.test(emailNormalizado)) {
      return res.status(400).json({
        ok: false,
        message: 'El email ingresado no es válido.'
      });
    }

    // Validar teléfono
    if (!/^\d+$/.test(telefonoNormalizado)) {
      return res.status(400).json({
        ok: false,
        message: 'El teléfono solo puede contener números.'
      });
    }

    if (telefonoNormalizado.length < 6 || telefonoNormalizado.length > 20) {
      return res.status(400).json({
        ok: false,
        message: 'El teléfono ingresado no es válido.'
      });
    }

    // Validar fecha de nacimiento
    const fechaNacimiento = new Date(fecha_nacimiento);

    if (Number.isNaN(fechaNacimiento.getTime())) {
      return res.status(400).json({
        ok: false,
        message: 'La fecha de nacimiento no es válida.'
      });
    }

    const hoy = new Date();

    if (fechaNacimiento > hoy) {
      return res.status(400).json({
        ok: false,
        message: 'La fecha de nacimiento no puede ser futura.'
      });
    }

    // Validar longitudes máximas
    if (domicilioNormalizado.length > 150) {
      return res.status(400).json({
        ok: false,
        message: 'El domicilio es demasiado largo.'
      });
    }

    if (localidadNormalizada.length > 100) {
      return res.status(400).json({
        ok: false,
        message: 'La localidad es demasiado larga.'
      });
    }

    if (provincia.length > 100) {
      return res.status(400).json({
        ok: false,
        message: 'La provincia es demasiado larga.'
      });
    }

    const payload = {
      sede_id: sedeId,
      telefono: telefonoNormalizado,
      domicilio: domicilioNormalizado,
      localidad: localidadNormalizada,
      provincia,
      fecha_nacimiento
    };

    await alumno.update(payload);

    const data = await construirAlumnoRespuesta(alumno);

    return res.status(200).json({
      ok: true,
      message: 'Datos actualizados correctamente.',
      data
    });
  } catch (error) {
    console.error('Error UR_AlumnoPerfil_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al actualizar los datos, póngase en contacto con soporte.'
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
      { transaction }
    );

    await alumno.update(
      {
        usuario_app_id: usuarioApp.id,
        email: email || alumnoPlano.email,
        telefono: telefono || alumnoPlano.telefono
      },
      { transaction }
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

const construirEstadoAccesoAlumno = (loginRecord) => {
  if (!loginRecord) {
    return {
      tiene_acceso: false,
      estado: null,
      requiere_cambio_password: false,
      password_cambiado_at: null,
      intentos_fallidos: 0,
      bloqueado_hasta: null,
      bloqueado_temporalmente: false,
      motivo_bloqueo: null,
      ultimo_login: null,
      ultimo_login_ip: null,
      created_at: null,
      updated_at: null
    };
  }

  const acceso =
    typeof loginRecord.toJSON === 'function'
      ? loginRecord.toJSON()
      : { ...loginRecord };

  const bloqueadoHasta = acceso.bloqueado_hasta
    ? new Date(acceso.bloqueado_hasta)
    : null;

  return {
    tiene_acceso: true,
    id: acceso.id,
    alumno_id: acceso.alumno_id,
    estado: acceso.estado,
    requiere_cambio_password:
      Number(acceso.requiere_cambio_password || 0) === 1,
    password_cambiado_at: acceso.password_cambiado_at || null,
    intentos_fallidos: Number(acceso.intentos_fallidos || 0),
    bloqueado_hasta: acceso.bloqueado_hasta || null,
    bloqueado_temporalmente: Boolean(
      bloqueadoHasta &&
        !Number.isNaN(bloqueadoHasta.getTime()) &&
        bloqueadoHasta.getTime() > Date.now()
    ),
    motivo_bloqueo: acceso.motivo_bloqueo || null,
    ultimo_login: acceso.ultimo_login || null,
    ultimo_login_ip: acceso.ultimo_login_ip || null,
    created_at: acceso.created_at || null,
    updated_at: acceso.updated_at || null
  };
};

const registrarAuditoriaAccesoAlumno = async ({
  req,
  alumno,
  entidadId = null,
  accion,
  descripcion,
  valoresAnteriores,
  valoresNuevos,
  transaction
}) => {
  await SistemaAuditoriaLogsModel.create(
    {
      usuario_id: obtenerUsuarioIdRequest(req),
      sede_id: alumno?.sede_id || null,
      modulo: 'ALUMNOS',
      accion,
      entidad: 'alumnos_usuarios',
      entidad_id: Number(entidadId || alumno?.id),
      descripcion,
      valores_anteriores: valoresAnteriores || null,
      valores_nuevos: valoresNuevos || null,
      ip: obtenerIpRequest(req),
      user_agent: req.headers['user-agent'] || null
    },
    { transaction }
  );
};

/*
 * Benjamin Orellana - 2026/08/02 - Consulta el estado de acceso al portal
 * sin exponer el hash de contraseña ni los tokens de restablecimiento.
 */
export const OBR_AccesoAlumno_CTS = async (req, res) => {
  try {
    const result = await buscarAlumnoPorIdConPermiso(req.params.id, req.user);

    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    const loginRecord = await AlumnosLoginModel.findOne({
      where: { alumno_id: Number(result.alumno.id) }
    });

    return res.status(200).json({
      ok: true,
      message: 'Estado de acceso obtenido correctamente.',
      data: construirEstadoAccesoAlumno(loginRecord)
    });
  } catch (error) {
    console.error('Error OBR_AccesoAlumno_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al consultar el acceso del alumno.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/08/02 - Quita el bloqueo temporal causado por
 * intentos fallidos. No reactiva accesos suspendidos administrativamente.
 */
export const UR_DesbloquearAccesoAlumno_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const result = await buscarAlumnoPorIdConPermiso(req.params.id, req.user);

    if (!result.ok) {
      await transaction.rollback();

      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    const alumno = result.alumno;
    const loginRecord = await AlumnosLoginModel.findOne({
      where: { alumno_id: Number(alumno.id) },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!loginRecord) {
      await transaction.rollback();

      return res.status(404).json({
        ok: false,
        message: 'El alumno no tiene acceso al portal configurado.'
      });
    }

    if (loginRecord.estado === 'suspendido') {
      await transaction.rollback();

      return res.status(409).json({
        ok: false,
        message:
          'El acceso está suspendido administrativamente. El desbloqueo temporal no modifica esa suspensión.'
      });
    }

    const valoresAnteriores = {
      estado: loginRecord.estado,
      motivo_bloqueo: loginRecord.motivo_bloqueo,
      intentos_fallidos: Number(loginRecord.intentos_fallidos || 0),
      bloqueado_hasta: loginRecord.bloqueado_hasta || null
    };

    const valoresNuevos = {
      estado: loginRecord.estado === 'bloqueado' ? 'activo' : loginRecord.estado,
      motivo_bloqueo: null,
      intentos_fallidos: 0,
      bloqueado_hasta: null,
      updated_at: new Date()
    };

    await loginRecord.update(valoresNuevos, { transaction });

    await registrarAuditoriaAccesoAlumno({
      req,
      alumno,
      entidadId: loginRecord.id,
      accion: 'DESBLOQUEAR_ACCESO',
      descripcion: `Se quitó el bloqueo de acceso al portal de ${alumno.nombre} ${alumno.apellido}.`,
      valoresAnteriores,
      valoresNuevos: {
        estado: valoresNuevos.estado,
        motivo_bloqueo: valoresNuevos.motivo_bloqueo,
        intentos_fallidos: 0,
        bloqueado_hasta: null
      },
      transaction
    });

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Bloqueo quitado correctamente. El alumno ya puede volver a intentar.',
      data: construirEstadoAccesoAlumno(loginRecord)
    });
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }

    console.error('Error UR_DesbloquearAccesoAlumno_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al quitar el bloqueo del alumno.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/08/02 - Establece una contraseña temporal desde el
 * panel interno. El alumno deberá reemplazarla después de iniciar sesión.
 */
export const UR_RestablecerPasswordAccesoAlumno_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const passwordNueva = normalizarTexto(req.body?.password_nueva);

    if (!passwordNueva) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Debe indicar una contraseña temporal.'
      });
    }

    if (passwordNueva.length < 8) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'La contraseña temporal debe tener al menos 8 caracteres.'
      });
    }

    if (passwordNueva.length > 72) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'La contraseña temporal no puede superar los 72 caracteres.'
      });
    }

    const result = await buscarAlumnoPorIdConPermiso(req.params.id, req.user);

    if (!result.ok) {
      await transaction.rollback();

      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    const alumno = result.alumno;
    const loginRecord = await AlumnosLoginModel.findOne({
      where: { alumno_id: Number(alumno.id) },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!loginRecord) {
      await transaction.rollback();

      return res.status(404).json({
        ok: false,
        message: 'El alumno no tiene acceso al portal configurado.'
      });
    }

    const valoresAnteriores = {
      estado: loginRecord.estado,
      requiere_cambio_password:
        Number(loginRecord.requiere_cambio_password || 0) === 1,
      password_cambiado_at: loginRecord.password_cambiado_at || null,
      intentos_fallidos: Number(loginRecord.intentos_fallidos || 0),
      bloqueado_hasta: loginRecord.bloqueado_hasta || null
    };

    const nuevoHash = await bcrypt.hash(String(passwordNueva), 10);
    const estadoNuevo =
      loginRecord.estado === 'suspendido' ? 'suspendido' : 'activo';

    await loginRecord.update(
      {
        password_hash: nuevoHash,
        requiere_cambio_password: 1,
        password_cambiado_at: null,
        estado: estadoNuevo,
        motivo_bloqueo:
          loginRecord.estado === 'suspendido'
            ? loginRecord.motivo_bloqueo
            : null,
        intentos_fallidos: 0,
        bloqueado_hasta: null,
        reset_token_hash: null,
        reset_token_expira: null,
        updated_at: new Date()
      },
      { transaction }
    );

    await registrarAuditoriaAccesoAlumno({
      req,
      alumno,
      entidadId: loginRecord.id,
      accion: 'RESTABLECER_PASSWORD',
      descripcion: `Se estableció una contraseña temporal para ${alumno.nombre} ${alumno.apellido}.`,
      valoresAnteriores,
      valoresNuevos: {
        estado: estadoNuevo,
        requiere_cambio_password: true,
        password_temporal_configurada: true,
        intentos_fallidos: 0,
        bloqueado_hasta: null
      },
      transaction
    });

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message:
        estadoNuevo === 'suspendido'
          ? 'Contraseña actualizada. El acceso continúa suspendido.'
          : 'Contraseña temporal actualizada. El alumno deberá cambiarla al ingresar.',
      data: construirEstadoAccesoAlumno(loginRecord)
    });
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }

    console.error('Error UR_RestablecerPasswordAccesoAlumno_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al restablecer la contraseña del alumno.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/06/30 - Elimina físicamente un alumno y sus relaciones conocidas en orden controlado.
 */
export const DR_Alumnos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  const tablasTemporales = [
    'tmp_delete_alumno_finanzas',
    'tmp_delete_alumno_cobros_pagos',
    'tmp_delete_alumno_cobros',
    'tmp_delete_alumno_bonificaciones',
    'tmp_delete_alumno_saldos',
    'tmp_delete_alumno_reservas',
    'tmp_delete_alumno_anamnesis',
    'tmp_delete_alumno_pagos',
    'tmp_delete_alumno_mensualidades',
    'tmp_delete_alumno_membresias'
  ];

  const limpiarTemporales = async () => {
    for (const tabla of tablasTemporales) {
      await db.query(`DROP TEMPORARY TABLE IF EXISTS ${tabla}`, {
        transaction
      });
    }
  };

  try {
    const esPreviewEliminacion = Boolean(req.esPreviewEliminacion);

    if (String(req.user?.rol_codigo || '').toUpperCase() !== 'SUPER_ADMIN') {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message:
          'La eliminación física de alumnos está disponible únicamente para SUPER_ADMIN.'
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
    const alumnoId = Number(alumnoPlano.id);

    if (!esPreviewEliminacion) {
      const dniConfirmacion = String(req.body?.dni_confirmacion || '').replace(
        /\D/g,
        ''
      );
      const dniAlumno = String(alumnoPlano.dni || '').replace(/\D/g, '');

      if (!dniConfirmacion || dniConfirmacion !== dniAlumno) {
        await transaction.rollback();

        return res.status(422).json({
          ok: false,
          code: 'ALUMNO_DELETE_DNI_CONFIRMATION_INVALID',
          message:
            'El DNI ingresado no coincide con el alumno. No se realizó ninguna eliminación.'
        });
      }
    }

    /*
     * Limpieza preventiva: una conexión reutilizada por el pool puede conservar
     * tablas temporales si una ejecución anterior terminó de forma inesperada.
     */
    await limpiarTemporales();

    /*
     * 1) Congelar todos los IDs relacionados antes de comenzar el borrado.
     */
    await db.query(
      `
        CREATE TEMPORARY TABLE tmp_delete_alumno_membresias AS
        SELECT id
        FROM alumnos_membresias
        WHERE alumno_id = :alumnoId
      `,
      {
        replacements: { alumnoId },
        transaction
      }
    );

    await db.query(
      `
        CREATE TEMPORARY TABLE tmp_delete_alumno_mensualidades AS
        SELECT DISTINCT pm.id
        FROM pagos_mensualidades pm
        LEFT JOIN tmp_delete_alumno_membresias tam
          ON tam.id = pm.membresia_id
        WHERE pm.alumno_id = :alumnoId
           OR tam.id IS NOT NULL
      `,
      {
        replacements: { alumnoId },
        transaction
      }
    );

    await db.query(
      `
        CREATE TEMPORARY TABLE tmp_delete_alumno_pagos AS
        SELECT DISTINCT pp.id
        FROM pagos_pagos pp
        LEFT JOIN tmp_delete_alumno_mensualidades tm
          ON tm.id = pp.mensualidad_id
        WHERE pp.alumno_id = :alumnoId
           OR tm.id IS NOT NULL
      `,
      {
        replacements: { alumnoId },
        transaction
      }
    );

    await db.query(
      `
        CREATE TEMPORARY TABLE tmp_delete_alumno_anamnesis AS
        SELECT id
        FROM alumnos_anamnesis
        WHERE alumno_id = :alumnoId
      `,
      {
        replacements: { alumnoId },
        transaction
      }
    );

    await db.query(
      `
        CREATE TEMPORARY TABLE tmp_delete_alumno_reservas AS
        SELECT DISTINCT atr.id
        FROM agenda_turnos_reservas atr
        LEFT JOIN tmp_delete_alumno_membresias tam
          ON tam.id = atr.membresia_id
        WHERE atr.alumno_id = :alumnoId
           OR tam.id IS NOT NULL
      `,
      {
        replacements: { alumnoId },
        transaction
      }
    );

    await db.query(
      `
        CREATE TEMPORARY TABLE tmp_delete_alumno_saldos AS
        SELECT id
        FROM alumnos_saldos
        WHERE alumno_id = :alumnoId
      `,
      {
        replacements: { alumnoId },
        transaction
      }
    );

    await db.query(
      `
        CREATE TEMPORARY TABLE tmp_delete_alumno_bonificaciones AS
        SELECT DISTINCT ab.id
        FROM alumnos_bonificaciones ab
        LEFT JOIN tmp_delete_alumno_mensualidades tm
          ON tm.id = ab.mensualidad_id
        WHERE ab.alumno_id = :alumnoId
           OR tm.id IS NOT NULL
      `,
      {
        replacements: { alumnoId },
        transaction
      }
    );

    await db.query(
      `
        CREATE TEMPORARY TABLE tmp_delete_alumno_cobros AS
        SELECT DISTINCT
          c.id,
          c.finanzas_movimiento_id,
          c.finanzas_reversion_id
        FROM cobros_cobros c
        LEFT JOIN cobros_detalles cd
          ON cd.cobro_id = c.id
        LEFT JOIN tmp_delete_alumno_membresias tam
          ON tam.id = cd.membresia_id
        LEFT JOIN tmp_delete_alumno_mensualidades tm
          ON tm.id = cd.mensualidad_id
        LEFT JOIN tmp_delete_alumno_pagos tp
          ON tp.id = cd.pago_id
        WHERE c.alumno_id = :alumnoId
           OR tam.id IS NOT NULL
           OR tm.id IS NOT NULL
           OR tp.id IS NOT NULL
      `,
      {
        replacements: { alumnoId },
        transaction
      }
    );

    await db.query(
      `
        CREATE TEMPORARY TABLE tmp_delete_alumno_cobros_pagos AS
        SELECT DISTINCT cp.id
        FROM cobros_pagos cp
        INNER JOIN tmp_delete_alumno_cobros tc
          ON tc.id = cp.cobro_id
      `,
      { transaction }
    );

    /*
     * MySQL no permite reabrir la misma tabla temporal más de una vez dentro
     * de una única sentencia. Se consolidan previamente los movimientos
     * financieros para consultarlos y borrarlos usando una sola referencia.
     */
    await db.query(
      `
        CREATE TEMPORARY TABLE tmp_delete_alumno_finanzas (
          id BIGINT UNSIGNED NOT NULL PRIMARY KEY
        )
      `,
      { transaction }
    );

    await db.query(
      `
        INSERT IGNORE INTO tmp_delete_alumno_finanzas (id)
        SELECT fm.id
        FROM finanzas_movimientos fm
        INNER JOIN tmp_delete_alumno_pagos tp
          ON tp.id = fm.pago_id
      `,
      { transaction }
    );

    await db.query(
      `
        INSERT IGNORE INTO tmp_delete_alumno_finanzas (id)
        SELECT tc.finanzas_movimiento_id
        FROM tmp_delete_alumno_cobros tc
        WHERE tc.finanzas_movimiento_id IS NOT NULL
      `,
      { transaction }
    );

    await db.query(
      `
        INSERT IGNORE INTO tmp_delete_alumno_finanzas (id)
        SELECT tc.finanzas_reversion_id
        FROM tmp_delete_alumno_cobros tc
        WHERE tc.finanzas_reversion_id IS NOT NULL
      `,
      { transaction }
    );

    /*
     * 2) Diagnóstico previo para informar exactamente qué registros se quitaron.
     * Cada conteo se ejecuta en una sentencia independiente. Esto evita
     * ER_CANT_REOPEN_TABLE de MySQL al reutilizar tablas temporales dentro
     * de un único SELECT compuesto con UNION ALL.
     */
    const consultasRelaciones = [
      {
        tabla: 'cajas_movimientos',
        sql: `
          SELECT COUNT(DISTINCT cm.id) AS cantidad
          FROM cajas_movimientos cm
          INNER JOIN tmp_delete_alumno_cobros_pagos tcp
            ON tcp.id = cm.cobro_pago_id
        `
      },
      {
        tabla: 'alumnos_saldos_movimientos',
        sql: `
          SELECT COUNT(DISTINCT asm.id) AS cantidad
          FROM alumnos_saldos_movimientos asm
          LEFT JOIN tmp_delete_alumno_saldos tas
            ON tas.id = asm.saldo_id
          LEFT JOIN tmp_delete_alumno_cobros tc
            ON tc.id = asm.cobro_id
          LEFT JOIN tmp_delete_alumno_bonificaciones tab
            ON tab.id = asm.bonificacion_id
          WHERE asm.alumno_id = :alumnoId
             OR tas.id IS NOT NULL
             OR tc.id IS NOT NULL
             OR tab.id IS NOT NULL
        `
      },
      {
        tabla: 'cobros_detalles',
        sql: `
          SELECT COUNT(DISTINCT cd.id) AS cantidad
          FROM cobros_detalles cd
          INNER JOIN tmp_delete_alumno_cobros tc
            ON tc.id = cd.cobro_id
        `
      },
      {
        tabla: 'cobros_pagos',
        sql: `SELECT COUNT(*) AS cantidad FROM tmp_delete_alumno_cobros_pagos`
      },
      {
        tabla: 'cobros_cobros',
        sql: `SELECT COUNT(*) AS cantidad FROM tmp_delete_alumno_cobros`
      },
      {
        tabla: 'arca_comprobantes',
        sql: `
          SELECT COUNT(DISTINCT ac.id) AS cantidad
          FROM arca_comprobantes ac
          LEFT JOIN tmp_delete_alumno_pagos tp
            ON tp.id = ac.pago_id
          WHERE ac.alumno_id = :alumnoId
             OR tp.id IS NOT NULL
        `
      },
      {
        tabla: 'finanzas_movimientos',
        sql: `SELECT COUNT(*) AS cantidad FROM tmp_delete_alumno_finanzas`
      },
      {
        tabla: 'alumnos_bonificaciones',
        sql: `SELECT COUNT(*) AS cantidad FROM tmp_delete_alumno_bonificaciones`
      },
      {
        tabla: 'alumnos_saldos',
        sql: `SELECT COUNT(*) AS cantidad FROM tmp_delete_alumno_saldos`
      },
      {
        tabla: 'pagos_pagos',
        sql: `SELECT COUNT(*) AS cantidad FROM tmp_delete_alumno_pagos`
      },
      {
        tabla: 'pagos_mensualidades',
        sql: `SELECT COUNT(*) AS cantidad FROM tmp_delete_alumno_mensualidades`
      },
      {
        tabla: 'alumnos_asistencias',
        sql: `
          SELECT COUNT(DISTINCT aa.id) AS cantidad
          FROM alumnos_asistencias aa
          LEFT JOIN tmp_delete_alumno_membresias tam
            ON tam.id = aa.membresia_id
          LEFT JOIN tmp_delete_alumno_reservas tr
            ON tr.id = aa.reserva_id
          WHERE aa.alumno_id = :alumnoId
             OR tam.id IS NOT NULL
             OR tr.id IS NOT NULL
        `
      },
      {
        tabla: 'agenda_turnos_reservas',
        sql: `SELECT COUNT(*) AS cantidad FROM tmp_delete_alumno_reservas`
      },
      {
        tabla: 'alumnos_anamnesis_historial',
        sql: `
          SELECT COUNT(DISTINCT aah.id) AS cantidad
          FROM alumnos_anamnesis_historial aah
          LEFT JOIN tmp_delete_alumno_anamnesis taa
            ON taa.id = aah.anamnesis_id
          WHERE aah.alumno_id = :alumnoId
             OR taa.id IS NOT NULL
        `
      },
      {
        tabla: 'alumnos_anamnesis',
        sql: `SELECT COUNT(*) AS cantidad FROM tmp_delete_alumno_anamnesis`
      },
      {
        tabla: 'agenda_turnos_lista_espera',
        sql: `
          SELECT COUNT(*) AS cantidad
          FROM agenda_turnos_lista_espera
          WHERE alumno_id = :alumnoId
        `
      },
      {
        tabla: 'pagos_metodos_recurrentes',
        sql: `
          SELECT COUNT(*) AS cantidad
          FROM pagos_metodos_recurrentes
          WHERE alumno_id = :alumnoId
        `
      },
      {
        tabla: 'sistema_alertas',
        sql: `
          SELECT COUNT(*) AS cantidad
          FROM sistema_alertas
          WHERE alumno_id = :alumnoId
        `
      },
      {
        tabla: 'alumnos_contactos_emergencia',
        sql: `
          SELECT COUNT(*) AS cantidad
          FROM alumnos_contactos_emergencia
          WHERE alumno_id = :alumnoId
        `
      },
      {
        tabla: 'alumnos_usuarios',
        sql: `
          SELECT COUNT(*) AS cantidad
          FROM alumnos_usuarios
          WHERE alumno_id = :alumnoId
        `
      },
      {
        tabla: 'alumnos_membresias',
        sql: `SELECT COUNT(*) AS cantidad FROM tmp_delete_alumno_membresias`
      },
      {
        tabla: 'alumnos_alumnos',
        sql: `
          SELECT COUNT(*) AS cantidad
          FROM alumnos_alumnos
          WHERE id = :alumnoId
        `
      }
    ];

    const relacionesRows = [];

    for (const consulta of consultasRelaciones) {
      const filas = await db.query(consulta.sql, {
        replacements: { alumnoId },
        type: QueryTypes.SELECT,
        transaction
      });

      relacionesRows.push({
        tabla: consulta.tabla,
        cantidad: Number(filas?.[0]?.cantidad || 0)
      });
    }

    const relacionesDetectadas = relacionesRows.reduce((acc, row) => {
      acc[row.tabla] = Number(row.cantidad || 0);
      return acc;
    }, {});

    const relacionesConDatos = relacionesRows
      .filter((row) => Number(row.cantidad || 0) > 0)
      .map((row) => ({
        tabla: row.tabla,
        cantidad: Number(row.cantidad || 0)
      }));

    const totalRegistrosAEliminar = relacionesConDatos.reduce(
      (acc, item) => acc + Number(item.cantidad || 0),
      0
    );
    const totalRelacionesAsociadas = relacionesConDatos
      .filter((item) => item.tabla !== 'alumnos_alumnos')
      .reduce((acc, item) => acc + Number(item.cantidad || 0), 0);
    const tablasFinancieras = new Set([
      'pagos_mensualidades',
      'pagos_pagos',
      'cobros_cobros',
      'cobros_detalles',
      'cobros_pagos',
      'cajas_movimientos',
      'finanzas_movimientos',
      'alumnos_saldos',
      'alumnos_saldos_movimientos',
      'alumnos_bonificaciones',
      'pagos_metodos_recurrentes',
      'arca_comprobantes'
    ]);
    const tieneRegistrosFinancieros = relacionesConDatos.some(
      (item) =>
        tablasFinancieras.has(item.tabla) && Number(item.cantidad || 0) > 0
    );

    if (esPreviewEliminacion) {
      await limpiarTemporales();
      await transaction.rollback();

      return res.status(200).json({
        ok: true,
        message: 'Previsualización de eliminación generada correctamente.',
        data: {
          alumno: {
            id: alumnoId,
            nombre: alumnoPlano.nombre,
            apellido: alumnoPlano.apellido,
            dni: alumnoPlano.dni,
            sede_id: alumnoPlano.sede_id || null,
            estado: alumnoPlano.estado || null
          },
          total_registros_a_eliminar: totalRegistrosAEliminar,
          total_relaciones_asociadas: totalRelacionesAsociadas,
          tiene_registros_financieros: tieneRegistrosFinancieros,
          relaciones_detectadas: relacionesDetectadas,
          relaciones_con_datos: relacionesConDatos
        }
      });
    }

    /*
     * 3) Borrado físico en orden de dependencia.
     * Se eliminan primero los hijos más profundos y al final el alumno.
     */
    await db.query(
      `
        DELETE cm
        FROM cajas_movimientos cm
        INNER JOIN tmp_delete_alumno_cobros_pagos tcp
          ON tcp.id = cm.cobro_pago_id
      `,
      { transaction }
    );

    await db.query(
      `
        DELETE asm
        FROM alumnos_saldos_movimientos asm
        LEFT JOIN tmp_delete_alumno_saldos tas
          ON tas.id = asm.saldo_id
        LEFT JOIN tmp_delete_alumno_cobros tc
          ON tc.id = asm.cobro_id
        LEFT JOIN tmp_delete_alumno_bonificaciones tab
          ON tab.id = asm.bonificacion_id
        WHERE asm.alumno_id = :alumnoId
           OR tas.id IS NOT NULL
           OR tc.id IS NOT NULL
           OR tab.id IS NOT NULL
      `,
      {
        replacements: { alumnoId },
        transaction
      }
    );

    await db.query(
      `
        DELETE cd
        FROM cobros_detalles cd
        INNER JOIN tmp_delete_alumno_cobros tc
          ON tc.id = cd.cobro_id
      `,
      { transaction }
    );

    await db.query(
      `
        DELETE cp
        FROM cobros_pagos cp
        INNER JOIN tmp_delete_alumno_cobros_pagos tcp
          ON tcp.id = cp.id
      `,
      { transaction }
    );

    await db.query(
      `
        DELETE c
        FROM cobros_cobros c
        INNER JOIN tmp_delete_alumno_cobros tc
          ON tc.id = c.id
      `,
      { transaction }
    );

    await db.query(
      `
        DELETE ac
        FROM arca_comprobantes ac
        LEFT JOIN tmp_delete_alumno_pagos tp
          ON tp.id = ac.pago_id
        WHERE ac.alumno_id = :alumnoId
           OR tp.id IS NOT NULL
      `,
      {
        replacements: { alumnoId },
        transaction
      }
    );

    await db.query(
      `
        DELETE fm
        FROM finanzas_movimientos fm
        INNER JOIN tmp_delete_alumno_finanzas tf
          ON tf.id = fm.id
      `,
      { transaction }
    );

    await db.query(
      `
        DELETE ab
        FROM alumnos_bonificaciones ab
        INNER JOIN tmp_delete_alumno_bonificaciones tab
          ON tab.id = ab.id
      `,
      { transaction }
    );

    await db.query(
      `
        DELETE pp
        FROM pagos_pagos pp
        INNER JOIN tmp_delete_alumno_pagos tp
          ON tp.id = pp.id
      `,
      { transaction }
    );

    await db.query(
      `
        DELETE pm
        FROM pagos_mensualidades pm
        INNER JOIN tmp_delete_alumno_mensualidades tm
          ON tm.id = pm.id
      `,
      { transaction }
    );

    await db.query(
      `
        DELETE aa
        FROM alumnos_asistencias aa
        LEFT JOIN tmp_delete_alumno_membresias tam
          ON tam.id = aa.membresia_id
        LEFT JOIN tmp_delete_alumno_reservas tr
          ON tr.id = aa.reserva_id
        WHERE aa.alumno_id = :alumnoId
           OR tam.id IS NOT NULL
           OR tr.id IS NOT NULL
      `,
      {
        replacements: { alumnoId },
        transaction
      }
    );

    await db.query(
      `
        DELETE atr
        FROM agenda_turnos_reservas atr
        INNER JOIN tmp_delete_alumno_reservas tr
          ON tr.id = atr.id
      `,
      { transaction }
    );

    await db.query(
      `
        DELETE aah
        FROM alumnos_anamnesis_historial aah
        LEFT JOIN tmp_delete_alumno_anamnesis taa
          ON taa.id = aah.anamnesis_id
        WHERE aah.alumno_id = :alumnoId
           OR taa.id IS NOT NULL
      `,
      {
        replacements: { alumnoId },
        transaction
      }
    );

    await db.query(
      `
        DELETE aa
        FROM alumnos_anamnesis aa
        INNER JOIN tmp_delete_alumno_anamnesis taa
          ON taa.id = aa.id
      `,
      { transaction }
    );

    await db.query(
      `
        DELETE FROM agenda_turnos_lista_espera
        WHERE alumno_id = :alumnoId
      `,
      {
        replacements: { alumnoId },
        transaction
      }
    );

    await db.query(
      `
        DELETE FROM pagos_metodos_recurrentes
        WHERE alumno_id = :alumnoId
      `,
      {
        replacements: { alumnoId },
        transaction
      }
    );

    await db.query(
      `
        DELETE FROM sistema_alertas
        WHERE alumno_id = :alumnoId
      `,
      {
        replacements: { alumnoId },
        transaction
      }
    );

    await db.query(
      `
        DELETE FROM alumnos_contactos_emergencia
        WHERE alumno_id = :alumnoId
      `,
      {
        replacements: { alumnoId },
        transaction
      }
    );

    /*
     * El modelo MD_TB_AlumnosLogin usa físicamente alumnos_usuarios.
     * La tabla alumnos_login no existe y era la causa del error 500.
     */
    await db.query(
      `
        DELETE FROM alumnos_usuarios
        WHERE alumno_id = :alumnoId
      `,
      {
        replacements: { alumnoId },
        transaction
      }
    );

    await db.query(
      `
        DELETE am
        FROM alumnos_membresias am
        INNER JOIN tmp_delete_alumno_membresias tam
          ON tam.id = am.id
      `,
      { transaction }
    );

    await db.query(
      `
        DELETE als
        FROM alumnos_saldos als
        INNER JOIN tmp_delete_alumno_saldos tas
          ON tas.id = als.id
      `,
      { transaction }
    );

    await alumno.destroy({ transaction });

    await limpiarTemporales();
    await transaction.commit();

    const totalRelacionesEliminadas = totalRegistrosAEliminar;

    return res.status(200).json({
      ok: true,
      message: 'Alumno eliminado físicamente correctamente.',
      detalle:
        totalRelacionesEliminadas > 1
          ? 'También se eliminaron todas las relaciones asociadas detectadas.'
          : 'El alumno no tenía relaciones asociadas fuera de su propio registro.',
      total_relaciones_eliminadas: totalRelacionesEliminadas,
      relaciones_detectadas: relacionesDetectadas,
      relaciones_eliminadas: relacionesConDatos,
      data: {
        id: alumnoId,
        nombre: alumnoPlano.nombre,
        apellido: alumnoPlano.apellido,
        dni: alumnoPlano.dni,
        usuario_app_id: alumnoPlano.usuario_app_id || null
      }
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }

    console.error('Error DR_Alumnos_CTS:', error);

    const codigo = error?.original?.code || error?.parent?.code || null;
    const tabla = error?.table || error?.original?.table || null;
    const constraint =
      error?.index ||
      error?.constraint ||
      error?.original?.constraint ||
      null;

    if (
      error?.name === 'SequelizeForeignKeyConstraintError' ||
      codigo === 'ER_ROW_IS_REFERENCED_2'
    ) {
      return res.status(409).json({
        ok: false,
        code: codigo || 'ALUMNO_DELETE_RELATION_NOT_HANDLED',
        message:
          'No se pudo completar el borrado físico porque existe una relación adicional no contemplada.',
        detalle: {
          tabla,
          constraint,
          campos: error?.fields || []
        }
      });
    }

    return res.status(500).json({
      ok: false,
      code: codigo || 'ALUMNO_DELETE_ERROR',
      message: 'Error al eliminar físicamente el alumno.',
      detalle: {
        tabla,
        constraint
      }
    });
  }
};

/*
 * Benjamin Orellana - 2026/08/01 - Previsualiza todas las relaciones que
 * serán eliminadas antes de confirmar el borrado físico del alumno.
 */
export const OBR_PreviewEliminacionAlumno_CTS = async (req, res) => {
  req.esPreviewEliminacion = true;
  return DR_Alumnos_CTS(req, res);
};

