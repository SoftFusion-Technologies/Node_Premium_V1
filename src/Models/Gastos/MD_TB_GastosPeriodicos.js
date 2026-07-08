/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 07 / 07 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_GastosPeriodicos.js) contiene la definición
 * del modelo Sequelize para la tabla gastos_periodicos.
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

const GastosPeriodicosModel = db.define(
  'gastos_periodicos',
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

    tipo_gasto_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: {
        model: 'gastos_tipos',
        key: 'id'
      }
    },

    proveedor_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'gastos_proveedores',
        key: 'id'
      }
    },

    nombre: {
      type: DataTypes.STRING(160),
      allowNull: false
    },

    descripcion: {
      type: DataTypes.STRING(500),
      allowNull: true
    },

    importe_total: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0.0
    },

    incluye_iva: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },

    iva_porcentaje: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true
    },

    importe_iva: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0.0
    },

    frecuencia: {
      type: DataTypes.ENUM('semanal', 'quincenal', 'mensual', 'anual'),
      allowNull: false,
      defaultValue: 'mensual'
    },

    fecha_inicio: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },

    fecha_fin: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },

    proxima_fecha_generacion: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },

    ultima_fecha_generada: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },

    activo: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },

    observacion: {
      type: DataTypes.STRING(500),
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
    tableName: 'gastos_periodicos',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'idx_gastos_periodicos_sede',
        fields: ['sede_id']
      },
      {
        name: 'idx_gastos_periodicos_tipo',
        fields: ['tipo_gasto_id']
      },
      {
        name: 'idx_gastos_periodicos_proveedor',
        fields: ['proveedor_id']
      },
      {
        name: 'idx_gastos_periodicos_activo',
        fields: ['activo']
      },
      {
        name: 'idx_gastos_periodicos_proxima_fecha',
        fields: ['proxima_fecha_generacion']
      }
    ]
  }
);

export default GastosPeriodicosModel;
