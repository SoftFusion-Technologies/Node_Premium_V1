/*
 * Programador: Sergio Manrique
 * Fecha Creación: 23 / 06 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_AgendaTurnos.js) contiene los controladores
 * para gestionar los turnos concretos (agenda_turnos).
 * Incluye creación individual, masiva desde plantilla, y gestión de estado.
 *
 * Tema: Controladores - Agenda
 * Capa: Backend
 */

import { Op } from 'sequelize';
import dayjs from 'dayjs';
import AgendaTurnosModel from '../../Models/Agenda/MD_TB_AgendaTurnos.js';
import AgendaHorariosSedeModel from '../../Models/Agenda/MD_TB_AgendaHorariosSede.js';
import AgendaTurnosReservasModel from '../../Models/Agenda/MD_TB_AgendaTurnosReservas.js';
import AgendaTurnosListaEsperaModel from '../../Models/Agenda/MD_TB_AgendaTurnosListaEspera.js';
import AlumnosMembresiasModel       from '../../Models/Alumno/MD_TB_AlumnosMembresias.js';
import AlumnosAsistenciasModel      from '../../Models/Alumno/MD_TB_AlumnosAsistencias.js';
import PagosMensualidadesModel      from '../../Models/Pago/MD_TB_PagosMensualidades.js';
import SedesModel                   from '../../Models/Sede/MD_TB_Sedes.js';
import SedesHorariosModel           from '../../Models/Sede/MD_TB_SedesHorarios.js';
import UsuariosModel                from '../../Models/Usuario/MD_TB_Usuarios.js';
import AlumnosModel                 from '../../Models/Alumno/MD_TB_Alumnos.js';
import db                           from '../../DataBase/db.js';
import { obtenerMinutosCancelacion, marcarAsistenciaComoCancelada } from './CTS_TB_AgendaTurnosReservas.js';

// Días de anticipación para marcar el bono/membresía como "por vencer".
const DIAS_ALERTA_VENCIMIENTO_MEMBRESIA = 3;

/*
 * Sergio Manrique - 2026/07/05
 * Calcula los indicadores de estado de un alumno (bono por vencer, deuda)
 * que se muestran como iconos en la lista de inscriptos del turno.
 * Se resuelve por separado (no viene de GET /alumnos) porque ese endpoint
 * tiene un campo de membresía con un bug conocido (ver comentario en
 * OBRS_ClientesDisponiblesTurno_CTS de CTS_TB_AgendaTurnosReservas.js).
 */
const obtenerIndicadoresAlumno = async (alumnoId) => {
  const hoy = new Date().toISOString().slice(0, 10);

  const [membresia, deuda] = await Promise.all([
    AlumnosMembresiasModel.findOne({
      where: {
        alumno_id: alumnoId,
        plan_id:   { [Op.ne]: null },
        estado:    'activa',
        fecha_inicio:      { [Op.lte]: hoy },
        fecha_vencimiento: { [Op.gt]:  hoy }
      },
      order: [['fecha_inicio', 'DESC'], ['id', 'DESC']]
    }),
    PagosMensualidadesModel.findOne({
      where: {
        alumno_id: alumnoId,
        saldo:     { [Op.gt]: 0 },
        estado:    { [Op.ne]: 'anulada' },
        [Op.or]: [
          { estado: 'vencida' },
          {
            fecha_vencimiento: { [Op.lt]: hoy },
            estado:            { [Op.in]: ['pendiente', 'parcial'] }
          }
        ]
      }
    })
  ]);

  const diasParaVencer = membresia
    ? dayjs(membresia.fecha_vencimiento).startOf('day').diff(dayjs(hoy).startOf('day'), 'day')
    : null;

  return {
    dias_para_vencer_membresia:
      diasParaVencer !== null && diasParaVencer <= DIAS_ALERTA_VENCIMIENTO_MEMBRESIA
        ? diasParaVencer
        : null,
    tiene_deuda: !!deuda
  };
};

// ─── Helpers internos ─────────────────────────────────────────────────────────

/*
 * Genera los horarios de turno dentro de un rango dado una duración en minutos.
 * Ejemplo: 18:00 → 22:00 con 60min → [{ horaInicio: "18:00", horaFin: "19:00" }, ...]
 */
const generarFranjasHorarias = (horaInicio, horaFin, duracionMinutos) => {
  const franjas = [];
  let cursor = dayjs(`2000-01-01 ${horaInicio}`);
  const fin = dayjs(`2000-01-01 ${horaFin}`);

  while (cursor.isBefore(fin)) {
    const siguiente = cursor.add(duracionMinutos, 'minute');
    if (siguiente.isAfter(fin)) break;
    franjas.push({
      hora_inicio: cursor.format('HH:mm:ss'),
      hora_fin: siguiente.format('HH:mm:ss')
    });
    cursor = siguiente;
  }

  return franjas;
};

/*
 * Genera las fechas válidas dentro de un rango,
 * excluyendo días de semana y fechas específicas.
 */
const generarFechasValidas = (
  fechaInicio,
  fechaFin,
  diasExcluidos = [],
  fechasExcluidas = []
) => {
  const fechas = [];
  let cursor = dayjs(fechaInicio);
  const fin = dayjs(fechaFin);

  while (cursor.isBefore(fin) || cursor.isSame(fin, 'day')) {
    // dayjs: 0=domingo, 1=lunes... El backend usa 1=Lunes...7=Domingo igual que la BD
    const diaBD = cursor.day() === 0 ? 7 : cursor.day();
    const clave = cursor.format('YYYY-MM-DD');

    const esDiaExcluido = diasExcluidos.includes(diaBD);
    const esFechaExcluida = fechasExcluidas.includes(clave);

    if (!esDiaExcluido && !esFechaExcluida) {
      fechas.push(clave);
    }

    cursor = cursor.add(1, 'day');
  }

  return fechas;
};

// ─── ADMIN ────────────────────────────────────────────────────────────────────

/*
 * Sergio Manrique - 2026/06/23
 * Lista turnos con filtros opcionales: sede_id, fecha, estado, profesor_id.
 */
export const OBRS_Turnos_CTS = async (req, res) => {
  try {
    const { sede_id, fecha, estado, profesor_id, fecha_desde, fecha_hasta } =
      req.query;

    const where = {};
    if (sede_id) where.sede_id = sede_id;
    if (estado) where.estado = estado;
    if (profesor_id) where.profesor_id = profesor_id;

    if (fecha) {
      where.fecha = fecha;
    } else if (fecha_desde || fecha_hasta) {
      where.fecha = {};
      if (fecha_desde) where.fecha[Op.gte] = fecha_desde;
      if (fecha_hasta) where.fecha[Op.lte] = fecha_hasta;
    }

    const turnos = await AgendaTurnosModel.findAll({
      where,
      include: [
        { model: SedesModel, as: 'sede', attributes: ['id', 'nombre'] },
        {
          model: UsuariosModel,
          as: 'profesor',
          attributes: ['id', 'nombre', 'apellido']
        },
        {
          model: AgendaTurnosReservasModel,
          as: 'reservas',
          attributes: ['id', 'alumno_id', 'estado', 'origen_reserva'],
          where: { estado: 'reservada' },
          required: false
        }
      ],
      order: [
        ['fecha', 'ASC'],
        ['hora_inicio', 'ASC']
      ]
    });

    return res.status(200).json(turnos);
  } catch (error) {
    console.error('[OBRS_Turnos_CTS]', error);
    return res.status(500).json({ message: 'Error al obtener turnos.' });
  }
};

/*
 * Sergio Manrique - 2026/07/05
 * Lista los turnos de un día (por defecto hoy) en una sede, con sus
 * alumnos inscriptos y el estado de asistencia real de cada uno, para el
 * panel rápido de "tomar asistencia". Los turnos sin reservas también se
 * incluyen (para que se vea el horario igual, vacío).
 */
export const OBRS_TurnosAsistenciaDia_CTS = async (req, res) => {
  try {
    const { sede_id, fecha } = req.query;

    if (!sede_id) {
      return res.status(400).json({ message: 'Falta el parámetro sede_id.' });
    }

    const fechaConsulta = fecha || dayjs().format('YYYY-MM-DD');

    const turnos = await AgendaTurnosModel.findAll({
      where: {
        sede_id,
        fecha:  fechaConsulta,
        estado: { [Op.ne]: 'cancelado' }
      },
      include: [
        { model: UsuariosModel, as: 'profesor', attributes: ['id', 'nombre', 'apellido'] },
        {
          model:      AgendaTurnosReservasModel,
          as:         'reservas',
          where:      { estado: 'reservada' },
          required:   false,
          include: [
            { model: AlumnosModel, as: 'alumno', attributes: ['id', 'nombre', 'apellido', 'dni'] }
          ]
        }
      ],
      order: [['hora_inicio', 'ASC']]
    });

    const turnosPlanos = turnos.map((t) => t.toJSON());

    // El estado real de asistencia vive en agenda_alumnos_asistencias, no en
    // la reserva (ver UR_AsistenciaAdmin_CTS en CTS_TB_AgendaTurnosReservas.js
    // para el porqué). Se resuelve todo en una sola consulta por reserva_id.
    const reservaIds = turnosPlanos.flatMap((t) => (t.reservas || []).map((r) => r.id));

    const asistencias = reservaIds.length
      ? await AlumnosAsistenciasModel.findAll({
          where: { reserva_id: { [Op.in]: reservaIds } }
        })
      : [];

    const asistenciaPorReserva = new Map(asistencias.map((a) => [a.reserva_id, a]));

    for (const turno of turnosPlanos) {
      for (const reserva of turno.reservas || []) {
        const asistencia = asistenciaPorReserva.get(reserva.id);
        reserva.asistencia_id     = asistencia?.id ?? null;
        reserva.asistencia_estado = asistencia?.estado ?? 'asistio';
      }
    }

    // Sergio Manrique - 2026/07/14 - Estadísticas de historial por alumno
    // (última asistencia, asistencias del mes y frecuencia semanal real),
    // para mostrarlas en la fila de cada alumno del panel de asistencia.
    // Se resuelve con una sola consulta de todo el historial de asistencia
    // de los alumnos que aparecen hoy, y se calcula todo en memoria.
    const alumnoIds = [
      ...new Set(
        turnosPlanos.flatMap((t) => (t.reservas || []).map((r) => r.alumno?.id).filter(Boolean))
      )
    ];

    const historialPorAlumno = new Map();
    if (alumnoIds.length) {
      const historial = await AlumnosAsistenciasModel.findAll({
        where: { alumno_id: { [Op.in]: alumnoIds } },
        order: [['fecha', 'DESC']]
      });
      for (const registro of historial) {
        if (!historialPorAlumno.has(registro.alumno_id)) {
          historialPorAlumno.set(registro.alumno_id, []);
        }
        historialPorAlumno.get(registro.alumno_id).push(registro);
      }
    }

    const SEMANAS_VENTANA = 8;
    const inicioMesDateOnly = dayjs(fechaConsulta)
      .startOf('month')
      .format('YYYY-MM-DD');
    const inicioVentanaDateOnly = dayjs(fechaConsulta)
      .subtract(SEMANAS_VENTANA, 'week')
      .format('YYYY-MM-DD');

    for (const turno of turnosPlanos) {
      for (const reserva of turno.reservas || []) {
        const alumnoId = reserva.alumno?.id;
        const historialAlumno = historialPorAlumno.get(alumnoId) || [];

        // Las reservas futuras también nacen como 'asistio', pero no deben
        // adelantar la última asistencia ni inflar estadísticas anteriores.
        const ultimaAsistio = historialAlumno.find(
          (a) => a.estado === 'asistio' && String(a.fecha) <= fechaConsulta
        );
        const asistenciasMes = historialAlumno.filter(
          (a) =>
            a.estado === 'asistio' &&
            String(a.fecha) >= inicioMesDateOnly &&
            String(a.fecha) <= fechaConsulta
        ).length;
        const asistenciasVentana = historialAlumno.filter(
          (a) =>
            a.estado === 'asistio' &&
            String(a.fecha) >= inicioVentanaDateOnly &&
            String(a.fecha) <= fechaConsulta
        ).length;

        reserva.ultima_asistencia       = ultimaAsistio?.fecha ?? null;
        reserva.asistencias_mes         = asistenciasMes;
        reserva.frecuencia_semanal_real =
          Math.round((asistenciasVentana / SEMANAS_VENTANA) * 10) / 10;
      }
    }

    return res.status(200).json({ status: 'success', data: turnosPlanos });
  } catch (error) {
    console.error('[OBRS_TurnosAsistenciaDia_CTS]', error);
    return res.status(500).json({ message: 'Error al obtener los turnos del día.' });
  }
};

/*
 * Sergio Manrique - 2026/07/24
 * Historial de asistencias de una sede en un rango de fechas, en formato
 * plano (una fila por alumno inscripto en cada turno), pensado para
 * exportar a Excel. A diferencia de OBRS_TurnosAsistenciaDia_CTS no calcula
 * estadísticas por alumno (última asistencia, frecuencia semanal, etc.):
 * eso es carísimo repetido día por día en un rango, y no hace falta para
 * un listado de exportación.
 */
export const OBRS_AsistenciasRango_CTS = async (req, res) => {
  try {
    const { sede_id, fecha_desde, fecha_hasta } = req.query;

    if (!sede_id || !fecha_desde || !fecha_hasta) {
      return res.status(400).json({
        message: 'Faltan parámetros: sede_id, fecha_desde y fecha_hasta son requeridos.'
      });
    }

    const turnos = await AgendaTurnosModel.findAll({
      where: {
        sede_id,
        fecha: { [Op.between]: [fecha_desde, fecha_hasta] },
        estado: { [Op.ne]: 'cancelado' }
      },
      include: [
        { model: SedesModel, as: 'sede', attributes: ['id', 'nombre'] },
        { model: UsuariosModel, as: 'profesor', attributes: ['id', 'nombre', 'apellido'] },
        {
          model: AgendaTurnosReservasModel,
          as: 'reservas',
          where: { estado: 'reservada' },
          required: false,
          include: [
            { model: AlumnosModel, as: 'alumno', attributes: ['id', 'nombre', 'apellido', 'dni'] }
          ]
        }
      ],
      order: [['fecha', 'ASC'], ['hora_inicio', 'ASC']]
    });

    const turnosPlanos = turnos.map((t) => t.toJSON());

    const reservaIds = turnosPlanos.flatMap((t) => (t.reservas || []).map((r) => r.id));

    const asistencias = reservaIds.length
      ? await AlumnosAsistenciasModel.findAll({
          where: { reserva_id: { [Op.in]: reservaIds } }
        })
      : [];

    const asistenciaPorReserva = new Map(asistencias.map((a) => [a.reserva_id, a]));

    const filas = [];
    for (const turno of turnosPlanos) {
      for (const reserva of turno.reservas || []) {
        const asistencia = asistenciaPorReserva.get(reserva.id);
        filas.push({
          fecha: turno.fecha,
          hora_inicio: turno.hora_inicio,
          hora_fin: turno.hora_fin,
          nombre_clase: turno.nombre_clase,
          sede: turno.sede?.nombre || null,
          profesor: turno.profesor ? `${turno.profesor.nombre} ${turno.profesor.apellido}` : null,
          alumno_nombre: reserva.alumno?.nombre || null,
          alumno_apellido: reserva.alumno?.apellido || null,
          alumno_dni: reserva.alumno?.dni || null,
          // Mismo default que OBRS_TurnosAsistenciaDia_CTS: una reserva sin
          // registro explícito en agenda_alumnos_asistencias nace 'asistio'.
          estado_asistencia: asistencia?.estado ?? 'asistio'
        });
      }
    }

    return res.status(200).json({ status: 'success', data: filas });
  } catch (error) {
    console.error('[OBRS_AsistenciasRango_CTS]', error);
    return res.status(500).json({ message: 'Error al obtener el historial de asistencias.' });
  }
};

/*
 * Benjamin Orellana - 2026/07/22
 * Historial diario de reservas canceladas. Se mantiene separado del endpoint
 * operativo de asistencia para no mezclar cancelaciones con alumnos activos.
 */
export const OBRS_HistorialCancelaciones_CTS = async (req, res) => {
  try {
    const { sede_id, fecha } = req.query;

    if (!sede_id) {
      return res.status(400).json({ message: 'Falta el parámetro sede_id.' });
    }

    const fechaConsulta = fecha || dayjs().format('YYYY-MM-DD');

    const reservas = await AgendaTurnosReservasModel.findAll({
      where: { estado: 'cancelada' },
      attributes: [
        'id',
        'turno_id',
        'alumno_id',
        'origen_reserva',
        'fecha_reserva',
        'fecha_cancelacion',
        'motivo_cancelacion',
        'observaciones'
      ],
      include: [
        {
          model: AgendaTurnosModel,
          as: 'turno',
          required: true,
          where: { sede_id, fecha: fechaConsulta },
          attributes: ['id', 'sede_id', 'fecha', 'hora_inicio', 'hora_fin', 'nombre_clase']
        },
        {
          model: AlumnosModel,
          as: 'alumno',
          required: true,
          attributes: ['id', 'nombre', 'apellido', 'dni']
        }
      ],
      order: [
        [{ model: AgendaTurnosModel, as: 'turno' }, 'hora_inicio', 'ASC'],
        ['fecha_cancelacion', 'DESC'],
        ['id', 'DESC']
      ]
    });

    return res.status(200).json({
      status: 'success',
      data: reservas.map((reserva) => reserva.toJSON())
    });
  } catch (error) {
    console.error('[OBRS_HistorialCancelaciones_CTS]', error);
    return res.status(500).json({ message: 'Error al obtener el historial de cancelaciones.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23
 * Obtiene el detalle de un turno por ID con reservas y lista de espera.
 */
export const OBRS_DetTurno_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const turno = await AgendaTurnosModel.findByPk(id, {
      include: [
        { model: SedesModel, as: 'sede', attributes: ['id', 'nombre'] },
        {
          model: UsuariosModel,
          as: 'profesor',
          attributes: ['id', 'nombre', 'apellido']
        },
        {
          model: AgendaTurnosReservasModel,
          as: 'reservas',
          required: false,
          include: [
            {
              model: AlumnosModel,
              as: 'alumno',
              attributes: ['id', 'nombre', 'apellido', 'telefono']
            }
          ]
        },
        {
          model: AgendaTurnosListaEsperaModel,
          as: 'lista_espera',
          required: false,
          where: { estado: 'esperando' },
          include: [
            {
              model: AlumnosModel,
              as: 'alumno',
              attributes: ['id', 'nombre', 'apellido', 'telefono']
            }
          ]
        }
      ],
      order: [
        [
          { model: AgendaTurnosListaEsperaModel, as: 'lista_espera' },
          'posicion',
          'ASC'
        ]
      ]
    });

    if (!turno) {
      return res.status(404).json({ message: 'Turno no encontrado.' });
    }

    const turnoPlano = turno.toJSON();

    // Enriquece a cada alumno inscripto con los indicadores para los iconos
    // de estado (bono por vencer, deuda). Solo se hace para los inscriptos
    // (no lista de espera), que es donde se muestran esos iconos.
    await Promise.all(
      (turnoPlano.reservas || []).map(async (reserva) => {
        if (!reserva.alumno) return;
        const indicadores = await obtenerIndicadoresAlumno(reserva.alumno.id);
        Object.assign(reserva.alumno, indicadores);
      })
    );

    // Se expone el límite de minutos de cancelación anticipada para que el
    // frontend pueda calcular, sin adivinar, si dar de baja a alguien ahora
    // mismo devolvería el crédito (mismo cálculo exacto que hace el backend
    // en ER_ReservaAdmin_CTS al confirmar la baja).
    turnoPlano.minutos_cancelacion_anticipada = await obtenerMinutosCancelacion();

    return res.status(200).json(turnoPlano);
  } catch (error) {
    console.error('[OBRS_DetTurno_CTS]', error);
    return res.status(500).json({ message: 'Error al obtener el turno.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23
 * Crea un turno individual.
 */
export const CR_Turno_CTS = async (req, res) => {
  try {
    const {
      horario_sede_id,
      sede_id,
      profesor_id,
      fecha,
      hora_inicio,
      hora_fin,
      cupo_maximo,
      nombre_clase,
      observaciones
    } = req.body;

    if (!sede_id || !fecha || !hora_inicio || !hora_fin) {
      return res
        .status(400)
        .json({
          message:
            'Faltan campos requeridos: sede_id, fecha, hora_inicio, hora_fin.'
        });
    }

    // Solo se pueden crear turnos de hoy en adelante (reloj del servidor)
    if (dayjs(fecha).isBefore(dayjs(), 'day')) {
      return res
        .status(400)
        .json({ message: 'No se pueden crear turnos en una fecha pasada.' });
    }

    // Evitar duplicados: ya existe un turno para esa sede, fecha y horario
    const turnoDuplicado = await AgendaTurnosModel.findOne({
      where: { sede_id, fecha, hora_inicio }
    });
    if (turnoDuplicado) {
      return res
        .status(400)
        .json({
          message: 'Ya existe un turno para esa sede, fecha y horario.'
        });
    }

    // Si viene de una plantilla, heredar nombre_clase si no se especificó
    let nombreFinal = nombre_clase || null;
    if (!nombreFinal && horario_sede_id) {
      const plantilla = await AgendaHorariosSedeModel.findByPk(horario_sede_id);
      if (plantilla) nombreFinal = plantilla.nombre_clase;
    }

    const turno = await AgendaTurnosModel.create({
      horario_sede_id: horario_sede_id || null,
      sede_id,
      profesor_id: profesor_id || null,
      fecha,
      hora_inicio,
      hora_fin,
      cupo_maximo: cupo_maximo || 6,
      cupos_reservados: 0,
      nombre_clase: nombreFinal,
      estado: 'disponible',
      observaciones: observaciones || null
    });

    return res
      .status(201)
      .json({ message: 'Turno creado correctamente.', turno });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res
        .status(400)
        .json({
          message: 'Ya existe un turno para esa sede, fecha y horario.'
        });
    }
    console.error('[CR_Turno_CTS]', error);
    return res.status(500).json({ message: 'Error al crear el turno.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23
 * Creación masiva de turnos desde un payload compacto.
 *
 * Body esperado:
 * {
 *   sede_ids:         [1, 2],
 *   horario_sede_id:  3,         (opcional, para heredar nombre_clase y profesor)
 *   profesor_id:      5,         (opcional)
 *   nombre_clase:     "Funcional",
 *   fecha_inicio:     "2026-07-01",
 *   fecha_fin:        "2026-07-31",
 *   dias_excluidos:   [6, 7],    (1=Lunes...7=Domingo)
 *   fechas_excluidas: ["2026-07-09"],
 *   hora_inicio:      "08:00",
 *   hora_fin:         "10:00",
 *   duracion_minutos: 60,
 *   cupo_maximo:      6
 * }
 */
export const CR_TurnosMasivo_CTS = async (req, res) => {
  try {
    const {
      sede_ids,
      horario_sede_id,
      profesor_id,
      nombre_clase,
      fecha_inicio,
      fecha_fin,
      dias_excluidos = [],
      fechas_excluidas = [],
      hora_inicio,
      hora_fin,
      duracion_minutos = 60,
      cupo_maximo = 6,
      crear_horarios_faltantes = true
    } = req.body;

    if (
      !sede_ids?.length ||
      !fecha_inicio ||
      !fecha_fin ||
      !hora_inicio ||
      !hora_fin
    ) {
      return res
        .status(400)
        .json({
          message:
            'Faltan campos requeridos: sede_ids, fecha_inicio, fecha_fin, hora_inicio, hora_fin.'
        });
    }

    // Solo se pueden crear turnos de hoy en adelante (reloj del servidor)
    if (dayjs(fecha_inicio).isBefore(dayjs(), 'day')) {
      return res
        .status(400)
        .json({ message: 'La fecha de inicio no puede ser anterior a hoy.' });
    }

    const debeCrearHorariosFaltantes = ![false, 'false', 0, '0'].includes(
      crear_horarios_faltantes
    );

    const normalizarHoraBD = (hora) => {
      const texto = String(hora || '').trim();
      return texto.length === 5 ? `${texto}:00` : texto;
    };

    // Heredar nombre_clase de la plantilla si no se especificó
    let nombreFinal = nombre_clase || null;
    if (!nombreFinal && horario_sede_id) {
      const plantilla = await AgendaHorariosSedeModel.findByPk(horario_sede_id);
      if (plantilla) nombreFinal = plantilla.nombre_clase;
    }

    const fechasValidas = generarFechasValidas(
      fecha_inicio,
      fecha_fin,
      dias_excluidos,
      fechas_excluidas
    );
    const franjas = generarFranjasHorarias(
      hora_inicio,
      hora_fin,
      duracion_minutos
    );

    if (!fechasValidas.length || !franjas.length) {
      return res
        .status(400)
        .json({ message: 'El rango no generó ningún turno válido.' });
    }

    // Cargar horarios configurados para todas las sedes involucradas.
    // Construye horarioMap[sede_id][dia_semana] = { hora_inicio, hora_fin }
    // Solo se incluyen horarios activos; si falta un día, ese día se omite.
    const horariosRows = await SedesHorariosModel.findAll({
      where: { sede_id: { [Op.in]: sede_ids }, activo: 1 },
      attributes: ['sede_id', 'dia_semana', 'hora_inicio', 'hora_fin']
    });

    const horarioMap = {};
    for (const h of horariosRows) {
      if (!horarioMap[h.sede_id]) horarioMap[h.sede_id] = {};
      horarioMap[h.sede_id][h.dia_semana] = {
        hora_inicio: h.hora_inicio,
        hora_fin: h.hora_fin
      };
    }

    // Si una sede no tiene horario configurado para un día incluido en el rango,
    // se crea automáticamente tomando el horario superior del formulario.
    // Esto permite que la creación masiva inicialice la agenda y también deje
    // persistido el horario operativo de la sede para futuras generaciones.
    let horariosCreados = 0;
    const diasNecesarios = [
      ...new Set(
        fechasValidas.map((fecha) => {
          return dayjs(fecha).day() === 0 ? 7 : dayjs(fecha).day();
        })
      )
    ];

    if (debeCrearHorariosFaltantes) {
      const horaInicioBase = normalizarHoraBD(hora_inicio);
      const horaFinBase = normalizarHoraBD(hora_fin);

      for (const sede_id of sede_ids) {
        if (!horarioMap[sede_id]) horarioMap[sede_id] = {};

        for (const dia_semana of diasNecesarios) {
          if (horarioMap[sede_id][dia_semana]) continue;

          const horarioExistente = await SedesHorariosModel.findOne({
            where: {
              sede_id,
              dia_semana
            }
          });

          if (horarioExistente) {
            await horarioExistente.update({
              hora_inicio: horaInicioBase,
              hora_fin: horaFinBase,
              activo: 1,
              updated_at: new Date()
            });
          } else {
            await SedesHorariosModel.create({
              sede_id,
              dia_semana,
              hora_inicio: horaInicioBase,
              hora_fin: horaFinBase,
              activo: 1
            });
          }

          horarioMap[sede_id][dia_semana] = {
            hora_inicio: horaInicioBase,
            hora_fin: horaFinBase
          };
          horariosCreados++;
        }
      }
    }

    // Buscar turnos ya existentes para las mismas sedes y fechas, para no
    // crear duplicados (mismo sede_id + fecha + hora_inicio).
    const turnosExistentes = await AgendaTurnosModel.findAll({
      where: {
        sede_id: { [Op.in]: sede_ids },
        fecha: { [Op.in]: fechasValidas }
      },
      attributes: ['sede_id', 'fecha', 'hora_inicio']
    });

    const clavesExistentes = new Set(
      turnosExistentes.map((t) => `${t.sede_id}|${t.fecha}|${t.hora_inicio}`)
    );

    // Armar todos los registros a insertar aplicando el horario de la sede por día.
    // Para cada (sede, fecha, franja):
    //   1. Busca el horario configurado para esa sede y ese día de la semana.
    //   2. Si no existe horario y no se pidió crear faltantes → omite.
    //   3. Si la franja queda fuera del horario → omite (recorte por día).
    //   4. Si ya existe en BD → omite (duplicado).
    const registros = [];
    let omitidos = 0;
    let omitidosSinHorario = 0;

    for (const sede_id of sede_ids) {
      const horariosSede = horarioMap[sede_id] ?? {};

      for (const fecha of fechasValidas) {
        // dia_semana en formato BD: 1=Lun...7=Dom
        const diaBD = dayjs(fecha).day() === 0 ? 7 : dayjs(fecha).day();
        const horarioDia = horariosSede[diaBD];

        if (!horarioDia) {
          // Ese día no está configurado en esta sede → saltear todas sus franjas
          omitidosSinHorario += franjas.length;
          continue;
        }

        for (const franja of franjas) {
          // Recortar: la franja debe caer dentro del horario habilitado del día
          if (
            franja.hora_inicio < horarioDia.hora_inicio ||
            franja.hora_fin > horarioDia.hora_fin
          ) {
            omitidosSinHorario++;
            continue;
          }

          const clave = `${sede_id}|${fecha}|${franja.hora_inicio}`;
          if (clavesExistentes.has(clave)) {
            omitidos++;
            continue;
          }

          registros.push({
            horario_sede_id: horario_sede_id || null,
            sede_id,
            profesor_id: profesor_id || null,
            fecha,
            hora_inicio: franja.hora_inicio,
            hora_fin: franja.hora_fin,
            cupo_maximo,
            cupos_reservados: 0,
            nombre_clase: nombreFinal,
            estado: 'disponible'
          });
        }
      }
    }

    if (!registros.length) {
      return res.status(400).json({
        message:
          'No se generó ningún turno válido. Verificá que las sedes tengan horarios configurados para los días seleccionados.'
      });
    }

    // Inserción masiva en un solo query
    await AgendaTurnosModel.bulkCreate(registros);

    const partes = [`Se crearon ${registros.length} turnos correctamente.`];
    if (omitidos > 0) partes.push(`${omitidos} omitidos por ya existir.`);
    if (omitidosSinHorario > 0)
      partes.push(
        `${omitidosSinHorario} omitidos por estar fuera del horario configurado de la sede.`
      );
    if (horariosCreados > 0)
      partes.push(`${horariosCreados} horarios de sede creados o reactivados.`);

    return res.status(201).json({
      message: partes.join(' '),
      total: registros.length,
      omitidos,
      omitidos_sin_horario: omitidosSinHorario,
      horarios_creados: horariosCreados
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res
        .status(400)
        .json({
          message:
            'Alguno de los turnos a crear ya existe (misma sede, fecha y horario).'
        });
    }
    console.error('[CR_TurnosMasivo_CTS]', error);
    return res.status(500).json({ message: 'Error al crear los turnos.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23
 * Actualiza un turno existente.
 */
export const UR_Turno_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      profesor_id,
      fecha,
      hora_inicio,
      hora_fin,
      cupo_maximo,
      nombre_clase,
      observaciones
    } = req.body;

    const turno = await AgendaTurnosModel.findByPk(id);
    if (!turno) {
      return res.status(404).json({ message: 'Turno no encontrado.' });
    }

    const fechaFinal = fecha ?? turno.fecha;
    const horaInicioFinal = hora_inicio ?? turno.hora_inicio;

    // Solo se puede mover un turno a una fecha de hoy en adelante
    if (fecha && dayjs(fechaFinal).isBefore(dayjs(), 'day')) {
      return res
        .status(400)
        .json({ message: 'No se puede mover un turno a una fecha pasada.' });
    }

    // Evitar duplicados al mover el turno a otra fecha/horario ya ocupado
    if (fecha || hora_inicio) {
      const turnoDuplicado = await AgendaTurnosModel.findOne({
        where: {
          sede_id: turno.sede_id,
          fecha: fechaFinal,
          hora_inicio: horaInicioFinal,
          id: { [Op.ne]: turno.id }
        }
      });
      if (turnoDuplicado) {
        return res
          .status(400)
          .json({
            message: 'Ya existe un turno para esa sede, fecha y horario.'
          });
      }
    }

    await turno.update({
      profesor_id: profesor_id ?? turno.profesor_id,
      fecha: fechaFinal,
      hora_inicio: horaInicioFinal,
      hora_fin: hora_fin ?? turno.hora_fin,
      cupo_maximo: cupo_maximo ?? turno.cupo_maximo,
      nombre_clase: nombre_clase ?? turno.nombre_clase,
      observaciones: observaciones ?? turno.observaciones,
      updated_at: new Date()
    });

    return res
      .status(200)
      .json({ message: 'Turno actualizado correctamente.', turno });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res
        .status(400)
        .json({
          message: 'Ya existe un turno para esa sede, fecha y horario.'
        });
    }
    console.error('[UR_Turno_CTS]', error);
    return res.status(500).json({ message: 'Error al actualizar el turno.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23 / corregido 2026/07/18
 * Cambia el estado de un turno: bloquear, cancelar, disponible.
 *
 * Al pasar a 'bloqueado' o 'cancelado', el turno deja de aceptar gente —
 * pero antes se dejaban las reservas activas tal cual estaban ('reservada',
 * como si nada), sin devolver el crédito, y encima si alguien cancelaba esa
 * reserva individual después, el turno volvía solo a 'disponible', pisando
 * la decisión del admin. Ahora, al bloquear/cancelar, se cancelan todas las
 * reservas activas del turno (mismo criterio de reembolso que ER_Turno_CTS:
 * automático fuera de la ventana de cancelación, opcional adentro vía
 * devolver_creditos_vencidos) y se limpia también la lista de espera, que
 * ya no tiene sentido para un turno que no va a liberar más cupos.
 */
export const UR_EstadoTurno_CTS = async (req, res) => {
  const transaccion = await db.transaction();
  try {
    const { id } = req.params;
    const { estado, motivo_bloqueo, devolver_creditos_vencidos } = req.body;

    const estadosValidos = ['disponible', 'bloqueado', 'cancelado'];
    if (!estadosValidos.includes(estado)) {
      await transaccion.rollback();
      return res
        .status(400)
        .json({
          message: `Estado inválido. Valores permitidos: ${estadosValidos.join(', ')}.`
        });
    }

    const turno = await AgendaTurnosModel.findByPk(id, {
      transaction: transaccion,
      lock: transaccion.LOCK.UPDATE
    });
    if (!turno) {
      await transaccion.rollback();
      return res.status(404).json({ message: 'Turno no encontrado.' });
    }

    let reservasCanceladas = 0;
    let creditosDevueltos = 0;

    if (estado === 'bloqueado' || estado === 'cancelado') {
      const minutosLimite    = await obtenerMinutosCancelacion();
      const inicioTurno      = dayjs(`${turno.fecha} ${turno.hora_inicio}`);
      const minutosRestantes = inicioTurno.diff(dayjs(), 'minute');
      const dentroVentana    = minutosRestantes < minutosLimite;
      const correspondeReembolso = !dentroVentana || devolver_creditos_vencidos === true;

      const reservasActivas = await AgendaTurnosReservasModel.findAll({
        where:       { turno_id: id, estado: 'reservada' },
        transaction: transaccion,
        lock:        transaccion.LOCK.UPDATE
      });

      for (const reserva of reservasActivas) {
        await reserva.update({
          estado:             'cancelada',
          fecha_cancelacion:  new Date(),
          motivo_cancelacion: estado === 'bloqueado'
            ? 'Turno bloqueado por administración'
            : 'Turno cancelado por administración',
          updated_at:         new Date()
        }, { transaction: transaccion });

        await marcarAsistenciaComoCancelada(
          reserva.id,
          transaccion,
          req.user?.id ?? req.user?.usuario_id ?? null
        );

        if (reserva.membresia_id && correspondeReembolso) {
          const membresia = await AlumnosMembresiasModel.findByPk(reserva.membresia_id, {
            transaction: transaccion,
            lock:        transaccion.LOCK.UPDATE
          });
          if (membresia) {
            await membresia.update({
              clases_usadas:      Math.max(0, membresia.clases_usadas - 1),
              clases_disponibles: membresia.clases_disponibles + 1,
              updated_at:         new Date()
            }, { transaction: transaccion });
            creditosDevueltos++;
          }
        }
        reservasCanceladas++;
      }

      // La lista de espera de un turno bloqueado/cancelado ya no tiene
      // sentido: no va a liberar más cupos. Se marca como cancelada (no se
      // borra, queda como historial) en vez de dejarla "esperando" para
      // siempre sin que nada la vaya a promover.
      await AgendaTurnosListaEsperaModel.update(
        { estado: 'cancelado', fecha_resolucion: new Date(), updated_at: new Date() },
        { where: { turno_id: id, estado: 'esperando' }, transaction: transaccion }
      );

      await turno.update({
        estado,
        motivo_bloqueo:    estado === 'bloqueado' ? motivo_bloqueo || null : null,
        cupos_reservados:  0,
        updated_at:        new Date()
      }, { transaction: transaccion });
    } else {
      // Reabrir el turno ('disponible'): no hay reservas que tocar, porque
      // mientras estuvo bloqueado/cancelado no se pudo inscribir nadie.
      await turno.update({
        estado,
        motivo_bloqueo: null,
        updated_at:     new Date()
      }, { transaction: transaccion });
    }

    await transaccion.commit();

    return res.status(200).json({
      message:              `Turno ${estado} correctamente.`,
      turno,
      reservas_canceladas:  reservasCanceladas,
      creditos_devueltos:   creditosDevueltos
    });
  } catch (error) {
    await transaccion.rollback();
    console.error('[UR_EstadoTurno_CTS]', error);
    return res
      .status(500)
      .json({ message: 'Error al cambiar estado del turno.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23 / actualizado 2026/07/09
 * Elimina un turno y todas sus reservas (CASCADE en BD hasta agenda_turnos_reservas
 * y agenda_turnos_lista_espera).
 *
 * Devolución de créditos: mismo límite que la cancelación individual
 * (sistema_configuracion, default 60'). Si al turno le faltan más minutos que
 * ese límite, se devuelve el crédito siempre. Si le faltan menos (o ya pasó),
 * la devolución es opcional: solo se hace si el body manda
 * devolver_creditos_vencidos = true (lo decide el admin en el frontend).
 *
 * IMPORTANTE: alumnos_asistencias NO tiene CASCADE hacia agenda_turnos_reservas
 * ni agenda_turnos (ON DELETE NO ACTION), así que hay que borrar esas filas acá
 * a mano antes del destroy, o la eliminación de un turno con alumnos inscriptos
 * falla con un error de restricción de clave foránea.
 */
export const ER_Turno_CTS = async (req, res) => {
  const transaccion = await db.transaction();
  try {
    const { id } = req.params;
    const { devolver_creditos_vencidos } = req.body;

    // Bloquea la fila del turno para que un doble click (o dos pestañas)
    // eliminando el mismo turno no calculen el reembolso dos veces sobre
    // el mismo turno mientras ambas transacciones lo ven todavía "vivo".
    const turno = await AgendaTurnosModel.findByPk(id, {
      transaction: transaccion,
      lock: transaccion.LOCK.UPDATE
    });
    if (!turno) {
      await transaccion.rollback();
      return res.status(404).json({ message: 'Turno no encontrado.' });
    }

    const minutosLimite = await obtenerMinutosCancelacion();
    const inicioTurno = dayjs(`${turno.fecha} ${turno.hora_inicio}`);
    const minutosRestantes = inicioTurno.diff(dayjs(), 'minute');
    // Dentro de la ventana de cancelación (o ya en curso/pasado): la
    // devolución pasa a ser opcional en vez de automática.
    const dentroVentana = minutosRestantes < minutosLimite;
    const correspondeReembolso = !dentroVentana || devolver_creditos_vencidos === true;

    let creditosDevueltos = 0;

    if (correspondeReembolso) {
      const reservasActivas = await AgendaTurnosReservasModel.findAll({
        where: { turno_id: id, estado: 'reservada' },
        transaction: transaccion
      });

      for (const reserva of reservasActivas) {
        if (!reserva.membresia_id) continue;

        const membresia = await AlumnosMembresiasModel.findByPk(
          reserva.membresia_id,
          {
            transaction: transaccion,
            lock: transaccion.LOCK.UPDATE
          }
        );
        if (membresia) {
          await membresia.update(
            {
              clases_usadas: Math.max(0, membresia.clases_usadas - 1),
              clases_disponibles: membresia.clases_disponibles + 1,
              updated_at: new Date()
            },
            { transaction: transaccion }
          );
          creditosDevueltos++;
        }
      }
    }

    // Ver comentario del encabezado: sin esto, el destroy falla si hay
    // alumnos inscriptos (filas huérfanas en alumnos_asistencias).
    await AlumnosAsistenciasModel.destroy({
      where: { turno_id: id },
      transaction: transaccion
    });

    await turno.destroy({ transaction: transaccion });
    await transaccion.commit();

    return res.status(200).json({
      message: 'Turno eliminado correctamente.',
      dentro_ventana_cancelacion: dentroVentana,
      creditos_devueltos: creditosDevueltos
    });
  } catch (error) {
    await transaccion.rollback();
    console.error('[ER_Turno_CTS]', error);
    return res.status(500).json({ message: 'Error al eliminar el turno.' });
  }
};

// ─── ALUMNO ───────────────────────────────────────────────────────────────────

/*
 * Sergio Manrique - 2026/06/23
 * Lista los turnos disponibles para que el alumno pueda inscribirse.
 * Solo muestra turnos futuros con estado 'disponible' o 'completo'.
 */
export const OBRS_TurnosAlumno_CTS = async (req, res) => {
  try {
    const alumno_id = req.alumno.id;
    const sede_id = req.alumno.sede_id;

    if (!sede_id) {
      return res
        .status(400)
        .json({
          message: 'No tenés una sede asignada. Consultá con administración.'
        });
    }

    const { fecha_desde, fecha_hasta } = req.query;

    // La fecha y hora de "ahora" se calculan con el reloj del servidor (nunca
    // con el del dispositivo del alumno). El piso de fecha nunca puede ser
    // anterior a hoy, sin importar qué fecha_desde mande el cliente.
    const hoyServidor = dayjs().format('YYYY-MM-DD');
    const horaServidor = dayjs().format('HH:mm:ss');
    const piso =
      fecha_desde && dayjs(fecha_desde).isAfter(hoyServidor)
        ? fecha_desde
        : hoyServidor;

    // Obtener el vencimiento de la membresía activa del alumno para limitar el
    // rango. Si tiene varias membresías activas vigentes (ej. renovó antes de
    // vencer), se usa la de vencimiento más lejano para no ocultarle turnos
    // que sí podrá tomar con la membresía siguiente.
    const membresia = await AlumnosMembresiasModel.findOne({
      where: {
        alumno_id,
        plan_id: { [Op.ne]: null },
        estado: 'activa',
        fecha_inicio: { [Op.lte]: hoyServidor },
        fecha_vencimiento: { [Op.gt]: hoyServidor },
        clases_disponibles: { [Op.gt]: 0 }
      },
      attributes: ['fecha_vencimiento'],
      order: [['fecha_vencimiento', 'DESC']]
    });

    const fechaVencimiento = membresia?.fecha_vencimiento ?? null;

    // Sin una membresía actual, activa, asociada a un plan y con créditos,
    // no se ofrecen turnos inscribibles. La validación transaccional de la
    // reserva sigue siendo la autoridad final, pero este corte evita una UX
    // engañosa en el portal del alumno.
    if (!membresia) {
      return res.status(200).json({
        turnos: [],
        fecha_vencimiento: null,
        elegible: false,
        motivo_no_elegible: 'No tenés una membresía vigente con plan y créditos disponibles.'
      });
    }

    // El techo es el mínimo entre fecha_hasta pedida y fecha_vencimiento
    let techo = fecha_hasta ?? null;
    if (fechaVencimiento) {
      techo =
        techo && dayjs(techo).isBefore(fechaVencimiento)
          ? techo
          : fechaVencimiento;
    }

    const condicionesFecha = [{ fecha: { [Op.gte]: piso } }];
    if (techo) condicionesFecha.push({ fecha: { [Op.lte]: techo } });

    const where = {
      sede_id,
      estado: { [Op.in]: ['disponible', 'completo'] },
      [Op.and]: [
        ...condicionesFecha,
        {
          // Excluye las clases de hoy cuyo horario ya pasó. Las de fechas
          // futuras no se ven afectadas por esta condición.
          [Op.or]: [
            { fecha: { [Op.gt]: hoyServidor } },
            { fecha: hoyServidor, hora_inicio: { [Op.gte]: horaServidor } }
          ]
        }
      ]
    };

    const turnos = await AgendaTurnosModel.findAll({
      where,
      include: [
        { model: SedesModel, as: 'sede', attributes: ['id', 'nombre'] },
        {
          model: UsuariosModel,
          as: 'profesor',
          attributes: ['id', 'nombre', 'apellido']
        }
      ],
      order: [
        ['fecha', 'ASC'],
        ['hora_inicio', 'ASC']
      ]
    });

    // Incluir fecha_vencimiento para que el frontend pueda limitar la navegación
    return res
      .status(200)
      .json({
        turnos,
        fecha_vencimiento: fechaVencimiento,
        elegible: true,
        motivo_no_elegible: null
      });
  } catch (error) {
    console.error('[OBRS_TurnosAlumno_CTS]', error);
    return res.status(500).json({ message: 'Error al obtener turnos.' });
  }
};

/*
 * Sergio Manrique - 2026/06/24 / actualizado 2026/07/09
 * Eliminación masiva de turnos por rango de fechas, sedes y horario opcional.
 *
 * Body esperado:
 * {
 *   sede_ids:     [1, 2],
 *   fecha_inicio: "2026-07-01",
 *   fecha_fin:    "2026-07-31",
 *   hora_inicio:  "08:00",   (opcional — si no viene, elimina el día completo)
 *   hora_fin:     "10:00",   (opcional)
 *   devolver_creditos_vencidos: false  (opcional, default false)
 * }
 *
 * Devolución de créditos: mismo criterio que ER_Turno_CTS. Los turnos con más
 * minutos de anticipación que el límite configurado (sistema_configuracion,
 * default 60') siempre devuelven el crédito. Los que están dentro de esa
 * ventana (o ya pasaron) solo lo devuelven si devolver_creditos_vencidos
 * viene en true — si un mismo rango de fechas/sedes mezcla turnos futuros
 * lejanos con turnos que ya pasaron (ej. se borra el día completo a media
 * tarde), cada uno se resuelve con su propio criterio, no todo o nada.
 *
 * IMPORTANTE: alumnos_asistencias NO tiene CASCADE hacia agenda_turnos_reservas
 * ni agenda_turnos, así que hay que borrar esas filas acá a mano antes del
 * destroy masivo (ver mismo comentario en ER_Turno_CTS).
 */
export const ER_TurnosMasivo_CTS = async (req, res) => {
  const transaccion = await db.transaction();
  try {
    const {
      sede_ids,
      fecha_inicio,
      fecha_fin,
      hora_inicio,
      hora_fin,
      devolver_creditos_vencidos
    } = req.body;

    if (!sede_ids?.length || !fecha_inicio || !fecha_fin) {
      await transaccion.rollback();
      return res
        .status(400)
        .json({
          message:
            'Faltan campos requeridos: sede_ids, fecha_inicio, fecha_fin.'
        });
    }

    const where = {
      sede_id: { [Op.in]: sede_ids },
      fecha: { [Op.between]: [fecha_inicio, fecha_fin] }
    };

    // Si se especifica rango horario, filtrar solo los turnos que estén dentro
    if (hora_inicio && hora_fin) {
      where.hora_inicio = { [Op.gte]: hora_inicio };
      where.hora_fin = { [Op.lte]: hora_fin };
    }

    // Bloquea las filas para que dos eliminaciones masivas superpuestas (o
    // una masiva y una individual sobre el mismo turno) no calculen ambas el
    // reembolso sobre el mismo turno todavía "vivo".
    const turnos = await AgendaTurnosModel.findAll({
      where,
      attributes: ['id', 'fecha', 'hora_inicio'],
      transaction: transaccion,
      lock: transaccion.LOCK.UPDATE
    });

    if (turnos.length === 0) {
      await transaccion.rollback();
      return res
        .status(404)
        .json({
          message:
            'No se encontraron turnos en el rango indicado para las sedes seleccionadas.'
        });
    }

    const minutosLimite = await obtenerMinutosCancelacion();
    const ahora = dayjs();

    // Turnos con más anticipación que el límite: reembolso siempre.
    // Turnos dentro de la ventana (o ya pasados): reembolso opcional.
    const turnosConReembolsoAutomatico = [];
    const turnosDentroVentana = [];

    for (const t of turnos) {
      const minutosRestantes = dayjs(`${t.fecha} ${t.hora_inicio}`).diff(
        ahora,
        'minute'
      );
      if (minutosRestantes < minutosLimite) {
        turnosDentroVentana.push(t);
      } else {
        turnosConReembolsoAutomatico.push(t);
      }
    }

    const idsAReembolsar = [
      ...turnosConReembolsoAutomatico.map((t) => t.id),
      ...(devolver_creditos_vencidos === true
        ? turnosDentroVentana.map((t) => t.id)
        : [])
    ];

    let creditosDevueltos = 0;

    if (idsAReembolsar.length > 0) {
      const reservasActivas = await AgendaTurnosReservasModel.findAll({
        where: {
          turno_id: { [Op.in]: idsAReembolsar },
          estado: 'reservada',
          membresia_id: { [Op.ne]: null }
        },
        transaction: transaccion
      });

      for (const reserva of reservasActivas) {
        const membresia = await AlumnosMembresiasModel.findByPk(
          reserva.membresia_id,
          {
            transaction: transaccion,
            lock: transaccion.LOCK.UPDATE
          }
        );
        if (membresia) {
          await membresia.update(
            {
              clases_usadas: Math.max(0, membresia.clases_usadas - 1),
              clases_disponibles: membresia.clases_disponibles + 1,
              updated_at: new Date()
            },
            { transaction: transaccion }
          );
          creditosDevueltos++;
        }
      }
    }

    // Ver comentario del encabezado: sin esto, el destroy falla si alguno de
    // estos turnos tiene alumnos inscriptos (filas huérfanas en
    // alumnos_asistencias).
    await AlumnosAsistenciasModel.destroy({
      where: { turno_id: { [Op.in]: turnos.map((t) => t.id) } },
      transaction: transaccion
    });

    // El CASCADE en BD elimina reservas y lista de espera automáticamente
    await AgendaTurnosModel.destroy({ where, transaction: transaccion });
    await transaccion.commit();

    const descripcionRango =
      hora_inicio && hora_fin
        ? ` en el horario ${hora_inicio} - ${hora_fin}`
        : '';

    return res.status(200).json({
      message: `Se eliminaron ${turnos.length} turnos correctamente${descripcionRango}.`,
      total: turnos.length,
      creditos_devueltos: creditosDevueltos,
      turnos_dentro_ventana_cancelacion: turnosDentroVentana.length
    });
  } catch (error) {
    await transaccion.rollback();
    console.error('[ER_TurnosMasivo_CTS]', error);
    return res.status(500).json({ message: 'Error al eliminar los turnos.' });
  }
};
