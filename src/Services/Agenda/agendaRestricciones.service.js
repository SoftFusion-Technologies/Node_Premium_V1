import dayjs from 'dayjs';
import PlanesModel from '../../Models/Plan/MD_TB_Planes.js';

const DIAS_VALIDOS = new Set([0, 1, 2, 3, 4, 5, 6]);
const HORA_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const parseJson = (valor) => {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'object') return valor;
  try {
    return JSON.parse(valor);
  } catch {
    return null;
  }
};

const normalizarHora = (valor) => {
  const hora = String(valor || '').slice(0, 5);
  return HORA_REGEX.test(hora) ? hora : null;
};

export const normalizarRestriccionesAgenda = (valor) => {
  const base = parseJson(valor);
  if (!base || base.habilitada === false) return null;

  const modalidadesEntrada = Array.isArray(base.modalidades)
    ? base.modalidades
    : Array.isArray(base)
      ? base
      : [];

  const modalidades = modalidadesEntrada
    .map((modalidad, index) => {
      const dias = [...new Set(
        (Array.isArray(modalidad?.dias) ? modalidad.dias : [])
          .map(Number)
          .filter((dia) => DIAS_VALIDOS.has(dia))
      )].sort((a, b) => a - b);

      const cualquierHorario = Boolean(modalidad?.cualquier_horario);
      const franjas = cualquierHorario
        ? []
        : (Array.isArray(modalidad?.franjas) ? modalidad.franjas : [])
            .map((franja) => ({
              desde: normalizarHora(franja?.desde),
              hasta: normalizarHora(franja?.hasta)
            }))
            .filter((franja) => franja.desde && franja.hasta && franja.desde < franja.hasta);

      if (!dias.length || (!cualquierHorario && !franjas.length)) return null;

      return {
        id: String(modalidad?.id || `modalidad-${index + 1}`),
        nombre: String(modalidad?.nombre || `Modalidad ${index + 1}`).trim().slice(0, 80),
        dias,
        cualquier_horario: cualquierHorario,
        franjas
      };
    })
    .filter(Boolean);

  if (!modalidades.length) return null;
  return { habilitada: true, modalidades };
};

export const validarPayloadRestriccionesAgenda = (valor) => {
  if (valor === undefined || valor === null || valor === '') return [];
  const base = parseJson(valor);
  if (!base) return ['Las restricciones de agenda no tienen un formato válido.'];
  if (base.habilitada === false) return [];
  const normalizadas = normalizarRestriccionesAgenda(base);
  if (!normalizadas) {
    return ['Las restricciones deben contener al menos una modalidad con días y horarios válidos.'];
  }
  return [];
};

const minutos = (hora) => {
  const [h, m] = String(hora || '00:00').slice(0, 5).split(':').map(Number);
  return h * 60 + m;
};

export const evaluarTurnoContraRestricciones = ({ restricciones, turno }) => {
  const reglas = normalizarRestriccionesAgenda(restricciones);
  if (!reglas) return { permitido: true, motivo: null };

  const dia = dayjs(turno.fecha).day();
  const inicio = minutos(turno.hora_inicio);
  const fin = minutos(turno.hora_fin);

  const modalidad = reglas.modalidades.find((item) => {
    if (!item.dias.includes(dia)) return false;
    if (item.cualquier_horario) return true;
    return item.franjas.some((franja) => inicio >= minutos(franja.desde) && fin <= minutos(franja.hasta));
  });

  if (modalidad) {
    return { permitido: true, motivo: null, modalidad };
  }

  return {
    permitido: false,
    motivo: 'El día u horario de esta clase no está incluido en la modalidad contratada.'
  };
};

export const obtenerRestriccionesMembresia = async ({ membresia, transaction = null }) => {
  const snapshot = normalizarRestriccionesAgenda(membresia?.agenda_restricciones);
  if (snapshot) return snapshot;
  if (!membresia?.plan_id) return null;

  const plan = await PlanesModel.findByPk(membresia.plan_id, {
    attributes: ['id', 'agenda_restricciones'],
    transaction
  });
  return normalizarRestriccionesAgenda(plan?.agenda_restricciones);
};

export const validarTurnoParaMembresia = async ({ membresia, turno, transaction = null }) => {
  const restricciones = await obtenerRestriccionesMembresia({ membresia, transaction });
  return evaluarTurnoContraRestricciones({ restricciones, turno });
};

export const copiarRestriccionesPlan = async ({ planId, transaction = null }) => {
  if (!planId) return null;
  const plan = await PlanesModel.findByPk(planId, {
    attributes: ['id', 'agenda_restricciones'],
    transaction
  });
  return normalizarRestriccionesAgenda(plan?.agenda_restricciones);
};
