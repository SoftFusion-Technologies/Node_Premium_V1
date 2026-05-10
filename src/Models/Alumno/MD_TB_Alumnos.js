/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_Alumnos.js) contiene la definición
 * del modelo Sequelize para la tabla alumnos_alumnos.
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

const AlumnosModel = db.define(
  'alumnos_alumnos',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    usuario_app_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'usuarios_usuarios',
        key: 'id'
      }
    },

    sede_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'sedes_sedes',
        key: 'id'
      }
    },

    usuario_alta_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'usuarios_usuarios',
        key: 'id'
      }
    },

    usuario_validacion_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'usuarios_usuarios',
        key: 'id'
      }
    },

    origen_registro: {
      type: DataTypes.ENUM('interno', 'externo', 'importado'),
      allowNull: false,
      defaultValue: 'interno'
    },

    nombre: {
      type: DataTypes.STRING(120),
      allowNull: false
    },

    apellido: {
      type: DataTypes.STRING(120),
      allowNull: false
    },

    dni: {
      type: DataTypes.STRING(20),
      allowNull: false
    },

    fecha_nacimiento: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },

    telefono: {
      type: DataTypes.STRING(50),
      allowNull: true
    },

    email: {
      type: DataTypes.STRING(150),
      allowNull: true
    },

    domicilio: {
      type: DataTypes.STRING(180),
      allowNull: true
    },

    localidad: {
      type: DataTypes.STRING(100),
      allowNull: true
    },

    provincia: {
      type: DataTypes.STRING(100),
      allowNull: true
    },

    fecha_inicio: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },

    estado: {
      type: DataTypes.ENUM(
        'pendiente_validacion',
        'activo',
        'pendiente_pago',
        'inactivo',
        'baja',
        'congelado',
        'prueba_clase_inicial'
      ),
      allowNull: false,
      defaultValue: 'pendiente_validacion'
    },

    fecha_baja: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },

    motivo_baja: {
      type: DataTypes.STRING(255),
      allowNull: true
    },

    fecha_congelamiento_desde: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },

    fecha_congelamiento_hasta: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },

    motivo_congelamiento: {
      type: DataTypes.STRING(255),
      allowNull: true
    },

    ultima_asistencia: {
      type: DataTypes.DATE,
      allowNull: true
    },

    dias_sin_actividad: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    acepta_terminos: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },

    fecha_aceptacion_terminos: {
      type: DataTypes.DATE,
      allowNull: true
    },

    observaciones_admin: {
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
    tableName: 'alumnos_alumnos',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'uq_alumnos_dni',
        unique: true,
        fields: ['dni']
      },
      {
        name: 'uq_alumnos_usuario_app',
        unique: true,
        fields: ['usuario_app_id']
      },
      {
        name: 'idx_alumnos_sede',
        fields: ['sede_id']
      },
      {
        name: 'idx_alumnos_estado',
        fields: ['estado']
      },
      {
        name: 'idx_alumnos_nombre_apellido',
        fields: ['apellido', 'nombre']
      },
      {
        name: 'idx_alumnos_email',
        fields: ['email']
      },
      {
        name: 'idx_alumnos_telefono',
        fields: ['telefono']
      },
      {
        name: 'idx_alumnos_ultima_asistencia',
        fields: ['ultima_asistencia']
      }
    ]
  }
);

export default AlumnosModel;
