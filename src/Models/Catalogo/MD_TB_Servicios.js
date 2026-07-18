/* Benjamin Orellana - 2026/07/14 - Modelo del catálogo de servicios PREMIUM. */
import dotenv from 'dotenv';
import { DataTypes } from 'sequelize';
import db from '../../DataBase/db.js';

if (process.env.NODE_ENV !== 'production') dotenv.config();

const ServiciosModel = db.define(
  'servicios_servicios',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    categoria_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    nombre: { type: DataTypes.STRING(160), allowNull: false },
    codigo: { type: DataTypes.STRING(80), allowNull: false },
    descripcion: { type: DataTypes.STRING(500), allowNull: true },
    duracion_minutos: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true },
    requiere_agenda: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },
    alicuota_iva: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 21.0
    },
    precio_incluye_iva: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
    imagen_url: { type: DataTypes.STRING(500), allowNull: true },
    orden: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    activo: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null }
  },
  { tableName: 'servicios_servicios', freezeTableName: true, timestamps: false }
);

export default ServiciosModel;
