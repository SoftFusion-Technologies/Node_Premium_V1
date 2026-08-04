/*
 * Programador: Benjamin Orellana
 * Fecha Cración: 07 / 07 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_GastosGastos.js) contiene la definición
 * del modelo Sequelize para la tabla gastos_gastos.
 *
 * Tema: Modelos - Gastos
 *
 * Capa: Backend
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

// Benjamin Orellana - 2026/07/07 - Carga variables de entorno fuera de producción.
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const GastosGastosModel = db.define(
  'gastos_gastos',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    sede_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'sedes_sedes',
        key: 'id'
      }
    },

    tipo_gasto_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: {
        model: 'gastos_tipos',
        key: 'id'
      }
    },

    proveedor_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'gastos_proveedores',
        key: 'id'
      }
    },

    gasto_periodico_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'gastos_periodicos',
        key: 'id'
      }
    },

    medio_pago_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: {
        model: 'pagos_medios_pago',
        key: 'id'
      }
    },

    origen_fondos: {
      type: DataTypes.ENUM('caja_sede', 'fuera_caja'),
      allowNull: false,
      defaultValue: 'caja_sede'
    },

    nombre: {
      type: DataTypes.STRING(160),
      allowNull: false
    },

    descripcion: {
      type: DataTypes.STRING(500),
      allowNull: true
    },

    fecha_gasto: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },

    fecha_pago: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },

    importe_total: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0.0
    },

    incluye_iva: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },

    iva_porcentaje: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true
    },

    importe_iva: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0.0
    },

    estado: {
      type: DataTypes.ENUM('pendiente', 'pagado', 'anulado'),
      allowNull: false,
      defaultValue: 'pendiente'
    },

    origen: {
      type: DataTypes.ENUM('manual', 'periodico'),
      allowNull: false,
      defaultValue: 'manual'
    },

    observacion: {
      type: DataTypes.STRING(500),
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
    tableName: 'gastos_gastos',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        name: 'idx_gastos_sede_fecha',
        fields: ['sede_id', 'fecha_gasto']
      },
      {
        name: 'idx_gastos_tipo_fecha',
        fields: ['tipo_gasto_id', 'fecha_gasto']
      },
      {
        name: 'idx_gastos_proveedor',
        fields: ['proveedor_id']
      },
      {
        name: 'idx_gastos_periodico',
        fields: ['gasto_periodico_id']
      },
      {
        name: 'idx_gastos_medio_pago',
        fields: ['medio_pago_id']
      },
      {
        name: 'idx_gastos_origen_fondos',
        fields: ['origen_fondos']
      },
      {
        name: 'idx_gastos_estado',
        fields: ['estado']
      },
      {
        name: 'idx_gastos_origen',
        fields: ['origen']
      },
      {
        name: 'idx_gastos_fecha',
        fields: ['fecha_gasto']
      }
    ]
  }
);

export default GastosGastosModel;
