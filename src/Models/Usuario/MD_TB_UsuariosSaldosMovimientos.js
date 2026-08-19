/* Benjamin Orellana - 2026/08/19 - Libro mayor de saldo a favor de empleados. */
import { DataTypes } from "sequelize";
import db from "../../DataBase/db.js";

const UsuariosSaldosMovimientosModel = db.define(
  "usuarios_saldos_movimientos",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
    saldo_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    usuario_cliente_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    sede_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    usuario_registro_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    tipo: { type: DataTypes.ENUM("credito", "debito"), allowNull: false },
    origen: { type: DataTypes.STRING(40), allowNull: false },
    monto: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    saldo_anterior: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    saldo_nuevo: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    cobro_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    referencia: { type: DataTypes.STRING(120), allowNull: true },
    motivo: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { tableName: "usuarios_saldos_movimientos", freezeTableName: true, timestamps: false },
);

export default UsuariosSaldosMovimientosModel;
