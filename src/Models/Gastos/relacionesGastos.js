/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 07 / 07 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (relacionesGastos.js) centraliza las relaciones Sequelize
 * del módulo de gastos operativos PREMIUM.
 *
 * Tema: Relaciones - Gastos
 *
 * Capa: Backend
 */

import GastosTiposModel from './MD_TB_GastosTipos.js';
import GastosProveedoresModel from './MD_TB_GastosProveedores.js';
import GastosPeriodicosModel from './MD_TB_GastosPeriodicos.js';
import GastosGastosModel from './MD_TB_GastosGastos.js';

let relacionesInicializadas = false;

export const initGastosRelaciones = () => {
  if (relacionesInicializadas) {
    return;
  }

  // Benjamin Orellana - 2026/07/07 - Un tipo de gasto puede agrupar muchos gastos puntuales.
  GastosTiposModel.hasMany(GastosGastosModel, {
    foreignKey: 'tipo_gasto_id',
    as: 'gastos'
  });

  GastosGastosModel.belongsTo(GastosTiposModel, {
    foreignKey: 'tipo_gasto_id',
    as: 'tipo_gasto'
  });

  // Benjamin Orellana - 2026/07/07 - Un proveedor puede estar asociado a muchos gastos.
  GastosProveedoresModel.hasMany(GastosGastosModel, {
    foreignKey: 'proveedor_id',
    as: 'gastos'
  });

  GastosGastosModel.belongsTo(GastosProveedoresModel, {
    foreignKey: 'proveedor_id',
    as: 'proveedor'
  });

  // Benjamin Orellana - 2026/07/07 - Un tipo de gasto puede agrupar muchos gastos periódicos.
  GastosTiposModel.hasMany(GastosPeriodicosModel, {
    foreignKey: 'tipo_gasto_id',
    as: 'gastos_periodicos'
  });

  GastosPeriodicosModel.belongsTo(GastosTiposModel, {
    foreignKey: 'tipo_gasto_id',
    as: 'tipo_gasto'
  });

  // Benjamin Orellana - 2026/07/07 - Un proveedor puede estar asociado a muchos gastos periódicos.
  GastosProveedoresModel.hasMany(GastosPeriodicosModel, {
    foreignKey: 'proveedor_id',
    as: 'gastos_periodicos'
  });

  GastosPeriodicosModel.belongsTo(GastosProveedoresModel, {
    foreignKey: 'proveedor_id',
    as: 'proveedor'
  });

  // Benjamin Orellana - 2026/07/07 - Un gasto periódico puede generar muchos gastos reales.
  GastosPeriodicosModel.hasMany(GastosGastosModel, {
    foreignKey: 'gasto_periodico_id',
    as: 'gastos_generados'
  });

  GastosGastosModel.belongsTo(GastosPeriodicosModel, {
    foreignKey: 'gasto_periodico_id',
    as: 'gasto_periodico'
  });

  relacionesInicializadas = true;
};

export {
  GastosTiposModel,
  GastosProveedoresModel,
  GastosPeriodicosModel,
  GastosGastosModel
};
