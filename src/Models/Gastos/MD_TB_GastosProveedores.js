/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 07 / 07 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_GastosProveedores.js) contiene la definición
 * del modelo Sequelize para la tabla gastos_proveedores.
 *
 * Tema: Modelos - Gastos
 *
 * Capa: Backend
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

// Benjamin Orellana - 2026/07/07 - Carga variables de entorno fuera de producción.
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const GastosProveedoresModel = db.define(
  'gastos_proveedores',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    nombre: {
      type: DataTypes.STRING(160),
      allowNull: false
    },

    cuit: {
      type: DataTypes.STRING(20),
      allowNull: true
    },

    telefono: {
      type: DataTypes.STRING(40),
      allowNull: true
    },

    email: {
      type: DataTypes.STRING(120),
      allowNull: true
    },

    direccion: {
      type: DataTypes.STRING(180),
      allowNull: true
    },

    observacion: {
      type: DataTypes.STRING(500),
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
    tableName: 'gastos_proveedores',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'idx_gastos_proveedores_nombre',
        fields: ['nombre']
      },
      {
        name: 'idx_gastos_proveedores_activo',
        fields: ['activo']
      }
    ]
  }
);

export default GastosProveedoresModel;
