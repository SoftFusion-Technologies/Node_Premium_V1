/*
 * Benjamin Orellana - 2026/05/10 - Controlador Sequelize para la gestión de sedes PREMIUM.
 */

import { Op } from 'sequelize';
import SedesModel from '../../Models/Sede/MD_TB_Sedes.js';

const ESTADOS_ACTIVO_VALIDOS = [0, 1];

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

const buildSedePayload = (body = {}, modo = 'create') => {
  const nombre = normalizarTexto(body.nombre);
  const codigoManual = normalizarTexto(body.codigo);
  const codigo = codigoManual
    ? normalizarCodigo(codigoManual)
    : normalizarCodigo(nombre);

  const payload = {
    nombre,
    codigo,
    domicilio: normalizarTexto(body.domicilio),
    localidad: normalizarTexto(body.localidad),
    provincia: normalizarTexto(body.provincia),
    telefono: normalizarTexto(body.telefono),
    email: normalizarTexto(body.email),
    capacidad_operativa:
      body.capacidad_operativa === undefined ||
      body.capacidad_operativa === null ||
      body.capacidad_operativa === ''
        ? null
        : Number(body.capacidad_operativa)
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

const validarPayloadSede = (payload = {}, modo = 'create') => {
  const errores = [];

  if (modo === 'create' && !payload.nombre) {
    errores.push('El nombre de la sede es obligatorio.');
  }

  if (modo === 'create' && !payload.codigo) {
    errores.push('El código de la sede es obligatorio.');
  }

  if (
    payload.capacidad_operativa !== null &&
    payload.capacidad_operativa !== undefined &&
    (Number.isNaN(Number(payload.capacidad_operativa)) ||
      Number(payload.capacidad_operativa) < 0)
  ) {
    errores.push(
      'La capacidad operativa debe ser un número mayor o igual a 0.'
    );
  }

  return errores;
};

/*
 * Benjamin Orellana - 2026/05/10 - Lista sedes con filtros, búsqueda y paginación.
 */
export const OBRSedes_CTS = async (req, res) => {
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
          localidad: {
            [Op.like]: `%${search}%`
          }
        },
        {
          provincia: {
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
      'localidad',
      'provincia',
      'activo',
      'created_at',
      'updated_at'
    ];

    const safeOrderBy = allowedOrderFields.includes(orderBy)
      ? orderBy
      : 'nombre';
    const safeOrderDirection =
      String(orderDirection).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const { rows, count } = await SedesModel.findAndCountAll({
      where,
      limit: limitNumber,
      offset,
      order: [[safeOrderBy, safeOrderDirection]]
    });

    return res.status(200).json({
      ok: true,
      message: 'Sedes obtenidas correctamente.',
      total: count,
      page: pageNumber,
      limit: limitNumber,
      total_pages: Math.ceil(count / limitNumber),
      data: rows
    });
  } catch (error) {
    console.error('Error OBRSedes_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener las sedes.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Lista sedes activas para selects y filtros operativos.
 */
export const OBRSedesActivas_CTS = async (req, res) => {
  try {
    const sedes = await SedesModel.findAll({
      where: {
        activo: 1
      },
      order: [['nombre', 'ASC']]
    });

    return res.status(200).json({
      ok: true,
      message: 'Sedes activas obtenidas correctamente.',
      data: sedes
    });
  } catch (error) {
    console.error('Error OBRSedesActivas_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener las sedes activas.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/06/01 - Lista pública de sedes activas para formularios externos.
 */
export const OBRSedesPublicas_CTS = async (req, res) => {
  try {
    const sedes = await SedesModel.findAll({
      attributes: ['id', 'nombre'],
      where: {
        activo: 1
      },
      order: [['nombre', 'ASC']]
    });

    return res.status(200).json({
      ok: true,
      message: 'Sedes públicas obtenidas correctamente.',
      data: sedes
    });
  } catch (error) {
    console.error('Error OBRSedesPublicas_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener las sedes públicas.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Obtiene una sede por ID.
 */
export const OBRSedePorId_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const sede = await SedesModel.findByPk(id);

    if (!sede) {
      return res.status(404).json({
        ok: false,
        message: 'Sede no encontrada.'
      });
    }

    return res.status(200).json({
      ok: true,
      message: 'Sede obtenida correctamente.',
      data: sede
    });
  } catch (error) {
    console.error('Error OBRSedePorId_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener la sede.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Crea una nueva sede.
 */
export const CRSede_CTS = async (req, res) => {
  try {
    const payload = buildSedePayload(req.body, 'create');
    const errores = validarPayloadSede(payload, 'create');

    if (errores.length > 0) {
      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para crear la sede.',
        errors: errores
      });
    }

    const existeCodigo = await SedesModel.findOne({
      where: {
        codigo: payload.codigo
      }
    });

    if (existeCodigo) {
      return res.status(409).json({
        ok: false,
        message: 'Ya existe una sede con ese código.'
      });
    }

    const nuevaSede = await SedesModel.create({
      ...payload,
      activo: 1
    });

    return res.status(201).json({
      ok: true,
      message: 'Sede creada correctamente.',
      data: nuevaSede
    });
  } catch (error) {
    console.error('Error CRSede_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al crear la sede.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Actualiza una sede existente.
 */
export const URSede_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const sede = await SedesModel.findByPk(id);

    if (!sede) {
      return res.status(404).json({
        ok: false,
        message: 'Sede no encontrada.'
      });
    }

    const payload = buildSedePayload(req.body, 'update');
    const errores = validarPayloadSede(payload, 'update');

    if (errores.length > 0) {
      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para actualizar la sede.',
        errors: errores
      });
    }

    if (!payload.nombre) {
      delete payload.nombre;
    }

    if (!payload.codigo) {
      delete payload.codigo;
    }

    if (payload.codigo && payload.codigo !== sede.codigo) {
      const existeCodigo = await SedesModel.findOne({
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
          message: 'Ya existe otra sede con ese código.'
        });
      }
    }

    await sede.update(payload);

    return res.status(200).json({
      ok: true,
      message: 'Sede actualizada correctamente.',
      data: sede
    });
  } catch (error) {
    console.error('Error URSede_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al actualizar la sede.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Cambia el estado activo/inactivo de una sede.
 */
export const URSedeEstado_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const activoNormalizado = normalizarActivo(req.body.activo);

    if (!ESTADOS_ACTIVO_VALIDOS.includes(activoNormalizado)) {
      return res.status(400).json({
        ok: false,
        message: 'El estado activo debe ser 1 o 0.'
      });
    }

    const sede = await SedesModel.findByPk(id);

    if (!sede) {
      return res.status(404).json({
        ok: false,
        message: 'Sede no encontrada.'
      });
    }

    await sede.update({
      activo: activoNormalizado
    });

    return res.status(200).json({
      ok: true,
      message:
        activoNormalizado === 1
          ? 'Sede activada correctamente.'
          : 'Sede desactivada correctamente.',
      data: sede
    });
  } catch (error) {
    console.error('Error URSedeEstado_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al cambiar el estado de la sede.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/10 - Desactiva una sede sin eliminarla físicamente.
 */
export const DRSede_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const sede = await SedesModel.findByPk(id);

    if (!sede) {
      return res.status(404).json({
        ok: false,
        message: 'Sede no encontrada.'
      });
    }

    await sede.update({
      activo: 0
    });

    return res.status(200).json({
      ok: true,
      message: 'Sede desactivada correctamente.',
      data: sede
    });
  } catch (error) {
    console.error('Error DRSede_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al desactivar la sede.'
    });
  }
};
