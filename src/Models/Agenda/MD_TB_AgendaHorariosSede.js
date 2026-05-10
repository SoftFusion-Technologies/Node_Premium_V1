/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_AgendaHorariosSede.js) contiene la definición
 * del modelo Sequelize para la tabla agenda_horarios_sede.
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

const AgendaHorariosSedeModel = db.define(
  'agenda_horarios_sede',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
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

    dia_semana: {
      type: DataTypes.TINYINT,
      allowNull: false,
      comment:
        '1=Lunes, 2=Martes, 3=Miercoles, 4=Jueves, 5=Viernes, 6=Sabado, 7=Domingo'
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

    tipo_clase: {
      type: DataTypes.ENUM('presencial', 'online', 'mixta'),
      allowNull: false,
      defaultValue: 'presencial'
    },

    nombre_clase: {
      type: DataTypes.STRING(120),
      allowNull: true
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
    tableName: 'agenda_horarios_sede',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'idx_horarios_sede',
        fields: ['sede_id']
      },
      {
        name: 'idx_horarios_profesor',
        fields: ['profesor_id']
      },
      {
        name: 'idx_horarios_dia_hora',
        fields: ['dia_semana', 'hora_inicio']
      },
      {
        name: 'idx_horarios_activo',
        fields: ['activo']
      }
    ]
  }
);

export default AgendaHorariosSedeModel;
