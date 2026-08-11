/*
 * Reloj de referencia para la Agenda.
 * La UI usa este valor como base y avanza con performance.now(), por lo que
 * la posición de la línea no depende de la hora configurada en el navegador.
 */
export const OBRS_HoraServidorAgenda_CTS = (_req, res) => {
  const ahora = new Date();

  return res.status(200).json({
    ok: true,
    data: {
      iso: ahora.toISOString(),
      epoch_ms: ahora.getTime(),
    },
  });
};
