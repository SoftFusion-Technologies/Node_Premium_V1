/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 25 / 04 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (finanzas.routes.js) contiene las rutas del módulo de
 * Finanzas (movimientos financieros).
 *
 * Tema: Rutas - Finanzas
 *
 * Capa: Backend
 */

import express from 'express';

// Benjamin Orellana - 2026/05/10 - Importa middlewares de seguridad para proteger rutas PREMIUM.
import { authenticateToken } from '../Security/auth.js';

import {
  OBR_FinanzasMovimientos_CTS,
  OBR_FinanzaMovimientoPorId_CTS,
  OBR_FinanzasMovimientosPorPago_CTS,
  OBR_ResumenFinanciero_CTS,
  OBR_ReporteCobrosPorSede_CTS,
  CR_FinanzasMovimientos_CTS,
  UR_FinanzasMovimientos_CTS,
  UR_EstadoFinanzaMovimiento_CTS,
  DR_FinanzasMovimientos_CTS,
  ER_FinanzasMovimientos_CTS
} from '../Controllers/Finanzas/CTS_TB_FinanzasMovimientos.js';
import { OBR_CotizacionUsdVigente_CTS } from '../Controllers/Finanzas/CTS_TB_FinanzasCotizacionesUsd.js';

const router = express.Router();

/*
 * =========================================================
 * FINANZAS - COTIZACIÓN USD
 * =========================================================
 */

// Sergio Manrique - 2026/07/17 - Cotización vigente (oficial o blue) a una fecha dada, o a hoy si no se especifica.
router.get(
  '/finanzas-cotizaciones-usd/vigente',
  authenticateToken,
  OBR_CotizacionUsdVigente_CTS
);

/*
 * =========================================================
 * FINANZAS MOVIMIENTOS
 * =========================================================
 */

router.get(
  '/finanzas-movimientos',
  authenticateToken,
  OBR_FinanzasMovimientos_CTS
);

router.get(
  '/finanzas-movimientos/resumen',
  authenticateToken,
  OBR_ResumenFinanciero_CTS
);

router.get(
  '/finanzas-movimientos/reporte-cobros-sede',
  authenticateToken,
  OBR_ReporteCobrosPorSede_CTS
);

router.get(
  '/pagos/:pago_id/finanzas-movimientos',
  authenticateToken,
  OBR_FinanzasMovimientosPorPago_CTS
);

router.get(
  '/finanzas-movimientos/:id',
  authenticateToken,
  OBR_FinanzaMovimientoPorId_CTS
);

router.post(
  '/finanzas-movimientos',
  authenticateToken,
  CR_FinanzasMovimientos_CTS
);

router.put(
  '/finanzas-movimientos/:id',
  authenticateToken,
  UR_FinanzasMovimientos_CTS
);

router.patch(
  '/finanzas-movimientos/:id/estado',
  authenticateToken,
  UR_EstadoFinanzaMovimiento_CTS
);

// Benjamin Orellana - 2026/05/30 - Baja lógica del movimiento financiero, cambia estado a anulado.
router.put(
  '/finanzas-movimientos/:id/desactivar',
  authenticateToken,
  DR_FinanzasMovimientos_CTS
);

// Benjamin Orellana - 2026/05/30 - Eliminación física del movimiento financiero.
router.delete(
  '/finanzas-movimientos/:id',
  authenticateToken,
  ER_FinanzasMovimientos_CTS
);

export default router;
