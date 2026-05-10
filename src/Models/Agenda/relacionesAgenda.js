/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (relacionesAgenda.js) contiene las relaciones Sequelize
 * del módulo Agenda para PREMIUM.
 *
 * Tema: Relaciones - Agenda
 *
 * Capa: Backend
 */

import AgendaHorariosSedeModel from './MD_TB_AgendaHorariosSede.js';
import AgendaTurnosModel from './MD_TB_AgendaTurnos.js';
import AgendaTurnosReservasModel from './MD_TB_AgendaTurnosReservas.js';
import AgendaTurnosListaEsperaModel from './MD_TB_AgendaTurnosListaEspera.js';

import SedesModel from '../Sede/MD_TB_Sedes.js';
import UsuariosModel from '../Usuario/MD_TB_Usuarios.js';
import AlumnosModel from '../Alumno/MD_TB_Alumnos.js';
import AlumnosMembresiasModel from '../Alumno/MD_TB_AlumnosMembresias.js';

let relacionesInicializadas = false;

// Benjamin Orellana - 2026/05/10 - Inicializa relaciones Sequelize del módulo Agenda.
export const initAgendaRelaciones = () => {
  if (relacionesInicializadas) return;
  relacionesInicializadas = true;

  /*
   * sedes_sedes -> agenda_horarios_sede
   * Una sede puede tener muchos horarios configurados.
   */
  SedesModel.hasMany(AgendaHorariosSedeModel, {
    foreignKey: 'sede_id',
    as: 'agenda_horarios_sede'
  });

  AgendaHorariosSedeModel.belongsTo(SedesModel, {
    foreignKey: 'sede_id',
    as: 'sede'
  });

  /*
   * usuarios_usuarios -> agenda_horarios_sede
   * Un profesor puede tener muchos horarios configurados.
   */
  UsuariosModel.hasMany(AgendaHorariosSedeModel, {
    foreignKey: 'profesor_id',
    as: 'agenda_horarios_profesor'
  });

  AgendaHorariosSedeModel.belongsTo(UsuariosModel, {
    foreignKey: 'profesor_id',
    as: 'profesor'
  });

  /*
   * agenda_horarios_sede -> agenda_turnos
   * Un horario base puede generar muchos turnos.
   */
  AgendaHorariosSedeModel.hasMany(AgendaTurnosModel, {
    foreignKey: 'horario_sede_id',
    as: 'turnos'
  });

  AgendaTurnosModel.belongsTo(AgendaHorariosSedeModel, {
    foreignKey: 'horario_sede_id',
    as: 'horario_sede'
  });

  /*
   * sedes_sedes -> agenda_turnos
   * Una sede puede tener muchos turnos.
   */
  SedesModel.hasMany(AgendaTurnosModel, {
    foreignKey: 'sede_id',
    as: 'agenda_turnos'
  });

  AgendaTurnosModel.belongsTo(SedesModel, {
    foreignKey: 'sede_id',
    as: 'sede'
  });

  /*
   * usuarios_usuarios -> agenda_turnos
   * Un profesor puede estar asignado a muchos turnos.
   */
  UsuariosModel.hasMany(AgendaTurnosModel, {
    foreignKey: 'profesor_id',
    as: 'agenda_turnos_profesor'
  });

  AgendaTurnosModel.belongsTo(UsuariosModel, {
    foreignKey: 'profesor_id',
    as: 'profesor'
  });

  /*
   * agenda_turnos -> agenda_turnos_reservas
   * Un turno puede tener muchas reservas.
   */
  AgendaTurnosModel.hasMany(AgendaTurnosReservasModel, {
    foreignKey: 'turno_id',
    as: 'reservas'
  });

  AgendaTurnosReservasModel.belongsTo(AgendaTurnosModel, {
    foreignKey: 'turno_id',
    as: 'turno'
  });

  /*
   * alumnos_alumnos -> agenda_turnos_reservas
   * Un alumno puede tener muchas reservas de turnos.
   */
  AlumnosModel.hasMany(AgendaTurnosReservasModel, {
    foreignKey: 'alumno_id',
    as: 'turnos_reservas'
  });

  AgendaTurnosReservasModel.belongsTo(AlumnosModel, {
    foreignKey: 'alumno_id',
    as: 'alumno'
  });

  /*
   * alumnos_membresias -> agenda_turnos_reservas
   * Una reserva puede estar asociada opcionalmente a una membresía.
   */
  AlumnosMembresiasModel.hasMany(AgendaTurnosReservasModel, {
    foreignKey: 'membresia_id',
    as: 'turnos_reservas'
  });

  AgendaTurnosReservasModel.belongsTo(AlumnosMembresiasModel, {
    foreignKey: 'membresia_id',
    as: 'membresia'
  });

  /*
   * agenda_turnos -> agenda_turnos_lista_espera
   * Un turno puede tener muchos alumnos en lista de espera.
   */
  AgendaTurnosModel.hasMany(AgendaTurnosListaEsperaModel, {
    foreignKey: 'turno_id',
    as: 'lista_espera'
  });

  AgendaTurnosListaEsperaModel.belongsTo(AgendaTurnosModel, {
    foreignKey: 'turno_id',
    as: 'turno'
  });

  /*
   * alumnos_alumnos -> agenda_turnos_lista_espera
   * Un alumno puede estar en muchas listas de espera.
   */
  AlumnosModel.hasMany(AgendaTurnosListaEsperaModel, {
    foreignKey: 'alumno_id',
    as: 'turnos_lista_espera'
  });

  AgendaTurnosListaEsperaModel.belongsTo(AlumnosModel, {
    foreignKey: 'alumno_id',
    as: 'alumno'
  });
};
