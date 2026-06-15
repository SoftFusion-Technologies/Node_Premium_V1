/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 25 / 04 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (routes.js) contiene las rutas principales del backend PREMIUM.
 *
 * Módulos incluidos:
 * - Sedes
 * - Usuarios
 * - Roles y permisos
 * - Alumnos
 * - Planes
 * - Pagos
 * - Agenda
 * - Finanzas
 * - ARCA
 * - Sistema
 *
 * Tema: Rutas principales
 *
 * Capa: Backend
 */

// Importaciones
import express from 'express';

// Benjamin Orellana - 2026/05/10 - Importa middlewares de seguridad para proteger rutas PREMIUM.
import {
  authenticateToken,
  authenticateAlumnoToken as authenticateAlumnoTokenViejo,
  requireRolGlobal
} from '../Security/auth.js';

import { authenticateAlumnoToken } from '../Security/authAlumno.js';

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

// Crea un enrutador de Express
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

// Benjamin Orellana - 2026/05/10 - Importa controlador de roles de usuarios PREMIUM.
import {
  OBR_UsuariosRoles_CTS,
  OBR_UsuariosRolesActivos_CTS,
  OBR_UsuariosRolesPorId_CTS,
  CR_UsuariosRoles_CTS,
  UR_UsuariosRoles_CTS,
  UR_EstadoUsuariosRoles_CTS,
  DR_UsuariosRoles_CTS
} from '../Controllers/Usuario/CTS_TB_UsuariosRoles.js';

/*
 * =========================================================
 * USUARIOS ROLES
 * =========================================================
 */

/*
 * Benjamin Orellana - 2026/05/10 - Lista roles de usuarios con filtros y paginación.
 */
router.get('/usuarios-roles', OBR_UsuariosRoles_CTS);

/*
 * Benjamin Orellana - 2026/05/10 - Lista roles activos para selects operativos.
 */
router.get(
  '/usuarios-roles/activos',
  authenticateToken,
  OBR_UsuariosRolesActivos_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Obtiene un rol de usuario por ID.
 */
router.get(
  '/usuarios-roles/:id',
  authenticateToken,
  OBR_UsuariosRolesPorId_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Crea un nuevo rol de usuario.
 */
router.post(
  '/usuarios-roles',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  CR_UsuariosRoles_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Actualiza un rol de usuario existente.
 */
router.put(
  '/usuarios-roles/:id',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  UR_UsuariosRoles_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Cambia estado activo/inactivo de un rol de usuario.
 */
router.patch(
  '/usuarios-roles/:id/estado',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  UR_EstadoUsuariosRoles_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Desactiva un rol de usuario sin eliminarlo físicamente.
 */
router.delete(
  '/usuarios-roles/:id',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  DR_UsuariosRoles_CTS
);

// Benjamin Orellana - 2026/05/10 - Importa controlador de usuarios PREMIUM.
import {
  OBR_Usuarios_CTS,
  OBR_UsuarioPerfil_CTS,
  OBR_UsuarioPorId_CTS,
  CR_Usuarios_CTS,
  UR_Usuarios_CTS,
  UR_EstadoUsuarios_CTS,
  UR_PasswordUsuarios_CTS,
  UR_MiPasswordUsuarios_CTS,
  DR_Usuarios_CTS
} from '../Controllers/Usuario/CTS_TB_Usuarios.js';

/*
 * =========================================================
 * USUARIOS
 * =========================================================
 */

/*
 * Benjamin Orellana - 2026/05/10 - Obtiene el perfil del usuario autenticado.
 */
router.get('/usuarios/perfil', authenticateToken, OBR_UsuarioPerfil_CTS);

/*
 * Benjamin Orellana - 2026/05/10 - Permite al usuario autenticado cambiar su propia contraseña.
 */
router.patch(
  '/usuarios/perfil/password',
  authenticateToken,
  UR_MiPasswordUsuarios_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Lista usuarios con filtros y paginación.
 */
router.get(
  '/usuarios',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  OBR_Usuarios_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Obtiene un usuario por ID.
 */
router.get(
  '/usuarios/:id',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  OBR_UsuarioPorId_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Crea un nuevo usuario.
 */
router.post(
  '/usuarios',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  CR_Usuarios_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Actualiza un usuario existente.
 */
router.put(
  '/usuarios/:id',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  UR_Usuarios_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Cambia estado activo/inactivo/bloqueado de un usuario.
 */
router.patch(
  '/usuarios/:id/estado',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  UR_EstadoUsuarios_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Cambia password de un usuario desde administración.
 */
router.patch(
  '/usuarios/:id/password',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  UR_PasswordUsuarios_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Desactiva un usuario sin eliminarlo físicamente.
 */
router.delete(
  '/usuarios/:id',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  DR_Usuarios_CTS
);

// Benjamin Orellana - 2026/05/10 - Importa controlador de asignaciones usuario-sede PREMIUM.
import {
  OBR_UsuariosSedes_CTS,
  OBR_UsuariosSedesPorId_CTS,
  OBR_SedesPorUsuario_CTS,
  OBR_UsuariosPorSede_CTS,
  CR_UsuariosSedes_CTS,
  UR_UsuariosSedes_CTS,
  UR_SedePrincipalUsuariosSedes_CTS,
  UR_EstadoUsuariosSedes_CTS,
  DR_UsuariosSedes_CTS
} from '../Controllers/Usuario/CTS_TB_UsuariosSedes.js';

/*
 * =========================================================
 * USUARIOS SEDES
 * =========================================================
 */

/*
 * Benjamin Orellana - 2026/05/10 - Lista asignaciones usuario-sede con filtros y paginación.
 */
router.get(
  '/usuarios-sedes',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  OBR_UsuariosSedes_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Lista sedes asignadas a un usuario.
 */
router.get(
  '/usuarios/:usuario_id/sedes',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  OBR_SedesPorUsuario_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Lista usuarios asignados a una sede.
 */
router.get(
  '/sedes/:sede_id/usuarios',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  OBR_UsuariosPorSede_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Obtiene una asignación usuario-sede por ID.
 */
router.get(
  '/usuarios-sedes/:id',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  OBR_UsuariosSedesPorId_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Asigna una sede a un usuario.
 */
router.post(
  '/usuarios-sedes',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  CR_UsuariosSedes_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Actualiza permisos de una asignación usuario-sede.
 */
router.put(
  '/usuarios-sedes/:id',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  UR_UsuariosSedes_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Marca una sede como principal para un usuario.
 */
router.patch(
  '/usuarios-sedes/:id/principal',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  UR_SedePrincipalUsuariosSedes_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Cambia estado activo/inactivo de una asignación usuario-sede.
 */
router.patch(
  '/usuarios-sedes/:id/estado',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  UR_EstadoUsuariosSedes_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Desactiva una asignación usuario-sede sin eliminarla físicamente.
 */
router.delete(
  '/usuarios-sedes/:id',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  DR_UsuariosSedes_CTS
);
// Benjamin Orellana - 2026/05/10 - Importa controlador de permisos de usuarios PREMIUM.
import {
  OBR_UsuariosPermisos_CTS,
  OBR_UsuariosPermisosActivos_CTS,
  OBR_UsuariosPermisosPorId_CTS,
  CR_UsuariosPermisos_CTS,
  UR_UsuariosPermisos_CTS,
  UR_EstadoUsuariosPermisos_CTS,
  DR_UsuariosPermisos_CTS
} from '../Controllers/Usuario/CTS_TB_UsuariosPermisos.js';
/*
 * =========================================================
 * USUARIOS PERMISOS
 * =========================================================
 */

/*
 * Benjamin Orellana - 2026/05/10 - Lista permisos de usuarios con filtros y paginación.
 */
router.get(
  '/usuarios-permisos',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  OBR_UsuariosPermisos_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Lista permisos activos para asignación a roles.
 */
router.get(
  '/usuarios-permisos/activos',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  OBR_UsuariosPermisosActivos_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Obtiene un permiso de usuario por ID.
 */
router.get(
  '/usuarios-permisos/:id',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  OBR_UsuariosPermisosPorId_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Crea un nuevo permiso de usuario.
 */
router.post(
  '/usuarios-permisos',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  CR_UsuariosPermisos_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Actualiza un permiso de usuario existente.
 */
router.put(
  '/usuarios-permisos/:id',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  UR_UsuariosPermisos_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Cambia estado activo/inactivo de un permiso de usuario.
 */
router.patch(
  '/usuarios-permisos/:id/estado',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  UR_EstadoUsuariosPermisos_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Desactiva un permiso de usuario sin eliminarlo físicamente.
 */
router.delete(
  '/usuarios-permisos/:id',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  DR_UsuariosPermisos_CTS
);

// Benjamin Orellana - 2026/05/10 - Importa controlador de relaciones roles-permisos PREMIUM.
import {
  OBR_UsuariosRolesPermisos_CTS,
  OBR_UsuariosRolesPermisosPorId_CTS,
  OBR_PermisosPorRol_CTS,
  OBR_RolesPorPermiso_CTS,
  CR_UsuariosRolesPermisos_CTS,
  CR_MultiplesUsuariosRolesPermisos_CTS,
  UR_PermisosRol_CTS,
  DR_UsuariosRolesPermisos_CTS,
  DR_PermisoRol_CTS
} from '../Controllers/Usuario/CTS_TB_UsuariosRolesPermisos.js';

/*
 * =========================================================
 * USUARIOS ROLES PERMISOS
 * =========================================================
 */

/*
 * Benjamin Orellana - 2026/05/10 - Lista relaciones rol-permiso con filtros y paginación.
 */
router.get(
  '/usuarios-roles-permisos',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  OBR_UsuariosRolesPermisos_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Lista permisos asignados a un rol.
 */
router.get(
  '/usuarios-roles/:rol_id/permisos',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  OBR_PermisosPorRol_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Lista roles que tienen asignado un permiso.
 */
router.get(
  '/usuarios-permisos/:permiso_id/roles',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  OBR_RolesPorPermiso_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Obtiene una relación rol-permiso por ID.
 */
router.get(
  '/usuarios-roles-permisos/:id',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  OBR_UsuariosRolesPermisosPorId_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Asigna un permiso a un rol.
 */
router.post(
  '/usuarios-roles-permisos',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  CR_UsuariosRolesPermisos_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Asigna varios permisos a un rol sin quitar los existentes.
 */
router.post(
  '/usuarios-roles/:rol_id/permisos',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  CR_MultiplesUsuariosRolesPermisos_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Reemplaza todos los permisos asignados a un rol.
 */
router.put(
  '/usuarios-roles/:rol_id/permisos',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  UR_PermisosRol_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Quita una relación rol-permiso por ID.
 */
router.delete(
  '/usuarios-roles-permisos/:id',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  DR_UsuariosRolesPermisos_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Quita un permiso específico de un rol.
 */
router.delete(
  '/usuarios-roles/:rol_id/permisos/:permiso_id',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  DR_PermisoRol_CTS
);

// Benjamin Orellana - 2026/05/26 - Importa controlador principal de alumnos PREMIUM.
import {
  OBR_Alumnos_CTS,
  OBR_AlumnoPorDni_CTS,
  OBR_AlumnoPerfil_CTS,
  CR_Alumnos_CTS,
  CR_Alumnos_Publico_CTS,
  UR_Alumnos_CTS,
  UR_EstadoAlumnos_CTS,
  UR_AlumnoPerfil_CTS,
  UR_BajaAlumnos_CTS,
  UR_CongelarAlumnos_CTS,
  UR_ReactivarAlumnos_CTS,
  UR_HabilitarAccesoAlumno_CTS,
  DR_Alumnos_CTS
} from '../Controllers/Alumno/CTS_TB_Alumnos.js';

/*
 * =========================================================
 * ALUMNOS
 * =========================================================
 */

/*
 * Benjamin Orellana - 2026/05/26 - Obtiene perfil del alumno autenticado desde portal/app.
 */
router.get('/alumnos/perfil', authenticateAlumnoToken, OBR_AlumnoPerfil_CTS);
// Sergio Gustavo Manrique - 2026/06/11 - Actualiza datos personales del alumno autenticado
router.patch('/alumnos/perfil', authenticateAlumnoToken, UR_AlumnoPerfil_CTS);

/*
 * Benjamin Orellana - 2026/05/26 - Lista alumnos con filtros, búsqueda y paginación.
 */
router.get(
  '/alumnos',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE',
    'PROFESOR'
  ]),
  OBR_Alumnos_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Obtiene un alumno por DNI.
 */
router.get(
  '/alumnos/:dni',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE',
    'PROFESOR'
  ]),
  OBR_AlumnoPorDni_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Crea un alumno desde el panel interno.
 */
router.post(
  '/alumnos',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE'
  ]),
  CR_Alumnos_CTS
);

/*
 * Sergio Manrique - 2026/06/01 - Crea un alumno desde el panel externo .
 */
router.post('/alumnos/registro-publico', CR_Alumnos_Publico_CTS);

/*
 * Benjamin Orellana - 2026/05/26 - Actualiza datos principales de un alumno.
 */
router.put(
  '/alumnos/:id',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE'
  ]),
  UR_Alumnos_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Cambia estado operativo de un alumno.
 */
router.patch(
  '/alumnos/:id/estado',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE'
  ]),
  UR_EstadoAlumnos_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Registra baja de un alumno.
 */
router.patch(
  '/alumnos/:id/baja',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE'
  ]),
  UR_BajaAlumnos_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Congela alumno.
 */
router.patch(
  '/alumnos/:id/congelar',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE'
  ]),
  UR_CongelarAlumnos_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Reactiva alumno.
 */
router.patch(
  '/alumnos/:id/reactivar',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE'
  ]),
  UR_ReactivarAlumnos_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Habilita acceso web/app para alumno.
 */
router.patch(
  '/alumnos/:id/habilitar-acceso',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE'
  ]),
  UR_HabilitarAccesoAlumno_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Marca alumno como inactivo sin eliminarlo físicamente.
 */
router.delete(
  '/alumnos/:id',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE'
  ]),
  DR_Alumnos_CTS
);

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
  DR_MiContactoEmergencia_CTS
} from '../Controllers/Alumno/CTS_TB_AlumnosContactosEmergencia.js';

/*
 * =========================================================
 * ALUMNOS CONTACTOS DE EMERGENCIA
 * =========================================================
 */

/*
 * Benjamin Orellana - 2026/05/26 - Lista contactos de emergencia desde panel interno.
 */
router.get(
  '/alumnos-contactos-emergencia',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE',
    'PROFESOR'
  ]),
  OBR_AlumnosContactosEmergencia_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Lista contactos de emergencia del alumno autenticado.
 */
router.get(
  '/alumnos/perfil/contactos-emergencia',
  authenticateAlumnoToken,
  OBR_MisContactosEmergencia_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Lista contactos de emergencia de un alumno.
 */
router.get(
  '/alumnos/:alumno_id/contactos-emergencia',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE',
    'PROFESOR'
  ]),
  OBR_ContactosEmergenciaPorAlumno_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Obtiene un contacto de emergencia por ID.
 */
router.get(
  '/alumnos-contactos-emergencia/:id',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE',
    'PROFESOR'
  ]),
  OBR_ContactoEmergenciaPorId_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Crea contacto de emergencia desde portal alumno.
 */
router.post(
  '/alumnos/perfil/contactos-emergencia',
  authenticateAlumnoToken,
  CR_MiContactoEmergencia_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Crea contacto de emergencia desde panel interno.
 */
router.post(
  '/alumnos/:alumno_id/contactos-emergencia',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE'
  ]),
  CR_AlumnosContactosEmergencia_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Actualiza contacto de emergencia desde panel interno.
 */
router.put(
  '/alumnos-contactos-emergencia/:id',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE'
  ]),
  UR_AlumnosContactosEmergencia_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Actualiza contacto de emergencia desde portal alumno.
 */
router.put(
  '/alumnos/perfil/contactos-emergencia/:id',
  authenticateAlumnoToken,
  UR_MiContactoEmergencia_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Marca contacto principal desde panel interno.
 */
router.patch(
  '/alumnos-contactos-emergencia/:id/principal',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE'
  ]),
  UR_PrincipalContactoEmergencia_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Marca contacto principal desde portal alumno.
 */
router.patch(
  '/alumnos/perfil/contactos-emergencia/:id/principal',
  authenticateAlumnoToken,
  UR_MiPrincipalContactoEmergencia_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Elimina contacto de emergencia desde panel interno.
 */
router.delete(
  '/alumnos-contactos-emergencia/:id',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE'
  ]),
  DR_AlumnosContactosEmergencia_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Elimina contacto de emergencia desde portal alumno.
 */
router.delete(
  '/alumnos/perfil/contactos-emergencia/:id',
  authenticateAlumnoToken,
  DR_MiContactoEmergencia_CTS
);

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
  DR_AlumnosAnamnesis_CTS
} from '../Controllers/Alumno/CTS_TB_AlumnosAnamnesis.js';

/*
 * =========================================================
 * ALUMNOS ANAMNESIS
 * =========================================================
 */

/*
 * Benjamin Orellana - 2026/05/26 - Lista anamnesis desde panel interno.
 */
router.get(
  '/alumnos-anamnesis',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE',
    'PROFESOR'
  ]),
  OBR_AlumnosAnamnesis_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Lista mis anamnesis desde portal alumno.
 */
router.get(
  '/alumnos/perfil/anamnesis',
  authenticateAlumnoToken,
  OBR_MisAnamnesis_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Obtiene mi última anamnesis desde portal alumno.
 */
router.get(
  '/alumnos/perfil/anamnesis/actual',
  authenticateAlumnoToken,
  OBR_MiAnamnesisActual_CTS
);


/*
 * Benjamin Orellana - 2026/05/26 - Crea anamnesis desde portal alumno.
 */
router.post(
  '/alumnos/perfil/anamnesis',
  authenticateAlumnoToken,
  CR_MiAnamnesis_CTS
);


/*
 * Benjamin Orellana - 2026/05/26 - Lista anamnesis de un alumno.
 */
router.get(
  '/alumnos/:alumno_id/anamnesis',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE',
    'PROFESOR'
  ]),
  OBR_AnamnesisPorAlumno_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Obtiene la última anamnesis de un alumno.
 */
router.get(
  '/alumnos/:alumno_id/anamnesis/actual',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE',
    'PROFESOR'
  ]),
  OBR_AnamnesisActualPorAlumno_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Obtiene anamnesis por ID.
 */
router.get(
  '/alumnos-anamnesis/:id',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE',
    'PROFESOR'
  ]),
  OBR_AnamnesisPorId_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Crea anamnesis desde panel interno.
 */
router.post(
  '/alumnos/:alumno_id/anamnesis',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE'
  ]),
  CR_AlumnosAnamnesis_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Actualiza anamnesis desde panel interno.
 */
router.put(
  '/alumnos-anamnesis/:id',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE',
    'PROFESOR'
  ]),
  UR_AlumnosAnamnesis_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Actualiza anamnesis propia desde portal alumno.
 */
router.put(
  '/alumnos/perfil/anamnesis/:id',
  authenticateAlumnoToken,
  UR_MiAnamnesis_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Revisa anamnesis desde panel interno/profesor.
 */
router.patch(
  '/alumnos-anamnesis/:id/revisar',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE',
    'PROFESOR'
  ]),
  UR_RevisarAlumnosAnamnesis_CTS
);

/*
 * Benjamin Orellana - 2026/05/26 - Elimina anamnesis desde panel interno.
 */
router.delete(
  '/alumnos-anamnesis/:id',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE'
  ]),
  DR_AlumnosAnamnesis_CTS
);

import {
  GR_HistorialAnamnesis_CTS,
  GR_HistorialAnamnesisAlumno_CTS,
  GR_DetalleHistorialAnamnesis_CTS
} from '../Controllers/Alumno/CTS_TB_AlumnosAnamnesisHistorial.js';



/*
 * =========================================================
 * ALUMNOS ANAMNESIS HISTORIAL
 * =========================================================
 */

/*
 * Sergio Manrique - 2026/06/03 - Lista todo el historial de anamnesis de un alumno.
 */
router.get(
  '/alumnos/:alumno_id/anamnesis/historial',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE',
    'PROFESOR'
  ]),
  GR_HistorialAnamnesisAlumno_CTS
);

/*
 * Sergio Manrique - 2026/06/03 - Lista versiones históricas de una anamnesis específica.
 */
router.get(
  '/alumnos-anamnesis/:anamnesis_id/historial',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE',
    'PROFESOR'
  ]),
  GR_HistorialAnamnesis_CTS
);

/*
 * Sergio Manrique - 2026/06/03 - Obtiene el detalle de una versión histórica por ID.
 */
router.get(
  '/alumnos-anamnesis/historial/:id',
  authenticateToken,
  requireRolGlobal([
    'SUPER_ADMIN',
    'DIRECCION',
    'FRONT_COMERCIAL',
    'COORD_SEDE',
    'PROFESOR'
  ]),
  GR_DetalleHistorialAnamnesis_CTS
);

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

import {
  OBR_AlumnosMembresias_CTS,
  OBR_MembresiaPorId_CTS,
  OBR_MembresiasPorAlumno_CTS,
  OBR_MembresiaActivaAlumno_CTS,
  CR_AlumnosMembresias_CTS,
  UR_AlumnosMembresias_CTS,
  UR_EstadoMembresia_CTS,
  UR_CongelarMembresia_CTS,
  UR_ReactivarMembresia_CTS,
  DR_AlumnosMembresias_CTS,
  ER_AlumnosMembresias_CTS
} from '../Controllers/Alumno/CTS_TB_AlumnosMembresias.js';

/*
 * =========================================================
 * ALUMNOS MEMBRESÍAS
 * =========================================================
 */

router.get('/alumnos-membresias', authenticateToken, OBR_AlumnosMembresias_CTS);

router.get(
  '/alumnos-membresias/:id',
  authenticateToken,
  OBR_MembresiaPorId_CTS
);

router.get(
  '/alumnos/:alumno_id/membresias',
  authenticateToken,
  OBR_MembresiasPorAlumno_CTS
);

router.get(
  '/alumnos/:alumno_id/membresia-activa',
  authenticateToken,
  OBR_MembresiaActivaAlumno_CTS
);

router.post('/alumnos-membresias', authenticateToken, CR_AlumnosMembresias_CTS);

router.put(
  '/alumnos-membresias/:id',
  authenticateToken,
  UR_AlumnosMembresias_CTS
);

router.patch(
  '/alumnos-membresias/:id/estado',
  authenticateToken,
  UR_EstadoMembresia_CTS
);

router.put(
  '/alumnos-membresias/:id/congelar',
  authenticateToken,
  UR_CongelarMembresia_CTS
);

router.put(
  '/alumnos-membresias/:id/reactivar',
  authenticateToken,
  UR_ReactivarMembresia_CTS
);

// Benjamin Orellana - 2026/05/29 - Baja lógica de membresía, cambia estado a cancelada.
router.put(
  '/alumnos-membresias/:id/desactivar',
  authenticateToken,
  DR_AlumnosMembresias_CTS
);

// Benjamin Orellana - 2026/05/29 - Eliminación física de membresía.
router.delete(
  '/alumnos-membresias/:id',
  authenticateToken,
  ER_AlumnosMembresias_CTS
);

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

import {
  OBR_FinanzasMovimientos_CTS,
  OBR_FinanzaMovimientoPorId_CTS,
  OBR_FinanzasMovimientosPorPago_CTS,
  OBR_ResumenFinanciero_CTS,
  OBR_ReporteCobrosPorSede_CTS,
  CR_FinanzasMovimientos_CTS,
  UR_FinanzasMovimientos_CTS,
  UR_EstadoFinanzaMovimiento_CTS,
  DR_FinanzasMovimientos_CTS,
  ER_FinanzasMovimientos_CTS
} from '../Controllers/Finanzas/CTS_TB_FinanzasMovimientos.js';

/*
 * =========================================================
 * FINANZAS MOVIMIENTOS
 * =========================================================
 */

router.get(
  '/finanzas-movimientos',
  authenticateToken,
  OBR_FinanzasMovimientos_CTS
);

router.get(
  '/finanzas-movimientos/resumen',
  authenticateToken,
  OBR_ResumenFinanciero_CTS
);

router.get(
  '/finanzas-movimientos/reporte-cobros-sede',
  authenticateToken,
  OBR_ReporteCobrosPorSede_CTS
);

router.get(
  '/pagos/:pago_id/finanzas-movimientos',
  authenticateToken,
  OBR_FinanzasMovimientosPorPago_CTS
);

router.get(
  '/finanzas-movimientos/:id',
  authenticateToken,
  OBR_FinanzaMovimientoPorId_CTS
);

router.post(
  '/finanzas-movimientos',
  authenticateToken,
  CR_FinanzasMovimientos_CTS
);

router.put(
  '/finanzas-movimientos/:id',
  authenticateToken,
  UR_FinanzasMovimientos_CTS
);

router.patch(
  '/finanzas-movimientos/:id/estado',
  authenticateToken,
  UR_EstadoFinanzaMovimiento_CTS
);

// Benjamin Orellana - 2026/05/30 - Baja lógica del movimiento financiero, cambia estado a anulado.
router.put(
  '/finanzas-movimientos/:id/desactivar',
  authenticateToken,
  DR_FinanzasMovimientos_CTS
);

// Benjamin Orellana - 2026/05/30 - Eliminación física del movimiento financiero.
router.delete(
  '/finanzas-movimientos/:id',
  authenticateToken,
  ER_FinanzasMovimientos_CTS
);

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

import {
  CR_RegistrarPagoOperativo_CTS,
  CR_RenovarMembresiaOperativa_CTS
} from '../Controllers/Pago/CTS_TB_PagosRegistroOperativo.js';

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

import { PR_ProcesarVencimientos_CTS } from '../Controllers/Sistema/CTS_ProcesarVencimientos.js';

/*
 * =========================================================
 * SISTEMA - PROCESOS OPERATIVOS
 * =========================================================
 */

// Benjamin Orellana - 2026/06/15 - Procesa vencimientos de membresías, mensualidades y estados de alumnos.
router.post(
  '/sistema/procesar-vencimientos',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  PR_ProcesarVencimientos_CTS
);

export default router;
