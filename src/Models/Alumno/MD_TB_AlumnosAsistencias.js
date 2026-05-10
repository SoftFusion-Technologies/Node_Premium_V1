/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_AlumnosAsistencias.js) contiene la definición
 * del modelo Sequelize para la tabla alumnos_asistencias.
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

const AlumnosAsistenciasModel = db.define(
  'alumnos_asistencias',
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

    sede_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: {
        model: 'sedes_sedes',
        key: 'id'
      }
    },

    turno_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'agenda_turnos',
        key: 'id'
      }
    },

    reserva_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'agenda_turnos_reservas',
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

    fecha: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },

    hora_registro: {
      type: DataTypes.TIME,
      allowNull: true
    },

    estado: {
      type: DataTypes.ENUM('asistio', 'ausente', 'cancelo', 'justificado'),
      allowNull: false
    },

    registrado_por_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'usuarios_usuarios',
        key: 'id'
      }
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
    tableName: 'alumnos_asistencias',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'idx_asistencias_alumno',
        fields: ['alumno_id']
      },
      {
        name: 'idx_asistencias_sede',
        fields: ['sede_id']
      },
      {
        name: 'idx_asistencias_turno',
        fields: ['turno_id']
      },
      {
        name: 'idx_asistencias_reserva',
        fields: ['reserva_id']
      },
      {
        name: 'idx_asistencias_membresia',
        fields: ['membresia_id']
      },
      {
        name: 'idx_asistencias_fecha',
        fields: ['fecha']
      },
      {
        name: 'idx_asistencias_estado',
        fields: ['estado']
      },
      {
        name: 'idx_asistencias_registrado_por',
        fields: ['registrado_por_id']
      }
    ]
  }
);

export default AlumnosAsistenciasModel;
