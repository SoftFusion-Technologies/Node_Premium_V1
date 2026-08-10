/* Rutas del catálogo y de la gestión de productos y servicios PREMIUM. */
import express from 'express';
import {
  authenticateToken,
  requirePermission
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
const seguridadCobros = [
  authenticateToken,
  requirePermission('cobros.registrar')
];
const seguridadProductosCobro = [
  authenticateToken,
  requirePermission(['cobros.registrar', 'catalogo.productos.ver'])
];
const seguridadProductosVer = [
  authenticateToken,
  requirePermission(['catalogo.productos.ver', 'catalogo.productos.configurar'])
];
const seguridadProductosConfigurar = [
  authenticateToken,
  requirePermission('catalogo.productos.configurar')
];
const seguridadServiciosVer = [
  authenticateToken,
  requirePermission(['catalogo.servicios.ver', 'catalogo.servicios.configurar'])
];
const seguridadServiciosConfigurar = [
  authenticateToken,
  requirePermission('catalogo.servicios.configurar')
];

router.get('/catalogo-cobros/servicios/categorias', ...seguridadCobros, OBR_CategoriasServiciosCobro_CTS);
router.get('/catalogo-cobros/servicios', ...seguridadCobros, OBR_ServiciosCobro_CTS);
router.get('/catalogo-cobros/productos/categorias', ...seguridadProductosCobro, OBR_CategoriasProductosCobro_CTS);
router.get('/catalogo-cobros/productos/filtros', ...seguridadProductosCobro, OBR_FiltrosProductosCobro_CTS);
router.get('/catalogo-cobros/productos', ...seguridadProductosCobro, OBR_ProductosCobro_CTS);
router.get('/catalogo-cobros/planes', ...seguridadCobros, OBR_PlanesCobro_CTS);

router.get('/productos-gestion/catalogos', ...seguridadProductosVer, OBR_CatalogosProductosGestion_CTS);
router.post('/productos-gestion/catalogos/:entidad', ...seguridadProductosConfigurar, CR_ClasificacionProductoGestion_CTS);
router.get('/productos-gestion', ...seguridadProductosVer, OBR_ProductosGestion_CTS);
router.post('/productos-gestion', ...seguridadProductosConfigurar, CR_ProductoGestion_CTS);
router.get('/productos-gestion/:id', ...seguridadProductosVer, OBR_ProductoGestionDetalle_CTS);
router.patch('/productos-gestion/:id', ...seguridadProductosConfigurar, UR_ProductoGestion_CTS);
router.patch('/productos-gestion/:id/estado', ...seguridadProductosConfigurar, UR_EstadoProductoGestion_CTS);
router.post('/productos-gestion/:id/ajustes-stock', ...seguridadProductosConfigurar, CR_AjusteStockProductoGestion_CTS);
router.get('/productos-gestion/:id/movimientos-stock', ...seguridadProductosVer, OBR_MovimientosStockProductoGestion_CTS);

router.get('/servicios-gestion/catalogos', ...seguridadServiciosVer, OBR_CatalogosServiciosGestion_CTS);
router.post('/servicios-gestion/catalogos/categorias', ...seguridadServiciosConfigurar, CR_CategoriaServicioGestion_CTS);
router.get('/servicios-gestion', ...seguridadServiciosVer, OBR_ServiciosGestion_CTS);
router.post('/servicios-gestion', ...seguridadServiciosConfigurar, CR_ServicioGestion_CTS);
router.get('/servicios-gestion/:id', ...seguridadServiciosVer, OBR_ServicioGestionDetalle_CTS);
router.get('/servicios-gestion/:id/precios', ...seguridadServiciosVer, OBR_HistorialPreciosServicioGestion_CTS);
router.patch('/servicios-gestion/:id', ...seguridadServiciosConfigurar, UR_ServicioGestion_CTS);
router.patch('/servicios-gestion/:id/estado', ...seguridadServiciosConfigurar, UR_EstadoServicioGestion_CTS);

export default router;
