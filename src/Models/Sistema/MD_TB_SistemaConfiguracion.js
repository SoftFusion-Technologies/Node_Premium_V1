/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_SistemaConfiguracion.js) contiene la definición
 * del modelo Sequelize para la tabla sistema_configuracion.
 *
 * Tema: Modelos - Sistema
 *
 * Capa: Backend
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

// Benjamin Orellana - 2026/05/10 - Carga variables de entorno fuera de producción.
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const SistemaConfiguracionModel = db.define(
  'sistema_configuracion',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    clave: {
      type: DataTypes.STRING(120),
      allowNull: false
    },

    valor: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    descripcion: {
      type: DataTypes.STRING(255),
      allowNull: true
    },

    activo: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },

    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },

    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    }
  },
  {
    tableName: 'sistema_configuracion',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'uq_sistema_configuracion_clave',
        unique: true,
        fields: ['clave']
      }
    ]
  }
);

export default SistemaConfiguracionModel;
