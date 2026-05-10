/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_AlumnosAnamnesis.js) contiene la definición
 * del modelo Sequelize para la tabla alumnos_anamnesis.
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

const AlumnosAnamnesisModel = db.define(
  'alumnos_anamnesis',
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

    usuario_registro_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'usuarios_usuarios',
        key: 'id'
      }
    },

    origen_carga: {
      type: DataTypes.ENUM('alumno', 'profesor', 'administracion'),
      allowNull: false,
      defaultValue: 'alumno'
    },

    objetivo_principal: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    experiencia_previa: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    lesiones_actuales: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    lesiones_pasadas: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    cirugias: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    dolores_frecuentes: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    enfermedades_relevantes: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    medicacion: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    actividad_fisica_actual: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    disponibilidad_semanal: {
      type: DataTypes.STRING(255),
      allowNull: true
    },

    nivel_condicion_fisica: {
      type: DataTypes.ENUM('muy_bajo', 'bajo', 'medio', 'alto', 'muy_alto'),
      allowNull: true
    },

    observaciones_adicionales: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    observaciones_profesor: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    declara_aptitud: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },

    acepta_responsabilidad: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },

    acepta_terminos_salud: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },

    fecha_aceptacion: {
      type: DataTypes.DATE,
      allowNull: true
    },

    estado_revision: {
      type: DataTypes.ENUM('pendiente', 'revisada', 'requiere_atencion'),
      allowNull: false,
      defaultValue: 'pendiente'
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
    tableName: 'alumnos_anamnesis',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'idx_anamnesis_alumno',
        fields: ['alumno_id']
      },
      {
        name: 'idx_anamnesis_estado_revision',
        fields: ['estado_revision']
      },
      {
        name: 'idx_anamnesis_usuario_registro',
        fields: ['usuario_registro_id']
      }
    ]
  }
);

export default AlumnosAnamnesisModel;
