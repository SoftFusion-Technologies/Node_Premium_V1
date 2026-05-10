/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_ArcaEmpresas.js) contiene la definición
 * del modelo Sequelize para la tabla arca_empresas.
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

const ArcaEmpresasModel = db.define(
  'arca_empresas',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    razon_social: {
      type: DataTypes.STRING(180),
      allowNull: false
    },

    nombre_fantasia: {
      type: DataTypes.STRING(180),
      allowNull: true
    },

    cuit: {
      type: DataTypes.STRING(20),
      allowNull: false
    },

    condicion_iva: {
      type: DataTypes.STRING(80),
      allowNull: true
    },

    domicilio_fiscal: {
      type: DataTypes.STRING(180),
      allowNull: true
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
    tableName: 'arca_empresas',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'uq_arca_empresas_cuit_ambiente',
        unique: true,
        fields: ['cuit', 'ambiente']
      },
      {
        name: 'idx_arca_empresas_activo',
        fields: ['activo']
      }
    ]
  }
);

export default ArcaEmpresasModel;
