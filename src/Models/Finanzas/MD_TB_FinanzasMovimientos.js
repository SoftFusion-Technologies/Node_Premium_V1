/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_FinanzasMovimientos.js) contiene la definición
 * del modelo Sequelize para la tabla finanzas_movimientos.
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

const FinanzasMovimientosModel = db.define(
  'finanzas_movimientos',
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

    categoria_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'finanzas_categorias',
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

    tipo: {
      type: DataTypes.ENUM('ingreso', 'egreso'),
      allowNull: false
    },

    fecha: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },

    descripcion: {
      type: DataTypes.STRING(255),
      allowNull: false
    },

    monto: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0
    },

    origen: {
      type: DataTypes.ENUM(
        'manual',
        'pago_alumno',
        'arca',
        'importacion',
        'ajuste'
      ),
      allowNull: false,
      defaultValue: 'manual'
    },

    comprobante_url: {
      type: DataTypes.STRING(255),
      allowNull: true
    },

    referencia: {
      type: DataTypes.STRING(120),
      allowNull: true
    },

    usuario_registro_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'usuarios_usuarios',
        key: 'id'
      }
    },

    estado: {
      type: DataTypes.ENUM('vigente', 'anulado'),
      allowNull: false,
      defaultValue: 'vigente'
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
    tableName: 'finanzas_movimientos',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'idx_finanzas_mov_sede',
        fields: ['sede_id']
      },
      {
        name: 'idx_finanzas_mov_categoria',
        fields: ['categoria_id']
      },
      {
        name: 'idx_finanzas_mov_pago',
        fields: ['pago_id']
      },
      {
        name: 'idx_finanzas_mov_tipo',
        fields: ['tipo']
      },
      {
        name: 'idx_finanzas_mov_fecha',
        fields: ['fecha']
      },
      {
        name: 'idx_finanzas_mov_estado',
        fields: ['estado']
      },
      {
        name: 'idx_finanzas_mov_usuario',
        fields: ['usuario_registro_id']
      }
    ]
  }
);

export default FinanzasMovimientosModel;
