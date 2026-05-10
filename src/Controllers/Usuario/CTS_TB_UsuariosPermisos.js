/*
 * Benjamin Orellana - 2026/05/10 - Controlador Sequelize para la gestión de permisos de usuarios PREMIUM.
 */

import { Op } from 'sequelize';
import UsuariosPermisosModel from '../../Models/Usuario/MD_TB_UsuariosPermisos.js';

const ESTADOS_ACTIVO_VALIDOS = [0, 1];

const PERMISOS_PROTEGIDOS = [
  'SISTEMA_ADMINISTRAR',
  'USUARIOS_ADMINISTRAR',
  'ROLES_ADMINISTRAR',
  'PERMISOS_ADMINISTRAR'
];

const normalizarTexto = (value) => {
  if (value === undefined || value === null) return null;

  const texto = String(value).trim();

  return texto.length > 0 ? texto : null;
};

const normalizarClave = (value) => {
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

const buildUsuariosPermisosPayload = (body = {}, modo = 'create') => {
  const modulo = normalizarClave(body.modulo);
  const accion = normalizarClave(body.accion);

  const codigoManual = normalizarTexto(body.codigo);

  const codigo = codigoManual
    ? normalizarClave(codigoManual)
    : modulo && accion
      ? `${modulo}_${accion}`
      : null;

  const payload = {
    modulo,
    accion,
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

const validarPayloadUsuariosPermisos = (payload = {}, modo = 'create') => {
  const errores = [];

  if (modo === 'create' && !payload.modulo) {
    errores.push('El módulo del permiso es obligatorio.');
  }

  if (modo === 'create' && !payload.accion) {
    errores.push('La acción del permiso es obligatoria.');
  }

  if (modo === 'create' && !payload.codigo) {
    errores.push('El código del permiso es obligatorio.');
  }

  if (payload.modulo && payload.modulo.length > 80) {
    errores.push('El módulo no puede superar los 80 caracteres.');
  }

  if (payload.accion && payload.accion.length > 80) {
    errores.push('La acción no puede superar los 80 caracteres.');
  }

  if (payload.codigo && payload.codigo.length > 120) {
    errores.push('El código no puede superar los 120 caracteres.');
  }

  if (payload.descripcion && payload.descripcion.length > 255) {
    errores.push('La descripción no puede superar los 255 caracteres.');
  }

  return errores;
};

/*
 * Benjamin Orellana - 2026/05/10 - Lista permisos de usuarios con filtros, búsqueda y paginación.
 */
export const OBR_UsuariosPermisos_CTS = async (req, res) => {
  try {
    const {
      q,
      modulo,
      accion,
      activo,
      page = 1,
      limit = 20,
      orderBy = 'modulo',
      orderDirection = 'ASC'
    } = req.query;

    const where = {};

    const activoNormalizado = normalizarActivo(activo);

    if (activoNormalizado !== null) {
      where.activo = activoNormalizado;
    }

    const moduloNormalizado = normalizarClave(modulo);
    const accionNormalizada = normalizarClave(accion);

    if (moduloNormalizado) {
      where.modulo = moduloNormalizado;
    }

    if (accionNormalizada) {
      where.accion = accionNormalizada;
    }

    const search = normalizarTexto(q);

    if (search) {
      where[Op.or] = [
        {
          modulo: {
            [Op.like]: `%${search}%`
          }
        },
        {
          accion: {
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
      'modulo',
      'accion',
      'codigo',
      'activo',
      'created_at',
      'updated_at'
    ];

    const safeOrderBy = allowedOrderFields.includes(orderBy)
      ? orderBy
      : 'modulo';

    const safeOrderDirection =
      String(orderDirection).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const { rows, count } = await UsuariosPermisosModel.findAndCountAll({
      where,
      limit: limitNumber,
      offset,
      order: [
        [safeOrderBy, safeOrderDirection],
        ['accion', 'ASC']
      ]
    });

    return res.status(200).json({
      ok: true,
      message: 'Permisos de usuarios obtenidos correctamente.',
      total: count,
      page: pageNumber,
      limit: limitNumber,
      total_pages: Math.ceil(count / limitNumber),
      data: rows
    });
  } catch (error) {
    console.error('Error OBR_UsuariosPermisos_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener los permisos de usuarios.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Lista permisos activos para asignación a roles.
 */
export const OBR_UsuariosPermisosActivos_CTS = async (req, res) => {
  try {
    const permisos = await UsuariosPermisosModel.findAll({
      where: {
        activo: 1
      },
      order: [
        ['modulo', 'ASC'],
        ['accion', 'ASC']
      ]
    });

    return res.status(200).json({
      ok: true,
      message: 'Permisos activos obtenidos correctamente.',
      data: permisos
    });
  } catch (error) {
    console.error('Error OBR_UsuariosPermisosActivos_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener los permisos activos.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Obtiene un permiso por ID.
 */
export const OBR_UsuariosPermisosPorId_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const permiso = await UsuariosPermisosModel.findByPk(id);

    if (!permiso) {
      return res.status(404).json({
        ok: false,
        message: 'Permiso de usuario no encontrado.'
      });
    }

    return res.status(200).json({
      ok: true,
      message: 'Permiso de usuario obtenido correctamente.',
      data: permiso
    });
  } catch (error) {
    console.error('Error OBR_UsuariosPermisosPorId_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener el permiso de usuario.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Crea un nuevo permiso de usuario.
 */
export const CR_UsuariosPermisos_CTS = async (req, res) => {
  try {
    const payload = buildUsuariosPermisosPayload(req.body, 'create');
    const errores = validarPayloadUsuariosPermisos(payload, 'create');

    if (errores.length > 0) {
      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para crear el permiso de usuario.',
        errors: errores
      });
    }

    const existeCodigo = await UsuariosPermisosModel.findOne({
      where: {
        codigo: payload.codigo
      }
    });

    if (existeCodigo) {
      return res.status(409).json({
        ok: false,
        message: 'Ya existe un permiso de usuario con ese código.'
      });
    }

    const nuevoPermiso = await UsuariosPermisosModel.create({
      ...payload,
      activo: 1
    });

    return res.status(201).json({
      ok: true,
      message: 'Permiso de usuario creado correctamente.',
      data: nuevoPermiso
    });
  } catch (error) {
    console.error('Error CR_UsuariosPermisos_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al crear el permiso de usuario.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Actualiza un permiso de usuario existente.
 */
export const UR_UsuariosPermisos_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const permiso = await UsuariosPermisosModel.findByPk(id);

    if (!permiso) {
      return res.status(404).json({
        ok: false,
        message: 'Permiso de usuario no encontrado.'
      });
    }

    const payload = buildUsuariosPermisosPayload(req.body, 'update');
    const errores = validarPayloadUsuariosPermisos(payload, 'update');

    if (errores.length > 0) {
      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para actualizar el permiso de usuario.',
        errors: errores
      });
    }

    if (!payload.modulo) {
      delete payload.modulo;
    }

    if (!payload.accion) {
      delete payload.accion;
    }

    if (!payload.codigo) {
      delete payload.codigo;
    }

    if (
      PERMISOS_PROTEGIDOS.includes(permiso.codigo) &&
      payload.codigo &&
      payload.codigo !== permiso.codigo
    ) {
      return res.status(400).json({
        ok: false,
        message:
          'No se puede modificar el código de un permiso protegido del sistema.'
      });
    }

    if (payload.codigo && payload.codigo !== permiso.codigo) {
      const existeCodigo = await UsuariosPermisosModel.findOne({
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
          message: 'Ya existe otro permiso de usuario con ese código.'
        });
      }
    }

    await permiso.update(payload);

    return res.status(200).json({
      ok: true,
      message: 'Permiso de usuario actualizado correctamente.',
      data: permiso
    });
  } catch (error) {
    console.error('Error UR_UsuariosPermisos_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al actualizar el permiso de usuario.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Cambia estado activo/inactivo de un permiso de usuario.
 */
export const UR_EstadoUsuariosPermisos_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const activoNormalizado = normalizarActivo(req.body.activo);

    if (!ESTADOS_ACTIVO_VALIDOS.includes(activoNormalizado)) {
      return res.status(400).json({
        ok: false,
        message: 'El estado activo debe ser 1 o 0.'
      });
    }

    const permiso = await UsuariosPermisosModel.findByPk(id);

    if (!permiso) {
      return res.status(404).json({
        ok: false,
        message: 'Permiso de usuario no encontrado.'
      });
    }

    if (
      PERMISOS_PROTEGIDOS.includes(permiso.codigo) &&
      activoNormalizado === 0
    ) {
      return res.status(400).json({
        ok: false,
        message: 'No se puede desactivar un permiso protegido del sistema.'
      });
    }

    await permiso.update({
      activo: activoNormalizado
    });

    return res.status(200).json({
      ok: true,
      message:
        activoNormalizado === 1
          ? 'Permiso de usuario activado correctamente.'
          : 'Permiso de usuario desactivado correctamente.',
      data: permiso
    });
  } catch (error) {
    console.error('Error UR_EstadoUsuariosPermisos_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al cambiar el estado del permiso de usuario.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Desactiva un permiso de usuario sin eliminarlo físicamente.
 */
export const DR_UsuariosPermisos_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const permiso = await UsuariosPermisosModel.findByPk(id);

    if (!permiso) {
      return res.status(404).json({
        ok: false,
        message: 'Permiso de usuario no encontrado.'
      });
    }

    if (PERMISOS_PROTEGIDOS.includes(permiso.codigo)) {
      return res.status(400).json({
        ok: false,
        message: 'No se puede desactivar un permiso protegido del sistema.'
      });
    }

    await permiso.update({
      activo: 0
    });

    return res.status(200).json({
      ok: true,
      message: 'Permiso de usuario desactivado correctamente.',
      data: permiso
    });
  } catch (error) {
    console.error('Error DR_UsuariosPermisos_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al desactivar el permiso de usuario.'
    });
  }
};
