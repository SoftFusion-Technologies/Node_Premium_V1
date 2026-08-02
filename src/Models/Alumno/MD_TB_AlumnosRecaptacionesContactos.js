/*
 * Sergio Manrique - 2026/08/01
 * Modelo Sequelize para la tabla alumnos_recaptaciones_contactos: historial
 * de contactos comerciales de seguimiento/recaptación de un alumno.
 *
 * Tema: Modelos - Alumno
 * Capa: Backend
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const AlumnosRecaptacionesContactosModel = db.define(
  'alumnos_recaptaciones_contactos',
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

    usuario_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: {
        model: 'usuarios_usuarios',
        key: 'id'
      }
    },

    fecha_contacto: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },

    medio_contacto: {
      type: DataTypes.ENUM('whatsapp', 'llamada', 'email', 'presencial', 'otro'),
      allowNull: false
    },

    motivo_seguimiento: {
      type: DataTypes.ENUM(
        'inactividad_5',
        'inactividad_15',
        'cuota_1',
        'cuota_3',
        'cliente_perdido',
        'otro'
      ),
      allowNull: true
    },

    // Sergio Manrique - 2026/08/01 - Motivo categorizado que dio el cliente
    // para no asistir/pagar (columna "Motivo" de la planilla que usaba el
    // coordinador antes de este módulo). Es distinto de motivo_seguimiento
    // (el criterio de inactividad/cuota que trajo al alumno a la bandeja).
    motivo_cliente: {
      type: DataTypes.ENUM('personal', 'no_contesta', 'servicio', 'precio', 'otro'),
      allowNull: true
    },

    observacion: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    respuesta_cliente: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    oferta_realizada: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    motivo_baja: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    resultado_gestion: {
      type: DataTypes.ENUM('positivo', 'negativo', 'pendiente'),
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
    tableName: 'alumnos_recaptaciones_contactos',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'idx_recaptaciones_contactos_alumno',
        fields: ['alumno_id']
      },
      {
        name: 'idx_recaptaciones_contactos_fecha',
        fields: ['alumno_id', 'fecha_contacto']
      }
    ]
  }
);

export default AlumnosRecaptacionesContactosModel;
