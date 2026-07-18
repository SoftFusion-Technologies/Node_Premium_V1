/* Benjamin Orellana - 2026/07/14 - Modelo de movimientos de stock PREMIUM. */
import dotenv from 'dotenv';
import { DataTypes } from 'sequelize';
import db from '../../DataBase/db.js';

if (process.env.NODE_ENV !== 'production') dotenv.config();

const ProductosStockMovimientosModel = db.define(
  'productos_stock_movimientos',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
    stock_sede_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    producto_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    sede_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    tipo: {
      type: DataTypes.ENUM('ingreso', 'egreso_venta', 'ajuste_positivo', 'ajuste_negativo', 'devolucion', 'merma'),
      allowNull: false
    },
    cantidad: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    stock_anterior: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    stock_nuevo: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    referencia_tipo: { type: DataTypes.STRING(60), allowNull: true },
    referencia_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    motivo: { type: DataTypes.STRING(500), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  },
  { tableName: 'productos_stock_movimientos', freezeTableName: true, timestamps: false }
);

export default ProductosStockMovimientosModel;
