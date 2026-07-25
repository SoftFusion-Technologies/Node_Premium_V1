/*
 * Programador: Sergio Manrique
 * Fecha Creación: 23 / 06 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo contiene todas las rutas del módulo de Agenda.
 * Las rutas con prefijo /agenda-admin son exclusivas de gestión.
 * Las rutas con prefijo /agenda-alumno son exclusivas del portal alumno.
 *
 * Tema: Rutas - Agenda
 * Capa: Backend
 */

import express from 'express';

import { authenticateToken, requireRolGlobal } from '../Security/auth.js';
import { authenticateAlumnoToken } from '../Security/authAlumno.js';

import {
  OBRS_HorariosSede_CTS,
  OBRS_DetHorarioSede_CTS,
  CR_HorarioSede_CTS,
  UR_HorarioSede_CTS,
  UR_EstadoHorarioSede_CTS,
  ER_HorarioSede_CTS
} from '../Controllers/Agendas/CTS_TB_AgendaHorariosSede.js';

import {
  OBRS_Turnos_CTS,
  OBRS_TurnosAsistenciaDia_CTS,
  OBRS_AsistenciasRango_CTS,
  OBRS_HistorialCancelaciones_CTS,
  OBRS_DetTurno_CTS,
  CR_Turno_CTS,
  CR_TurnosMasivo_CTS,
  UR_Turno_CTS,
  UR_EstadoTurno_CTS,
  ER_Turno_CTS,
  ER_TurnosMasivo_CTS,
  OBRS_TurnosAlumno_CTS
} from '../Controllers/Agendas/CTS_TB_AgendaTurnos.js';

import {
  OBRS_ReservasTurno_CTS,
  OBRS_ClientesDisponiblesTurno_CTS,
  CR_ReservaAdmin_CTS,
  UR_AsistenciaAdmin_CTS,
  ER_ReservaAdmin_CTS,
  OBRS_MisReservas_CTS,
  CR_MiReserva_CTS,
  ER_MiReserva_CTS
} from '../Controllers/Agendas/CTS_TB_AgendaTurnosReservas.js';

import {
  OBRS_ListaEsperaTurno_CTS,
  ER_ListaEspera_CTS,
  OBRS_MiListaEspera_CTS,
  ER_MiListaEspera_CTS
} from '../Controllers/Agendas/CTS_TB_AgendaTurnosListaEspera.js';

export const ROLES_ADMIN = [
  'SUPER_ADMIN',
  'DIRECCION',
  'FRONT_COMERCIAL',
  'COORD_SEDE',
  'PROFESOR'
];

const router = express.Router();

// ─── ADMIN: Horarios sede (plantillas) ───────────────────────────────────────

/*
 * Sergio Manrique - 2026/06/23 - Lista todos los horarios de sede.
 * Query params opcionales: sede_id, activo
 */
router.get(
  '/agenda-admin/horarios',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  OBRS_HorariosSede_CTS
);

/*
 * Sergio Manrique - 2026/06/23 - Obtiene el detalle de un horario por ID.
 */
router.get(
  '/agenda-admin/horarios/:id',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  OBRS_DetHorarioSede_CTS
);

/*
 * Sergio Manrique - 2026/06/23 - Crea una nueva plantilla de horario.
 */
router.post(
  '/agenda-admin/horarios',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  CR_HorarioSede_CTS
);

/*
 * Sergio Manrique - 2026/06/23 - Actualiza una plantilla de horario.
 */
router.put(
  '/agenda-admin/horarios/:id',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  UR_HorarioSede_CTS
);

/*
 * Sergio Manrique - 2026/06/23 - Activa o desactiva una plantilla de horario.
 */
router.patch(
  '/agenda-admin/horarios/:id/toggle',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  UR_EstadoHorarioSede_CTS
);

/*
 * Sergio Manrique - 2026/06/23 - Elimina una plantilla de horario.
 */
router.delete(
  '/agenda-admin/horarios/:id',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  ER_HorarioSede_CTS
);

// ─── ADMIN: Turnos ────────────────────────────────────────────────────────────

/*
 * Sergio Manrique - 2026/06/23 - Lista turnos con filtros.
 * Query params opcionales: sede_id, fecha, estado, profesor_id, fecha_desde, fecha_hasta
 */
router.get(
  '/agenda-admin/turnos',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  OBRS_Turnos_CTS
);

/*
 * Sergio Manrique - 2026/07/05 - Turnos de un día (default hoy) en una sede,
 * con alumnos inscriptos y su estado de asistencia, para el panel rápido.
 * Query params: sede_id (requerido), fecha (opcional, default hoy).
 */
router.get(
  '/agenda-admin/turnos-asistencia',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  OBRS_TurnosAsistenciaDia_CTS
);

/*
 * Sergio Manrique - 2026/07/24 - Historial de asistencias en un rango de
 * fechas, en formato plano, para exportar a Excel.
 * Query params: sede_id, fecha_desde, fecha_hasta (todos requeridos).
 */
router.get(
  '/agenda-admin/asistencias-rango',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  OBRS_AsistenciasRango_CTS
);

/*
 * Benjamin Orellana - 2026/07/22 - Historial diario de cancelaciones.
 * Query params: sede_id (requerido), fecha (opcional, default hoy).
 */
router.get(
  '/agenda-admin/historial-cancelaciones',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  OBRS_HistorialCancelaciones_CTS
);

/*
 * Sergio Manrique - 2026/06/23 - Crea un turno individual.
 */
router.post(
  '/agenda-admin/turnos',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  CR_Turno_CTS
);

/*
 * Sergio Manrique - 2026/06/23 - Creación masiva de turnos desde payload compacto.
 */
router.post(
  '/agenda-admin/turnos/masivo',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  CR_TurnosMasivo_CTS
);

/*
 * Sergio Manrique - 2026/06/24 - Eliminación masiva de turnos por rango.
 * CRÍTICO: debe ir ANTES de /:id para que Express no capture "masivo" como parámetro.
 */
router.delete(
  '/agenda-admin/turnos/masivo',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  ER_TurnosMasivo_CTS
);

/*
 * Sergio Manrique - 2026/06/23 - Obtiene el detalle de un turno con sus reservas.
 */
router.get(
  '/agenda-admin/turnos/:id',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  OBRS_DetTurno_CTS
);

/*
 * Sergio Manrique - 2026/06/23 - Actualiza datos de un turno.
 */
router.put(
  '/agenda-admin/turnos/:id',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  UR_Turno_CTS
);

/*
 * Sergio Manrique - 2026/06/23 - Cambia el estado de un turno: disponible, bloqueado, cancelado.
 */
router.patch(
  '/agenda-admin/turnos/:id/estado',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  UR_EstadoTurno_CTS
);

/*
 * Sergio Manrique - 2026/06/23 - Elimina un turno individual y todas sus reservas (CASCADE).
 */
router.delete(
  '/agenda-admin/turnos/:id',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  ER_Turno_CTS
);

// ─── ADMIN: Reservas ──────────────────────────────────────────────────────────

/*
 * Sergio Manrique - 2026/06/23 - Lista las reservas de un turno específico.
 */
router.get(
  '/agenda-admin/turnos/:turno_id/reservas',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  OBRS_ReservasTurno_CTS
);

/*
 * Sergio Manrique - 2026/07/05 - Busca clientes de la sede de un turno para
 * el buscador de "Apuntar cliente", con si se pueden inscribir y por qué no.
 */
router.get(
  '/agenda-admin/turnos/:turno_id/clientes-disponibles',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  OBRS_ClientesDisponiblesTurno_CTS
);

/*
 * Sergio Manrique - 2026/06/23 - Admin inscribe manualmente a un alumno en un turno.
 */
router.post(
  '/agenda-admin/reservas',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  CR_ReservaAdmin_CTS
);

/*
 * Sergio Manrique - 2026/06/23 - Marca asistencia o ausencia de una reserva.
 */
router.patch(
  '/agenda-admin/reservas/:id/asistencia',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  UR_AsistenciaAdmin_CTS
);

/*
 * Sergio Manrique - 2026/06/23 - Admin cancela la reserva de un alumno sin restricción de tiempo.
 */
router.delete(
  '/agenda-admin/reservas/:id',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  ER_ReservaAdmin_CTS
);

// ─── ADMIN: Lista de espera ───────────────────────────────────────────────────

/*
 * Sergio Manrique - 2026/06/23 - Lista la lista de espera de un turno.
 */
router.get(
  '/agenda-admin/turnos/:turno_id/lista-espera',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  OBRS_ListaEsperaTurno_CTS
);

/*
 * Sergio Manrique - 2026/06/23 - Admin elimina a un alumno de la lista de espera.
 */
router.delete(
  '/agenda-admin/lista-espera/:id',
  authenticateToken,
  requireRolGlobal(ROLES_ADMIN),
  ER_ListaEspera_CTS
);

// ─── ALUMNO: Turnos disponibles ───────────────────────────────────────────────

/*
 * Sergio Manrique - 2026/06/23 - Lista los turnos disponibles para el alumno.
 * Query params opcionales: sede_id, fecha_desde, fecha_hasta
 */
router.get(
  '/agenda-alumno/turnos',
  authenticateAlumnoToken,
  OBRS_TurnosAlumno_CTS
);

// ─── ALUMNO: Mis reservas ─────────────────────────────────────────────────────

/*
 * Sergio Manrique - 2026/06/23 - Lista las reservas activas del alumno autenticado.
 */
router.get(
  '/agenda-alumno/mis-reservas',
  authenticateAlumnoToken,
  OBRS_MisReservas_CTS
);

/*
 * Sergio Manrique - 2026/06/23 - Alumno se inscribe a un turno.
 * Si está completo, lo agrega a lista de espera automáticamente.
 */
router.post(
  '/agenda-alumno/mis-reservas',
  authenticateAlumnoToken,
  CR_MiReserva_CTS
);

/*
 * Sergio Manrique - 2026/06/23 - Alumno cancela su reserva.
 * Valida tiempo mínimo de anticipación desde sistema_configuracion.
 */
router.delete(
  '/agenda-alumno/mis-reservas/:id',
  authenticateAlumnoToken,
  ER_MiReserva_CTS
);

// ─── ALUMNO: Mi lista de espera ───────────────────────────────────────────────

/*
 * Sergio Manrique - 2026/06/23 - Lista las entradas en lista de espera del alumno.
 */
router.get(
  '/agenda-alumno/mi-lista-espera',
  authenticateAlumnoToken,
  OBRS_MiListaEspera_CTS
);

/*
 * Sergio Manrique - 2026/06/23 - Alumno se quita de una lista de espera.
 */
router.delete(
  '/agenda-alumno/mi-lista-espera/:id',
  authenticateAlumnoToken,
  ER_MiListaEspera_CTS
);

export default router;
