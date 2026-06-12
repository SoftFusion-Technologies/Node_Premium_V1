/*
 * Programador: Sergio Gustavo Manrique
 * Fecha Creación: 10 / 06 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_AlumnosLogin.js) contiene la definición
 * del modelo Sequelize para la tabla alumnos_usuarios.
 * Almacena exclusivamente los datos de autenticación del alumno,
 * separados del perfil académico (alumnos_alumnos).
 *
 * Tema: Modelos - Alumno / Login
 *
 * Capa: Backend
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

// Sergio Gustavo Manrique - 2026/06/10 - Carga variables de entorno fuera de producción.
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const AlumnosLoginModel = db.define(
  'alumnos_usuarios',
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

    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false
    },

    // En 1 hasta que el alumno cambie su contraseña por primera vez
    requiere_cambio_password: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },

    password_cambiado_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    },

    // Estado de acceso, independiente del estado académico del alumno
    estado: {
      type: DataTypes.ENUM('activo', 'bloqueado', 'suspendido'),
      allowNull: false,
      defaultValue: 'activo'
    },

    motivo_bloqueo: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null
    },

    // Bloqueo temporal por intentos fallidos
    intentos_fallidos: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },

    bloqueado_hasta: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    },

    ultimo_login: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    },

    ultimo_login_ip: {
      type: DataTypes.STRING(45),
      allowNull: true,
      defaultValue: null
    },

    // Reset de contraseña — preparado, pendiente de implementar envío
    reset_token_hash: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null
    },

    reset_token_expira: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
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
    tableName: 'alumnos_usuarios',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'uq_login_alumno',
        unique: true,
        fields: ['alumno_id']
      },
      {
        name: 'idx_login_estado',
        fields: ['estado']
      },
      {
        name: 'idx_login_bloqueado_hasta',
        fields: ['bloqueado_hasta']
      }
    ]
  }
);

export default AlumnosLoginModel;