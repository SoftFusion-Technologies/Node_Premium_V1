/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (relacionesFinanzas.js) contiene las relaciones Sequelize
 * del módulo Finanzas para PREMIUM.
 *
 * Tema: Relaciones - Finanzas
 *
 * Capa: Backend
 */

import FinanzasCategoriasModel from './MD_TB_FinanzasCategorias.js';
import FinanzasMovimientosModel from './MD_TB_FinanzasMovimientos.js';
import FinanzasObjetivosModel from './MD_TB_FinanzasObjetivos.js';

import SedesModel from '../Sede/MD_TB_Sedes.js';
import PagosModel from '../Pago/MD_TB_Pagos.js';
import UsuariosModel from '../Usuario/MD_TB_Usuarios.js';

let relacionesInicializadas = false;

// Benjamin Orellana - 2026/05/10 - Inicializa relaciones Sequelize del módulo Finanzas.
export const initFinanzasRelaciones = () => {
  if (relacionesInicializadas) return;
  relacionesInicializadas = true;

  /*
   * sedes_sedes -> finanzas_movimientos
   * Una sede puede tener muchos movimientos financieros.
   */
  SedesModel.hasMany(FinanzasMovimientosModel, {
    foreignKey: 'sede_id',
    as: 'finanzas_movimientos'
  });

  FinanzasMovimientosModel.belongsTo(SedesModel, {
    foreignKey: 'sede_id',
    as: 'sede'
  });

  /*
   * finanzas_categorias -> finanzas_movimientos
   * Una categoría financiera puede estar asociada a muchos movimientos.
   */
  FinanzasCategoriasModel.hasMany(FinanzasMovimientosModel, {
    foreignKey: 'categoria_id',
    as: 'movimientos'
  });

  FinanzasMovimientosModel.belongsTo(FinanzasCategoriasModel, {
    foreignKey: 'categoria_id',
    as: 'categoria'
  });

  /*
   * pagos_pagos -> finanzas_movimientos
   * Un pago puede generar uno o varios movimientos financieros.
   */
  PagosModel.hasMany(FinanzasMovimientosModel, {
    foreignKey: 'pago_id',
    as: 'finanzas_movimientos'
  });

  FinanzasMovimientosModel.belongsTo(PagosModel, {
    foreignKey: 'pago_id',
    as: 'pago'
  });

  /*
   * usuarios_usuarios -> finanzas_movimientos
   * Usuario que registró el movimiento financiero.
   */
  UsuariosModel.hasMany(FinanzasMovimientosModel, {
    foreignKey: 'usuario_registro_id',
    as: 'finanzas_movimientos_registrados'
  });

  FinanzasMovimientosModel.belongsTo(UsuariosModel, {
    foreignKey: 'usuario_registro_id',
    as: 'usuario_registro'
  });

  /*
   * sedes_sedes -> finanzas_objetivos
   * Una sede puede tener muchos objetivos financieros.
   */
  SedesModel.hasMany(FinanzasObjetivosModel, {
    foreignKey: 'sede_id',
    as: 'finanzas_objetivos'
  });

  FinanzasObjetivosModel.belongsTo(SedesModel, {
    foreignKey: 'sede_id',
    as: 'sede'
  });
};
