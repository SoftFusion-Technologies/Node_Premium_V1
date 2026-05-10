/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_FinanzasObjetivos.js) contiene la definición
 * del modelo Sequelize para la tabla finanzas_objetivos.
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

const FinanzasObjetivosModel = db.define(
  'finanzas_objetivos',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    sede_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'sedes_sedes',
        key: 'id'
      }
    },

    tipo_periodo: {
      type: DataTypes.ENUM(
        'semanal',
        'mensual',
        'trimestral',
        'semestral',
        'anual'
      ),
      allowNull: false
    },

    periodo_anio: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    periodo_mes: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    fecha_desde: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },

    fecha_hasta: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },

    metrica: {
      type: DataTypes.ENUM(
        'facturacion_bruta',
        'facturacion_neta',
        'alumnos_nuevos',
        'cuotas_cobradas',
        'ocupacion_promedio',
        'bajas',
        'margen_neto',
        'ticket_promedio'
      ),
      allowNull: false
    },

    objetivo_valor: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0
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
    tableName: 'finanzas_objetivos',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'idx_objetivos_sede',
        fields: ['sede_id']
      },
      {
        name: 'idx_objetivos_periodo',
        fields: ['tipo_periodo', 'periodo_anio', 'periodo_mes']
      },
      {
        name: 'idx_objetivos_metrica',
        fields: ['metrica']
      },
      {
        name: 'idx_objetivos_activo',
        fields: ['activo']
      }
    ]
  }
);

export default FinanzasObjetivosModel;
