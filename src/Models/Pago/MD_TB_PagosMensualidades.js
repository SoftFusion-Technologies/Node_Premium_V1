/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_PagosMensualidades.js) contiene la definición
 * del modelo Sequelize para la tabla pagos_mensualidades.
 *
 * Tema: Modelos - Pago
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

const PagosMensualidadesModel = db.define(
  'pagos_mensualidades',
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
      }
    },

    membresia_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'alumnos_membresias',
        key: 'id'
      }
    },

    sede_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: {
        model: 'sedes_sedes',
        key: 'id'
      }
    },

    periodo_anio: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    periodo_mes: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    periodo_desde: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },

    periodo_hasta: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },

    fecha_emision: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },

    fecha_vencimiento: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },

    monto_total: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0
    },

    monto_pagado: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0
    },

    saldo: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0
    },

    estado: {
      type: DataTypes.ENUM(
        'pendiente',
        'parcial',
        'pagada',
        'vencida',
        'anulada'
      ),
      allowNull: false,
      defaultValue: 'pendiente'
    },

    observaciones: {
      type: DataTypes.TEXT,
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
    tableName: 'pagos_mensualidades',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'idx_mensualidades_alumno',
        fields: ['alumno_id']
      },
      {
        name: 'idx_mensualidades_membresia',
        fields: ['membresia_id']
      },
      {
        name: 'idx_mensualidades_sede',
        fields: ['sede_id']
      },
      {
        name: 'idx_mensualidades_periodo',
        fields: ['periodo_anio', 'periodo_mes']
      },
      {
        name: 'idx_mensualidades_estado',
        fields: ['estado']
      },
      {
        name: 'idx_mensualidades_vencimiento',
        fields: ['fecha_vencimiento']
      }
    ]
  }
);

export default PagosMensualidadesModel;
