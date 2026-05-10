/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_ArcaComprobantes.js) contiene la definición
 * del modelo Sequelize para la tabla arca_comprobantes.
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

const ArcaComprobantesModel = db.define(
  'arca_comprobantes',
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

    punto_venta_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: {
        model: 'arca_puntos_venta',
        key: 'id'
      }
    },

    alumno_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'alumnos_alumnos',
        key: 'id'
      }
    },

    pago_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'pagos_pagos',
        key: 'id'
      }
    },

    tipo_comprobante: {
      type: DataTypes.STRING(10),
      allowNull: false
    },

    numero_comprobante: {
      type: DataTypes.BIGINT,
      allowNull: true
    },

    fecha_emision: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },

    concepto: {
      type: DataTypes.ENUM('productos', 'servicios', 'productos_y_servicios'),
      allowNull: false,
      defaultValue: 'servicios'
    },

    importe_neto: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0
    },

    importe_iva: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0
    },

    importe_total: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0
    },

    cae: {
      type: DataTypes.STRING(50),
      allowNull: true
    },

    cae_vencimiento: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },

    estado: {
      type: DataTypes.ENUM('pendiente', 'emitido', 'rechazado', 'anulado'),
      allowNull: false,
      defaultValue: 'pendiente'
    },

    request_json: {
      type: DataTypes.JSON,
      allowNull: true
    },

    response_json: {
      type: DataTypes.JSON,
      allowNull: true
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
    tableName: 'arca_comprobantes',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'idx_arca_comp_empresa',
        fields: ['empresa_id']
      },
      {
        name: 'idx_arca_comp_punto_venta',
        fields: ['punto_venta_id']
      },
      {
        name: 'idx_arca_comp_alumno',
        fields: ['alumno_id']
      },
      {
        name: 'idx_arca_comp_pago',
        fields: ['pago_id']
      },
      {
        name: 'idx_arca_comp_fecha',
        fields: ['fecha_emision']
      },
      {
        name: 'idx_arca_comp_estado',
        fields: ['estado']
      }
    ]
  }
);

export default ArcaComprobantesModel;
