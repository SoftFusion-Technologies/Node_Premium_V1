/*
 * Programador: Sergio Manrique
 * Fecha Creación: 23 / 06 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_AgendaTurnosReservas.js) contiene los controladores
 * para gestionar las reservas de turnos (agenda_turnos_reservas).
 * Incluye inscripción de alumnos, cancelación con tiempo límite,
 * reprogramación y marcado de asistencia. Reservar consume un cupo de la
 * membresía y crea la asistencia inicial en estado 'asistio'. El profesor puede
 * cambiarla luego a 'ausente' o mantenerla como presente. Al cancelar se
 * conserva el registro en estado 'cancelo' para auditoría.
 *
 * Tema: Controladores - Agenda
 * Capa: Backend
 */

import { Op }                         from 'sequelize';
import dayjs                          from 'dayjs';
import AgendaTurnosModel              from '../../Models/Agenda/MD_TB_AgendaTurnos.js';
import AgendaTurnosReservasModel      from '../../Models/Agenda/MD_TB_AgendaTurnosReservas.js';
import AgendaTurnosListaEsperaModel   from '../../Models/Agenda/MD_TB_AgendaTurnosListaEspera.js';
import AlumnosModel                   from '../../Models/Alumno/MD_TB_Alumnos.js';
import AlumnosMembresiasModel         from '../../Models/Alumno/MD_TB_AlumnosMembresias.js';
import AlumnosAsistenciasModel        from '../../Models/Alumno/MD_TB_AlumnosAsistencias.js';
import SistemaConfiguracionModel      from '../../Models/Sistema/MD_TB_SistemaConfiguracion.js';
import SedesModel                     from '../../Models/Sede/MD_TB_Sedes.js';
import db                             from '../../DataBase/db.js';
import { normalizarCicloMembresiasAlumno } from '../../Services/Alumno/membresiaCiclo.service.js';

// ─── Helper interno ───────────────────────────────────────────────────────────

// Compatibilidad con reservas históricas: versiones anteriores guardaban
// 'asistio' o 'ausente' en agenda_turnos_reservas. Esas filas siguen
// representando una inscripción y ocupan cupo.
export const ESTADOS_RESERVA_QUE_OCUPAN_CUPO = [
  'reservada',
  'asistio',
  'ausente'
];

export const sincronizarCuposTurno = async ({
  turnoId,
  transaction = null,
  turnoBloqueado = null
}) => {
  const turno =
    turnoBloqueado ||
    (await AgendaTurnosModel.findByPk(turnoId, { transaction }));

  if (!turno) return 0;

  const cuposReales = await AgendaTurnosReservasModel.count({
    where: {
      turno_id: turno.id,
      estado: { [Op.in]: ESTADOS_RESERVA_QUE_OCUPAN_CUPO }
    },
    transaction
  });

  const estadoActual = String(turno.estado || 'disponible');
  const estadoCalculado = ['bloqueado', 'cancelado'].includes(estadoActual)
    ? estadoActual
    : cuposReales >= Number(turno.cupo_maximo || 0)
      ? 'completo'
      : 'disponible';

  if (
    Number(turno.cupos_reservados || 0) !== cuposReales ||
    estadoActual !== estadoCalculado
  ) {
    await turno.update(
      {
        cupos_reservados: cuposReales,
        estado: estadoCalculado,
        updated_at: new Date()
      },
      { transaction }
    );
  }

  return cuposReales;
};

/*
 * Benjamin Orellana - 2026/07/18
 * Cuando no existe una membresía elegible, prioriza para el diagnóstico el
 * período que corresponde a la fecha de la clase. Evita diagnosticar otro
 * período distinto del que realmente debería pagar esa reserva.
 */
const buscarMembresiaParaDiagnostico = async ({
  alumnoId,
  fechaReferencia,
  transaction = null
}) => {
  const vigenteEnFecha = await AlumnosMembresiasModel.findOne({
    where: {
      alumno_id: alumnoId,
      fecha_inicio: { [Op.lte]: fechaReferencia },
      fecha_vencimiento: { [Op.gte]: fechaReferencia }
    },
    order: [['fecha_inicio', 'ASC'], ['id', 'ASC']],
    transaction
  });

  if (vigenteEnFecha) return vigenteEnFecha;

  return AlumnosMembresiasModel.findOne({
    where: { alumno_id: alumnoId },
    order: [['fecha_inicio', 'DESC'], ['id', 'DESC']],
    transaction
  });
};

/*
 * Lee el límite de minutos para cancelar desde sistema_configuracion.
 * Default: 60 minutos si no se encuentra la clave.
 */
export const obtenerMinutosCancelacion = async () => {
  const config = await SistemaConfiguracionModel.findOne({
    where: { clave: 'minutos_cancelacion_anticipada', activo: 1 }
  });
  return config ? parseInt(config.valor) : 60;
};


const construirObservacionesCreditoDevuelto = (
  observaciones,
  creditoDevuelto
) => {
  const base = String(observaciones || '')
    .replace(/\s*\[CREDITO_DEVUELTO:(?:SI|NO)\]\s*/gi, '\n')
    .trim();
  const marcador = `[CREDITO_DEVUELTO:${creditoDevuelto ? 'SI' : 'NO'}]`;

  return base ? `${base}\n${marcador}` : marcador;
};

/*
 * Benjamin Orellana - 2026/07/21
 * Toda reserva confirmada nace con asistencia 'asistio'. Este es el criterio
 * operativo de Premium: el profesor solo modifica las excepciones y marca
 * 'ausente' cuando el alumno no concurre. Se ejecuta dentro de la misma
 * transacción que crea la reserva para evitar reservas sin asistencia.
 */
const crearAsistenciaInicialReserva = async ({
  reserva,
  turno,
  transaction,
  registradoPorId = null
}) => {
  if (!reserva || !turno) return null;

  const [asistencia] = await AlumnosAsistenciasModel.findOrCreate({
    where: { reserva_id: reserva.id },
    defaults: {
      alumno_id: reserva.alumno_id,
      sede_id: turno.sede_id,
      turno_id: turno.id,
      reserva_id: reserva.id,
      membresia_id: reserva.membresia_id || null,
      fecha: turno.fecha,
      estado: 'asistio',
      registrado_por_id: registradoPorId
    },
    transaction
  });

  return asistencia;
};

/*
 * Marca como 'cancelo' la asistencia asociada a una reserva. Normalmente la
 * fila ya existe en estado 'asistio'; se actualiza sin borrarla. El fallback
 * de creación se conserva para reservas históricas que todavía no tengan una
 * asistencia vinculada.
 *
 * Si el alumno se vuelve a inscribir más adelante, esa nueva inscripción
 * crea una reserva y una fila de asistencia completamente aparte (con su
 * propio reserva_id). El registro cancelado queda como historial.
 */
export const marcarAsistenciaComoCancelada = async (reserva_id, transaccion, registrado_por_id = null) => {
  const [actualizadas] = await AlumnosAsistenciasModel.update(
    {
      estado:             'cancelo',
      registrado_por_id,
      updated_at:         new Date()
    },
    {
      where:       { reserva_id },
      transaction: transaccion
    }
  );

  if (actualizadas > 0) return;

  const reserva = await AgendaTurnosReservasModel.findByPk(reserva_id, {
    transaction: transaccion
  });
  if (!reserva) return;

  const turno = await AgendaTurnosModel.findByPk(reserva.turno_id, {
    transaction: transaccion
  });
  if (!turno) return;

  await AlumnosAsistenciasModel.create(
    {
      alumno_id: reserva.alumno_id,
      sede_id: turno.sede_id,
      turno_id: turno.id,
      reserva_id: reserva.id,
      membresia_id: reserva.membresia_id || null,
      fecha: turno.fecha,
      estado: 'cancelo',
      registrado_por_id
    },
    { transaction: transaccion }
  );
};

/*
 * Promueve al primer alumno en lista de espera de un turno
 * cuando se libera un cupo (cancelación o reprogramación).
 * Si el alumno tiene membresía activa con créditos, los descuenta.
 */
const promoverListaEspera = async (turno_id) => {
  const transaccion = await db.transaction();
  try {
    // Bloquea la fila del turno para que dos promociones concurrentes (dos
    // cupos liberados casi al mismo tiempo) no lean el mismo primero de la
    // lista de espera ni pisen cupos_reservados entre sí.
    const turno = await AgendaTurnosModel.findByPk(turno_id, {
      transaction: transaccion,
      lock:        transaccion.LOCK.UPDATE
    });
    if (!turno) {
      await transaccion.rollback();
      return;
    }

    // El turno deja de aceptar promociones apenas termina (hora_fin), igual
    // que la inscripción manual: no tiene sentido anotar a alguien de la
    // lista de espera a una clase que ya finalizó.
    const finTurno = dayjs(`${turno.fecha} ${turno.hora_fin}`);
    if (finTurno.isBefore(dayjs())) {
      await transaccion.rollback();
      return;
    }

    const cuposActuales = await sincronizarCuposTurno({
      turnoId: turno.id,
      transaction: transaccion,
      turnoBloqueado: turno
    });

    if (cuposActuales >= turno.cupo_maximo) {
      await transaccion.rollback();
      return;
    }

    // Recorre la fila en orden: si el primero no tiene membresía vigente con
    // créditos para la fecha del turno, se lo deja en 'esperando' tal cual
    // (puede conseguir crédito después) y se prueba con el siguiente, en vez
    // de trabar el cupo liberado esperando indefinidamente al primero.
    const candidatos = await AgendaTurnosListaEsperaModel.findAll({
      where:       { turno_id, estado: 'esperando' },
      order:       [['posicion', 'ASC']],
      transaction: transaccion,
      lock:        transaccion.LOCK.UPDATE
    });
    if (candidatos.length === 0) {
      await transaccion.rollback();
      return;
    }

    let primero    = null;
    let membresia  = null;

    for (const candidato of candidatos) {
      // Se consume primero la membresía más antigua (FIFO) que cumpla las
      // condiciones, igual que en CR_MiReserva_CTS / CR_ReservaAdmin_CTS,
      // vigente también en la fecha del turno (no solo hoy).
      const membresiaCandidata = await AlumnosMembresiasModel.findOne({
        where: {
          alumno_id:          candidato.alumno_id,
          plan_id:            { [Op.ne]: null },
          estado:             'activa',
          // Para una reserva futura importa que el período cubra la fecha de
          // la clase. Una renovación confirmada puede comenzar después de hoy
          // y aun así ser la membresía correcta para ese turno.
          fecha_inicio:       { [Op.lte]: turno.fecha },
          // El vencimiento es inclusivo: el ultimo dia indicado aun habilita.
          fecha_vencimiento:  { [Op.gte]: turno.fecha },
          clases_disponibles: { [Op.gt]: 0 }
        },
        order:       [['fecha_inicio', 'ASC'], ['id', 'ASC']],
        transaction: transaccion,
        lock:        transaccion.LOCK.UPDATE
      });

      if (membresiaCandidata) {
        primero   = candidato;
        membresia = membresiaCandidata;
        break;
      }
    }

    if (!primero) {
      await transaccion.rollback();
      return;
    }

    // Crear reserva para el primer candidato promovible
    const reserva = await AgendaTurnosReservasModel.create({
      turno_id,
      alumno_id:      primero.alumno_id,
      membresia_id:   membresia.id,
      origen_reserva: 'sistema',
      estado:         'reservada',
      fecha_reserva:  new Date()
    }, { transaction: transaccion });

    await crearAsistenciaInicialReserva({
      reserva,
      turno,
      transaction: transaccion
    });

    // Descontar crédito de la membresía
    await membresia.update({
      clases_usadas:      membresia.clases_usadas + 1,
      clases_disponibles: membresia.clases_disponibles - 1,
      updated_at:         new Date()
    }, { transaction: transaccion });

    await normalizarCicloMembresiasAlumno({
      alumnoId: primero.alumno_id,
      transaction: transaccion
    });

    // Marcar como asignado en la lista de espera
    await primero.update({
      estado:           'asignado',
      fecha_resolucion: new Date(),
      updated_at:       new Date()
    }, { transaction: transaccion });

    // Recalcular desde las reservas que realmente ocupan cupo.
    await sincronizarCuposTurno({
      turnoId: turno.id,
      transaction: transaccion,
      turnoBloqueado: turno
    });

    // Reordenar posiciones de los restantes
    const restantes = await AgendaTurnosListaEsperaModel.findAll({
      where:       { turno_id, estado: 'esperando' },
      order:       [['posicion', 'ASC']],
      transaction: transaccion
    });

    for (let i = 0; i < restantes.length; i++) {
      await restantes[i].update({ posicion: i + 1 }, { transaction: transaccion });
    }

    await transaccion.commit();
  } catch (error) {
    await transaccion.rollback();
    console.error('[promoverListaEspera]', error);
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
 * Sergio Manrique - 2026/07/05
 * Busca clientes activos de la sede de un turno para el buscador de
 * "Apuntar cliente", junto con si se pueden inscribir de verdad (créditos,
 * vigencia y estado de la membresía) y, si no, el motivo exacto.
 *
 * OJO: a propósito NO reutiliza el campo `membresia_actual` que devuelve
 * GET /alumnos (construirAlumnoRespuesta en CTS_TB_Alumnos.js) porque ese
 * campo tiene un bug: por un cruce de variables, en realidad devuelve la
 * membresía más reciente sin importar su estado (puede estar con pago
 * pendiente, congelada o cancelada), no la que está realmente activa. Varias
 * pantallas ya dependen de ese comportamiento (edición de alumno, resumen
 * rápido, registro de pagos), así que no se corrige ahí para no arriesgar
 * esos flujos sin poder probarlos. Acá se resuelve la membresía real con el
 * mismo criterio exacto que usa CR_ReservaAdmin_CTS más abajo, para que lo
 * que se ve en el buscador siempre coincida con lo que el servidor acepta.
 */
export const OBRS_ClientesDisponiblesTurno_CTS = async (req, res) => {
  try {
    const { turno_id } = req.params;
    const { q } = req.query;

    const turno = await AgendaTurnosModel.findByPk(turno_id);
    if (!turno) {
      return res.status(404).json({ message: 'Turno no encontrado.' });
    }

    const where = { sede_id: turno.sede_id, estado: 'activo' };
    if (q) {
      const termino = `%${q}%`;
      where[Op.or] = [
        { nombre:   { [Op.like]: termino } },
        { apellido: { [Op.like]: termino } },
        { dni:      { [Op.like]: termino } }
      ];
    }

    // Quien ya esta reservado no vuelve a aparecer en el selector. Ademas de
    // mejorar la UX, evita que una seleccion masiva intente duplicarlo.
    const reservasActivas = await AgendaTurnosReservasModel.findAll({
      where: { turno_id, estado: { [Op.in]: ESTADOS_RESERVA_QUE_OCUPAN_CUPO } },
      attributes: ['alumno_id'],
      raw: true
    });
    const alumnosYaInscriptos = reservasActivas.map((reserva) =>
      Number(reserva.alumno_id)
    );

    if (alumnosYaInscriptos.length > 0) {
      where.id = { [Op.notIn]: alumnosYaInscriptos };
    }

    const alumnos = await AlumnosModel.findAll({
      where,
      attributes: ['id', 'nombre', 'apellido', 'dni'],
      order: [['nombre', 'ASC'], ['apellido', 'ASC']],
      limit: 20
    });

    // El turno deja de aceptar inscripciones apenas termina (hora_fin), no
    // recién al otro día: si el turno es de 16 a 17, a las 16:56 todavía se
    // puede apuntar, pero a las 17:01 ya no, aunque el modal haya quedado
    // abierto desde antes de que terminara.
    const finTurno   = dayjs(`${turno.fecha} ${turno.hora_fin}`);
    const turnoVencido = finTurno.isBefore(dayjs());

    const data = await Promise.all(alumnos.map(async (alumno) => {
      if (turnoVencido) {
        return {
          id:                    alumno.id,
          nombre:                alumno.nombre,
          apellido:              alumno.apellido,
          dni:                   alumno.dni,
          creditos:              0,
          fecha_vencimiento:     null,
          inscribible:           false,
          motivo_no_inscribible: 'La clase ya finalizó'
        };
      }
      // Misma membresía que consumiría la inscripción real (la más antigua,
      // activa, con créditos y que cubra la fecha del turno, FIFO). Si no hay
      // ninguna que cumpla, se cae a una membresía diagnóstica para explicar
      // el motivo.
      let membresia = await AlumnosMembresiasModel.findOne({
        where: {
          alumno_id:          alumno.id,
          plan_id:            { [Op.ne]: null },
          estado:             'activa',
          fecha_inicio:       { [Op.lte]: turno.fecha },
          fecha_vencimiento:  { [Op.gte]: turno.fecha },
          // Una membresía vigente pero agotada no debe ocultar una renovación
          // que ya comenzó y todavía tiene créditos disponibles.
          clases_disponibles: { [Op.gt]: 0 }
        },
        order: [['fecha_inicio', 'ASC'], ['id', 'ASC']]
      });

      if (!membresia) {
        membresia = await buscarMembresiaParaDiagnostico({
          alumnoId: alumno.id,
          fechaReferencia: turno.fecha
        });
      }

      const vencimientoVigente =
        !!membresia && !dayjs(turno.fecha).isAfter(membresia.fecha_vencimiento, 'day');
      const inicioVigente =
        !!membresia && !dayjs(membresia.fecha_inicio).isAfter(turno.fecha, 'day');

      const inscribible =
        !!membresia &&
        !!membresia.plan_id &&
        membresia.estado === 'activa' &&
        inicioVigente &&
        vencimientoVigente &&
        membresia.clases_disponibles > 0;

      let motivo = null;
      if (!inscribible) {
        if (!membresia) motivo = 'Sin membresía';
        else if (!membresia.plan_id) motivo = 'Membresía sin plan asociado';
        else if (membresia.estado === 'congelada') motivo = 'Membresía congelada';
        else if (membresia.estado === 'cancelada') motivo = 'Membresía cancelada';
        else if (membresia.estado === 'pendiente_pago') motivo = 'Pago pendiente';
        else if (!vencimientoVigente) motivo = 'Membresía vencida';
        else if (!inicioVigente) motivo = 'Membresía aún no vigente';
        else if (membresia.clases_disponibles <= 0) motivo = 'Sin créditos';
        else motivo = `Membresía en estado "${membresia.estado}"`;
      }

      return {
        id:                    alumno.id,
        nombre:                alumno.nombre,
        apellido:              alumno.apellido,
        dni:                   alumno.dni,
        creditos:              membresia?.clases_disponibles ?? 0,
        creditos_habilitados:  inscribible ? Number(membresia?.clases_disponibles || 0) : 0,
        membresia_id:          membresia?.id ?? null,
        plan_id:               membresia?.plan_id ?? null,
        estado_membresia:      membresia?.estado ?? null,
        fecha_vencimiento:     membresia?.fecha_vencimiento ?? null,
        inscribible,
        motivo_no_inscribible: motivo
      };
    }));

    return res.status(200).json({ status: 'success', data, total: data.length });
  } catch (error) {
    console.error('[OBRS_ClientesDisponiblesTurno_CTS]', error);
    return res.status(500).json({ message: 'Error al buscar clientes.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23 / actualizado 2026/07/05
 * Admin inscribe manualmente a un alumno en un turno.
 * Ignora el límite de tiempo de cancelación, pero SÍ valida que el alumno
 * tenga una membresía activa con créditos disponibles (igual que la
 * inscripción por el propio alumno), descontando el crédito de forma
 * atómica dentro de la transacción para evitar condiciones de carrera
 * si dos gestores inscriben al mismo alumno/turno en simultáneo, o si el
 * alumno se autoinscribe justo mientras el gestor tenía el formulario abierto.
 * El backend determina y bloquea la membresía a usar; nunca confía en un
 * membresia_id enviado desde el cliente.
 */
export const CR_ReservaAdmin_CTS = async (req, res) => {
  const transaccion = await db.transaction();
  try {
    const { turno_id, alumno_id, observaciones } = req.body;

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

    // El turno deja de aceptar inscripciones apenas termina (hora_fin), con el
    // reloj del servidor. Se valida acá (no solo en el listado del modal) para
    // cubrir el caso de que el gestor haya dejado el modal abierto desde antes
    // de que la clase terminara y recién ahora confirme la inscripción.
    const finTurno = dayjs(`${turno.fecha} ${turno.hora_fin}`);
    if (finTurno.isBefore(dayjs())) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'No se puede inscribir en una clase que ya finalizó.' });
    }

    const alumno = await AlumnosModel.findByPk(alumno_id, { transaction: transaccion });
    if (!alumno) {
      await transaccion.rollback();
      return res.status(404).json({ message: 'Alumno no encontrado.' });
    }

    if (alumno.sede_id !== turno.sede_id) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'El alumno no pertenece a la sede de este turno.' });
    }

    // Verificar si el alumno ya tiene una reserva activa en este turno
    const reservaExistente = await AgendaTurnosReservasModel.findOne({
      where: {
        turno_id,
        alumno_id,
        estado: { [Op.in]: ESTADOS_RESERVA_QUE_OCUPAN_CUPO }
      },
      transaction: transaccion
    });
    if (reservaExistente) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'El alumno ya tiene una reserva activa en este turno.' });
    }

    // Verificar cupo desde las reservas reales; el contador persistido puede
    // venir desfasado en datos históricos.
    const cuposActuales = await sincronizarCuposTurno({
      turnoId: turno.id,
      transaction: transaccion,
      turnoBloqueado: turno
    });
    if (cuposActuales >= turno.cupo_maximo) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'El turno no tiene cupos disponibles.' });
    }

    // ── Validación de membresía y créditos (siempre desde el backend) ──────────
    // Bloquea la fila de la membresía para evitar doble descuento si llegan
    // dos inscripciones simultáneas para el mismo alumno (otro gestor, u otra
    // pestaña/dispositivo).
    const fechaReferencia = turno.fecha;

    // Se consume primero la membresía más antigua (FIFO) que esté activa, con
    // créditos y cubra la fecha de la clase. Así, un período agotado no tapa
    // la renovación y una reserva futura puede usar el período que realmente
    // estará vigente ese día.
    const membresia = await AlumnosMembresiasModel.findOne({
      where: {
        alumno_id,
        plan_id:           { [Op.ne]: null },
        estado:            'activa',
        fecha_inicio:      { [Op.lte]: turno.fecha },
        // El vencimiento es inclusivo: el ultimo dia indicado aun habilita.
        fecha_vencimiento: { [Op.gte]: turno.fecha },
        // Si el período anterior quedó en cero y la renovación ya está
        // vigente, continúa con la membresía más antigua que sí tenga cupos.
        clases_disponibles: { [Op.gt]: 0 }
      },
      order:       [['fecha_inicio', 'ASC'], ['id', 'ASC']],
      transaction: transaccion,
      lock:        transaccion.LOCK.UPDATE
    });

    if (!membresia) {
      // Buscar la membresía más reciente (aunque no esté vigente) para dar
      // un mensaje preciso en vez de uno genérico.
      const cualquiera = await buscarMembresiaParaDiagnostico({
        alumnoId: alumno_id,
        fechaReferencia,
        transaction: transaccion
      });

      await transaccion.rollback();

      if (!cualquiera) {
        return res.status(403).json({ message: 'El alumno no tiene una membresía activa para inscribirse en esta clase.' });
      }
      if (!cualquiera.plan_id) {
        return res.status(403).json({ message: 'La membresía vigente del alumno no tiene un plan asociado. Regularizala antes de inscribirlo.' });
      }
      if (dayjs(fechaReferencia).isAfter(cualquiera.fecha_vencimiento, 'day')) {
        return res.status(403).json({
          message: `La membresía del alumno ya venció (${dayjs(cualquiera.fecha_vencimiento).format('DD/MM/YYYY')}).`
        });
      }
      if (dayjs(cualquiera.fecha_inicio).isAfter(fechaReferencia, 'day')) {
        return res.status(403).json({ message: 'La membresía del alumno todavía no está vigente.' });
      }
      // La membresía está dentro de su rango de fechas (por eso el listado
      // puede mostrar créditos y días para vencer) pero su estado no es
      // 'activa': está congelada, cancelada, o con el pago pendiente. Se
      // informa el estado real para poder diagnosticarlo desde la UI.
      if (cualquiera.estado === 'congelada') {
        return res.status(403).json({ message: 'La membresía del alumno está congelada. Hay que reactivarla antes de poder inscribirlo.' });
      }
      if (cualquiera.estado === 'cancelada') {
        return res.status(403).json({ message: 'La membresía del alumno está cancelada.' });
      }
      if (cualquiera.estado === 'pendiente_pago') {
        return res.status(403).json({ message: 'La membresía del alumno tiene el pago pendiente, no está activa todavía.' });
      }
      return res.status(403).json({ message: `El alumno no tiene una membresía activa para inscribirse en esta clase (estado actual: ${cualquiera.estado}).` });
    }

    if (membresia.clases_disponibles <= 0) {
      await transaccion.rollback();
      return res.status(403).json({ message: 'El alumno no tiene créditos disponibles para inscribirse en esta clase.' });
    }

    if (dayjs(turno.fecha).isAfter(dayjs(membresia.fecha_vencimiento), 'day')) {
      await transaccion.rollback();
      return res.status(403).json({
        message: `No se puede inscribir en una clase posterior al vencimiento de la membresía (${dayjs(membresia.fecha_vencimiento).format('DD/MM/YYYY')}).`
      });
    }

    // Descontar crédito de la membresía
    await membresia.update({
      clases_usadas:      membresia.clases_usadas + 1,
      clases_disponibles: membresia.clases_disponibles - 1,
      updated_at:         new Date()
    }, { transaction: transaccion });

    await normalizarCicloMembresiasAlumno({
      alumnoId: alumno_id,
      transaction: transaccion
    });

    const reserva = await AgendaTurnosReservasModel.create({
      turno_id,
      alumno_id,
      membresia_id:   membresia.id,
      origen_reserva: 'administracion',
      estado:         'reservada',
      fecha_reserva:  new Date(),
      observaciones:  observaciones  || null
    }, { transaction: transaccion });

    await crearAsistenciaInicialReserva({
      reserva,
      turno,
      transaction: transaccion,
      registradoPorId: req.user?.id ?? req.user?.usuario_id ?? null
    });

    // Recalcular desde las reservas que realmente ocupan cupo.
    await sincronizarCuposTurno({
      turnoId: turno.id,
      transaction: transaccion,
      turnoBloqueado: turno
    });

    await transaccion.commit();

    return res.status(201).json({ message: 'Alumno inscripto correctamente.', reserva });
  } catch (error) {
    await transaccion.rollback();
    console.error('[CR_ReservaAdmin_CTS]', error);
    return res.status(500).json({ message: 'Error al inscribir al alumno.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23 / corregido 2026/07/05
 * Admin marca asistencia o ausencia de un alumno en un turno.
 * estado: 'asistio' | 'ausente'
 *
 * OJO: esto actualiza agenda_alumnos_asistencias (la tabla de asistencia
 * real), NO el campo `estado` de la reserva. Antes escribía directo sobre
 * `estado` de agenda_turnos_reservas, que es el campo que indica si la
 * inscripción sigue activa ('reservada'/'cancelada'/'reprogramada'): pisarlo
 * con 'asistio'/'ausente' hacía que el alumno desapareciera de los filtros
 * `estado === 'reservada'` usados en todo el resto del módulo (lista de
 * inscriptos, cupo, chequeo de reserva duplicada), como si se hubiese dado
 * de baja del turno.
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
    if (!ESTADOS_RESERVA_QUE_OCUPAN_CUPO.includes(reserva.estado)) {
      return res.status(400).json({ message: 'Solo se puede marcar asistencia de una reserva activa.' });
    }

    const turno = await AgendaTurnosModel.findByPk(reserva.turno_id);

    const [asistencia] = await AlumnosAsistenciasModel.findOrCreate({
      where: { reserva_id: reserva.id },
      defaults: {
        alumno_id:    reserva.alumno_id,
        sede_id:      turno?.sede_id ?? null,
        turno_id:     reserva.turno_id,
        reserva_id:   reserva.id,
        membresia_id: reserva.membresia_id || null,
        fecha:        turno?.fecha ?? dayjs().format('YYYY-MM-DD'),
        estado
      }
    });

    await asistencia.update({
      estado,
      registrado_por_id: req.user?.id ?? req.user?.usuario_id ?? null,
      updated_at:        new Date()
    });

    return res.status(200).json({ message: `Asistencia marcada como ${estado}.`, asistencia });
  } catch (error) {
    console.error('[UR_AsistenciaAdmin_CTS]', error);
    return res.status(500).json({ message: 'Error al marcar asistencia.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23 / actualizado 2026/07/09
 * Admin da de baja la reserva de un alumno. A diferencia de la cancelación
 * del propio alumno (ER_MiReserva_CTS), acá SÍ se permite dar de baja dentro
 * de la ventana de cancelación anticipada o incluso con la clase en curso
 * (es una gestión manual del admin, no un pedido de último momento del
 * alumno), con el mismo límite de minutos que usa la cancelación del alumno
 * (sistema_configuracion, default 60'). Fuera de esa ventana el reembolso es
 * automático. Dentro de la ventana (o con la clase ya en curso/pasada), el
 * reembolso pasa a ser opcional: solo se hace si el body manda
 * devolver_credito_vencido = true (lo decide el admin en el frontend).
 * Solo se bloquea por completo una vez que la clase ya terminó
 * (fecha + hora_fin): ahí ni se puede dar de baja.
 * Si la reserva sí da derecho a reembolso y hay lista de espera, promueve
 * al primero automáticamente al liberarse el cupo.
 */
export const ER_ReservaAdmin_CTS = async (req, res) => {
  const transaccion = await db.transaction();
  try {
    const { id } = req.params;
    const { motivo_cancelacion, devolver_credito_vencido } = req.body;

    // Bloquea la reserva para que dos bajas simultáneas de la misma
    // inscripción (doble click, o el admin y un proceso automático a la vez)
    // no pasen ambas la validación de estado y descuenten/reembolsen dos veces.
    const reserva = await AgendaTurnosReservasModel.findByPk(id, {
      transaction: transaccion,
      lock:        transaccion.LOCK.UPDATE
    });
    if (!reserva) {
      await transaccion.rollback();
      return res.status(404).json({ message: 'Reserva no encontrada.' });
    }

    if (!ESTADOS_RESERVA_QUE_OCUPAN_CUPO.includes(reserva.estado)) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'Solo se pueden cancelar reservas activas.' });
    }

    // Bloquea el turno desde el principio: se necesita para decidir si la
    // baja todavía es posible y si corresponde reembolso, antes de tocar nada.
    const turno = await AgendaTurnosModel.findByPk(reserva.turno_id, {
      transaction: transaccion,
      lock:        transaccion.LOCK.UPDATE
    });

    // Una vez que la clase termina (fecha + hora_fin) ya no se puede dar de
    // baja a nadie, ni con ni sin reembolso: el botón también se oculta en
    // el frontend, esto cubre el caso de que el modal haya quedado abierto
    // desde antes de que terminara.
    const finTurno = dayjs(`${turno.fecha} ${turno.hora_fin}`);
    if (finTurno.isBefore(dayjs())) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'No se puede dar de baja una reserva de una clase que ya finalizó.' });
    }

    // Fuera de la ventana de cancelación, el reembolso es automático. Dentro
    // de esa ventana (o con la clase ya en curso), se puede dar de baja igual
    // pero el reembolso pasa a ser opcional: solo se hace si el admin lo pidió
    // explícitamente (devolver_credito_vencido).
    const minutosLimite    = await obtenerMinutosCancelacion();
    const inicioTurno      = dayjs(`${turno.fecha} ${turno.hora_inicio}`);
    const minutosRestantes = inicioTurno.diff(dayjs(), 'minute');
    const dentroVentana    = minutosRestantes < minutosLimite;
    const correspondeReembolso = !dentroVentana || devolver_credito_vencido === true;

    await reserva.update({
      estado:             'cancelada',
      fecha_cancelacion:  new Date(),
      motivo_cancelacion: motivo_cancelacion || null,
      updated_at:         new Date()
    }, { transaction: transaccion });

    // Marcar la asistencia como cancelada (no se borra): queda en el
    // historial que el admin dio de baja esta inscripción.
    await marcarAsistenciaComoCancelada(
      reserva.id,
      transaccion,
      req.user?.id ?? req.user?.usuario_id ?? null
    );

    // Recalcular el cupo real después de cancelar.
    await sincronizarCuposTurno({
      turnoId: turno.id,
      transaction: transaccion,
      turnoBloqueado: turno
    });

    let creditoDevuelto = false;
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
        creditoDevuelto = true;
      }
    }

    await reserva.update(
      {
        observaciones: construirObservacionesCreditoDevuelto(
          reserva.observaciones,
          creditoDevuelto
        ),
        updated_at: new Date()
      },
      { transaction: transaccion }
    );

    await transaccion.commit();

    // Promover al primero de la lista de espera (fuera de la transacción,
    // ya con el cupo liberado confirmado)
    await promoverListaEspera(reserva.turno_id);

    return res.status(200).json({
      message:          'Reserva cancelada correctamente.',
      credito_devuelto: creditoDevuelto
    });
  } catch (error) {
    await transaccion.rollback();
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
      where: { alumno_id, estado: { [Op.in]: ESTADOS_RESERVA_QUE_OCUPAN_CUPO } },
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
 * Sergio Manrique - 2026/06/23 / actualizado 2026/06/29
 * Alumno se inscribe a un turno disponible.
 * Valida membresía activa y créditos disponibles antes de inscribir.
 * Si el turno está completo, se agrega a lista de espera automáticamente.
 * El backend determina y valida la membresía; nunca confía en datos del cliente.
 */
export const CR_MiReserva_CTS = async (req, res) => {
  const transaccion = await db.transaction();
  try {
    const alumno_id = req.alumno.id;
    const sede_id   = req.alumno.sede_id;
    const { turno_id } = req.body;

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
      where: {
        turno_id,
        alumno_id,
        estado: { [Op.in]: ESTADOS_RESERVA_QUE_OCUPAN_CUPO }
      },
      transaction: transaccion
    });
    if (reservaExistente) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'Ya estás inscripto en este turno.' });
    }

    // ── Validación de membresía y créditos (siempre desde el backend) ──────────
    // Bloquea la fila de la membresía para que no haya doble descuento si el
    // alumno envía dos peticiones simultáneas.
    const fechaReferencia = turno.fecha;

    // Se consume primero la membresía más antigua (FIFO) que esté activa, con
    // créditos y cubra la fecha de la clase. Esto también permite reservar
    // contra una renovación confirmada que comienza antes del turno.
    const membresia = await AlumnosMembresiasModel.findOne({
      where: {
        alumno_id,
        plan_id:           { [Op.ne]: null },
        estado:            'activa',
        fecha_inicio:      { [Op.lte]: turno.fecha },
        // El vencimiento es inclusivo: el ultimo dia indicado aun habilita.
        fecha_vencimiento: { [Op.gte]: turno.fecha },
        // Mantiene FIFO entre períodos utilizables, pero nunca selecciona un
        // período agotado por delante de una renovación con saldo disponible.
        clases_disponibles: { [Op.gt]: 0 }
      },
      order:       [['fecha_inicio', 'ASC'], ['id', 'ASC']],
      transaction: transaccion,
      lock:        transaccion.LOCK.UPDATE
    });

    if (!membresia) {
      // Buscar membresía para dar un mensaje preciso
      const cualquiera = await buscarMembresiaParaDiagnostico({
        alumnoId: alumno_id,
        fechaReferencia,
        transaction: transaccion
      });

      await transaccion.rollback();

      if (!cualquiera) {
        return res.status(403).json({ message: 'No tenés una membresía activa para inscribirte en esta clase.' });
      }
      if (!cualquiera.plan_id) {
        return res.status(403).json({ message: 'Tu membresía vigente no tiene un plan asociado. Consultá con administración para regularizarla.' });
      }
      if (cualquiera.estado === 'vencida' || dayjs(fechaReferencia).isAfter(cualquiera.fecha_vencimiento, 'day')) {
        return res.status(403).json({ message: 'Tu membresía ya se encuentra vencida.' });
      }
      if (dayjs(cualquiera.fecha_inicio).isAfter(fechaReferencia, 'day')) {
        return res.status(403).json({ message: 'Tu membresía todavía no está vigente.' });
      }
      if (cualquiera.estado === 'congelada') {
        return res.status(403).json({ message: 'Tu membresía está congelada. Consultá con administración para reactivarla.' });
      }
      if (cualquiera.estado === 'cancelada') {
        return res.status(403).json({ message: 'Tu membresía está cancelada.' });
      }
      if (cualquiera.estado === 'pendiente_pago') {
        return res.status(403).json({ message: 'Tu membresía tiene el pago pendiente, todavía no está activa.' });
      }
      return res.status(403).json({ message: 'No tenés una membresía activa para inscribirte en esta clase.' });
    }

    if (membresia.clases_disponibles <= 0) {
      await transaccion.rollback();
      return res.status(403).json({ message: 'No tenés créditos disponibles para inscribirte en esta clase.' });
    }

    // Validar que el turno no sea posterior al vencimiento de la membresía
    if (dayjs(turno.fecha).isAfter(dayjs(membresia.fecha_vencimiento), 'day')) {
      await transaccion.rollback();
      return res.status(403).json({
        message: `No podés inscribirte en una clase posterior al vencimiento de tu membresía (${dayjs(membresia.fecha_vencimiento).format('DD/MM/YYYY')}).`
      });
    }

    // Si no hay cupo, agregar a lista de espera. Se usa el conteo real de
    // inscripciones para no depender de un contador histórico desfasado.
    const cuposActuales = await sincronizarCuposTurno({
      turnoId: turno.id,
      transaction: transaccion,
      turnoBloqueado: turno
    });
    if (cuposActuales >= turno.cupo_maximo) {
      // Evita duplicarlo en la lista de espera si ya está anotado (doble
      // click, reintento de red, dos pestañas): sin este chequeo quedaba
      // dos veces, con dos posiciones distintas.
      const yaEnEspera = await AgendaTurnosListaEsperaModel.findOne({
        where:       { turno_id, alumno_id, estado: 'esperando' },
        transaction: transaccion
      });
      if (yaEnEspera) {
        await transaccion.rollback();
        return res.status(200).json({
          message:   `Ya estás en la lista de espera de este turno (posición ${yaEnEspera.posicion}).`,
          en_espera: true,
          posicion:  yaEnEspera.posicion
        });
      }

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
        message:   `El turno está completo. Quedaste en la posición ${enEspera.posicion} de la lista de espera.`,
        en_espera: true,
        posicion:  enEspera.posicion
      });
    }

    // Descontar crédito de la membresía
    await membresia.update({
      clases_usadas:      membresia.clases_usadas + 1,
      clases_disponibles: membresia.clases_disponibles - 1,
      updated_at:         new Date()
    }, { transaction: transaccion });

    await normalizarCicloMembresiasAlumno({
      alumnoId: alumno_id,
      transaction: transaccion
    });

    // Crear la reserva vinculada a la membresía que pagó el crédito
    const reserva = await AgendaTurnosReservasModel.create({
      turno_id,
      alumno_id,
      membresia_id:   membresia.id,
      origen_reserva: 'alumno',
      estado:         'reservada',
      fecha_reserva:  new Date()
    }, { transaction: transaccion });

    await crearAsistenciaInicialReserva({
      reserva,
      turno,
      transaction: transaccion
    });

    // Recalcular desde las reservas que realmente ocupan cupo.
    await sincronizarCuposTurno({
      turnoId: turno.id,
      transaction: transaccion,
      turnoBloqueado: turno
    });

    await transaccion.commit();

    return res.status(201).json({ message: 'Inscripción realizada correctamente.', reserva });
  } catch (error) {
    await transaccion.rollback();
    console.error('[CR_MiReserva_CTS]', error);
    return res.status(500).json({ message: 'No fue posible completar la inscripción porque otro usuario ocupó el último cupo unos instantes antes. Intentá de nuevo.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23 / actualizado 2026/06/29
 * Alumno cancela su propia reserva.
 * Valida el tiempo mínimo de anticipación desde sistema_configuracion.
 * Si la clase es futura y la reserva tiene membresía asociada, restaura el crédito.
 * Si hay lista de espera, promueve al primero automáticamente.
 */
export const ER_MiReserva_CTS = async (req, res) => {
  const transaccion = await db.transaction();
  try {
    const alumno_id = req.alumno.id;
    const { id }    = req.params;

    const reserva = await AgendaTurnosReservasModel.findByPk(id, { transaction: transaccion });
    if (!reserva || reserva.alumno_id !== alumno_id) {
      await transaccion.rollback();
      return res.status(404).json({ message: 'Reserva no encontrada.' });
    }

    if (!ESTADOS_RESERVA_QUE_OCUPAN_CUPO.includes(reserva.estado)) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'Solo podés cancelar reservas activas.' });
    }

    const turno = await AgendaTurnosModel.findByPk(reserva.turno_id, { transaction: transaccion });

    // Validar tiempo mínimo de cancelación (con el reloj del servidor)
    const minutosLimite    = await obtenerMinutosCancelacion();
    const inicioTurno      = dayjs(`${turno.fecha} ${turno.hora_inicio}`);
    const minutosRestantes = inicioTurno.diff(dayjs(), 'minute');

    if (minutosRestantes < minutosLimite) {
      await transaccion.rollback();
      return res.status(400).json({
        message: `No podés cancelar con menos de ${minutosLimite} minutos de anticipación. Quedan ${minutosRestantes} minutos.`
      });
    }

    await reserva.update({
      estado:            'cancelada',
      fecha_cancelacion: new Date(),
      updated_at:        new Date()
    }, { transaction: transaccion });

    // Marcar la asistencia como cancelada (no se borra): queda en el
    // historial que el alumno canceló él mismo (sin registrado_por_id,
    // ningún miembro del staff intervino en esta cancelación).
    await marcarAsistenciaComoCancelada(reserva.id, transaccion);

    // Recalcular el cupo real después de cancelar.
    await sincronizarCuposTurno({
      turnoId: turno.id,
      transaction: transaccion,
      turnoBloqueado: turno
    });

    // Restaurar crédito si la clase es futura y la reserva tiene membresía
    let creditoDevuelto = false;

    if (reserva.membresia_id && inicioTurno.isAfter(dayjs())) {
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
        creditoDevuelto = true;
      }
    }

    await reserva.update(
      {
        observaciones: construirObservacionesCreditoDevuelto(
          reserva.observaciones,
          creditoDevuelto
        ),
        updated_at: new Date()
      },
      { transaction: transaccion }
    );

    await transaccion.commit();

    // Promover al primero de la lista de espera (fuera de la transacción,
    // ya con el cupo liberado confirmado)
    await promoverListaEspera(reserva.turno_id);

    return res.status(200).json({ message: 'Reserva cancelada correctamente.' });
  } catch (error) {
    await transaccion.rollback();
    console.error('[ER_MiReserva_CTS]', error);
    return res.status(500).json({ message: 'Error al cancelar tu reserva.' });
  }
};
