/*
 * Programador: Sergio Manrique
 * Fecha Creación: 08 / 07 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_AlumnosAsistencias.js) contiene el controlador de
 * solo lectura para consultar el historial de asistencias de un alumno
 * (tabla alumnos_asistencias), usado en la ficha del alumno (VerAlumno).
 *
 * Tema: Controladores - Alumno
 * Capa: Backend
 */

import AlumnosModel              from '../../Models/Alumno/MD_TB_Alumnos.js';
import AlumnosAsistenciasModel   from '../../Models/Alumno/MD_TB_AlumnosAsistencias.js';
import AgendaTurnosModel         from '../../Models/Agenda/MD_TB_AgendaTurnos.js';
import SedesModel                from '../../Models/Sede/MD_TB_Sedes.js';
import UsuariosModel             from '../../Models/Usuario/MD_TB_Usuarios.js';
import db                        from '../../DataBase/db.js';
import { QueryTypes }            from 'sequelize';

// Umbral por defecto (días) para considerar a un alumno activo como
// "inactivo" por falta de asistencia. Coincide con lo pedido: alertar a
// partir de 7 días sin asistir.
const UMBRAL_DIAS_INACTIVIDAD_DEFAULT = 7;

// Number(x) || DEFAULT trataría "0" como falsy y lo reemplazaría por el
// default, impidiendo pedir explícitamente umbral_dias=0. Se valida con
// Number.isFinite para respetar ese caso.
const parsearUmbralDias = (valor) => {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : UMBRAL_DIAS_INACTIVIDAD_DEFAULT;
};

/*
 * Sergio Manrique - 2026/07/08
 * Lista el historial completo de asistencias de un alumno (más reciente
 * primero), con la sede, el turno y quién la registró. Es la base para el
 * historial, el resumen y la "evolución reciente" que se muestran en la
 * ficha del alumno — no incluye estadísticas calculadas, eso lo arma el
 * frontend a partir de esta lista.
 */
export const OBRS_AsistenciasAlumno_CTS = async (req, res) => {
  try {
    const { alumno_id } = req.params;

    const alumno = await AlumnosModel.findByPk(alumno_id, { attributes: ['id'] });
    if (!alumno) {
      return res.status(404).json({ message: 'Alumno no encontrado.' });
    }

    const asistencias = await AlumnosAsistenciasModel.findAll({
      where: { alumno_id },
      include: [
        { model: SedesModel,        as: 'sede',           attributes: ['id', 'nombre'] },
        { model: AgendaTurnosModel, as: 'turno',           attributes: ['id', 'nombre_clase', 'hora_inicio', 'hora_fin'] },
        { model: UsuariosModel,     as: 'registrado_por',  attributes: ['id', 'nombre', 'apellido'] }
      ],
      order: [['fecha', 'DESC'], ['hora_registro', 'DESC']]
    });

    return res.status(200).json({ status: 'success', data: asistencias, total: asistencias.length });
  } catch (error) {
    console.error('[OBRS_AsistenciasAlumno_CTS]', error);
    return res.status(500).json({ message: 'Error al obtener las asistencias del alumno.' });
  }
};

/*
 * Sergio Manrique - 2026/07/12
 * Estadísticas de asistencia de un alumno, calculadas en el backend (antes se
 * calculaban 100% en el cliente a partir del historial completo). Incluye la
 * alerta de inactividad: si el alumno está "activo" y hace más de
 * `umbral_dias` (default 7) que no tiene una asistencia real ('asistio'),
 * se marca `alerta_inactividad: true`.
 *
 * "Frecuencia semanal real" = promedio de asistencias por semana en las
 * últimas 8 semanas (incluye la semana actual), para comparar el ritmo real
 * del alumno contra lo que su plan/rutina esperaría.
 */
export const OBRS_EstadisticasAsistenciaAlumno_CTS = async (req, res) => {
  try {
    const { alumno_id } = req.params;
    const umbralDias = parsearUmbralDias(req.query.umbral_dias);

    const alumno = await AlumnosModel.findByPk(alumno_id, { attributes: ['id', 'estado', 'fecha_inicio'] });
    if (!alumno) {
      return res.status(404).json({ message: 'Alumno no encontrado.' });
    }

    const asistencias = await AlumnosAsistenciasModel.findAll({
      where: { alumno_id },
      include: [
        { model: AgendaTurnosModel, as: 'turno', attributes: ['id', 'nombre_clase'] }
      ],
      order: [['fecha', 'DESC'], ['hora_registro', 'DESC']]
    });

    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const delMes = asistencias.filter((a) => new Date(a.fecha) >= inicioMes);
    const asistenciasMes = delMes.filter((a) => a.estado === 'asistio').length;
    const ausenciasMes = delMes.filter((a) => a.estado === 'ausente').length;
    const canceladasMes = delMes.filter((a) => a.estado === 'cancelo').length;
    const totalContableMes = asistenciasMes + ausenciasMes;

    const ultimaAsistio = asistencias.find((a) => a.estado === 'asistio');
    const diasSinActividad = ultimaAsistio
      ? Math.floor((hoy - new Date(ultimaAsistio.fecha)) / (1000 * 60 * 60 * 24))
      : null;

    // Si nunca asistió, "días sin actividad" se cuenta desde su fecha de
    // alta (fecha_inicio), no desde el epoch. Evita marcar como "inactivo"
    // a un alumno recién dado de alta que todavía no tuvo su primera clase.
    const diasDesdeAlta = alumno.fecha_inicio
      ? Math.floor((hoy - new Date(alumno.fecha_inicio)) / (1000 * 60 * 60 * 24))
      : null;

    // Racha: cuenta desde el registro más reciente hacia atrás mientras sea
    // "asistio". Se corta apenas aparece cualquier otro estado.
    let racha = 0;
    for (const a of asistencias) {
      if (a.estado !== 'asistio') break;
      racha++;
    }

    // Frecuencia semanal real: asistencias reales en las últimas 8 semanas / 8.
    const SEMANAS_VENTANA = 8;
    const inicioVentana = new Date(hoy);
    inicioVentana.setDate(inicioVentana.getDate() - SEMANAS_VENTANA * 7);
    const asistenciasVentana = asistencias.filter(
      (a) => a.estado === 'asistio' && new Date(a.fecha) >= inicioVentana
    ).length;
    const frecuenciaSemanalReal = Math.round((asistenciasVentana / SEMANAS_VENTANA) * 10) / 10;

    const alumnoActivo = alumno.estado === 'activo';
    const alertaInactividad = alumnoActivo && (
      diasSinActividad !== null
        ? diasSinActividad > umbralDias
        : (diasDesdeAlta !== null && diasDesdeAlta > umbralDias)
    );

    return res.status(200).json({
      status: 'success',
      data: {
        asistencias_mes: asistenciasMes,
        ausencias_mes: ausenciasMes,
        cancelaciones_mes: canceladasMes,
        dias_sin_actividad: diasSinActividad ?? diasDesdeAlta,
        ultima_asistencia: ultimaAsistio?.fecha || null,
        ultima_clase: ultimaAsistio?.turno?.nombre_clase || null,
        racha_actual: racha,
        porcentaje_asistencia: totalContableMes > 0
          ? Math.round((asistenciasMes / totalContableMes) * 100)
          : 0,
        frecuencia_semanal_real: frecuenciaSemanalReal,
        alerta_inactividad: alertaInactividad,
        umbral_dias: umbralDias
      }
    });
  } catch (error) {
    console.error('[OBRS_EstadisticasAsistenciaAlumno_CTS]', error);
    return res.status(500).json({ message: 'Error al calcular las estadísticas de asistencia del alumno.' });
  }
};

/*
 * Sergio Manrique - 2026/07/12
 * Lista alumnos activos que hace más de `umbral_dias` (default 7) que no
 * registran una asistencia real ('asistio'), o que nunca asistieron. Es la
 * base para un futuro panel de alertas de inactividad ("alumno_inactivo").
 * Se resuelve con una consulta agregada directa (MAX + HAVING) porque
 * calcular esto en JS para todos los alumnos sería traer historiales
 * completos innecesariamente.
 */
export const OBRS_AlumnosInactivos_CTS = async (req, res) => {
  try {
    const umbralDias = parsearUmbralDias(req.query.umbral_dias);
    const sedeId = req.query.sede_id || null;

    // Si el alumno nunca asistió (ultima_asistencia IS NULL), se compara
    // contra su fecha de alta (fecha_inicio) en vez de alertar directo —
    // evita marcar como "inactivo" a alguien recién dado de alta que
    // todavía no tuvo su primera clase.
    const alumnos = await db.query(
      `
      SELECT
        a.id,
        a.nombre,
        a.apellido,
        a.dni,
        a.estado,
        a.sede_id,
        a.fecha_inicio,
        MAX(aa.fecha) AS ultima_asistencia,
        COALESCE(DATEDIFF(CURDATE(), MAX(aa.fecha)), DATEDIFF(CURDATE(), a.fecha_inicio)) AS dias_sin_actividad
      FROM alumnos_alumnos a
      LEFT JOIN alumnos_asistencias aa
        ON aa.alumno_id = a.id AND aa.estado = 'asistio'
      WHERE a.estado = 'activo'
        ${sedeId ? 'AND a.sede_id = :sedeId' : ''}
      GROUP BY a.id, a.nombre, a.apellido, a.dni, a.estado, a.sede_id, a.fecha_inicio
      HAVING dias_sin_actividad IS NOT NULL AND dias_sin_actividad > :umbralDias
      ORDER BY (ultima_asistencia IS NULL) DESC, ultima_asistencia ASC
      `,
      {
        replacements: { umbralDias, ...(sedeId ? { sedeId } : {}) },
        type: QueryTypes.SELECT
      }
    );

    return res.status(200).json({ status: 'success', data: alumnos, total: alumnos.length, umbral_dias: umbralDias });
  } catch (error) {
    console.error('[OBRS_AlumnosInactivos_CTS]', error);
    return res.status(500).json({ message: 'Error al obtener el listado de alumnos inactivos.' });
  }
};
