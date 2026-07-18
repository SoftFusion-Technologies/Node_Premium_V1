/* Benjamin Orellana - 2026/07/14 - Modelo de stock de productos por sede. */
import dotenv from 'dotenv';
import { DataTypes } from 'sequelize';
import db from '../../DataBase/db.js';

if (process.env.NODE_ENV !== 'production') dotenv.config();

const ProductosStockSedesModel = db.define(
  'productos_stock_sedes',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
    producto_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    sede_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    cantidad_actual: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0.0 },
    cantidad_reservada: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0.0 },
    cantidad_minima: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
    cantidad_maxima: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
    ubicacion: { type: DataTypes.STRING(160), allowNull: true },
    activo: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null }
  },
  { tableName: 'productos_stock_sedes', freezeTableName: true, timestamps: false }
);

export default ProductosStockSedesModel;
