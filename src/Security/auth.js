/*
 * Benjamin Orellana - 2026/05/10 - Auth JWT para usuarios internos del sistema PREMIUM.
 *
 * Sergio Gustavo Manrique - 2026/06/25 - Se removió toda la lógica de alumno
 * que quedó acá (loginAlumno, authenticateAlumnoToken, requireAlumnoAuth,
 * requireAlumnoActivo y sus helpers): era un modelo viejo que autenticaba al
 * alumno vía usuarios_usuarios + usuario_app_id, ya reemplazado por
 * Security/authAlumno.js, que autentica directo contra alumnos_alumnos +
 * alumnos_login. Nada en el backend importaba esas funciones desde acá.
 */

import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';

import UsuariosModel from '../Models/Usuario/MD_TB_Usuarios.js';
import UsuariosRolesModel from '../Models/Usuario/MD_TB_UsuariosRoles.js';
import UsuariosSedesModel from '../Models/Usuario/MD_TB_UsuariosSedes.js';
import SedesModel from '../Models/Sede/MD_TB_Sedes.js';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const JWT_SECRET = process.env.JWT_SECRET || 'PREMIUM_SECRET_DESA_10_05_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

const ESTADOS_USUARIO_PERMITIDOS = ['activo'];

const ROLES_INTERNOS = [
  'SUPER_ADMIN',
  'DIRECCION',
  'FRONT_COMERCIAL',
  'COORD_SEDE',
  'PROFESOR'
];

const ROLES_GLOBAL_ACCESS = ['SUPER_ADMIN', 'DIRECCION'];

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

  const normalizado = texto.replace(/\D/g, '');

  return normalizado || null;
};

const obtenerTokenDesdeRequest = (req) => {
  const authHeader = req.headers.authorization || '';

  if (authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }

  return req.headers['x-access-token'] || null;
};

const obtenerIpRequest = (req) => {
  return (
    req.headers['x-forwarded-for'] ||
    req.socket?.remoteAddress ||
    req.ip ||
    null
  );
};

const buscarRolPorId = async (rolId) => {
  if (!rolId) return null;

  return UsuariosRolesModel.findByPk(rolId);
};

const buscarSedesUsuario = async (usuarioId) => {
  const asignaciones = await UsuariosSedesModel.findAll({
    where: {
      usuario_id: usuarioId,
      activo: 1,
      puede_operar: 1
    },
    order: [
      ['es_sede_principal', 'DESC'],
      ['id', 'ASC']
    ]
  });

  if (!asignaciones.length) return [];

  const sedeIds = asignaciones.map((item) => item.sede_id);

  const sedes = await SedesModel.findAll({
    where: {
      id: {
        [Op.in]: sedeIds
      }
    },
    attributes: [
      'id',
      'nombre',
      'codigo',
      'domicilio',
      'localidad',
      'provincia',
      'telefono',
      'email',
      'activo'
    ]
  });

  const sedesPorId = new Map(
    sedes.map((sede) => {
      const sedePlano =
        typeof sede.toJSON === 'function' ? sede.toJSON() : sede;

      return [Number(sedePlano.id), sedePlano];
    })
  );

  return asignaciones
    .map((asignacion) => {
      const asignacionPlano =
        typeof asignacion.toJSON === 'function'
          ? asignacion.toJSON()
          : asignacion;

      const sede = sedesPorId.get(Number(asignacionPlano.sede_id));

      if (!sede) return null;

      return {
        ...sede,
        asignacion: {
          id: asignacionPlano.id,
          rol_id: asignacionPlano.rol_id,
          es_sede_principal: Boolean(asignacionPlano.es_sede_principal),
          puede_operar: Boolean(asignacionPlano.puede_operar),
          puede_ver_reportes: Boolean(asignacionPlano.puede_ver_reportes),
          puede_ver_finanzas: Boolean(asignacionPlano.puede_ver_finanzas),
          activo: Boolean(asignacionPlano.activo)
        }
      };
    })
    .filter(Boolean);
};

const construirUsuarioSeguro = async (usuario, ultimoLoginOverride = null) => {
  if (!usuario) return null;

  const usuarioPlano =
    typeof usuario.toJSON === 'function' ? usuario.toJSON() : usuario;

  const rol = await buscarRolPorId(usuarioPlano.rol_id);
  const rolPlano = rol && typeof rol.toJSON === 'function' ? rol.toJSON() : rol;

  const sedes = await buscarSedesUsuario(usuarioPlano.id);

  return {
    id: usuarioPlano.id,
    rol_id: usuarioPlano.rol_id,
    sede_principal_id: usuarioPlano.sede_principal_id,
    nombre: usuarioPlano.nombre,
    apellido: usuarioPlano.apellido,
    email: usuarioPlano.email,
    telefono: usuarioPlano.telefono,
    estado: usuarioPlano.estado,
    ultimo_login: ultimoLoginOverride || usuarioPlano.ultimo_login,
    created_at: usuarioPlano.created_at,
    updated_at: usuarioPlano.updated_at,
    rol: rolPlano
      ? {
          id: rolPlano.id,
          nombre: rolPlano.nombre,
          codigo: rolPlano.codigo
        }
      : null,
    rol_codigo: rolPlano?.codigo || null,
    sedes
  };
};

const construirPayloadUsuario = async (usuario) => {
  const rol = await buscarRolPorId(usuario.rol_id);

  return {
    id: usuario.id,
    usuario_id: usuario.id,
    rol_id: usuario.rol_id,
    rol_codigo: rol?.codigo || null,
    sede_principal_id: usuario.sede_principal_id || null,
    tipo_auth: 'USUARIO'
  };
};

const buscarUsuarioPorIdentificador = async (identificadorBase) => {
  const emailLogin = normalizarEmail(identificadorBase);
  const telefonoLogin = normalizarTelefono(identificadorBase);

  const condiciones = [];

  if (emailLogin) {
    condiciones.push({
      email: emailLogin
    });
  }

  if (identificadorBase) {
    condiciones.push({
      telefono: identificadorBase
    });
  }

  if (telefonoLogin) {
    condiciones.push({
      telefono: telefonoLogin
    });
  }

  if (condiciones.length === 0) return null;

  return UsuariosModel.findOne({
    where: {
      [Op.or]: condiciones
    }
  });
};

const validarPassword = async (passwordPlano, passwordHash) => {
  if (!passwordPlano || !passwordHash) return false;

  return bcrypt.compare(String(passwordPlano), passwordHash);
};

/*
 * Benjamin Orellana - 2026/05/10 - Login de usuarios internos PREMIUM.
 */
export const loginUsuario = async (req, res) => {
  try {
    const { identificador, email, telefono, password } = req.body;

    const identificadorBase = normalizarTexto(
      identificador || email || telefono
    );

    if (!identificadorBase || !password) {
      return res.status(400).json({
        ok: false,
        message: 'Debe ingresar email o teléfono y contraseña.'
      });
    }

    const usuario = await buscarUsuarioPorIdentificador(identificadorBase);

    if (!usuario) {
      return res.status(401).json({
        ok: false,
        message: 'Credenciales inválidas.'
      });
    }

    if (!ESTADOS_USUARIO_PERMITIDOS.includes(usuario.estado)) {
      return res.status(403).json({
        ok: false,
        message: `El usuario se encuentra ${String(usuario.estado).toLowerCase()}.`
      });
    }

    const rol = await buscarRolPorId(usuario.rol_id);

    if (!rol || !ROLES_INTERNOS.includes(rol.codigo)) {
      return res.status(403).json({
        ok: false,
        message: 'El usuario no tiene permisos para ingresar al panel interno.'
      });
    }

    const passwordValida = await validarPassword(
      password,
      usuario.password_hash
    );

    if (!passwordValida) {
      return res.status(401).json({
        ok: false,
        message: 'Credenciales inválidas.'
      });
    }

    const fechaUltimoLogin = new Date();

    await usuario.update({
      ultimo_login: fechaUltimoLogin
    });

    const payload = await construirPayloadUsuario(usuario);

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    });

    const usuarioRespuesta = await construirUsuarioSeguro(
      usuario,
      fechaUltimoLogin
    );

    return res.status(200).json({
      ok: true,
      message: 'Login correcto.',
      token,
      token_type: 'Bearer',
      expires_in: JWT_EXPIRES_IN,
      tipo_auth: 'USUARIO',
      usuario: usuarioRespuesta
    });
  } catch (error) {
    console.error('Error loginUsuario PREMIUM:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al iniciar sesión.'
    });
  }
};

/* * Benjamin Orellana - 2026/05/10 - Middleware para validar token de usuario interno.
 */
export const authenticateToken = async (req, res, next) => {
  try {
    const token = obtenerTokenDesdeRequest(req);

    if (!token) {
      return res.status(401).json({
        ok: false,
        codigo: 'TOKEN_REQUIRED',
        code: 'TOKEN_REQUIRED',
        message: 'Token no proporcionado.'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.tipo_auth !== 'USUARIO') {
      return res.status(403).json({
        ok: false,
        codigo: 'TOKEN_WRONG_AUTH_TYPE',
        code: 'TOKEN_WRONG_AUTH_TYPE',
        message: 'El token no corresponde a un usuario interno.'
      });
    }

    const usuario = await UsuariosModel.findByPk(
      decoded.usuario_id || decoded.id,
      {
        attributes: {
          exclude: ['password_hash']
        }
      }
    );

    if (!usuario) {
      return res.status(401).json({
        ok: false,
        codigo: 'TOKEN_USER_NOT_FOUND',
        code: 'TOKEN_USER_NOT_FOUND',
        message: 'Usuario del token no encontrado.'
      });
    }

    if (!ESTADOS_USUARIO_PERMITIDOS.includes(usuario.estado)) {
      return res.status(403).json({
        ok: false,
        codigo: 'USER_INACTIVE',
        code: 'USER_INACTIVE',
        message: `El usuario se encuentra ${String(usuario.estado).toLowerCase()}.`
      });
    }

    req.user = await construirUsuarioSeguro(usuario);
    req.authTipo = 'USUARIO';

    return next();
  } catch (error) {
    /*
     * Caso esperado: token vencido.
     * No se loguea con console.error porque no es un fallo real del backend.
     */
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        ok: false,
        codigo: 'TOKEN_EXPIRED',
        code: 'TOKEN_EXPIRED',
        message: 'Tu sesión expiró. Iniciá sesión nuevamente.',
        expiredAt: error.expiredAt || null
      });
    }

    /*
     * Caso esperado: token inválido, corrupto o mal formado.
     * Tampoco conviene imprimir stack completo.
     */
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        ok: false,
        codigo: 'TOKEN_INVALID',
        code: 'TOKEN_INVALID',
        message: 'La sesión no es válida. Iniciá sesión nuevamente.'
      });
    }

    /*
     * Caso no esperado: ahí sí corresponde loguear el error completo.
     */
    console.error('Error authenticateToken PREMIUM:', error);

    return res.status(500).json({
      ok: false,
      codigo: 'AUTH_ERROR',
      code: 'AUTH_ERROR',
      message: 'Error al validar autenticación.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Middleware para exigir rol interno.
 */
export const requireRolGlobal = (rolesPermitidos = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        message: 'Usuario no autenticado.'
      });
    }

    if (!Array.isArray(rolesPermitidos) || rolesPermitidos.length === 0) {
      return next();
    }

    if (!rolesPermitidos.includes(req.user.rol_codigo)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para realizar esta acción.'
      });
    }

    return next();
  };
};

/*
 * Benjamin Orellana - 2026/05/26 - Middleware para validar existencia de sede y acceso del usuario a una sede.
 */
export const requireSedeAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        message: 'Usuario no autenticado.'
      });
    }

    const sedeId = Number(
      req.params.sede_id ||
        req.params.sedeId ||
        req.query.sede_id ||
        req.body.sede_id
    );

    if (!sedeId || Number.isNaN(sedeId) || sedeId <= 0) {
      return res.status(400).json({
        ok: false,
        message: 'Debe indicar una sede válida para validar el acceso.'
      });
    }

    const sede = await SedesModel.findOne({
      where: {
        id: sedeId,
        activo: 1
      }
    });

    if (!sede) {
      return res.status(404).json({
        ok: false,
        message: 'La sede indicada no existe o se encuentra inactiva.'
      });
    }

    req.sede = typeof sede.toJSON === 'function' ? sede.toJSON() : sede;

    if (ROLES_GLOBAL_ACCESS.includes(req.user.rol_codigo)) {
      return next();
    }

    const tieneAcceso =
      Array.isArray(req.user.sedes) &&
      req.user.sedes.some((sedeUsuario) => {
        return (
          Number(sedeUsuario.id) === sedeId &&
          Boolean(sedeUsuario.asignacion?.activo) &&
          Boolean(sedeUsuario.asignacion?.puede_operar)
        );
      });

    if (!tieneAcceso) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene acceso a la sede indicada.'
      });
    }

    return next();
  } catch (error) {
    console.error('Error requireSedeAccess PREMIUM:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al validar acceso a sede.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Middleware opcional para exigir permiso financiero por sede.
 */
export const requireFinanzasSede = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      ok: false,
      message: 'Usuario no autenticado.'
    });
  }

  if (ROLES_GLOBAL_ACCESS.includes(req.user.rol_codigo)) {
    return next();
  }

  const sedeId = Number(
    req.params.sede_id ||
      req.params.sedeId ||
      req.query.sede_id ||
      req.body.sede_id
  );

  if (!sedeId) {
    return res.status(400).json({
      ok: false,
      message: 'Debe indicar una sede para validar permisos financieros.'
    });
  }

  const sedeAsignada = Array.isArray(req.user.sedes)
    ? req.user.sedes.find((sede) => Number(sede.id) === sedeId)
    : null;

  if (!sedeAsignada?.asignacion?.puede_ver_finanzas) {
    return res.status(403).json({
      ok: false,
      message: 'No tiene permisos financieros para la sede indicada.'
    });
  }

  return next();
};

/*
 * Benjamin Orellana - 2026/05/10 - Hash helper para crear passwords desde seeds o controladores.
 */
export const hashPassword = async (password) => {
  if (!password) return null;

  return bcrypt.hash(String(password), 10);
};

/*
 * Benjamin Orellana - 2026/05/10 - Helper público para inspección controlada del origen de request.
 */
export const getAuthRequestInfo = (req) => ({
  ip: obtenerIpRequest(req),
  user_agent: req.headers['user-agent'] || null
});
