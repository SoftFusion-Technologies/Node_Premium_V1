/*
 * Sergio Manrique - 2026/07/17
 * Modelo Sequelize para la tabla finanzas_cotizaciones_usd: histórico diario
 * de la cotización del dólar (oficial y blue) en Argentina, capturado desde
 * dolarapi.com. Sirve para convertir la facturación neta a USD usando el
 * valor del día (o el último disponible, para fines de semana/feriados).
 *
 * Tema: Modelos - Finanzas
 *
 * Capa: Backend
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const FinanzasCotizacionesUsdModel = db.define(
  'finanzas_cotizaciones_usd',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    // Día (horario Argentina) al que corresponde la cotización. Cuando la
    // API no actualiza en fin de semana/feriado, no se genera fila nueva:
    // el consumidor debe buscar la fecha <= la buscada, no una fila exacta.
    fecha: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },

    tipo: {
      type: DataTypes.ENUM('oficial', 'blue'),
      allowNull: false
    },

    compra: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false
    },

    venta: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false
    },

    fuente: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: 'dolarapi.com'
    },

    // Timestamp que la propia API reporta como momento de la cotización
    // (permite auditar si el valor guardado quedó desactualizado).
    fecha_actualizacion_api: {
      type: DataTypes.DATE,
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
    tableName: 'finanzas_cotizaciones_usd',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'uq_finanzas_cotizaciones_usd_fecha_tipo',
        unique: true,
        fields: ['fecha', 'tipo']
      },
      {
        name: 'idx_finanzas_cotizaciones_usd_tipo',
        fields: ['tipo']
      }
    ]
  }
);

export default FinanzasCotizacionesUsdModel;
