/* Benjamin Orellana - 2026/07/14 - Modelo de cajas operativas PREMIUM. */
import { DataTypes } from 'sequelize';
import db from '../../DataBase/db.js';

const CajasModel = db.define(
  'cajas_cajas',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
    sede_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    nombre: { type: DataTypes.STRING(120), allowNull: false },
    codigo: { type: DataTypes.STRING(80), allowNull: false },
    activo: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: true }
  },
  { tableName: 'cajas_cajas', freezeTableName: true, timestamps: false }
);

export default CajasModel;
