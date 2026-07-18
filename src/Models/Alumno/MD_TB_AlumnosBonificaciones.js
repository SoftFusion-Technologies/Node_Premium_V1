/* Benjamin Orellana - 2026/07/15 - Auditoría de bonificaciones. */
import { DataTypes } from "sequelize";
import db from "../../DataBase/db.js";

const AlumnosBonificacionesModel = db.define(
  "alumnos_bonificaciones",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    alumno_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    sede_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    mensualidad_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    modalidad: {
      type: DataTypes.ENUM("reduccion_deuda", "saldo_favor"),
      allowNull: false,
    },
    tipo_valor: {
      type: DataTypes.ENUM("monto", "porcentaje"),
      allowNull: false,
    },
    valor_solicitado: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    monto_aplicado: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    motivo: { type: DataTypes.STRING(255), allowNull: false },
    observaciones: { type: DataTypes.STRING(500), allowNull: true },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "alumnos_bonificaciones",
    freezeTableName: true,
    timestamps: false,
  },
);

export default AlumnosBonificacionesModel;
