/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_Planes.js) contiene la definición
 * del modelo Sequelize para la tabla planes_planes.
 *
 * Tema: Modelos - Plan
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

const PlanesModel = db.define(
  'planes_planes',
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

    codigo: {
      type: DataTypes.STRING(80),
      allowNull: false
    },

    clases_por_mes: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    cantidad_clases_periodo: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    periodo: {
      type: DataTypes.ENUM('mensual', 'trimestral', 'semestral', 'anual'),
      allowNull: false
    },

    duracion_dias: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    descripcion: {
      type: DataTypes.STRING(255),
      allowNull: true
    },

    permite_reserva: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },

    permite_acumulacion: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },

    agenda_restricciones: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null
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
    tableName: 'planes_planes',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'uq_planes_codigo',
        unique: true,
        fields: ['codigo']
      },
      {
        name: 'idx_planes_periodo',
        fields: ['periodo']
      },
      {
        name: 'idx_planes_activo',
        fields: ['activo']
      }
    ]
  }
);

export default PlanesModel;
