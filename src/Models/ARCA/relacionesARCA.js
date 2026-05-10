/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (relacionesARCA.js) contiene las relaciones Sequelize
 * del módulo ARCA para PREMIUM.
 *
 * Tema: Relaciones - ARCA
 *
 * Capa: Backend
 */

import ArcaEmpresasModel from './MD_TB_ArcaEmpresas.js';
import ArcaPuntosVentaModel from './MD_TB_ArcaPuntosVenta.js';
import ArcaComprobantesModel from './MD_TB_ArcaComprobantes.js';
import ArcaTokensModel from './MD_TB_ArcaTokens.js';

import SedesModel from '../Sede/MD_TB_Sedes.js';
import AlumnosModel from '../Alumno/MD_TB_Alumnos.js';
import PagosModel from '../Pago/MD_TB_Pagos.js';

let relacionesInicializadas = false;

// Benjamin Orellana - 2026/05/10 - Inicializa relaciones Sequelize del módulo ARCA.
export const initArcaRelaciones = () => {
  if (relacionesInicializadas) return;
  relacionesInicializadas = true;

  /*
   * arca_empresas -> arca_puntos_venta
   * Una empresa fiscal puede tener muchos puntos de venta.
   */
  ArcaEmpresasModel.hasMany(ArcaPuntosVentaModel, {
    foreignKey: 'empresa_id',
    as: 'puntos_venta'
  });

  ArcaPuntosVentaModel.belongsTo(ArcaEmpresasModel, {
    foreignKey: 'empresa_id',
    as: 'empresa'
  });

  /*
   * sedes_sedes -> arca_puntos_venta
   * Una sede puede estar asociada opcionalmente a puntos de venta fiscales.
   */
  SedesModel.hasMany(ArcaPuntosVentaModel, {
    foreignKey: 'sede_id',
    as: 'arca_puntos_venta'
  });

  ArcaPuntosVentaModel.belongsTo(SedesModel, {
    foreignKey: 'sede_id',
    as: 'sede'
  });

  /*
   * arca_empresas -> arca_comprobantes
   * Una empresa fiscal puede emitir muchos comprobantes.
   */
  ArcaEmpresasModel.hasMany(ArcaComprobantesModel, {
    foreignKey: 'empresa_id',
    as: 'comprobantes'
  });

  ArcaComprobantesModel.belongsTo(ArcaEmpresasModel, {
    foreignKey: 'empresa_id',
    as: 'empresa'
  });

  /*
   * arca_puntos_venta -> arca_comprobantes
   * Un punto de venta puede emitir muchos comprobantes.
   */
  ArcaPuntosVentaModel.hasMany(ArcaComprobantesModel, {
    foreignKey: 'punto_venta_id',
    as: 'comprobantes'
  });

  ArcaComprobantesModel.belongsTo(ArcaPuntosVentaModel, {
    foreignKey: 'punto_venta_id',
    as: 'punto_venta'
  });

  /*
   * alumnos_alumnos -> arca_comprobantes
   * Un alumno puede tener comprobantes fiscales asociados.
   */
  AlumnosModel.hasMany(ArcaComprobantesModel, {
    foreignKey: 'alumno_id',
    as: 'arca_comprobantes'
  });

  ArcaComprobantesModel.belongsTo(AlumnosModel, {
    foreignKey: 'alumno_id',
    as: 'alumno'
  });

  /*
   * pagos_pagos -> arca_comprobantes
   * Un pago puede tener comprobantes fiscales asociados.
   */
  PagosModel.hasMany(ArcaComprobantesModel, {
    foreignKey: 'pago_id',
    as: 'arca_comprobantes'
  });

  ArcaComprobantesModel.belongsTo(PagosModel, {
    foreignKey: 'pago_id',
    as: 'pago'
  });

  /*
   * arca_empresas -> arca_tokens
   * Una empresa fiscal puede tener tokens por ambiente y servicio.
   */
  ArcaEmpresasModel.hasMany(ArcaTokensModel, {
    foreignKey: 'empresa_id',
    as: 'tokens'
  });

  ArcaTokensModel.belongsTo(ArcaEmpresasModel, {
    foreignKey: 'empresa_id',
    as: 'empresa'
  });
};
