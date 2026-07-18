/* Benjamin Orellana - 2026/07/14 - Modelo de subcategorías de productos. */
import dotenv from 'dotenv';
import { DataTypes } from 'sequelize';
import db from '../../DataBase/db.js';

if (process.env.NODE_ENV !== 'production') dotenv.config();

const ProductosSubcategoriasModel = db.define(
  'productos_subcategorias',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
    categoria_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    nombre: { type: DataTypes.STRING(120), allowNull: false },
    codigo: { type: DataTypes.STRING(60), allowNull: false },
    descripcion: { type: DataTypes.STRING(500), allowNull: true },
    orden: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    activo: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null }
  },
  { tableName: 'productos_subcategorias', freezeTableName: true, timestamps: false }
);

export default ProductosSubcategoriasModel;
