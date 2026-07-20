/*
 * PREMIUM - Ciclo operativo de membresias.
 *
 * Una membresia futura nunca se adelanta de forma automatica. Agotar los
 * creditos bloquea nuevas reservas hasta que el usuario realice una accion
 * explicita de renovacion o llegue la fecha de inicio del siguiente periodo.
 */
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
