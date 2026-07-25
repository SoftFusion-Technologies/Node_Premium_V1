/*
 * Programador: Sergio Gustavo Manrique
 * Fecha Creación: 03 / 06 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_AlumnosAnamnesisHistorial.js) contiene la definición
 * del modelo Sequelize para la tabla alumnos_anamnesis_historial.
 *
 * Tema: Modelos - Alumno
 *
 * Capa: Backend
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

// Sergio Gustavo Manrique - 2026/06/03 - Carga variables de entorno fuera de producción.
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const AlumnosAnamnesisHistorialModel = db.define(
  'alumnos_anamnesis_historial',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    anamnesis_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: {
        model: 'alumnos_anamnesis',
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
      },
      onDelete: 'CASCADE'
    },

    usuario_modificacion_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'usuarios_usuarios',
        key: 'id'
      }
    },

    origen_modificacion: {
      type: DataTypes.ENUM('alumno', 'profesor', 'administracion'),
      allowNull: false,
      defaultValue: 'alumno'
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

    original_created_at: {
      type: DataTypes.DATE,
      allowNull: true
    },

    original_updated_at: {
      type: DataTypes.DATE,
      allowNull: true
    },

    archivado_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: 'alumnos_anamnesis_historial',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'idx_hist_anamnesis_id',
        fields: ['anamnesis_id']
      },
      {
        name: 'idx_hist_alumno_id',
        fields: ['alumno_id']
      },
      {
        name: 'idx_hist_archivado_at',
        fields: ['archivado_at']
      }
    ]
  }
);

export default AlumnosAnamnesisHistorialModel;