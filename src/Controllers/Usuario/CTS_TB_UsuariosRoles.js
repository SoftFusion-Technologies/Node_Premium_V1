/*
 * Benjamin Orellana - 2026/05/10 - Controlador Sequelize para la gestión de roles de usuarios PREMIUM.
 */

import { Op } from 'sequelize';
import UsuariosRolesModel from '../../Models/Usuario/MD_TB_UsuariosRoles.js';

const ESTADOS_ACTIVO_VALIDOS = [0, 1];

const ROLES_PROTEGIDOS = ['SUPER_ADMIN'];

const normalizarTexto = (value) => {
  if (value === undefined || value === null) return null;

  const texto = String(value).trim();

  return texto.length > 0 ? texto : null;
};

const normalizarCodigo = (value) => {
  const texto = normalizarTexto(value);

  if (!texto) return null;

  return texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

const normalizarActivo = (value) => {
  if (value === undefined || value === null || value === '') return null;

  if (
    value === true ||
    value === 'true' ||
    value === '1' ||
    Number(value) === 1
  ) {
    return 1;
  }

  if (
    value === false ||
    value === 'false' ||
    value === '0' ||
    Number(value) === 0
  ) {
    return 0;
  }

  return null;
};

const buildUsuariosRolesPayload = (body = {}, modo = 'create') => {
  const nombre = normalizarTexto(body.nombre);
  const codigoManual = normalizarTexto(body.codigo);
  const codigo = codigoManual
    ? normalizarCodigo(codigoManual)
    : normalizarCodigo(nombre);

  const payload = {
    nombre,
    codigo,
    descripcion: normalizarTexto(body.descripcion)
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

const validarPayloadUsuariosRoles = (payload = {}, modo = 'create') => {
  const errores = [];

  if (modo === 'create' && !payload.nombre) {
    errores.push('El nombre del rol es obligatorio.');
  }

  if (modo === 'create' && !payload.codigo) {
    errores.push('El código del rol es obligatorio.');
  }

  if (payload.nombre && payload.nombre.length > 80) {
    errores.push('El nombre del rol no puede superar los 80 caracteres.');
  }

  if (payload.codigo && payload.codigo.length > 50) {
    errores.push('El código del rol no puede superar los 50 caracteres.');
  }

  if (payload.descripcion && payload.descripcion.length > 255) {
    errores.push('La descripción del rol no puede superar los 255 caracteres.');
  }

  return errores;
};

/*
 * Benjamin Orellana - 2026/05/10 - Lista roles de usuarios con filtros, búsqueda y paginación.
 */
export const OBR_UsuariosRoles_CTS = async (req, res) => {
  try {
    const {
      q,
      activo,
      page = 1,
      limit = 20,
      orderBy = 'nombre',
      orderDirection = 'ASC'
    } = req.query;

    const where = {};

    const activoNormalizado = normalizarActivo(activo);

    if (activoNormalizado !== null) {
      where.activo = activoNormalizado;
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
          codigo: {
            [Op.like]: `%${search}%`
          }
        },
        {
          descripcion: {
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
      'codigo',
      'activo',
      'created_at',
      'updated_at'
    ];

    const safeOrderBy = allowedOrderFields.includes(orderBy)
      ? orderBy
      : 'nombre';

    const safeOrderDirection =
      String(orderDirection).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const { rows, count } = await UsuariosRolesModel.findAndCountAll({
      where,
      limit: limitNumber,
      offset,
      order: [[safeOrderBy, safeOrderDirection]]
    });

    return res.status(200).json({
      ok: true,
      message: 'Roles de usuarios obtenidos correctamente.',
      total: count,
      page: pageNumber,
      limit: limitNumber,
      total_pages: Math.ceil(count / limitNumber),
      data: rows
    });
  } catch (error) {
    console.error('Error OBR_UsuariosRoles_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener los roles de usuarios.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Lista roles activos para selects y formularios.
 */
export const OBR_UsuariosRolesActivos_CTS = async (req, res) => {
  try {
    const roles = await UsuariosRolesModel.findAll({
      where: {
        activo: 1
      },
      order: [['nombre', 'ASC']]
    });

    return res.status(200).json({
      ok: true,
      message: 'Roles activos obtenidos correctamente.',
      data: roles
    });
  } catch (error) {
    console.error('Error OBR_UsuariosRolesActivos_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener los roles activos.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Obtiene un rol de usuario por ID.
 */
export const OBR_UsuariosRolesPorId_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const rol = await UsuariosRolesModel.findByPk(id);

    if (!rol) {
      return res.status(404).json({
        ok: false,
        message: 'Rol de usuario no encontrado.'
      });
    }

    return res.status(200).json({
      ok: true,
      message: 'Rol de usuario obtenido correctamente.',
      data: rol
    });
  } catch (error) {
    console.error('Error OBR_UsuariosRolesPorId_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener el rol de usuario.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Crea un nuevo rol de usuario.
 */
export const CR_UsuariosRoles_CTS = async (req, res) => {
  try {
    const payload = buildUsuariosRolesPayload(req.body, 'create');
    const errores = validarPayloadUsuariosRoles(payload, 'create');

    if (errores.length > 0) {
      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para crear el rol de usuario.',
        errors: errores
      });
    }

    const existeCodigo = await UsuariosRolesModel.findOne({
      where: {
        codigo: payload.codigo
      }
    });

    if (existeCodigo) {
      return res.status(409).json({
        ok: false,
        message: 'Ya existe un rol de usuario con ese código.'
      });
    }

    const nuevoRol = await UsuariosRolesModel.create({
      ...payload,
      activo: 1
    });

    return res.status(201).json({
      ok: true,
      message: 'Rol de usuario creado correctamente.',
      data: nuevoRol
    });
  } catch (error) {
    console.error('Error CR_UsuariosRoles_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al crear el rol de usuario.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Actualiza un rol de usuario existente.
 */
export const UR_UsuariosRoles_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const rol = await UsuariosRolesModel.findByPk(id);

    if (!rol) {
      return res.status(404).json({
        ok: false,
        message: 'Rol de usuario no encontrado.'
      });
    }

    const payload = buildUsuariosRolesPayload(req.body, 'update');
    const errores = validarPayloadUsuariosRoles(payload, 'update');

    if (errores.length > 0) {
      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para actualizar el rol de usuario.',
        errors: errores
      });
    }

    if (!payload.nombre) {
      delete payload.nombre;
    }

    if (!payload.codigo) {
      delete payload.codigo;
    }

    if (
      ROLES_PROTEGIDOS.includes(rol.codigo) &&
      payload.codigo &&
      payload.codigo !== rol.codigo
    ) {
      return res.status(400).json({
        ok: false,
        message:
          'No se puede modificar el código de un rol protegido del sistema.'
      });
    }

    if (payload.codigo && payload.codigo !== rol.codigo) {
      const existeCodigo = await UsuariosRolesModel.findOne({
        where: {
          codigo: payload.codigo,
          id: {
            [Op.ne]: id
          }
        }
      });

      if (existeCodigo) {
        return res.status(409).json({
          ok: false,
          message: 'Ya existe otro rol de usuario con ese código.'
        });
      }
    }

    await rol.update(payload);

    return res.status(200).json({
      ok: true,
      message: 'Rol de usuario actualizado correctamente.',
      data: rol
    });
  } catch (error) {
    console.error('Error UR_UsuariosRoles_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al actualizar el rol de usuario.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Cambia estado activo/inactivo de un rol de usuario.
 */
export const UR_EstadoUsuariosRoles_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const activoNormalizado = normalizarActivo(req.body.activo);

    if (!ESTADOS_ACTIVO_VALIDOS.includes(activoNormalizado)) {
      return res.status(400).json({
        ok: false,
        message: 'El estado activo debe ser 1 o 0.'
      });
    }

    const rol = await UsuariosRolesModel.findByPk(id);

    if (!rol) {
      return res.status(404).json({
        ok: false,
        message: 'Rol de usuario no encontrado.'
      });
    }

    if (ROLES_PROTEGIDOS.includes(rol.codigo) && activoNormalizado === 0) {
      return res.status(400).json({
        ok: false,
        message: 'No se puede desactivar un rol protegido del sistema.'
      });
    }

    await rol.update({
      activo: activoNormalizado
    });

    return res.status(200).json({
      ok: true,
      message:
        activoNormalizado === 1
          ? 'Rol de usuario activado correctamente.'
          : 'Rol de usuario desactivado correctamente.',
      data: rol
    });
  } catch (error) {
    console.error('Error UR_EstadoUsuariosRoles_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al cambiar el estado del rol de usuario.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Desactiva un rol de usuario sin eliminarlo físicamente.
 */
export const DR_UsuariosRoles_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const rol = await UsuariosRolesModel.findByPk(id);

    if (!rol) {
      return res.status(404).json({
        ok: false,
        message: 'Rol de usuario no encontrado.'
      });
    }

    if (ROLES_PROTEGIDOS.includes(rol.codigo)) {
      return res.status(400).json({
        ok: false,
        message: 'No se puede desactivar un rol protegido del sistema.'
      });
    }

    await rol.update({
      activo: 0
    });

    return res.status(200).json({
      ok: true,
      message: 'Rol de usuario desactivado correctamente.',
      data: rol
    });
  } catch (error) {
    console.error('Error DR_UsuariosRoles_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al desactivar el rol de usuario.'
    });
  }
};
