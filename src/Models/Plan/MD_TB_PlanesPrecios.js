  /*
  * Programador: Benjamin Orellana
  * Fecha Cración: 10 / 05 / 2026
  * Versión: 1.0
  *
  * Descripción:
  * Este archivo (MD_TB_PlanesPrecios.js) contiene la definición
  * del modelo Sequelize para la tabla planes_precios.
  *
  * Tema: Modelos - Plan
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

  const PlanesPreciosModel = db.define(
    'planes_precios',
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
      },

      plan_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: {
          model: 'planes_planes',
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

      precio: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        defaultValue: 0.0
      },

      moneda: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'ARS'
      },

      fecha_desde: {
        type: DataTypes.DATEONLY,
        allowNull: false
      },

      fecha_hasta: {
        type: DataTypes.DATEONLY,
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
      tableName: 'planes_precios',
      freezeTableName: true,
      timestamps: false,
      indexes: [
        {
          name: 'idx_planes_precios_plan',
          fields: ['plan_id']
        },
        {
          name: 'idx_planes_precios_sede',
          fields: ['sede_id']
        },
        {
          name: 'idx_planes_precios_vigencia',
          fields: ['fecha_desde', 'fecha_hasta']
        },
        {
          name: 'idx_planes_precios_activo',
          fields: ['activo']
        }
      ]
    }
  );

  export default PlanesPreciosModel;
