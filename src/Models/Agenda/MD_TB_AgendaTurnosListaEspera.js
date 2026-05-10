/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_AgendaTurnosListaEspera.js) contiene la definición
 * del modelo Sequelize para la tabla agenda_turnos_lista_espera.
 *
 * Tema: Modelos - Agenda
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

const AgendaTurnosListaEsperaModel = db.define(
  'agenda_turnos_lista_espera',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    turno_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: {
        model: 'agenda_turnos',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },

    alumno_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: {
        model: 'alumnos_alumnos',
        key: 'id'
      }
    },

    posicion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },

    estado: {
      type: DataTypes.ENUM('esperando', 'notificado', 'asignado', 'cancelado'),
      allowNull: false,
      defaultValue: 'esperando'
    },

    fecha_alta: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },

    fecha_notificacion: {
      type: DataTypes.DATE,
      allowNull: true
    },

    fecha_resolucion: {
      type: DataTypes.DATE,
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
    tableName: 'agenda_turnos_lista_espera',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'idx_lista_espera_turno',
        fields: ['turno_id']
      },
      {
        name: 'idx_lista_espera_alumno',
        fields: ['alumno_id']
      },
      {
        name: 'idx_lista_espera_estado',
        fields: ['estado']
      },
      {
        name: 'idx_lista_espera_posicion',
        fields: ['turno_id', 'posicion']
      }
    ]
  }
);

export default AgendaTurnosListaEsperaModel;
