/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (relacionesAlumno.js) contiene las relaciones Sequelize
 * del módulo Alumno para PREMIUM.
 *
 * Tema: Relaciones - Alumno
 *
 * Capa: Backend
 */

import AlumnosModel from "./MD_TB_Alumnos.js";
import AlumnosContactosEmergenciaModel from "./MD_TB_AlumnosContactosEmergencia.js";
import AlumnosAnamnesisModel from "./MD_TB_AlumnosAnamnesis.js";
import AlumnosMembresiasModel from "./MD_TB_AlumnosMembresias.js";
import AlumnosAsistenciasModel from "./MD_TB_AlumnosAsistencias.js";
import AlumnosAnamnesisHistorialModel from "./MD_TB_AlumnosAnamnesisHistorial.js";

import SedesModel from "../Sede/MD_TB_Sedes.js";
import UsuariosModel from "../Usuario/MD_TB_Usuarios.js";
import PlanesModel from "../Plan/MD_TB_Planes.js";
import AgendaTurnosModel from "../Agenda/MD_TB_AgendaTurnos.js";
import AgendaTurnosReservasModel from "../Agenda/MD_TB_AgendaTurnosReservas.js";

let relacionesInicializadas = false;

// Benjamin Orellana - 2026/05/10 - Inicializa relaciones Sequelize del módulo Alumno.
export const initAlumnoRelaciones = () => {
  if (relacionesInicializadas) return;
  relacionesInicializadas = true;

  /*
   * sedes_sedes -> alumnos_alumnos
   * Una sede puede tener muchos alumnos.
   */
  SedesModel.hasMany(AlumnosModel, {
    foreignKey: "sede_id",
    as: "alumnos",
  });

  AlumnosModel.belongsTo(SedesModel, {
    foreignKey: "sede_id",
    as: "sede",
  });

  /*
   * usuarios_usuarios -> alumnos_alumnos
   * Un alumno puede estar vinculado opcionalmente a un usuario de app.
   */
  UsuariosModel.hasOne(AlumnosModel, {
    foreignKey: "usuario_app_id",
    as: "alumno_app",
  });

  AlumnosModel.belongsTo(UsuariosModel, {
    foreignKey: "usuario_app_id",
    as: "usuario_app",
  });

  /*
   * usuarios_usuarios -> alumnos_alumnos
   * Usuario administrativo que dio de alta al alumno.
   */
  UsuariosModel.hasMany(AlumnosModel, {
    foreignKey: "usuario_alta_id",
    as: "alumnos_dados_alta",
  });

  AlumnosModel.belongsTo(UsuariosModel, {
    foreignKey: "usuario_alta_id",
    as: "usuario_alta",
  });

  /*
   * usuarios_usuarios -> alumnos_alumnos
   * Usuario administrativo que validó al alumno.
   */
  UsuariosModel.hasMany(AlumnosModel, {
    foreignKey: "usuario_validacion_id",
    as: "alumnos_validados",
  });

  AlumnosModel.belongsTo(UsuariosModel, {
    foreignKey: "usuario_validacion_id",
    as: "usuario_validacion",
  });

  /*
   * alumnos_alumnos -> alumnos_contactos_emergencia
   * Un alumno puede tener muchos contactos de emergencia.
   */
  AlumnosModel.hasMany(AlumnosContactosEmergenciaModel, {
    foreignKey: "alumno_id",
    as: "contactos_emergencia",
  });

  AlumnosContactosEmergenciaModel.belongsTo(AlumnosModel, {
    foreignKey: "alumno_id",
    as: "alumno",
  });

  /*
   * alumnos_alumnos -> alumnos_anamnesis
   * Un alumno puede tener uno o varios registros de anamnesis.
   */
  AlumnosModel.hasMany(AlumnosAnamnesisModel, {
    foreignKey: "alumno_id",
    as: "anamnesis",
  });

  AlumnosAnamnesisModel.belongsTo(AlumnosModel, {
    foreignKey: "alumno_id",
    as: "alumno",
  });

  /*
   * usuarios_usuarios -> alumnos_anamnesis
   * Usuario que registró o complementó la anamnesis.
   */
  UsuariosModel.hasMany(AlumnosAnamnesisModel, {
    foreignKey: "usuario_registro_id",
    as: "anamnesis_registradas",
  });

  AlumnosAnamnesisModel.belongsTo(UsuariosModel, {
    foreignKey: "usuario_registro_id",
    as: "usuario_registro",
  });

  /*
   * alumnos_alumnos -> alumnos_membresias
   * Un alumno puede tener muchas membresías.
   */
  AlumnosModel.hasMany(AlumnosMembresiasModel, {
    foreignKey: "alumno_id",
    as: "membresias",
  });

  AlumnosMembresiasModel.belongsTo(AlumnosModel, {
    foreignKey: "alumno_id",
    as: "alumno",
  });

  /*
   * planes_planes -> alumnos_membresias
   * Un plan puede estar asociado a muchas membresías.
   */
  PlanesModel.hasMany(AlumnosMembresiasModel, {
    foreignKey: "plan_id",
    as: "membresias",
  });

  AlumnosMembresiasModel.belongsTo(PlanesModel, {
    foreignKey: "plan_id",
    as: "plan",
  });

  /*
   * sedes_sedes -> alumnos_membresias
   * Una sede puede tener muchas membresías emitidas.
   */
  SedesModel.hasMany(AlumnosMembresiasModel, {
    foreignKey: "sede_id",
    as: "alumnos_membresias",
  });

  AlumnosMembresiasModel.belongsTo(SedesModel, {
    foreignKey: "sede_id",
    as: "sede",
  });

  /*
   * alumnos_alumnos -> alumnos_asistencias
   * Un alumno puede tener muchas asistencias registradas.
   */
  AlumnosModel.hasMany(AlumnosAsistenciasModel, {
    foreignKey: "alumno_id",
    as: "asistencias",
  });

  AlumnosAsistenciasModel.belongsTo(AlumnosModel, {
    foreignKey: "alumno_id",
    as: "alumno",
  });

  /*
   * sedes_sedes -> alumnos_asistencias
   * Una sede puede tener muchas asistencias registradas.
   */
  SedesModel.hasMany(AlumnosAsistenciasModel, {
    foreignKey: "sede_id",
    as: "alumnos_asistencias",
  });

  AlumnosAsistenciasModel.belongsTo(SedesModel, {
    foreignKey: "sede_id",
    as: "sede",
  });

  /*
   * agenda_turnos -> alumnos_asistencias
   * Una asistencia puede estar vinculada opcionalmente a un turno.
   */
  AgendaTurnosModel.hasMany(AlumnosAsistenciasModel, {
    foreignKey: "turno_id",
    as: "asistencias",
  });

  AlumnosAsistenciasModel.belongsTo(AgendaTurnosModel, {
    foreignKey: "turno_id",
    as: "turno",
  });

  /*
   * agenda_turnos_reservas -> alumnos_asistencias
   * Una asistencia puede estar vinculada opcionalmente a una reserva.
   */
  AgendaTurnosReservasModel.hasMany(AlumnosAsistenciasModel, {
    foreignKey: "reserva_id",
    as: "asistencias",
  });

  AlumnosAsistenciasModel.belongsTo(AgendaTurnosReservasModel, {
    foreignKey: "reserva_id",
    as: "reserva",
  });

  /*
   * alumnos_membresias -> alumnos_asistencias
   * Una asistencia puede consumir o estar asociada opcionalmente a una membresía.
   */
  AlumnosMembresiasModel.hasMany(AlumnosAsistenciasModel, {
    foreignKey: "membresia_id",
    as: "asistencias",
  });

  AlumnosAsistenciasModel.belongsTo(AlumnosMembresiasModel, {
    foreignKey: "membresia_id",
    as: "membresia",
  });

  /*
   * usuarios_usuarios -> alumnos_asistencias
   * Usuario que registró la asistencia.
   */
  UsuariosModel.hasMany(AlumnosAsistenciasModel, {
    foreignKey: "registrado_por_id",
    as: "asistencias_registradas",
  });

  AlumnosAsistenciasModel.belongsTo(UsuariosModel, {
    foreignKey: "registrado_por_id",
    as: "registrado_por",
  });

  /*
   * alumnos_anamnesis -> alumnos_anamnesis_historial
   * Una anamnesis puede tener muchas versiones históricas.
   */
  AlumnosAnamnesisModel.hasMany(AlumnosAnamnesisHistorialModel, {
    foreignKey: "anamnesis_id",
    as: "historial",
  });

  AlumnosAnamnesisHistorialModel.belongsTo(AlumnosAnamnesisModel, {
    foreignKey: "anamnesis_id",
    as: "anamnesis",
  });

  /*
   * alumnos_alumnos -> alumnos_anamnesis_historial
   * Acceso directo al historial desde el alumno.
   */
  AlumnosModel.hasMany(AlumnosAnamnesisHistorialModel, {
    foreignKey: "alumno_id",
    as: "anamnesis_historial",
  });

  AlumnosAnamnesisHistorialModel.belongsTo(AlumnosModel, {
    foreignKey: "alumno_id",
    as: "alumno",
  });

  /*
   * usuarios_usuarios -> alumnos_anamnesis_historial
   * Usuario que realizó la modificación registrada en el historial.
   */
  UsuariosModel.hasMany(AlumnosAnamnesisHistorialModel, {
    foreignKey: "usuario_modificacion_id",
    as: "anamnesis_modificaciones",
  });

  AlumnosAnamnesisHistorialModel.belongsTo(UsuariosModel, {
    foreignKey: "usuario_modificacion_id",
    as: "usuario_modificacion",
  });
};
