/*
 * Programador: Sergio Gustavo Manrique
 * Fecha Creación: 03 / 06 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_AlumnosAnamnesisHistorial.js) contiene los controladores
 * Sequelize para la tabla alumnos_anamnesis_historial.
 * Solo expone endpoints de lectura: el historial se crea automáticamente
 * desde los controllers de anamnesis antes de cada UPDATE.
 *
 * Tema: Controladores - Alumno / Anamnesis Historial
 *
 * Capa: Backend
 */

import { Op } from 'sequelize';

import AlumnosModel from '../../Models/Alumno/MD_TB_Alumnos.js';
import AlumnosAnamnesisModel from '../../Models/Alumno/MD_TB_AlumnosAnamnesis.js';
import AlumnosAnamnesisHistorialModel from '../../Models/Alumno/MD_TB_AlumnosAnamnesisHistorial.js';
import UsuariosModel from '../../Models/Usuario/MD_TB_Usuarios.js';

// ─── Roles ────────────────────────────────────────────────────────────────────

const ROLES_LECTURA_ANAMNESIS = [
  'SUPER_ADMIN',
  'DIRECCION',
  'FRONT_COMERCIAL',
  'COORD_SEDE',
  'PROFESOR'
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const usuarioEsGlobal = (user) =>
  ['SUPER_ADMIN', 'DIRECCION'].includes(user?.rol_codigo);

const obtenerSedesPermitidasUsuario = (user) => {
  if (!user || !Array.isArray(user.sedes)) return [];

  return user.sedes
    .filter(
      (sede) =>
        sede?.asignacion?.activo !== false &&
        sede?.asignacion?.puede_operar !== false
    )
    .map((sede) => Number(sede.id || sede.sede_id))
    .filter(Boolean);
};

const usuarioPuedeOperarSede = (user, sedeId) => {
  if (!sedeId) return false;
  if (usuarioEsGlobal(user)) return true;

  return obtenerSedesPermitidasUsuario(user).includes(Number(sedeId));
};

const validarRolLecturaAnamnesis = (user) =>
  ROLES_LECTURA_ANAMNESIS.includes(user?.rol_codigo);

const eliminarPasswordHash = (usuario = {}) => {
  if (!usuario) return null;

  const plano =
    typeof usuario.toJSON === 'function' ? usuario.toJSON() : { ...usuario };

  delete plano.password_hash;

  return plano;
};

/*
 * Arma el objeto de respuesta enriquecido para un registro del historial.
 */
const construirHistorialRespuesta = async (registro) => {
  if (!registro) return null;

  const item =
    typeof registro.toJSON === 'function' ? registro.toJSON() : registro;

  const [alumno, usuarioModificacion] = await Promise.all([
    item.alumno_id ? AlumnosModel.findByPk(item.alumno_id) : null,
    item.usuario_modificacion_id
      ? UsuariosModel.findByPk(item.usuario_modificacion_id)
      : null
  ]);

  return {
    ...item,
    alumno: alumno
      ? typeof alumno.toJSON === 'function'
        ? alumno.toJSON()
        : alumno
      : null,
    usuario_modificacion: usuarioModificacion
      ? eliminarPasswordHash(usuarioModificacion)
      : null
  };
};

// ─── Controladores ────────────────────────────────────────────────────────────

/*
 * Sergio Gustavo Manrique - 2026/06/03
 * GET /alumnos/anamnesis/:anamnesis_id/historial
 * Devuelve todas las versiones anteriores de una anamnesis, ordenadas
 * de más reciente a más antigua.
 * Acceso: roles de lectura de anamnesis.
 */
export const OBRS_HistorialAnamnesis_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaAnamnesis(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para ver el historial de anamnesis.'
      });
    }

    const { anamnesis_id } = req.params;

    // Verificar que la anamnesis existe y que el usuario tiene acceso a la sede del alumno.
    const anamnesis = await AlumnosAnamnesisModel.findByPk(anamnesis_id);

    if (!anamnesis) {
      return res.status(404).json({
        ok: false,
        message: 'Anamnesis no encontrada.'
      });
    }

    const anamnesisPlano =
      typeof anamnesis.toJSON === 'function' ? anamnesis.toJSON() : anamnesis;

    const alumno = await AlumnosModel.findByPk(anamnesisPlano.alumno_id);

    if (!alumno) {
      return res.status(404).json({
        ok: false,
        message: 'Alumno asociado a la anamnesis no encontrado.'
      });
    }

    const alumnoPlano =
      typeof alumno.toJSON === 'function' ? alumno.toJSON() : alumno;

    if (!usuarioPuedeOperarSede(req.user, alumnoPlano.sede_id)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene acceso al historial de este alumno.'
      });
    }

    const registros = await AlumnosAnamnesisHistorialModel.findAll({
      where: { anamnesis_id: Number(anamnesis_id) },
      order: [['archivado_at', 'DESC']]
    });

    const data = await Promise.all(
      registros.map((r) => construirHistorialRespuesta(r))
    );

    return res.status(200).json({
      ok: true,
      total: data.length,
      data
    });
  } catch (error) {
    console.error('Error OBRS_HistorialAnamnesis_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener el historial de la anamnesis.'
    });
  }
};

/*
 * Sergio Gustavo Manrique - 2026/06/03
 * GET /alumnos/:alumno_id/anamnesis/historial
 * Devuelve todo el historial de anamnesis de un alumno (todas sus versiones
 * archivadas), ordenado de más reciente a más antigua.
 * Útil para ver la línea de tiempo completa sin filtrar por anamnesis_id.
 * Acceso: roles de lectura de anamnesis.
 */
export const OBRS_HistorialAnamnesisAlumno_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaAnamnesis(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para ver el historial de anamnesis.'
      });
    }

    const { alumno_id } = req.params;

    const alumno = await AlumnosModel.findByPk(alumno_id);

    if (!alumno) {
      return res.status(404).json({
        ok: false,
        message: 'Alumno no encontrado.'
      });
    }

    const alumnoPlano =
      typeof alumno.toJSON === 'function' ? alumno.toJSON() : alumno;

    if (!usuarioPuedeOperarSede(req.user, alumnoPlano.sede_id)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene acceso al historial de este alumno.'
      });
    }

    const registros = await AlumnosAnamnesisHistorialModel.findAll({
      where: { alumno_id: Number(alumno_id) },
      order: [['archivado_at', 'DESC']]
    });

    const data = await Promise.all(
      registros.map((r) => construirHistorialRespuesta(r))
    );

    return res.status(200).json({
      ok: true,
      total: data.length,
      data
    });
  } catch (error) {
    console.error('Error OBRS_HistorialAnamnesisAlumno_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener el historial de anamnesis del alumno.'
    });
  }
};

/*
 * Sergio Gustavo Manrique - 2026/06/03
 * GET /alumnos/anamnesis/historial/:id
 * Devuelve el detalle de una versión histórica específica por su id.
 * Acceso: roles de lectura de anamnesis.
 */
export const OBRS_DetalleHistorialAnamnesis_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaAnamnesis(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para ver el historial de anamnesis.'
      });
    }

    const { id } = req.params;

    const registro = await AlumnosAnamnesisHistorialModel.findByPk(id);

    if (!registro) {
      return res.status(404).json({
        ok: false,
        message: 'Versión histórica no encontrada.'
      });
    }

    const registroPlano =
      typeof registro.toJSON === 'function' ? registro.toJSON() : registro;

    const alumno = await AlumnosModel.findByPk(registroPlano.alumno_id);

    if (!alumno) {
      return res.status(404).json({
        ok: false,
        message: 'Alumno asociado no encontrado.'
      });
    }

    const alumnoPlano =
      typeof alumno.toJSON === 'function' ? alumno.toJSON() : alumno;

    if (!usuarioPuedeOperarSede(req.user, alumnoPlano.sede_id)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene acceso a este registro histórico.'
      });
    }

    const data = await construirHistorialRespuesta(registro);

    return res.status(200).json({
      ok: true,
      data
    });
  } catch (error) {
    console.error('Error OBRS_DetalleHistorialAnamnesis_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener el detalle del historial.'
    });
  }
};


export const OBRS_MiHistorialAnamnesis_CTS = async (
  req,
  res
) => {
  try {

    console.log('ENTRO AL CONTROLADOR');
    const alumnoId =
      req.alumno?.id ||
      req.alumno?.alumno_id;

    const anamnesis =
      await AlumnosAnamnesisModel.findAll({
        where: {
          alumno_id: alumnoId
        },
        order: [['created_at', 'DESC']]
      });

    return res.status(200).json({
      ok: true,
      total: anamnesis.length,
      data: anamnesis
    });

  } catch (error) {
    console.error(
      'OBRS_MiHistorialAnamnesis_CTS:',
      error
    );

    return res.status(500).json({
      ok: false,
      message:
        'Error al obtener el historial.'
    });
  }
};