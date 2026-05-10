/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_PagosMetodosRecurrentes.js) contiene la definición
 * del modelo Sequelize para la tabla pagos_metodos_recurrentes.
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

const PagosMetodosRecurrentesModel = db.define(
  'pagos_metodos_recurrentes',
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
      },
      onDelete: 'CASCADE'
    },

    medio_pago_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: {
        model: 'pagos_medios_pago',
        key: 'id'
      }
    },

    proveedor: {
      type: DataTypes.STRING(80),
      allowNull: true
    },

    customer_token: {
      type: DataTypes.STRING(255),
      allowNull: true
    },

    payment_method_token: {
      type: DataTypes.STRING(255),
      allowNull: true
    },

    marca_tarjeta: {
      type: DataTypes.STRING(80),
      allowNull: true
    },

    ultimos_cuatro: {
      type: DataTypes.STRING(4),
      allowNull: true
    },

    titular: {
      type: DataTypes.STRING(150),
      allowNull: true
    },

    estado: {
      type: DataTypes.ENUM(
        'activo',
        'inactivo',
        'vencido',
        'error',
        'eliminado'
      ),
      allowNull: false,
      defaultValue: 'activo'
    },

    fecha_alta: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },

    fecha_baja: {
      type: DataTypes.DATE,
      allowNull: true
    },

    motivo_baja: {
      type: DataTypes.STRING(255),
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
    tableName: 'pagos_metodos_recurrentes',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'idx_recurrentes_alumno',
        fields: ['alumno_id']
      },
      {
        name: 'idx_recurrentes_medio',
        fields: ['medio_pago_id']
      },
      {
        name: 'idx_recurrentes_estado',
        fields: ['estado']
      }
    ]
  }
);

export default PagosMetodosRecurrentesModel;
