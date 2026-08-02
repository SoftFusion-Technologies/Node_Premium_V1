/*
 * Programador: Sergio Gustavo Manrique
 * Fecha Creación: 10 / 06 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (authAlumno.js) contiene toda la lógica de autenticación
 * exclusiva para alumnos del sistema PREMIUM.
 * Trabaja contra alumnos_usuarios + alumnos_alumnos directamente,
 * sin depender de usuarios_usuarios.
 *
 * Exporta:
 *   loginAlumno                    → POST /alumnos/login
 *   cambiarPasswordAlumno          → POST /alumnos/login/cambiar-password
 *   solicitarResetPasswordAlumno   → POST /alumnos/login/reset-solicitar
 *   confirmarResetPasswordAlumno   → POST /alumnos/login/reset-confirmar
 *   authenticateAlumnoToken        → Middleware JWT para rutas de alumno
 *   requireAlumnoActivo            → Middleware: exige alumno en estado operativo
 *
 * Tema: Seguridad - Auth Alumno
 *
 * Capa: Backend
 */

import crypto from 'crypto';

import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';

import AlumnosModel from '../Models/Alumno/MD_TB_Alumnos.js';
import AlumnosLoginModel from '../Models/Alumno/MD_TB_AlumnosLogin.js';
import SedesModel from '../Models/Sede/MD_TB_Sedes.js';

// Sergio Gustavo Manrique - 2026/06/10 - Carga variables de entorno fuera de producción.
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'PREMIUM_SECRET_DESA_10_05_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// Estados académicos que permiten el login
const ESTADOS_ALUMNO_LOGIN_PERMITIDOS = [
  'pendiente_validacion',
  'activo',
  'pendiente_pago',
  'congelado',
  'prueba_clase_inicial'
];

// Estados académicos que permiten operar dentro del sistema (más restrictivo)
const ESTADOS_ALUMNO_OPERATIVO_PERMITIDOS = [
  'activo',
  'pendiente_pago',
  'prueba_clase_inicial'
];

const MAX_INTENTOS_FALLIDOS = 5;
const MINUTOS_BLOQUEO_TEMPORAL = 15;

// ─── Helpers privados ─────────────────────────────────────────────────────────

const normalizarTexto = (valor) => {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  return texto.length > 0 ? texto : null;
};

const normalizarEmail = (valor) => {
  const texto = normalizarTexto(valor);
  return texto ? texto.toLowerCase() : null;
};

const normalizarTelefono = (valor) => {
  const texto = normalizarTexto(valor);
  if (!texto) return null;
  const soloNumeros = texto.replace(/\D/g, '');
  return soloNumeros || null;
};

const normalizarDni = (valor) => {
  const texto = normalizarTexto(valor);
  if (!texto) return null;
  return texto.replace(/\D/g, '') || texto;
};

const obtenerIpRequest = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    null
  );
};

const obtenerTokenDesdeRequest = (req) => {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  return req.headers['x-access-token'] || null;
};

/*
 * Busca el alumno en alumnos_alumnos por DNI, email o teléfono en paralelo.
 */
const buscarAlumnoPorIdentificador = async (identificador) => {
  if (!identificador) return null;

  const dniLimpio = normalizarDni(identificador);
  const emailLimpio = normalizarEmail(identificador);
  const telefonoLimpio = normalizarTelefono(identificador);

  const condiciones = [];

  if (dniLimpio) condiciones.push({ dni: dniLimpio });
  if (emailLimpio) condiciones.push({ email: emailLimpio });
  if (telefonoLimpio) condiciones.push({ telefono: telefonoLimpio });

  if (condiciones.length === 0) return null;

  return AlumnosModel.findOne({
    where: { [Op.or]: condiciones }
  });
};

/*
 * Registra un intento fallido y aplica bloqueo temporal si supera el máximo.
 */
const registrarIntentoFallido = async (loginRecord) => {
  const intentosActualizados = (loginRecord.intentos_fallidos || 0) + 1;

  const actualizacion = { intentos_fallidos: intentosActualizados };

  if (intentosActualizados >= MAX_INTENTOS_FALLIDOS) {
    const bloqueadoHasta = new Date();
    bloqueadoHasta.setMinutes(bloqueadoHasta.getMinutes() + MINUTOS_BLOQUEO_TEMPORAL);
    actualizacion.bloqueado_hasta = bloqueadoHasta;
  }

  await loginRecord.update(actualizacion);
};

/*
 * Limpia el bloqueo y registra la sesión exitosa.
 */
const registrarLoginExitoso = async (loginRecord, ip) => {
  await loginRecord.update({
    intentos_fallidos: 0,
    bloqueado_hasta: null,
    ultimo_login: new Date(),
    ultimo_login_ip: ip
  });
};

/*
 * Construye el objeto de alumno seguro para adjuntar en req.alumno.
 * No expone password_hash ni datos sensibles de login.
 */
const construirAlumnoSeguro = async (alumno, loginRecord) => {
  if (!alumno) return null;

  const alumnoPlano =
    typeof alumno.toJSON === 'function' ? alumno.toJSON() : alumno;

  const sede = alumnoPlano.sede_id
    ? await SedesModel.findByPk(alumnoPlano.sede_id, {
        attributes: ['id', 'nombre', 'codigo', 'activo']
      })
    : null;

  const loginPlano =
    typeof loginRecord.toJSON === 'function' ? loginRecord.toJSON() : loginRecord;

  return {
    id: alumnoPlano.id,
    sede_id: alumnoPlano.sede_id,
    nombre: alumnoPlano.nombre,
    apellido: alumnoPlano.apellido,
    dni: alumnoPlano.dni,
    email: alumnoPlano.email,
    telefono: alumnoPlano.telefono,
    domicilio: alumnoPlano.domicilio,
    localidad: alumnoPlano.localidad,
    provincia: alumnoPlano.provincia,
    fecha_inicio: alumnoPlano.fecha_inicio,
    estado: alumnoPlano.estado,
    ultima_asistencia: alumnoPlano.ultima_asistencia,
    dias_sin_actividad: alumnoPlano.dias_sin_actividad,
    created_at: alumnoPlano.created_at,
    updated_at: alumnoPlano.updated_at,
    sede: sede ? (typeof sede.toJSON === 'function' ? sede.toJSON() : sede) : null,
    login: {
      requiere_cambio_password: loginPlano.requiere_cambio_password === 1,
      estado: loginPlano.estado,
      ultimo_login: loginPlano.ultimo_login
    }
  };
};

/*
 * Construye el payload que viaja en el JWT del alumno.
 * requiere_cambio_password viaja en el token para que el middleware
 * pueda bloquearlo en todos los endpoints salvo el de cambio de contraseña.
 */
const construirPayloadAlumno = (alumno, loginRecord) => ({
  alumno_id: alumno.id,
  sede_id: alumno.sede_id || null,
  tipo_auth: 'ALUMNO',
  requiere_cambio_password: loginRecord.requiere_cambio_password === 1
});

// ─── Login ────────────────────────────────────────────────────────────────────

/*
 * Sergio Gustavo Manrique - 2026/06/10
 * POST /alumnos/login
 * Login del alumno con DNI, email o teléfono + contraseña.
 * Si es el primer acceso, el token incluye requiere_cambio_password: true.
 * Body: { identificador, password }
 */
export const loginAlumno = async (req, res) => {
  try {
    const identificador = normalizarTexto(
      req.body.identificador || req.body.dni || req.body.email || req.body.telefono
    );
    const password = normalizarTexto(req.body.password);

    if (!identificador || !password) {
      return res.status(400).json({
        ok: false,
        message: 'Debe ingresar email, teléfono o DNI y contraseña.'
      });
    }

    // 1. Buscar alumno
    const alumno = await buscarAlumnoPorIdentificador(identificador);

    if (!alumno) {
      return res.status(401).json({
        ok: false,
        message: 'Credenciales inválidas.'
      });
    }

    const alumnoPlano =
      typeof alumno.toJSON === 'function' ? alumno.toJSON() : alumno;

    // 2. Verificar estado académico
    if (!ESTADOS_ALUMNO_LOGIN_PERMITIDOS.includes(alumnoPlano.estado)) {
      return res.status(403).json({
        ok: false,
        message: `El alumno se encuentra ${String(alumnoPlano.estado).toLowerCase()}. Consultá con la administración.`
      });
    }

    // 3. Buscar credenciales
    const loginRecord = await AlumnosLoginModel.findOne({
      where: { alumno_id: alumnoPlano.id }
    });

    if (!loginRecord) {
      return res.status(403).json({
        ok: false,
        message: 'Este alumno no tiene acceso habilitado al sistema.'
      });
    }

    // 4. Verificar estado de acceso
    if (loginRecord.estado !== 'activo') {
      const motivo = loginRecord.motivo_bloqueo
        ? ` Motivo: ${loginRecord.motivo_bloqueo}`
        : '';
      return res.status(403).json({
        ok: false,
        message: `Tu acceso está ${loginRecord.estado}.${motivo} Consultá con la administración.`
      });
    }

    // 5. Verificar bloqueo temporal por intentos fallidos.
    // Si el plazo ya venció, se inicia automáticamente un nuevo ciclo de intentos.
    if (loginRecord.bloqueado_hasta) {
      const ahora = new Date();
      const bloqueadoHasta = new Date(loginRecord.bloqueado_hasta);
      const fechaBloqueoValida = !Number.isNaN(bloqueadoHasta.getTime());

      if (fechaBloqueoValida && ahora < bloqueadoHasta) {
        const minutosRestantes = Math.max(
          Math.ceil((bloqueadoHasta.getTime() - ahora.getTime()) / 1000 / 60),
          1
        );

        return res.status(429).json({
          ok: false,
          codigo: 'ALUMNO_BLOQUEADO_TEMPORALMENTE',
          message: `Demasiados intentos fallidos. Intentá de nuevo en ${minutosRestantes} minuto${minutosRestantes !== 1 ? 's' : ''}.`,
          bloqueado_hasta: loginRecord.bloqueado_hasta
        });
      }

      await loginRecord.update({
        intentos_fallidos: 0,
        bloqueado_hasta: null
      });
    }

    // 6. Verificar contraseña
    const passwordValida = await bcrypt.compare(String(password), loginRecord.password_hash);

    if (!passwordValida) {
      await registrarIntentoFallido(loginRecord);
      return res.status(401).json({
        ok: false,
        message: 'Credenciales inválidas.'
      });
    }

    // 7. Login exitoso
    const ip = obtenerIpRequest(req);
    await registrarLoginExitoso(loginRecord, ip);

    // 8. Firmar JWT
    const payload = construirPayloadAlumno(alumnoPlano, loginRecord);
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    const alumnoRespuesta = await construirAlumnoSeguro(alumno, loginRecord);

    return res.status(200).json({
      ok: true,
      message: 'Login de alumno correcto.',
      token,
      token_type: 'Bearer',
      expires_in: JWT_EXPIRES_IN,
      tipo_auth: 'ALUMNO',
      requiere_cambio_password: loginRecord.requiere_cambio_password === 1,
      alumno: alumnoRespuesta
    });
  } catch (error) {
    console.error('Error loginAlumno PREMIUM:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al iniciar sesión como alumno.'
    });
  }
};

// ─── Cambio de contraseña ─────────────────────────────────────────────────────

/*
 * Sergio Gustavo Manrique - 2026/06/10
 * POST /alumnos/login/cambiar-password
 * Cambio de contraseña del alumno autenticado.
 * Sirve tanto para el cambio obligatorio del primer acceso
 * como para el cambio voluntario posterior.
 * Requiere JWT de alumno válido (authenticateAlumnoToken).
 * Body: { password_actual, password_nueva }
 */
export const cambiarPasswordAlumno = async (req, res) => {
  try {
    const alumnoId = req.alumno?.id;

    if (!alumnoId) {
      return res.status(401).json({
        ok: false,
        message: 'No autenticado.'
      });
    }

    const passwordActual = normalizarTexto(req.body.password_actual);
    const passwordNueva = normalizarTexto(req.body.password_nueva);

    if (!passwordActual || !passwordNueva) {
      return res.status(400).json({
        ok: false,
        message: 'La contraseña actual y la nueva son requeridas.'
      });
    }

    if (passwordNueva.length < 8) {
      return res.status(400).json({
        ok: false,
        message: 'La nueva contraseña debe tener al menos 8 caracteres.'
      });
    }

    const loginRecord = await AlumnosLoginModel.findOne({
      where: { alumno_id: alumnoId }
    });

    if (!loginRecord) {
      return res.status(404).json({
        ok: false,
        message: 'No se encontraron credenciales para este alumno.'
      });
    }

    // Verificar contraseña actual
    const passwordValida = await bcrypt.compare(
      String(passwordActual),
      loginRecord.password_hash
    );

    if (!passwordValida) {
      return res.status(401).json({
        ok: false,
        message: 'La contraseña actual es incorrecta.'
      });
    }

    // Verificar que la nueva no sea igual a la actual
    const esIgualALaActual = await bcrypt.compare(
      String(passwordNueva),
      loginRecord.password_hash
    );

    if (esIgualALaActual) {
      return res.status(400).json({
        ok: false,
        message: 'La nueva contraseña no puede ser igual a la actual.'
      });
    }

    const nuevoHash = await bcrypt.hash(String(passwordNueva), 10);

    await loginRecord.update({
      password_hash: nuevoHash,
      requiere_cambio_password: 0,
      password_cambiado_at: new Date()
    });

    return res.status(200).json({
      ok: true,
      message: 'Contraseña actualizada correctamente.'
    });
  } catch (error) {
    console.error('Error cambiarPasswordAlumno PREMIUM:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al cambiar la contraseña.'
    });
  }
};

// ─── Reset de contraseña ──────────────────────────────────────────────────────

/*
 * Sergio Gustavo Manrique - 2026/06/10
 * POST /alumnos/login/reset-solicitar
 * Genera un token de reset y lo almacena hasheado.
 * PENDIENTE: implementar envío por email/SMS cuando esté disponible.
 * Body: { identificador }
 */
export const solicitarResetPasswordAlumno = async (req, res) => {
  try {
    const identificador = normalizarTexto(req.body.identificador);

    if (!identificador) {
      return res.status(400).json({
        ok: false,
        message: 'Identificador requerido.'
      });
    }

    const alumno = await buscarAlumnoPorIdentificador(identificador);

    // Respuesta siempre genérica para no revelar si el alumno existe
    if (!alumno) {
      return res.status(200).json({
        ok: true,
        message: 'Si el identificador está registrado, recibirás instrucciones para restablecer tu contraseña.'
      });
    }

    const alumnoPlano =
      typeof alumno.toJSON === 'function' ? alumno.toJSON() : alumno;

    const loginRecord = await AlumnosLoginModel.findOne({
      where: { alumno_id: alumnoPlano.id }
    });

    if (!loginRecord) {
      return res.status(200).json({
        ok: true,
        message: 'Si el identificador está registrado, recibirás instrucciones para restablecer tu contraseña.'
      });
    }

    const tokenEnClaro = crypto.randomBytes(40).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(tokenEnClaro).digest('hex');

    const expiracion = new Date();
    expiracion.setHours(expiracion.getHours() + 1);

    await loginRecord.update({
      reset_token_hash: tokenHash,
      reset_token_expira: expiracion
    });

    // TODO: enviar tokenEnClaro por email/SMS al alumno
    // await enviarEmailReset(alumnoPlano.email, tokenEnClaro);

    console.info(
      `[Reset Password Alumno] alumno_id=${alumnoPlano.id} | token generado (pendiente envío)`
    );

    return res.status(200).json({
      ok: true,
      message: 'Si el identificador está registrado, recibirás instrucciones para restablecer tu contraseña.'
    });
  } catch (error) {
    console.error('Error solicitarResetPasswordAlumno PREMIUM:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al procesar la solicitud de reset.'
    });
  }
};

/*
 * Sergio Gustavo Manrique - 2026/06/10
 * POST /alumnos/login/reset-confirmar
 * Confirma el reset usando el token recibido por email/SMS.
 * Body: { token, password_nueva }
 */
export const confirmarResetPasswordAlumno = async (req, res) => {
  try {
    const token = normalizarTexto(req.body.token);
    const passwordNueva = normalizarTexto(req.body.password_nueva);

    if (!token || !passwordNueva) {
      return res.status(400).json({
        ok: false,
        message: 'Token y nueva contraseña son requeridos.'
      });
    }

    if (passwordNueva.length < 8) {
      return res.status(400).json({
        ok: false,
        message: 'La nueva contraseña debe tener al menos 8 caracteres.'
      });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const loginRecord = await AlumnosLoginModel.findOne({
      where: { reset_token_hash: tokenHash }
    });

    if (!loginRecord) {
      return res.status(400).json({
        ok: false,
        message: 'Token inválido o ya utilizado.'
      });
    }

    if (!loginRecord.reset_token_expira || new Date() > new Date(loginRecord.reset_token_expira)) {
      return res.status(400).json({
        ok: false,
        message: 'El token ha expirado. Solicitá uno nuevo.'
      });
    }

    const nuevoHash = await bcrypt.hash(String(passwordNueva), 10);

    await loginRecord.update({
      password_hash: nuevoHash,
      requiere_cambio_password: 0,
      password_cambiado_at: new Date(),
      reset_token_hash: null,
      reset_token_expira: null,
      intentos_fallidos: 0,
      bloqueado_hasta: null
    });

    return res.status(200).json({
      ok: true,
      message: 'Contraseña restablecida correctamente. Ya podés iniciar sesión.'
    });
  } catch (error) {
    console.error('Error confirmarResetPasswordAlumno PREMIUM:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al restablecer la contraseña.'
    });
  }
};

// ─── Middlewares ──────────────────────────────────────────────────────────────

/*
 * Sergio Gustavo Manrique - 2026/06/10
 * Middleware para validar JWT de alumno.
 * Adjunta req.alumno y req.authTipo = 'ALUMNO'.
 * Si el token trae requiere_cambio_password: true, solo deja pasar
 * al endpoint de cambio de contraseña; bloquea todo lo demás.
 */
export const authenticateAlumnoToken = async (req, res, next) => {
  try {
    const token = obtenerTokenDesdeRequest(req);
    
    if (!token) {
      return res.status(401).json({
        ok: false,
        message: 'Token no proporcionado.'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.tipo_auth !== 'ALUMNO') {
      return res.status(403).json({
        ok: false,
        message: 'El token no corresponde a un alumno.'
      });
    }

    // Buscar alumno y sus credenciales frescos desde la BD
    const alumno = await AlumnosModel.findByPk(decoded.alumno_id);

    if (!alumno) {
      return res.status(401).json({
        ok: false,
        message: 'Alumno del token no encontrado.'
      });
    }

    const alumnoPlano =
      typeof alumno.toJSON === 'function' ? alumno.toJSON() : alumno;

    if (!ESTADOS_ALUMNO_LOGIN_PERMITIDOS.includes(alumnoPlano.estado)) {
      return res.status(403).json({
        ok: false,
        message: `El alumno se encuentra ${String(alumnoPlano.estado).toLowerCase()}.`
      });
    }

    const loginRecord = await AlumnosLoginModel.findOne({
      where: { alumno_id: alumnoPlano.id }
    });

    if (!loginRecord || loginRecord.estado !== 'activo') {
      return res.status(403).json({
        ok: false,
        message: 'Acceso del alumno no habilitado.'
      });
    }

    // Bloquear todos los endpoints si requiere cambio de contraseña,
    // excepto el endpoint de cambio de contraseña en sí
    if (
      loginRecord.requiere_cambio_password === 1 &&
      !req.path.includes('/cambiar-password')
    ) {
      return res.status(403).json({
        ok: false,
        codigo: 'REQUIERE_CAMBIO_PASSWORD',
        message: 'Debés cambiar tu contraseña antes de continuar.'
      });
    }

    req.alumno = await construirAlumnoSeguro(alumno, loginRecord);
    req.authTipo = 'ALUMNO';

    return next();
  } catch (error) {
    console.error('Error authenticateAlumnoToken PREMIUM:', error);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        ok: false,
        codigo: 'TOKEN_EXPIRED',
        message: 'Tu sesión expiró. Iniciá sesión nuevamente.',
        expiredAt: error.expiredAt || null
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        ok: false,
        codigo: 'TOKEN_INVALID',
        message: 'La sesión no es válida. Iniciá sesión nuevamente.'
      });
    }

    return res.status(500).json({
      ok: false,
      message: 'Error al validar autenticación del alumno.'
    });
  }
};

/*
 * Sergio Gustavo Manrique - 2026/06/10
 * Middleware para exigir alumno en estado operativo (no congelado, no de baja).
 * Requiere haber pasado antes por authenticateAlumnoToken.
 */
export const requireAlumnoActivo = (req, res, next) => {
  if (!req.alumno) {
    return res.status(401).json({
      ok: false,
      message: 'Alumno no autenticado.'
    });
  }

  if (!ESTADOS_ALUMNO_OPERATIVO_PERMITIDOS.includes(req.alumno.estado)) {
    return res.status(403).json({
      ok: false,
      message: 'El alumno no se encuentra habilitado para realizar esta acción.'
    });
  }

  return next();
};