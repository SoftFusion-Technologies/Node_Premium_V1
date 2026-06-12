/*
 * Programador: Sergio Gustavo Manrique
 * Fecha Creación: 10 / 06 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_AlumnosLogin.js) contiene los controladores
 * de autenticación para alumnos del sistema.
 *
 * Endpoints:
 *   POST /alumnos/login                  → Login con DNI, email o teléfono
 *   POST /alumnos/login/cambiar-password  → Cambio de contraseña (primer acceso o voluntario)
 *   POST /alumnos/login/reset-solicitar   → Solicitar reset (preparado, pendiente de implementar envío)
 *   POST /alumnos/login/reset-confirmar   → Confirmar reset con token
 *
 * Tema: Controladores - Alumno / Login
 *
 * Capa: Backend
 */

import crypto from 'crypto';

import AlumnosModel from '../../Models/Alumno/MD_TB_Alumnos.js';
import AlumnosLoginModel from '../../Models/Alumno/MD_TB_AlumnosLogin.js';
import { hashPassword, comparePassword, signToken } from '../../Security/auth.js';

// ─── Constantes ───────────────────────────────────────────────────────────────

// Estados académicos que bloquean el acceso al sistema
const ESTADOS_ACADEMICOS_BLOQUEADOS = ['baja', 'inactivo'];

// Máximo de intentos fallidos antes del bloqueo temporal
const MAX_INTENTOS_FALLIDOS = 5;

// Minutos de bloqueo temporal por intentos fallidos
const MINUTOS_BLOQUEO_TEMPORAL = 15;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const normalizarTexto = (value) => {
  if (value === undefined || value === null) return null;
  const texto = String(value).trim();
  return texto.length > 0 ? texto : null;
};

const normalizarEmail = (value) => {
  const texto = normalizarTexto(value);
  return texto ? texto.toLowerCase() : null;
};

const normalizarTelefono = (value) => {
  const texto = normalizarTexto(value);
  if (!texto) return null;
  const soloNumeros = texto.replace(/\D/g, '');
  return soloNumeros || texto;
};

const normalizarDni = (value) => {
  const texto = normalizarTexto(value);
  if (!texto) return null;
  return texto.replace(/\D/g, '') || texto;
};

/*
 * Obtiene la IP real del cliente considerando proxies.
 */
const obtenerIpCliente = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    null
  );
};

/*
 * Busca el alumno en alumnos_alumnos usando el identificador recibido.
 * Intenta DNI, email y teléfono en ese orden según el valor.
 */
const buscarAlumnoPorIdentificador = async (identificador) => {
  if (!identificador) return null;

  const dniLimpio = normalizarDni(identificador);
  const emailLimpio = normalizarEmail(identificador);
  const telefonoLimpio = normalizarTelefono(identificador);

  // Busca en los tres campos en paralelo y devuelve el primero que coincida
  const [porDni, porEmail, porTelefono] = await Promise.all([
    dniLimpio
      ? AlumnosModel.findOne({ where: { dni: dniLimpio } })
      : null,
    emailLimpio
      ? AlumnosModel.findOne({ where: { email: emailLimpio } })
      : null,
    telefonoLimpio
      ? AlumnosModel.findOne({ where: { telefono: telefonoLimpio } })
      : null
  ]);

  return porDni || porEmail || porTelefono || null;
};

/*
 * Registra un intento fallido. Si supera el máximo, aplica bloqueo temporal.
 */
const registrarIntentoFallido = async (loginRecord) => {
  const intentosActualizados = (loginRecord.intentos_fallidos || 0) + 1;

  const actualizacion = {
    intentos_fallidos: intentosActualizados
  };

  if (intentosActualizados >= MAX_INTENTOS_FALLIDOS) {
    const bloqueadoHasta = new Date();
    bloqueadoHasta.setMinutes(bloqueadoHasta.getMinutes() + MINUTOS_BLOQUEO_TEMPORAL);
    actualizacion.bloqueado_hasta = bloqueadoHasta;
  }

  await loginRecord.update(actualizacion);
};

/*
 * Limpia el bloqueo temporal y resetea los intentos fallidos tras un login exitoso.
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
 * Arma el payload del JWT para el alumno.
 * requiere_cambio_password viaja en el token para que el middleware
 * pueda bloquearlo en todos los endpoints salvo el de cambio de contraseña.
 */
const construirPayloadToken = (alumno, loginRecord) => {
  return {
    tipo: 'alumno',
    alumno_id: alumno.id,
    nombre: alumno.nombre,
    apellido: alumno.apellido,
    sede_id: alumno.sede_id,
    requiere_cambio_password: loginRecord.requiere_cambio_password === 1
  };
};

// ─── Controladores ────────────────────────────────────────────────────────────

/*
 * Sergio Gustavo Manrique - 2026/06/10
 * POST /alumnos/login
 * Login del alumno con DNI, email o teléfono + contraseña.
 * Si es el primer acceso, el token incluye requiere_cambio_password: true.
 * Body: { identificador, password }
 */
export const Login_Alumno_CTS = async (req, res) => {
  try {
    const identificador = normalizarTexto(req.body.identificador);
    const password = normalizarTexto(req.body.password);

    if (!identificador || !password) {
      return res.status(400).json({
        ok: false,
        message: 'Identificador y contraseña son requeridos.'
      });
    }

    // 1. Buscar alumno por DNI, email o teléfono
    const alumno = await buscarAlumnoPorIdentificador(identificador);

    if (!alumno) {
      return res.status(401).json({
        ok: false,
        message: 'Credenciales incorrectas.'
      });
    }

    const alumnoPlano =
      typeof alumno.toJSON === 'function' ? alumno.toJSON() : alumno;

    // 2. Verificar estado académico
    if (ESTADOS_ACADEMICOS_BLOQUEADOS.includes(alumnoPlano.estado)) {
      return res.status(403).json({
        ok: false,
        message: 'Tu cuenta no tiene acceso activo. Consultá con la administración.'
      });
    }

    // 3. Buscar credenciales del alumno
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
    if (loginRecord.estado === 'bloqueado' || loginRecord.estado === 'suspendido') {
      const motivo = loginRecord.motivo_bloqueo
        ? ` Motivo: ${loginRecord.motivo_bloqueo}`
        : '';
      return res.status(403).json({
        ok: false,
        message: `Tu acceso está ${loginRecord.estado}.${motivo} Consultá con la administración.`
      });
    }

    // 5. Verificar bloqueo temporal por intentos fallidos
    if (loginRecord.bloqueado_hasta) {
      const ahora = new Date();
      const bloqueadoHasta = new Date(loginRecord.bloqueado_hasta);

      if (ahora < bloqueadoHasta) {
        const minutosRestantes = Math.ceil(
          (bloqueadoHasta - ahora) / 1000 / 60
        );
        return res.status(429).json({
          ok: false,
          message: `Demasiados intentos fallidos. Intentá de nuevo en ${minutosRestantes} minuto${minutosRestantes !== 1 ? 's' : ''}.`
        });
      }
    }

    // 6. Verificar contraseña
    const passwordValida = await comparePassword(password, loginRecord.password_hash);

    if (!passwordValida) {
      await registrarIntentoFallido(loginRecord);

      return res.status(401).json({
        ok: false,
        message: 'Credenciales incorrectas.'
      });
    }

    // 7. Login exitoso: limpiar intentos y registrar sesión
    const ip = obtenerIpCliente(req);
    await registrarLoginExitoso(loginRecord, ip);

    // 8. Construir y firmar JWT
    const payload = construirPayloadToken(alumnoPlano, loginRecord);
    const token = signToken(payload);

    return res.status(200).json({
      ok: true,
      message: 'Login exitoso.',
      requiere_cambio_password: loginRecord.requiere_cambio_password === 1,
      token,
      alumno: {
        id: alumnoPlano.id,
        nombre: alumnoPlano.nombre,
        apellido: alumnoPlano.apellido,
        dni: alumnoPlano.dni,
        email: alumnoPlano.email,
        telefono: alumnoPlano.telefono,
        sede_id: alumnoPlano.sede_id,
        estado: alumnoPlano.estado
      }
    });
  } catch (error) {
    console.error('Error Login_Alumno_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al iniciar sesión.'
    });
  }
};

/*
 * Sergio Gustavo Manrique - 2026/06/10
 * POST /alumnos/login/cambiar-password
 * Cambia la contraseña del alumno autenticado.
 * Sirve tanto para el cambio obligatorio del primer acceso
 * como para el cambio voluntario posterior.
 * Requiere JWT de alumno válido.
 * Body: { password_actual, password_nueva }
 */
export const CambiarPassword_Alumno_CTS = async (req, res) => {
  try {
    const alumnoId = req.user?.alumno_id;

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

    // Buscar credenciales
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
    const passwordValida = await comparePassword(passwordActual, loginRecord.password_hash);

    if (!passwordValida) {
      return res.status(401).json({
        ok: false,
        message: 'La contraseña actual es incorrecta.'
      });
    }

    // Verificar que la nueva no sea igual a la actual
    const esIgualALaActual = await comparePassword(passwordNueva, loginRecord.password_hash);

    if (esIgualALaActual) {
      return res.status(400).json({
        ok: false,
        message: 'La nueva contraseña no puede ser igual a la actual.'
      });
    }

    // Actualizar contraseña
    const nuevoHash = await hashPassword(passwordNueva);

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
    console.error('Error CambiarPassword_Alumno_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al cambiar la contraseña.'
    });
  }
};

/*
 * Sergio Gustavo Manrique - 2026/06/10
 * POST /alumnos/login/reset-solicitar
 * Genera un token de reset y lo almacena hasheado.
 * PENDIENTE: implementar el envío por email/SMS cuando esté disponible.
 * Body: { identificador }  (DNI, email o teléfono)
 */
export const SolicitarResetPassword_Alumno_CTS = async (req, res) => {
  try {
    const identificador = normalizarTexto(req.body.identificador);

    if (!identificador) {
      return res.status(400).json({
        ok: false,
        message: 'Identificador requerido.'
      });
    }

    const alumno = await buscarAlumnoPorIdentificador(identificador);

    // Respuesta genérica para no revelar si el alumno existe o no
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

    // Generar token aleatorio y guardar su hash
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
      `[Reset Password] alumno_id=${alumnoPlano.id} | token generado (pendiente envío)`
    );

    return res.status(200).json({
      ok: true,
      message: 'Si el identificador está registrado, recibirás instrucciones para restablecer tu contraseña.'
    });
  } catch (error) {
    console.error('Error SolicitarResetPassword_Alumno_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al procesar la solicitud de reset.'
    });
  }
};

/*
 * Sergio Gustavo Manrique - 2026/06/10
 * POST /alumnos/login/reset-confirmar
 * Confirma el reset de contraseña usando el token recibido por email/SMS.
 * Body: { token, password_nueva }
 */
export const ConfirmarResetPassword_Alumno_CTS = async (req, res) => {
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

    // Hashear el token recibido para comparar con el almacenado
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

    // Verificar expiración
    if (!loginRecord.reset_token_expira || new Date() > new Date(loginRecord.reset_token_expira)) {
      return res.status(400).json({
        ok: false,
        message: 'El token ha expirado. Solicitá uno nuevo.'
      });
    }

    // Actualizar contraseña y limpiar token
    const nuevoHash = await hashPassword(passwordNueva);

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
    console.error('Error ConfirmarResetPassword_Alumno_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al restablecer la contraseña.'
    });
  }
};