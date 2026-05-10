/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_Sedes.js) contiene la definición
 * del modelo Sequelize para la tabla sedes_sedes.
 *
 * Tema: Modelos - Sede
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

const SedesModel = db.define(
  'sedes_sedes',
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
      type: DataTypes.STRING(60),
      allowNull: false
    },

    domicilio: {
      type: DataTypes.STRING(180),
      allowNull: true
    },

    localidad: {
      type: DataTypes.STRING(100),
      allowNull: true
    },

    provincia: {
      type: DataTypes.STRING(100),
      allowNull: true
    },

    telefono: {
      type: DataTypes.STRING(50),
      allowNull: true
    },

    email: {
      type: DataTypes.STRING(150),
      allowNull: true
    },

    capacidad_operativa: {
      type: DataTypes.INTEGER,
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
    tableName: 'sedes_sedes',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'uq_sedes_codigo',
        unique: true,
        fields: ['codigo']
      },
      {
        name: 'idx_sedes_activo',
        fields: ['activo']
      }
    ]
  }
);

export default SedesModel;
