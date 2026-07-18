/* Benjamin Orellana - 2026/07/14 - Modelo de precios históricos de productos. */
import dotenv from 'dotenv';
import { DataTypes } from 'sequelize';
import db from '../../DataBase/db.js';

if (process.env.NODE_ENV !== 'production') dotenv.config();

const ProductosPreciosModel = db.define(
  'productos_precios',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
    producto_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    sede_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    precio: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0.0 },
    costo_referencia: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    moneda: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'ARS' },
    fecha_desde: { type: DataTypes.DATEONLY, allowNull: false },
    fecha_hasta: { type: DataTypes.DATEONLY, allowNull: true },
    activo: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null }
  },
  { tableName: 'productos_precios', freezeTableName: true, timestamps: false }
);

export default ProductosPreciosModel;
