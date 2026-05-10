/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_UsuariosRoles.js) contiene la definición
 * del modelo Sequelize para la tabla usuarios_roles.
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

const UsuariosRolesModel = db.define(
  'usuarios_roles',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    nombre: {
      type: DataTypes.STRING(80),
      allowNull: false
    },

    codigo: {
      type: DataTypes.STRING(50),
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
    tableName: 'usuarios_roles',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'uq_usuarios_roles_codigo',
        unique: true,
        fields: ['codigo']
      }
    ]
  }
);

export default UsuariosRolesModel;
