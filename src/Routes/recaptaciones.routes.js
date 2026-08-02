/*
 * Sergio Manrique - 2026/08/01
 * Rutas del módulo Recaptaciones: listado de seguimiento comercial e
 * historial/registro de contactos.
 *
 * Tema: Rutas - Recaptaciones
 * Capa: Backend
 */

import express from 'express';

import { authenticateToken, requireRolGlobal } from '../Security/auth.js';
import {
  OBR_AlumnosRecaptaciones_CTS,
  OBR_HistorialContactosRecaptacion_CTS,
  CR_ContactoRecaptacion_CTS,
  UR_ContactoRecaptacion_CTS,
  ER_ContactoRecaptacion_CTS
} from '../Controllers/Alumno/CTS_TB_AlumnosRecaptaciones.js';
import {
  ROLES_LECTURA_ALUMNOS,
  ROLES_OPERATIVOS_ALUMNOS
} from '../Controllers/Alumno/CTS_TB_Alumnos.js';

const router = express.Router();

router.get(
  '/alumnos-recaptaciones',
  authenticateToken,
  requireRolGlobal(ROLES_LECTURA_ALUMNOS),
  OBR_AlumnosRecaptaciones_CTS
);

router.get(
  '/alumnos/:alumno_id/recaptaciones/contactos',
  authenticateToken,
  requireRolGlobal(ROLES_LECTURA_ALUMNOS),
  OBR_HistorialContactosRecaptacion_CTS
);

router.post(
  '/alumnos/:alumno_id/recaptaciones/contactos',
  authenticateToken,
  requireRolGlobal(ROLES_OPERATIVOS_ALUMNOS),
  CR_ContactoRecaptacion_CTS
);

router.put(
  '/alumnos/:alumno_id/recaptaciones/contactos/:contacto_id',
  authenticateToken,
  requireRolGlobal(ROLES_OPERATIVOS_ALUMNOS),
  UR_ContactoRecaptacion_CTS
);

router.delete(
  '/alumnos/:alumno_id/recaptaciones/contactos/:contacto_id',
  authenticateToken,
  requireRolGlobal(ROLES_OPERATIVOS_ALUMNOS),
  ER_ContactoRecaptacion_CTS
);

export default router;
