// config.js
import dotenv from 'dotenv';

dotenv.config();

// Benjamin Orellana - 25/04/2026 - Centraliza variables de entorno para el backend PREMIUM.
export const PORT = process.env.PORT || 8080;

export const DB_HOST = process.env.DB_HOST || 'localhost';
export const DB_USER = process.env.DB_USER || 'root';
export const DB_PASSWORD = process.env.DB_PASSWORD || '123456';
export const DB_NAME = process.env.DB_NAME || 'DB_PremiumDesa_10_05_2026';
export const DB_PORT = Number(process.env.DB_PORT || 3306);

export const DB_SYNC = process.env.DB_SYNC === 'true';
export const DB_ALTER = process.env.DB_ALTER === 'true';
export const DB_SSL = process.env.DB_SSL === 'true';
