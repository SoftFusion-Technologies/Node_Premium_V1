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

import AlumnosModel from '../../Models/Alumno/MD_TB_Alumnos.js';
import AlumnosAsistenciasModel from '../../Models/Alumno/MD_TB_AlumnosAsistencias.js';
import AlumnosMembresiasModel from '../../Models/Alumno/MD_TB_AlumnosMembresias.js';
import AgendaTurnosModel from '../../Models/Agenda/MD_TB_AgendaTurnos.js';
import SedesModel from '../../Models/Sede/MD_TB_Sedes.js';
import UsuariosModel from '../../Models/Usuario/MD_TB_Usuarios.js';
import db from '../../DataBase/db.js';
import { Op, QueryTypes } from 'sequelize';

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

const fechaDateOnlyLocal = (valor) => {
  if (!valor) return null;

  const [anio, mes, dia] = String(valor).slice(0, 10).split('-').map(Number);
  if (![anio, mes, dia].every(Number.isFinite)) return null;

  return new Date(anio, mes - 1, dia);
};

const fechaActualDateOnly = () => {
  const partes = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const valor = (tipo) => partes.find((parte) => parte.type === tipo)?.value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
};

const esFechaDateOnly = (valor) => /^\d{4}-\d{2}-\d{2}$/.test(String(valor || ''));
const esHoraValida = (valor) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(valor || ''));
const usuarioId = (req) => Number(req.user?.id || req.user?.usuario_id || 0) || null;
const texto = (valor, maximo = 1000) => {
  const normalizado = String(valor || '').trim();
  return normalizado ? normalizado.slice(0, maximo) : null;
};

const construirObservacionManual = (nombreClase, observaciones) => {
  const cabecera = `[CLASE_MANUAL] ${texto(nombreClase, 160) || 'Clase personalizada'}`;
  const detalle = texto(observaciones);
  return detalle ? `${cabecera}\n${detalle}` : cabecera;
};

const nombreClaseAsistencia = (asistencia) => {
  if (asistencia?.turno?.nombre_clase) return asistencia.turno.nombre_clase;

  const coincidencia = String(asistencia?.observaciones || '').match(
    /^\[CLASE_MANUAL\]\s*(.+)$/m
  );
  return coincidencia?.[1] || null;
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

    const alumno = await AlumnosModel.findByPk(alumno_id, {
      attributes: ['id']
    });
    if (!alumno) {
      return res.status(404).json({ message: 'Alumno no encontrado.' });
    }

    const asistencias = await AlumnosAsistenciasModel.findAll({
      where: { alumno_id },
      include: [
        { model: SedesModel, as: 'sede', attributes: ['id', 'nombre'] },
        {
          model: AgendaTurnosModel,
          as: 'turno',
          attributes: ['id', 'nombre_clase', 'hora_inicio', 'hora_fin']
        },
        {
          model: UsuariosModel,
          as: 'registrado_por',
          attributes: ['id', 'nombre', 'apellido']
        }
      ],
      order: [
        ['fecha', 'DESC'],
        ['hora_registro', 'DESC']
      ]
    });

    return res
      .status(200)
      .json({
        status: 'success',
        data: asistencias,
        total: asistencias.length
      });
  } catch (error) {
    console.error('[OBRS_AsistenciasAlumno_CTS]', error);
    return res
      .status(500)
      .json({ message: 'Error al obtener las asistencias del alumno.' });
  }
};

/*
 * Benjamin Orellana - 2026/07/13
 * Historial propio para el portal del alumno. El alumno_id se obtiene del
 * token ALUMNO para impedir consultas sobre historiales ajenos.
 */
export const OBRS_MisAsistencias_CTS = async (req, res) => {
  const alumnoId = req.alumno?.id || req.alumno?.alumno_id;

  if (
    !alumnoId ||
    !Number.isInteger(Number(alumnoId)) ||
    Number(alumnoId) <= 0
  ) {
    return res.status(401).json({
      message: 'No se pudo identificar al alumno autenticado.'
    });
  }

  req.params = {
    ...req.params,
    alumno_id: Number(alumnoId)
  };

  return OBRS_AsistenciasAlumno_CTS(req, res);
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

    const alumno = await AlumnosModel.findByPk(alumno_id, {
      attributes: ['id', 'estado', 'fecha_inicio']
    });
    if (!alumno) {
      return res.status(404).json({ message: 'Alumno no encontrado.' });
    }

    const asistencias = await AlumnosAsistenciasModel.findAll({
      where: { alumno_id },
      include: [
        {
          model: AgendaTurnosModel,
          as: 'turno',
          attributes: ['id', 'nombre_clase']
        }
      ],
      order: [
        ['fecha', 'DESC'],
        ['hora_registro', 'DESC']
      ]
    });

    const hoy = fechaDateOnlyLocal(fechaActualDateOnly());
    const hoyDateOnly = fechaActualDateOnly();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const delMes = asistencias.filter((a) => {
      const fecha = fechaDateOnlyLocal(a.fecha);
      return fecha && fecha >= inicioMes && String(a.fecha) <= hoyDateOnly;
    });
    const asistenciasMes = delMes.filter((a) => a.estado === 'asistio').length;
    const ausenciasMes = delMes.filter((a) => a.estado === 'ausente').length;
    // Una cancelación se contabiliza cuando ocurrió la acción, no por la
    // fecha futura que tenía programada la clase.
    const canceladasMes = asistencias.filter((a) => {
      if (a.estado !== 'cancelo') return false;
      const fechaCancelacion = new Date(a.updated_at || a.created_at || a.fecha);
      return (
        !Number.isNaN(fechaCancelacion.getTime()) &&
        fechaCancelacion >= inicioMes &&
        fechaCancelacion <= new Date()
      );
    }).length;
    const totalContableMes = asistenciasMes + ausenciasMes;

    const ultimaAsistio = asistencias.find(
      (a) => a.estado === 'asistio' && String(a.fecha) <= hoyDateOnly
    );
    const diasSinActividad = ultimaAsistio
      ? Math.floor(
          (hoy - fechaDateOnlyLocal(ultimaAsistio.fecha)) /
            (1000 * 60 * 60 * 24)
        )
      : null;

    // Si nunca asistió, "días sin actividad" se cuenta desde su fecha de
    // alta (fecha_inicio), no desde el epoch. Evita marcar como "inactivo"
    // a un alumno recién dado de alta que todavía no tuvo su primera clase.
    const diasDesdeAlta = alumno.fecha_inicio
      ? Math.floor(
          (hoy - fechaDateOnlyLocal(alumno.fecha_inicio)) /
            (1000 * 60 * 60 * 24)
        )
      : null;

    // Racha: cuenta desde el registro más reciente hacia atrás mientras sea
    // "asistio". Los eventos futuros no alteran una racha ya consolidada.
    let racha = 0;
    for (const a of asistencias.filter((item) => String(item.fecha) <= hoyDateOnly)) {
      if (a.estado !== 'asistio') break;
      racha++;
    }

    // Frecuencia semanal real: asistencias reales en las últimas 8 semanas / 8.
    const SEMANAS_VENTANA = 8;
    const inicioVentana = new Date(hoy);
    inicioVentana.setDate(inicioVentana.getDate() - SEMANAS_VENTANA * 7);
    const asistenciasVentana = asistencias.filter(
      (a) => {
        const fecha = fechaDateOnlyLocal(a.fecha);
        return (
          a.estado === 'asistio' &&
          fecha &&
          fecha >= inicioVentana &&
          String(a.fecha) <= hoyDateOnly
        );
      }
    ).length;
    const frecuenciaSemanalReal =
      Math.round((asistenciasVentana / SEMANAS_VENTANA) * 10) / 10;

    const alumnoActivo = alumno.estado === 'activo';
    const alertaInactividad =
      alumnoActivo &&
      (diasSinActividad !== null
        ? diasSinActividad > umbralDias
        : diasDesdeAlta !== null && diasDesdeAlta > umbralDias);

    return res.status(200).json({
      status: 'success',
      data: {
        asistencias_mes: asistenciasMes,
        ausencias_mes: ausenciasMes,
        cancelaciones_mes: canceladasMes,
        dias_sin_actividad: diasSinActividad ?? diasDesdeAlta,
        ultima_asistencia: ultimaAsistio?.fecha || null,
        ultima_clase: ultimaAsistio
          ? nombreClaseAsistencia(ultimaAsistio)
          : null,
        racha_actual: racha,
        porcentaje_asistencia:
          totalContableMes > 0
            ? Math.round((asistenciasMes / totalContableMes) * 100)
            : 0,
        frecuencia_semanal_real: frecuenciaSemanalReal,
        alerta_inactividad: alertaInactividad,
        umbral_dias: umbralDias
      }
    });
  } catch (error) {
    console.error('[OBRS_EstadisticasAsistenciaAlumno_CTS]', error);
    return res
      .status(500)
      .json({
        message: 'Error al calcular las estadísticas de asistencia del alumno.'
      });
  }
};

/*
 * Registra una asistencia administrativa sin reserva previa. Como no existe
 * una reserva que haya consumido el crédito, descuenta exactamente una clase
 * de la membresía vigente que cubre la fecha indicada.
 */
export const CR_AsistenciaManualAlumno_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const alumnoId = Number(req.params.alumno_id);
    const fecha = String(req.body.fecha || '');
    const hora = String(req.body.hora || '');
    const nombreClase = texto(req.body.nombre_clase, 160) || 'Clase personalizada';

    if (!Number.isInteger(alumnoId) || alumnoId <= 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'El alumno indicado no es válido.' });
    }
    if (!esFechaDateOnly(fecha) || fecha > fechaActualDateOnly()) {
      await transaction.rollback();
      return res.status(400).json({
        message: 'La fecha debe tener formato YYYY-MM-DD y no puede ser futura.'
      });
    }
    if (!esHoraValida(hora)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'La hora debe tener formato HH:mm.' });
    }

    const alumno = await AlumnosModel.findByPk(alumnoId, { transaction });
    if (!alumno) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Alumno no encontrado.' });
    }

    const membresia = await AlumnosMembresiasModel.findOne({
      where: {
        alumno_id: alumnoId,
        sede_id: Number(alumno.sede_id),
        estado: 'activa',
        fecha_inicio: { [Op.lte]: fecha },
        fecha_vencimiento: { [Op.gte]: fecha },
        clases_disponibles: { [Op.gt]: 0 }
      },
      order: [['fecha_inicio', 'DESC'], ['id', 'DESC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!membresia) {
      await transaction.rollback();
      return res.status(409).json({
        message: 'El alumno no tiene una membresía activa con cupos para esa fecha.'
      });
    }

    const horaRegistro = `${hora}:00`;
    const duplicada = await AlumnosAsistenciasModel.findOne({
      where: {
        alumno_id: alumnoId,
        fecha,
        hora_registro: horaRegistro,
        turno_id: null,
        estado: { [Op.ne]: 'cancelo' }
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (duplicada) {
      await transaction.rollback();
      return res.status(409).json({
        message: 'Ya existe una asistencia manual para el alumno en esa fecha y hora.'
      });
    }

    const asistencia = await AlumnosAsistenciasModel.create(
      {
        alumno_id: alumnoId,
        sede_id: Number(alumno.sede_id),
        membresia_id: Number(membresia.id),
        fecha,
        hora_registro: horaRegistro,
        estado: 'asistio',
        registrado_por_id: usuarioId(req),
        observaciones: construirObservacionManual(
          nombreClase,
          req.body.observaciones
        )
      },
      { transaction }
    );

    await membresia.update(
      {
        clases_usadas: Number(membresia.clases_usadas || 0) + 1,
        clases_disponibles: Math.max(
          Number(membresia.clases_disponibles || 0) - 1,
          0
        ),
        updated_at: new Date()
      },
      { transaction }
    );

    await transaction.commit();
    return res.status(201).json({
      ok: true,
      message: 'Asistencia registrada correctamente.',
      data: asistencia
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('[CR_AsistenciaManualAlumno_CTS]', error);
    return res.status(500).json({ message: 'Error al registrar la asistencia manual.' });
  }
};

export const UR_JustificarAusenciaAlumno_CTS = async (req, res) => {
  try {
    const alumnoId = Number(req.params.alumno_id);
    const asistenciaId = Number(req.params.asistencia_id);

    if (![alumnoId, asistenciaId].every((id) => Number.isInteger(id) && id > 0)) {
      return res.status(400).json({ message: 'Los identificadores no son válidos.' });
    }

    const asistencia = await AlumnosAsistenciasModel.findOne({
      where: { id: asistenciaId, alumno_id: alumnoId }
    });

    if (!asistencia) {
      return res.status(404).json({ message: 'Ausencia no encontrada.' });
    }
    if (asistencia.estado !== 'ausente') {
      return res.status(409).json({
        message: 'Solo se pueden justificar registros que estén en estado ausente.'
      });
    }

    const nuevaObservacion = texto(req.body.observaciones);
    const observaciones = [
      texto(asistencia.observaciones),
      nuevaObservacion ? `[JUSTIFICACIÓN] ${nuevaObservacion}` : '[JUSTIFICACIÓN] Sin detalle'
    ].filter(Boolean).join('\n');

    await asistencia.update({
      estado: 'justificado',
      registrado_por_id: usuarioId(req),
      observaciones,
      updated_at: new Date()
    });

    return res.status(200).json({
      ok: true,
      message: 'Ausencia justificada correctamente.',
      data: asistencia
    });
  } catch (error) {
    console.error('[UR_JustificarAusenciaAlumno_CTS]', error);
    return res.status(500).json({ message: 'Error al justificar la ausencia.' });
  }
};

/*
 * Benjamin Orellana - 2026/07/13
 * Estadísticas propias para el portal del alumno. Reutiliza el cálculo
 * administrativo, pero fuerza el ID proveniente de la sesión autenticada.
 */
export const OBRS_MisEstadisticasAsistencia_CTS = async (req, res) => {
  const alumnoId = req.alumno?.id || req.alumno?.alumno_id;

  if (
    !alumnoId ||
    !Number.isInteger(Number(alumnoId)) ||
    Number(alumnoId) <= 0
  ) {
    return res.status(401).json({
      message: 'No se pudo identificar al alumno autenticado.'
    });
  }

  req.params = {
    ...req.params,
    alumno_id: Number(alumnoId)
  };

  return OBRS_EstadisticasAsistenciaAlumno_CTS(req, res);
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

    return res
      .status(200)
      .json({
        status: 'success',
        data: alumnos,
        total: alumnos.length,
        umbral_dias: umbralDias
      });
  } catch (error) {
    console.error('[OBRS_AlumnosInactivos_CTS]', error);
    return res
      .status(500)
      .json({ message: 'Error al obtener el listado de alumnos inactivos.' });
  }
};
