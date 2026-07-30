/*
 * Sergio Manrique - 2026/07/12
 * Rutas del Dashboard principal (Dashboard_2): cortes de actividad por sede
 * y cierre mensual por sede.
 *
 * Tema: Rutas - Dashboard
 * Capa: Backend
 */

import express from 'express';

import { authenticateToken, requireRolGlobal } from '../Security/auth.js';

import {
  OBR_DashboardCortesActividad_CTS,
  OBR_DashboardCierreMensual_CTS,
  OBR_DashboardVencimientosPorDia_CTS
} from '../Controllers/Dashboard/CTS_TB_DashboardReportes.js';

const router = express.Router();

const ROLES_DASHBOARD = ['SUPER_ADMIN', 'DIRECCION'];

/*
 * =========================================================
 * DASHBOARD - REPORTES
 * =========================================================
 */

router.get(
  '/dashboard/cortes-actividad',
  authenticateToken,
  requireRolGlobal(ROLES_DASHBOARD),
  OBR_DashboardCortesActividad_CTS
);

router.get(
  '/dashboard/cierre-mensual',
  authenticateToken,
  requireRolGlobal(ROLES_DASHBOARD),
  OBR_DashboardCierreMensual_CTS
);

router.get(
  '/dashboard/vencimientos-por-dia',
  authenticateToken,
  requireRolGlobal(ROLES_DASHBOARD),
  OBR_DashboardVencimientosPorDia_CTS
);

export default router;
