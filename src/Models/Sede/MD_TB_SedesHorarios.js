/*
 * Programador: Sergio Manrique
 * Fecha Creación: 02 / 07 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_SedesHorarios.js) contiene la definición
 * del modelo Sequelize para la tabla sedes_horarios.
 * Define el horario de apertura por día de la semana para cada sede.
 * Una fila por (sede_id, dia_semana). Si no existe fila para un día,
 * ese día no tiene clases habilitadas en esa sede.
 *
 * Tema: Modelos - Sede
 * Capa: Backend
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const SedesHorariosModel = db.define(
  'sedes_horarios',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    sede_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },

    // 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado, 7=Domingo
    dia_semana: {
      type: DataTypes.TINYINT.UNSIGNED,
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
    tableName: 'sedes_horarios',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'uq_sedes_horarios_sede_dia',
        unique: true,
        fields: ['sede_id', 'dia_semana']
      },
      {
        name: 'idx_sedes_horarios_sede_id',
        fields: ['sede_id']
      },
      {
        name: 'idx_sedes_horarios_activo',
        fields: ['activo']
      }
    ]
  }
);

export default SedesHorariosModel;
