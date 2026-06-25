/*
 * Programador: Sergio Manrique
 * Fecha Creación: 23 / 06 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_AgendaTurnosReservas.js) contiene los controladores
 * para gestionar las reservas de turnos (agenda_turnos_reservas).
 * Incluye inscripción de alumnos, cancelación con tiempo límite,
 * reprogramación y marcado de asistencia.
 *
 * Tema: Controladores - Agenda
 * Capa: Backend
 */

import dayjs                          from 'dayjs';
import AgendaTurnosModel              from '../../Models/Agenda/MD_TB_AgendaTurnos.js';
import AgendaTurnosReservasModel      from '../../Models/Agenda/MD_TB_AgendaTurnosReservas.js';
import AgendaTurnosListaEsperaModel   from '../../Models/Agenda/MD_TB_AgendaTurnosListaEspera.js';
import AlumnosModel                   from '../../Models/Alumno/MD_TB_Alumnos.js';
import SistemaConfiguracionModel      from '../../Models/Sistema/MD_TB_SistemaConfiguracion.js';
import SedesModel                     from '../../Models/Sede/MD_TB_Sedes.js';
import db                             from '../../DataBase/db.js';

// ─── Helper interno ───────────────────────────────────────────────────────────

/*
 * Lee el límite de minutos para cancelar desde sistema_configuracion.
 * Default: 60 minutos si no se encuentra la clave.
 */
const obtenerMinutosCancelacion = async () => {
  const config = await SistemaConfiguracionModel.findOne({
    where: { clave: 'minutos_cancelacion_anticipada', activo: 1 }
  });
  return config ? parseInt(config.valor) : 60;
};

/*
 * Promueve al primer alumno en lista de espera de un turno
 * cuando se libera un cupo (cancelación o reprogramación).
 */
const promoverListaEspera = async (turno_id) => {
  const primero = await AgendaTurnosListaEsperaModel.findOne({
    where:  { turno_id, estado: 'esperando' },
    order:  [['posicion', 'ASC']]
  });

  if (!primero) return;

  // Crear reserva para el primero de la lista
  await AgendaTurnosReservasModel.create({
    turno_id,
    alumno_id:      primero.alumno_id,
    origen_reserva: 'sistema',
    estado:         'reservada',
    fecha_reserva:  new Date()
  });

  // Marcar como asignado en la lista de espera
  await primero.update({
    estado:           'asignado',
    fecha_resolucion: new Date(),
    updated_at:       new Date()
  });

  // Reordenar posiciones de los restantes
  const restantes = await AgendaTurnosListaEsperaModel.findAll({
    where: { turno_id, estado: 'esperando' },
    order: [['posicion', 'ASC']]
  });

  for (let i = 0; i < restantes.length; i++) {
    await restantes[i].update({ posicion: i + 1 });
  }
};

// ─── ADMIN ────────────────────────────────────────────────────────────────────

/*
 * Sergio Manrique - 2026/06/23
 * Lista todas las reservas de un turno específico.
 */
export const OBRS_ReservasTurno_CTS = async (req, res) => {
  try {
    const { turno_id } = req.params;

    const reservas = await AgendaTurnosReservasModel.findAll({
      where: { turno_id },
      include: [
        { model: AlumnosModel, as: 'alumno', attributes: ['id', 'nombre', 'apellido', 'telefono'] }
      ],
      order: [['fecha_reserva', 'ASC']]
    });

    return res.status(200).json(reservas);
  } catch (error) {
    console.error('[OBRS_ReservasTurno_CTS]', error);
    return res.status(500).json({ message: 'Error al obtener las reservas.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23
 * Admin inscribe manualmente a un alumno en un turno.
 * Ignora el límite de tiempo de cancelación.
 */
export const CR_ReservaAdmin_CTS = async (req, res) => {
  const transaccion = await db.transaction();
  try {
    const { turno_id, alumno_id, membresia_id, observaciones } = req.body;

    if (!turno_id || !alumno_id) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'Faltan campos requeridos: turno_id, alumno_id.' });
    }

    // Bloquea la fila del turno hasta que termine la transacción, evitando
    // que dos inscripciones concurrentes superen el cupo_maximo.
    const turno = await AgendaTurnosModel.findByPk(turno_id, {
      transaction: transaccion,
      lock:        transaccion.LOCK.UPDATE
    });
    if (!turno) {
      await transaccion.rollback();
      return res.status(404).json({ message: 'Turno no encontrado.' });
    }

    if (turno.estado === 'cancelado' || turno.estado === 'bloqueado') {
      await transaccion.rollback();
      return res.status(400).json({ message: `No se puede inscribir en un turno ${turno.estado}.` });
    }

    // Verificar si el alumno ya tiene una reserva activa en este turno
    const reservaExistente = await AgendaTurnosReservasModel.findOne({
      where:       { turno_id, alumno_id, estado: 'reservada' },
      transaction: transaccion
    });
    if (reservaExistente) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'El alumno ya tiene una reserva activa en este turno.' });
    }

    // Verificar cupo (dentro de la transacción, con el turno ya bloqueado)
    if (turno.cupos_reservados >= turno.cupo_maximo) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'El turno no tiene cupos disponibles.' });
    }

    const reserva = await AgendaTurnosReservasModel.create({
      turno_id,
      alumno_id,
      membresia_id:   membresia_id   || null,
      origen_reserva: 'administracion',
      estado:         'reservada',
      fecha_reserva:  new Date(),
      observaciones:  observaciones  || null
    }, { transaction: transaccion });

    // Actualizar contador de cupos
    await turno.update({
      cupos_reservados: turno.cupos_reservados + 1,
      estado:           turno.cupos_reservados + 1 >= turno.cupo_maximo ? 'completo' : 'disponible',
      updated_at:       new Date()
    }, { transaction: transaccion });

    await transaccion.commit();

    return res.status(201).json({ message: 'Alumno inscripto correctamente.', reserva });
  } catch (error) {
    await transaccion.rollback();
    console.error('[CR_ReservaAdmin_CTS]', error);
    return res.status(500).json({ message: 'Error al inscribir al alumno.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23
 * Admin marca asistencia o ausencia de un alumno en un turno.
 * estado: 'asistio' | 'ausente'
 */
export const UR_AsistenciaAdmin_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!['asistio', 'ausente'].includes(estado)) {
      return res.status(400).json({ message: 'Estado inválido. Valores permitidos: asistio, ausente.' });
    }

    const reserva = await AgendaTurnosReservasModel.findByPk(id);
    if (!reserva) {
      return res.status(404).json({ message: 'Reserva no encontrada.' });
    }

    await reserva.update({ estado, updated_at: new Date() });

    return res.status(200).json({ message: `Asistencia marcada como ${estado}.`, reserva });
  } catch (error) {
    console.error('[UR_AsistenciaAdmin_CTS]', error);
    return res.status(500).json({ message: 'Error al marcar asistencia.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23
 * Admin cancela la reserva de un alumno sin restricción de tiempo.
 * Si hay lista de espera, promueve al primero automáticamente.
 */
export const ER_ReservaAdmin_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo_cancelacion } = req.body;

    const reserva = await AgendaTurnosReservasModel.findByPk(id);
    if (!reserva) {
      return res.status(404).json({ message: 'Reserva no encontrada.' });
    }

    if (reserva.estado !== 'reservada') {
      return res.status(400).json({ message: 'Solo se pueden cancelar reservas activas.' });
    }

    await reserva.update({
      estado:             'cancelada',
      fecha_cancelacion:  new Date(),
      motivo_cancelacion: motivo_cancelacion || null,
      updated_at:         new Date()
    });

    // Liberar cupo en el turno
    const turno = await AgendaTurnosModel.findByPk(reserva.turno_id);
    await turno.update({
      cupos_reservados: Math.max(0, turno.cupos_reservados - 1),
      estado:           'disponible',
      updated_at:       new Date()
    });

    // Promover al primero de la lista de espera si hay
    await promoverListaEspera(reserva.turno_id);

    return res.status(200).json({ message: 'Reserva cancelada correctamente.' });
  } catch (error) {
    console.error('[ER_ReservaAdmin_CTS]', error);
    return res.status(500).json({ message: 'Error al cancelar la reserva.' });
  }
};

// ─── ALUMNO ───────────────────────────────────────────────────────────────────

/*
 * Sergio Manrique - 2026/06/23
 * Lista las reservas activas del alumno autenticado.
 */
export const OBRS_MisReservas_CTS = async (req, res) => {
  try {
    const alumno_id = req.alumno.id;

    const reservas = await AgendaTurnosReservasModel.findAll({
      where: { alumno_id, estado: 'reservada' },
      include: [
        {
          model:      AgendaTurnosModel,
          as:         'turno',
          attributes: ['id', 'fecha', 'hora_inicio', 'hora_fin', 'nombre_clase', 'cupo_maximo', 'cupos_reservados'],
          include: [
            { model: SedesModel, as: 'sede', attributes: ['id', 'nombre'] }
          ]
        }
      ],
      order: [[{ model: AgendaTurnosModel, as: 'turno' }, 'fecha', 'ASC']]
    });

    return res.status(200).json(reservas);
  } catch (error) {
    console.error('[OBRS_MisReservas_CTS]', error);
    return res.status(500).json({ message: 'Error al obtener tus reservas.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23
 * Alumno se inscribe a un turno disponible.
 * Si el turno está completo, se agrega a lista de espera automáticamente.
 */
export const CR_MiReserva_CTS = async (req, res) => {
  const transaccion = await db.transaction();
  try {
    const alumno_id = req.alumno.id;
    const sede_id   = req.alumno.sede_id;
    const { turno_id, membresia_id } = req.body;

    if (!sede_id) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'No tenés una sede asignada. Consultá con administración.' });
    }

    if (!turno_id) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'Falta el campo requerido: turno_id.' });
    }

    // Bloquea la fila del turno hasta que termine la transacción, evitando
    // que dos inscripciones concurrentes superen el cupo_maximo.
    const turno = await AgendaTurnosModel.findByPk(turno_id, {
      transaction: transaccion,
      lock:        transaccion.LOCK.UPDATE
    });
    if (!turno) {
      await transaccion.rollback();
      return res.status(404).json({ message: 'Turno no encontrado.' });
    }

    if (turno.sede_id !== sede_id) {
      await transaccion.rollback();
      return res.status(403).json({ message: 'No podés inscribirte en una clase de otra sede.' });
    }

    if (turno.estado === 'cancelado' || turno.estado === 'bloqueado') {
      await transaccion.rollback();
      return res.status(400).json({ message: `No podés inscribirte en un turno ${turno.estado}.` });
    }

    // Verificar que el turno no haya pasado (con el reloj del servidor)
    const inicioTurno = dayjs(`${turno.fecha} ${turno.hora_inicio}`);
    if (inicioTurno.isBefore(dayjs())) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'No podés inscribirte en un turno que ya pasó.' });
    }

    // Verificar que el alumno no tenga ya una reserva activa
    const reservaExistente = await AgendaTurnosReservasModel.findOne({
      where:       { turno_id, alumno_id, estado: 'reservada' },
      transaction: transaccion
    });
    if (reservaExistente) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'Ya estás inscripto en este turno.' });
    }

    // Si no hay cupo, agregar a lista de espera (dentro de la misma transacción
    // para evitar que dos alumnos reciban la misma posición)
    if (turno.cupos_reservados >= turno.cupo_maximo) {
      const posicionActual = await AgendaTurnosListaEsperaModel.count({
        where:       { turno_id, estado: 'esperando' },
        transaction: transaccion
      });

      const enEspera = await AgendaTurnosListaEsperaModel.create({
        turno_id,
        alumno_id,
        posicion:   posicionActual + 1,
        estado:     'esperando',
        fecha_alta: new Date()
      }, { transaction: transaccion });

      await transaccion.commit();

      return res.status(200).json({
        message:  `El turno está completo. Quedaste en la posición ${enEspera.posicion} de la lista de espera.`,
        en_espera: true,
        posicion:  enEspera.posicion
      });
    }

    // Crear la reserva
    const reserva = await AgendaTurnosReservasModel.create({
      turno_id,
      alumno_id,
      membresia_id:   membresia_id || null,
      origen_reserva: 'alumno',
      estado:         'reservada',
      fecha_reserva:  new Date()
    }, { transaction: transaccion });

    // Actualizar contador de cupos
    await turno.update({
      cupos_reservados: turno.cupos_reservados + 1,
      estado:           turno.cupos_reservados + 1 >= turno.cupo_maximo ? 'completo' : 'disponible',
      updated_at:       new Date()
    }, { transaction: transaccion });

    await transaccion.commit();

    return res.status(201).json({ message: 'Inscripción realizada correctamente.', reserva });
  } catch (error) {
    await transaccion.rollback();
    console.error('[CR_MiReserva_CTS]', error);
    return res.status(500).json({ message: 'Error al inscribirte en el turno.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23
 * Alumno cancela su propia reserva.
 * Valida el tiempo mínimo de anticipación desde sistema_configuracion.
 * Si hay lista de espera, promueve al primero automáticamente.
 */
export const ER_MiReserva_CTS = async (req, res) => {
  try {
    const alumno_id = req.alumno.id;
    const { id }    = req.params;

    const reserva = await AgendaTurnosReservasModel.findByPk(id);
    if (!reserva || reserva.alumno_id !== alumno_id) {
      return res.status(404).json({ message: 'Reserva no encontrada.' });
    }

    if (reserva.estado !== 'reservada') {
      return res.status(400).json({ message: 'Solo podés cancelar reservas activas.' });
    }

    const turno = await AgendaTurnosModel.findByPk(reserva.turno_id);

    // Validar tiempo mínimo de cancelación
    const minutosLimite    = await obtenerMinutosCancelacion();
    const inicioTurno      = dayjs(`${turno.fecha} ${turno.hora_inicio}`);
    const minutosRestantes = inicioTurno.diff(dayjs(), 'minute');

    if (minutosRestantes < minutosLimite) {
      return res.status(400).json({
        message: `No podés cancelar con menos de ${minutosLimite} minutos de anticipación. Quedan ${minutosRestantes} minutos.`
      });
    }

    await reserva.update({
      estado:            'cancelada',
      fecha_cancelacion: new Date(),
      updated_at:        new Date()
    });

    // Liberar cupo
    await turno.update({
      cupos_reservados: Math.max(0, turno.cupos_reservados - 1),
      estado:           'disponible',
      updated_at:       new Date()
    });

    // Promover al primero de la lista de espera
    await promoverListaEspera(reserva.turno_id);

    return res.status(200).json({ message: 'Reserva cancelada correctamente.' });
  } catch (error) {
    console.error('[ER_MiReserva_CTS]', error);
    return res.status(500).json({ message: 'Error al cancelar tu reserva.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23
 * Alumno reprograma su reserva a otro turno disponible.
 * Valida tiempo mínimo de cancelación en el turno original.
 * Cancela la reserva original y crea una nueva en el turno destino.
 */
export const UR_ReprogramarMiReserva_CTS = async (req, res) => {
  const transaccion = await db.transaction();
  try {
    const alumno_id          = req.alumno.id;
    const sede_id            = req.alumno.sede_id;
    const { id }             = req.params;
    const { turno_destino_id } = req.body;

    if (!turno_destino_id) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'Falta el campo requerido: turno_destino_id.' });
    }

    const reserva = await AgendaTurnosReservasModel.findByPk(id, { transaction: transaccion });
    if (!reserva || reserva.alumno_id !== alumno_id) {
      await transaccion.rollback();
      return res.status(404).json({ message: 'Reserva no encontrada.' });
    }

    if (reserva.estado !== 'reservada') {
      await transaccion.rollback();
      return res.status(400).json({ message: 'Solo podés reprogramar reservas activas.' });
    }

    const turnoOrigen = await AgendaTurnosModel.findByPk(reserva.turno_id, { transaction: transaccion });

    // Bloquea la fila del turno destino para evitar que dos reprogramaciones
    // concurrentes superen su cupo_maximo.
    const turnoDestino = await AgendaTurnosModel.findByPk(turno_destino_id, {
      transaction: transaccion,
      lock:        transaccion.LOCK.UPDATE
    });

    if (!turnoDestino) {
      await transaccion.rollback();
      return res.status(404).json({ message: 'El turno destino no existe.' });
    }

    if (turnoDestino.sede_id !== sede_id) {
      await transaccion.rollback();
      return res.status(403).json({ message: 'No podés reprogramar a una clase de otra sede.' });
    }

    if (turnoDestino.estado === 'cancelado' || turnoDestino.estado === 'bloqueado') {
      await transaccion.rollback();
      return res.status(400).json({ message: `No podés reprogramar a un turno ${turnoDestino.estado}.` });
    }

    if (turnoDestino.cupos_reservados >= turnoDestino.cupo_maximo) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'El turno destino no tiene cupos disponibles.' });
    }

    // Validar tiempo mínimo en el turno original (con el reloj del servidor)
    const minutosLimite    = await obtenerMinutosCancelacion();
    const inicioOrigen     = dayjs(`${turnoOrigen.fecha} ${turnoOrigen.hora_inicio}`);
    const minutosRestantes = inicioOrigen.diff(dayjs(), 'minute');

    if (minutosRestantes < minutosLimite) {
      await transaccion.rollback();
      return res.status(400).json({
        message: `No podés reprogramar con menos de ${minutosLimite} minutos de anticipación.`
      });
    }

    // Cancelar reserva original
    await reserva.update({
      estado:            'reprogramada',
      fecha_cancelacion: new Date(),
      updated_at:        new Date()
    }, { transaction: transaccion });

    await turnoOrigen.update({
      cupos_reservados: Math.max(0, turnoOrigen.cupos_reservados - 1),
      estado:           'disponible',
      updated_at:       new Date()
    }, { transaction: transaccion });

    // Crear nueva reserva en turno destino
    const nuevaReserva = await AgendaTurnosReservasModel.create({
      turno_id:       turno_destino_id,
      alumno_id,
      membresia_id:   reserva.membresia_id || null,
      origen_reserva: 'alumno',
      estado:         'reservada',
      fecha_reserva:  new Date(),
      observaciones:  `Reprogramada desde turno #${turnoOrigen.id}`
    }, { transaction: transaccion });

    await turnoDestino.update({
      cupos_reservados: turnoDestino.cupos_reservados + 1,
      estado:           turnoDestino.cupos_reservados + 1 >= turnoDestino.cupo_maximo ? 'completo' : 'disponible',
      updated_at:       new Date()
    }, { transaction: transaccion });

    await transaccion.commit();

    // Promover lista de espera del turno original (fuera de la transacción,
    // ya con el cupo liberado confirmado)
    await promoverListaEspera(turnoOrigen.id);

    return res.status(200).json({
      message:       'Reserva reprogramada correctamente.',
      nueva_reserva: nuevaReserva
    });
  } catch (error) {
    if (!transaccion.finished) await transaccion.rollback();
    console.error('[UR_ReprogramarMiReserva_CTS]', error);
    return res.status(500).json({ message: 'Error al reprogramar tu reserva.' });
  }
};
