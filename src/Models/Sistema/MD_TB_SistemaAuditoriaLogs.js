/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_SistemaAuditoriaLogs.js) contiene la definición
 * del modelo Sequelize para la tabla sistema_auditoria_logs.
 *
 * Tema: Modelos - Sistema
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

const SistemaAuditoriaLogsModel = db.define(
  'sistema_auditoria_logs',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    usuario_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'usuarios_usuarios',
        key: 'id'
      }
    },

    sede_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'sedes_sedes',
        key: 'id'
      }
    },

    modulo: {
      type: DataTypes.STRING(80),
      allowNull: false
    },

    accion: {
      type: DataTypes.STRING(80),
      allowNull: false
    },

    entidad: {
      type: DataTypes.STRING(120),
      allowNull: true
    },

    entidad_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },

    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    valores_anteriores: {
      type: DataTypes.JSON,
      allowNull: true
    },

    valores_nuevos: {
      type: DataTypes.JSON,
      allowNull: true
    },

    ip: {
      type: DataTypes.STRING(80),
      allowNull: true
    },

    user_agent: {
      type: DataTypes.STRING(255),
      allowNull: true
    },

    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: 'sistema_auditoria_logs',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'idx_auditoria_usuario',
        fields: ['usuario_id']
      },
      {
        name: 'idx_auditoria_sede',
        fields: ['sede_id']
      },
      {
        name: 'idx_auditoria_modulo_accion',
        fields: ['modulo', 'accion']
      },
      {
        name: 'idx_auditoria_entidad',
        fields: ['entidad', 'entidad_id']
      },
      {
        name: 'idx_auditoria_fecha',
        fields: ['created_at']
      }
    ]
  }
);

export default SistemaAuditoriaLogsModel;
