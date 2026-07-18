/* Benjamin Orellana - 2026/07/14 - Modelo de precios históricos de servicios. */
import dotenv from 'dotenv';
import { DataTypes } from 'sequelize';
import db from '../../DataBase/db.js';

if (process.env.NODE_ENV !== 'production') dotenv.config();

const ServiciosPreciosModel = db.define(
  'servicios_precios',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
    servicio_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    sede_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    precio: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0.0 },
    moneda: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'ARS' },
    fecha_desde: { type: DataTypes.DATEONLY, allowNull: false },
    fecha_hasta: { type: DataTypes.DATEONLY, allowNull: true },
    activo: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null }
  },
  { tableName: 'servicios_precios', freezeTableName: true, timestamps: false }
);

export default ServiciosPreciosModel;
