/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_UsuariosPermisos.js) contiene la definición
 * del modelo Sequelize para la tabla usuarios_permisos.
 *
 * Tema: Modelos - Usuario
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

const UsuariosPermisosModel = db.define(
  'usuarios_permisos',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    modulo: {
      type: DataTypes.STRING(80),
      allowNull: false
    },

    accion: {
      type: DataTypes.STRING(80),
      allowNull: false
    },

    codigo: {
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
    tableName: 'usuarios_permisos',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'uq_usuarios_permisos_codigo',
        unique: true,
        fields: ['codigo']
      },
      {
        name: 'idx_usuarios_permisos_modulo',
        fields: ['modulo']
      }
    ]
  }
);

export default UsuariosPermisosModel;
