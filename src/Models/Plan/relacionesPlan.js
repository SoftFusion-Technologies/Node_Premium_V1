/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (relacionesPlan.js) contiene las relaciones Sequelize
 * del módulo Plan para PREMIUM.
 *
 * Tema: Relaciones - Plan
 *
 * Capa: Backend
 */

import PlanesModel from './MD_TB_Planes.js';
import PlanesPreciosModel from './MD_TB_PlanesPrecios.js';

import SedesModel from '../Sede/MD_TB_Sedes.js';

let relacionesInicializadas = false;

// Benjamin Orellana - 2026/05/10 - Inicializa relaciones Sequelize del módulo Plan.
export const initPlanRelaciones = () => {
  if (relacionesInicializadas) return;
  relacionesInicializadas = true;

  /*
   * planes_planes -> planes_precios
   * Un plan puede tener muchos precios históricos o vigentes.
   */
  PlanesModel.hasMany(PlanesPreciosModel, {
    foreignKey: 'plan_id',
    as: 'precios'
  });

  PlanesPreciosModel.belongsTo(PlanesModel, {
    foreignKey: 'plan_id',
    as: 'plan'
  });

  /*
   * sedes_sedes -> planes_precios
   * Una sede puede tener precios específicos por plan.
   * El campo sede_id es opcional, por lo tanto puede haber precios globales sin sede.
   */
  SedesModel.hasMany(PlanesPreciosModel, {
    foreignKey: 'sede_id',
    as: 'planes_precios'
  });

  PlanesPreciosModel.belongsTo(SedesModel, {
    foreignKey: 'sede_id',
    as: 'sede'
  });
};
