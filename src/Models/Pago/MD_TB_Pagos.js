/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 10 / 05 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_Pagos.js) contiene la definición
 * del modelo Sequelize para la tabla pagos_pagos.
 *
 * Tema: Modelos - Pago
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

const PagosModel = db.define(
  'pagos_pagos',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    mensualidad_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'pagos_mensualidades',
        key: 'id'
      }
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

    medio_pago_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: {
        model: 'pagos_medios_pago',
        key: 'id'
      }
    },

    usuario_registro_id: {
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

    fecha_pago: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },

    monto: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.00
    },

    estado: {
      type: DataTypes.ENUM(
        'pendiente_validacion',
        'confirmado',
        'rechazado',
        'anulado'
      ),
      allowNull: false,
      defaultValue: 'confirmado'
    },

    referencia: {
      type: DataTypes.STRING(120),
      allowNull: true
    },

    comprobante_url: {
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
    tableName: 'pagos_pagos',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'idx_pagos_mensualidad',
        fields: ['mensualidad_id']
      },
      {
        name: 'idx_pagos_alumno',
        fields: ['alumno_id']
      },
      {
        name: 'idx_pagos_sede',
        fields: ['sede_id']
      },
      {
        name: 'idx_pagos_medio',
        fields: ['medio_pago_id']
      },
      {
        name: 'idx_pagos_estado',
        fields: ['estado']
      },
      {
        name: 'idx_pagos_fecha',
        fields: ['fecha_pago']
      }
    ]
  }
);

export default PagosModel;