/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 25 / 04 / 2026
 * Versión: 1.1
 *
 * Descripción:
 * Este archivo (index.js) es el orquestador central de rutas del backend
 * PREMIUM. Reemplaza al antiguo routes.js monolítico: cada módulo vive en
 * su propio archivo *.routes.js y acá solo se montan, sin prefijos
 * globales (las rutas ya son heterogéneas: /sedes, /alumnos, /agenda-admin,
 * /agenda-alumno, etc. — cada *.routes.js define sus paths completos).
 *
 * El orden de montaje no altera el comportamiento: se revisó que ningún
 * par de rutas con el mismo método HTTP y la misma forma de segmentos
 * (ej. ruta literal vs. ruta con :param en la misma posición) quede
 * repartido entre dos archivos distintos — los únicos casos así (p. ej.
 * /agenda-admin/turnos/masivo vs /agenda-admin/turnos/:id) están dentro
 * del mismo *.routes.js y mantienen su orden relativo original.
 *
 * Tema: Rutas principales
 *
 * Capa: Backend
 */

import express from 'express';

import healthRoutes from './health.routes.js';
import sedesRoutes from './sedes.routes.js';
import usuariosRoutes from './usuarios.routes.js';
import alumnosRoutes from './alumnos.routes.js';
import planesRoutes from './planes.routes.js';
import pagosRoutes from './pagos.routes.js';
import gastosRoutes from './gastos.routes.js';
import finanzasRoutes from './finanzas.routes.js';
import agendaRoutes from './agenda.routes.js';
import sistemaRoutes from './sistema.routes.js';

const router = express.Router();

router.use(healthRoutes);
router.use(sedesRoutes);
router.use(usuariosRoutes);
router.use(alumnosRoutes);
router.use(planesRoutes);
router.use(pagosRoutes);
router.use(gastosRoutes);
router.use(finanzasRoutes);
router.use(agendaRoutes);
router.use(sistemaRoutes);

export default router;
