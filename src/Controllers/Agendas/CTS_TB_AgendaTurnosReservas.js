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
import { validarTurnoParaMembresia } from '../../Services/Agenda/agendaRestricciones.service.js';

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


const ROLES_RESERVA_PENDIENTE = new Set(['SUPER_ADMIN', 'COORD_SEDE']);
const ROLES_RESERVA_PRUEBA = new Set(['SUPER_ADMIN', 'COORD_SEDE', 'PROFESOR']);
const ESTADOS_ALUMNO_RESERVABLES = new Set([
  'activo',
  'pendiente_pago',
  'inactivo',
  'prueba_clase_inicial'
]);

const usuarioPuedeReservaPendiente = (req) =>
  ROLES_RESERVA_PENDIENTE.has(String(req.user?.rol_codigo || '').trim().toUpperCase());

const usuarioPuedeReservaPrueba = (req) =>
  ROLES_RESERVA_PRUEBA.has(String(req.user?.rol_codigo || '').trim().toUpperCase());

const esAlumnoPruebaInicial = (alumno) =>
  String(alumno?.estado || '').toLowerCase() === 'prueba_clase_inicial';

const buscarMembresiaElegibleReserva = async ({ alumnoId, turno, transaction = null, lock = false }) => {
  const opciones = {
    where: {
      alumno_id: alumnoId,
      plan_id: { [Op.ne]: null },
      estado: 'activa',
      fecha_inicio: { [Op.lte]: turno.fecha },
      fecha_vencimiento: { [Op.gte]: turno.fecha },
      clases_disponibles: { [Op.gt]: 0 }
    },
    order: [['fecha_inicio', 'ASC'], ['id', 'ASC']],
    transaction
  };
  if (lock && transaction) opciones.lock = transaction.LOCK.UPDATE;

  const candidatas = await AlumnosMembresiasModel.findAll(opciones);
  for (const membresia of candidatas) {
    const validacion = await validarTurnoParaMembresia({ membresia, turno, transaction });
    if (validacion.permitido) return { membresia, validacion };
  }

  if (candidatas.length) {
    return {
      membresia: null,
      membresiaBloqueada: candidatas[0],
      validacion: {
        permitido: false,
        motivo: 'El día u horario de esta clase no está incluido en la modalidad contratada.'
      }
    };
  }

  return { membresia: null, membresiaBloqueada: null, validacion: null };
};

const existePruebaConsumidaOActiva = async ({ alumnoId, transaction = null, excluirReservaId = null }) => {
  const where = {
    alumno_id: alumnoId,
    tipo_reserva: 'prueba_inicial',
    [Op.or]: [
      { estado: { [Op.in]: ESTADOS_RESERVA_QUE_OCUPAN_CUPO } },
      { estado: 'cancelada', cancelacion_tardia: 1 }
    ]
  };
  if (excluirReservaId) where.id = { [Op.ne]: excluirReservaId };

  return Boolean(await AgendaTurnosReservasModel.findOne({
    where,
    attributes: ['id'],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  }));
};

const estadoCreditoAlCancelar = ({ reserva, devolverCredito }) => {
  if (reserva.tipo_reserva === 'prueba_inicial') return 'no_aplica';
  if (reserva.estado_credito === 'pendiente') return devolverCredito ? 'devuelto' : 'pendiente';
  if (reserva.estado_credito === 'consumido') return devolverCredito ? 'devuelto' : 'consumido';
  return reserva.estado_credito;
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


const anexarObservacionSistema = (observaciones, texto) => {
  const base = String(observaciones || '').trim();
  return base ? `${base}\n${texto}` : texto;
};

const buscarReservaCanceladaTardiaReactivable = async ({
  turnoId,
  alumnoId,
  transaction
}) => AgendaTurnosReservasModel.findOne({
  where: {
    turno_id: turnoId,
    alumno_id: alumnoId,
    estado: 'cancelada',
    cancelacion_tardia: 1,
    tipo_reserva: { [Op.in]: ['normal', 'pendiente_credito'] },
    estado_credito: { [Op.in]: ['consumido', 'pendiente'] }
  },
  order: [['fecha_cancelacion', 'DESC'], ['id', 'DESC']],
  transaction,
  lock: transaction ? transaction.LOCK.UPDATE : undefined
});

const reactivarReservaCanceladaTardia = async ({
  reserva,
  turno,
  usuarioId,
  origenReserva,
  transaction
}) => {
  const canceladaEn = reserva.fecha_cancelacion
    ? dayjs(reserva.fecha_cancelacion).format('YYYY-MM-DD HH:mm:ss')
    : 'sin_fecha';
  const canceladaPor = reserva.cancelado_por_usuario_id || 'sin_usuario';
  const reactivadaEn = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const marcaAuditoria = `[REACTIVADA_CANCELACION_TARDIA:cancelada_en=${canceladaEn};cancelada_por=${canceladaPor};reactivada_en=${reactivadaEn};reactivada_por=${usuarioId || origenReserva}]`;

  await reserva.update({
    estado: 'reservada',
    fecha_cancelacion: null,
    motivo_cancelacion: null,
    cancelacion_tardia: 0,
    cancelado_por_usuario_id: null,
    observaciones: anexarObservacionSistema(reserva.observaciones, marcaAuditoria),
    updated_at: new Date()
  }, { transaction });

  const [actualizadas] = await AlumnosAsistenciasModel.update({
    estado: 'asistio',
    membresia_id: reserva.membresia_id || null,
    registrado_por_id: usuarioId,
    updated_at: new Date()
  }, {
    where: { reserva_id: reserva.id },
    transaction
  });

  if (!actualizadas) {
    await crearAsistenciaInicialReserva({
      reserva,
      turno,
      transaction,
      registradoPorId: usuarioId
    });
  }

  await sincronizarCuposTurno({
    turnoId: turno.id,
    transaction,
    turnoBloqueado: turno
  });

  return reserva;
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
      const resultado = await buscarMembresiaElegibleReserva({
        alumnoId: candidato.alumno_id,
        turno,
        transaction: transaccion,
        lock: true
      });

      if (resultado.membresia) {
        primero = candidato;
        membresia = resultado.membresia;
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
      tipo_reserva:   'normal',
      estado_credito: 'consumido',
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
    if (!turno) return res.status(404).json({ message: 'Turno no encontrado.' });

    const where = {
      sede_id: turno.sede_id,
      estado: { [Op.in]: [...ESTADOS_ALUMNO_RESERVABLES] }
    };
    if (q) {
      const termino = `%${q}%`;
      where[Op.or] = [
        { nombre: { [Op.like]: termino } },
        { apellido: { [Op.like]: termino } },
        { dni: { [Op.like]: termino } }
      ];
    }

    const reservasActivas = await AgendaTurnosReservasModel.findAll({
      where: { turno_id, estado: { [Op.in]: ESTADOS_RESERVA_QUE_OCUPAN_CUPO } },
      attributes: ['alumno_id'],
      raw: true
    });
    const alumnosYaInscriptos = reservasActivas.map((item) => Number(item.alumno_id));
    if (alumnosYaInscriptos.length) where.id = { [Op.notIn]: alumnosYaInscriptos };

    const alumnos = await AlumnosModel.findAll({
      where,
      attributes: ['id', 'nombre', 'apellido', 'dni', 'estado'],
      order: [['nombre', 'ASC'], ['apellido', 'ASC']],
      limit: 30
    });

    const turnoVencido = dayjs(`${turno.fecha} ${turno.hora_fin}`).isBefore(dayjs());
    const puedePendiente = usuarioPuedeReservaPendiente(req);
    const puedePrueba = usuarioPuedeReservaPrueba(req);

    const data = await Promise.all(alumnos.map(async (alumno) => {
      const base = {
        id: alumno.id,
        nombre: alumno.nombre,
        apellido: alumno.apellido,
        dni: alumno.dni,
        estado_alumno: alumno.estado,
        creditos: 0,
        creditos_habilitados: 0,
        membresia_id: null,
        plan_id: null,
        estado_membresia: null,
        fecha_vencimiento: null,
        tipo_reserva_sugerido: 'normal',
        permite_reserva_pendiente: false,
        inscribible: false,
        motivo_no_inscribible: null
      };

      if (turnoVencido) {
        return { ...base, motivo_no_inscribible: 'La clase ya finalizó' };
      }

      if (esAlumnoPruebaInicial(alumno)) {
        const pruebaUsada = await existePruebaConsumidaOActiva({ alumnoId: alumno.id });
        return {
          ...base,
          tipo_reserva_sugerido: 'prueba_inicial',
          inscribible: puedePrueba && !pruebaUsada,
          motivo_no_inscribible: !puedePrueba
            ? 'Tu rol no puede registrar clases de prueba'
            : pruebaUsada
              ? 'La clase de prueba ya fue reservada o utilizada'
              : null
        };
      }

      const { membresia, membresiaBloqueada, validacion } = await buscarMembresiaElegibleReserva({
        alumnoId: alumno.id,
        turno
      });

      if (membresia) {
        return {
          ...base,
          creditos: Number(membresia.clases_disponibles || 0),
          creditos_habilitados: Number(membresia.clases_disponibles || 0),
          membresia_id: membresia.id,
          plan_id: membresia.plan_id,
          estado_membresia: membresia.estado,
          fecha_vencimiento: membresia.fecha_vencimiento,
          inscribible: true
        };
      }

      if (validacion && validacion.permitido === false && membresiaBloqueada) {
        return {
          ...base,
          creditos: Number(membresiaBloqueada.clases_disponibles || 0),
          creditos_habilitados: 0,
          membresia_id: membresiaBloqueada.id,
          plan_id: membresiaBloqueada.plan_id,
          estado_membresia: membresiaBloqueada.estado,
          fecha_vencimiento: membresiaBloqueada.fecha_vencimiento,
          tipo_reserva_sugerido: 'normal',
          permite_reserva_pendiente: false,
          inscribible: false,
          motivo_no_inscribible: validacion.motivo
        };
      }

      const diagnostico = await buscarMembresiaParaDiagnostico({
        alumnoId: alumno.id,
        fechaReferencia: turno.fecha
      });
      let motivo = validacion?.motivo || 'Sin membresía activa o sin créditos';
      if (!validacion && diagnostico) {
        if (!diagnostico.plan_id) motivo = 'Membresía sin plan asociado';
        else if (diagnostico.estado === 'congelada') motivo = 'Membresía congelada';
        else if (diagnostico.estado === 'cancelada') motivo = 'Membresía cancelada';
        else if (diagnostico.estado === 'pendiente_pago') motivo = 'Pago pendiente';
        else if (dayjs(turno.fecha).isAfter(diagnostico.fecha_vencimiento, 'day')) motivo = 'Membresía vencida';
        else if (dayjs(diagnostico.fecha_inicio).isAfter(turno.fecha, 'day')) motivo = 'Membresía aún no vigente';
        else if (Number(diagnostico.clases_disponibles || 0) <= 0) motivo = 'Sin créditos';
      }

      return {
        ...base,
        creditos: Number(diagnostico?.clases_disponibles || 0),
        membresia_id: diagnostico?.id || null,
        plan_id: diagnostico?.plan_id || null,
        estado_membresia: diagnostico?.estado || null,
        fecha_vencimiento: diagnostico?.fecha_vencimiento || null,
        tipo_reserva_sugerido: puedePendiente ? 'pendiente_credito' : 'normal',
        permite_reserva_pendiente: puedePendiente,
        inscribible: puedePendiente,
        motivo_no_inscribible: motivo
      };
    }));

    return res.status(200).json({ status: 'success', data, total: data.length });
  } catch (error) {
    console.error('[OBRS_ClientesDisponiblesTurno_CTS]', error);
    return res.status(500).json({ message: 'Error al buscar clientes.' });
  }
};


/* Reserva administrativa normal, pendiente de crédito o de prueba inicial. */
export const CR_ReservaAdmin_CTS = async (req, res) => {
  const transaccion = await db.transaction();
  try {
    const {
      turno_id,
      alumno_id,
      observaciones,
      tipo_reserva,
      permitir_pendiente_credito = false
    } = req.body;

    if (!turno_id || !alumno_id) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'Faltan campos requeridos: turno_id, alumno_id.' });
    }

    const turno = await AgendaTurnosModel.findByPk(turno_id, {
      transaction: transaccion,
      lock: transaccion.LOCK.UPDATE
    });
    if (!turno) {
      await transaccion.rollback();
      return res.status(404).json({ message: 'Turno no encontrado.' });
    }
    if (['cancelado', 'bloqueado'].includes(turno.estado)) {
      await transaccion.rollback();
      return res.status(400).json({ message: `No se puede inscribir en un turno ${turno.estado}.` });
    }
    if (dayjs(`${turno.fecha} ${turno.hora_fin}`).isBefore(dayjs())) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'No se puede inscribir en una clase que ya finalizó.' });
    }

    const alumno = await AlumnosModel.findByPk(alumno_id, {
      transaction: transaccion,
      lock: transaccion.LOCK.UPDATE
    });
    if (!alumno) {
      await transaccion.rollback();
      return res.status(404).json({ message: 'Alumno no encontrado.' });
    }
    if (Number(alumno.sede_id) !== Number(turno.sede_id)) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'El alumno no pertenece a la sede de este turno.' });
    }
    if (!ESTADOS_ALUMNO_RESERVABLES.has(String(alumno.estado || '').toLowerCase())) {
      await transaccion.rollback();
      return res.status(403).json({
        message: 'El estado actual del alumno no permite reservar clases.'
      });
    }

    const reservaExistente = await AgendaTurnosReservasModel.findOne({
      where: { turno_id, alumno_id, estado: { [Op.in]: ESTADOS_RESERVA_QUE_OCUPAN_CUPO } },
      transaction: transaccion,
      lock: transaccion.LOCK.UPDATE
    });
    if (reservaExistente) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'El alumno ya tiene una reserva activa en este turno.' });
    }

    const reservaTardiaReactivable = await buscarReservaCanceladaTardiaReactivable({
      turnoId: turno_id,
      alumnoId: alumno_id,
      transaction: transaccion
    });

    const cuposActuales = await sincronizarCuposTurno({
      turnoId: turno.id,
      transaction: transaccion,
      turnoBloqueado: turno
    });
    if (cuposActuales >= Number(turno.cupo_maximo || 0)) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'El turno no tiene cupos disponibles.' });
    }

    if (reservaTardiaReactivable) {
      if (
        reservaTardiaReactivable.estado_credito === 'pendiente' &&
        !usuarioPuedeReservaPendiente(req)
      ) {
        await transaccion.rollback();
        return res.status(403).json({
          message: 'Solo coordinación o super administración pueden reactivar una clase que sigue pendiente de cobro.'
        });
      }

      const usuarioId = req.user?.id ?? req.user?.usuario_id ?? null;
      const origenReserva = String(req.user?.rol_codigo || '').trim().toUpperCase() === 'PROFESOR'
        ? 'profesor'
        : 'administracion';

      const reserva = await reactivarReservaCanceladaTardia({
        reserva: reservaTardiaReactivable,
        turno,
        usuarioId,
        origenReserva,
        transaction: transaccion
      });

      await transaccion.commit();
      return res.status(200).json({
        message: reserva.estado_credito === 'pendiente'
          ? 'Reserva reactivada. La clase continúa pendiente de cobro y se imputará una sola vez.'
          : 'Reserva reactivada sin descontar un segundo crédito.',
        reactivada: true,
        reserva
      });
    }

    const solicitadoPrueba = tipo_reserva === 'prueba_inicial' || esAlumnoPruebaInicial(alumno);
    let membresia = null;
    let tipoFinal = 'normal';
    let estadoCredito = 'consumido';

    if (solicitadoPrueba) {
      if (!esAlumnoPruebaInicial(alumno)) {
        await transaccion.rollback();
        return res.status(400).json({ message: 'Solo los alumnos con estado Prueba clase inicial pueden usar una reserva de prueba.' });
      }
      if (!usuarioPuedeReservaPrueba(req)) {
        await transaccion.rollback();
        return res.status(403).json({ message: 'Tu rol no puede registrar clases de prueba.' });
      }
      if (await existePruebaConsumidaOActiva({ alumnoId: alumno.id, transaction: transaccion })) {
        await transaccion.rollback();
        return res.status(409).json({ message: 'El alumno ya reservó o utilizó su clase de prueba inicial.' });
      }
      tipoFinal = 'prueba_inicial';
      estadoCredito = 'no_aplica';
    } else {
      const resultado = await buscarMembresiaElegibleReserva({
        alumnoId: alumno.id,
        turno,
        transaction: transaccion,
        lock: true
      });
      membresia = resultado.membresia;

      if (!membresia && resultado.validacion && !resultado.validacion.permitido) {
        await transaccion.rollback();
        return res.status(403).json({ message: resultado.validacion.motivo });
      }

      if (!membresia) {
        if (!usuarioPuedeReservaPendiente(req)) {
          await transaccion.rollback();
          return res.status(403).json({ message: 'El alumno no tiene una membresía activa con créditos. Solo coordinación o super administración pueden reservar dejando el crédito pendiente.' });
        }
        if (permitir_pendiente_credito !== true && permitir_pendiente_credito !== 1) {
          await transaccion.rollback();
          return res.status(409).json({
            code: 'RESERVA_PENDIENTE_REQUIERE_CONFIRMACION',
            message: 'El alumno no tiene crédito disponible. Confirmá que querés reservar la clase y dejarla pendiente de cobro.'
          });
        }
        tipoFinal = 'pendiente_credito';
        estadoCredito = 'pendiente';
      } else {
        await membresia.update({
          clases_usadas: Number(membresia.clases_usadas || 0) + 1,
          clases_disponibles: Number(membresia.clases_disponibles || 0) - 1,
          updated_at: new Date()
        }, { transaction: transaccion });
        await normalizarCicloMembresiasAlumno({ alumnoId: alumno.id, transaction: transaccion });
      }
    }

    const usuarioId = req.user?.id ?? req.user?.usuario_id ?? null;
    const reserva = await AgendaTurnosReservasModel.create({
      turno_id,
      alumno_id,
      membresia_id: membresia?.id || null,
      tipo_reserva: tipoFinal,
      estado_credito: estadoCredito,
      origen_reserva: String(req.user?.rol_codigo || '').trim().toUpperCase() === 'PROFESOR' ? 'profesor' : 'administracion',
      estado: 'reservada',
      fecha_reserva: new Date(),
      creado_por_usuario_id: usuarioId,
      observaciones: observaciones || null
    }, { transaction: transaccion });

    await crearAsistenciaInicialReserva({
      reserva,
      turno,
      transaction: transaccion,
      registradoPorId: usuarioId
    });
    await sincronizarCuposTurno({
      turnoId: turno.id,
      transaction: transaccion,
      turnoBloqueado: turno
    });

    await transaccion.commit();

    const mensajes = {
      normal: 'Alumno inscripto correctamente y crédito descontado.',
      pendiente_credito: 'Alumno inscripto. La clase quedó pendiente de cobro y se imputará al renovar.',
      prueba_inicial: 'Clase de prueba reservada correctamente.'
    };
    return res.status(201).json({ message: mensajes[tipoFinal], reserva });
  } catch (error) {
    await transaccion.rollback();
    if (error?.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        message: 'El alumno ya reservó o utilizó su clase de prueba inicial.'
      });
    }
    console.error('[CR_ReservaAdmin_CTS]', error);
    return res.status(500).json({ message: 'Error al inscribir al alumno.' });
  }
};


/* Actualiza la asistencia de una reserva activa. */
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
    const { motivo_cancelacion, devolver_credito_vencido } = req.body || {};

    const reserva = await AgendaTurnosReservasModel.findByPk(id, {
      transaction: transaccion,
      lock: transaccion.LOCK.UPDATE
    });
    if (!reserva) {
      await transaccion.rollback();
      return res.status(404).json({ message: 'Reserva no encontrada.' });
    }
    if (!ESTADOS_RESERVA_QUE_OCUPAN_CUPO.includes(reserva.estado)) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'Solo se pueden cancelar reservas activas.' });
    }

    const turno = await AgendaTurnosModel.findByPk(reserva.turno_id, {
      transaction: transaccion,
      lock: transaccion.LOCK.UPDATE
    });
    if (!turno) {
      await transaccion.rollback();
      return res.status(404).json({ message: 'Turno no encontrado.' });
    }
    if (dayjs(`${turno.fecha} ${turno.hora_fin}`).isBefore(dayjs())) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'No se puede dar de baja una reserva de una clase que ya finalizó.' });
    }

    const minutosLimite = await obtenerMinutosCancelacion();
    const inicioTurno = dayjs(`${turno.fecha} ${turno.hora_inicio}`);
    const minutosRestantes = inicioTurno.diff(dayjs(), 'minute');
    const cancelacionTardia = minutosRestantes < minutosLimite;
    const devolverCredito = !cancelacionTardia || [true, 1, '1', 'true'].includes(devolver_credito_vencido);
    let creditoDevuelto = reserva.estado_credito === 'pendiente' && devolverCredito;

    if (reserva.membresia_id && reserva.estado_credito === 'consumido' && devolverCredito) {
      const membresia = await AlumnosMembresiasModel.findByPk(reserva.membresia_id, {
        transaction: transaccion,
        lock: transaccion.LOCK.UPDATE
      });
      if (membresia) {
        await membresia.update({
          clases_usadas: Math.max(0, Number(membresia.clases_usadas || 0) - 1),
          clases_disponibles: Number(membresia.clases_disponibles || 0) + 1,
          updated_at: new Date()
        }, { transaction: transaccion });
        creditoDevuelto = true;
      }
    }

    const usuarioId = req.user?.id ?? req.user?.usuario_id ?? null;
    await reserva.update({
      estado: 'cancelada',
      fecha_cancelacion: new Date(),
      motivo_cancelacion: motivo_cancelacion || null,
      cancelacion_tardia: cancelacionTardia ? 1 : 0,
      cancelado_por_usuario_id: usuarioId,
      estado_credito: estadoCreditoAlCancelar({ reserva, devolverCredito }),
      observaciones: construirObservacionesCreditoDevuelto(reserva.observaciones, creditoDevuelto),
      updated_at: new Date()
    }, { transaction: transaccion });

    await marcarAsistenciaComoCancelada(reserva.id, transaccion, usuarioId);
    await sincronizarCuposTurno({
      turnoId: turno.id,
      transaction: transaccion,
      turnoBloqueado: turno
    });
    await transaccion.commit();
    await promoverListaEspera(reserva.turno_id);

    return res.status(200).json({
      message: cancelacionTardia && !devolverCredito
        ? 'Reserva cancelada fuera de término. La clase permanece cobrada o pendiente de cobro.'
        : 'Reserva cancelada correctamente.',
      credito_devuelto: creditoDevuelto,
      cancelacion_tardia: cancelacionTardia,
      estado_credito: estadoCreditoAlCancelar({ reserva, devolverCredito })
    });
  } catch (error) {
    await transaccion.rollback();
    console.error('[ER_ReservaAdmin_CTS]', error);
    return res.status(500).json({ message: 'Error al cancelar la reserva.' });
  }
};


// ─── ALUMNO ───────────────────────────────────────────────────────────────────

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
    const sede_id = req.alumno.sede_id;
    const { turno_id } = req.body;

    if (!sede_id) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'No tenés una sede asignada. Consultá con administración.' });
    }
    if (!turno_id) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'Falta el campo requerido: turno_id.' });
    }

    const [turno, alumno] = await Promise.all([
      AgendaTurnosModel.findByPk(turno_id, { transaction: transaccion, lock: transaccion.LOCK.UPDATE }),
      AlumnosModel.findByPk(alumno_id, { transaction: transaccion, lock: transaccion.LOCK.UPDATE })
    ]);
    if (!turno) {
      await transaccion.rollback();
      return res.status(404).json({ message: 'Turno no encontrado.' });
    }
    if (!alumno) {
      await transaccion.rollback();
      return res.status(404).json({ message: 'Alumno no encontrado.' });
    }
    if (Number(turno.sede_id) !== Number(sede_id)) {
      await transaccion.rollback();
      return res.status(403).json({ message: 'No podés inscribirte en una clase de otra sede.' });
    }
    if (['cancelado', 'bloqueado'].includes(turno.estado)) {
      await transaccion.rollback();
      return res.status(400).json({ message: `No podés inscribirte en un turno ${turno.estado}.` });
    }
    if (dayjs(`${turno.fecha} ${turno.hora_inicio}`).isBefore(dayjs())) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'No podés inscribirte en un turno que ya comenzó.' });
    }

    const reservaExistente = await AgendaTurnosReservasModel.findOne({
      where: { turno_id, alumno_id, estado: { [Op.in]: ESTADOS_RESERVA_QUE_OCUPAN_CUPO } },
      transaction: transaccion,
      lock: transaccion.LOCK.UPDATE
    });
    if (reservaExistente) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'Ya estás inscripto en este turno.' });
    }

    const reservaTardiaReactivable = await buscarReservaCanceladaTardiaReactivable({
      turnoId: turno_id,
      alumnoId: alumno_id,
      transaction: transaccion
    });

    const cuposActuales = await sincronizarCuposTurno({
      turnoId: turno.id,
      transaction: transaccion,
      turnoBloqueado: turno
    });

    if (reservaTardiaReactivable?.estado_credito === 'consumido') {
      if (cuposActuales >= Number(turno.cupo_maximo || 0)) {
        await transaccion.rollback();
        return res.status(409).json({ message: 'La clase está completa y no puede reactivarse la reserva.' });
      }

      const reserva = await reactivarReservaCanceladaTardia({
        reserva: reservaTardiaReactivable,
        turno,
        usuarioId: null,
        origenReserva: 'alumno',
        transaction: transaccion
      });

      await transaccion.commit();
      return res.status(200).json({
        message: 'Reserva reactivada sin descontar un segundo crédito.',
        reactivada: true,
        reserva
      });
    }

    if (esAlumnoPruebaInicial(alumno)) {
      if (await existePruebaConsumidaOActiva({ alumnoId: alumno.id, transaction: transaccion })) {
        await transaccion.rollback();
        return res.status(409).json({ message: 'Ya reservaste o utilizaste tu clase de prueba inicial.' });
      }
      if (cuposActuales >= Number(turno.cupo_maximo || 0)) {
        await transaccion.rollback();
        return res.status(409).json({ message: 'La clase está completa. Elegí otro horario para tu clase de prueba.' });
      }

      const reserva = await AgendaTurnosReservasModel.create({
        turno_id,
        alumno_id,
        membresia_id: null,
        tipo_reserva: 'prueba_inicial',
        estado_credito: 'no_aplica',
        origen_reserva: 'alumno',
        estado: 'reservada',
        fecha_reserva: new Date()
      }, { transaction: transaccion });

      await crearAsistenciaInicialReserva({ reserva, turno, transaction: transaccion });
      await sincronizarCuposTurno({ turnoId: turno.id, transaction: transaccion, turnoBloqueado: turno });
      await transaccion.commit();
      return res.status(201).json({ message: 'Clase de prueba reservada correctamente.', reserva });
    }

    const { membresia, validacion } = await buscarMembresiaElegibleReserva({
      alumnoId: alumno_id,
      turno,
      transaction: transaccion,
      lock: true
    });

    if (!membresia) {
      const diagnostico = await buscarMembresiaParaDiagnostico({
        alumnoId: alumno_id,
        fechaReferencia: turno.fecha,
        transaction: transaccion
      });
      await transaccion.rollback();

      if (validacion && !validacion.permitido) {
        return res.status(403).json({ message: validacion.motivo });
      }
      if (!diagnostico) return res.status(403).json({ message: 'No tenés una membresía activa para inscribirte en esta clase.' });
      if (!diagnostico.plan_id) return res.status(403).json({ message: 'Tu membresía no tiene un plan asociado. Consultá con administración.' });
      if (dayjs(turno.fecha).isAfter(diagnostico.fecha_vencimiento, 'day')) return res.status(403).json({ message: 'Tu membresía ya se encuentra vencida.' });
      if (dayjs(diagnostico.fecha_inicio).isAfter(turno.fecha, 'day')) return res.status(403).json({ message: 'Tu membresía todavía no está vigente.' });
      if (diagnostico.estado === 'congelada') return res.status(403).json({ message: 'Tu membresía está congelada.' });
      if (diagnostico.estado === 'pendiente_pago') return res.status(403).json({ message: 'Tu membresía tiene el pago pendiente.' });
      if (Number(diagnostico.clases_disponibles || 0) <= 0) return res.status(403).json({ message: 'No tenés créditos disponibles para inscribirte en esta clase.' });
      return res.status(403).json({ message: 'No tenés una membresía habilitada para esta clase.' });
    }

    if (cuposActuales >= Number(turno.cupo_maximo || 0)) {
      const yaEnEspera = await AgendaTurnosListaEsperaModel.findOne({
        where: { turno_id, alumno_id, estado: 'esperando' },
        transaction: transaccion
      });
      if (yaEnEspera) {
        await transaccion.rollback();
        return res.status(200).json({
          message: `Ya estás en la lista de espera de este turno (posición ${yaEnEspera.posicion}).`,
          en_espera: true,
          posicion: yaEnEspera.posicion
        });
      }

      const posicionActual = await AgendaTurnosListaEsperaModel.count({
        where: { turno_id, estado: 'esperando' },
        transaction: transaccion
      });
      const enEspera = await AgendaTurnosListaEsperaModel.create({
        turno_id,
        alumno_id,
        posicion: posicionActual + 1,
        estado: 'esperando',
        fecha_alta: new Date()
      }, { transaction: transaccion });
      await transaccion.commit();
      return res.status(200).json({
        message: `El turno está completo. Quedaste en la posición ${enEspera.posicion} de la lista de espera.`,
        en_espera: true,
        posicion: enEspera.posicion
      });
    }

    await membresia.update({
      clases_usadas: Number(membresia.clases_usadas || 0) + 1,
      clases_disponibles: Number(membresia.clases_disponibles || 0) - 1,
      updated_at: new Date()
    }, { transaction: transaccion });
    await normalizarCicloMembresiasAlumno({ alumnoId: alumno_id, transaction: transaccion });

    const reserva = await AgendaTurnosReservasModel.create({
      turno_id,
      alumno_id,
      membresia_id: membresia.id,
      tipo_reserva: 'normal',
      estado_credito: 'consumido',
      origen_reserva: 'alumno',
      estado: 'reservada',
      fecha_reserva: new Date()
    }, { transaction: transaccion });

    await crearAsistenciaInicialReserva({ reserva, turno, transaction: transaccion });
    await sincronizarCuposTurno({ turnoId: turno.id, transaction: transaccion, turnoBloqueado: turno });
    await transaccion.commit();
    return res.status(201).json({ message: 'Inscripción realizada correctamente.', reserva });
  } catch (error) {
    await transaccion.rollback();
    if (error?.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        message: 'Ya reservaste o utilizaste tu clase de prueba inicial.'
      });
    }
    console.error('[CR_MiReserva_CTS]', error);
    return res.status(500).json({ message: 'No fue posible completar la inscripción. Intentá de nuevo.' });
  }
};


/* Cancela una reserva del portal alumno, con confirmación tardía. */
export const ER_MiReserva_CTS = async (req, res) => {
  const transaccion = await db.transaction();
  try {
    const alumno_id = req.alumno.id;
    const { id } = req.params;
    const confirmarTardia = [true, 1, '1', 'true'].includes(req.body?.confirmar_cancelacion_tardia);

    const reserva = await AgendaTurnosReservasModel.findByPk(id, {
      transaction: transaccion,
      lock: transaccion.LOCK.UPDATE
    });
    if (!reserva || Number(reserva.alumno_id) !== Number(alumno_id)) {
      await transaccion.rollback();
      return res.status(404).json({ message: 'Reserva no encontrada.' });
    }
    if (!ESTADOS_RESERVA_QUE_OCUPAN_CUPO.includes(reserva.estado)) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'Solo podés cancelar reservas activas.' });
    }

    const turno = await AgendaTurnosModel.findByPk(reserva.turno_id, {
      transaction: transaccion,
      lock: transaccion.LOCK.UPDATE
    });
    if (!turno) {
      await transaccion.rollback();
      return res.status(404).json({ message: 'Turno no encontrado.' });
    }

    const ahora = dayjs();
    const inicioTurno = dayjs(`${turno.fecha} ${turno.hora_inicio}`);
    const finTurno = dayjs(`${turno.fecha} ${turno.hora_fin}`);
    if (finTurno.isBefore(ahora)) {
      await transaccion.rollback();
      return res.status(400).json({ message: 'La clase ya finalizó y no puede cancelarse desde el portal.' });
    }

    const minutosLimite = await obtenerMinutosCancelacion();
    const minutosRestantes = inicioTurno.diff(ahora, 'minute');
    const cancelacionTardia = minutosRestantes < minutosLimite;

    if (cancelacionTardia && !confirmarTardia) {
      await transaccion.rollback();
      return res.status(409).json({
        code: 'CANCELACION_TARDIA_REQUIERE_CONFIRMACION',
        message: `Faltan menos de ${minutosLimite} minutos para la clase. Si cancelás ahora, la clase se cobrará igualmente.`,
        minutos_restantes: minutosRestantes,
        credito_se_devuelve: false
      });
    }

    const devolverCredito = !cancelacionTardia;
    let creditoDevuelto = reserva.estado_credito === 'pendiente' && devolverCredito;

    if (reserva.membresia_id && reserva.estado_credito === 'consumido' && devolverCredito) {
      const membresia = await AlumnosMembresiasModel.findByPk(reserva.membresia_id, {
        transaction: transaccion,
        lock: transaccion.LOCK.UPDATE
      });
      if (membresia) {
        await membresia.update({
          clases_usadas: Math.max(0, Number(membresia.clases_usadas || 0) - 1),
          clases_disponibles: Number(membresia.clases_disponibles || 0) + 1,
          updated_at: new Date()
        }, { transaction: transaccion });
        creditoDevuelto = true;
      }
    }

    await reserva.update({
      estado: 'cancelada',
      fecha_cancelacion: new Date(),
      cancelacion_tardia: cancelacionTardia ? 1 : 0,
      estado_credito: estadoCreditoAlCancelar({ reserva, devolverCredito }),
      observaciones: construirObservacionesCreditoDevuelto(reserva.observaciones, creditoDevuelto),
      updated_at: new Date()
    }, { transaction: transaccion });

    await marcarAsistenciaComoCancelada(reserva.id, transaccion);
    await sincronizarCuposTurno({
      turnoId: turno.id,
      transaction: transaccion,
      turnoBloqueado: turno
    });
    await transaccion.commit();
    await promoverListaEspera(reserva.turno_id);

    return res.status(200).json({
      message: cancelacionTardia
        ? 'Reserva cancelada. La clase se cobrará igualmente por cancelación fuera de término.'
        : 'Reserva cancelada correctamente y crédito restituido cuando correspondía.',
      cancelacion_tardia: cancelacionTardia,
      credito_devuelto: creditoDevuelto,
      estado_credito: estadoCreditoAlCancelar({ reserva, devolverCredito })
    });
  } catch (error) {
    await transaccion.rollback();
    console.error('[ER_MiReserva_CTS]', error);
    return res.status(500).json({ message: 'Error al cancelar tu reserva.' });
  }
};
