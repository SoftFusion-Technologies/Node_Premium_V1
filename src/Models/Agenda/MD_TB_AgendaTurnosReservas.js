/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_AgendaTurnosReservas.js) contiene la definición
 * del modelo Sequelize para la tabla agenda_turnos_reservas.
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

const AgendaTurnosReservasModel = db.define(
  'agenda_turnos_reservas',
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

    membresia_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'alumnos_membresias',
        key: 'id'
      }
    },

    tipo_reserva: {
      type: DataTypes.ENUM('normal', 'pendiente_credito', 'prueba_inicial'),
      allowNull: false,
      defaultValue: 'normal'
    },

    estado_credito: {
      type: DataTypes.ENUM('consumido', 'pendiente', 'no_aplica', 'devuelto'),
      allowNull: false,
      defaultValue: 'consumido'
    },

    cancelacion_tardia: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },

    fecha_imputacion: {
      type: DataTypes.DATE,
      allowNull: true
    },

    creado_por_usuario_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'usuarios_usuarios',
        key: 'id'
      }
    },

    cancelado_por_usuario_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'usuarios_usuarios',
        key: 'id'
      }
    },

    origen_reserva: {
      type: DataTypes.ENUM('alumno', 'administracion', 'profesor', 'sistema'),
      allowNull: false,
      defaultValue: 'alumno'
    },

    estado: {
      type: DataTypes.ENUM(
        'reservada',
        'cancelada',
        'asistio',
        'ausente',
        'reprogramada'
      ),
      allowNull: false,
      defaultValue: 'reservada'
    },

    fecha_reserva: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },

    fecha_cancelacion: {
      type: DataTypes.DATE,
      allowNull: true
    },

    motivo_cancelacion: {
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
    tableName: 'agenda_turnos_reservas',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'idx_reservas_turno',
        fields: ['turno_id']
      },
      {
        name: 'idx_reservas_alumno',
        fields: ['alumno_id']
      },
      {
        name: 'idx_reservas_membresia',
        fields: ['membresia_id']
      },
      {
        name: 'idx_reservas_tipo_credito',
        fields: ['tipo_reserva', 'estado_credito']
      },
      {
        name: 'idx_reservas_estado',
        fields: ['estado']
      },
      {
        name: 'idx_reservas_fecha',
        fields: ['fecha_reserva']
      }
    ]
  }
);

export default AgendaTurnosReservasModel;
