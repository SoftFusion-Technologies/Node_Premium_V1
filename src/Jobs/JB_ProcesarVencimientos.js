/*
 * Benjamin Orellana - 2026/06/15 - Job automático de vencimientos PREMIUM.
 * Ejecuta diariamente la sincronización de membresías, mensualidades y estado de alumnos.
 */

import cron from 'node-cron';
import { ejecutarProcesamientoVencimientos } from '../Controllers/Sistema/CTS_ProcesarVencimientos.js';

let jobInicializado = false;
let jobEnEjecucion = false;

const CRON_EXPRESION = process.env.CRON_VENCIMIENTOS_EXPRESION || '10 3 * * *';
const CRON_TIMEZONE =
  process.env.CRON_VENCIMIENTOS_TIMEZONE || 'America/Argentina/Buenos_Aires';

const cronHabilitado = () => {
  return String(process.env.CRON_VENCIMIENTOS_ENABLED || 'true') === 'true';
};

export const ejecutarJobProcesarVencimientos = async ({
  origen = 'cron'
} = {}) => {
  if (jobEnEjecucion) {
    console.warn(
      '[CRON_VENCIMIENTOS] Ya hay una ejecución en curso. Se omite esta corrida.'
    );

    return {
      ok: false,
      message: 'Ya hay una ejecución en curso.'
    };
  }

  jobEnEjecucion = true;

  const inicio = new Date();

  try {
    console.log(
      `[CRON_VENCIMIENTOS] Inicio ${inicio.toISOString()} - origen: ${origen}`
    );

    const resultado = await ejecutarProcesamientoVencimientos({
      origen
    });

    const fin = new Date();

    console.log('[CRON_VENCIMIENTOS] Finalizado', {
      ok: resultado.ok,
      status: resultado.status,
      fecha_proceso: resultado.data?.fecha_proceso,
      membresias_vencidas: resultado.data?.membresias_vencidas,
      mensualidades_vencidas: resultado.data?.mensualidades_vencidas,
      alumnos: resultado.data?.alumnos,
      duracion_ms: fin.getTime() - inicio.getTime()
    });

    return resultado;
  } catch (error) {
    console.error('[CRON_VENCIMIENTOS] Error inesperado:', error);

    return {
      ok: false,
      message: 'Error inesperado en cron de vencimientos.'
    };
  } finally {
    jobEnEjecucion = false;
  }
};

export const iniciarCronProcesarVencimientos = () => {
  if (jobInicializado) {
    console.warn('[CRON_VENCIMIENTOS] El job ya estaba inicializado.');
    return null;
  }

  if (!cronHabilitado()) {
    console.log(
      '[CRON_VENCIMIENTOS] Cron deshabilitado por variable de entorno.'
    );
    return null;
  }

  jobInicializado = true;

  const task = cron.schedule(
    CRON_EXPRESION,
    async () => {
      await ejecutarJobProcesarVencimientos({ origen: 'cron' });
    },
    {
      scheduled: true,
      timezone: CRON_TIMEZONE
    }
  );

  console.log('[CRON_VENCIMIENTOS] Job inicializado', {
    expresion: CRON_EXPRESION,
    timezone: CRON_TIMEZONE
  });

  return task;
};
