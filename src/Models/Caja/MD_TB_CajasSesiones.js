/* Benjamin Orellana - 2026/07/14 - Modelo de aperturas y cierres de caja PREMIUM. */
import { DataTypes } from 'sequelize';
import db from '../../DataBase/db.js';

const CajasSesionesModel = db.define(
  'cajas_sesiones',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
    caja_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    sede_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    usuario_apertura_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    usuario_cierre_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    fecha_apertura: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    fecha_cierre: { type: DataTypes.DATE, allowNull: true },
    monto_inicial: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    sesion_anterior_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    monto_sugerido_apertura: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    diferencia_apertura: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    observacion_diferencia_apertura: { type: DataTypes.STRING(500), allowNull: true },
    requiere_revision_apertura: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    monto_esperado: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    monto_contado: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    diferencia: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    estado: { type: DataTypes.ENUM('abierta', 'cerrada', 'anulada'), allowNull: false, defaultValue: 'abierta' },
    clave_abierta: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    observaciones: { type: DataTypes.STRING(500), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: true }
  },
  { tableName: 'cajas_sesiones', freezeTableName: true, timestamps: false }
);

export default CajasSesionesModel;
