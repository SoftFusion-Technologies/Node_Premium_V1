/* Benjamin Orellana - 2026/08/19 - Cuenta de saldo a favor por empleado/usuario. */
import { DataTypes } from "sequelize";
import db from "../../DataBase/db.js";

const UsuariosSaldosModel = db.define(
  "usuarios_saldos",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true },
    moneda: { type: DataTypes.STRING(10), allowNull: false, defaultValue: "ARS" },
    saldo: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "usuarios_saldos", freezeTableName: true, timestamps: false },
);

export default UsuariosSaldosModel;
