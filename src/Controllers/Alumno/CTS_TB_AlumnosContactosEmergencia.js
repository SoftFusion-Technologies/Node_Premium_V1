/*
 * Benjamin Orellana - 2026/05/26 - Controlador Sequelize para contactos de emergencia de alumnos PREMIUM.
 */

import { Op } from 'sequelize';

import db from '../../DataBase/db.js';
import AlumnosModel from '../../Models/Alumno/MD_TB_Alumnos.js';
import AlumnosContactosEmergenciaModel from '../../Models/Alumno/MD_TB_AlumnosContactosEmergencia.js';
import { usuarioTieneAccesoTodasSedes } from '../../utils/usuariosAcceso.utils.js';

const ROLES_OPERATIVOS_ALUMNOS = [
  'SUPER_ADMIN',
  'DIRECCION',
  'FRONT_COMERCIAL',
  'COORD_SEDE'
];

const ROLES_LECTURA_ALUMNOS = [
  'SUPER_ADMIN',
  'DIRECCION',
  'FRONT_COMERCIAL',
  'COORD_SEDE',
  'PROFESOR'
];

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

const normalizarPrincipal = (value, defaultValue = 0) => {
  if (value === undefined || value === null || value === '')
    return defaultValue;

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

const usuarioEsGlobal = (user) => {
  return usuarioTieneAccesoTodasSedes(user);
};

const obtenerSedesPermitidasUsuario = (user) => {
  if (!user || !Array.isArray(user.sedes)) return [];

  return user.sedes
    .filter((sede) => {
      return (
        sede?.asignacion?.activo !== false &&
        sede?.asignacion?.puede_operar !== false
      );
    })
    .map((sede) => Number(sede.id || sede.sede_id))
    .filter(Boolean);
};

const usuarioPuedeOperarSede = (user, sedeId) => {
  // 1. Admin puede con todo
  if (usuarioEsGlobal(user)) return true;
  
  // 2. Si el alumno NO tiene sede (null) → permitir
  if (!sedeId) return true;
  
  // 3. Si tiene sede, solo permitir si es la misma que la del usuario
  const sedesPermitidas = obtenerSedesPermitidasUsuario(user);
  
  return sedesPermitidas.includes(Number(sedeId));
};

const validarRolOperacionAlumnos = (user) => {
  return ROLES_OPERATIVOS_ALUMNOS.includes(user?.rol_codigo);
};

const validarRolLecturaAlumnos = (user) => {
  return ROLES_LECTURA_ALUMNOS.includes(user?.rol_codigo);
};

const buildContactoPayload = (body = {}, modo = 'create') => {
  const payload = {
    nombre: normalizarTexto(body.nombre),
    parentesco: normalizarTexto(body.parentesco),
    telefono: normalizarTelefono(body.telefono),
    email: normalizarEmail(body.email),
    principal: normalizarPrincipal(
      body.principal,
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

const validarPayloadContacto = (payload = {}, modo = 'create') => {
  const errores = [];

  if (modo === 'create' && !payload.nombre) {
    errores.push('El nombre del contacto de emergencia es obligatorio.');
  }

  if (modo === 'create' && !payload.telefono) {
    errores.push('El teléfono del contacto de emergencia es obligatorio.');
  }

  if (payload.nombre && payload.nombre.length > 120) {
    errores.push('El nombre no puede superar los 120 caracteres.');
  }

  if (payload.parentesco && payload.parentesco.length > 80) {
    errores.push('El parentesco no puede superar los 80 caracteres.');
  }

  if (payload.telefono && payload.telefono.length > 50) {
    errores.push('El teléfono no puede superar los 50 caracteres.');
  }

  if (payload.email && payload.email.length > 150) {
    errores.push('El email no puede superar los 150 caracteres.');
  }

  return errores;
};

const buscarAlumnoConPermiso = async (alumnoId, user) => {
  const alumno = await AlumnosModel.findByPk(alumnoId);

  if (!alumno) {
    return {
      ok: false,
      status: 404,
      message: 'Alumno no encontrado.'
    };
  }

  const alumnoPlano =
    typeof alumno.toJSON === 'function' ? alumno.toJSON() : alumno;

  if (!usuarioPuedeOperarSede(user, alumnoPlano.sede_id)) {
    return {
      ok: false,
      status: 403,
      message: 'No tiene acceso al alumno indicado.'
    };
  }

  return {
    ok: true,
    alumno
  };
};

const buscarContactoConPermiso = async (contactoId, user) => {
  const contacto = await AlumnosContactosEmergenciaModel.findByPk(contactoId);

  if (!contacto) {
    return {
      ok: false,
      status: 404,
      message: 'Contacto de emergencia no encontrado.'
    };
  }

  const contactoPlano =
    typeof contacto.toJSON === 'function' ? contacto.toJSON() : contacto;

  const alumnoResult = await buscarAlumnoConPermiso(
    contactoPlano.alumno_id,
    user
  );

  if (!alumnoResult.ok) {
    return alumnoResult;
  }

  return {
    ok: true,
    contacto,
    alumno: alumnoResult.alumno
  };
};

const buscarContactoPropio = async (contactoId, alumnoId) => {
  const contacto = await AlumnosContactosEmergenciaModel.findOne({
    where: {
      id: contactoId,
      alumno_id: alumnoId
    }
  });

  if (!contacto) {
    return {
      ok: false,
      status: 404,
      message: 'Contacto de emergencia no encontrado.'
    };
  }

  return {
    ok: true,
    contacto
  };
};

const asegurarContactoPrincipal = async ({
  alumnoId,
  contactoId,
  transaction
}) => {
  await AlumnosContactosEmergenciaModel.update(
    {
      principal: 0
    },
    {
      where: {
        alumno_id: alumnoId,
        id: {
          [Op.ne]: contactoId
        }
      },
      transaction
    }
  );

  await AlumnosContactosEmergenciaModel.update(
    {
      principal: 1
    },
    {
      where: {
        id: contactoId,
        alumno_id: alumnoId
      },
      transaction
    }
  );
};

const asignarPrincipalSiNoExiste = async ({ alumnoId, transaction }) => {
  const principal = await AlumnosContactosEmergenciaModel.findOne({
    where: {
      alumno_id: alumnoId,
      principal: 1
    },
    transaction
  });

  if (principal) return;

  const primerContacto = await AlumnosContactosEmergenciaModel.findOne({
    where: {
      alumno_id: alumnoId
    },
    order: [['id', 'ASC']],
    transaction
  });

  if (primerContacto) {
    await primerContacto.update(
      {
        principal: 1
      },
      {
        transaction
      }
    );
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Lista contactos de emergencia con filtros y paginación.
 */
export const OBR_AlumnosContactosEmergencia_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaAlumnos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar contactos de emergencia.'
      });
    }

    const {
      alumno_id,
      q,
      principal,
      page = 1,
      limit = 20,
      orderBy = 'created_at',
      orderDirection = 'DESC'
    } = req.query;

    const where = {};

    if (alumno_id) {
      const alumnoResult = await buscarAlumnoConPermiso(alumno_id, req.user);

      if (!alumnoResult.ok) {
        return res.status(alumnoResult.status).json({
          ok: false,
          message: alumnoResult.message
        });
      }

      where.alumno_id = Number(alumno_id);
    }

    if (principal !== undefined && principal !== null && principal !== '') {
      where.principal = normalizarPrincipal(principal, 0);
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
          parentesco: {
            [Op.like]: `%${search}%`
          }
        },
        {
          telefono: {
            [Op.like]: `%${search}%`
          }
        },
        {
          email: {
            [Op.like]: `%${search}%`
          }
        }
      ];
    }

    if (!usuarioEsGlobal(req.user) && !alumno_id) {
      const sedesPermitidas = obtenerSedesPermitidasUsuario(req.user);

      if (!sedesPermitidas.length) {
        return res.status(403).json({
          ok: false,
          message: 'El usuario no tiene sedes asignadas.'
        });
      }

      const alumnos = await AlumnosModel.findAll({
        where: {
          sede_id: {
            [Op.in]: sedesPermitidas
          }
        },
        attributes: ['id']
      });

      const alumnosIds = alumnos.map((alumno) => alumno.id);

      where.alumno_id = {
        [Op.in]: alumnosIds.length ? alumnosIds : [0]
      };
    }

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 20, 1), 200);
    const offset = (pageNumber - 1) * limitNumber;

    const allowedOrderFields = [
      'id',
      'alumno_id',
      'nombre',
      'parentesco',
      'telefono',
      'email',
      'principal',
      'created_at',
      'updated_at'
    ];

    const safeOrderBy = allowedOrderFields.includes(orderBy)
      ? orderBy
      : 'created_at';

    const safeOrderDirection =
      String(orderDirection).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { rows, count } =
      await AlumnosContactosEmergenciaModel.findAndCountAll({
        where,
        limit: limitNumber,
        offset,
        order: [
          ['principal', 'DESC'],
          [safeOrderBy, safeOrderDirection]
        ]
      });

    return res.status(200).json({
      ok: true,
      message: 'Contactos de emergencia obtenidos correctamente.',
      total: count,
      page: pageNumber,
      limit: limitNumber,
      total_pages: Math.ceil(count / limitNumber),
      data: rows
    });
  } catch (error) {
    console.error('Error OBR_AlumnosContactosEmergencia_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener los contactos de emergencia.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Lista contactos de emergencia de un alumno específico.
 */
export const OBR_ContactosEmergenciaPorAlumno_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaAlumnos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar contactos de emergencia.'
      });
    }

    const { alumno_id } = req.params;

    const alumnoResult = await buscarAlumnoConPermiso(alumno_id, req.user);

    if (!alumnoResult.ok) {
      return res.status(alumnoResult.status).json({
        ok: false,
        message: alumnoResult.message
      });
    }

    const contactos = await AlumnosContactosEmergenciaModel.findAll({
      where: {
        alumno_id: Number(alumno_id)
      },
      order: [
        ['principal', 'DESC'],
        ['id', 'ASC']
      ]
    });

    return res.status(200).json({
      ok: true,
      message: 'Contactos de emergencia del alumno obtenidos correctamente.',
      data: contactos
    });
  } catch (error) {
    console.error('Error OBR_ContactosEmergenciaPorAlumno_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener los contactos de emergencia del alumno.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Lista contactos de emergencia del alumno autenticado.
 */
export const OBR_MisContactosEmergencia_CTS = async (req, res) => {
  try {
    const alumnoId = req.alumno?.id || req.alumno?.alumno_id;

    const contactos = await AlumnosContactosEmergenciaModel.findAll({
      where: {
        alumno_id: Number(alumnoId)
      },
      order: [
        ['principal', 'DESC'],
        ['id', 'ASC']
      ]
    });

    return res.status(200).json({
      ok: true,
      message: 'Mis contactos de emergencia obtenidos correctamente.',
      data: contactos
    });
  } catch (error) {
    console.error('Error OBR_MisContactosEmergencia_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener mis contactos de emergencia.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Obtiene un contacto de emergencia por ID desde panel interno.
 */
export const OBR_ContactoEmergenciaPorId_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaAlumnos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar contactos de emergencia.'
      });
    }

    const { id } = req.params;

    const result = await buscarContactoConPermiso(id, req.user);

    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    return res.status(200).json({
      ok: true,
      message: 'Contacto de emergencia obtenido correctamente.',
      data: result.contacto
    });
  } catch (error) {
    console.error('Error OBR_ContactoEmergenciaPorId_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener el contacto de emergencia.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Crea contacto de emergencia desde panel interno.
 */
export const CR_AlumnosContactosEmergencia_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionAlumnos(req.user)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para crear contactos de emergencia.'
      });
    }

    const { alumno_id } = req.params;

    const alumnoResult = await buscarAlumnoConPermiso(alumno_id, req.user);

    if (!alumnoResult.ok) {
      await transaction.rollback();

      return res.status(alumnoResult.status).json({
        ok: false,
        message: alumnoResult.message
      });
    }

    const payload = buildContactoPayload(req.body, 'create');
    const errores = validarPayloadContacto(payload, 'create');

    if (errores.length > 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para crear el contacto de emergencia.',
        errors: errores
      });
    }

    const totalContactos = await AlumnosContactosEmergenciaModel.count({
      where: {
        alumno_id: Number(alumno_id)
      },
      transaction
    });

    const contacto = await AlumnosContactosEmergenciaModel.create(
      {
        ...payload,
        alumno_id: Number(alumno_id),
        principal: totalContactos === 0 ? 1 : payload.principal
      },
      {
        transaction
      }
    );

    if (Number(contacto.principal) === 1) {
      await asegurarContactoPrincipal({
        alumnoId: Number(alumno_id),
        contactoId: contacto.id,
        transaction
      });
    }

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      message: 'Contacto de emergencia creado correctamente.',
      data: contacto
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error CR_AlumnosContactosEmergencia_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al crear el contacto de emergencia.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Crea contacto de emergencia desde portal alumno.
 */
export const CR_MiContactoEmergencia_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const alumnoId = req.alumno?.id || req.alumno?.alumno_id;
    
    // Acepta tanto un objeto como un array
    const contactosInput = Array.isArray(req.body.contactos) 
      ? req.body.contactos 
      : [req.body];

    // Validar cada contacto individualmente
    for (let i = 0; i < contactosInput.length; i++) {
      const payload = buildContactoPayload(contactosInput[i], 'create');
      const errores = validarPayloadContacto(payload, 'create');

      if (errores.length > 0) {
        await transaction.rollback();
        return res.status(400).json({
          ok: false,
          message: `Datos inválidos en el contacto #${i + 1}`,
          errors: errores
        });
      }
    }

    // Obtener cantidad actual de contactos para determinar el principal
    const totalContactos = await AlumnosContactosEmergenciaModel.count({
      where: { alumno_id: Number(alumnoId) },
      transaction
    });

    // Si el alumno ya marcó explícitamente algún contacto del lote como
    // principal, se respeta esa elección. Solo se asume "el primero es
    // principal por defecto" cuando nadie eligió ninguno (evita pisar la
    // elección real del usuario con la del índice 0 del array).
    const algunoMarcadoComoPrincipal = contactosInput.some(
      (contacto) => normalizarPrincipal(contacto.principal, 0) === 1
    );

    // Preparar los datos para bulkCreate
    const contactosParaCrear = contactosInput.map((contacto, index) => {
      const payload = buildContactoPayload(contacto, 'create');
      const esPrincipalPorDefecto =
        totalContactos === 0 && !algunoMarcadoComoPrincipal && index === 0;

      return {
        ...payload,
        alumno_id: Number(alumnoId),
        principal: esPrincipalPorDefecto ? 1 : payload.principal
      };
    });

    // ✅ Crear todos los contactos en una sola operación
    const contactosCreados = await AlumnosContactosEmergenciaModel.bulkCreate(
      contactosParaCrear,
      { transaction }
    );

    // Asegurar que solo haya un contacto principal
    const contactoPrincipal = contactosCreados.find(c => Number(c.principal) === 1);
    if (contactoPrincipal) {
      await asegurarContactoPrincipal({
        alumnoId: Number(alumnoId),
        contactoId: contactoPrincipal.id,
        transaction
      });
    }

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      message: `Se crearon ${contactosCreados.length} contacto(s) de emergencia correctamente.`,
      data: contactosCreados
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error CR_MiContactoEmergencia_CTS:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al crear los contactos de emergencia.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Actualiza contacto de emergencia desde panel interno.
 */
export const UR_AlumnosContactosEmergencia_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionAlumnos(req.user)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para actualizar contactos de emergencia.'
      });
    }

    const { id } = req.params;

    const result = await buscarContactoConPermiso(id, req.user);

    if (!result.ok) {
      await transaction.rollback();

      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    const payload = buildContactoPayload(req.body, 'update');
    const errores = validarPayloadContacto(payload, 'update');

    if (errores.length > 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para actualizar el contacto de emergencia.',
        errors: errores
      });
    }

    await result.contacto.update(payload, {
      transaction
    });

    if (Number(payload.principal) === 1) {
      await asegurarContactoPrincipal({
        alumnoId: result.contacto.alumno_id,
        contactoId: result.contacto.id,
        transaction
      });
    }

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Contacto de emergencia actualizado correctamente.',
      data: result.contacto
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error UR_AlumnosContactosEmergencia_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al actualizar el contacto de emergencia.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Actualiza contacto de emergencia propio desde portal alumno.
 */
export const UR_MiContactoEmergencia_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const alumnoId = req.alumno?.id || req.alumno?.alumno_id;
    const { id } = req.params;

    const result = await buscarContactoPropio(id, alumnoId);

    if (!result.ok) {
      await transaction.rollback();

      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    const payload = buildContactoPayload(req.body, 'update');
    const errores = validarPayloadContacto(payload, 'update');

    if (errores.length > 0) {
      await transaction.rollback();

      return res.status(400).json({
        ok: false,
        message: 'Datos inválidos para actualizar el contacto de emergencia.',
        errors: errores
      });
    }

    await result.contacto.update(payload, {
      transaction
    });

    if (Number(payload.principal) === 1) {
      await asegurarContactoPrincipal({
        alumnoId: Number(alumnoId),
        contactoId: result.contacto.id,
        transaction
      });
    }

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Contacto de emergencia actualizado correctamente.',
      data: result.contacto
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error UR_MiContactoEmergencia_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al actualizar mi contacto de emergencia.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Marca contacto como principal desde panel interno.
 */
export const UR_PrincipalContactoEmergencia_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionAlumnos(req.user)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para actualizar contactos de emergencia.'
      });
    }

    const { id } = req.params;

    const result = await buscarContactoConPermiso(id, req.user);

    if (!result.ok) {
      await transaction.rollback();

      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    await asegurarContactoPrincipal({
      alumnoId: result.contacto.alumno_id,
      contactoId: result.contacto.id,
      transaction
    });

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Contacto principal actualizado correctamente.'
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error UR_PrincipalContactoEmergencia_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al marcar contacto principal.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Marca contacto propio como principal desde portal alumno.
 */
export const UR_MiPrincipalContactoEmergencia_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const alumnoId = req.alumno?.id || req.alumno?.alumno_id;
    const { id } = req.params;

    const result = await buscarContactoPropio(id, alumnoId);

    if (!result.ok) {
      await transaction.rollback();

      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    await asegurarContactoPrincipal({
      alumnoId: Number(alumnoId),
      contactoId: result.contacto.id,
      transaction
    });

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Contacto principal actualizado correctamente.'
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error UR_MiPrincipalContactoEmergencia_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al marcar mi contacto principal.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Elimina contacto de emergencia desde panel interno.
 */
export const DR_AlumnosContactosEmergencia_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    if (!validarRolOperacionAlumnos(req.user)) {
      await transaction.rollback();

      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para eliminar contactos de emergencia.'
      });
    }

    const { id } = req.params;

    const result = await buscarContactoConPermiso(id, req.user);

    if (!result.ok) {
      await transaction.rollback();

      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    const alumnoId = result.contacto.alumno_id;
    const eraPrincipal = Number(result.contacto.principal) === 1;

    await result.contacto.destroy({
      transaction
    });

    if (eraPrincipal) {
      await asignarPrincipalSiNoExiste({
        alumnoId,
        transaction
      });
    }

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Contacto de emergencia eliminado correctamente.'
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error DR_AlumnosContactosEmergencia_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al eliminar el contacto de emergencia.'
    });
  }
};

/*
 * Benjamin Orellana - 2026/05/26 - Elimina contacto de emergencia propio desde portal alumno.
 */
export const DR_MiContactoEmergencia_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const alumnoId = req.alumno?.id || req.alumno?.alumno_id;
    const { id } = req.params;

    const result = await buscarContactoPropio(id, alumnoId);

    if (!result.ok) {
      await transaction.rollback();

      return res.status(result.status).json({
        ok: false,
        message: result.message
      });
    }

    const eraPrincipal = Number(result.contacto.principal) === 1;

    await result.contacto.destroy({
      transaction
    });

    if (eraPrincipal) {
      await asignarPrincipalSiNoExiste({
        alumnoId: Number(alumnoId),
        transaction
      });
    }

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Contacto de emergencia eliminado correctamente.'
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error DR_MiContactoEmergencia_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al eliminar mi contacto de emergencia.'
    });
  }
};
