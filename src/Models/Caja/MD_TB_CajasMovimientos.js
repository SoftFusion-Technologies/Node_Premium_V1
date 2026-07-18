/* Benjamin Orellana - 2026/07/14 - Modelo de movimientos operativos de caja PREMIUM. */
import { DataTypes } from 'sequelize';
import db from '../../DataBase/db.js';

const CajasMovimientosModel = db.define(
  'cajas_movimientos',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
    caja_sesion_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    caja_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    sede_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    cobro_pago_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    gasto_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    medio_pago_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    usuario_registro_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    tipo: { type: DataTypes.ENUM('ingreso', 'egreso'), allowNull: false },
    origen: { type: DataTypes.ENUM('cobro', 'gasto', 'manual', 'ajuste', 'reversion'), allowNull: false },
    fecha_movimiento: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    monto: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    descripcion: { type: DataTypes.STRING(255), allowNull: false },
    estado: { type: DataTypes.ENUM('vigente', 'anulado'), allowNull: false, defaultValue: 'vigente' },
    referencia: { type: DataTypes.STRING(120), allowNull: true },
    observaciones: { type: DataTypes.STRING(500), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: true }
  },
  { tableName: 'cajas_movimientos', freezeTableName: true, timestamps: false }
);

export default CajasMovimientosModel;
