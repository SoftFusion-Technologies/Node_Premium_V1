/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_FinanzasCategorias.js) contiene la definición
 * del modelo Sequelize para la tabla finanzas_categorias.
 *
 * Tema: Modelos - Finanzas
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

const FinanzasCategoriasModel = db.define(
  'finanzas_categorias',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    nombre: {
      type: DataTypes.STRING(120),
      allowNull: false
    },

    codigo: {
      type: DataTypes.STRING(80),
      allowNull: false
    },

    tipo: {
      type: DataTypes.ENUM(
        'ingreso',
        'egreso',
        'costo',
        'gasto_marketing',
        'otro'
      ),
      allowNull: false,
      defaultValue: 'egreso'
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
    tableName: 'finanzas_categorias',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'uq_finanzas_categorias_codigo',
        unique: true,
        fields: ['codigo']
      },
      {
        name: 'idx_finanzas_categorias_tipo',
        fields: ['tipo']
      },
      {
        name: 'idx_finanzas_categorias_activo',
        fields: ['activo']
      }
    ]
  }
);

export default FinanzasCategoriasModel;
