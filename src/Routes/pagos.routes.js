/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 25 / 04 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (pagos.routes.js) contiene las rutas del módulo de Pagos:
 * medios de pago, mensualidades, pagos, métodos recurrentes y el registro
 * operativo de pagos/renovaciones.
 *
 * Tema: Rutas - Pagos
 *
 * Capa: Backend
 */

import express from 'express';

// Benjamin Orellana - 2026/05/10 - Importa middlewares de seguridad para proteger rutas PREMIUM.
import { authenticateToken } from '../Security/auth.js';

import {
  OBR_PagosMediosPago_CTS,
  OBR_MedioPagoPorId_CTS,
  OBR_MediosPagoActivos_CTS,
  CR_PagosMediosPago_CTS,
  UR_PagosMediosPago_CTS,
  UR_EstadoMedioPago_CTS,
  DR_PagosMediosPago_CTS,
  ER_PagosMediosPago_CTS
} from '../Controllers/Pago/CTS_TB_PagosMediosPago.js';

// Benjamin Orellana - 2026/06/07 - Importa controladores de mensualidades y deuda de alumnos PREMIUM.
import {
  OBR_PagosMensualidades_CTS,
  OBR_MensualidadPorId_CTS,
  OBR_MensualidadesPorAlumno_CTS,
  OBR_MensualidadesPendientes_CTS,
  OBR_MensualidadesVencidas_CTS,
  OBR_AlumnosMorosos_CTS,
  CR_PagosMensualidades_CTS,
  CR_GenerarMensualidadDesdeMembresia_CTS,
  UR_PagosMensualidades_CTS,
  UR_EstadoMensualidad_CTS,
  UR_MarcarMensualidadVencida_CTS,
  DR_PagosMensualidades_CTS,
  ER_PagosMensualidades_CTS
} from '../Controllers/Pago/CTS_TB_PagosMensualidades.js';

import {
  OBR_Pagos_CTS,
  OBR_PagoPorId_CTS,
  OBR_PagosPorAlumno_CTS,
  OBR_PagosPorMensualidad_CTS,
  OBR_HistorialPagosAlumno_CTS,
  CR_Pagos_CTS,
  UR_Pagos_CTS,
  UR_ConfirmarPago_CTS,
  UR_RechazarPago_CTS,
  UR_AnularPago_CTS,
  DR_Pagos_CTS,
  ER_Pagos_CTS
} from '../Controllers/Pago/CTS_TB_Pagos.js';

import {
  OBR_PagosMetodosRecurrentes_CTS,
  OBR_MetodoRecurrentePorId_CTS,
  OBR_MetodosRecurrentesPorAlumno_CTS,
  CR_PagosMetodosRecurrentes_CTS,
  UR_PagosMetodosRecurrentes_CTS,
  UR_EstadoMetodoRecurrente_CTS,
  DR_PagosMetodosRecurrentes_CTS,
  ER_PagosMetodosRecurrentes_CTS
} from '../Controllers/Pago/CTS_TB_PagosMetodosRecurrentes.js';

import {
  CR_RegistrarPagoOperativo_CTS,
  CR_RenovarMembresiaOperativa_CTS
} from '../Controllers/Pago/CTS_TB_PagosRegistroOperativo.js';

const router = express.Router();

/*
 * =========================================================
 * PAGOS MEDIOS DE PAGO
 * =========================================================
 */

router.get('/pagos-medios-pago', authenticateToken, OBR_PagosMediosPago_CTS);

router.get(
  '/pagos-medios-pago/activos',
  authenticateToken,
  OBR_MediosPagoActivos_CTS
);

router.get('/pagos-medios-pago/:id', authenticateToken, OBR_MedioPagoPorId_CTS);

router.post('/pagos-medios-pago', authenticateToken, CR_PagosMediosPago_CTS);

router.put('/pagos-medios-pago/:id', authenticateToken, UR_PagosMediosPago_CTS);

router.patch(
  '/pagos-medios-pago/:id/estado',
  authenticateToken,
  UR_EstadoMedioPago_CTS
);

// Benjamin Orellana - 2026/05/29 - Baja lógica del medio de pago, mantiene el registro en la tabla.
router.put(
  '/pagos-medios-pago/:id/desactivar',
  authenticateToken,
  DR_PagosMediosPago_CTS
);

// Benjamin Orellana - 2026/05/29 - Eliminación física del medio de pago.
router.delete(
  '/pagos-medios-pago/:id',
  authenticateToken,
  ER_PagosMediosPago_CTS
);

/*
 * =========================================================
 * PAGOS MENSUALIDADES
 * =========================================================
 */

/*
 * Benjamin Orellana - 2026/06/07 - Lista mensualidades con filtros y paginación.
 */
router.get(
  '/pagos-mensualidades',
  authenticateToken,
  OBR_PagosMensualidades_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Lista mensualidades pendientes o parciales con saldo.
 */
router.get(
  '/pagos-mensualidades/pendientes',
  authenticateToken,
  OBR_MensualidadesPendientes_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Lista mensualidades vencidas o con vencimiento superado.
 */
router.get(
  '/pagos-mensualidades/vencidas',
  authenticateToken,
  OBR_MensualidadesVencidas_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Lista alumnos morosos según mensualidades vencidas con saldo.
 */
router.get(
  '/pagos-mensualidades/morosos',
  authenticateToken,
  OBR_AlumnosMorosos_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Lista mensualidades de un alumno específico.
 */
router.get(
  '/alumnos/:alumno_id/mensualidades',
  authenticateToken,
  OBR_MensualidadesPorAlumno_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Obtiene una mensualidad por ID.
 */
router.get(
  '/pagos-mensualidades/:id',
  authenticateToken,
  OBR_MensualidadPorId_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Crea una mensualidad manual.
 */
router.post(
  '/pagos-mensualidades',
  authenticateToken,
  CR_PagosMensualidades_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Genera una mensualidad desde una membresía existente.
 */
router.post(
  '/pagos-mensualidades/generar-desde-membresia/:membresia_id',
  authenticateToken,
  CR_GenerarMensualidadDesdeMembresia_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Actualiza una mensualidad existente.
 */
router.put(
  '/pagos-mensualidades/:id',
  authenticateToken,
  UR_PagosMensualidades_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Actualiza manualmente el estado de una mensualidad.
 */
router.patch(
  '/pagos-mensualidades/:id/estado',
  authenticateToken,
  UR_EstadoMensualidad_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Marca una mensualidad como vencida.
 */
router.patch(
  '/pagos-mensualidades/:id/vencida',
  authenticateToken,
  UR_MarcarMensualidadVencida_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Anula una mensualidad mediante baja lógica.
 */
router.put(
  '/pagos-mensualidades/:id/anular',
  authenticateToken,
  DR_PagosMensualidades_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Elimina físicamente una mensualidad.
 */
router.delete(
  '/pagos-mensualidades/:id',
  authenticateToken,
  ER_PagosMensualidades_CTS
);

/*
 * =========================================================
 * PAGOS
 * =========================================================
 */

router.get('/pagos', authenticateToken, OBR_Pagos_CTS);

router.get('/pagos/:id', authenticateToken, OBR_PagoPorId_CTS);

router.get(
  '/alumnos/:alumno_id/pagos',
  authenticateToken,
  OBR_PagosPorAlumno_CTS
);

router.get(
  '/alumnos/:alumno_id/pagos-historial',
  authenticateToken,
  OBR_HistorialPagosAlumno_CTS
);

router.get(
  '/pagos-mensualidades/:mensualidad_id/pagos',
  authenticateToken,
  OBR_PagosPorMensualidad_CTS
);

router.post('/pagos', authenticateToken, CR_Pagos_CTS);

router.put('/pagos/:id', authenticateToken, UR_Pagos_CTS);

router.put('/pagos/:id/confirmar', authenticateToken, UR_ConfirmarPago_CTS);

router.put('/pagos/:id/rechazar', authenticateToken, UR_RechazarPago_CTS);

router.put('/pagos/:id/anular', authenticateToken, UR_AnularPago_CTS);

// Benjamin Orellana - 2026/05/30 - Baja lógica del pago, cambia estado a anulado.
router.put('/pagos/:id/desactivar', authenticateToken, DR_Pagos_CTS);

// Benjamin Orellana - 2026/05/30 - Eliminación física del pago.
router.delete('/pagos/:id', authenticateToken, ER_Pagos_CTS);

/*
 * =========================================================
 * PAGOS MÉTODOS RECURRENTES
 * =========================================================
 */

router.get(
  '/pagos-metodos-recurrentes',
  authenticateToken,
  OBR_PagosMetodosRecurrentes_CTS
);

router.get(
  '/alumnos/:alumno_id/metodos-recurrentes',
  authenticateToken,
  OBR_MetodosRecurrentesPorAlumno_CTS
);

router.get(
  '/pagos-metodos-recurrentes/:id',
  authenticateToken,
  OBR_MetodoRecurrentePorId_CTS
);

router.post(
  '/pagos-metodos-recurrentes',
  authenticateToken,
  CR_PagosMetodosRecurrentes_CTS
);

router.put(
  '/pagos-metodos-recurrentes/:id',
  authenticateToken,
  UR_PagosMetodosRecurrentes_CTS
);

router.patch(
  '/pagos-metodos-recurrentes/:id/estado',
  authenticateToken,
  UR_EstadoMetodoRecurrente_CTS
);

// Benjamin Orellana - 2026/05/30 - Baja lógica del método recurrente, cambia estado a eliminado.
router.put(
  '/pagos-metodos-recurrentes/:id/desactivar',
  authenticateToken,
  DR_PagosMetodosRecurrentes_CTS
);

// Benjamin Orellana - 2026/05/30 - Eliminación física del método recurrente.
router.delete(
  '/pagos-metodos-recurrentes/:id',
  authenticateToken,
  ER_PagosMetodosRecurrentes_CTS
);

/*
 * =========================================================
 * PAGOS REGISTRO OPERATIVO
 * =========================================================
 */

router.post(
  '/pagos/registrar-operativo',
  authenticateToken,
  CR_RegistrarPagoOperativo_CTS
);

router.post(
  '/alumnos/:alumno_id/registrar-pago',
  authenticateToken,
  CR_RegistrarPagoOperativo_CTS
);

// Benjamin Orellana - 2026/06/15 - Renueva la membresía del alumno creando nuevo período, mensualidad y pago.
router.post(
  '/alumnos/:alumno_id/renovar-membresia',
  authenticateToken,
  CR_RenovarMembresiaOperativa_CTS
);

export default router;
