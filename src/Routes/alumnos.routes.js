/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 25 / 04 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (alumnos.routes.js) contiene las rutas del módulo de Alumnos:
 * datos principales, contactos de emergencia, anamnesis (+ historial),
 * membresías y operaciones administrativas sobre planes/pagos del alumno.
 *
 * Tema: Rutas - Alumnos
 *
 * Capa: Backend
 */

import express from "express";

// Benjamin Orellana - 2026/05/10 - Importa middlewares de seguridad para proteger rutas PREMIUM.
import {
  authenticateToken,
  requirePermission,
  requireRolGlobal,
} from "../Security/auth.js";
import { authenticateAlumnoToken } from "../Security/authAlumno.js";
import {
  requireFinancialScope,
  sourceBody,
  sourceParam,
  sourceQuery,
} from "../Security/financialScope.js";

// Benjamin Orellana - 2026/05/26 - Importa controlador principal de alumnos PREMIUM.
import {
  OBR_Alumnos_CTS,
  OBR_AlumnosSelectorCobro_CTS,
  OBR_AlumnoPorDni_CTS,
  OBR_AlumnoPerfil_CTS,
  CR_Alumnos_CTS,
  CR_Alumnos_Publico_CTS,
  UR_Alumnos_CTS,
  UR_ActualizacionRapidaAlumno_CTS,
  UR_ActualizacionMasivaAlumnos_CTS,
  UR_EstadoAlumnos_CTS,
  UR_AlumnoPerfil_CTS,
  UR_BajaAlumnos_CTS,
  UR_CongelarAlumnos_CTS,
  UR_ReactivarAlumnos_CTS,
  UR_HabilitarAccesoAlumno_CTS,
  OBR_AccesoAlumno_CTS,
  UR_DesbloquearAccesoAlumno_CTS,
  UR_RestablecerPasswordAccesoAlumno_CTS,
  OBR_PreviewEliminacionAlumno_CTS,
  DR_Alumnos_CTS,
} from "../Controllers/Alumno/CTS_TB_Alumnos.js";

// Benjamin Orellana - 2026/05/26 - Importa controlador de contactos de emergencia de alumnos PREMIUM.
import {
  OBR_AlumnosContactosEmergencia_CTS,
  OBR_ContactosEmergenciaPorAlumno_CTS,
  OBR_MisContactosEmergencia_CTS,
  OBR_ContactoEmergenciaPorId_CTS,
  CR_AlumnosContactosEmergencia_CTS,
  CR_MiContactoEmergencia_CTS,
  UR_AlumnosContactosEmergencia_CTS,
  UR_MiContactoEmergencia_CTS,
  UR_PrincipalContactoEmergencia_CTS,
  UR_MiPrincipalContactoEmergencia_CTS,
  DR_AlumnosContactosEmergencia_CTS,
  DR_MiContactoEmergencia_CTS,
} from "../Controllers/Alumno/CTS_TB_AlumnosContactosEmergencia.js";

// Benjamin Orellana - 2026/05/26 - Importa controlador de anamnesis de alumnos PREMIUM.
import {
  OBR_AlumnosAnamnesis_CTS,
  OBR_AnamnesisPorAlumno_CTS,
  OBR_AnamnesisActualPorAlumno_CTS,
  OBR_AnamnesisPorId_CTS,
  OBR_MisAnamnesis_CTS,
  OBR_MiAnamnesisActual_CTS,
  CR_AlumnosAnamnesis_CTS,
  CR_MiAnamnesis_CTS,
  UR_AlumnosAnamnesis_CTS,
  UR_MiAnamnesis_CTS,
  UR_RevisarAlumnosAnamnesis_CTS,
  DR_AlumnosAnamnesis_CTS,
} from "../Controllers/Alumno/CTS_TB_AlumnosAnamnesis.js";

import {
  OBRS_HistorialAnamnesis_CTS,
  OBRS_HistorialAnamnesisAlumno_CTS,
  OBRS_DetalleHistorialAnamnesis_CTS,
  OBRS_MiHistorialAnamnesis_CTS,
} from "../Controllers/Alumno/CTS_TB_AlumnosAnamnesisHistorial.js";

import {
  OBR_AlumnosMembresias_CTS,
  OBR_MembresiaPorId_CTS,
  OBR_MembresiasPorAlumno_CTS,
  OBR_MisMembresias_CTS,
  OBR_MembresiaActivaAlumno_CTS,
  CR_AlumnosMembresias_CTS,
  UR_AlumnosMembresias_CTS,
  UR_EstadoMembresia_CTS,
  UR_CongelarMembresia_CTS,
  UR_ReactivarMembresia_CTS,
  DR_AlumnosMembresias_CTS,
  ER_AlumnosMembresias_CTS,
} from "../Controllers/Alumno/CTS_TB_AlumnosMembresias.js";

import {
  OBRS_AsistenciasAlumno_CTS,
  OBRS_EstadisticasAsistenciaAlumno_CTS,
  OBRS_MisAsistencias_CTS,
  OBRS_MisEstadisticasAsistencia_CTS,
  OBRS_AlumnosInactivos_CTS,
  CR_AsistenciaManualAlumno_CTS,
  UR_JustificarAusenciaAlumno_CTS,
} from "../Controllers/Alumno/CTS_TB_AlumnosAsistencias.js";

import {
  OBR_ContextoOperacionesMembresiaAlumnoPlanesPagos_CTS,
  OBR_VencimientosAlumnoPlanesPagos_CTS,
  CR_GenerarMembresiaAlumnoPlanesPagos_CTS,
  CR_MembresiaMigracionAlumnoPlanesPagos_CTS,
  UR_MembresiaMigracionAlumnoPlanesPagos_CTS,
  CR_MarcarDeudaAlumnoPlanesPagos_CTS,
  UR_CongelarMembresiaAlumnoPlanesPagos_CTS,
  UR_ReactivarMembresiaAlumnoPlanesPagos_CTS,
  UR_RegistrarBajaAlumnoPlanesPagos_CTS,
  CR_ReingresarAlumnoPlanesPagos_CTS,
  UR_CambiarSedeAlumnoPlanesPagos_CTS,
  UR_CambiarPlanAlumnoPlanesPagos_CTS,
} from "../Controllers/Alumno/CTS_TB_AlumnosPlanesPagosOperaciones.js";

import {
  OBR_SaldoAlumno_CTS,
  CR_BonificacionAlumno_CTS,
} from "../Controllers/Alumno/CTS_TB_AlumnosSaldos.js";

import {
  OBR_DeudasFinanzas_CTS,
  OBR_SaldosFinanzas_CTS,
} from "../Controllers/Finanzas/CTS_TB_FinanzasDeudasSaldos.js";

const router = express.Router();

const alcanceAlumno = (permission) =>
  requireFinancialScope({
    sources: [sourceParam("alumno", "alumno_id")],
    permission,
  });

// Benjamin Orellana - 2026/08/07 - Alcance operativo sin habilitar finanzas.
// Se usa para consultar membresías desde la ficha del alumno respetando sede.
const alcanceAlumnoOperativo = requireFinancialScope({
  sources: [sourceParam("alumno", "alumno_id")],
  requireFinanzas: false,
});

const alcanceMembresiaOperativo = requireFinancialScope({
  sources: [sourceParam("membresia", "id")],
  requireFinanzas: false,
});

const alcanceSedeOperativo = requireFinancialScope({
  sources: [sourceBody("sede")],
  requireFinanzas: false,
});

// Benjamin Orellana - 2026/07/17 - Consolidados financieros de deuda y saldo.
router.get(
  "/finanzas/deudas",
  authenticateToken,
  requirePermission("deudas.ver"),
  requireFinancialScope({
    sources: [sourceQuery("sede")],
    permission: "deudas.ver",
  }),
  OBR_DeudasFinanzas_CTS,
);

router.get(
  "/finanzas/saldos",
  authenticateToken,
  requirePermission("saldos.ver"),
  requireFinancialScope({
    sources: [sourceQuery("sede")],
    permission: "saldos.ver",
  }),
  OBR_SaldosFinanzas_CTS,
);

/*
 * =========================================================
 * ALUMNOS
 * =========================================================
 */

/*
 * Benjamin Orellana - 2026/05/26 - Obtiene perfil del alumno autenticado desde portal/app.
 */
router.get("/alumnos/perfil", authenticateAlumnoToken, OBR_AlumnoPerfil_CTS);
// Sergio Gustavo Manrique - 2026/06/11 - Actualiza datos personales del alumno autenticado
router.patch("/alumnos/perfil", authenticateAlumnoToken, UR_AlumnoPerfil_CTS);

/*
 * Benjamin Orellana - 2026/07/13 - Historial y estadísticas propias para el
 * portal. El controlador obtiene el alumno_id exclusivamente desde el token.
 */
router.get(
  "/alumnos/perfil/asistencias",
  authenticateAlumnoToken,
  OBRS_MisAsistencias_CTS,
);

router.get(
  "/alumnos/perfil/asistencias/estadisticas",
  authenticateAlumnoToken,
  OBRS_MisEstadisticasAsistencia_CTS,
);

router.get(
  "/alumnos/perfil/membresias",
  authenticateAlumnoToken,
  OBR_MisMembresias_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Lista alumnos con filtros, búsqueda y paginación.
 */
router.get(
  "/alumnos",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
    "PROFESOR",
  ]),
  OBR_Alumnos_CTS,
);

/*
 * Benjamin Orellana - 2026/07/13 - Lista liviana de alumnos para el selector
 * operativo del drawer Nuevo Cobro.
 */
router.get(
  "/alumnos/cobros/clientes",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
    "PROFESOR",
  ]),
  OBR_AlumnosSelectorCobro_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Obtiene un alumno por DNI.
 */
router.get(
  "/alumnos/:dni",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
    "PROFESOR",
  ]),
  OBR_AlumnoPorDni_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Crea un alumno desde el panel interno.
 */
router.post(
  "/alumnos",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
  ]),
  CR_Alumnos_CTS,
);

/*
 * Sergio Manrique - 2026/06/01 - Crea un alumno desde el panel externo .
 */
router.post("/alumnos/registro-publico", CR_Alumnos_Publico_CTS);

/*
 * Benjamin Orellana - 2026/05/26 - Actualiza datos principales de un alumno.
 */
router.put(
  "/alumnos/:id",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
  ]),
  UR_Alumnos_CTS,
);


/*
 * Benjamin Orellana - 2026/07/30 - Edición rápida de sede y estado desde
 * el listado principal de alumnos.
 */
router.patch(
  "/alumnos/:id/actualizacion-rapida",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
  ]),
  UR_ActualizacionRapidaAlumno_CTS,
);

/*
 * Benjamin Orellana - 2026/07/30 - Edición rápida masiva para migraciones.
 */
router.patch(
  "/alumnos/actualizacion-masiva",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
  ]),
  UR_ActualizacionMasivaAlumnos_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Cambia estado operativo de un alumno.
 */
router.patch(
  "/alumnos/:id/estado",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
  ]),
  UR_EstadoAlumnos_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Registra baja de un alumno.
 */
router.patch(
  "/alumnos/:id/baja",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
  ]),
  UR_BajaAlumnos_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Congela alumno.
 */
router.patch(
  "/alumnos/:id/congelar",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
  ]),
  UR_CongelarAlumnos_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Reactiva alumno.
 */
router.patch(
  "/alumnos/:id/reactivar",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
  ]),
  UR_ReactivarAlumnos_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Habilita acceso web/app para alumno.
 */
router.patch(
  "/alumnos/:id/habilitar-acceso",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
  ]),
  UR_HabilitarAccesoAlumno_CTS,
);

/*
 * Benjamin Orellana - 2026/08/02 - Consulta y administra el acceso al portal
 * del alumno. SUPER_ADMIN y COORD_SEDE pueden operar; el controlador
 * valida que el alumno pertenezca a una sede autorizada para el usuario.
 */
router.get(
  "/alumnos/:id/acceso",
  authenticateToken,
  requireRolGlobal(["SUPER_ADMIN", "COORD_SEDE"]),
  OBR_AccesoAlumno_CTS,
);

router.patch(
  "/alumnos/:id/acceso/desbloquear",
  authenticateToken,
  requireRolGlobal(["SUPER_ADMIN", "COORD_SEDE"]),
  UR_DesbloquearAccesoAlumno_CTS,
);

router.patch(
  "/alumnos/:id/acceso/restablecer-password",
  authenticateToken,
  requireRolGlobal(["SUPER_ADMIN", "COORD_SEDE"]),
  UR_RestablecerPasswordAccesoAlumno_CTS,
);

/*
 * Benjamin Orellana - 2026/08/01 - Informa qué registros serán eliminados.
 * La eliminación física queda reservada exclusivamente a SUPER_ADMIN.
 */
router.get(
  "/alumnos/:id/eliminacion-preview",
  authenticateToken,
  requireRolGlobal(["SUPER_ADMIN"]),
  OBR_PreviewEliminacionAlumno_CTS,
);

/*
 * Benjamin Orellana - 2026/08/01 - Elimina físicamente al alumno luego de
 * validar nuevamente sus relaciones y confirmar el DNI.
 */
router.delete(
  "/alumnos/:id",
  authenticateToken,
  requireRolGlobal(["SUPER_ADMIN"]),
  DR_Alumnos_CTS,
);

/*
 * =========================================================
 * ALUMNOS CONTACTOS DE EMERGENCIA
 * =========================================================
 */

/*
 * Benjamin Orellana - 2026/05/26 - Lista contactos de emergencia desde panel interno.
 */
router.get(
  "/alumnos-contactos-emergencia",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
    "PROFESOR",
  ]),
  OBR_AlumnosContactosEmergencia_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Lista contactos de emergencia del alumno autenticado.
 */
router.get(
  "/alumnos/perfil/contactos-emergencia",
  authenticateAlumnoToken,
  OBR_MisContactosEmergencia_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Lista contactos de emergencia de un alumno.
 */
router.get(
  "/alumnos/:alumno_id/contactos-emergencia",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
    "PROFESOR",
  ]),
  OBR_ContactosEmergenciaPorAlumno_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Obtiene un contacto de emergencia por ID.
 */
router.get(
  "/alumnos-contactos-emergencia/:id",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
    "PROFESOR",
  ]),
  OBR_ContactoEmergenciaPorId_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Crea contacto de emergencia desde portal alumno.
 */
router.post(
  "/alumnos/perfil/contactos-emergencia",
  authenticateAlumnoToken,
  CR_MiContactoEmergencia_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Crea contacto de emergencia desde panel interno.
 */
router.post(
  "/alumnos/:alumno_id/contactos-emergencia",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
  ]),
  CR_AlumnosContactosEmergencia_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Actualiza contacto de emergencia desde panel interno.
 */
router.put(
  "/alumnos-contactos-emergencia/:id",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
  ]),
  UR_AlumnosContactosEmergencia_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Actualiza contacto de emergencia desde portal alumno.
 */
router.put(
  "/alumnos/perfil/contactos-emergencia/:id",
  authenticateAlumnoToken,
  UR_MiContactoEmergencia_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Marca contacto principal desde panel interno.
 */
router.patch(
  "/alumnos-contactos-emergencia/:id/principal",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
  ]),
  UR_PrincipalContactoEmergencia_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Marca contacto principal desde portal alumno.
 */
router.patch(
  "/alumnos/perfil/contactos-emergencia/:id/principal",
  authenticateAlumnoToken,
  UR_MiPrincipalContactoEmergencia_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Elimina contacto de emergencia desde panel interno.
 */
router.delete(
  "/alumnos-contactos-emergencia/:id",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
  ]),
  DR_AlumnosContactosEmergencia_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Elimina contacto de emergencia desde portal alumno.
 */
router.delete(
  "/alumnos/perfil/contactos-emergencia/:id",
  authenticateAlumnoToken,
  DR_MiContactoEmergencia_CTS,
);

/*
 * =========================================================
 * ALUMNOS ANAMNESIS
 * =========================================================
 */

/*
 * Benjamin Orellana - 2026/05/26 - Lista anamnesis desde panel interno.
 */
router.get(
  "/alumnos-anamnesis",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
    "PROFESOR",
  ]),
  OBR_AlumnosAnamnesis_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Lista mis anamnesis desde portal alumno.
 */
router.get(
  "/alumnos/perfil/anamnesis",
  authenticateAlumnoToken,
  OBR_MisAnamnesis_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Obtiene mi última anamnesis desde portal alumno.
 */
router.get(
  "/alumnos/perfil/anamnesis/actual",
  authenticateAlumnoToken,
  OBR_MiAnamnesisActual_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Crea anamnesis desde portal alumno.
 */
router.post(
  "/alumnos/perfil/anamnesis",
  authenticateAlumnoToken,
  CR_MiAnamnesis_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Lista anamnesis de un alumno.
 */
router.get(
  "/alumnos/:alumno_id/anamnesis",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
    "PROFESOR",
  ]),
  OBR_AnamnesisPorAlumno_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Obtiene la última anamnesis de un alumno.
 */
router.get(
  "/alumnos/:alumno_id/anamnesis/actual",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
    "PROFESOR",
  ]),
  OBR_AnamnesisActualPorAlumno_CTS,
);

/*
 * Sergio Manrique - 2026/07/08 - Historial de asistencias de un alumno.
 */
router.get(
  "/alumnos/:alumno_id/asistencias",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
    "PROFESOR",
  ]),
  OBRS_AsistenciasAlumno_CTS,
);

/*
 * Sergio Manrique - 2026/07/12 - Estadísticas de asistencia de un alumno
 * (calculadas en backend), incluye alerta de inactividad.
 */
router.get(
  "/alumnos/:alumno_id/asistencias/estadisticas",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
    "PROFESOR",
  ]),
  OBRS_EstadisticasAsistenciaAlumno_CTS,
);

router.post(
  "/alumnos/:alumno_id/asistencias/manual",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
    "PROFESOR",
  ]),
  CR_AsistenciaManualAlumno_CTS,
);

router.patch(
  "/alumnos/:alumno_id/asistencias/:asistencia_id/justificar",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
    "PROFESOR",
  ]),
  UR_JustificarAusenciaAlumno_CTS,
);

/*
 * Sergio Manrique - 2026/07/12 - Listado de alumnos activos inactivos
 * (sin asistencia hace más de N días). Base para un futuro panel de alertas.
 */
router.get(
  "/alumnos-asistencias/inactivos",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
  ]),
  OBRS_AlumnosInactivos_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Obtiene anamnesis por ID.
 */
router.get(
  "/alumnos-anamnesis/:id",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
    "PROFESOR",
  ]),
  OBR_AnamnesisPorId_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Crea anamnesis desde panel interno.
 */
router.post(
  "/alumnos/:alumno_id/anamnesis",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
  ]),
  CR_AlumnosAnamnesis_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Actualiza anamnesis desde panel interno.
 */
router.put(
  "/alumnos-anamnesis/:id",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
    "PROFESOR",
  ]),
  UR_AlumnosAnamnesis_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Actualiza anamnesis propia desde portal alumno.
 */
router.put(
  "/alumnos/perfil/anamnesis/:id",
  authenticateAlumnoToken,
  UR_MiAnamnesis_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Revisa anamnesis desde panel interno/profesor.
 */
router.patch(
  "/alumnos-anamnesis/:id/revisar",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
    "PROFESOR",
  ]),
  UR_RevisarAlumnosAnamnesis_CTS,
);

/*
 * Benjamin Orellana - 2026/05/26 - Elimina anamnesis desde panel interno.
 */
router.delete(
  "/alumnos-anamnesis/:id",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
  ]),
  DR_AlumnosAnamnesis_CTS,
);

/*
 * Sergio Manrique - 2026/06/03 - Lista todo el historial de anamnesis de un alumno.
 */
router.get(
  "/alumnos-admin/:alumno_id/anamnesis/historial",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
    "PROFESOR",
  ]),
  OBRS_HistorialAnamnesisAlumno_CTS,
);

/*
 * Sergio Manrique - 2026/06/03 - Lista versiones históricas de una anamnesis específica.
 */
router.get(
  "/alumnos-admin-anamnesis/:anamnesis_id/historial",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
    "PROFESOR",
  ]),
  OBRS_HistorialAnamnesis_CTS,
);

/*
 * Sergio Manrique - 2026/06/03 - Obtiene el detalle de una versión histórica por ID.
 */
router.get(
  "/alumnos-admin-anamnesis/historial/:id",
  authenticateToken,
  requireRolGlobal([
    "SUPER_ADMIN",
    "DIRECCION",
    "FRONT_COMERCIAL",
    "COORD_SEDE",
    "PROFESOR",
  ]),
  OBRS_DetalleHistorialAnamnesis_CTS,
);

/*
 * Sergio Manrique - 2026/06/16 - Historial de anamnesis del alumno autenticado.
 */
router.get(
  "/alumnos-alumnos/anamnesis/historial",
  authenticateAlumnoToken,
  OBRS_MiHistorialAnamnesis_CTS,
);

/*
 * =========================================================
 * ALUMNOS MEMBRESÍAS
 * =========================================================
 */

router.get(
  "/alumnos-membresias",
  authenticateToken,
  requirePermission("pagos.ver"),
  OBR_AlumnosMembresias_CTS,
);

router.get(
  "/alumnos-membresias/:id",
  authenticateToken,
  alcanceMembresiaOperativo,
  OBR_MembresiaPorId_CTS,
);

router.get(
  "/alumnos/:alumno_id/membresias",
  authenticateToken,
  alcanceAlumnoOperativo,
  OBR_MembresiasPorAlumno_CTS,
);

router.get(
  "/alumnos/:alumno_id/membresia-activa",
  authenticateToken,
  alcanceAlumnoOperativo,
  OBR_MembresiaActivaAlumno_CTS,
);

router.post(
  "/alumnos-membresias",
  authenticateToken,
  requirePermission("pagos.gestionar"),
  alcanceSedeOperativo,
  CR_AlumnosMembresias_CTS,
);

router.put(
  "/alumnos-membresias/:id",
  authenticateToken,
  requirePermission("pagos.gestionar"),
  alcanceMembresiaOperativo,
  UR_AlumnosMembresias_CTS,
);

router.patch(
  "/alumnos-membresias/:id/estado",
  authenticateToken,
  requirePermission("pagos.gestionar"),
  alcanceMembresiaOperativo,
  UR_EstadoMembresia_CTS,
);

router.put(
  "/alumnos-membresias/:id/congelar",
  authenticateToken,
  requirePermission("pagos.gestionar"),
  alcanceMembresiaOperativo,
  UR_CongelarMembresia_CTS,
);

router.put(
  "/alumnos-membresias/:id/reactivar",
  authenticateToken,
  requirePermission("pagos.gestionar"),
  alcanceMembresiaOperativo,
  UR_ReactivarMembresia_CTS,
);

// Benjamin Orellana - 2026/05/29 - Baja lógica de membresía, cambia estado a cancelada.
router.put(
  "/alumnos-membresias/:id/desactivar",
  authenticateToken,
  requirePermission("pagos.gestionar"),
  alcanceMembresiaOperativo,
  DR_AlumnosMembresias_CTS,
);

// Benjamin Orellana - 2026/05/29 - Eliminación física de membresía.
router.delete(
  "/alumnos-membresias/:id",
  authenticateToken,
  requirePermission("pagos.gestionar"),
  alcanceMembresiaOperativo,
  ER_AlumnosMembresias_CTS,
);

/*
 * =========================================================
 * ALUMNOS PLANES PAGOS OPERACIONES
 * =========================================================
 */

// Benjamin Orellana - 2026/06/15 - Consulta operativa de vencimientos del alumno.
router.get(
  "/alumnos/:alumno_id/vencimientos",
  authenticateToken,
  requirePermission("pagos.ver"),
  alcanceAlumno("pagos.ver"),
  OBR_VencimientosAlumnoPlanesPagos_CTS,
);

// Benjamin Orellana - 2026/06/30 - Genera membresía administrativa con mensualidad pendiente desde ficha del alumno.
router.post(
  "/alumnos/:alumno_id/generar-membresia",
  authenticateToken,
  requirePermission("pagos.gestionar"),
  requireFinancialScope({
    sources: [sourceParam("alumno", "alumno_id"), sourceBody("sede")],
    permission: "pagos.gestionar",
  }),
  CR_GenerarMembresiaAlumnoPlanesPagos_CTS,
);

// Benjamin Orellana - 2026/08/01 - Carga manual de plan, fechas y créditos durante la migración.
router.post(
  "/alumnos/:alumno_id/membresia-migracion",
  authenticateToken,
  requireRolGlobal(["SUPER_ADMIN"]),
  requirePermission("pagos.gestionar"),
  requireFinancialScope({
    sources: [sourceParam("alumno", "alumno_id"), sourceBody("sede")],
    permission: "pagos.gestionar",
  }),
  CR_MembresiaMigracionAlumnoPlanesPagos_CTS,
);

// Benjamin Orellana - 2026/08/01 - Corrige una membresía existente preservando su trazabilidad.
router.patch(
  "/alumnos/:alumno_id/membresia-migracion/:membresia_id",
  authenticateToken,
  UR_MembresiaMigracionAlumnoPlanesPagos_CTS,
);

// Benjamin Orellana - 2026/06/15 - Marca deuda manual desde ficha del alumno.
router.post(
  "/alumnos/:alumno_id/marcar-deuda",
  authenticateToken,
  requirePermission("deudas.gestionar"),
  requireFinancialScope({
    sources: [
      sourceParam("alumno", "alumno_id"),
      sourceBody("mensualidad", "mensualidad_id"),
    ],
    permission: "deudas.gestionar",
  }),
  CR_MarcarDeudaAlumnoPlanesPagos_CTS,
);

// Benjamin Orellana - 2026/06/15 - Aplica bonificación administrativa desde ficha del alumno.
router.post(
  "/alumnos/:alumno_id/agregar-bonificacion",
  authenticateToken,
  requirePermission(["deudas.gestionar", "saldos.gestionar"]),
  requireFinancialScope({
    sources: [
      sourceParam("alumno", "alumno_id"),
      sourceBody("mensualidad", "mensualidad_id"),
    ],
    permission: ["deudas.gestionar", "saldos.gestionar"],
  }),
  CR_BonificacionAlumno_CTS,
);

// Benjamin Orellana - 2026/07/15 - Consulta saldo y auditoría comercial del alumno.
router.get(
  "/alumnos/:alumno_id/saldo",
  authenticateToken,
  requirePermission("saldos.ver"),
  alcanceAlumno("saldos.ver"),
  OBR_SaldoAlumno_CTS,
);

// Benjamin Orellana - 2026/06/15 - Congela membresía vigente del alumno.
router.get(
  "/alumnos/:alumno_id/contexto-operaciones-membresia",
  authenticateToken,
  OBR_ContextoOperacionesMembresiaAlumnoPlanesPagos_CTS,
);

router.patch(
  "/alumnos/:alumno_id/congelar-membresia",
  authenticateToken,
  UR_CongelarMembresiaAlumnoPlanesPagos_CTS,
);

// Benjamin Orellana - 2026/06/15 - Reactiva membresía congelada del alumno.
router.patch(
  "/alumnos/:alumno_id/reactivar-membresia",
  authenticateToken,
  UR_ReactivarMembresiaAlumnoPlanesPagos_CTS,
);

// Benjamin Orellana - 2026/06/15 - Registra baja operativa del alumno.
router.patch(
  "/alumnos/:alumno_id/registrar-baja",
  authenticateToken,
  UR_RegistrarBajaAlumnoPlanesPagos_CTS,
);

// Benjamin Orellana - 2026/06/15 - Reingresa alumno dado de baja.
router.post(
  "/alumnos/:alumno_id/reingresar",
  authenticateToken,
  CR_ReingresarAlumnoPlanesPagos_CTS,
);

// Benjamin Orellana - 2026/06/15 - Cambia sede operativa del alumno.
router.patch(
  "/alumnos/:alumno_id/cambiar-sede",
  authenticateToken,
  UR_CambiarSedeAlumnoPlanesPagos_CTS,
);

// Benjamin Orellana - 2026/06/15 - Cambia plan operativo actual del alumno.
router.patch(
  "/alumnos/:alumno_id/cambiar-plan",
  authenticateToken,
  UR_CambiarPlanAlumnoPlanesPagos_CTS,
);

export default router;
