/*
 * Sergio Manrique - 2026/07/17
 * Captura y consulta de la cotización diaria del dólar (oficial y blue) en
 * Argentina, tomada de dolarapi.com, para poder convertir la facturación
 * neta a USD con el valor "del día" que pidió el cliente.
 *
 * La API no publica un histórico propio confiable a largo plazo, así que
 * guardamos nuestra propia tabla (finanzas_cotizaciones_usd) corriendo esta
 * captura por cron un par de veces al día (ver Jobs/JB_CotizacionUsd.js).
 *
 * Capa: Backend
 */

import { Op } from 'sequelize';
import FinanzasCotizacionesUsdModel from '../../Models/Finanzas/MD_TB_FinanzasCotizacionesUsd.js';

const URLS_API = {
  oficial: 'https://dolarapi.com/v1/dolares/oficial',
  blue: 'https://dolarapi.com/v1/dolares/blue'
};

const TIPOS_VALIDOS = Object.keys(URLS_API);

const responderError = (res, status, message, data = null) => {
  return res.status(status).json({
    ok: false,
    message,
    data
  });
};

// Sergio Manrique - 2026/07/17 - Fecha local Argentina en formato YYYY-MM-DD,
// a partir de un timestamp UTC (por defecto el momento actual). Se usa tanto
// para saber "qué día es hoy en Argentina" como para convertir el
// `fechaActualizacion` que devuelve la API a la fecha de cierre que
// corresponde guardar.
const obtenerFechaArgentinaDateOnly = (fecha = new Date()) => {
  const partes = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(fecha);

  const year = partes.find((parte) => parte.type === 'year')?.value;
  const month = partes.find((parte) => parte.type === 'month')?.value;
  const day = partes.find((parte) => parte.type === 'day')?.value;

  return `${year}-${month}-${day}`;
};

const esFechaDateOnlyValida = (value) => {
  if (!value || typeof value !== 'string') return false;

  const regexFecha = /^\d{4}-\d{2}-\d{2}$/;

  if (!regexFecha.test(value)) return false;

  const fecha = new Date(`${value}T00:00:00Z`);

  return !Number.isNaN(fecha.getTime());
};

// Sergio Manrique - 2026/07/17 - Llama a dolarapi.com para un tipo de dólar
// puntual y devuelve los datos ya normalizados. La fecha que se guarda es la
// del `fechaActualizacion` que reporta la API (no "hoy"), para que un fin de
// semana o feriado no genere una fila nueva: sigue valiendo la del último
// cierre hábil, que es justo lo que se necesita para leer "el valor del día".
const consultarCotizacionApi = async (tipo) => {
  const url = URLS_API[tipo];

  const respuesta = await fetch(url);

  if (!respuesta.ok) {
    throw new Error(
      `dolarapi.com respondió ${respuesta.status} para el tipo "${tipo}".`
    );
  }

  const body = await respuesta.json();

  if (
    body?.compra === undefined ||
    body?.venta === undefined ||
    !body?.fechaActualizacion
  ) {
    throw new Error(
      `Respuesta de dolarapi.com incompleta para el tipo "${tipo}".`
    );
  }

  return {
    tipo,
    compra: Number(body.compra),
    venta: Number(body.venta),
    fecha_actualizacion_api: new Date(body.fechaActualizacion),
    fecha: obtenerFechaArgentinaDateOnly(new Date(body.fechaActualizacion))
  };
};

// Sergio Manrique - 2026/07/17 - Captura oficial + blue y hace upsert por
// (fecha, tipo). Si corre varias veces el mismo día hábil, simplemente
// actualiza compra/venta con el último valor consultado (no duplica filas).
export const capturarCotizacionesUsdDelDia = async ({
  origen = 'manual'
} = {}) => {
  const resultados = [];

  for (const tipo of TIPOS_VALIDOS) {
    try {
      const cotizacion = await consultarCotizacionApi(tipo);

      const [registro, creado] = await FinanzasCotizacionesUsdModel.findOrCreate({
        where: { fecha: cotizacion.fecha, tipo: cotizacion.tipo },
        defaults: {
          compra: cotizacion.compra,
          venta: cotizacion.venta,
          fuente: 'dolarapi.com',
          fecha_actualizacion_api: cotizacion.fecha_actualizacion_api,
          created_at: new Date()
        }
      });

      if (!creado) {
        await registro.update({
          compra: cotizacion.compra,
          venta: cotizacion.venta,
          fecha_actualizacion_api: cotizacion.fecha_actualizacion_api,
          updated_at: new Date()
        });
      }

      resultados.push({
        tipo,
        ok: true,
        accion: creado ? 'creado' : 'actualizado',
        fecha: cotizacion.fecha,
        compra: cotizacion.compra,
        venta: cotizacion.venta
      });
    } catch (error) {
      console.error(`[COTIZACION_USD] Error capturando "${tipo}":`, error.message);

      resultados.push({ tipo, ok: false, message: error.message });
    }
  }

  return {
    ok: resultados.every((item) => item.ok),
    status: 200,
    message: 'Captura de cotizaciones USD finalizada.',
    data: { origen, resultados }
  };
};

// Sergio Manrique - 2026/07/17 - Cotización vigente a una fecha: la más
// reciente con fecha <= la pedida. Así, si se pide un sábado o un feriado
// (sin cierre de mercado), se devuelve el último valor hábil (ej. el
// viernes), tal como pidió el cliente.
export const obtenerCotizacionUsdVigente = async ({ fecha, tipo }) => {
  return FinanzasCotizacionesUsdModel.findOne({
    where: {
      tipo,
      fecha: { [Op.lte]: fecha }
    },
    order: [['fecha', 'DESC']]
  });
};

export const PR_CapturarCotizacionesUsd_CTS = async (req, res) => {
  const resultado = await capturarCotizacionesUsdDelDia({ origen: 'manual' });

  return res.status(resultado.status).json(resultado);
};

export const OBR_CotizacionUsdVigente_CTS = async (req, res) => {
  const tipo = req.query?.tipo;
  const fecha = req.query?.fecha || obtenerFechaArgentinaDateOnly();

  if (!TIPOS_VALIDOS.includes(tipo)) {
    return responderError(
      res,
      400,
      `El parámetro "tipo" debe ser uno de: ${TIPOS_VALIDOS.join(', ')}.`
    );
  }

  if (!esFechaDateOnlyValida(fecha)) {
    return responderError(res, 400, 'La fecha debe tener formato YYYY-MM-DD.');
  }

  const registro = await obtenerCotizacionUsdVigente({ fecha, tipo });

  if (!registro) {
    return responderError(
      res,
      404,
      `No hay ninguna cotización "${tipo}" capturada hasta la fecha ${fecha}.`
    );
  }

  return res.status(200).json({
    ok: true,
    message: 'Cotización vigente obtenida correctamente.',
    data: registro
  });
};
