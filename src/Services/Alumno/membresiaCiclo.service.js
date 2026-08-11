/*
 * PREMIUM - Ciclo operativo de membresias.
 *
 * Una membresia futura nunca se adelanta de forma automatica. Agotar los
 * creditos bloquea nuevas reservas hasta que el usuario realice una accion
 * explicita de renovacion o llegue la fecha de inicio del siguiente periodo.
 */

const MESES_POR_PERIODO = Object.freeze({
  mensual: 1,
  trimestral: 3,
  semestral: 6,
  anual: 12
});

const normalizarFechaDateOnly = (valor) => {
  const fecha = String(valor || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;

  const fechaUtc = new Date(`${fecha}T00:00:00Z`);
  if (Number.isNaN(fechaUtc.getTime())) return null;

  return fechaUtc.toISOString().slice(0, 10) === fecha ? fecha : null;
};

export const sumarDiasMembresiaDateOnly = (fechaDateOnly, dias) => {
  const fechaNormalizada = normalizarFechaDateOnly(fechaDateOnly);
  if (!fechaNormalizada || !Number.isFinite(Number(dias))) return null;

  const fecha = new Date(`${fechaNormalizada}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + Number(dias));
  return fecha.toISOString().slice(0, 10);
};

// Benjamin Orellana - 2026/08/10 - Avanza meses calendario conservando el
// dia de inicio cuando existe y, para fin de mes, usa el ultimo dia disponible.
export const sumarMesesMembresiaDateOnly = (fechaDateOnly, meses) => {
  const fechaNormalizada = normalizarFechaDateOnly(fechaDateOnly);
  if (!fechaNormalizada || !Number.isInteger(Number(meses))) return null;

  const fecha = new Date(`${fechaNormalizada}T00:00:00Z`);
  const diaOriginal = fecha.getUTCDate();

  fecha.setUTCDate(1);
  fecha.setUTCMonth(fecha.getUTCMonth() + Number(meses));

  const ultimoDiaMesDestino = new Date(
    Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 0)
  ).getUTCDate();

  fecha.setUTCDate(Math.min(diaOriginal, ultimoDiaMesDestino));
  return fecha.toISOString().slice(0, 10);
};

/*
 * Benjamin Orellana - 2026/08/10 - Regla unica para vencimientos de planes.
 * Los periodos comerciales mandan sobre duracion_dias:
 *   mensual     => +1 mes  - 1 dia
 *   trimestral  => +3 meses - 1 dia
 *   semestral   => +6 meses - 1 dia
 *   anual       => +12 meses - 1 dia
 * duracion_dias queda como fallback para planes sin un periodo reconocido.
 *
 * Ejemplo: 07/08/2026 mensual => 06/09/2026.
 */
export const calcularFechaVencimientoPlan = ({
  fechaInicio,
  periodo,
  duracionDias
}) => {
  const fechaNormalizada = normalizarFechaDateOnly(fechaInicio);
  if (!fechaNormalizada) return null;

  const periodoNormalizado = String(periodo || '').trim().toLowerCase();
  const mesesPeriodo = MESES_POR_PERIODO[periodoNormalizado] || null;

  if (mesesPeriodo) {
    const siguienteInicio = sumarMesesMembresiaDateOnly(
      fechaNormalizada,
      mesesPeriodo
    );

    return siguienteInicio
      ? sumarDiasMembresiaDateOnly(siguienteInicio, -1)
      : null;
  }

  const duracion = Number(duracionDias);
  if (!Number.isInteger(duracion) || duracion <= 0) return null;

  return sumarDiasMembresiaDateOnly(fechaNormalizada, duracion - 1);
};

export const obtenerFechaArgentinaDateOnly = () => {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const valores = Object.fromEntries(
    partes
      .filter((item) => item.type !== 'literal')
      .map((item) => [item.type, item.value])
  );

  return `${valores.year}-${valores.month}-${valores.day}`;
};

/*
 * Se conserva esta funcion como frontera estable porque agenda, cobros y el
 * proceso diario ya la invocan. Deliberadamente no modifica registros: evita
 * que una reserva, un cron o una consulta cambien fechas de periodos pagados.
 */
export const normalizarCicloMembresiasAlumno = async ({
  alumnoId,
  fechaReferencia = obtenerFechaArgentinaDateOnly(),
  transaction
}) => {
  if (!transaction) {
    throw new Error('normalizarCicloMembresiasAlumno requiere una transaccion.');
  }
  return {
    promovida: false,
    motivo: 'activacion_automatica_deshabilitada',
    alumno_id: Number(alumnoId),
    fecha_referencia: fechaReferencia
  };
};
