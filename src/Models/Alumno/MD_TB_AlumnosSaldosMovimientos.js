/* Benjamin Orellana - 2026/07/15 - Libro mayor de saldo a favor. */
import { DataTypes } from "sequelize";
import db from "../../DataBase/db.js";

const AlumnosSaldosMovimientosModel = db.define(
  "alumnos_saldos_movimientos",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    saldo_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    alumno_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    sede_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    tipo: {
      type: DataTypes.ENUM("credito", "debito"),
      allowNull: false,
    },
    origen: {
      type: DataTypes.ENUM(
        "bonificacion",
        "carga_saldo",
        "uso_cobro",
        "reversion",
        "ajuste",
      ),
      allowNull: false,
    },
    monto: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    saldo_anterior: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    saldo_nuevo: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    cobro_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    bonificacion_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    referencia: { type: DataTypes.STRING(120), allowNull: true },
    motivo: { type: DataTypes.STRING(255), allowNull: true },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "alumnos_saldos_movimientos",
    freezeTableName: true,
    timestamps: false,
  },
);

export default AlumnosSaldosMovimientosModel;
