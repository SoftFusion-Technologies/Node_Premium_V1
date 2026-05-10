/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_SistemaAlertas.js) contiene la definición
 * del modelo Sequelize para la tabla sistema_alertas.
 *
 * Tema: Modelos - Sistema
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

const SistemaAlertasModel = db.define(
  'sistema_alertas',
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

    alumno_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'alumnos_alumnos',
        key: 'id'
      }
    },

    tipo: {
      type: DataTypes.ENUM(
        'alumno_inactivo',
        'deuda',
        'membresia_por_vencer',
        'turno_completo',
        'baja_ocupacion',
        'anamnesis_requiere_atencion',
        'otro'
      ),
      allowNull: false,
      defaultValue: 'otro'
    },

    severidad: {
      type: DataTypes.ENUM('baja', 'media', 'alta', 'critica'),
      allowNull: false,
      defaultValue: 'media'
    },

    titulo: {
      type: DataTypes.STRING(150),
      allowNull: false
    },

    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    estado: {
      type: DataTypes.ENUM('pendiente', 'vista', 'resuelta', 'descartada'),
      allowNull: false,
      defaultValue: 'pendiente'
    },

    fecha_alerta: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },

    fecha_resolucion: {
      type: DataTypes.DATE,
      allowNull: true
    },

    usuario_resolucion_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'usuarios_usuarios',
        key: 'id'
      }
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
    tableName: 'sistema_alertas',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'idx_alertas_sede',
        fields: ['sede_id']
      },
      {
        name: 'idx_alertas_alumno',
        fields: ['alumno_id']
      },
      {
        name: 'idx_alertas_tipo',
        fields: ['tipo']
      },
      {
        name: 'idx_alertas_severidad',
        fields: ['severidad']
      },
      {
        name: 'idx_alertas_estado',
        fields: ['estado']
      },
      {
        name: 'idx_alertas_fecha',
        fields: ['fecha_alerta']
      }
    ]
  }
);

export default SistemaAlertasModel;
