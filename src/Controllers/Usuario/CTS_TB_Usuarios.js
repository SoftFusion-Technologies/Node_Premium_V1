/*
 * Benjamin Orellana - 2026/05/10 - Controlador Sequelize para la gestión de usuarios PREMIUM.
 */

import { Op } from 'sequelize';
import bcrypt from 'bcryptjs';

import db from '../../DataBase/db.js';
import UsuariosModel from '../../Models/Usuario/MD_TB_Usuarios.js';
import UsuariosRolesModel from '../../Models/Usuario/MD_TB_UsuariosRoles.js';
import UsuariosSedesModel from '../../Models/Usuario/MD_TB_UsuariosSedes.js';
import SedesModel from '../../Models/Sede/MD_TB_Sedes.js';
import { hashPassword } from '../../Security/auth.js';

const ESTADOS_USUARIO_VALIDOS = ['activo', 'inactivo', 'bloqueado'];
const ROLES_PROTEGIDOS = ['SUPER_ADMIN'];
const ROLES_GLOBALES = ['SUPER_ADMIN', 'DIRECCION'];

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

const normalizarEstado = (value) => {
  const estado = normalizarTexto(value);

  return estado ? estado.toLowerCase() : null;
};

const normalizarBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '')
    return defaultValue;

  if (
    value === true ||
    value === 'true' ||
    value === '1' ||
    Number(value) === 1
  ) {
    return true;
  }

  if (
    value === false ||
    value === 'false' ||
    value === '0' ||
    Number(value) === 0
  ) {
    return false;
  }

  return defaultValue;
};

const eliminarPasswordHash = (usuario = {}) => {
  const usuarioPlano =
    typeof usuario.toJSON === 'function' ? usuario.toJSON() : { ...usuario };

  delete usuarioPlano.password_hash;

  return usuarioPlano;
};

const obtenerRolUsuario = async (rolId) => {
  if (!rolId) return null;

  return UsuariosRolesModel.findByPk(rolId);
};

const validarGestionRolProtegido = async (
  usuarioObjetivo,
  usuarioAutenticado
) => {
  const rolObjetivo = await obtenerRolUsuario(usuarioObjetivo.rol_id);

  const rolCodigoObjetivo = rolObjetivo?.codigo || null;
  const rolCodigoAutenticado = usuarioAutenticado?.rol_codigo || null;

  if (
    ROLES_PROTEGIDOS.includes(rolCodigoObjetivo) &&
    rolCodigoAutenticado !== 'SUPER_ADMIN'
  ) {
    return {
      ok: false,
      message: 'Solo un SUPER_ADMIN puede gestionar usuarios con rol protegido.'
    };
  }

  return {
    ok: true
  };
};

const obtenerSedesUsuario = async (usuarioId) => {
  const asignaciones = await UsuariosSedesModel.findAll({
    where: {
      usuario_id: usuarioId,
      activo: 1
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
    }
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

const construirUsuarioRespuesta = async (usuario) => {
  if (!usuario) return null;

  const usuarioPlano = eliminarPasswordHash(usuario);

  const rol = await obtenerRolUsuario(usuarioPlano.rol_id);
  const rolPlano = rol && typeof rol.toJSON === 'function' ? rol.toJSON() : rol;

  const sedePrincipal = usuarioPlano.sede_principal_id
    ? await SedesModel.findByPk(usuarioPlano.sede_principal_id)
    : null;

  const sedes = await obtenerSedesUsuario(usuarioPlano.id);

  return {
    ...usuarioPlano,
    rol: rolPlano
      ? {
          id: rolPlano.id,
          nombre: rolPlano.nombre,
          codigo: rolPlano.codigo,
          activo: rolPlano.activo
        }
      : null,
    rol_codigo: rolPlano?.codigo || null,
    sede_principal: sedePrincipal
      ? sedePrincipal.toJSON
        ? sedePrincipal.toJSON()
        : sedePrincipal
      : null,
    sedes
  };
};

const buildUsuarioPayload = (body = {}, modo = 'create') => {
  const payload = {
    rol_id:
      body.rol_id === undefined || body.rol_id === null || body.rol_id === ''
        ? null
        : Number(body.rol_id),

    sede_principal_id:
      body.sede_principal_id === undefined ||
      body.sede_principal_id === null ||
      body.sede_principal_id === ''
        ? null
        : Number(body.sede_principal_id),

    nombre: normalizarTexto(body.nombre),
    apellido: normalizarTexto(body.apellido),
    email: normalizarEmail(body.email),
    telefono: normalizarTelefono(body.telefono)
  };

  if (modo === 'update') {
    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });
  }

  return payload;
};

const validarPayloadUsuario = (payload = {}, modo = 'create') => {
  const errores = [];

  if (modo === 'create' && !payload.rol_id) {
    errores.push('El rol del usuario es obligatorio.');
  }

  if (modo === 'create' && !payload.nombre) {
    errores.push('El nombre del usuario es obligatorio.');
  }

  if (modo === 'create' && !payload.email && !payload.telefono) {
    errores.push('Debe indicar email o teléfono para el usuario.');
  }

  if (payload.nombre && payload.nombre.length > 120) {
    errores.push('El nombre no puede superar los 120 caracteres.');
  }

  if (payload.apellido && payload.apellido.length > 120) {
    errores.push('El apellido no puede superar los 120 caracteres.');
  }

  if (payload.email && payload.email.length > 150) {
    errores.push('El email no puede superar los 150 caracteres.');
  }

  if (payload.telefono && payload.telefono.length > 50) {
    errores.push('El teléfono no puede superar los 50 caracteres.');
  }

  return errores;
};

const validarPasswordNueva = (password) => {
  const texto = normalizarTexto(password);

  if (!texto) {
    return {
      ok: false,
      message: 'La contraseña es obligatoria.'
    };
  }

  if (texto.length < 6) {
    return {
      ok: false,
      message: 'La contraseña debe tener al menos 6 caracteres.'
    };
  }

  return {
    ok: true,
    password: texto
  };
};

const validarRolExistente = async (rolId) => {
  if (!rolId) return null;

  return UsuariosRolesModel.findOne({
    where: {
      id: rolId,
      activo: 1
    }
  });
};

const validarSedeExistente = async (sedeId) => {
  if (!sedeId) return null;

  return SedesModel.findOne({
    where: {
      id: sedeId,
      activo: 1
    }
  });
};

const verificarEmailDuplicado = async (email, usuarioIdExcluir = null) => {
  if (!email) return null;

  const where = {
    email
  };

  if (usuarioIdExcluir) {
    where.id = {
      [Op.ne]: usuarioIdExcluir
    };
  }

  return UsuariosModel.findOne({ where });
};

const prepararAsignacionesSedes = (body = {}, sedePrincipalId = null) => {
  const asignaciones = [];

  if (Array.isArray(body.sedes)) {
    body.sedes.forEach((item) => {
      const sedeId =
        typeof item === 'object' && item !== null
          ? item.sede_id || item.id
          : item;

      if (!sedeId) return;

      asignaciones.push({
        sede_id: Number(sedeId),
        rol_id:
          typeof item === 'object' && item !== null && item.rol_id
            ? Number(item.rol_id)
            : null,
        es_sede_principal:
          Number(sedeId) === Number(sedePrincipalId) ||
          normalizarBoolean(item?.es_sede_principal, false),
        puede_operar:
          typeof item === 'object' && item !== null
            ? normalizarBoolean(item.puede_operar, true)
            : true,
        puede_ver_reportes:
          typeof item === 'object' && item !== null
            ? normalizarBoolean(item.puede_ver_reportes, false)
            : false,
        puede_ver_finanzas:
          typeof item === 'object' && item !== null
            ? normalizarBoolean(item.puede_ver_finanzas, false)
            : false
      });
    });
  }

  if (
    sedePrincipalId &&
    !asignaciones.some(
      (item) => Number(item.sede_id) === Number(sedePrincipalId)
    )
  ) {
    asignaciones.push({
      sede_id: Number(sedePrincipalId),
      rol_id: null,
      es_sede_principal: true,
      puede_operar: true,
      puede_ver_reportes: true,
      puede_ver_finanzas: false
    });
  }

  const map = new Map();

  asignaciones.forEach((item) => {
    map.set(Number(item.sede_id), item);
  });

  return Array.from(map.values());
};

const crearAsignacionesSedesIniciales = async ({
  usuarioId,
  rolId,
  asignaciones,
  transaction
}) => {
  if (!Array.isArray(asignaciones) || asignaciones.length === 0) return;

  for (const asignacion of asignaciones) {
    const sedeExiste = await validarSedeExistente(asignacion.sede_id);

    if (!sedeExiste) {
      throw new Error(
        `La sede ${asignacion.sede_id} no existe o está inactiva.`
      );
    }

    await UsuariosSedesModel.create(
      {
        usuario_id: usuarioId,
        sede_id: asignacion.sede_id,
        rol_id: asignacion.rol_id || rolId || null,
        es_sede_principal: asignacion.es_sede_principal ? 1 : 0,
        puede_operar: asignacion.puede_operar ? 1 : 0,
        puede_ver_reportes: asignacion.puede_ver_reportes ? 1 : 0,
        puede_ver_finanzas: asignacion.puede_ver_finanzas ? 1 : 0,
        activo: 1
      },
      {
        transaction
      }
    );
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Lista usuarios con filtros, búsqueda, rol, estado, sede y paginación.
 */
export const OBR_Usuarios_CTS = async (req, res) => {
  try {
    const {
      q,
      rol_id,
      rol_codigo,
      estado,
      sede_id,
      page = 1,
      limit = 20,
      orderBy = 'created_at',
      orderDirection = 'DESC'
    } = req.query;

    const where = {};

    const estadoNormalizado = normalizarEstado(estado);

    if (estadoNormalizado) {
      if (!ESTADOS_USUARIO_VALIDOS.includes(estadoNormalizado)) {
        return res.status(400).json({
          ok: false,
          message: 'Estado de usuario inválido.',
          estados_validos: ESTADOS_USUARIO_VALIDOS
        });
      }

      where.estado = estadoNormalizado;
    }

    if (rol_id) {
      where.rol_id = Number(rol_id);
    }

    if (rol_codigo) {
      const rol = await UsuariosRolesModel.findOne({
        where: {
          codigo: String(rol_codigo).toUpperCase()
        }
      });

      if (!rol) {
        return res.status(200).json({
          ok: true,
          message: 'Usuarios obtenidos correctamente.',
          total: 0,
          page: Number(page) || 1,
          limit: Number(limit) || 20,
          total_pages: 0,
          data: []
        });
      }

      where.rol_id = rol.id;
    }

    if (sede_id) {
      const asignaciones = await UsuariosSedesModel.findAll({
        where: {
          sede_id: Number(sede_id),
          activo: 1
        },
        attributes: ['usuario_id']
      });

      const usuarioIds = asignaciones.map((item) => item.usuario_id);

      if (usuarioIds.length === 0) {
        return res.status(200).json({
          ok: true,
          message: 'Usuarios obtenidos correctamente.',
          total: 0,
          page: Number(page) || 1,
          limit: Number(limit) || 20,
          total_pages: 0,
          data: []
        });
      }

      where.id = {
        [Op.in]: usuarioIds
      };
    }

    const search = normalizarTexto(q);

    if (search) {
      where[Op.or] = [
        {
          nombre: {
            [Op.like]: `%${search}%`
          }
        },
        {
          apellido: {
            [Op.like]: `%${search}%`
          }
        },
        {
          email: {
            [Op.like]: `%${search}%`
          }
        },
        {
          telefono: {
            [Op.like]: `%${search}%`
          }
        }
      ];
    }

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 20, 1), 200);
    const offset = (pageNumber - 1) * limitNumber;

    const allowedOrderFields = [
      'id',
      'nombre',
      'apellido',
      'email',
      'telefono',
      'estado',
      'ultimo_login',
      'created_at',
      'updated_at'
    ];

    const safeOrderBy = allowedOrderFields.includes(orderBy)
      ? orderBy
      : 'created_at';

    const safeOrderDirection =
      String(orderDirection).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { rows, count } = await UsuariosModel.findAndCountAll({
      where,
      attributes: {
        exclude: ['password_hash']
      },
      limit: limitNumber,
      offset,
      order: [[safeOrderBy, safeOrderDirection]]
    });

    const data = await Promise.all(
      rows.map((usuario) => construirUsuarioRespuesta(usuario))
    );

    return res.status(200).json({
      ok: true,
      message: 'Usuarios obtenidos correctamente.',
      total: count,
      page: pageNumber,
      limit: limitNumber,
      total_pages: Math.ceil(count / limitNumber),
      data
    });
  } catch (error) {
    console.error('Error OBR_Usuarios_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener los usuarios.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Obtiene el perfil del usuario autenticado.
 */
export const OBR_UsuarioPerfil_CTS = async (req, res) => {
  try {
    const usuarioId = req.user?.id || req.user?.usuario_id;

    const usuario = await UsuariosModel.findByPk(usuarioId, {
      attributes: {
        exclude: ['password_hash']
      }
    });

    if (!usuario) {
      return res.status(404).json({
        ok: false,
        message: 'Usuario autenticado no encontrado.'
      });
    }

    const data = await construirUsuarioRespuesta(usuario);

    return res.status(200).json({
      ok: true,
      message: 'Perfil obtenido correctamente.',
      data
    });
  } catch (error) {
    console.error('Error OBR_UsuarioPerfil_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener el perfil del usuario.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Obtiene un usuario por ID.
 */
export const OBR_UsuarioPorId_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const usuario = await UsuariosModel.findByPk(id, {
      attributes: {
        exclude: ['password_hash']
      }
    });

    if (!usuario) {
      return res.status(404).json({
        ok: false,
        message: 'Usuario no encontrado.'
      });
    }

    const data = await construirUsuarioRespuesta(usuario);

    return res.status(200).json({
      ok: true,
      message: 'Usuario obtenido correctamente.',
      data
    });
  } catch (error) {
    console.error('Error OBR_UsuarioPorId_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener el usuario.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Crea un nuevo usuario con password hasheada y asignación opcional de sedes.
 */
export const CR_Usuarios_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const payload = buildUsuarioPayload(req.body, 'create');
    const passwordValidada = validarPasswordNueva(
      req.body.password || req.body.contrasena || req.body.password_plain
    );

    const errores = validarPayloadUsuario(payload, 'create');

    if (!passwordValidada.ok) {
      errores.push(passwordValidada.message);
    }

    if (errores.length > 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para crear el usuario.',
        errors: errores
      });
    }

    const rol = await validarRolExistente(payload.rol_id);

    if (!rol) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'El rol indicado no existe o está inactivo.'
      });
    }

    if (
      ROLES_PROTEGIDOS.includes(rol.codigo) &&
      req.user?.rol_codigo !== 'SUPER_ADMIN'
    ) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'Solo un SUPER_ADMIN puede crear usuarios con rol protegido.'
      });
    }

    if (payload.sede_principal_id) {
      const sedeExiste = await validarSedeExistente(payload.sede_principal_id);

      if (!sedeExiste) {
        await transaction.rollback();

        return res.status(400).json({
          ok: false,
          message: 'La sede principal indicada no existe o está inactiva.'
        });
      }
    }

    const emailDuplicado = await verificarEmailDuplicado(payload.email);

    if (emailDuplicado) {
      await transaction.rollback();

      return res.status(409).json({
        ok: false,
        message: 'Ya existe un usuario con ese email.'
      });
    }

    const passwordHash = await hashPassword(passwordValidada.password);

    const nuevoUsuario = await UsuariosModel.create(
      {
        ...payload,
        password_hash: passwordHash,
        estado: 'activo'
      },
      {
        transaction
      }
    );

    const asignaciones = prepararAsignacionesSedes(
      req.body,
      payload.sede_principal_id
    );

    await crearAsignacionesSedesIniciales({
      usuarioId: nuevoUsuario.id,
      rolId: nuevoUsuario.rol_id,
      asignaciones,
      transaction
    });

    await transaction.commit();

    const usuarioFinal = await UsuariosModel.findByPk(nuevoUsuario.id, {
      attributes: {
        exclude: ['password_hash']
      }
    });

    const data = await construirUsuarioRespuesta(usuarioFinal);

    return res.status(201).json({
      ok: true,
      message: 'Usuario creado correctamente.',
      data
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error CR_Usuarios_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: error?.message || 'Error al crear el usuario.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Actualiza datos principales de un usuario.
 */
export const UR_Usuarios_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const usuario = await UsuariosModel.findByPk(id);

    if (!usuario) {
      await transaction.rollback();

      return res.status(404).json({
        ok: false,
        message: 'Usuario no encontrado.'
      });
    }

    const validacionProtegido = await validarGestionRolProtegido(
      usuario,
      req.user
    );

    if (!validacionProtegido.ok) {
      await transaction.rollback();

      return res.status(403).json(validacionProtegido);
    }

    const payload = buildUsuarioPayload(req.body, 'update');
    const errores = validarPayloadUsuario(payload, 'update');

    if (errores.length > 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para actualizar el usuario.',
        errors: errores
      });
    }

    if (!payload.nombre) {
      delete payload.nombre;
    }

    if (payload.rol_id) {
      const rol = await validarRolExistente(payload.rol_id);

      if (!rol) {
        await transaction.rollback();

        return res.status(400).json({
          ok: false,
          message: 'El rol indicado no existe o está inactivo.'
        });
      }

      if (
        Number(req.user?.id) === Number(id) &&
        Number(payload.rol_id) !== Number(usuario.rol_id)
      ) {
        await transaction.rollback();

        return res.status(400).json({
          ok: false,
          message: 'No puede modificar su propio rol.'
        });
      }

      if (
        ROLES_PROTEGIDOS.includes(rol.codigo) &&
        req.user?.rol_codigo !== 'SUPER_ADMIN'
      ) {
        await transaction.rollback();

        return res.status(403).json({
          ok: false,
          message: 'Solo un SUPER_ADMIN puede asignar un rol protegido.'
        });
      }
    } else {
      delete payload.rol_id;
    }

    if (payload.sede_principal_id) {
      const sedeExiste = await validarSedeExistente(payload.sede_principal_id);

      if (!sedeExiste) {
        await transaction.rollback();

        return res.status(400).json({
          ok: false,
          message: 'La sede principal indicada no existe o está inactiva.'
        });
      }
    }

    if (payload.email) {
      const emailDuplicado = await verificarEmailDuplicado(payload.email, id);

      if (emailDuplicado) {
        await transaction.rollback();

        return res.status(409).json({
          ok: false,
          message: 'Ya existe otro usuario con ese email.'
        });
      }
    }

    await usuario.update(payload, {
      transaction
    });

    if (payload.sede_principal_id) {
      await UsuariosSedesModel.update(
        {
          es_sede_principal: 0
        },
        {
          where: {
            usuario_id: usuario.id
          },
          transaction
        }
      );

      const asignacionExistente = await UsuariosSedesModel.findOne({
        where: {
          usuario_id: usuario.id,
          sede_id: payload.sede_principal_id
        },
        transaction
      });

      if (asignacionExistente) {
        await asignacionExistente.update(
          {
            es_sede_principal: 1,
            activo: 1,
            puede_operar: 1
          },
          {
            transaction
          }
        );
      } else {
        await UsuariosSedesModel.create(
          {
            usuario_id: usuario.id,
            sede_id: payload.sede_principal_id,
            rol_id: usuario.rol_id,
            es_sede_principal: 1,
            puede_operar: 1,
            puede_ver_reportes: 1,
            puede_ver_finanzas: ROLES_GLOBALES.includes(req.user?.rol_codigo)
              ? 1
              : 0,
            activo: 1
          },
          {
            transaction
          }
        );
      }
    }

    await transaction.commit();

    const usuarioFinal = await UsuariosModel.findByPk(id, {
      attributes: {
        exclude: ['password_hash']
      }
    });

    const data = await construirUsuarioRespuesta(usuarioFinal);

    return res.status(200).json({
      ok: true,
      message: 'Usuario actualizado correctamente.',
      data
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error UR_Usuarios_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al actualizar el usuario.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Cambia estado activo/inactivo/bloqueado de un usuario.
 */
export const UR_EstadoUsuarios_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const estado = normalizarEstado(req.body.estado);

    if (!ESTADOS_USUARIO_VALIDOS.includes(estado)) {
      return res.status(400).json({
        ok: false,
        message: 'Estado de usuario inválido.',
        estados_validos: ESTADOS_USUARIO_VALIDOS
      });
    }

    const usuario = await UsuariosModel.findByPk(id);

    if (!usuario) {
      return res.status(404).json({
        ok: false,
        message: 'Usuario no encontrado.'
      });
    }

    const validacionProtegido = await validarGestionRolProtegido(
      usuario,
      req.user
    );

    if (!validacionProtegido.ok) {
      return res.status(403).json(validacionProtegido);
    }

    if (Number(req.user?.id) === Number(id) && estado !== 'activo') {
      return res.status(400).json({
        ok: false,
        message: 'No puede bloquear o inactivar su propio usuario.'
      });
    }

    await usuario.update({
      estado
    });

    const data = await construirUsuarioRespuesta(usuario);

    return res.status(200).json({
      ok: true,
      message: 'Estado del usuario actualizado correctamente.',
      data
    });
  } catch (error) {
    console.error('Error UR_EstadoUsuarios_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al cambiar el estado del usuario.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Cambia password de un usuario desde administración.
 */
export const UR_PasswordUsuarios_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const passwordValidada = validarPasswordNueva(
      req.body.password || req.body.nueva_password || req.body.contrasena
    );

    if (!passwordValidada.ok) {
      return res.status(400).json({
        ok: false,
        message: passwordValidada.message
      });
    }

    const usuario = await UsuariosModel.findByPk(id);

    if (!usuario) {
      return res.status(404).json({
        ok: false,
        message: 'Usuario no encontrado.'
      });
    }

    const validacionProtegido = await validarGestionRolProtegido(
      usuario,
      req.user
    );

    if (!validacionProtegido.ok) {
      return res.status(403).json(validacionProtegido);
    }

    const passwordHash = await hashPassword(passwordValidada.password);

    await usuario.update({
      password_hash: passwordHash
    });

    return res.status(200).json({
      ok: true,
      message: 'Contraseña actualizada correctamente.'
    });
  } catch (error) {
    console.error('Error UR_PasswordUsuarios_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al actualizar la contraseña del usuario.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Permite que el usuario autenticado cambie su propia contraseña.
 */
export const UR_MiPasswordUsuarios_CTS = async (req, res) => {
  try {
    const usuarioId = req.user?.id || req.user?.usuario_id;

    const { password_actual, nueva_password } = req.body;

    if (!password_actual) {
      return res.status(400).json({
        ok: false,
        message: 'Debe ingresar la contraseña actual.'
      });
    }

    const passwordValidada = validarPasswordNueva(nueva_password);

    if (!passwordValidada.ok) {
      return res.status(400).json({
        ok: false,
        message: passwordValidada.message
      });
    }

    const usuario = await UsuariosModel.findByPk(usuarioId);

    if (!usuario) {
      return res.status(404).json({
        ok: false,
        message: 'Usuario autenticado no encontrado.'
      });
    }

    const passwordActualValida = await bcrypt.compare(
      String(password_actual),
      usuario.password_hash
    );

    if (!passwordActualValida) {
      return res.status(401).json({
        ok: false,
        message: 'La contraseña actual no es correcta.'
      });
    }

    const passwordHash = await hashPassword(passwordValidada.password);

    await usuario.update({
      password_hash: passwordHash
    });

    return res.status(200).json({
      ok: true,
      message: 'Tu contraseña fue actualizada correctamente.'
    });
  } catch (error) {
    console.error('Error UR_MiPasswordUsuarios_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al actualizar tu contraseña.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Desactiva un usuario sin eliminarlo físicamente.
 */
export const DR_Usuarios_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const usuario = await UsuariosModel.findByPk(id);

    if (!usuario) {
      return res.status(404).json({
        ok: false,
        message: 'Usuario no encontrado.'
      });
    }

    const validacionProtegido = await validarGestionRolProtegido(
      usuario,
      req.user
    );

    if (!validacionProtegido.ok) {
      return res.status(403).json(validacionProtegido);
    }

    if (Number(req.user?.id) === Number(id)) {
      return res.status(400).json({
        ok: false,
        message: 'No puede desactivar su propio usuario.'
      });
    }

    await usuario.update({
      estado: 'inactivo'
    });

    const data = await construirUsuarioRespuesta(usuario);

    return res.status(200).json({
      ok: true,
      message: 'Usuario desactivado correctamente.',
      data
    });
  } catch (error) {
    console.error('Error DR_Usuarios_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al desactivar el usuario.'
    });
  }
};
