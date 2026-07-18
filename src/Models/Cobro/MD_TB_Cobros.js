/* Benjamin Orellana - 2026/07/14 - Modelo cabecera de cobros PREMIUM. */
import { DataTypes } from 'sequelize';
import db from '../../DataBase/db.js';

const CobrosModel = db.define(
  'cobros_cobros',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    idempotency_key: { type: DataTypes.STRING(100), allowNull: false },
    sede_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    caja_sesion_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    cliente_tipo: {
      type: DataTypes.ENUM('alumno', 'empleado', 'sin_cliente'),
      allowNull: false
    },
    alumno_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    cliente_usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    cobrador_usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    usuario_registro_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    finanzas_movimiento_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    finanzas_reversion_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    fecha_cobro: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    moneda: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'ARS'
    },
    importe: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0
    },
    descuentos: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0
    },
    impuestos: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0
    },
    total: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0
    },
    estado: {
      type: DataTypes.ENUM(
        'pendiente_validacion',
        'confirmado',
        'rechazado',
        'anulado'
      ),
      allowNull: false,
      defaultValue: 'confirmado'
    },
    observaciones: { type: DataTypes.STRING(500), allowNull: true },
    usuario_anulacion_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    fecha_anulacion: { type: DataTypes.DATE, allowNull: true },
    motivo_anulacion: { type: DataTypes.STRING(500), allowNull: true },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: { type: DataTypes.DATE, allowNull: true }
  },
  { tableName: 'cobros_cobros', freezeTableName: true, timestamps: false }
);

export default CobrosModel;
