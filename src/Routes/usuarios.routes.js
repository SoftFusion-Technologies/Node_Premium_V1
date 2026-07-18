/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 25 / 04 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (usuarios.routes.js) contiene las rutas de usuarios internos
 * PREMIUM: roles, usuarios, asignaciones usuario-sede, permisos y la
 * relación roles-permisos.
 *
 * Tema: Rutas - Usuarios
 *
 * Capa: Backend
 */

import express from 'express';

// Benjamin Orellana - 2026/05/10 - Importa middlewares de seguridad para proteger rutas PREMIUM.
import {
  authenticateToken,
  requirePermission,
  requireRolGlobal
} from '../Security/auth.js';

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

// Benjamin Orellana - 2026/05/10 - Importa controlador de usuarios PREMIUM.
import {
  OBR_Usuarios_CTS,
  OBR_UsuariosSelectorCobro_CTS,
  OBR_UsuarioPerfil_CTS,
  OBR_UsuarioPorId_CTS,
  CR_Usuarios_CTS,
  UR_Usuarios_CTS,
  UR_EstadoUsuarios_CTS,
  UR_PasswordUsuarios_CTS,
  UR_MiPasswordUsuarios_CTS,
  DR_Usuarios_CTS
} from '../Controllers/Usuario/CTS_TB_Usuarios.js';

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

const router = express.Router();

/*
 * =========================================================
 * USUARIOS ROLES
 * =========================================================
 */

/*
 * Benjamin Orellana - 2026/05/10 - Lista roles de usuarios con filtros y paginación.
 */
router.get(
  '/usuarios-roles',
  authenticateToken,
  requirePermission('usuarios.gestionar'),
  OBR_UsuariosRoles_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Lista roles activos para selects operativos.
 */
router.get(
  '/usuarios-roles/activos',
  authenticateToken,
  requirePermission('usuarios.gestionar'),
  OBR_UsuariosRolesActivos_CTS
);

/*
 * Benjamin Orellana - 2026/05/10 - Obtiene un rol de usuario por ID.
 */
router.get(
  '/usuarios-roles/:id',
  authenticateToken,
  requirePermission('usuarios.gestionar'),
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
 * Benjamin Orellana - 2026/07/13 - Lista mínima de usuarios activos para el
 * selector operativo del drawer Nuevo Cobro.
 */
router.get(
  '/usuarios/cobros/empleados',
  authenticateToken,
  requirePermission('cobros.registrar'),
  OBR_UsuariosSelectorCobro_CTS
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
 * Nota: la URL empieza con /sedes pero pertenece al módulo de usuarios-sedes
 * (usa el controlador CTS_TB_UsuariosSedes.js), por eso vive en este archivo.
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

export default router;
