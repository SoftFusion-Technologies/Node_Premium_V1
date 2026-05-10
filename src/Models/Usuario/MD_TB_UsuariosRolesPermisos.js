/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_UsuariosRolesPermisos.js) contiene la definición
 * del modelo Sequelize para la tabla usuarios_roles_permisos.
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

const UsuariosRolesPermisosModel = db.define(
  'usuarios_roles_permisos',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    rol_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: {
        model: 'usuarios_roles',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },

    permiso_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: {
        model: 'usuarios_permisos',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },

    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: 'usuarios_roles_permisos',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'uq_rol_permiso',
        unique: true,
        fields: ['rol_id', 'permiso_id']
      },
      {
        name: 'idx_roles_permisos_rol',
        fields: ['rol_id']
      },
      {
        name: 'idx_roles_permisos_permiso',
        fields: ['permiso_id']
      }
    ]
  }
);

export default UsuariosRolesPermisosModel;
