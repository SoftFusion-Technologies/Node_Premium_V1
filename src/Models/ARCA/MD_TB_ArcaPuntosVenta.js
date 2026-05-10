/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_ArcaPuntosVenta.js) contiene la definición
 * del modelo Sequelize para la tabla arca_puntos_venta.
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

const ArcaPuntosVentaModel = db.define(
  'arca_puntos_venta',
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

    numero: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    descripcion: {
      type: DataTypes.STRING(120),
      allowNull: true
    },

    tipo: {
      type: DataTypes.ENUM('webservice', 'manual', 'controlador_fiscal'),
      allowNull: false,
      defaultValue: 'webservice'
    },

    ambiente: {
      type: DataTypes.ENUM('HOMO', 'PROD'),
      allowNull: false,
      defaultValue: 'HOMO'
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
    tableName: 'arca_puntos_venta',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'uq_punto_venta_empresa_numero_ambiente',
        unique: true,
        fields: ['empresa_id', 'numero', 'ambiente']
      },
      {
        name: 'idx_puntos_venta_empresa',
        fields: ['empresa_id']
      },
      {
        name: 'idx_puntos_venta_sede',
        fields: ['sede_id']
      },
      {
        name: 'idx_puntos_venta_activo',
        fields: ['activo']
      }
    ]
  }
);

export default ArcaPuntosVentaModel;
