/* Benjamin Orellana - 2026/07/15 - Cuenta de saldo a favor por alumno. */
import { DataTypes } from "sequelize";
import db from "../../DataBase/db.js";

const AlumnosSaldosModel = db.define(
  "alumnos_saldos",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    alumno_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    moneda: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: "ARS",
    },
    saldo: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "alumnos_saldos", freezeTableName: true, timestamps: false },
);

export default AlumnosSaldosModel;
