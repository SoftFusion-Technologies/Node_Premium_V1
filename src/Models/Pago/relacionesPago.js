/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (relacionesPago.js) contiene las relaciones Sequelize
 * del módulo Pago para PREMIUM.
 *
 * Tema: Relaciones - Pago
 *
 * Capa: Backend
 */

import PagosMediosPagoModel from './MD_TB_PagosMediosPago.js';
import PagosMensualidadesModel from './MD_TB_PagosMensualidades.js';
import PagosModel from './MD_TB_Pagos.js';
import PagosMetodosRecurrentesModel from './MD_TB_PagosMetodosRecurrentes.js';

import AlumnosModel from '../Alumno/MD_TB_Alumnos.js';
import AlumnosMembresiasModel from '../Alumno/MD_TB_AlumnosMembresias.js';
import SedesModel from '../Sede/MD_TB_Sedes.js';
import UsuariosModel from '../Usuario/MD_TB_Usuarios.js';

let relacionesInicializadas = false;

// Benjamin Orellana - 2026/05/10 - Inicializa relaciones Sequelize del módulo Pago.
export const initPagoRelaciones = () => {
  if (relacionesInicializadas) return;
  relacionesInicializadas = true;

  /*
   * alumnos_alumnos -> pagos_mensualidades
   * Un alumno puede tener muchas mensualidades emitidas.
   */
  AlumnosModel.hasMany(PagosMensualidadesModel, {
    foreignKey: 'alumno_id',
    as: 'mensualidades'
  });

  PagosMensualidadesModel.belongsTo(AlumnosModel, {
    foreignKey: 'alumno_id',
    as: 'alumno'
  });

  /*
   * alumnos_membresias -> pagos_mensualidades
   * Una mensualidad puede estar asociada opcionalmente a una membresía.
   */
  AlumnosMembresiasModel.hasMany(PagosMensualidadesModel, {
    foreignKey: 'membresia_id',
    as: 'mensualidades'
  });

  PagosMensualidadesModel.belongsTo(AlumnosMembresiasModel, {
    foreignKey: 'membresia_id',
    as: 'membresia'
  });

  /*
   * sedes_sedes -> pagos_mensualidades
   * Una sede puede tener muchas mensualidades generadas.
   */
  SedesModel.hasMany(PagosMensualidadesModel, {
    foreignKey: 'sede_id',
    as: 'pagos_mensualidades'
  });

  PagosMensualidadesModel.belongsTo(SedesModel, {
    foreignKey: 'sede_id',
    as: 'sede'
  });

  /*
   * pagos_mensualidades -> pagos_pagos
   * Una mensualidad puede tener uno o varios pagos parciales o totales.
   */
  PagosMensualidadesModel.hasMany(PagosModel, {
    foreignKey: 'mensualidad_id',
    as: 'pagos'
  });

  PagosModel.belongsTo(PagosMensualidadesModel, {
    foreignKey: 'mensualidad_id',
    as: 'mensualidad'
  });

  /*
   * alumnos_alumnos -> pagos_pagos
   * Un alumno puede registrar muchos pagos.
   */
  AlumnosModel.hasMany(PagosModel, {
    foreignKey: 'alumno_id',
    as: 'pagos'
  });

  PagosModel.belongsTo(AlumnosModel, {
    foreignKey: 'alumno_id',
    as: 'alumno'
  });

  /*
   * sedes_sedes -> pagos_pagos
   * Una sede puede tener muchos pagos registrados.
   */
  SedesModel.hasMany(PagosModel, {
    foreignKey: 'sede_id',
    as: 'pagos'
  });

  PagosModel.belongsTo(SedesModel, {
    foreignKey: 'sede_id',
    as: 'sede'
  });

  /*
   * pagos_medios_pago -> pagos_pagos
   * Un medio de pago puede estar asociado a muchos pagos.
   */
  PagosMediosPagoModel.hasMany(PagosModel, {
    foreignKey: 'medio_pago_id',
    as: 'pagos'
  });

  PagosModel.belongsTo(PagosMediosPagoModel, {
    foreignKey: 'medio_pago_id',
    as: 'medio_pago'
  });

  /*
   * usuarios_usuarios -> pagos_pagos
   * Usuario que registró el pago.
   */
  UsuariosModel.hasMany(PagosModel, {
    foreignKey: 'usuario_registro_id',
    as: 'pagos_registrados'
  });

  PagosModel.belongsTo(UsuariosModel, {
    foreignKey: 'usuario_registro_id',
    as: 'usuario_registro'
  });

  /*
   * usuarios_usuarios -> pagos_pagos
   * Usuario que validó el pago.
   */
  UsuariosModel.hasMany(PagosModel, {
    foreignKey: 'usuario_validacion_id',
    as: 'pagos_validados'
  });

  PagosModel.belongsTo(UsuariosModel, {
    foreignKey: 'usuario_validacion_id',
    as: 'usuario_validacion'
  });

  /*
   * alumnos_alumnos -> pagos_metodos_recurrentes
   * Un alumno puede tener métodos de pago recurrentes.
   */
  AlumnosModel.hasMany(PagosMetodosRecurrentesModel, {
    foreignKey: 'alumno_id',
    as: 'metodos_recurrentes'
  });

  PagosMetodosRecurrentesModel.belongsTo(AlumnosModel, {
    foreignKey: 'alumno_id',
    as: 'alumno'
  });

  /*
   * pagos_medios_pago -> pagos_metodos_recurrentes
   * Un medio de pago puede utilizarse como método recurrente.
   */
  PagosMediosPagoModel.hasMany(PagosMetodosRecurrentesModel, {
    foreignKey: 'medio_pago_id',
    as: 'metodos_recurrentes'
  });

  PagosMetodosRecurrentesModel.belongsTo(PagosMediosPagoModel, {
    foreignKey: 'medio_pago_id',
    as: 'medio_pago'
  });
};
