/* Rutas del catálogo y de la gestión de productos y servicios PREMIUM. */
import express from 'express';
import {
  authenticateToken,
  requirePermission,
  requireRolGlobal
} from '../Security/auth.js';
import {
  OBR_CategoriasServiciosCobro_CTS,
  OBR_ServiciosCobro_CTS,
  OBR_CategoriasProductosCobro_CTS,
  OBR_FiltrosProductosCobro_CTS,
  OBR_ProductosCobro_CTS,
  OBR_PlanesCobro_CTS
} from '../Controllers/Catalogo/CTS_TB_CatalogoCobros.js';
import {
  OBR_CatalogosProductosGestion_CTS,
  OBR_ProductosGestion_CTS,
  OBR_ProductoGestionDetalle_CTS,
  CR_ProductoGestion_CTS,
  UR_ProductoGestion_CTS,
  UR_EstadoProductoGestion_CTS,
  CR_AjusteStockProductoGestion_CTS,
  OBR_MovimientosStockProductoGestion_CTS,
  CR_ClasificacionProductoGestion_CTS
} from '../Controllers/Catalogo/CTS_TB_ProductosGestion.js';
import {
  CR_CategoriaServicioGestion_CTS,
  CR_ServicioGestion_CTS,
  OBR_CatalogosServiciosGestion_CTS,
  OBR_HistorialPreciosServicioGestion_CTS,
  OBR_ServicioGestionDetalle_CTS,
  OBR_ServiciosGestion_CTS,
  UR_EstadoServicioGestion_CTS,
  UR_ServicioGestion_CTS
} from '../Controllers/Catalogo/CTS_TB_ServiciosGestion.js';

const router = express.Router();
const ROLES_GESTION = ['SUPER_ADMIN', 'DIRECCION', 'FRONT_COMERCIAL'];
const seguridadCobros = [
  authenticateToken,
  requirePermission('cobros.registrar')
];
const seguridadGestion = [authenticateToken, requireRolGlobal(ROLES_GESTION)];

router.get('/catalogo-cobros/servicios/categorias', ...seguridadCobros, OBR_CategoriasServiciosCobro_CTS);
router.get('/catalogo-cobros/servicios', ...seguridadCobros, OBR_ServiciosCobro_CTS);
router.get('/catalogo-cobros/productos/categorias', ...seguridadCobros, OBR_CategoriasProductosCobro_CTS);
router.get('/catalogo-cobros/productos/filtros', ...seguridadCobros, OBR_FiltrosProductosCobro_CTS);
router.get('/catalogo-cobros/productos', ...seguridadCobros, OBR_ProductosCobro_CTS);
router.get('/catalogo-cobros/planes', ...seguridadCobros, OBR_PlanesCobro_CTS);

router.get('/productos-gestion/catalogos', ...seguridadGestion, OBR_CatalogosProductosGestion_CTS);
router.post('/productos-gestion/catalogos/:entidad', ...seguridadGestion, CR_ClasificacionProductoGestion_CTS);
router.get('/productos-gestion', ...seguridadGestion, OBR_ProductosGestion_CTS);
router.post('/productos-gestion', ...seguridadGestion, CR_ProductoGestion_CTS);
router.get('/productos-gestion/:id', ...seguridadGestion, OBR_ProductoGestionDetalle_CTS);
router.patch('/productos-gestion/:id', ...seguridadGestion, UR_ProductoGestion_CTS);
router.patch('/productos-gestion/:id/estado', ...seguridadGestion, UR_EstadoProductoGestion_CTS);
router.post('/productos-gestion/:id/ajustes-stock', ...seguridadGestion, CR_AjusteStockProductoGestion_CTS);
router.get('/productos-gestion/:id/movimientos-stock', ...seguridadGestion, OBR_MovimientosStockProductoGestion_CTS);

router.get('/servicios-gestion/catalogos', ...seguridadGestion, OBR_CatalogosServiciosGestion_CTS);
router.post('/servicios-gestion/catalogos/categorias', ...seguridadGestion, CR_CategoriaServicioGestion_CTS);
router.get('/servicios-gestion', ...seguridadGestion, OBR_ServiciosGestion_CTS);
router.post('/servicios-gestion', ...seguridadGestion, CR_ServicioGestion_CTS);
router.get('/servicios-gestion/:id', ...seguridadGestion, OBR_ServicioGestionDetalle_CTS);
router.get('/servicios-gestion/:id/precios', ...seguridadGestion, OBR_HistorialPreciosServicioGestion_CTS);
router.patch('/servicios-gestion/:id', ...seguridadGestion, UR_ServicioGestion_CTS);
router.patch('/servicios-gestion/:id/estado', ...seguridadGestion, UR_EstadoServicioGestion_CTS);

export default router;
