/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_PagosMediosPago.js) contiene la definición
 * del modelo Sequelize para la tabla pagos_medios_pago.
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

const PagosMediosPagoModel = db.define(
  'pagos_medios_pago',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    nombre: {
      type: DataTypes.STRING(100),
      allowNull: false
    },

    codigo: {
      type: DataTypes.STRING(50),
      allowNull: false
    },

    tipo: {
      type: DataTypes.ENUM(
        'efectivo',
        'transferencia',
        'tarjeta',
        'debito_automatico',
        'otro'
      ),
      allowNull: false
    },

    requiere_comprobante: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },

    requiere_validacion: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
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
    tableName: 'pagos_medios_pago',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'uq_medios_pago_codigo',
        unique: true,
        fields: ['codigo']
      },
      {
        name: 'idx_medios_pago_tipo',
        fields: ['tipo']
      },
      {
        name: 'idx_medios_pago_activo',
        fields: ['activo']
      }
    ]
  }
);

export default PagosMediosPagoModel;
