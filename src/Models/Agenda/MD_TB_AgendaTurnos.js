/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_AgendaTurnos.js) contiene la definición
 * del modelo Sequelize para la tabla agenda_turnos.
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

const AgendaTurnosModel = db.define(
  'agenda_turnos',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    horario_sede_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'agenda_horarios_sede',
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

    profesor_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'usuarios_usuarios',
        key: 'id'
      }
    },

    fecha: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },

    hora_inicio: {
      type: DataTypes.TIME,
      allowNull: false
    },

    hora_fin: {
      type: DataTypes.TIME,
      allowNull: false
    },

    cupo_maximo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 6
    },

    cupos_reservados: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },

    estado: {
      type: DataTypes.ENUM('disponible', 'completo', 'bloqueado', 'cancelado'),
      allowNull: false,
      defaultValue: 'disponible'
    },

    motivo_bloqueo: {
      type: DataTypes.STRING(255),
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
    tableName: 'agenda_turnos',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'idx_turnos_horario_sede',
        fields: ['horario_sede_id']
      },
      {
        name: 'idx_turnos_sede',
        fields: ['sede_id']
      },
      {
        name: 'idx_turnos_profesor',
        fields: ['profesor_id']
      },
      {
        name: 'idx_turnos_fecha',
        fields: ['fecha']
      },
      {
        name: 'idx_turnos_estado',
        fields: ['estado']
      },
      {
        name: 'idx_turnos_fecha_hora',
        fields: ['fecha', 'hora_inicio']
      }
    ]
  }
);

export default AgendaTurnosModel;
