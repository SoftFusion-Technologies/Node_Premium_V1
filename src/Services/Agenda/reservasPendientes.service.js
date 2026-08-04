import { Op } from 'sequelize';
import AgendaTurnosReservasModel from '../../Models/Agenda/MD_TB_AgendaTurnosReservas.js';
import AgendaTurnosModel from '../../Models/Agenda/MD_TB_AgendaTurnos.js';
import AlumnosAsistenciasModel from '../../Models/Alumno/MD_TB_AlumnosAsistencias.js';
import AlumnosMembresiasModel from '../../Models/Alumno/MD_TB_AlumnosMembresias.js';
import { validarTurnoParaMembresia } from './agendaRestricciones.service.js';

export const RESERVAS_PENDIENTES_SERVICE_VERSION = '20260804-v2-cobro-unico-turno';

const ESTADOS_RESERVA_ACTIVA = new Set(['reservada', 'asistio', 'ausente']);

const anexarObservacionSistema = (observaciones, texto) => {
  const base = String(observaciones || '').trim();
  return base ? `${base}\n${texto}` : texto;
};

const agruparReservasPorTurno = (reservas) => {
  const grupos = new Map();

  for (const reserva of reservas) {
    const clave = `${reserva.alumno_id}:${reserva.turno_id}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(reserva);
  }

  return [...grupos.values()];
};

const elegirReservaCanonica = (reservas) =>
  reservas.find((reserva) => ESTADOS_RESERVA_ACTIVA.has(String(reserva.estado))) || reservas[0];

const resolverPendientesDuplicadas = async ({
  reservas,
  reservaCanonica,
  transaction
}) => {
  const duplicadas = reservas.filter(
    (reserva) => Number(reserva.id) !== Number(reservaCanonica.id)
  );

  for (const duplicada of duplicadas) {
    await duplicada.update({
      membresia_id: null,
      estado_credito: 'devuelto',
      fecha_imputacion: null,
      observaciones: anexarObservacionSistema(
        duplicada.observaciones,
        `[PENDIENTE_DUPLICADO_RESUELTO:reserva_canonica=${reservaCanonica.id}]`
      ),
      updated_at: new Date()
    }, { transaction });

    await AlumnosAsistenciasModel.update(
      { membresia_id: null, updated_at: new Date() },
      { where: { reserva_id: duplicada.id }, transaction }
    );
  }
};

export const imputarReservasPendientesMembresia = async ({ membresia, transaction }) => {
  if (!membresia || String(membresia.estado) !== 'activa') {
    return { imputadas: 0, reservas_ids: [] };
  }

  const membresiaOperativa = transaction
    ? await AlumnosMembresiasModel.findByPk(membresia.id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    })
    : membresia;

  if (!membresiaOperativa || String(membresiaOperativa.estado) !== 'activa') {
    return { imputadas: 0, reservas_ids: [] };
  }

  let disponibles = Number(membresiaOperativa.clases_disponibles || 0);
  if (disponibles <= 0) return { imputadas: 0, reservas_ids: [] };

  const reservas = await AgendaTurnosReservasModel.findAll({
    where: {
      alumno_id: membresiaOperativa.alumno_id,
      tipo_reserva: 'pendiente_credito',
      estado_credito: 'pendiente',
      [Op.or]: [
        { estado: { [Op.in]: ['reservada', 'asistio', 'ausente'] } },
        { estado: 'cancelada', cancelacion_tardia: 1 }
      ]
    },
    include: [{
      model: AgendaTurnosModel,
      as: 'turno',
      required: true,
      where: {
        fecha: {
          [Op.between]: [
            membresiaOperativa.fecha_inicio,
            membresiaOperativa.fecha_vencimiento
          ]
        }
      }
    }],
    order: [
      [{ model: AgendaTurnosModel, as: 'turno' }, 'fecha', 'ASC'],
      [{ model: AgendaTurnosModel, as: 'turno' }, 'hora_inicio', 'ASC'],
      ['id', 'ASC']
    ],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });

  const imputadas = [];
  const gruposPorTurno = agruparReservasPorTurno(reservas);

  for (const grupo of gruposPorTurno) {
    if (disponibles <= 0) break;

    // Una ocurrencia de clase se cobra una sola vez por alumno, aunque exista
    // una cancelación tardía seguida de una reinscripción al mismo turno.
    const reserva = elegirReservaCanonica(grupo);

    const validacion = await validarTurnoParaMembresia({
      membresia: membresiaOperativa,
      turno: reserva.turno,
      transaction
    });
    if (!validacion.permitido) continue;

    await reserva.update({
      membresia_id: membresiaOperativa.id,
      estado_credito: 'consumido',
      fecha_imputacion: new Date(),
      updated_at: new Date()
    }, { transaction });

    await AlumnosAsistenciasModel.update(
      { membresia_id: membresiaOperativa.id, updated_at: new Date() },
      { where: { reserva_id: reserva.id }, transaction }
    );

    await resolverPendientesDuplicadas({
      reservas: grupo,
      reservaCanonica: reserva,
      transaction
    });

    disponibles -= 1;
    imputadas.push(Number(reserva.id));
  }

  if (imputadas.length) {
    await membresiaOperativa.update({
      clases_usadas: Number(membresiaOperativa.clases_usadas || 0) + imputadas.length,
      clases_disponibles: disponibles,
      updated_at: new Date()
    }, { transaction });
  }

  return { imputadas: imputadas.length, reservas_ids: imputadas };
};
