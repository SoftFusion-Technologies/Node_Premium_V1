/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 07 / 07 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (gastos.routes.js) contiene las rutas del módulo de Gastos:
 * tipos, proveedores, gastos reales, gastos periódicos y reportes operativos.
 *
 * Tema: Rutas - Gastos
 *
 * Capa: Backend
 */

import express from 'express';

import {
  authenticateToken,
  requirePermission,
  requireRolGlobal
} from '../Security/auth.js';
import { requireFechaOperativaActual } from '../Security/operationalDayScope.js';

import {
  OBR_GastosTipos_CTS,
  OBR_GastoTipoPorId_CTS,
  CR_GastosTipos_CTS,
  UR_GastosTipos_CTS,
  DR_GastosTipos_CTS
} from '../Controllers/Gastos/CTS_TB_GastosTipos.js';

import {
  OBR_GastosProveedores_CTS,
  OBR_GastoProveedorPorId_CTS,
  CR_GastosProveedores_CTS,
  UR_GastosProveedores_CTS,
  DR_GastosProveedores_CTS
} from '../Controllers/Gastos/CTS_TB_GastosProveedores.js';

import {
  OBR_Gastos_CTS,
  OBR_GastoPorId_CTS,
  CR_Gastos_CTS,
  UR_Gastos_CTS,
  DR_Gastos_CTS
} from '../Controllers/Gastos/CTS_TB_GastosGastos.js';

import {
  OBR_GastosPeriodicos_CTS,
  OBR_GastoPeriodicoPorId_CTS,
  CR_GastosPeriodicos_CTS,
  UR_GastosPeriodicos_CTS,
  CR_GenerarGastoDesdePeriodico_CTS,
  DR_GastosPeriodicos_CTS
} from '../Controllers/Gastos/CTS_TB_GastosPeriodicos.js';

import {
  OBR_GastosResumen_CTS,
  OBR_GastosPorTipo_CTS,
  OBR_GastosPorSede_CTS,
  OBR_GastosPorProveedor_CTS
} from '../Controllers/Gastos/CTS_TB_GastosReportes.js';

const router = express.Router();

const ROLES_GASTOS_OPERATIVOS = [
  'SUPER_ADMIN',
  'DIRECCION',
  'COORD_SEDE',
  'PROFESOR'
];
const ROLES_GASTOS_ADMIN = ['SUPER_ADMIN', 'DIRECCION'];

/*
 * =========================================================
 * GASTOS - TIPOS
 * =========================================================
 */

router.get(
  '/gastos-tipos',
  authenticateToken,
  requirePermission('gastos.ver'),
  OBR_GastosTipos_CTS
);

router.get(
  '/gastos-tipos/:id',
  authenticateToken,
  requireRolGlobal(ROLES_GASTOS_OPERATIVOS),
  OBR_GastoTipoPorId_CTS
);

router.post(
  '/gastos-tipos',
  authenticateToken,
  requireRolGlobal(ROLES_GASTOS_ADMIN),
  CR_GastosTipos_CTS
);

router.put(
  '/gastos-tipos/:id',
  authenticateToken,
  requireRolGlobal(ROLES_GASTOS_ADMIN),
  UR_GastosTipos_CTS
);

router.delete(
  '/gastos-tipos/:id',
  authenticateToken,
  requireRolGlobal(ROLES_GASTOS_ADMIN),
  DR_GastosTipos_CTS
);

/*
 * =========================================================
 * GASTOS - PROVEEDORES
 * =========================================================
 */

router.get(
  '/gastos-proveedores',
  authenticateToken,
  requirePermission('gastos.ver'),
  OBR_GastosProveedores_CTS
);

router.get(
  '/gastos-proveedores/:id',
  authenticateToken,
  requireRolGlobal(ROLES_GASTOS_OPERATIVOS),
  OBR_GastoProveedorPorId_CTS
);

router.post(
  '/gastos-proveedores',
  authenticateToken,
  requireRolGlobal(ROLES_GASTOS_ADMIN),
  CR_GastosProveedores_CTS
);

router.put(
  '/gastos-proveedores/:id',
  authenticateToken,
  requireRolGlobal(ROLES_GASTOS_ADMIN),
  UR_GastosProveedores_CTS
);

router.delete(
  '/gastos-proveedores/:id',
  authenticateToken,
  requireRolGlobal(ROLES_GASTOS_ADMIN),
  DR_GastosProveedores_CTS
);

/*
 * =========================================================
 * GASTOS - REPORTES
 * =========================================================
 */

router.get(
  '/gastos-reportes/resumen',
  authenticateToken,
  requirePermission('gastos.ver'),
  requireFechaOperativaActual,
  OBR_GastosResumen_CTS
);

router.get(
  '/gastos-reportes/por-tipo',
  authenticateToken,
  requirePermission('gastos.ver'),
  requireFechaOperativaActual,
  OBR_GastosPorTipo_CTS
);

router.get(
  '/gastos-reportes/por-sede',
  authenticateToken,
  requirePermission('gastos.ver'),
  requireFechaOperativaActual,
  OBR_GastosPorSede_CTS
);

router.get(
  '/gastos-reportes/por-proveedor',
  authenticateToken,
  requirePermission('gastos.ver'),
  requireFechaOperativaActual,
  OBR_GastosPorProveedor_CTS
);

/*
 * =========================================================
 * GASTOS - PERIÓDICOS
 * =========================================================
 */

router.get(
  '/gastos-periodicos',
  authenticateToken,
  requireRolGlobal(ROLES_GASTOS_ADMIN),
  OBR_GastosPeriodicos_CTS
);

router.get(
  '/gastos-periodicos/:id',
  authenticateToken,
  requireRolGlobal(ROLES_GASTOS_ADMIN),
  OBR_GastoPeriodicoPorId_CTS
);

router.post(
  '/gastos-periodicos',
  authenticateToken,
  requireRolGlobal(ROLES_GASTOS_ADMIN),
  CR_GastosPeriodicos_CTS
);

router.post(
  '/gastos-periodicos/:id/generar',
  authenticateToken,
  requireRolGlobal(ROLES_GASTOS_ADMIN),
  CR_GenerarGastoDesdePeriodico_CTS
);

router.put(
  '/gastos-periodicos/:id',
  authenticateToken,
  requireRolGlobal(ROLES_GASTOS_ADMIN),
  UR_GastosPeriodicos_CTS
);

router.delete(
  '/gastos-periodicos/:id',
  authenticateToken,
  requireRolGlobal(ROLES_GASTOS_ADMIN),
  DR_GastosPeriodicos_CTS
);

/*
 * =========================================================
 * GASTOS - REGISTROS REALES
 * =========================================================
 */

router.get(
  '/gastos',
  authenticateToken,
  requirePermission('gastos.ver'),
  OBR_Gastos_CTS
);

router.get(
  '/gastos/:id',
  authenticateToken,
  requireRolGlobal(ROLES_GASTOS_OPERATIVOS),
  OBR_GastoPorId_CTS
);

router.post(
  '/gastos',
  authenticateToken,
  requirePermission('gastos.ver'),
  CR_Gastos_CTS
);

router.put(
  '/gastos/:id',
  authenticateToken,
  requirePermission('gastos.ver'),
  UR_Gastos_CTS
);

router.delete(
  '/gastos/:id',
  authenticateToken,
  requireRolGlobal(ROLES_GASTOS_ADMIN),
  DR_Gastos_CTS
);

export default router;
