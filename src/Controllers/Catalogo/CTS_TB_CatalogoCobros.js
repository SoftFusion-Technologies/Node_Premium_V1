/*
 * Benjamin Orellana - 2026/07/14 - Consultas livianas del catálogo para el
 * drawer Nuevo Cobro. No registra cobros ni modifica stock.
 */
import { QueryTypes } from 'sequelize';
import db from '../../DataBase/db.js';
import SedesModel from '../../Models/Sede/MD_TB_Sedes.js';
import { usuarioTieneAccesoTodasSedes } from '../../utils/usuariosAcceso.utils.js';

const responderError = (res, status, message) =>
  res.status(status).json({ ok: false, message });

const esIdValido = (value) => {
  const numero = Number(value);
  return Number.isInteger(numero) && numero > 0;
};

const esTinyintValido = (value) =>
  value === 0 || value === 1 || value === '0' || value === '1';

const obtenerFechaArgentina = () => {
  const partes = new Intl.DateTimeFormat('en-CA', {
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

const obtenerSedesPermitidasUsuario = (user) => {
  if (!user || !Array.isArray(user.sedes)) return [];

  return user.sedes
    .filter(
      (sede) =>
        sede?.asignacion?.activo !== false &&
        sede?.asignacion?.puede_operar !== false
    )
    .map((sede) => Number(sede.id || sede.sede_id))
    .filter(Boolean);
};

const validarSedeCatalogo = async (req) => {
  const { sede_id } = req.query;

  if (!esIdValido(sede_id)) {
    return {
      ok: false,
      status: 400,
      message: 'El parámetro sede_id es obligatorio y debe ser un ID válido.'
    };
  }

  const sedeId = Number(sede_id);
  const usuarioGlobal = usuarioTieneAccesoTodasSedes(req.user);

  if (!usuarioGlobal) {
    const permitidas = obtenerSedesPermitidasUsuario(req.user);

    if (!permitidas.includes(sedeId)) {
      return {
        ok: false,
        status: 403,
        message: 'No tiene acceso al catálogo de la sede indicada.'
      };
    }
  }

  const sede = await SedesModel.findOne({
    where: { id: sedeId, activo: 1 },
    attributes: ['id', 'nombre', 'codigo']
  });

  if (!sede) {
    return {
      ok: false,
      status: 404,
      message: 'La sede indicada no existe o está inactiva.'
    };
  }

  return { ok: true, sedeId, sede };
};

export const OBR_CategoriasServiciosCobro_CTS = async (req, res) => {
  try {
    const scope = await validarSedeCatalogo(req);
    if (!scope.ok) return responderError(res, scope.status, scope.message);

    const fecha = obtenerFechaArgentina();
    const data = await db.query(
      `
        SELECT
          sc.id,
          sc.nombre,
          sc.codigo,
          sc.descripcion,
          sc.orden,
          COUNT(ss.id) AS cantidad_servicios
        FROM servicios_categorias sc
        INNER JOIN servicios_servicios ss
          ON ss.categoria_id = sc.id
          AND ss.activo = 1
        WHERE sc.activo = 1
          AND EXISTS (
            SELECT 1
            FROM servicios_precios sp
            WHERE sp.servicio_id = ss.id
              AND sp.activo = 1
              AND sp.fecha_desde <= :fecha
              AND (sp.fecha_hasta IS NULL OR sp.fecha_hasta >= :fecha)
              AND (sp.sede_id = :sedeId OR sp.sede_id IS NULL)
          )
        GROUP BY sc.id, sc.nombre, sc.codigo, sc.descripcion, sc.orden
        ORDER BY sc.orden ASC, sc.nombre ASC
      `,
      {
        replacements: { sedeId: scope.sedeId, fecha },
        type: QueryTypes.SELECT
      }
    );

    return res.status(200).json({
      ok: true,
      message: 'Categorías de servicios obtenidas correctamente.',
      sede: scope.sede,
      data
    });
  } catch (error) {
    console.error('Error OBR_CategoriasServiciosCobro_CTS:', error);
    return responderError(
      res,
      500,
      'Error al obtener las categorías de servicios.'
    );
  }
};

export const OBR_ServiciosCobro_CTS = async (req, res) => {
  try {
    const scope = await validarSedeCatalogo(req);
    if (!scope.ok) return responderError(res, scope.status, scope.message);

    const { categoria_id, q } = req.query;
    if (categoria_id !== undefined && !esIdValido(categoria_id)) {
      return responderError(
        res,
        400,
        'El filtro categoria_id debe ser un ID válido.'
      );
    }

    const fecha = obtenerFechaArgentina();
    const replacements = {
      sedeId: scope.sedeId,
      fecha,
      categoriaId: categoria_id ? Number(categoria_id) : null,
      q: `%${String(q || '').trim()}%`
    };
    const condiciones = ['ss.activo = 1', 'sc.activo = 1'];

    if (categoria_id) condiciones.push('ss.categoria_id = :categoriaId');
    if (String(q || '').trim()) {
      condiciones.push(
        '(ss.nombre LIKE :q OR ss.codigo LIKE :q OR ss.descripcion LIKE :q)'
      );
    }

    const data = await db.query(
      `
        SELECT
          ss.id,
          ss.categoria_id,
          ss.nombre,
          ss.codigo,
          ss.descripcion,
          ss.duracion_minutos,
          ss.requiere_agenda,
          ss.alicuota_iva,
          ss.precio_incluye_iva,
          ss.imagen_url,
          ss.activo,
          sc.nombre AS categoria_nombre,
          sp.id AS precio_id,
          sp.precio,
          sp.moneda
        FROM servicios_servicios ss
        INNER JOIN servicios_categorias sc
          ON sc.id = ss.categoria_id
        INNER JOIN servicios_precios sp
          ON sp.id = (
            SELECT sp2.id
            FROM servicios_precios sp2
            WHERE sp2.servicio_id = ss.id
              AND sp2.activo = 1
              AND sp2.fecha_desde <= :fecha
              AND (sp2.fecha_hasta IS NULL OR sp2.fecha_hasta >= :fecha)
              AND (sp2.sede_id = :sedeId OR sp2.sede_id IS NULL)
            ORDER BY
              CASE WHEN sp2.sede_id = :sedeId THEN 0 ELSE 1 END ASC,
              sp2.fecha_desde DESC,
              sp2.id DESC
            LIMIT 1
          )
        WHERE ${condiciones.join(' AND ')}
        ORDER BY sc.orden ASC, ss.orden ASC, ss.nombre ASC
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.status(200).json({
      ok: true,
      message: 'Servicios disponibles para cobro obtenidos correctamente.',
      sede: scope.sede,
      total: data.length,
      data
    });
  } catch (error) {
    console.error('Error OBR_ServiciosCobro_CTS:', error);
    return responderError(
      res,
      500,
      'Error al obtener los servicios disponibles.'
    );
  }
};

export const OBR_CategoriasProductosCobro_CTS = async (req, res) => {
  try {
    const scope = await validarSedeCatalogo(req);
    if (!scope.ok) return responderError(res, scope.status, scope.message);

    const fecha = obtenerFechaArgentina();
    const data = await db.query(
      `
        SELECT
          pc.id,
          pc.nombre,
          pc.codigo,
          pc.descripcion,
          pc.orden,
          COUNT(pp.id) AS cantidad_productos
        FROM productos_categorias pc
        INNER JOIN productos_productos pp
          ON pp.categoria_id = pc.id
          AND pp.activo = 1
        WHERE pc.activo = 1
          AND EXISTS (
            SELECT 1
            FROM productos_precios pr
            WHERE pr.producto_id = pp.id
              AND pr.activo = 1
              AND pr.fecha_desde <= :fecha
              AND (pr.fecha_hasta IS NULL OR pr.fecha_hasta >= :fecha)
              AND (pr.sede_id = :sedeId OR pr.sede_id IS NULL)
          )
        GROUP BY pc.id, pc.nombre, pc.codigo, pc.descripcion, pc.orden
        ORDER BY pc.orden ASC, pc.nombre ASC
      `,
      {
        replacements: { sedeId: scope.sedeId, fecha },
        type: QueryTypes.SELECT
      }
    );

    return res.status(200).json({
      ok: true,
      message: 'Categorías de productos obtenidas correctamente.',
      sede: scope.sede,
      data
    });
  } catch (error) {
    console.error('Error OBR_CategoriasProductosCobro_CTS:', error);
    return responderError(
      res,
      500,
      'Error al obtener las categorías de productos.'
    );
  }
};

export const OBR_FiltrosProductosCobro_CTS = async (req, res) => {
  try {
    const scope = await validarSedeCatalogo(req);
    if (!scope.ok) return responderError(res, scope.status, scope.message);

    const [categorias, subcategorias, tipos] = await Promise.all([
      db.query(
        'SELECT id, nombre, codigo FROM productos_categorias WHERE activo = 1 ORDER BY orden ASC, nombre ASC',
        { type: QueryTypes.SELECT }
      ),
      db.query(
        'SELECT id, categoria_id, nombre, codigo FROM productos_subcategorias WHERE activo = 1 ORDER BY orden ASC, nombre ASC',
        { type: QueryTypes.SELECT }
      ),
      db.query(
        'SELECT id, nombre, codigo FROM productos_tipos WHERE activo = 1 ORDER BY orden ASC, nombre ASC',
        { type: QueryTypes.SELECT }
      )
    ]);

    return res.status(200).json({
      ok: true,
      message: 'Filtros de productos obtenidos correctamente.',
      data: { categorias, subcategorias, tipos }
    });
  } catch (error) {
    console.error('Error OBR_FiltrosProductosCobro_CTS:', error);
    return responderError(
      res,
      500,
      'Error al obtener los filtros de productos.'
    );
  }
};

export const OBR_ProductosCobro_CTS = async (req, res) => {
  try {
    const scope = await validarSedeCatalogo(req);
    if (!scope.ok) return responderError(res, scope.status, scope.message);

    const {
      categoria_id,
      subcategoria_id,
      tipo_id,
      incluir_desactivados = 0,
      q
    } = req.query;

    for (const [campo, valor] of Object.entries({
      categoria_id,
      subcategoria_id,
      tipo_id
    })) {
      if (valor !== undefined && valor !== '' && !esIdValido(valor)) {
        return responderError(
          res,
          400,
          `El filtro ${campo} debe ser un ID válido.`
        );
      }
    }

    if (!esTinyintValido(incluir_desactivados)) {
      return responderError(
        res,
        400,
        'El filtro incluir_desactivados debe ser 0 o 1.'
      );
    }

    const fecha = obtenerFechaArgentina();
    const replacements = {
      sedeId: scope.sedeId,
      fecha,
      categoriaId: categoria_id ? Number(categoria_id) : null,
      subcategoriaId: subcategoria_id ? Number(subcategoria_id) : null,
      tipoId: tipo_id ? Number(tipo_id) : null,
      q: `%${String(q || '').trim()}%`
    };
    const condiciones = ['pc.activo = 1'];

    if (Number(incluir_desactivados) !== 1) condiciones.push('pp.activo = 1');
    if (categoria_id) condiciones.push('pp.categoria_id = :categoriaId');
    if (subcategoria_id)
      condiciones.push('pp.subcategoria_id = :subcategoriaId');
    if (tipo_id) condiciones.push('pp.tipo_id = :tipoId');
    if (String(q || '').trim()) {
      condiciones.push(`(
        pp.nombre LIKE :q OR pp.codigo LIKE :q OR pp.sku LIKE :q OR
        pp.codigo_barras LIKE :q OR pp.marca LIKE :q
      )`);
    }

    const data = await db.query(
      `
        SELECT
          pp.id,
          pp.categoria_id,
          pp.subcategoria_id,
          pp.tipo_id,
          pp.nombre,
          pp.codigo,
          pp.sku,
          pp.codigo_barras,
          pp.descripcion,
          pp.marca,
          pp.unidad_medida,
          pp.controla_stock,
          pp.permite_stock_negativo,
          pp.alicuota_iva,
          pp.precio_incluye_iva,
          pp.imagen_url,
          pp.activo,
          pc.nombre AS categoria_nombre,
          psc.nombre AS subcategoria_nombre,
          pt.nombre AS tipo_nombre,
          pr.id AS precio_id,
          pr.precio,
          pr.moneda,
          ps.id AS stock_sede_id,
          COALESCE(ps.cantidad_actual, 0) AS cantidad_actual,
          COALESCE(ps.cantidad_reservada, 0) AS cantidad_reservada,
          GREATEST(
            COALESCE(ps.cantidad_actual, 0) - COALESCE(ps.cantidad_reservada, 0),
            0
          ) AS cantidad_disponible
        FROM productos_productos pp
        INNER JOIN productos_categorias pc
          ON pc.id = pp.categoria_id
        LEFT JOIN productos_subcategorias psc
          ON psc.id = pp.subcategoria_id
        LEFT JOIN productos_tipos pt
          ON pt.id = pp.tipo_id
        INNER JOIN productos_precios pr
          ON pr.id = (
            SELECT pr2.id
            FROM productos_precios pr2
            WHERE pr2.producto_id = pp.id
              AND pr2.activo = 1
              AND pr2.fecha_desde <= :fecha
              AND (pr2.fecha_hasta IS NULL OR pr2.fecha_hasta >= :fecha)
              AND (pr2.sede_id = :sedeId OR pr2.sede_id IS NULL)
            ORDER BY
              CASE WHEN pr2.sede_id = :sedeId THEN 0 ELSE 1 END ASC,
              pr2.fecha_desde DESC,
              pr2.id DESC
            LIMIT 1
          )
        LEFT JOIN productos_stock_sedes ps
          ON ps.producto_id = pp.id
          AND ps.sede_id = :sedeId
          AND ps.activo = 1
        WHERE ${condiciones.join(' AND ')}
        ORDER BY pc.orden ASC, pp.orden ASC, pp.nombre ASC
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.status(200).json({
      ok: true,
      message: 'Productos disponibles para cobro obtenidos correctamente.',
      sede: scope.sede,
      total: data.length,
      data
    });
  } catch (error) {
    console.error('Error OBR_ProductosCobro_CTS:', error);
    return responderError(
      res,
      500,
      'Error al obtener los productos disponibles.'
    );
  }
};

// Benjamin Orellana - 2026/07/14 - Lista planes activos con el precio vigente
// de la sede. Si no existe uno específico, utiliza el precio global del plan.
export const OBR_PlanesCobro_CTS = async (req, res) => {
  try {
    const scope = await validarSedeCatalogo(req);
    if (!scope.ok) return responderError(res, scope.status, scope.message);

    const { q } = req.query;
    const fecha = obtenerFechaArgentina();
    const replacements = {
      sedeId: scope.sedeId,
      fecha,
      q: `%${String(q || '').trim()}%`
    };
    const condiciones = ['p.activo = 1'];

    if (String(q || '').trim()) {
      condiciones.push(
        '(p.nombre LIKE :q OR p.codigo LIKE :q OR p.descripcion LIKE :q)'
      );
    }

    const data = await db.query(
      `
        SELECT
          p.id,
          p.nombre,
          p.codigo,
          p.descripcion,
          p.clases_por_mes,
          p.cantidad_clases_periodo,
          p.periodo,
          p.duracion_dias,
          p.permite_reserva,
          p.permite_acumulacion,
          p.activo,
          pp.id AS precio_id,
          pp.sede_id AS precio_sede_id,
          pp.precio,
          pp.moneda,
          pp.fecha_desde,
          pp.fecha_hasta
        FROM planes_planes p
        INNER JOIN planes_precios pp
          ON pp.id = (
            SELECT pp2.id
            FROM planes_precios pp2
            WHERE pp2.plan_id = p.id
              AND pp2.activo = 1
              AND pp2.fecha_desde <= :fecha
              AND (pp2.fecha_hasta IS NULL OR pp2.fecha_hasta >= :fecha)
              AND (pp2.sede_id = :sedeId OR pp2.sede_id IS NULL)
            ORDER BY
              CASE WHEN pp2.sede_id = :sedeId THEN 0 ELSE 1 END ASC,
              pp2.fecha_desde DESC,
              pp2.id DESC
            LIMIT 1
          )
        WHERE ${condiciones.join(' AND ')}
        ORDER BY p.nombre ASC
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.status(200).json({
      ok: true,
      message: 'Planes disponibles para cobro obtenidos correctamente.',
      sede: scope.sede,
      total: data.length,
      data
    });
  } catch (error) {
    console.error('Error OBR_PlanesCobro_CTS:', error);
    return responderError(res, 500, 'Error al obtener los planes disponibles.');
  }
};
