/* Benjamin Orellana - 2026/07/14 - Relaciones Sequelize del catálogo PREMIUM. */
import ServiciosCategoriasModel from './MD_TB_ServiciosCategorias.js';
import ServiciosModel from './MD_TB_Servicios.js';
import ServiciosPreciosModel from './MD_TB_ServiciosPrecios.js';
import ProductosCategoriasModel from './MD_TB_ProductosCategorias.js';
import ProductosSubcategoriasModel from './MD_TB_ProductosSubcategorias.js';
import ProductosTiposModel from './MD_TB_ProductosTipos.js';
import ProductosModel from './MD_TB_Productos.js';
import ProductosPreciosModel from './MD_TB_ProductosPrecios.js';
import ProductosStockSedesModel from './MD_TB_ProductosStockSedes.js';
import ProductosStockMovimientosModel from './MD_TB_ProductosStockMovimientos.js';
import SedesModel from '../Sede/MD_TB_Sedes.js';
import UsuariosModel from '../Usuario/MD_TB_Usuarios.js';

let relacionesInicializadas = false;

export const initCatalogoRelaciones = () => {
  if (relacionesInicializadas) return;
  relacionesInicializadas = true;

  ServiciosCategoriasModel.hasMany(ServiciosModel, { foreignKey: 'categoria_id', as: 'servicios' });
  ServiciosModel.belongsTo(ServiciosCategoriasModel, { foreignKey: 'categoria_id', as: 'categoria' });
  ServiciosModel.hasMany(ServiciosPreciosModel, { foreignKey: 'servicio_id', as: 'precios' });
  ServiciosPreciosModel.belongsTo(ServiciosModel, { foreignKey: 'servicio_id', as: 'servicio' });
  SedesModel.hasMany(ServiciosPreciosModel, { foreignKey: 'sede_id', as: 'servicios_precios' });
  ServiciosPreciosModel.belongsTo(SedesModel, { foreignKey: 'sede_id', as: 'sede' });

  ProductosCategoriasModel.hasMany(ProductosSubcategoriasModel, { foreignKey: 'categoria_id', as: 'subcategorias' });
  ProductosSubcategoriasModel.belongsTo(ProductosCategoriasModel, { foreignKey: 'categoria_id', as: 'categoria' });
  ProductosCategoriasModel.hasMany(ProductosModel, { foreignKey: 'categoria_id', as: 'productos' });
  ProductosModel.belongsTo(ProductosCategoriasModel, { foreignKey: 'categoria_id', as: 'categoria' });
  ProductosSubcategoriasModel.hasMany(ProductosModel, { foreignKey: 'subcategoria_id', as: 'productos' });
  ProductosModel.belongsTo(ProductosSubcategoriasModel, { foreignKey: 'subcategoria_id', as: 'subcategoria' });
  ProductosTiposModel.hasMany(ProductosModel, { foreignKey: 'tipo_id', as: 'productos' });
  ProductosModel.belongsTo(ProductosTiposModel, { foreignKey: 'tipo_id', as: 'tipo' });
  ProductosModel.hasMany(ProductosPreciosModel, { foreignKey: 'producto_id', as: 'precios' });
  ProductosPreciosModel.belongsTo(ProductosModel, { foreignKey: 'producto_id', as: 'producto' });
  SedesModel.hasMany(ProductosPreciosModel, { foreignKey: 'sede_id', as: 'productos_precios' });
  ProductosPreciosModel.belongsTo(SedesModel, { foreignKey: 'sede_id', as: 'sede' });
  ProductosModel.hasMany(ProductosStockSedesModel, { foreignKey: 'producto_id', as: 'stocks' });
  ProductosStockSedesModel.belongsTo(ProductosModel, { foreignKey: 'producto_id', as: 'producto' });
  SedesModel.hasMany(ProductosStockSedesModel, { foreignKey: 'sede_id', as: 'productos_stocks' });
  ProductosStockSedesModel.belongsTo(SedesModel, { foreignKey: 'sede_id', as: 'sede' });
  ProductosStockSedesModel.hasMany(ProductosStockMovimientosModel, { foreignKey: 'stock_sede_id', as: 'movimientos' });
  ProductosStockMovimientosModel.belongsTo(ProductosStockSedesModel, { foreignKey: 'stock_sede_id', as: 'stock_sede' });
  ProductosModel.hasMany(ProductosStockMovimientosModel, { foreignKey: 'producto_id', as: 'movimientos_stock' });
  ProductosStockMovimientosModel.belongsTo(ProductosModel, { foreignKey: 'producto_id', as: 'producto' });
  SedesModel.hasMany(ProductosStockMovimientosModel, { foreignKey: 'sede_id', as: 'productos_stock_movimientos' });
  ProductosStockMovimientosModel.belongsTo(SedesModel, { foreignKey: 'sede_id', as: 'sede' });
  UsuariosModel.hasMany(ProductosStockMovimientosModel, { foreignKey: 'usuario_id', as: 'productos_stock_movimientos' });
  ProductosStockMovimientosModel.belongsTo(UsuariosModel, { foreignKey: 'usuario_id', as: 'usuario' });
};
