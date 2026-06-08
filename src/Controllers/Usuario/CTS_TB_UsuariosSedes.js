/*
 * Benjamin Orellana - 2026/05/10 - Controlador Sequelize para la gestión multisede de usuarios PREMIUM.
 */

import { Op } from 'sequelize';

import db from '../../DataBase/db.js';
import UsuariosSedesModel from '../../Models/Usuario/MD_TB_UsuariosSedes.js';
import UsuariosModel from '../../Models/Usuario/MD_TB_Usuarios.js';
import UsuariosRolesModel from '../../Models/Usuario/MD_TB_UsuariosRoles.js';
import SedesModel from '../../Models/Sede/MD_TB_Sedes.js';

const ESTADOS_ACTIVO_VALIDOS = [0, 1];

const normalizarTexto = (value) => {
  if (value === undefined || value === null) return null;

  const texto = String(value).trim();

  return texto.length > 0 ? texto : null;
};

const normalizarBooleanToTinyint = (value, defaultValue = 0) => {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

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

  return defaultValue;
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

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;

  const numberValue = Number(value);

  return Number.isNaN(numberValue) ? null : numberValue;
};

const validarUsuarioExistente = async (usuarioId) => {
  if (!usuarioId) return null;

  return UsuariosModel.findOne({
    where: {
      id: usuarioId,
      estado: {
        [Op.ne]: 'bloqueado'
      }
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

const validarRolExistente = async (rolId) => {
  if (!rolId) return null;

  return UsuariosRolesModel.findOne({
    where: {
      id: rolId,
      activo: 1
    }
  });
};

const buildUsuariosSedesPayload = (body = {}, modo = 'create') => {
  const payload = {
    usuario_id: toNumberOrNull(body.usuario_id),
    sede_id: toNumberOrNull(body.sede_id),
    rol_id: toNumberOrNull(body.rol_id),

    es_sede_principal: normalizarBooleanToTinyint(
      body.es_sede_principal,
      modo === 'create' ? 0 : undefined
    ),

    puede_operar: normalizarBooleanToTinyint(
      body.puede_operar,
      modo === 'create' ? 1 : undefined
    ),

    puede_ver_reportes: normalizarBooleanToTinyint(
      body.puede_ver_reportes,
      modo === 'create' ? 0 : undefined
    ),

    puede_ver_finanzas: normalizarBooleanToTinyint(
      body.puede_ver_finanzas,
      modo === 'create' ? 0 : undefined
    )
  };

  if (modo === 'update') {
    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined || payload[key] === null) {
        delete payload[key];
      }
    });
  }

  return payload;
};

const validarPayloadUsuariosSedes = (payload = {}, modo = 'create') => {
  const errores = [];

  if (modo === 'create' && !payload.usuario_id) {
    errores.push('El usuario es obligatorio.');
  }

  if (modo === 'create' && !payload.sede_id) {
    errores.push('La sede es obligatoria.');
  }

  if (
    payload.usuario_id !== undefined &&
    payload.usuario_id !== null &&
    Number(payload.usuario_id) <= 0
  ) {
    errores.push('El usuario indicado no es válido.');
  }

  if (
    payload.sede_id !== undefined &&
    payload.sede_id !== null &&
    Number(payload.sede_id) <= 0
  ) {
    errores.push('La sede indicada no es válida.');
  }

  if (
    payload.rol_id !== undefined &&
    payload.rol_id !== null &&
    Number(payload.rol_id) <= 0
  ) {
    errores.push('El rol indicado no es válido.');
  }

  return errores;
};

const construirAsignacionRespuesta = async (asignacion) => {
  if (!asignacion) return null;

  const item =
    typeof asignacion.toJSON === 'function' ? asignacion.toJSON() : asignacion;

  const [usuario, sede, rol] = await Promise.all([
    item.usuario_id
      ? UsuariosModel.findByPk(item.usuario_id, {
          attributes: {
            exclude: ['password_hash']
          }
        })
      : null,
    item.sede_id ? SedesModel.findByPk(item.sede_id) : null,
    item.rol_id ? UsuariosRolesModel.findByPk(item.rol_id) : null
  ]);

  return {
    ...item,
    usuario: usuario
      ? typeof usuario.toJSON === 'function'
        ? usuario.toJSON()
        : usuario
      : null,
    sede: sede
      ? typeof sede.toJSON === 'function'
        ? sede.toJSON()
        : sede
      : null,
    rol: rol ? (typeof rol.toJSON === 'function' ? rol.toJSON() : rol) : null
  };
};

/*
 * Benjamin Orellana - 2026/05/10 - Lista asignaciones usuario-sede con filtros y paginación.
 */
export const OBR_UsuariosSedes_CTS = async (req, res) => {
  try {
    const {
      usuario_id,
      sede_id,
      rol_id,
      activo,
      page = 1,
      limit = 20,
      orderBy = 'id',
      orderDirection = 'DESC'
    } = req.query;

    const where = {};

    if (usuario_id) {
      where.usuario_id = Number(usuario_id);
    }

    if (sede_id) {
      where.sede_id = Number(sede_id);
    }

    if (rol_id) {
      where.rol_id = Number(rol_id);
    }

    const activoNormalizado = normalizarActivo(activo);

    if (activoNormalizado !== null) {
      where.activo = activoNormalizado;
    }

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 20, 1), 200);
    const offset = (pageNumber - 1) * limitNumber;

    const allowedOrderFields = [
      'id',
      'usuario_id',
      'sede_id',
      'rol_id',
      'es_sede_principal',
      'puede_operar',
      'puede_ver_reportes',
      'puede_ver_finanzas',
      'activo',
      'created_at',
      'updated_at'
    ];

    const safeOrderBy = allowedOrderFields.includes(orderBy) ? orderBy : 'id';
    const safeOrderDirection =
      String(orderDirection).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { rows, count } = await UsuariosSedesModel.findAndCountAll({
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
      message: 'Asignaciones usuario-sede obtenidas correctamente.',
      total: count,
      page: pageNumber,
      limit: limitNumber,
      total_pages: Math.ceil(count / limitNumber),
      data
    });
  } catch (error) {
    console.error('Error OBR_UsuariosSedes_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener las asignaciones usuario-sede.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Obtiene una asignación usuario-sede por ID.
 */
export const OBR_UsuariosSedesPorId_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const asignacion = await UsuariosSedesModel.findByPk(id);

    if (!asignacion) {
      return res.status(404).json({
        ok: false,
        message: 'Asignación usuario-sede no encontrada.'
      });
    }

    const data = await construirAsignacionRespuesta(asignacion);

    return res.status(200).json({
      ok: true,
      message: 'Asignación usuario-sede obtenida correctamente.',
      data
    });
  } catch (error) {
    console.error('Error OBR_UsuariosSedesPorId_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener la asignación usuario-sede.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Lista sedes asignadas a un usuario.
 */
export const OBR_SedesPorUsuario_CTS = async (req, res) => {
  try {
    const { usuario_id } = req.params;
    const activoNormalizado = normalizarActivo(req.query.activo);

    const where = {
      usuario_id: Number(usuario_id)
    };

    if (activoNormalizado !== null) {
      where.activo = activoNormalizado;
    }

    const usuario = await UsuariosModel.findByPk(usuario_id, {
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

    const asignaciones = await UsuariosSedesModel.findAll({
      where,
      order: [
        ['es_sede_principal', 'DESC'],
        ['id', 'ASC']
      ]
    });

    const data = await Promise.all(
      asignaciones.map((asignacion) => construirAsignacionRespuesta(asignacion))
    );

    return res.status(200).json({
      ok: true,
      message: 'Sedes del usuario obtenidas correctamente.',
      usuario,
      data
    });
  } catch (error) {
    console.error('Error OBR_SedesPorUsuario_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener las sedes del usuario.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Lista usuarios asignados a una sede.
 */
export const OBR_UsuariosPorSede_CTS = async (req, res) => {
  try {
    const { sede_id } = req.params;
    const activoNormalizado = normalizarActivo(req.query.activo);

    const where = {
      sede_id: Number(sede_id)
    };

    if (activoNormalizado !== null) {
      where.activo = activoNormalizado;
    }

    const sede = await SedesModel.findByPk(sede_id);

    if (!sede) {
      return res.status(404).json({
        ok: false,
        message: 'Sede no encontrada.'
      });
    }

    const asignaciones = await UsuariosSedesModel.findAll({
      where,
      order: [
        ['es_sede_principal', 'DESC'],
        ['id', 'ASC']
      ]
    });

    const data = await Promise.all(
      asignaciones.map((asignacion) => construirAsignacionRespuesta(asignacion))
    );

    return res.status(200).json({
      ok: true,
      message: 'Usuarios de la sede obtenidos correctamente.',
      sede,
      data
    });
  } catch (error) {
    console.error('Error OBR_UsuariosPorSede_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener los usuarios de la sede.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Asigna una sede a un usuario.
 */
export const CR_UsuariosSedes_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const payload = buildUsuariosSedesPayload(req.body, 'create');
    const errores = validarPayloadUsuariosSedes(payload, 'create');

    if (errores.length > 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para asignar la sede al usuario.',
        errors: errores
      });
    }

    const [usuario, sede] = await Promise.all([
      validarUsuarioExistente(payload.usuario_id),
      validarSedeExistente(payload.sede_id)
    ]);

    if (!usuario) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'El usuario indicado no existe o no está habilitado.'
      });
    }

    if (!sede) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'La sede indicada no existe o está inactiva.'
      });
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
    }

    const asignacionExistente = await UsuariosSedesModel.findOne({
      where: {
        usuario_id: payload.usuario_id,
        sede_id: payload.sede_id
      },
      transaction
    });

    if (payload.es_sede_principal === 1) {
      await UsuariosSedesModel.update(
        {
          es_sede_principal: 0
        },
        {
          where: {
            usuario_id: payload.usuario_id
          },
          transaction
        }
      );

      await UsuariosModel.update(
        {
          sede_principal_id: payload.sede_id
        },
        {
          where: {
            id: payload.usuario_id
          },
          transaction
        }
      );
    }

    if (asignacionExistente) {
      await asignacionExistente.update(
        {
          rol_id:
            payload.rol_id || asignacionExistente.rol_id || usuario.rol_id,
          es_sede_principal: payload.es_sede_principal,
          puede_operar: payload.puede_operar,
          puede_ver_reportes: payload.puede_ver_reportes,
          puede_ver_finanzas: payload.puede_ver_finanzas,
          activo: 1
        },
        {
          transaction
        }
      );

      await transaction.commit();

      const data = await construirAsignacionRespuesta(asignacionExistente);

      return res.status(200).json({
        ok: true,
        message:
          'La asignación ya existía y fue reactivada/actualizada correctamente.',
        data
      });
    }

    const nuevaAsignacion = await UsuariosSedesModel.create(
      {
        ...payload,
        rol_id: payload.rol_id || usuario.rol_id || null,
        activo: 1
      },
      {
        transaction
      }
    );

    await transaction.commit();

    const data = await construirAsignacionRespuesta(nuevaAsignacion);

    return res.status(201).json({
      ok: true,
      message: 'Sede asignada al usuario correctamente.',
      data
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error CR_UsuariosSedes_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al asignar la sede al usuario.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Actualiza permisos de una asignación usuario-sede.
 */
export const UR_UsuariosSedes_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const asignacion = await UsuariosSedesModel.findByPk(id, {
      transaction
    });

    if (!asignacion) {
      await transaction.rollback();

      return res.status(404).json({
        ok: false,
        message: 'Asignación usuario-sede no encontrada.'
      });
    }

    const payload = buildUsuariosSedesPayload(req.body, 'update');
    const errores = validarPayloadUsuariosSedes(payload, 'update');

    if (errores.length > 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para actualizar la asignación usuario-sede.',
        errors: errores
      });
    }

    delete payload.usuario_id;
    delete payload.sede_id;

    if (payload.rol_id) {
      const rol = await validarRolExistente(payload.rol_id);

      if (!rol) {
        await transaction.rollback();

        return res.status(400).json({
          ok: false,
          message: 'El rol indicado no existe o está inactivo.'
        });
      }
    }

    if (payload.es_sede_principal === 1) {
      await UsuariosSedesModel.update(
        {
          es_sede_principal: 0
        },
        {
          where: {
            usuario_id: asignacion.usuario_id
          },
          transaction
        }
      );

      await UsuariosModel.update(
        {
          sede_principal_id: asignacion.sede_id
        },
        {
          where: {
            id: asignacion.usuario_id
          },
          transaction
        }
      );
    }

    await asignacion.update(payload, {
      transaction
    });

    await transaction.commit();

    const data = await construirAsignacionRespuesta(asignacion);

    return res.status(200).json({
      ok: true,
      message: 'Asignación usuario-sede actualizada correctamente.',
      data
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error UR_UsuariosSedes_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al actualizar la asignación usuario-sede.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Marca una sede como principal para un usuario.
 */
export const UR_SedePrincipalUsuariosSedes_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const asignacion = await UsuariosSedesModel.findByPk(id, {
      transaction
    });

    if (!asignacion) {
      await transaction.rollback();

      return res.status(404).json({
        ok: false,
        message: 'Asignación usuario-sede no encontrada.'
      });
    }

    if (Number(asignacion.activo) !== 1) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'No se puede marcar como principal una asignación inactiva.'
      });
    }

    await UsuariosSedesModel.update(
      {
        es_sede_principal: 0
      },
      {
        where: {
          usuario_id: asignacion.usuario_id
        },
        transaction
      }
    );

    await asignacion.update(
      {
        es_sede_principal: 1,
        puede_operar: 1
      },
      {
        transaction
      }
    );

    await UsuariosModel.update(
      {
        sede_principal_id: asignacion.sede_id
      },
      {
        where: {
          id: asignacion.usuario_id
        },
        transaction
      }
    );

    await transaction.commit();

    const data = await construirAsignacionRespuesta(asignacion);

    return res.status(200).json({
      ok: true,
      message: 'Sede principal actualizada correctamente.',
      data
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error UR_SedePrincipalUsuariosSedes_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al marcar la sede principal.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Cambia estado activo/inactivo de una asignación usuario-sede.
 */
export const UR_EstadoUsuariosSedes_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;
    const activoNormalizado = normalizarActivo(req.body.activo);

    if (!ESTADOS_ACTIVO_VALIDOS.includes(activoNormalizado)) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'El estado activo debe ser 1 o 0.'
      });
    }

    const asignacion = await UsuariosSedesModel.findByPk(id, {
      transaction
    });

    if (!asignacion) {
      await transaction.rollback();

      return res.status(404).json({
        ok: false,
        message: 'Asignación usuario-sede no encontrada.'
      });
    }

    if (activoNormalizado === 0 && Number(asignacion.es_sede_principal) === 1) {
      await UsuariosModel.update(
        {
          sede_principal_id: null
        },
        {
          where: {
            id: asignacion.usuario_id
          },
          transaction
        }
      );
    }

    await asignacion.update(
      {
        activo: activoNormalizado,
        es_sede_principal:
          activoNormalizado === 0 ? 0 : asignacion.es_sede_principal
      },
      {
        transaction
      }
    );

    await transaction.commit();

    const data = await construirAsignacionRespuesta(asignacion);

    return res.status(200).json({
      ok: true,
      message:
        activoNormalizado === 1
          ? 'Asignación usuario-sede activada correctamente.'
          : 'Asignación usuario-sede desactivada correctamente.',
      data
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error UR_EstadoUsuariosSedes_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al cambiar el estado de la asignación usuario-sede.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/06/07 - Elimina físicamente una asignación usuario-sede.
 */
export const DR_UsuariosSedes_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { id } = req.params;

    const asignacion = await UsuariosSedesModel.findByPk(id, {
      transaction
    });

    if (!asignacion) {
      await transaction.rollback();

      return res.status(404).json({
        ok: false,
        message: 'Asignación usuario-sede no encontrada.'
      });
    }

    const asignacionPlano =
      typeof asignacion.toJSON === 'function'
        ? asignacion.toJSON()
        : { ...asignacion };

    /*
     * Benjamin Orellana - 2026/06/07 - Si se elimina la sede principal, limpia la referencia principal del usuario.
     */
    if (Number(asignacionPlano.es_sede_principal) === 1) {
      await UsuariosModel.update(
        {
          sede_principal_id: null
        },
        {
          where: {
            id: asignacionPlano.usuario_id
          },
          transaction
        }
      );
    }

    /*
     * Benjamin Orellana - 2026/06/07 - Elimina físicamente la asignación para que no vuelva a figurar en listados.
     */
    await asignacion.destroy({
      transaction
    });

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Asignación usuario-sede eliminada correctamente.',
      data: {
        id: asignacionPlano.id,
        usuario_id: asignacionPlano.usuario_id,
        sede_id: asignacionPlano.sede_id
      }
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error DR_UsuariosSedes_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al eliminar la asignación usuario-sede.'
    });
  }
};