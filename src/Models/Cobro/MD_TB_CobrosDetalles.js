/* Benjamin Orellana - 2026/07/14 - Modelo de conceptos cobrados PREMIUM. */
import { DataTypes } from 'sequelize';
import db from '../../DataBase/db.js';

const CobrosDetallesModel = db.define(
  'cobros_detalles',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    cobro_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    tipo: {
      type: DataTypes.ENUM('producto', 'servicio', 'plan'),
      allowNull: false
    },
    referencia_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    nombre_snapshot: { type: DataTypes.STRING(180), allowNull: false },
    categoria_snapshot: { type: DataTypes.STRING(160), allowNull: true },
    cantidad: {
      type: DataTypes.DECIMAL(14, 3),
      allowNull: false,
      defaultValue: 1
    },
    precio_catalogo: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0
    },
    precio_unitario: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0
    },
    descuento_porcentaje: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0
    },
    descuento_importe: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0
    },
    impuesto_porcentaje: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0
    },
    impuesto_importe: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0
    },
    importe: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0
    },
    total: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0
    },
    membresia_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    mensualidad_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    pago_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  { tableName: 'cobros_detalles', freezeTableName: true, timestamps: false }
);

export default CobrosDetallesModel;
