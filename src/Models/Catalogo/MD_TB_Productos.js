/* Benjamin Orellana - 2026/07/14 - Modelo del catálogo de productos PREMIUM. */
import dotenv from 'dotenv';
import { DataTypes } from 'sequelize';
import db from '../../DataBase/db.js';

if (process.env.NODE_ENV !== 'production') dotenv.config();

const ProductosModel = db.define(
  'productos_productos',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
    categoria_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    subcategoria_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    tipo_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    nombre: { type: DataTypes.STRING(160), allowNull: false },
    codigo: { type: DataTypes.STRING(80), allowNull: false },
    sku: { type: DataTypes.STRING(100), allowNull: true },
    codigo_barras: { type: DataTypes.STRING(120), allowNull: true },
    descripcion: { type: DataTypes.STRING(500), allowNull: true },
    marca: { type: DataTypes.STRING(120), allowNull: true },
    proveedor: { type: DataTypes.STRING(160), allowNull: true },
    unidad_medida: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'unidad' },
    controla_stock: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    permite_stock_negativo: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    alicuota_iva: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 21.0 },
    precio_incluye_iva: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    imagen_url: { type: DataTypes.STRING(500), allowNull: true },
    orden: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    activo: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null }
  },
  { tableName: 'productos_productos', freezeTableName: true, timestamps: false }
);

export default ProductosModel;
