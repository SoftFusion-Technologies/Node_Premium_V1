/* Benjamin Orellana - 2026/07/14 - Relaciones de Cobros y Caja PREMIUM. */
import CajasModel from '../Caja/MD_TB_Cajas.js';
import CajasSesionesModel from '../Caja/MD_TB_CajasSesiones.js';
import CajasMovimientosModel from '../Caja/MD_TB_CajasMovimientos.js';
import CobrosModel from './MD_TB_Cobros.js';
import CobrosDetallesModel from './MD_TB_CobrosDetalles.js';
import CobrosPagosModel from './MD_TB_CobrosPagos.js';

import SedesModel from '../Sede/MD_TB_Sedes.js';
import UsuariosModel from '../Usuario/MD_TB_Usuarios.js';
import AlumnosModel from '../Alumno/MD_TB_Alumnos.js';
import AlumnosMembresiasModel from '../Alumno/MD_TB_AlumnosMembresias.js';
import PagosMensualidadesModel from '../Pago/MD_TB_PagosMensualidades.js';
import PagosModel from '../Pago/MD_TB_Pagos.js';
import PagosMediosPagoModel from '../Pago/MD_TB_PagosMediosPago.js';
import FinanzasMovimientosModel from '../Finanzas/MD_TB_FinanzasMovimientos.js';
import GastosGastosModel from '../Gastos/MD_TB_GastosGastos.js';

let relacionesInicializadas = false;

export const initCobroCajaRelaciones = () => {
  if (relacionesInicializadas) return;
  relacionesInicializadas = true;

  SedesModel.hasMany(CajasModel, { foreignKey: 'sede_id', as: 'cajas' });
  CajasModel.belongsTo(SedesModel, { foreignKey: 'sede_id', as: 'sede' });
  CajasModel.hasMany(CajasSesionesModel, { foreignKey: 'caja_id', as: 'sesiones' });
  CajasSesionesModel.belongsTo(CajasModel, { foreignKey: 'caja_id', as: 'caja' });

  CajasSesionesModel.hasMany(CobrosModel, { foreignKey: 'caja_sesion_id', as: 'cobros' });
  CobrosModel.belongsTo(CajasSesionesModel, { foreignKey: 'caja_sesion_id', as: 'caja_sesion' });
  SedesModel.hasMany(CobrosModel, { foreignKey: 'sede_id', as: 'cobros' });
  CobrosModel.belongsTo(SedesModel, { foreignKey: 'sede_id', as: 'sede' });
  AlumnosModel.hasMany(CobrosModel, { foreignKey: 'alumno_id', as: 'cobros' });
  CobrosModel.belongsTo(AlumnosModel, { foreignKey: 'alumno_id', as: 'alumno' });

  CobrosModel.hasMany(CobrosDetallesModel, { foreignKey: 'cobro_id', as: 'detalles' });
  CobrosDetallesModel.belongsTo(CobrosModel, { foreignKey: 'cobro_id', as: 'cobro' });
  CobrosModel.hasMany(CobrosPagosModel, { foreignKey: 'cobro_id', as: 'pagos_cobro' });
  CobrosPagosModel.belongsTo(CobrosModel, { foreignKey: 'cobro_id', as: 'cobro' });
  PagosMediosPagoModel.hasMany(CobrosPagosModel, { foreignKey: 'medio_pago_id', as: 'cobros_pagos' });
  CobrosPagosModel.belongsTo(PagosMediosPagoModel, { foreignKey: 'medio_pago_id', as: 'medio_pago' });

  AlumnosMembresiasModel.hasMany(CobrosDetallesModel, { foreignKey: 'membresia_id', as: 'cobros_detalles' });
  CobrosDetallesModel.belongsTo(AlumnosMembresiasModel, { foreignKey: 'membresia_id', as: 'membresia' });
  PagosMensualidadesModel.hasMany(CobrosDetallesModel, { foreignKey: 'mensualidad_id', as: 'cobros_detalles' });
  CobrosDetallesModel.belongsTo(PagosMensualidadesModel, { foreignKey: 'mensualidad_id', as: 'mensualidad' });
  PagosModel.hasMany(CobrosDetallesModel, { foreignKey: 'pago_id', as: 'cobros_detalles' });
  CobrosDetallesModel.belongsTo(PagosModel, { foreignKey: 'pago_id', as: 'pago' });
  FinanzasMovimientosModel.hasOne(CobrosModel, { foreignKey: 'finanzas_movimiento_id', as: 'cobro' });
  CobrosModel.belongsTo(FinanzasMovimientosModel, { foreignKey: 'finanzas_movimiento_id', as: 'movimiento_financiero' });

  CajasSesionesModel.hasMany(CajasMovimientosModel, { foreignKey: 'caja_sesion_id', as: 'movimientos' });
  CajasMovimientosModel.belongsTo(CajasSesionesModel, { foreignKey: 'caja_sesion_id', as: 'sesion' });
  CajasModel.hasMany(CajasMovimientosModel, { foreignKey: 'caja_id', as: 'movimientos' });
  CajasMovimientosModel.belongsTo(CajasModel, { foreignKey: 'caja_id', as: 'caja' });
  CobrosPagosModel.hasMany(CajasMovimientosModel, { foreignKey: 'cobro_pago_id', as: 'movimientos_caja' });
  CajasMovimientosModel.belongsTo(CobrosPagosModel, { foreignKey: 'cobro_pago_id', as: 'cobro_pago' });
  GastosGastosModel.hasMany(CajasMovimientosModel, { foreignKey: 'gasto_id', as: 'movimientos_caja' });
  CajasMovimientosModel.belongsTo(GastosGastosModel, { foreignKey: 'gasto_id', as: 'gasto' });

  UsuariosModel.hasMany(CobrosModel, { foreignKey: 'cobrador_usuario_id', as: 'cobros_realizados' });
  CobrosModel.belongsTo(UsuariosModel, { foreignKey: 'cobrador_usuario_id', as: 'cobrador' });
};
