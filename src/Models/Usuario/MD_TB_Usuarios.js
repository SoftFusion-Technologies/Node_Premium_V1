/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_Usuarios.js) contiene la definición
 * del modelo Sequelize para la tabla usuarios_usuarios.
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

const UsuariosModel = db.define(
  'usuarios_usuarios',
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
      }
    },

    sede_principal_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'sedes_sedes',
        key: 'id'
      }
    },

    acceso_todas_sedes: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },

    nombre: {
      type: DataTypes.STRING(120),
      allowNull: false
    },

    apellido: {
      type: DataTypes.STRING(120),
      allowNull: true
    },

    email: {
      type: DataTypes.STRING(150),
      allowNull: true
    },

    telefono: {
      type: DataTypes.STRING(50),
      allowNull: true
    },

    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false
    },

    estado: {
      type: DataTypes.ENUM('activo', 'inactivo', 'bloqueado'),
      allowNull: false,
      defaultValue: 'activo'
    },

    ultimo_login: {
      type: DataTypes.DATE,
      allowNull: true
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
    tableName: 'usuarios_usuarios',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'uq_usuarios_email',
        unique: true,
        fields: ['email']
      },
      {
        name: 'idx_usuarios_rol',
        fields: ['rol_id']
      },
      {
        name: 'idx_usuarios_sede_principal',
        fields: ['sede_principal_id']
      },
      {
        name: 'idx_usuarios_acceso_todas_sedes',
        fields: ['acceso_todas_sedes']
      },
      {
        name: 'idx_usuarios_estado',
        fields: ['estado']
      }
    ]
  }
);

export default UsuariosModel;
