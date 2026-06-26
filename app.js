import express from 'express';
import cors from 'cors';
import path from 'path';

// El Intercambio de Recursos de Origen Cruzado CORS
// es un mecanismo que utiliza cabeceras HTTP adicionales para permitir que un user agent
// obtenga permiso para acceder a recursos seleccionados desde un servidor, en un origen distinto al que pertenece.

// importamos la conexion de la base de datos
import db from './src/DataBase/db.js';

// Benjamin Orellana - 2026/04/14 - Se elimina configuración hardcodeada de MySQL y se reutilizan variables centralizadas.
import { PORT, DB_SYNC, DB_ALTER } from './src/DataBase/config.js';

// Benjamin Orellana - 2026/05/10 - Importa rutas centralizadas del backend PREMIUM.
// Sergio Gustavo Manrique - 2026/06/25 - Refactor: routes.js monolítico dividido
// por responsabilidades en src/Routes/*.routes.js, orquestados desde index.js.
import GetRoutes from './src/Routes/index.js';

// Benjamin Orellana - 2026/05/10 - Importa auth JWT para usuarios internos y alumnos PREMIUM.
import {
  loginUsuario,
  loginAlumno,
  authenticateToken,
  requireRolGlobal,
  requireSedeAccess,
  requireAlumnoActivo
} from './src/Security/auth.js';

import {
  loginAlumno as loginAlumnoNuevo,
  cambiarPasswordAlumno,        // ← agregar
  authenticateAlumnoToken       // ← agregar
} from './src/Security/authAlumno.js';

// Benjamin Orellana - 2026/05/10 - Importa relaciones Sequelize del módulo Usuario.
import { initUsuarioRelaciones } from './src/Models/Usuario/relacionesUsuario.js';
// Benjamin Orellana - 2026/05/10 - Importa relaciones Sequelize del módulo Plan.
import { initPlanRelaciones } from './src/Models/Plan/relacionesPlan.js';
// Benjamin Orellana - 2026/05/10 - Importa relaciones Sequelize del módulo Alumno.
import { initAlumnoRelaciones } from './src/Models/Alumno/relacionesAlumno.js';
// Benjamin Orellana - 2026/05/10 - Importa relaciones Sequelize del módulo Pago.
import { initPagoRelaciones } from './src/Models/Pago/relacionesPago.js';
// Benjamin Orellana - 2026/05/10 - Importa relaciones Sequelize del módulo Agenda.
import { initAgendaRelaciones } from './src/Models/Agenda/relacionesAgenda.js';
// Benjamin Orellana - 2026/05/10 - Importa relaciones Sequelize del módulo Finanzas.
import { initFinanzasRelaciones } from './src/Models/Finanzas/relacionesFinanzas.js';
// Benjamin Orellana - 2026/05/10 - Importa relaciones Sequelize del módulo ARCA.
import { initArcaRelaciones } from './src/Models/ARCA/relacionesARCA.js';
// Benjamin Orellana - 2026/05/10 - Importa relaciones Sequelize del módulo Sistema.
import { initSistemaRelaciones } from './src/Models/Sistema/relacionesSistema.js';

import { iniciarCronProcesarVencimientos } from './src/Jobs/JB_ProcesarVencimientos.js';

iniciarCronProcesarVencimientos();

const app = express();

// Benjamin Orellana - 25/04/2026 - Configuración base de middlewares para PREMIUM.
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Benjamin Orellana - 25/04/2026 - Expone carpeta pública de uploads para servir archivos multimedia de PREMIUM.
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Benjamin Orellana - 25/04/2026 - Ruta raíz de control para verificar que el backend PREMIUM está activo.
app.get('/', (req, res) => {
  return res.status(200).json({
    ok: true,
    message: 'Backend PREMIUM funcionando correctamente.',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Benjamin Orellana - 2026/05/10 - Login interno para usuarios administrativos, dirección, coordinación y profesores.
app.post('/login', loginUsuario);

// Sergio Manrique - 2026/06/10 - Login externo para alumnos del portal/app PREMIUM.
app.post('/alumnos/login', loginAlumnoNuevo);

// Sergio Gustavo Manrique - 2026/06/11 - Cambio de contraseña obligatorio primer acceso alumno.
app.post('/alumnos/login/cambiar-password', authenticateAlumnoToken, cambiarPasswordAlumno);

// Benjamin Orellana - 2026/05/10 - Ruta protegida de prueba para validar JWT de usuario interno.
app.get('/protected', authenticateToken, (req, res) => {
  return res.status(200).json({
    ok: true,
    message: 'Acceso permitido para usuario autenticado.',
    user: req.user
  });
});

// Benjamin Orellana - 2026/05/10 - Ruta protegida de prueba para validar JWT de alumno.
app.get('/alumnos/protected', authenticateAlumnoToken, (req, res) => {
  return res.status(200).json({
    ok: true,
    message: 'Acceso permitido para alumno autenticado.',
    alumno: req.alumno
  });
});

// Benjamin Orellana - 2026/05/10 - Ruta protegida solo para Dirección o Super Admin.
app.get(
  '/protected-admin',
  authenticateToken,
  requireRolGlobal(['SUPER_ADMIN', 'DIRECCION']),
  (req, res) => {
    return res.status(200).json({
      ok: true,
      message: 'Acceso permitido para roles globales.',
      user: req.user
    });
  }
);

/*
 * Benjamin Orellana - 2026/05/26 - Ruta protegida para validar acceso del usuario a una sede existente.
 */
app.get(
  '/protected-sede/:sede_id',
  authenticateToken,
  requireSedeAccess,
  (req, res) => {
    return res.status(200).json({
      ok: true,
      message: 'Acceso permitido a la sede indicada.',
      sede_id: req.params.sede_id,
      sede: req.sede,
      user: req.user
    });
  }
);

// Benjamin Orellana - 2026/05/10 - Ruta protegida para validar acciones operativas del alumno.
app.get(
  '/alumnos/protected-activo',
  authenticateAlumnoToken,
  requireAlumnoActivo,
  (req, res) => {
    return res.status(200).json({
      ok: true,
      message: 'Alumno habilitado para operar.',
      alumno: req.alumno
    });
  }
);

// Benjamin Orellana - 2026/05/10 - Rutas principales centralizadas del backend PREMIUM.
app.use('/', GetRoutes);

// Benjamin Orellana - 2026/05/10 - Handler central para rutas inexistentes.
app.use((req, res) => {
  return res.status(404).json({
    ok: false,
    message: 'Ruta no encontrada.'
  });
});

if (!PORT) {
  console.error('El puerto no está definido en el archivo de configuración.');
  process.exit(1);
}

// Benjamin Orellana - 25/04/2026 - Inicializa conexión con MySQL y levanta servidor Express.
const startServer = async () => {
  try {
    await db.authenticate();

    console.log('Conexión con la base de datos establecida correctamente.');

    // Benjamin Orellana - 2026/05/10 - Inicializa relaciones Sequelize del módulo Usuario antes de sincronizar modelos.
    initUsuarioRelaciones();
    // Benjamin Orellana - 2026/05/10 - Inicializa relaciones Sequelize del módulo Plan antes de sincronizar modelos.
    initPlanRelaciones();
    // Benjamin Orellana - 2026/05/10 - Inicializa relaciones Sequelize del módulo Alumno antes de sincronizar modelos.
    initAlumnoRelaciones();
    // Benjamin Orellana - 2026/05/10 - Inicializa relaciones Sequelize del módulo Pago antes de sincronizar modelos.
    initPagoRelaciones();
    // Benjamin Orellana - 2026/05/10 - Inicializa relaciones Sequelize del módulo Agenda antes de sincronizar modelos.
    initAgendaRelaciones();
    // Benjamin Orellana - 2026/05/10 - Inicializa relaciones Sequelize del módulo Finanzas antes de sincronizar modelos.
    initFinanzasRelaciones();
    // Benjamin Orellana - 2026/05/10 - Inicializa relaciones Sequelize del módulo ARCA antes de sincronizar modelos.
    initArcaRelaciones();
    // Benjamin Orellana - 2026/05/10 - Inicializa relaciones Sequelize del módulo Sistema antes de sincronizar modelos.
    initSistemaRelaciones();

    if (DB_SYNC) {
      await db.sync({
        alter: DB_ALTER
      });

      console.log('Modelos sincronizados correctamente.');
    }

    app.listen(PORT, () => {
      console.log(`Servidor PREMIUM escuchando en el puerto ${PORT}`);
      console.log(`URL local: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Error al iniciar el servidor PREMIUM:', error);
    process.exit(1);
  }
};

startServer();

process.on('uncaughtException', (err) => {
  console.error('Excepción no capturada:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promesa rechazada no capturada:', promise, 'razón:', reason);
  process.exit(1);
});
