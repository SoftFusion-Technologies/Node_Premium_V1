/*
 * Benjamin Orellana - 2026/05/10 - Controlador Sequelize para la asignación de permisos a roles PREMIUM.
 */

import { Op } from 'sequelize';

import db from '../../DataBase/db.js';
import UsuariosRolesPermisosModel from '../../Models/Usuario/MD_TB_UsuariosRolesPermisos.js';
import UsuariosRolesModel from '../../Models/Usuario/MD_TB_UsuariosRoles.js';
import UsuariosPermisosModel from '../../Models/Usuario/MD_TB_UsuariosPermisos.js';

const normalizarTexto = (value) => {
  if (value === undefined || value === null) return null;

  const texto = String(value).trim();

  return texto.length > 0 ? texto : null;
};

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;

  const numberValue = Number(value);

  return Number.isNaN(numberValue) ? null : numberValue;
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

const validarPermisoExistente = async (permisoId) => {
  if (!permisoId) return null;

  return UsuariosPermisosModel.findOne({
    where: {
      id: permisoId,
      activo: 1
    }
  });
};

const buildUsuariosRolesPermisosPayload = (body = {}) => {
  return {
    rol_id: toNumberOrNull(body.rol_id),
    permiso_id: toNumberOrNull(body.permiso_id)
  };
};

const validarPayloadUsuariosRolesPermisos = (payload = {}) => {
  const errores = [];

  if (!payload.rol_id) {
    errores.push('El rol es obligatorio.');
  }

  if (!payload.permiso_id) {
    errores.push('El permiso es obligatorio.');
  }

  if (payload.rol_id && Number(payload.rol_id) <= 0) {
    errores.push('El rol indicado no es válido.');
  }

  if (payload.permiso_id && Number(payload.permiso_id) <= 0) {
    errores.push('El permiso indicado no es válido.');
  }

  return errores;
};

const construirAsignacionRespuesta = async (asignacion) => {
  if (!asignacion) return null;

  const item =
    typeof asignacion.toJSON === 'function' ? asignacion.toJSON() : asignacion;

  const [rol, permiso] = await Promise.all([
    item.rol_id ? UsuariosRolesModel.findByPk(item.rol_id) : null,
    item.permiso_id ? UsuariosPermisosModel.findByPk(item.permiso_id) : null
  ]);

  return {
    ...item,
    rol: rol ? (typeof rol.toJSON === 'function' ? rol.toJSON() : rol) : null,
    permiso: permiso
      ? typeof permiso.toJSON === 'function'
        ? permiso.toJSON()
        : permiso
      : null
  };
};

/*
 * Benjamin Orellana - 2026/05/10 - Lista relaciones rol-permiso con filtros y paginación.
 */
export const OBR_UsuariosRolesPermisos_CTS = async (req, res) => {
  try {
    const {
      rol_id,
      permiso_id,
      q,
      page = 1,
      limit = 20,
      orderBy = 'id',
      orderDirection = 'DESC'
    } = req.query;

    const where = {};

    if (rol_id) {
      where.rol_id = Number(rol_id);
    }

    if (permiso_id) {
      where.permiso_id = Number(permiso_id);
    }

    const search = normalizarTexto(q);

    if (search) {
      const roles = await UsuariosRolesModel.findAll({
        where: {
          [Op.or]: [
            {
              nombre: {
                [Op.like]: `%${search}%`
              }
            },
            {
              codigo: {
                [Op.like]: `%${search}%`
              }
            }
          ]
        },
        attributes: ['id']
      });

      const permisos = await UsuariosPermisosModel.findAll({
        where: {
          [Op.or]: [
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
          ]
        },
        attributes: ['id']
      });

      const rolIds = roles.map((rol) => rol.id);
      const permisoIds = permisos.map((permiso) => permiso.id);

      where[Op.or] = [];

      if (rolIds.length > 0) {
        where[Op.or].push({
          rol_id: {
            [Op.in]: rolIds
          }
        });
      }

      if (permisoIds.length > 0) {
        where[Op.or].push({
          permiso_id: {
            [Op.in]: permisoIds
          }
        });
      }

      if (where[Op.or].length === 0) {
        return res.status(200).json({
          ok: true,
          message: 'Relaciones rol-permiso obtenidas correctamente.',
          total: 0,
          page: Number(page) || 1,
          limit: Number(limit) || 20,
          total_pages: 0,
          data: []
        });
      }
    }

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 20, 1), 200);
    const offset = (pageNumber - 1) * limitNumber;

    const allowedOrderFields = ['id', 'rol_id', 'permiso_id', 'created_at'];

    const safeOrderBy = allowedOrderFields.includes(orderBy) ? orderBy : 'id';
    const safeOrderDirection =
      String(orderDirection).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { rows, count } = await UsuariosRolesPermisosModel.findAndCountAll({
      where,
      limit: limitNumber,
      offset,
      order: [[safeOrderBy, safeOrderDirection]]
    });

    const data = await Promise.all(
      rows.map((asignacion) => construirAsignacionRespuesta(asignacion))
    );

    return res.status(200).json({
      ok: true,
      message: 'Relaciones rol-permiso obtenidas correctamente.',
      total: count,
      page: pageNumber,
      limit: limitNumber,
      total_pages: Math.ceil(count / limitNumber),
      data
    });
  } catch (error) {
    console.error('Error OBR_UsuariosRolesPermisos_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener las relaciones rol-permiso.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Obtiene una relación rol-permiso por ID.
 */
export const OBR_UsuariosRolesPermisosPorId_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const asignacion = await UsuariosRolesPermisosModel.findByPk(id);

    if (!asignacion) {
      return res.status(404).json({
        ok: false,
        message: 'Relación rol-permiso no encontrada.'
      });
    }

    const data = await construirAsignacionRespuesta(asignacion);

    return res.status(200).json({
      ok: true,
      message: 'Relación rol-permiso obtenida correctamente.',
      data
    });
  } catch (error) {
    console.error('Error OBR_UsuariosRolesPermisosPorId_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener la relación rol-permiso.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Lista permisos asignados a un rol.
 */
export const OBR_PermisosPorRol_CTS = async (req, res) => {
  try {
    const { rol_id } = req.params;

    const rol = await UsuariosRolesModel.findByPk(rol_id);

    if (!rol) {
      return res.status(404).json({
        ok: false,
        message: 'Rol no encontrado.'
      });
    }

    const asignaciones = await UsuariosRolesPermisosModel.findAll({
      where: {
        rol_id: Number(rol_id)
      },
      order: [['id', 'ASC']]
    });

    const permisoIds = asignaciones.map((item) => item.permiso_id);

    const permisos = permisoIds.length
      ? await UsuariosPermisosModel.findAll({
          where: {
            id: {
              [Op.in]: permisoIds
            }
          },
          order: [
            ['modulo', 'ASC'],
            ['accion', 'ASC']
          ]
        })
      : [];

    return res.status(200).json({
      ok: true,
      message: 'Permisos del rol obtenidos correctamente.',
      rol,
      total: permisos.length,
      data: permisos
    });
  } catch (error) {
    console.error('Error OBR_PermisosPorRol_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener los permisos del rol.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Lista roles que tienen asignado un permiso.
 */
export const OBR_RolesPorPermiso_CTS = async (req, res) => {
  try {
    const { permiso_id } = req.params;

    const permiso = await UsuariosPermisosModel.findByPk(permiso_id);

    if (!permiso) {
      return res.status(404).json({
        ok: false,
        message: 'Permiso no encontrado.'
      });
    }

    const asignaciones = await UsuariosRolesPermisosModel.findAll({
      where: {
        permiso_id: Number(permiso_id)
      },
      order: [['id', 'ASC']]
    });

    const rolIds = asignaciones.map((item) => item.rol_id);

    const roles = rolIds.length
      ? await UsuariosRolesModel.findAll({
          where: {
            id: {
              [Op.in]: rolIds
            }
          },
          order: [['nombre', 'ASC']]
        })
      : [];

    return res.status(200).json({
      ok: true,
      message: 'Roles del permiso obtenidos correctamente.',
      permiso,
      total: roles.length,
      data: roles
    });
  } catch (error) {
    console.error('Error OBR_RolesPorPermiso_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener los roles del permiso.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Asigna un permiso a un rol.
 */
export const CR_UsuariosRolesPermisos_CTS = async (req, res) => {
  try {
    const payload = buildUsuariosRolesPermisosPayload(req.body);
    const errores = validarPayloadUsuariosRolesPermisos(payload);

    if (errores.length > 0) {
      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para asignar el permiso al rol.',
        errors: errores
      });
    }

    const [rol, permiso] = await Promise.all([
      validarRolExistente(payload.rol_id),
      validarPermisoExistente(payload.permiso_id)
    ]);

    if (!rol) {
      return res.status(400).json({
        ok: false,
        message: 'El rol indicado no existe o está inactivo.'
      });
    }

    if (!permiso) {
      return res.status(400).json({
        ok: false,
        message: 'El permiso indicado no existe o está inactivo.'
      });
    }

    const existeAsignacion = await UsuariosRolesPermisosModel.findOne({
      where: {
        rol_id: payload.rol_id,
        permiso_id: payload.permiso_id
      }
    });

    if (existeAsignacion) {
      const data = await construirAsignacionRespuesta(existeAsignacion);

      return res.status(200).json({
        ok: true,
        message: 'El permiso ya estaba asignado al rol.',
        data
      });
    }

    const nuevaAsignacion = await UsuariosRolesPermisosModel.create(payload);

    const data = await construirAsignacionRespuesta(nuevaAsignacion);

    return res.status(201).json({
      ok: true,
      message: 'Permiso asignado al rol correctamente.',
      data
    });
  } catch (error) {
    console.error('Error CR_UsuariosRolesPermisos_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al asignar el permiso al rol.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Asigna varios permisos a un rol sin quitar los existentes.
 */
export const CR_MultiplesUsuariosRolesPermisos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const rolId = toNumberOrNull(req.body.rol_id || req.params.rol_id);
    const permisosIds = Array.isArray(req.body.permisos_ids)
      ? req.body.permisos_ids
      : Array.isArray(req.body.permiso_ids)
        ? req.body.permiso_ids
        : [];

    if (!rolId) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'El rol es obligatorio.'
      });
    }

    if (!permisosIds.length) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Debe indicar al menos un permiso.'
      });
    }

    const rol = await validarRolExistente(rolId);

    if (!rol) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'El rol indicado no existe o está inactivo.'
      });
    }

    const permisosNormalizados = [
      ...new Set(
        permisosIds
          .map((permisoId) => toNumberOrNull(permisoId))
          .filter(Boolean)
      )
    ];

    const permisos = await UsuariosPermisosModel.findAll({
      where: {
        id: {
          [Op.in]: permisosNormalizados
        },
        activo: 1
      },
      transaction
    });

    if (permisos.length !== permisosNormalizados.length) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Uno o más permisos no existen o están inactivos.'
      });
    }

    for (const permisoId of permisosNormalizados) {
      const existe = await UsuariosRolesPermisosModel.findOne({
        where: {
          rol_id: rolId,
          permiso_id: permisoId
        },
        transaction
      });

      if (!existe) {
        await UsuariosRolesPermisosModel.create(
          {
            rol_id: rolId,
            permiso_id: permisoId
          },
          {
            transaction
          }
        );
      }
    }

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Permisos agregados al rol correctamente.'
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error CR_MultiplesUsuariosRolesPermisos_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al asignar permisos al rol.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Reemplaza todos los permisos asignados a un rol.
 */
export const UR_PermisosRol_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const rolId = toNumberOrNull(req.params.rol_id || req.body.rol_id);
    const permisosIds = Array.isArray(req.body.permisos_ids)
      ? req.body.permisos_ids
      : Array.isArray(req.body.permiso_ids)
        ? req.body.permiso_ids
        : [];

    if (!rolId) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'El rol es obligatorio.'
      });
    }

    const rol = await validarRolExistente(rolId);

    if (!rol) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'El rol indicado no existe o está inactivo.'
      });
    }

    const permisosNormalizados = [
      ...new Set(
        permisosIds
          .map((permisoId) => toNumberOrNull(permisoId))
          .filter(Boolean)
      )
    ];

    if (permisosNormalizados.length > 0) {
      const permisos = await UsuariosPermisosModel.findAll({
        where: {
          id: {
            [Op.in]: permisosNormalizados
          },
          activo: 1
        },
        transaction
      });

      if (permisos.length !== permisosNormalizados.length) {
        await transaction.rollback();

        return res.status(400).json({
          ok: false,
          message: 'Uno o más permisos no existen o están inactivos.'
        });
      }
    }

    await UsuariosRolesPermisosModel.destroy({
      where: {
        rol_id: rolId
      },
      transaction
    });

    if (permisosNormalizados.length > 0) {
      await UsuariosRolesPermisosModel.bulkCreate(
        permisosNormalizados.map((permisoId) => ({
          rol_id: rolId,
          permiso_id: permisoId
        })),
        {
          transaction
        }
      );
    }

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Permisos del rol actualizados correctamente.'
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error UR_PermisosRol_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al reemplazar los permisos del rol.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Quita una relación rol-permiso por ID.
 */
export const DR_UsuariosRolesPermisos_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const asignacion = await UsuariosRolesPermisosModel.findByPk(id);

    if (!asignacion) {
      return res.status(404).json({
        ok: false,
        message: 'Relación rol-permiso no encontrada.'
      });
    }

    await asignacion.destroy();

    return res.status(200).json({
      ok: true,
      message: 'Permiso quitado del rol correctamente.'
    });
  } catch (error) {
    console.error('Error DR_UsuariosRolesPermisos_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al quitar el permiso del rol.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Quita un permiso específico de un rol.
 */
export const DR_PermisoRol_CTS = async (req, res) => {
  try {
    const { rol_id, permiso_id } = req.params;

    const asignacion = await UsuariosRolesPermisosModel.findOne({
      where: {
        rol_id: Number(rol_id),
        permiso_id: Number(permiso_id)
      }
    });

    if (!asignacion) {
      return res.status(404).json({
        ok: false,
        message: 'El permiso no está asignado al rol indicado.'
      });
    }

    await asignacion.destroy();

    return res.status(200).json({
      ok: true,
      message: 'Permiso quitado del rol correctamente.'
    });
  } catch (error) {
    console.error('Error DR_PermisoRol_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al quitar el permiso del rol.'
    });
  }
};
