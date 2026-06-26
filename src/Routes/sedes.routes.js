/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 25 / 04 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (sedes.routes.js) contiene las rutas del módulo de Sedes.
 *
 * Tema: Rutas - Sedes
 *
 * Capa: Backend
 */

import express from 'express';

// Benjamin Orellana - 2026/05/10 - Importa middlewares de seguridad para proteger rutas PREMIUM.
import { authenticateToken, requireRolGlobal } from '../Security/auth.js';

// Benjamin Orellana - 2026/05/10 - Importa controlador de sedes PREMIUM.
import {
  OBRSedes_CTS,
  OBRSedesActivas_CTS,
  OBRSedesPublicas_CTS,
  OBRSedePorId_CTS,
  CRSede_CTS,
  URSede_CTS,
  URSedeEstado_CTS,
  DRSede_CTS
} from '../Controllers/Sede/CTS_TB_Sedes.js';

const router = express.Router();

/*
 * =========================================================
 * SEDES
 * =========================================================
 */

/*
 * Benjamin Orellana - 2026/05/10 - Lista sedes con filtros y paginación.
 */
router.get('/sedes', authenticateToken, OBRSedes_CTS);

/*
 * Benjamin Orellana - 2026/05/10 - Lista sedes activas para selects operativos.
 */
router.get('/sedes/activas', authenticateToken, OBRSedesActivas_CTS);

/*
 * Benjamin Orellana - 2026/06/01 - Endpoint público para obtener ID y nombre de sedes activas.
 */
router.get('/sedes-publicas', OBRSedesPublicas_CTS);

/*
 * Benjamin Orellana - 2026/05/10 - Obtiene una sede por ID.
 */
router.get('/sedes/:id', authenticateToken, OBRSedePorId_CTS);

/*
 * Benjamin Orellana - 2026/05/10 - Crea una nueva sede.
 */
router.post(
  '/sedes',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  CRSede_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Actualiza una sede existente.
 */
router.put(
  '/sedes/:id',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  URSede_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Cambia estado activo/inactivo de una sede.
 */
router.patch(
  '/sedes/:id/estado',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  URSedeEstado_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Desactiva una sede sin eliminarla físicamente.
 */
router.delete(
  '/sedes/:id',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  DRSede_CTS
);

export default router;
