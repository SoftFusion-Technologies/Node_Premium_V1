/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (relacionesUsuario.js) contiene las relaciones Sequelize
 * del módulo Usuario para PREMIUM.
 *
 * Tema: Relaciones - Usuario
 *
 * Capa: Backend
 */

import UsuariosRolesModel from './MD_TB_UsuariosRoles.js';
import UsuariosPermisosModel from './MD_TB_UsuariosPermisos.js';
import UsuariosRolesPermisosModel from './MD_TB_UsuariosRolesPermisos.js';
import UsuariosModel from './MD_TB_Usuarios.js';
import UsuariosSedesModel from './MD_TB_UsuariosSedes.js';

import SedesModel from '../Sede/MD_TB_Sedes.js';

let relacionesInicializadas = false;

// Benjamin Orellana - 2026/05/10 - Inicializa relaciones Sequelize del módulo Usuario.
export const initUsuarioRelaciones = () => {
  if (relacionesInicializadas) return;
  relacionesInicializadas = true;

  /*
   * usuarios_roles -> usuarios_usuarios
   * Un rol puede tener muchos usuarios.
   */
  UsuariosRolesModel.hasMany(UsuariosModel, {
    foreignKey: 'rol_id',
    as: 'usuarios'
  });

  UsuariosModel.belongsTo(UsuariosRolesModel, {
    foreignKey: 'rol_id',
    as: 'rol'
  });

  /*
   * sedes_sedes -> usuarios_usuarios
   * Un usuario puede tener una sede principal opcional.
   */
  SedesModel.hasMany(UsuariosModel, {
    foreignKey: 'sede_principal_id',
    as: 'usuarios_sede_principal'
  });

  UsuariosModel.belongsTo(SedesModel, {
    foreignKey: 'sede_principal_id',
    as: 'sede_principal'
  });

  /*
   * usuarios_usuarios -> usuarios_sedes
   * Un usuario puede estar vinculado a varias sedes.
   */
  UsuariosModel.hasMany(UsuariosSedesModel, {
    foreignKey: 'usuario_id',
    as: 'usuarios_sedes'
  });

  UsuariosSedesModel.belongsTo(UsuariosModel, {
    foreignKey: 'usuario_id',
    as: 'usuario'
  });

  /*
   * sedes_sedes -> usuarios_sedes
   * Una sede puede tener varios usuarios vinculados.
   */
  SedesModel.hasMany(UsuariosSedesModel, {
    foreignKey: 'sede_id',
    as: 'usuarios_sedes'
  });

  UsuariosSedesModel.belongsTo(SedesModel, {
    foreignKey: 'sede_id',
    as: 'sede'
  });

  /*
   * usuarios_roles -> usuarios_sedes
   * El vínculo usuario-sede puede tener un rol específico opcional.
   */
  UsuariosRolesModel.hasMany(UsuariosSedesModel, {
    foreignKey: 'rol_id',
    as: 'usuarios_sedes'
  });

  UsuariosSedesModel.belongsTo(UsuariosRolesModel, {
    foreignKey: 'rol_id',
    as: 'rol'
  });

  /*
   * usuarios_roles -> usuarios_roles_permisos
   * Relación directa contra la tabla intermedia.
   */
  UsuariosRolesModel.hasMany(UsuariosRolesPermisosModel, {
    foreignKey: 'rol_id',
    as: 'roles_permisos'
  });

  UsuariosRolesPermisosModel.belongsTo(UsuariosRolesModel, {
    foreignKey: 'rol_id',
    as: 'rol'
  });

  /*
   * usuarios_permisos -> usuarios_roles_permisos
   * Relación directa contra la tabla intermedia.
   */
  UsuariosPermisosModel.hasMany(UsuariosRolesPermisosModel, {
    foreignKey: 'permiso_id',
    as: 'roles_permisos'
  });

  UsuariosRolesPermisosModel.belongsTo(UsuariosPermisosModel, {
    foreignKey: 'permiso_id',
    as: 'permiso'
  });

  /*
   * usuarios_roles <-> usuarios_permisos
   * Relación muchos a muchos mediante usuarios_roles_permisos.
   */
  UsuariosRolesModel.belongsToMany(UsuariosPermisosModel, {
    through: UsuariosRolesPermisosModel,
    foreignKey: 'rol_id',
    otherKey: 'permiso_id',
    as: 'permisos'
  });

  UsuariosPermisosModel.belongsToMany(UsuariosRolesModel, {
    through: UsuariosRolesPermisosModel,
    foreignKey: 'permiso_id',
    otherKey: 'rol_id',
    as: 'roles'
  });
};
