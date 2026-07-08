/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 07 / 07 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_GastosTipos.js) contiene la definición
 * del modelo Sequelize para la tabla gastos_tipos.
 *
 * Tema: Modelos - Gastos
 *
 * Capa: Backend
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

// Benjamin Orellana - 2026/07/07 - Carga variables de entorno fuera de producción.
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const GastosTiposModel = db.define(
  'gastos_tipos',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    nombre: {
      type: DataTypes.STRING(120),
      allowNull: false
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
    tableName: 'gastos_tipos',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'uq_gastos_tipos_nombre',
        unique: true,
        fields: ['nombre']
      },
      {
        name: 'idx_gastos_tipos_activo',
        fields: ['activo']
      }
    ]
  }
);

export default GastosTiposModel;
