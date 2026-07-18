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
import { authenticateToken, requirePermission } from '../Security/auth.js';
import { authenticateAlumnoToken } from '../Security/authAlumno.js';
import {
  requireFinancialScope,
  sourceBody,
  sourceParam,
  sourceQuery
} from '../Security/financialScope.js';

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
  OBR_MisMensualidades_CTS,
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
  OBR_MiHistorialPagos_CTS,
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
  OBR_MisMetodosRecurrentes_CTS,
  CR_PagosMetodosRecurrentes_CTS,
  CR_MiMetodoRecurrente_CTS,
  UR_PagosMetodosRecurrentes_CTS,
  UR_MiMetodoRecurrente_CTS,
  UR_EstadoMetodoRecurrente_CTS,
  UR_EstadoMiMetodoRecurrente_CTS,
  DR_PagosMetodosRecurrentes_CTS,
  ER_PagosMetodosRecurrentes_CTS
} from '../Controllers/Pago/CTS_TB_PagosMetodosRecurrentes.js';

import {
  CR_RegistrarPagoOperativo_CTS,
  CR_RenovarMembresiaOperativa_CTS
} from '../Controllers/Pago/CTS_TB_PagosRegistroOperativo.js';

const router = express.Router();
const seguridadPagosVer = [authenticateToken, requirePermission('pagos.ver')];
const seguridadPagosGestionar = [
  authenticateToken,
  requirePermission('pagos.gestionar')
];
const seguridadDeudasVer = [authenticateToken, requirePermission('deudas.ver')];
const seguridadDeudasGestionar = [
  authenticateToken,
  requirePermission('deudas.gestionar')
];
const seguridadMediosVer = [
  authenticateToken,
  requirePermission(['medios_pago.ver', 'cobros.registrar'])
];
const seguridadMediosConfigurar = [
  authenticateToken,
  requirePermission('medios_pago.configurar')
];

const alcanceLista = (permission) =>
  requireFinancialScope({
    sources: [sourceQuery('sede')],
    permission
  });
const alcanceAlumno = (permission) =>
  requireFinancialScope({
    sources: [sourceParam('alumno', 'alumno_id')],
    permission
  });
const alcanceMensualidad = (permission, key = 'id') =>
  requireFinancialScope({
    sources: [sourceParam('mensualidad', key)],
    permission
  });
const alcancePago = (permission) =>
  requireFinancialScope({
    sources: [sourceParam('pago')],
    permission
  });
const alcanceRecurrente = (permission) =>
  requireFinancialScope({
    sources: [sourceParam('metodo_recurrente')],
    permission
  });

/*
 * =========================================================
 * PORTAL DEL ALUMNO - CONSULTA Y MÉTODO DE PAGO PROPIO
 * =========================================================
 * El alumno_id siempre se obtiene del token ALUMNO. No se acepta por URL ni
 * por body, evitando que un alumno consulte o modifique información ajena.
 */

router.get(
  '/alumnos/perfil/mensualidades',
  authenticateAlumnoToken,
  OBR_MisMensualidades_CTS
);

router.get(
  '/alumnos/perfil/pagos-historial',
  authenticateAlumnoToken,
  OBR_MiHistorialPagos_CTS
);

router.get(
  '/alumnos/perfil/medios-pago/activos',
  authenticateAlumnoToken,
  OBR_MediosPagoActivos_CTS
);

router.get(
  '/alumnos/perfil/metodos-recurrentes',
  authenticateAlumnoToken,
  OBR_MisMetodosRecurrentes_CTS
);

router.post(
  '/alumnos/perfil/metodos-recurrentes',
  authenticateAlumnoToken,
  CR_MiMetodoRecurrente_CTS
);

router.put(
  '/alumnos/perfil/metodos-recurrentes/:id',
  authenticateAlumnoToken,
  UR_MiMetodoRecurrente_CTS
);

router.patch(
  '/alumnos/perfil/metodos-recurrentes/:id/estado',
  authenticateAlumnoToken,
  UR_EstadoMiMetodoRecurrente_CTS
);

/*
 * =========================================================
 * PAGOS MEDIOS DE PAGO
 * =========================================================
 */

router.get('/pagos-medios-pago', ...seguridadMediosVer, OBR_PagosMediosPago_CTS);

router.get(
  '/pagos-medios-pago/activos',
  ...seguridadMediosVer,
  OBR_MediosPagoActivos_CTS
);

router.get('/pagos-medios-pago/:id', ...seguridadMediosVer, OBR_MedioPagoPorId_CTS);

router.post('/pagos-medios-pago', ...seguridadMediosConfigurar, CR_PagosMediosPago_CTS);

router.put('/pagos-medios-pago/:id', ...seguridadMediosConfigurar, UR_PagosMediosPago_CTS);

router.patch(
  '/pagos-medios-pago/:id/estado',
  ...seguridadMediosConfigurar,
  UR_EstadoMedioPago_CTS
);

// Benjamin Orellana - 2026/05/29 - Baja lógica del medio de pago, mantiene el registro en la tabla.
router.put(
  '/pagos-medios-pago/:id/desactivar',
  ...seguridadMediosConfigurar,
  DR_PagosMediosPago_CTS
);

// Benjamin Orellana - 2026/05/29 - Eliminación física del medio de pago.
router.delete(
  '/pagos-medios-pago/:id',
  ...seguridadMediosConfigurar,
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
  ...seguridadPagosVer,
  alcanceLista('pagos.ver'),
  OBR_PagosMensualidades_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Lista mensualidades pendientes o parciales con saldo.
 */
router.get(
  '/pagos-mensualidades/pendientes',
  ...seguridadDeudasVer,
  alcanceLista('deudas.ver'),
  OBR_MensualidadesPendientes_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Lista mensualidades vencidas o con vencimiento superado.
 */
router.get(
  '/pagos-mensualidades/vencidas',
  ...seguridadDeudasVer,
  alcanceLista('deudas.ver'),
  OBR_MensualidadesVencidas_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Lista alumnos morosos según mensualidades vencidas con saldo.
 */
router.get(
  '/pagos-mensualidades/morosos',
  ...seguridadDeudasVer,
  alcanceLista('deudas.ver'),
  OBR_AlumnosMorosos_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Lista mensualidades de un alumno específico.
 */
router.get(
  '/alumnos/:alumno_id/mensualidades',
  ...seguridadPagosVer,
  alcanceAlumno('pagos.ver'),
  OBR_MensualidadesPorAlumno_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Obtiene una mensualidad por ID.
 */
router.get(
  '/pagos-mensualidades/:id',
  ...seguridadPagosVer,
  alcanceMensualidad('pagos.ver'),
  OBR_MensualidadPorId_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Crea una mensualidad manual.
 */
router.post(
  '/pagos-mensualidades',
  ...seguridadDeudasGestionar,
  requireFinancialScope({
    sources: [
      sourceBody('sede'),
      sourceBody('alumno', 'alumno_id'),
      sourceBody('membresia', 'membresia_id')
    ],
    permission: 'deudas.gestionar'
  }),
  CR_PagosMensualidades_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Genera una mensualidad desde una membresía existente.
 */
router.post(
  '/pagos-mensualidades/generar-desde-membresia/:membresia_id',
  ...seguridadDeudasGestionar,
  requireFinancialScope({
    sources: [sourceParam('membresia', 'membresia_id')],
    permission: 'deudas.gestionar'
  }),
  CR_GenerarMensualidadDesdeMembresia_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Actualiza una mensualidad existente.
 */
router.put(
  '/pagos-mensualidades/:id',
  ...seguridadDeudasGestionar,
  requireFinancialScope({
    sources: [
      sourceParam('mensualidad'),
      sourceBody('sede'),
      sourceBody('alumno', 'alumno_id'),
      sourceBody('membresia', 'membresia_id')
    ],
    permission: 'deudas.gestionar'
  }),
  UR_PagosMensualidades_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Actualiza manualmente el estado de una mensualidad.
 */
router.patch(
  '/pagos-mensualidades/:id/estado',
  ...seguridadDeudasGestionar,
  alcanceMensualidad('deudas.gestionar'),
  UR_EstadoMensualidad_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Marca una mensualidad como vencida.
 */
router.patch(
  '/pagos-mensualidades/:id/vencida',
  ...seguridadDeudasGestionar,
  alcanceMensualidad('deudas.gestionar'),
  UR_MarcarMensualidadVencida_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Anula una mensualidad mediante baja lógica.
 */
router.put(
  '/pagos-mensualidades/:id/anular',
  ...seguridadDeudasGestionar,
  alcanceMensualidad('deudas.gestionar'),
  DR_PagosMensualidades_CTS
);

/*
 * Benjamin Orellana - 2026/06/07 - Elimina físicamente una mensualidad.
 */
router.delete(
  '/pagos-mensualidades/:id',
  ...seguridadDeudasGestionar,
  alcanceMensualidad('deudas.gestionar'),
  ER_PagosMensualidades_CTS
);

/*
 * =========================================================
 * PAGOS
 * =========================================================
 */

router.get('/pagos', ...seguridadPagosVer, alcanceLista('pagos.ver'), OBR_Pagos_CTS);

router.get('/pagos/:id', ...seguridadPagosVer, alcancePago('pagos.ver'), OBR_PagoPorId_CTS);

router.get(
  '/alumnos/:alumno_id/pagos',
  ...seguridadPagosVer,
  alcanceAlumno('pagos.ver'),
  OBR_PagosPorAlumno_CTS
);

router.get(
  '/alumnos/:alumno_id/pagos-historial',
  ...seguridadPagosVer,
  alcanceAlumno('pagos.ver'),
  OBR_HistorialPagosAlumno_CTS
);

router.get(
  '/pagos-mensualidades/:mensualidad_id/pagos',
  ...seguridadPagosVer,
  alcanceMensualidad('pagos.ver', 'mensualidad_id'),
  OBR_PagosPorMensualidad_CTS
);

router.post(
  '/pagos',
  ...seguridadPagosGestionar,
  requireFinancialScope({
    sources: [
      sourceBody('sede'),
      sourceBody('alumno', 'alumno_id'),
      sourceBody('mensualidad', 'mensualidad_id')
    ],
    permission: 'pagos.gestionar'
  }),
  CR_Pagos_CTS
);

router.put(
  '/pagos/:id',
  ...seguridadPagosGestionar,
  requireFinancialScope({
    sources: [
      sourceParam('pago'),
      sourceBody('sede'),
      sourceBody('alumno', 'alumno_id'),
      sourceBody('mensualidad', 'mensualidad_id')
    ],
    permission: 'pagos.gestionar'
  }),
  UR_Pagos_CTS
);

router.put('/pagos/:id/confirmar', ...seguridadPagosGestionar, alcancePago('pagos.gestionar'), UR_ConfirmarPago_CTS);

router.put('/pagos/:id/rechazar', ...seguridadPagosGestionar, alcancePago('pagos.gestionar'), UR_RechazarPago_CTS);

router.put('/pagos/:id/anular', ...seguridadPagosGestionar, alcancePago('pagos.gestionar'), UR_AnularPago_CTS);

// Benjamin Orellana - 2026/05/30 - Baja lógica del pago, cambia estado a anulado.
router.put('/pagos/:id/desactivar', ...seguridadPagosGestionar, alcancePago('pagos.gestionar'), DR_Pagos_CTS);

// Benjamin Orellana - 2026/05/30 - Eliminación física del pago.
router.delete('/pagos/:id', ...seguridadPagosGestionar, alcancePago('pagos.gestionar'), ER_Pagos_CTS);

/*
 * =========================================================
 * PAGOS MÉTODOS RECURRENTES
 * =========================================================
 */

router.get(
  '/pagos-metodos-recurrentes',
  ...seguridadPagosVer,
  alcanceLista('pagos.ver'),
  OBR_PagosMetodosRecurrentes_CTS
);

router.get(
  '/alumnos/:alumno_id/metodos-recurrentes',
  ...seguridadPagosVer,
  alcanceAlumno('pagos.ver'),
  OBR_MetodosRecurrentesPorAlumno_CTS
);

router.get(
  '/pagos-metodos-recurrentes/:id',
  ...seguridadPagosVer,
  alcanceRecurrente('pagos.ver'),
  OBR_MetodoRecurrentePorId_CTS
);

router.post(
  '/pagos-metodos-recurrentes',
  ...seguridadPagosGestionar,
  requireFinancialScope({
    sources: [sourceBody('alumno', 'alumno_id')],
    permission: 'pagos.gestionar'
  }),
  CR_PagosMetodosRecurrentes_CTS
);

router.put(
  '/pagos-metodos-recurrentes/:id',
  ...seguridadPagosGestionar,
  requireFinancialScope({
    sources: [
      sourceParam('metodo_recurrente'),
      sourceBody('alumno', 'alumno_id')
    ],
    permission: 'pagos.gestionar'
  }),
  UR_PagosMetodosRecurrentes_CTS
);

router.patch(
  '/pagos-metodos-recurrentes/:id/estado',
  ...seguridadPagosGestionar,
  alcanceRecurrente('pagos.gestionar'),
  UR_EstadoMetodoRecurrente_CTS
);

// Benjamin Orellana - 2026/05/30 - Baja lógica del método recurrente, cambia estado a eliminado.
router.put(
  '/pagos-metodos-recurrentes/:id/desactivar',
  ...seguridadPagosGestionar,
  alcanceRecurrente('pagos.gestionar'),
  DR_PagosMetodosRecurrentes_CTS
);

// Benjamin Orellana - 2026/05/30 - Eliminación física del método recurrente.
router.delete(
  '/pagos-metodos-recurrentes/:id',
  ...seguridadPagosGestionar,
  alcanceRecurrente('pagos.gestionar'),
  ER_PagosMetodosRecurrentes_CTS
);

/*
 * =========================================================
 * PAGOS REGISTRO OPERATIVO
 * =========================================================
 */

router.post(
  '/pagos/registrar-operativo',
  ...seguridadPagosGestionar,
  requireFinancialScope({
    sources: [
      sourceBody('sede'),
      sourceBody('alumno', 'alumno_id'),
      sourceBody('mensualidad', 'mensualidad_id')
    ],
    permission: 'pagos.gestionar'
  }),
  CR_RegistrarPagoOperativo_CTS
);

router.post(
  '/alumnos/:alumno_id/registrar-pago',
  ...seguridadPagosGestionar,
  requireFinancialScope({
    sources: [
      sourceParam('alumno', 'alumno_id'),
      sourceBody('sede'),
      sourceBody('mensualidad', 'mensualidad_id')
    ],
    permission: 'pagos.gestionar'
  }),
  CR_RegistrarPagoOperativo_CTS
);

// Benjamin Orellana - 2026/06/15 - Renueva la membresía del alumno creando nuevo período, mensualidad y pago.
router.post(
  '/alumnos/:alumno_id/renovar-membresia',
  ...seguridadPagosGestionar,
  requireFinancialScope({
    sources: [sourceParam('alumno', 'alumno_id'), sourceBody('sede')],
    permission: 'pagos.gestionar'
  }),
  CR_RenovarMembresiaOperativa_CTS
);

export default router;
