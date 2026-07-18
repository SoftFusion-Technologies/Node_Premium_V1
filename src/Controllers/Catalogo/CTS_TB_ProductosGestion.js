/*
 * PREMIUM - Gestión integral de productos e inventario.
 * Reutiliza el catálogo consumido por Nuevo Cobro y mantiene trazabilidad
 * de precios y de cada modificación de stock.
 */
import { Op, QueryTypes } from 'sequelize';
import db from '../../DataBase/db.js';
import SedesModel from '../../Models/Sede/MD_TB_Sedes.js';
import ProductosModel from '../../Models/Catalogo/MD_TB_Productos.js';
import ProductosCategoriasModel from '../../Models/Catalogo/MD_TB_ProductosCategorias.js';
import ProductosSubcategoriasModel from '../../Models/Catalogo/MD_TB_ProductosSubcategorias.js';
import ProductosTiposModel from '../../Models/Catalogo/MD_TB_ProductosTipos.js';
import ProductosPreciosModel from '../../Models/Catalogo/MD_TB_ProductosPrecios.js';
import ProductosStockSedesModel from '../../Models/Catalogo/MD_TB_ProductosStockSedes.js';
import ProductosStockMovimientosModel from '../../Models/Catalogo/MD_TB_ProductosStockMovimientos.js';

const ROLES_GLOBALES = ['SUPER_ADMIN', 'DIRECCION'];
const TIPOS_AJUSTE = ['ingreso', 'ajuste_positivo', 'ajuste_negativo', 'merma'];

const responderError = (res, status, message, details) =>
  res.status(status).json({ ok: false, message, ...(details ? { details } : {}) });

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
    .slice(0, 60);

const generarCodigoProducto = async ({ nombre, transaction }) => {
  const base = codigoDesdeNombre(nombre) || 'PRODUCTO';
  let codigo = base;
  let correlativo = 2;

  while (
    await ProductosModel.findOne({
      where: { codigo },
      attributes: ['id'],
      transaction
    })
  ) {
    const sufijo = `_${correlativo}`;
    codigo = `${base.slice(0, 80 - sufijo.length)}${sufijo}`;
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
    !ROLES_GLOBALES.includes(req.user?.rol_codigo) &&
    !sedesPermitidas(req.user).includes(sedeId)
  ) {
    return {
      ok: false,
      status: 403,
      message: 'No tenés permiso para administrar productos de esta sede.'
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
    const campo = error?.errors?.[0]?.path || 'código, SKU o código de barras';
    return `Ya existe un registro con el mismo ${campo}.`;
  }
  if (error?.name === 'SequelizeForeignKeyConstraintError') {
    return 'La categoría, subcategoría o tipo seleccionado no es válido.';
  }
  return fallback;
};

const validarClasificacion = async ({ categoriaId, subcategoriaId, tipoId, transaction }) => {
  const categoria = await ProductosCategoriasModel.findOne({
    where: { id: categoriaId, activo: 1 },
    transaction
  });
  if (!categoria) return 'Seleccioná una categoría activa.';

  if (subcategoriaId) {
    const subcategoria = await ProductosSubcategoriasModel.findOne({
      where: { id: subcategoriaId, categoria_id: categoriaId, activo: 1 },
      transaction
    });
    if (!subcategoria) return 'La subcategoría no pertenece a la categoría elegida.';
  }

  if (tipoId) {
    const tipo = await ProductosTiposModel.findOne({
      where: { id: tipoId, activo: 1 },
      transaction
    });
    if (!tipo) return 'El tipo de producto no está activo.';
  }
  return null;
};

const upsertPrecio = async ({ productoId, sedeId, payload, transaction }) => {
  if (payload.precio === undefined) return null;
  const precio = numero(payload.precio, -1);
  if (precio < 0) throw new Error('PRECIO_INVALIDO');

  const alcanceGlobal = payload.alcance_precio === 'general';
  const precioSedeId = alcanceGlobal ? null : sedeId;
  const hoy = fechaArgentina();
  const actual = await ProductosPreciosModel.findOne({
    where: {
      producto_id: productoId,
      sede_id: precioSedeId,
      activo: 1,
      fecha_desde: { [Op.lte]: hoy },
      [Op.or]: [{ fecha_hasta: null }, { fecha_hasta: { [Op.gte]: hoy } }]
    },
    order: [['fecha_desde', 'DESC'], ['id', 'DESC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  const costo = payload.costo_referencia === '' || payload.costo_referencia == null
    ? null
    : numero(payload.costo_referencia, -1);
  if (costo !== null && costo < 0) throw new Error('COSTO_INVALIDO');

  if (
    actual &&
    Number(actual.precio) === precio &&
    Number(actual.costo_referencia || 0) === Number(costo || 0)
  ) return actual;

  if (actual?.fecha_desde === hoy) {
    await actual.update({ precio, costo_referencia: costo, moneda: 'ARS' }, { transaction });
    return actual;
  }

  if (actual) {
    await actual.update(
      { activo: 0, fecha_hasta: fechaAnterior(hoy), updated_at: new Date() },
      { transaction }
    );
  }

  return ProductosPreciosModel.create(
    {
      producto_id: productoId,
      sede_id: precioSedeId,
      precio,
      costo_referencia: costo,
      moneda: 'ARS',
      fecha_desde: hoy,
      fecha_hasta: null,
      activo: 1
    },
    { transaction }
  );
};

const obtenerProductoCompleto = async (productoId, sedeId) => {
  const fecha = fechaArgentina();
  const rows = await db.query(
    `
      SELECT p.*, c.nombre AS categoria_nombre, sc.nombre AS subcategoria_nombre,
        t.nombre AS tipo_nombre, pr.id AS precio_id, pr.sede_id AS precio_sede_id,
        pr.precio, pr.costo_referencia, pr.moneda,
        ss.id AS stock_sede_id, COALESCE(ss.cantidad_actual, 0) AS cantidad_actual,
        COALESCE(ss.cantidad_reservada, 0) AS cantidad_reservada,
        COALESCE(ss.cantidad_actual, 0) - COALESCE(ss.cantidad_reservada, 0) AS cantidad_disponible,
        ss.cantidad_minima, ss.cantidad_maxima, ss.ubicacion
      FROM productos_productos p
      INNER JOIN productos_categorias c ON c.id = p.categoria_id
      LEFT JOIN productos_subcategorias sc ON sc.id = p.subcategoria_id
      LEFT JOIN productos_tipos t ON t.id = p.tipo_id
      LEFT JOIN productos_precios pr ON pr.id = (
        SELECT p2.id FROM productos_precios p2
        WHERE p2.producto_id = p.id AND p2.activo = 1
          AND p2.fecha_desde <= :fecha
          AND (p2.fecha_hasta IS NULL OR p2.fecha_hasta >= :fecha)
          AND (p2.sede_id = :sedeId OR p2.sede_id IS NULL)
        ORDER BY CASE WHEN p2.sede_id = :sedeId THEN 0 ELSE 1 END,
          p2.fecha_desde DESC, p2.id DESC LIMIT 1
      )
      LEFT JOIN productos_stock_sedes ss
        ON ss.producto_id = p.id AND ss.sede_id = :sedeId
      WHERE p.id = :productoId LIMIT 1
    `,
    { replacements: { fecha, sedeId, productoId }, type: QueryTypes.SELECT }
  );
  return rows[0] || null;
};

export const OBR_CatalogosProductosGestion_CTS = async (req, res) => {
  try {
    const scope = await validarSede(req);
    if (!scope.ok) return responderError(res, scope.status, scope.message);
    const [categorias, subcategorias, tipos] = await Promise.all([
      ProductosCategoriasModel.findAll({ order: [['orden', 'ASC'], ['nombre', 'ASC']] }),
      ProductosSubcategoriasModel.findAll({ order: [['orden', 'ASC'], ['nombre', 'ASC']] }),
      ProductosTiposModel.findAll({ order: [['orden', 'ASC'], ['nombre', 'ASC']] })
    ]);
    return res.json({ ok: true, data: { categorias, subcategorias, tipos }, sede: scope.sede });
  } catch (error) {
    console.error('Error OBR_CatalogosProductosGestion_CTS:', error);
    return responderError(res, 500, 'No pudimos cargar las clasificaciones.');
  }
};

export const OBR_ProductosGestion_CTS = async (req, res) => {
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
      tipoId: Number(req.query.tipo_id) || 0,
      limite,
      offset
    };

    if (q) condiciones.push('(p.nombre LIKE :q OR p.codigo LIKE :q OR p.sku LIKE :q OR p.codigo_barras LIKE :q OR p.marca LIKE :q)');
    if (idValido(req.query.categoria_id)) condiciones.push('p.categoria_id = :categoriaId');
    if (idValido(req.query.tipo_id)) condiciones.push('p.tipo_id = :tipoId');
    if (req.query.estado === 'activo') condiciones.push('p.activo = 1');
    if (req.query.estado === 'inactivo') condiciones.push('p.activo = 0');
    if (req.query.stock === 'sin_stock') condiciones.push('p.controla_stock = 1 AND COALESCE(ss.cantidad_actual, 0) <= 0');
    if (req.query.stock === 'bajo') condiciones.push('p.controla_stock = 1 AND COALESCE(ss.cantidad_actual, 0) > 0 AND ss.cantidad_minima IS NOT NULL AND ss.cantidad_actual <= ss.cantidad_minima');
    if (req.query.stock === 'disponible') condiciones.push('(p.controla_stock = 0 OR COALESCE(ss.cantidad_actual, 0) > COALESCE(ss.cantidad_minima, -1))');

    const base = `
      FROM productos_productos p
      INNER JOIN productos_categorias c ON c.id = p.categoria_id
      LEFT JOIN productos_subcategorias sc ON sc.id = p.subcategoria_id
      LEFT JOIN productos_tipos t ON t.id = p.tipo_id
      LEFT JOIN productos_precios pr ON pr.id = (
        SELECT p2.id FROM productos_precios p2
        WHERE p2.producto_id = p.id AND p2.activo = 1
          AND p2.fecha_desde <= :fecha
          AND (p2.fecha_hasta IS NULL OR p2.fecha_hasta >= :fecha)
          AND (p2.sede_id = :sedeId OR p2.sede_id IS NULL)
        ORDER BY CASE WHEN p2.sede_id = :sedeId THEN 0 ELSE 1 END,
          p2.fecha_desde DESC, p2.id DESC LIMIT 1
      )
      LEFT JOIN productos_stock_sedes ss
        ON ss.producto_id = p.id AND ss.sede_id = :sedeId AND ss.activo = 1
      WHERE ${condiciones.join(' AND ')}
    `;

    const [data, totalRows, resumenRows] = await Promise.all([
      db.query(
        `SELECT p.id, p.nombre, p.codigo, p.sku, p.codigo_barras, p.marca,
          p.unidad_medida, p.controla_stock, p.activo, p.imagen_url,
          c.nombre AS categoria_nombre, sc.nombre AS subcategoria_nombre,
          t.nombre AS tipo_nombre, pr.precio, pr.costo_referencia, pr.moneda,
          pr.sede_id AS precio_sede_id,
          COALESCE(ss.cantidad_actual, 0) AS cantidad_actual,
          COALESCE(ss.cantidad_reservada, 0) AS cantidad_reservada,
          COALESCE(ss.cantidad_actual, 0) - COALESCE(ss.cantidad_reservada, 0) AS cantidad_disponible,
          ss.cantidad_minima, ss.cantidad_maxima, ss.ubicacion
        ${base} ORDER BY p.activo DESC, c.orden ASC, p.orden ASC, p.nombre ASC LIMIT :limite OFFSET :offset`,
        { replacements, type: QueryTypes.SELECT }
      ),
      db.query(`SELECT COUNT(*) AS total ${base}`, { replacements, type: QueryTypes.SELECT }),
      db.query(
        `SELECT COUNT(*) AS total,
          SUM(p.activo = 1) AS activos,
          SUM(p.activo = 1 AND p.controla_stock = 1 AND COALESCE(ss.cantidad_actual, 0) <= 0) AS sin_stock,
          SUM(p.activo = 1 AND p.controla_stock = 1 AND COALESCE(ss.cantidad_actual, 0) > 0 AND ss.cantidad_minima IS NOT NULL AND ss.cantidad_actual <= ss.cantidad_minima) AS stock_bajo,
          COALESCE(SUM(CASE WHEN p.activo = 1 THEN COALESCE(ss.cantidad_actual, 0) * COALESCE(pr.costo_referencia, 0) ELSE 0 END), 0) AS valor_inventario
        FROM productos_productos p
        LEFT JOIN productos_precios pr ON pr.id = (
          SELECT p2.id FROM productos_precios p2 WHERE p2.producto_id = p.id
            AND p2.activo = 1 AND p2.fecha_desde <= :fecha
            AND (p2.fecha_hasta IS NULL OR p2.fecha_hasta >= :fecha)
            AND (p2.sede_id = :sedeId OR p2.sede_id IS NULL)
          ORDER BY CASE WHEN p2.sede_id = :sedeId THEN 0 ELSE 1 END, p2.fecha_desde DESC, p2.id DESC LIMIT 1
        )
        LEFT JOIN productos_stock_sedes ss ON ss.producto_id = p.id AND ss.sede_id = :sedeId AND ss.activo = 1`,
        { replacements, type: QueryTypes.SELECT }
      )
    ]);

    const total = Number(totalRows[0]?.total || 0);
    return res.json({
      ok: true,
      data,
      resumen: resumenRows[0],
      paginacion: { pagina, limite, total, paginas: Math.max(1, Math.ceil(total / limite)) },
      sede: scope.sede
    });
  } catch (error) {
    console.error('Error OBR_ProductosGestion_CTS:', error);
    return responderError(res, 500, 'No pudimos obtener los productos.');
  }
};

export const OBR_ProductoGestionDetalle_CTS = async (req, res) => {
  try {
    const scope = await validarSede(req);
    if (!scope.ok) return responderError(res, scope.status, scope.message);
    if (!idValido(req.params.id)) return responderError(res, 400, 'Producto inválido.');
    const data = await obtenerProductoCompleto(Number(req.params.id), scope.sedeId);
    if (!data) return responderError(res, 404, 'El producto no existe.');
    return res.json({ ok: true, data, sede: scope.sede });
  } catch (error) {
    console.error('Error OBR_ProductoGestionDetalle_CTS:', error);
    return responderError(res, 500, 'No pudimos obtener el producto.');
  }
};

export const CR_ProductoGestion_CTS = async (req, res) => {
  const transaction = await db.transaction();
  try {
    const scope = await validarSede(req, req.body);
    if (!scope.ok) {
      await transaction.rollback();
      return responderError(res, scope.status, scope.message);
    }
    const nombre = texto(req.body.nombre, 160);
    const categoriaId = Number(req.body.categoria_id);
    const subcategoriaId = idValido(req.body.subcategoria_id) ? Number(req.body.subcategoria_id) : null;
    const tipoId = idValido(req.body.tipo_id) ? Number(req.body.tipo_id) : null;
    if (!nombre || !idValido(categoriaId)) throw new Error('DATOS_OBLIGATORIOS');
    const clasificacionError = await validarClasificacion({ categoriaId, subcategoriaId, tipoId, transaction });
    if (clasificacionError) throw new Error(`CLASIFICACION:${clasificacionError}`);
    const codigo = await generarCodigoProducto({ nombre, transaction });

    const producto = await ProductosModel.create(
      {
        categoria_id: categoriaId,
        subcategoria_id: subcategoriaId,
        tipo_id: tipoId,
        nombre,
        codigo,
        sku: texto(req.body.sku, 100),
        codigo_barras: texto(req.body.codigo_barras, 120),
        descripcion: texto(req.body.descripcion),
        marca: texto(req.body.marca, 120),
        proveedor: texto(req.body.proveedor, 160),
        unidad_medida: texto(req.body.unidad_medida, 40) || 'unidad',
        controla_stock: tinyint(req.body.controla_stock, 1),
        permite_stock_negativo: 0,
        alicuota_iva: Math.max(0, numero(req.body.alicuota_iva, 21)),
        precio_incluye_iva: tinyint(req.body.precio_incluye_iva, 1),
        imagen_url: texto(req.body.imagen_url),
        activo: 1
      },
      { transaction }
    );
    await upsertPrecio({ productoId: producto.id, sedeId: scope.sedeId, payload: req.body, transaction });

    const stockInicial = Math.max(0, numero(req.body.stock_inicial, 0));
    const stock = await ProductosStockSedesModel.create(
      {
        producto_id: producto.id,
        sede_id: scope.sedeId,
        cantidad_actual: stockInicial,
        cantidad_reservada: 0,
        cantidad_minima: req.body.cantidad_minima === '' ? null : Math.max(0, numero(req.body.cantidad_minima, 0)),
        cantidad_maxima: req.body.cantidad_maxima === '' ? null : Math.max(0, numero(req.body.cantidad_maxima, 0)),
        ubicacion: texto(req.body.ubicacion, 160),
        activo: 1
      },
      { transaction }
    );
    if (stockInicial > 0) {
      await ProductosStockMovimientosModel.create(
        {
          stock_sede_id: stock.id,
          producto_id: producto.id,
          sede_id: scope.sedeId,
          usuario_id: Number(req.user?.id || req.user?.usuario_id) || null,
          tipo: 'ingreso',
          cantidad: stockInicial,
          stock_anterior: 0,
          stock_nuevo: stockInicial,
          referencia_tipo: 'alta_producto',
          referencia_id: producto.id,
          motivo: texto(req.body.motivo_stock, 500) || 'Stock inicial al crear el producto'
        },
        { transaction }
      );
    }
    await transaction.commit();
    const data = await obtenerProductoCompleto(producto.id, scope.sedeId);
    return res.status(201).json({ ok: true, message: 'Producto creado correctamente.', data });
  } catch (error) {
    await transaction.rollback();
    console.error('Error CR_ProductoGestion_CTS:', error);
    if (error.message === 'DATOS_OBLIGATORIOS') return responderError(res, 400, 'Nombre y categoría son obligatorios.');
    if (error.message === 'PRECIO_INVALIDO') return responderError(res, 400, 'El precio no puede ser negativo.');
    if (error.message === 'COSTO_INVALIDO') return responderError(res, 400, 'El costo no puede ser negativo.');
    if (error.message?.startsWith('CLASIFICACION:')) return responderError(res, 400, error.message.split(':').slice(1).join(':'));
    return responderError(res, 500, mensajeSequelize(error, 'No pudimos crear el producto.'));
  }
};

export const UR_ProductoGestion_CTS = async (req, res) => {
  const transaction = await db.transaction();
  try {
    const scope = await validarSede(req, req.body);
    if (!scope.ok) {
      await transaction.rollback();
      return responderError(res, scope.status, scope.message);
    }
    const producto = await ProductosModel.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!producto) throw new Error('NO_EXISTE');
    const categoriaId = Number(req.body.categoria_id || producto.categoria_id);
    const subcategoriaId = idValido(req.body.subcategoria_id) ? Number(req.body.subcategoria_id) : null;
    const tipoId = idValido(req.body.tipo_id) ? Number(req.body.tipo_id) : null;
    const clasificacionError = await validarClasificacion({ categoriaId, subcategoriaId, tipoId, transaction });
    if (clasificacionError) throw new Error(`CLASIFICACION:${clasificacionError}`);

    await producto.update(
      {
        categoria_id: categoriaId,
        subcategoria_id: subcategoriaId,
        tipo_id: tipoId,
        nombre: texto(req.body.nombre, 160) || producto.nombre,
        codigo: producto.codigo,
        sku: texto(req.body.sku, 100),
        codigo_barras: texto(req.body.codigo_barras, 120),
        descripcion: texto(req.body.descripcion),
        marca: texto(req.body.marca, 120),
        proveedor: texto(req.body.proveedor, 160),
        unidad_medida: texto(req.body.unidad_medida, 40) || 'unidad',
        controla_stock: tinyint(req.body.controla_stock, 1),
        permite_stock_negativo: 0,
        alicuota_iva: Math.max(0, numero(req.body.alicuota_iva, 21)),
        precio_incluye_iva: tinyint(req.body.precio_incluye_iva, 1),
        imagen_url: texto(req.body.imagen_url),
        updated_at: new Date()
      },
      { transaction }
    );
    await upsertPrecio({ productoId: producto.id, sedeId: scope.sedeId, payload: req.body, transaction });
    const [stock] = await ProductosStockSedesModel.findOrCreate({
      where: { producto_id: producto.id, sede_id: scope.sedeId },
      defaults: { cantidad_actual: 0, cantidad_reservada: 0, activo: 1 },
      transaction
    });
    await stock.update(
      {
        cantidad_minima: req.body.cantidad_minima === '' ? null : Math.max(0, numero(req.body.cantidad_minima, 0)),
        cantidad_maxima: req.body.cantidad_maxima === '' ? null : Math.max(0, numero(req.body.cantidad_maxima, 0)),
        ubicacion: texto(req.body.ubicacion, 160),
        activo: 1,
        updated_at: new Date()
      },
      { transaction }
    );
    await transaction.commit();
    const data = await obtenerProductoCompleto(producto.id, scope.sedeId);
    return res.json({ ok: true, message: 'Producto actualizado correctamente.', data });
  } catch (error) {
    await transaction.rollback();
    console.error('Error UR_ProductoGestion_CTS:', error);
    if (error.message === 'NO_EXISTE') return responderError(res, 404, 'El producto no existe.');
    if (error.message === 'PRECIO_INVALIDO') return responderError(res, 400, 'El precio no puede ser negativo.');
    if (error.message?.startsWith('CLASIFICACION:')) return responderError(res, 400, error.message.split(':').slice(1).join(':'));
    return responderError(res, 500, mensajeSequelize(error, 'No pudimos actualizar el producto.'));
  }
};

export const UR_EstadoProductoGestion_CTS = async (req, res) => {
  try {
    const scope = await validarSede(req, req.body);
    if (!scope.ok) return responderError(res, scope.status, scope.message);
    const producto = await ProductosModel.findByPk(req.params.id);
    if (!producto) return responderError(res, 404, 'El producto no existe.');
    await producto.update({ activo: tinyint(req.body.activo), updated_at: new Date() });
    return res.json({ ok: true, message: producto.activo ? 'Producto activado.' : 'Producto desactivado.', data: { id: producto.id, activo: producto.activo } });
  } catch (error) {
    console.error('Error UR_EstadoProductoGestion_CTS:', error);
    return responderError(res, 500, 'No pudimos cambiar el estado del producto.');
  }
};

export const CR_AjusteStockProductoGestion_CTS = async (req, res) => {
  const transaction = await db.transaction();
  try {
    const scope = await validarSede(req, req.body);
    if (!scope.ok) {
      await transaction.rollback();
      return responderError(res, scope.status, scope.message);
    }
    const tipo = texto(req.body.tipo, 40);
    const cantidad = numero(req.body.cantidad, 0);
    const motivo = texto(req.body.motivo, 500);
    if (!TIPOS_AJUSTE.includes(tipo)) throw new Error('TIPO_INVALIDO');
    if (cantidad <= 0) throw new Error('CANTIDAD_INVALIDA');
    if (!motivo || motivo.length < 3) throw new Error('MOTIVO_INVALIDO');
    const producto = await ProductosModel.findByPk(req.params.id, { transaction });
    if (!producto) throw new Error('NO_EXISTE');
    if (!Number(producto.controla_stock)) throw new Error('NO_CONTROLA_STOCK');
    const [stock] = await ProductosStockSedesModel.findOrCreate({
      where: { producto_id: producto.id, sede_id: scope.sedeId },
      defaults: { cantidad_actual: 0, cantidad_reservada: 0, activo: 1 },
      transaction
    });
    await stock.reload({ transaction, lock: transaction.LOCK.UPDATE });
    const anterior = Number(stock.cantidad_actual || 0);
    const suma = tipo === 'ingreso' || tipo === 'ajuste_positivo';
    const nuevo = suma ? anterior + cantidad : anterior - cantidad;
    if (nuevo < 0 && !Number(producto.permite_stock_negativo)) throw new Error('STOCK_INSUFICIENTE');
    if (nuevo < Number(stock.cantidad_reservada || 0)) throw new Error('STOCK_RESERVADO');
    await stock.update({ cantidad_actual: nuevo, activo: 1, updated_at: new Date() }, { transaction });
    const movimiento = await ProductosStockMovimientosModel.create(
      {
        stock_sede_id: stock.id,
        producto_id: producto.id,
        sede_id: scope.sedeId,
        usuario_id: Number(req.user?.id || req.user?.usuario_id) || null,
        tipo,
        cantidad,
        stock_anterior: anterior,
        stock_nuevo: nuevo,
        referencia_tipo: 'ajuste_manual',
        referencia_id: producto.id,
        motivo
      },
      { transaction }
    );
    await transaction.commit();
    return res.status(201).json({ ok: true, message: 'Stock actualizado correctamente.', data: movimiento });
  } catch (error) {
    await transaction.rollback();
    console.error('Error CR_AjusteStockProductoGestion_CTS:', error);
    const errores = {
      TIPO_INVALIDO: 'Seleccioná un tipo de ajuste válido.',
      CANTIDAD_INVALIDA: 'La cantidad debe ser mayor que cero.',
      MOTIVO_INVALIDO: 'Indicá el motivo del ajuste.',
      NO_EXISTE: 'El producto no existe.',
      NO_CONTROLA_STOCK: 'Este producto no tiene control de stock.',
      STOCK_INSUFICIENTE: 'El ajuste dejaría el stock en negativo.',
      STOCK_RESERVADO: 'No podés reducir el stock por debajo de la cantidad reservada.'
    };
    return responderError(res, errores[error.message] ? 400 : 500, errores[error.message] || 'No pudimos ajustar el stock.');
  }
};

export const OBR_MovimientosStockProductoGestion_CTS = async (req, res) => {
  try {
    const scope = await validarSede(req);
    if (!scope.ok) return responderError(res, scope.status, scope.message);
    if (!idValido(req.params.id)) return responderError(res, 400, 'Producto inválido.');
    const pagina = Math.max(1, Number(req.query.pagina) || 1);
    const limite = Math.min(100, Math.max(10, Number(req.query.limite) || 30));
    const offset = (pagina - 1) * limite;
    const replacements = { productoId: Number(req.params.id), sedeId: scope.sedeId, limite, offset };
    const [data, totals] = await Promise.all([
      db.query(
        `SELECT m.*, CONCAT_WS(' ', u.nombre, u.apellido) AS usuario_nombre
         FROM productos_stock_movimientos m
         LEFT JOIN usuarios_usuarios u ON u.id = m.usuario_id
         WHERE m.producto_id = :productoId AND m.sede_id = :sedeId
         ORDER BY m.id DESC LIMIT :limite OFFSET :offset`,
        { replacements, type: QueryTypes.SELECT }
      ),
      db.query(
        'SELECT COUNT(*) AS total FROM productos_stock_movimientos WHERE producto_id = :productoId AND sede_id = :sedeId',
        { replacements, type: QueryTypes.SELECT }
      )
    ]);
    const total = Number(totals[0]?.total || 0);
    return res.json({ ok: true, data, paginacion: { pagina, limite, total, paginas: Math.max(1, Math.ceil(total / limite)) } });
  } catch (error) {
    console.error('Error OBR_MovimientosStockProductoGestion_CTS:', error);
    return responderError(res, 500, 'No pudimos cargar el historial de stock.');
  }
};

export const CR_ClasificacionProductoGestion_CTS = async (req, res) => {
  try {
    const scope = await validarSede(req, req.body);
    if (!scope.ok) return responderError(res, scope.status, scope.message);
    const entidad = String(req.params.entidad || '').toLowerCase();
    const nombre = texto(req.body.nombre, 120);
    const codigo = (texto(req.body.codigo, 60) || codigoDesdeNombre(nombre));
    if (!nombre || !codigo) return responderError(res, 400, 'Nombre y código son obligatorios.');
    let model;
    let values = { nombre, codigo, descripcion: texto(req.body.descripcion), activo: 1 };
    if (entidad === 'categorias') model = ProductosCategoriasModel;
    else if (entidad === 'tipos') model = ProductosTiposModel;
    else if (entidad === 'subcategorias') {
      if (!idValido(req.body.categoria_id)) return responderError(res, 400, 'Seleccioná la categoría de la subcategoría.');
      model = ProductosSubcategoriasModel;
      values = { ...values, categoria_id: Number(req.body.categoria_id) };
    } else return responderError(res, 404, 'Clasificación no válida.');
    const data = await model.create(values);
    return res.status(201).json({ ok: true, message: 'Clasificación creada.', data });
  } catch (error) {
    console.error('Error CR_ClasificacionProductoGestion_CTS:', error);
    return responderError(res, 500, mensajeSequelize(error, 'No pudimos crear la clasificación.'));
  }
};
