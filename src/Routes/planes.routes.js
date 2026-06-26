/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 25 / 04 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (planes.routes.js) contiene las rutas del módulo de Planes
 * y sus precios.
 *
 * Tema: Rutas - Planes
 *
 * Capa: Backend
 */

import express from 'express';

// Benjamin Orellana - 2026/05/10 - Importa middlewares de seguridad para proteger rutas PREMIUM.
import { authenticateToken } from '../Security/auth.js';

import {
  OBR_Planes_CTS,
  OBR_PlanPorId_CTS,
  OBR_PlanesPublicos_CTS,
  OBR_PlanesConPrecios_CTS,
  CR_Planes_CTS,
  UR_Planes_CTS,
  UR_EstadoPlanes_CTS,
  DR_Planes_CTS,
  ER_Planes_CTS
} from '../Controllers/Plan/CTS_TB_Planes.js';

import {
  OBR_PlanesPrecios_CTS,
  OBR_PlanPrecioPorId_CTS,
  OBR_PreciosPorPlan_CTS,
  OBR_PrecioVigentePlan_CTS,
  CR_PlanesPrecios_CTS,
  CR_PlanesPreciosMasivoPorSedes_CTS,
  UR_PlanesPrecios_CTS,
  UR_EstadoPlanesPrecios_CTS,
  DR_PlanesPrecios_CTS,
  ER_PlanesPrecios_CTS
} from '../Controllers/Plan/CTS_TB_PlanesPrecios.js';

const router = express.Router();

/*
 * =========================================================
 * PLANES
 * =========================================================
 */

router.get('/planes', authenticateToken, OBR_Planes_CTS);

router.get('/planes/:id', authenticateToken, OBR_PlanPorId_CTS);

// Benjamin Orellana - 2026/06/01 - Endpoint público para obtener ID y nombre de planes activos.
router.get('/planes-publicos', OBR_PlanesPublicos_CTS);

router.get('/planes-con-precios', OBR_PlanesConPrecios_CTS);

router.post('/planes', authenticateToken, CR_Planes_CTS);

router.put('/planes/:id', authenticateToken, UR_Planes_CTS);

router.patch('/planes/:id/estado', authenticateToken, UR_EstadoPlanes_CTS);

router.put('/planes/:id/desactivar', authenticateToken, DR_Planes_CTS);

router.delete('/planes/:id', authenticateToken, ER_Planes_CTS);

/*
 * =========================================================
 * PLANES PRECIOS
 * =========================================================
 */

router.get('/planes-precios', authenticateToken, OBR_PlanesPrecios_CTS);

router.get('/planes-precios/:id', authenticateToken, OBR_PlanPrecioPorId_CTS);

router.get(
  '/planes/:plan_id/precios',
  authenticateToken,
  OBR_PreciosPorPlan_CTS
);

router.get(
  '/planes/:plan_id/precio-vigente',
  authenticateToken,
  OBR_PrecioVigentePlan_CTS
);

router.post('/planes-precios', authenticateToken, CR_PlanesPrecios_CTS);

// Benjamin Orellana - 2026/05/30 - Crea precios masivos de un plan por sede.
router.post(
  '/planes/:plan_id/precios/sedes',
  authenticateToken,
  CR_PlanesPreciosMasivoPorSedes_CTS
);

router.put('/planes-precios/:id', authenticateToken, UR_PlanesPrecios_CTS);

router.patch(
  '/planes-precios/:id/estado',
  authenticateToken,
  UR_EstadoPlanesPrecios_CTS
);

router.put(
  '/planes-precios/:id/desactivar',
  authenticateToken,
  DR_PlanesPrecios_CTS
);

router.delete('/planes-precios/:id', authenticateToken, ER_PlanesPrecios_CTS);

export default router;
