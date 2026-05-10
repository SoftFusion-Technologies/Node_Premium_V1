/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_AlumnosMembresias.js) contiene la definición
 * del modelo Sequelize para la tabla alumnos_membresias.
 *
 * Tema: Modelos - Alumno
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

const AlumnosMembresiasModel = db.define(
  'alumnos_membresias',
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

    plan_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: {
        model: 'planes_planes',
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

    fecha_inicio: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },

    fecha_vencimiento: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },

    estado: {
      type: DataTypes.ENUM(
        'pendiente_pago',
        'activa',
        'vencida',
        'cancelada',
        'congelada'
      ),
      allowNull: false,
      defaultValue: 'pendiente_pago'
    },

    precio_lista: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0
    },

    descuento_valor: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0
    },

    descuento_porcentaje: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0.0
    },

    precio_final: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0
    },

    clases_incluidas: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },

    clases_usadas: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },

    clases_disponibles: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },

    origen_alta: {
      type: DataTypes.ENUM('administracion', 'web', 'app', 'migracion'),
      allowNull: false,
      defaultValue: 'administracion'
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
    tableName: 'alumnos_membresias',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'idx_membresias_alumno',
        fields: ['alumno_id']
      },
      {
        name: 'idx_membresias_plan',
        fields: ['plan_id']
      },
      {
        name: 'idx_membresias_sede',
        fields: ['sede_id']
      },
      {
        name: 'idx_membresias_estado',
        fields: ['estado']
      },
      {
        name: 'idx_membresias_vencimiento',
        fields: ['fecha_vencimiento']
      }
    ]
  }
);

export default AlumnosMembresiasModel;
