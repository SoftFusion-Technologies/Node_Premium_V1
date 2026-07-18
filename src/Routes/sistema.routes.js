/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 25 / 04 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (sistema.routes.js) contiene las rutas de procesos
 * operativos del sistema (cron jobs disparados manualmente, etc.).
 *
 * Tema: Rutas - Sistema
 *
 * Capa: Backend
 */

import express from 'express';

// Benjamin Orellana - 2026/05/10 - Importa middlewares de seguridad para proteger rutas PREMIUM.
import { authenticateToken, requireRolGlobal } from '../Security/auth.js';

import { PR_ProcesarVencimientos_CTS } from '../Controllers/Sistema/CTS_ProcesarVencimientos.js';
import { PR_CapturarCotizacionesUsd_CTS } from '../Controllers/Finanzas/CTS_TB_FinanzasCotizacionesUsd.js';

const router = express.Router();

/*
 * =========================================================
 * SISTEMA - PROCESOS OPERATIVOS
 * =========================================================
 */

// Benjamin Orellana - 2026/06/15 - Procesa vencimientos de membresías, mensualidades y estados de alumnos.
router.post(
  '/sistema/procesar-vencimientos',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  PR_ProcesarVencimientos_CTS
);

// Sergio Manrique - 2026/07/17 - Disparo manual de la captura de cotización USD (oficial + blue), por si el cron falló o hace falta forzar una recaptura.
router.post(
  '/sistema/capturar-cotizacion-usd',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  PR_CapturarCotizacionesUsd_CTS
);

export default router;
