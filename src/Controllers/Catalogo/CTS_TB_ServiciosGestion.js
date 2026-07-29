/*
 * PREMIUM - Administración del catálogo de servicios.
 * Los servicios son conceptos de cobro puntuales: no crean membresías.
 */
import { Op, QueryTypes } from 'sequelize';
import db from '../../DataBase/db.js';
import SedesModel from '../../Models/Sede/MD_TB_Sedes.js';
import ServiciosModel from '../../Models/Catalogo/MD_TB_Servicios.js';
import ServiciosCategoriasModel from '../../Models/Catalogo/MD_TB_ServiciosCategorias.js';
import ServiciosPreciosModel from '../../Models/Catalogo/MD_TB_ServiciosPrecios.js';
import { usuarioTieneAccesoTodasSedes } from '../../utils/usuariosAcceso.utils.js';

const responderError = (res, status, message) =>
  res.status(status).json({ ok: false, message });

const texto = (value, max = 500) => {
  if (value === undefined || value === null) return null;
  const result = String(value).trim();
  return result ? result.slice(0, max) : null;
};

const numero = (value, fallback = 0) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
};

const idValido = (value) => Number.isInteger(Number(value)) && Number(value) > 0;

const tinyint = (value, fallback = 0) =>
  value === true || value === 1 || value === '1'
    ? 1
    : value === false || value === 0 || value === '0'
      ? 0
      : fallback;

const fechaArgentina = () => {
  const partes = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const valores = Object.fromEntries(
    partes
      .filter((parte) => parte.type !== 'literal')
      .map((parte) => [parte.type, parte.value])
  );
  return `${valores.year}-${valores.month}-${valores.day}`;
};

const fechaAnterior = (fecha) => {
  const base = new Date(`${fecha}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() - 1);
  return base.toISOString().slice(0, 10);
};

const codigoDesdeNombre = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 70);

const generarCodigoUnico = async ({ nombre, model, max = 80, transaction }) => {
  const base = (codigoDesdeNombre(nombre) || 'SERVICIO').slice(0, max);
  let codigo = base;
  let correlativo = 2;
  while (await model.findOne({ where: { codigo }, attributes: ['id'], transaction })) {
    const sufijo = `_${correlativo}`;
    codigo = `${base.slice(0, max - sufijo.length)}${sufijo}`;
    correlativo += 1;
  }
  return codigo;
};

const sedesPermitidas = (user) =>
  Array.isArray(user?.sedes)
    ? user.sedes
        .filter(
          (sede) =>
            sede?.asignacion?.activo !== false &&
            sede?.asignacion?.puede_operar !== false
        )
        .map((sede) => Number(sede.id || sede.sede_id))
        .filter(Boolean)
    : [];

const validarSede = async (req, source = req.query) => {
  const sedeId = Number(source?.sede_id);
  if (!idValido(sedeId)) {
    return { ok: false, status: 400, message: 'La sede es obligatoria.' };
  }
  if (
    !usuarioTieneAccesoTodasSedes(req.user) &&
    !sedesPermitidas(req.user).includes(sedeId)
  ) {
    return {
      ok: false,
      status: 403,
      message: 'No tenés permiso para administrar servicios de esta sede.'
    };
  }
  const sede = await SedesModel.findOne({
    where: { id: sedeId, activo: 1 },
    attributes: ['id', 'nombre', 'codigo']
  });
  if (!sede) {
    return { ok: false, status: 404, message: 'La sede indicada no está activa.' };
  }
  return { ok: true, sedeId, sede };
};

const mensajeSequelize = (error, fallback) => {
  if (error?.name === 'SequelizeUniqueConstraintError') {
    return 'Ya existe un servicio o una categoría con ese nombre o código.';
  }
  if (error?.name === 'SequelizeForeignKeyConstraintError') {
    return 'La categoría seleccionada no es válida.';
  }
  return fallback;
};

const validarCategoria = async (categoriaId, transaction) => {
  if (!idValido(categoriaId)) return null;
  return ServiciosCategoriasModel.findOne({
    where: { id: Number(categoriaId), activo: 1 },
    transaction
  });
};

const precioVigenteWhere = ({ servicioId, sedeId, hoy }) => ({
  servicio_id: servicioId,
  sede_id: sedeId,
  activo: 1,
  fecha_desde: { [Op.lte]: hoy },
  [Op.or]: [{ fecha_hasta: null }, { fecha_hasta: { [Op.gte]: hoy } }]
});

const cerrarPrecio = async (precio, hoy, transaction) => {
  if (!precio) return;
  await precio.update(
    {
      activo: 0,
      fecha_hasta: precio.fecha_desde === hoy ? hoy : fechaAnterior(hoy),
      updated_at: new Date()
    },
    { transaction }
  );
};

const guardarPrecio = async ({ servicioId, sedeId, payload, transaction }) => {
  const precioNuevo = numero(payload.precio, -1);
  if (precioNuevo < 0) throw new Error('PRECIO_INVALIDO');
  const hoy = fechaArgentina();
  const esGlobal = payload.alcance_precio === 'general';
  const precioSedeId = esGlobal ? null : sedeId;

  // Al volver a precio general, el precio específico de esta sede debe dejar
  // de prevalecer. No se tocan precios específicos de otras sedes.
  if (esGlobal) {
    const especifico = await ServiciosPreciosModel.findOne({
      where: precioVigenteWhere({ servicioId, sedeId, hoy }),
      order: [['fecha_desde', 'DESC'], ['id', 'DESC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    await cerrarPrecio(especifico, hoy, transaction);
  }

  const actual = await ServiciosPreciosModel.findOne({
    where: precioVigenteWhere({ servicioId, sedeId: precioSedeId, hoy }),
    order: [['fecha_desde', 'DESC'], ['id', 'DESC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (actual && Number(actual.precio) === precioNuevo) return actual;
  if (actual?.fecha_desde === hoy) {
    await actual.update(
      { precio: precioNuevo, moneda: 'ARS', activo: 1, updated_at: new Date() },
      { transaction }
    );
    return actual;
  }
  await cerrarPrecio(actual, hoy, transaction);
  return ServiciosPreciosModel.create(
    {
      servicio_id: servicioId,
      sede_id: precioSedeId,
      precio: precioNuevo,
      moneda: 'ARS',
      fecha_desde: hoy,
      fecha_hasta: null,
      activo: 1
    },
    { transaction }
  );
};

const obtenerServicio = async (servicioId, sedeId) => {
  const rows = await db.query(
    `SELECT s.*, c.nombre AS categoria_nombre,
      p.id AS precio_id, p.sede_id AS precio_sede_id, p.precio, p.moneda
     FROM servicios_servicios s
     INNER JOIN servicios_categorias c ON c.id = s.categoria_id
     LEFT JOIN servicios_precios p ON p.id = (
       SELECT p2.id FROM servicios_precios p2
       WHERE p2.servicio_id = s.id AND p2.activo = 1
         AND p2.fecha_desde <= :fecha
         AND (p2.fecha_hasta IS NULL OR p2.fecha_hasta >= :fecha)
         AND (p2.sede_id = :sedeId OR p2.sede_id IS NULL)
       ORDER BY CASE WHEN p2.sede_id = :sedeId THEN 0 ELSE 1 END,
         p2.fecha_desde DESC, p2.id DESC LIMIT 1
     )
     WHERE s.id = :servicioId LIMIT 1`,
    {
      replacements: { servicioId, sedeId, fecha: fechaArgentina() },
      type: QueryTypes.SELECT
    }
  );
  return rows[0] || null;
};

export const OBR_CatalogosServiciosGestion_CTS = async (req, res) => {
  try {
    const scope = await validarSede(req);
    if (!scope.ok) return responderError(res, scope.status, scope.message);
    const categorias = await ServiciosCategoriasModel.findAll({
      order: [['orden', 'ASC'], ['nombre', 'ASC']]
    });
    return res.json({ ok: true, data: { categorias }, sede: scope.sede });
  } catch (error) {
    console.error('Error OBR_CatalogosServiciosGestion_CTS:', error);
    return responderError(res, 500, 'No pudimos cargar las categorías.');
  }
};

export const OBR_ServiciosGestion_CTS = async (req, res) => {
  try {
    const scope = await validarSede(req);
    if (!scope.ok) return responderError(res, scope.status, scope.message);
    const pagina = Math.max(1, Number(req.query.pagina) || 1);
    const limite = Math.min(100, Math.max(10, Number(req.query.limite) || 25));
    const offset = (pagina - 1) * limite;
    const q = texto(req.query.q, 160);
    const condiciones = ['1 = 1'];
    const replacements = {
      sedeId: scope.sedeId,
      fecha: fechaArgentina(),
      q: `%${q || ''}%`,
      categoriaId: Number(req.query.categoria_id) || 0,
      limite,
      offset
    };
    if (q) condiciones.push('(s.nombre LIKE :q OR s.codigo LIKE :q OR s.descripcion LIKE :q)');
    if (idValido(req.query.categoria_id)) condiciones.push('s.categoria_id = :categoriaId');
    if (req.query.estado === 'activo') condiciones.push('s.activo = 1');
    if (req.query.estado === 'inactivo') condiciones.push('s.activo = 0');
    if (req.query.agenda === 'si') condiciones.push('s.requiere_agenda = 1');
    if (req.query.agenda === 'no') condiciones.push('s.requiere_agenda = 0');

    const base = `
      FROM servicios_servicios s
      INNER JOIN servicios_categorias c ON c.id = s.categoria_id
      LEFT JOIN servicios_precios p ON p.id = (
        SELECT p2.id FROM servicios_precios p2
        WHERE p2.servicio_id = s.id AND p2.activo = 1
          AND p2.fecha_desde <= :fecha
          AND (p2.fecha_hasta IS NULL OR p2.fecha_hasta >= :fecha)
          AND (p2.sede_id = :sedeId OR p2.sede_id IS NULL)
        ORDER BY CASE WHEN p2.sede_id = :sedeId THEN 0 ELSE 1 END,
          p2.fecha_desde DESC, p2.id DESC LIMIT 1
      )
      WHERE ${condiciones.join(' AND ')}
    `;

    const [data, totalRows, resumenRows] = await Promise.all([
      db.query(
        `SELECT s.id, s.categoria_id, s.nombre, s.codigo, s.descripcion,
          s.duracion_minutos, s.requiere_agenda, s.alicuota_iva,
          s.precio_incluye_iva, s.imagen_url, s.activo,
          c.nombre AS categoria_nombre, p.precio, p.moneda,
          p.sede_id AS precio_sede_id
         ${base}
         ORDER BY s.activo DESC, c.orden ASC, s.orden ASC, s.nombre ASC
         LIMIT :limite OFFSET :offset`,
        { replacements, type: QueryTypes.SELECT }
      ),
      db.query(`SELECT COUNT(*) AS total ${base}`, {
        replacements,
        type: QueryTypes.SELECT
      }),
      db.query(
        `SELECT COUNT(*) AS total,
          SUM(activo = 1) AS activos,
          SUM(activo = 0) AS inactivos,
          SUM(activo = 1 AND requiere_agenda = 1) AS con_agenda,
          COUNT(DISTINCT CASE WHEN activo = 1 THEN categoria_id END) AS categorias
         FROM servicios_servicios`,
        { type: QueryTypes.SELECT }
      )
    ]);
    const total = Number(totalRows[0]?.total || 0);
    return res.json({
      ok: true,
      data,
      resumen: resumenRows[0] || {},
      paginacion: {
        pagina,
        limite,
        total,
        paginas: Math.max(1, Math.ceil(total / limite))
      },
      sede: scope.sede
    });
  } catch (error) {
    console.error('Error OBR_ServiciosGestion_CTS:', error);
    return responderError(res, 500, 'No pudimos obtener los servicios.');
  }
};

export const OBR_ServicioGestionDetalle_CTS = async (req, res) => {
  try {
    const scope = await validarSede(req);
    if (!scope.ok) return responderError(res, scope.status, scope.message);
    if (!idValido(req.params.id)) return responderError(res, 400, 'Servicio inválido.');
    const data = await obtenerServicio(Number(req.params.id), scope.sedeId);
    if (!data) return responderError(res, 404, 'El servicio no existe.');
    return res.json({ ok: true, data, sede: scope.sede });
  } catch (error) {
    console.error('Error OBR_ServicioGestionDetalle_CTS:', error);
    return responderError(res, 500, 'No pudimos obtener el servicio.');
  }
};

export const OBR_HistorialPreciosServicioGestion_CTS = async (req, res) => {
  try {
    const scope = await validarSede(req);
    if (!scope.ok) return responderError(res, scope.status, scope.message);
    if (!idValido(req.params.id)) return responderError(res, 400, 'Servicio inválido.');
    const data = await db.query(
      `SELECT p.*, se.nombre AS sede_nombre
       FROM servicios_precios p
       LEFT JOIN sedes_sedes se ON se.id = p.sede_id
       WHERE p.servicio_id = :servicioId
         AND (p.sede_id = :sedeId OR p.sede_id IS NULL)
       ORDER BY p.fecha_desde DESC, p.id DESC`,
      {
        replacements: { servicioId: Number(req.params.id), sedeId: scope.sedeId },
        type: QueryTypes.SELECT
      }
    );
    return res.json({ ok: true, data });
  } catch (error) {
    console.error('Error OBR_HistorialPreciosServicioGestion_CTS:', error);
    return responderError(res, 500, 'No pudimos cargar el historial de precios.');
  }
};

export const CR_ServicioGestion_CTS = async (req, res) => {
  const transaction = await db.transaction();
  try {
    const scope = await validarSede(req, req.body);
    if (!scope.ok) {
      await transaction.rollback();
      return responderError(res, scope.status, scope.message);
    }
    const nombre = texto(req.body.nombre, 160);
    const categoriaId = Number(req.body.categoria_id);
    if (!nombre || !idValido(categoriaId) || req.body.precio === '') {
      throw new Error('DATOS_OBLIGATORIOS');
    }
    if (!(await validarCategoria(categoriaId, transaction))) {
      throw new Error('CATEGORIA_INVALIDA');
    }
    const duracion = req.body.duracion_minutos === ''
      ? null
      : Math.max(1, Math.round(numero(req.body.duracion_minutos, 0)));
    const codigo = await generarCodigoUnico({
      nombre,
      model: ServiciosModel,
      transaction
    });
    const servicio = await ServiciosModel.create(
      {
        categoria_id: categoriaId,
        nombre,
        codigo,
        descripcion: texto(req.body.descripcion),
        duracion_minutos: duracion,
        requiere_agenda: tinyint(req.body.requiere_agenda, 0),
        alicuota_iva: Math.min(100, Math.max(0, numero(req.body.alicuota_iva, 0))),
        precio_incluye_iva: tinyint(req.body.precio_incluye_iva, 1),
        imagen_url: texto(req.body.imagen_url),
        activo: 1
      },
      { transaction }
    );
    await guardarPrecio({
      servicioId: servicio.id,
      sedeId: scope.sedeId,
      payload: req.body,
      transaction
    });
    await transaction.commit();
    const data = await obtenerServicio(servicio.id, scope.sedeId);
    return res.status(201).json({
      ok: true,
      message: 'Servicio creado correctamente.',
      data
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error CR_ServicioGestion_CTS:', error);
    const errores = {
      DATOS_OBLIGATORIOS: 'Nombre, categoría y precio son obligatorios.',
      CATEGORIA_INVALIDA: 'Seleccioná una categoría activa.',
      PRECIO_INVALIDO: 'El precio no puede ser negativo.'
    };
    return responderError(
      res,
      errores[error.message] ? 400 : 500,
      errores[error.message] || mensajeSequelize(error, 'No pudimos crear el servicio.')
    );
  }
};

export const UR_ServicioGestion_CTS = async (req, res) => {
  const transaction = await db.transaction();
  try {
    const scope = await validarSede(req, req.body);
    if (!scope.ok) {
      await transaction.rollback();
      return responderError(res, scope.status, scope.message);
    }
    const servicio = await ServiciosModel.findByPk(req.params.id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!servicio) throw new Error('NO_EXISTE');
    const categoriaId = Number(req.body.categoria_id || servicio.categoria_id);
    if (!(await validarCategoria(categoriaId, transaction))) {
      throw new Error('CATEGORIA_INVALIDA');
    }
    const duracion = req.body.duracion_minutos === ''
      ? null
      : Math.max(1, Math.round(numero(req.body.duracion_minutos, 0)));
    await servicio.update(
      {
        categoria_id: categoriaId,
        nombre: texto(req.body.nombre, 160) || servicio.nombre,
        codigo: servicio.codigo,
        descripcion: texto(req.body.descripcion),
        duracion_minutos: duracion,
        requiere_agenda: tinyint(req.body.requiere_agenda, 0),
        alicuota_iva: Math.min(100, Math.max(0, numero(req.body.alicuota_iva, 0))),
        precio_incluye_iva: tinyint(req.body.precio_incluye_iva, 1),
        imagen_url: texto(req.body.imagen_url),
        updated_at: new Date()
      },
      { transaction }
    );
    await guardarPrecio({
      servicioId: servicio.id,
      sedeId: scope.sedeId,
      payload: req.body,
      transaction
    });
    await transaction.commit();
    const data = await obtenerServicio(servicio.id, scope.sedeId);
    return res.json({ ok: true, message: 'Servicio actualizado correctamente.', data });
  } catch (error) {
    await transaction.rollback();
    console.error('Error UR_ServicioGestion_CTS:', error);
    const errores = {
      NO_EXISTE: 'El servicio no existe.',
      CATEGORIA_INVALIDA: 'Seleccioná una categoría activa.',
      PRECIO_INVALIDO: 'El precio no puede ser negativo.'
    };
    return responderError(
      res,
      error.message === 'NO_EXISTE' ? 404 : errores[error.message] ? 400 : 500,
      errores[error.message] || mensajeSequelize(error, 'No pudimos actualizar el servicio.')
    );
  }
};

export const UR_EstadoServicioGestion_CTS = async (req, res) => {
  try {
    const scope = await validarSede(req, req.body);
    if (!scope.ok) return responderError(res, scope.status, scope.message);
    const servicio = await ServiciosModel.findByPk(req.params.id);
    if (!servicio) return responderError(res, 404, 'El servicio no existe.');
    await servicio.update({
      activo: tinyint(req.body.activo),
      updated_at: new Date()
    });
    return res.json({
      ok: true,
      message: Number(servicio.activo) ? 'Servicio activado.' : 'Servicio desactivado.',
      data: { id: servicio.id, activo: servicio.activo }
    });
  } catch (error) {
    console.error('Error UR_EstadoServicioGestion_CTS:', error);
    return responderError(res, 500, 'No pudimos cambiar el estado del servicio.');
  }
};

export const CR_CategoriaServicioGestion_CTS = async (req, res) => {
  try {
    const scope = await validarSede(req, req.body);
    if (!scope.ok) return responderError(res, scope.status, scope.message);
    const nombre = texto(req.body.nombre, 120);
    if (!nombre) return responderError(res, 400, 'El nombre es obligatorio.');
    const codigo = await generarCodigoUnico({
      nombre,
      model: ServiciosCategoriasModel,
      max: 60
    });
    const data = await ServiciosCategoriasModel.create({
      nombre,
      codigo,
      descripcion: texto(req.body.descripcion),
      activo: 1
    });
    return res.status(201).json({ ok: true, message: 'Categoría creada.', data });
  } catch (error) {
    console.error('Error CR_CategoriaServicioGestion_CTS:', error);
    return responderError(
      res,
      500,
      mensajeSequelize(error, 'No pudimos crear la categoría.')
    );
  }
};
