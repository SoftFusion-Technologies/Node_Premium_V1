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

// Registra las asociaciones Sequelize entre Sedes y SedesHorarios
import '../Models/Sede/relacionesSede.js';

import {
  OBRS_HorariosSedes_CTS,
  OBRS_HorarioSedePorId_CTS,
  CR_HorarioSede_CTS,
  UR_AplicarHorariosGlobalesSedes_CTS,
  UR_HorarioSede_CTS,
  UR_ToggleHorarioSede_CTS,
  ER_HorarioSede_CTS
} from '../Controllers/Sede/CTS_TB_SedesHorarios.js';

const router = express.Router();

/*
 * =========================================================
 * SEDES
 * =========================================================
 */

/*
 * =========================================================
 * SEDES HORARIOS
 * IMPORTANTE: estas rutas deben estar ANTES de /sedes/:id
 * para que Express no capture "horarios" como parámetro.
 * =========================================================
 */

/*
 * Sergio Manrique - 2026/07/02 - Lista horarios de sedes (filtro opcional: sede_id, activo).
 */
router.get('/sedes/horarios', authenticateToken, OBRS_HorariosSedes_CTS);

/*
 * Benjamin Orellana - 2026/07/05 - Aplica una misma grilla horaria a todas las sedes o solo a las activas.
 * IMPORTANTE: se declara antes de /sedes/horarios/:id para evitar conflictos de lectura humana.
 */
router.post(
  '/sedes/horarios/global',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  UR_AplicarHorariosGlobalesSedes_CTS
);

/*
 * Sergio Manrique - 2026/07/02 - Obtiene un horario por ID.
 */
router.get('/sedes/horarios/:id', authenticateToken, OBRS_HorarioSedePorId_CTS);

/*
 * Sergio Manrique - 2026/07/02 - Crea un horario para una sede y día.
 */
router.post(
  '/sedes/horarios',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  CR_HorarioSede_CTS
);

/*
 * Sergio Manrique - 2026/07/02 - Actualiza un horario existente.
 */
router.put(
  '/sedes/horarios/:id',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  UR_HorarioSede_CTS
);

/*
 * Sergio Manrique - 2026/07/02 - Activa o desactiva un horario.
 */
router.patch(
  '/sedes/horarios/:id/toggle',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  UR_ToggleHorarioSede_CTS
);

/*
 * Sergio Manrique - 2026/07/02 - Elimina un horario de sede.
 */
router.delete(
  '/sedes/horarios/:id',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  ER_HorarioSede_CTS
);

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
