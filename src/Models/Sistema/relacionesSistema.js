/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (relacionesSistema.js) contiene las relaciones Sequelize
 * del módulo Sistema para PREMIUM.
 *
 * Tema: Relaciones - Sistema
 *
 * Capa: Backend
 */

import SistemaAlertasModel from './MD_TB_SistemaAlertas.js';
import SistemaAuditoriaLogsModel from './MD_TB_SistemaAuditoriaLogs.js';

import SedesModel from '../Sede/MD_TB_Sedes.js';
import AlumnosModel from '../Alumno/MD_TB_Alumnos.js';
import UsuariosModel from '../Usuario/MD_TB_Usuarios.js';

let relacionesInicializadas = false;

// Benjamin Orellana - 2026/05/10 - Inicializa relaciones Sequelize del módulo Sistema.
export const initSistemaRelaciones = () => {
  if (relacionesInicializadas) return;
  relacionesInicializadas = true;

  /*
   * sedes_sedes -> sistema_alertas
   * Una sede puede tener muchas alertas del sistema.
   */
  SedesModel.hasMany(SistemaAlertasModel, {
    foreignKey: 'sede_id',
    as: 'sistema_alertas'
  });

  SistemaAlertasModel.belongsTo(SedesModel, {
    foreignKey: 'sede_id',
    as: 'sede'
  });

  /*
   * alumnos_alumnos -> sistema_alertas
   * Un alumno puede tener muchas alertas asociadas.
   */
  AlumnosModel.hasMany(SistemaAlertasModel, {
    foreignKey: 'alumno_id',
    as: 'sistema_alertas'
  });

  SistemaAlertasModel.belongsTo(AlumnosModel, {
    foreignKey: 'alumno_id',
    as: 'alumno'
  });

  /*
   * usuarios_usuarios -> sistema_alertas
   * Usuario que resolvió la alerta.
   */
  UsuariosModel.hasMany(SistemaAlertasModel, {
    foreignKey: 'usuario_resolucion_id',
    as: 'alertas_resueltas'
  });

  SistemaAlertasModel.belongsTo(UsuariosModel, {
    foreignKey: 'usuario_resolucion_id',
    as: 'usuario_resolucion'
  });

  /*
   * usuarios_usuarios -> sistema_auditoria_logs
   * Usuario asociado al log de auditoría.
   */
  UsuariosModel.hasMany(SistemaAuditoriaLogsModel, {
    foreignKey: 'usuario_id',
    as: 'auditoria_logs'
  });

  SistemaAuditoriaLogsModel.belongsTo(UsuariosModel, {
    foreignKey: 'usuario_id',
    as: 'usuario'
  });

  /*
   * sedes_sedes -> sistema_auditoria_logs
   * Sede asociada al log de auditoría.
   */
  SedesModel.hasMany(SistemaAuditoriaLogsModel, {
    foreignKey: 'sede_id',
    as: 'sistema_auditoria_logs'
  });

  SistemaAuditoriaLogsModel.belongsTo(SedesModel, {
    foreignKey: 'sede_id',
    as: 'sede'
  });
};
