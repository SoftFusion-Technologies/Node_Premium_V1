/* Benjamin Orellana - 2026/07/14 - Modelo de tipos de productos PREMIUM. */
import dotenv from 'dotenv';
import { DataTypes } from 'sequelize';
import db from '../../DataBase/db.js';

if (process.env.NODE_ENV !== 'production') dotenv.config();

const ProductosTiposModel = db.define(
  'productos_tipos',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
    nombre: { type: DataTypes.STRING(120), allowNull: false },
    codigo: { type: DataTypes.STRING(60), allowNull: false },
    descripcion: { type: DataTypes.STRING(500), allowNull: true },
    orden: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    activo: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null }
  },
  { tableName: 'productos_tipos', freezeTableName: true, timestamps: false }
);

export default ProductosTiposModel;
