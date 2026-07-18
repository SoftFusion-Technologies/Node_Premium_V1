/*
 * Sergio Manrique - 2026/07/17 - Job automático de captura de cotización USD.
 * Corre dos veces por día (después del cierre oficial ~15hs y de nuevo a la
 * noche, por si el cierre se demoró) y guarda oficial + blue en
 * finanzas_cotizaciones_usd. Ver Controllers/Finanzas/CTS_TB_FinanzasCotizacionesUsd.js.
 */

import cron from 'node-cron';
import { capturarCotizacionesUsdDelDia } from '../Controllers/Finanzas/CTS_TB_FinanzasCotizacionesUsd.js';

let jobInicializado = false;
let jobEnEjecucion = false;

const CRON_EXPRESION =
  process.env.CRON_COTIZACION_USD_EXPRESION || '10 15,20 * * *';
const CRON_TIMEZONE =
  process.env.CRON_COTIZACION_USD_TIMEZONE || 'America/Argentina/Buenos_Aires';

const cronHabilitado = () => {
  return String(process.env.CRON_COTIZACION_USD_ENABLED || 'true') === 'true';
};

export const ejecutarJobCotizacionUsd = async ({ origen = 'cron' } = {}) => {
  if (jobEnEjecucion) {
    console.warn(
      '[CRON_COTIZACION_USD] Ya hay una ejecución en curso. Se omite esta corrida.'
    );

    return { ok: false, message: 'Ya hay una ejecución en curso.' };
  }

  jobEnEjecucion = true;

  const inicio = new Date();

  try {
    console.log(
      `[CRON_COTIZACION_USD] Inicio ${inicio.toISOString()} - origen: ${origen}`
    );

    const resultado = await capturarCotizacionesUsdDelDia({ origen });

    const fin = new Date();

    console.log('[CRON_COTIZACION_USD] Finalizado', {
      ok: resultado.ok,
      resultados: resultado.data?.resultados,
      duracion_ms: fin.getTime() - inicio.getTime()
    });

    return resultado;
  } catch (error) {
    console.error('[CRON_COTIZACION_USD] Error inesperado:', error);

    return { ok: false, message: 'Error inesperado en cron de cotización USD.' };
  } finally {
    jobEnEjecucion = false;
  }
};

export const iniciarCronCotizacionUsd = () => {
  if (jobInicializado) {
    console.warn('[CRON_COTIZACION_USD] El job ya estaba inicializado.');
    return null;
  }

  if (!cronHabilitado()) {
    console.log('[CRON_COTIZACION_USD] Cron deshabilitado por variable de entorno.');
    return null;
  }

  jobInicializado = true;

  const task = cron.schedule(
    CRON_EXPRESION,
    async () => {
      await ejecutarJobCotizacionUsd({ origen: 'cron' });
    },
    {
      scheduled: true,
      timezone: CRON_TIMEZONE
    }
  );

  console.log('[CRON_COTIZACION_USD] Job inicializado', {
    expresion: CRON_EXPRESION,
    timezone: CRON_TIMEZONE
  });

  return task;
};
