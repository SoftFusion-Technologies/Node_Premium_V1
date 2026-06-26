/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 25 / 04 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (health.routes.js) contiene el health check interno
 * de las rutas centralizadas PREMIUM.
 *
 * Tema: Rutas - Health
 *
 * Capa: Backend
 */

import express from 'express';

const router = express.Router();

/*
 * Benjamin Orellana - 2026/05/10 - Health check interno de rutas centralizadas PREMIUM.
 */
router.get('/api/status', (req, res) => {
  return res.status(200).json({
    ok: true,
    message: 'Rutas PREMIUM funcionando correctamente.'
  });
});

export default router;
