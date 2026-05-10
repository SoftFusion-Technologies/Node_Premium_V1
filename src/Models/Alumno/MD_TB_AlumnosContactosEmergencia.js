/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_AlumnosContactosEmergencia.js) contiene la definición
 * del modelo Sequelize para la tabla alumnos_contactos_emergencia.
 *
 * Tema: Modelos - Alumno
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

const AlumnosContactosEmergenciaModel = db.define(
  'alumnos_contactos_emergencia',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    alumno_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: {
        model: 'alumnos_alumnos',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },

    nombre: {
      type: DataTypes.STRING(120),
      allowNull: false
    },

    parentesco: {
      type: DataTypes.STRING(80),
      allowNull: true
    },

    telefono: {
      type: DataTypes.STRING(50),
      allowNull: false
    },

    email: {
      type: DataTypes.STRING(150),
      allowNull: true
    },

    principal: {
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
    tableName: 'alumnos_contactos_emergencia',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'idx_contactos_alumno',
        fields: ['alumno_id']
      },
      {
        name: 'idx_contactos_principal',
        fields: ['alumno_id', 'principal']
      }
    ]
  }
);

export default AlumnosContactosEmergenciaModel;
