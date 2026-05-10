/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_UsuariosSedes.js) contiene la definición
 * del modelo Sequelize para la tabla usuarios_sedes.
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

const UsuariosSedesModel = db.define(
  'usuarios_sedes',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    usuario_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: {
        model: 'usuarios_usuarios',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },

    sede_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: {
        model: 'sedes_sedes',
        key: 'id'
      }
    },

    rol_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'usuarios_roles',
        key: 'id'
      }
    },

    es_sede_principal: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },

    puede_operar: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },

    puede_ver_reportes: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },

    puede_ver_finanzas: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
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
    tableName: 'usuarios_sedes',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'uq_usuario_sede',
        unique: true,
        fields: ['usuario_id', 'sede_id']
      },
      {
        name: 'idx_usuarios_sedes_usuario',
        fields: ['usuario_id']
      },
      {
        name: 'idx_usuarios_sedes_sede',
        fields: ['sede_id']
      },
      {
        name: 'idx_usuarios_sedes_rol',
        fields: ['rol_id']
      }
    ]
  }
);

export default UsuariosSedesModel;
