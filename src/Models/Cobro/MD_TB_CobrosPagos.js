/* Benjamin Orellana - 2026/07/14 - Modelo de medios aplicados a cobros PREMIUM. */
import { DataTypes } from 'sequelize';
import db from '../../DataBase/db.js';

const CobrosPagosModel = db.define(
  'cobros_pagos',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    cobro_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    medio_pago_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    monto: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    estado: {
      type: DataTypes.ENUM(
        'pendiente_validacion',
        'confirmado',
        'rechazado',
        'anulado'
      ),
      allowNull: false,
      defaultValue: 'confirmado'
    },
    referencia: { type: DataTypes.STRING(120), allowNull: true },
    comprobante_url: { type: DataTypes.STRING(255), allowNull: true },
    usuario_validacion_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    fecha_validacion: { type: DataTypes.DATE, allowNull: true },
    observaciones_validacion: { type: DataTypes.STRING(500), allowNull: true },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: { type: DataTypes.DATE, allowNull: true }
  },
  { tableName: 'cobros_pagos', freezeTableName: true, timestamps: false }
);

export default CobrosPagosModel;
