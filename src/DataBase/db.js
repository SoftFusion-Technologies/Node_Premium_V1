import { Sequelize } from 'sequelize';
import {
  DB_HOST,
  DB_NAME,
  DB_PASSWORD,
  DB_USER,
  DB_PORT,
  DB_SSL
} from './config.js';

// Benjamin Orellana - 25/04/2026 - Configuración central de Sequelize para conectar PREMIUM con MySQL.
const db = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: 'mysql',
  logging: false,
  timezone: '-03:00',

  define: {
    freezeTableName: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },

  pool: {
    max: 15,
    min: 0,
    acquire: 30000,
    idle: 10000
  },

  dialectOptions: {
    connectTimeout: 60000,
    ...(DB_SSL
      ? {
          ssl: {
            require: true,
            rejectUnauthorized: false
          }
        }
      : {})
  }
});

export default db;
