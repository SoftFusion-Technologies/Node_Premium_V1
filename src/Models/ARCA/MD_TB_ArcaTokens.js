/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_ArcaTokens.js) contiene la definición
 * del modelo Sequelize para la tabla arca_tokens.
 *
 * Tema: Modelos - ARCA
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

const ArcaTokensModel = db.define(
  'arca_tokens',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    empresa_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: {
        model: 'arca_empresas',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },

    ambiente: {
      type: DataTypes.ENUM('HOMO', 'PROD'),
      allowNull: false,
      defaultValue: 'HOMO'
    },

    servicio: {
      type: DataTypes.STRING(80),
      allowNull: false,
      defaultValue: 'wsfe'
    },

    token: {
      type: DataTypes.TEXT,
      allowNull: false
    },

    sign: {
      type: DataTypes.TEXT,
      allowNull: false
    },

    generado_en: {
      type: DataTypes.DATE,
      allowNull: false
    },

    expira_en: {
      type: DataTypes.DATE,
      allowNull: false
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
    tableName: 'arca_tokens',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'uq_arca_token_empresa_ambiente_servicio',
        unique: true,
        fields: ['empresa_id', 'ambiente', 'servicio']
      },
      {
        name: 'idx_arca_token_empresa',
        fields: ['empresa_id']
      },
      {
        name: 'idx_arca_token_expira',
        fields: ['expira_en']
      }
    ]
  }
);

export default ArcaTokensModel;
