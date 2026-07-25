/*
 * Sergio Manrique - 2026/07/12
 * Controlador de reportes del Dashboard principal (Dashboard_2): cortes de
 * actividad por sede y cierre mensual por sede. Sigue el mismo patrón de SQL
 * crudo que Controllers/Gastos/CTS_TB_GastosReportes.js.
 *
 * Tema: Controladores - Dashboard
 * Capa: Backend
 */

import { QueryTypes } from 'sequelize';

import db from '../../DataBase/db.js';
import { obtenerCotizacionUsdVigente } from '../Finanzas/CTS_TB_FinanzasCotizacionesUsd.js';

const TIPOS_DOLAR_VALIDOS = ['oficial', 'blue'];

// Sergio Manrique - 2026/07/17 - Fecha de hoy (horario Argentina) en formato
// YYYY-MM-DD, para saber si el mes consultado ya terminó o está en curso.
const resolverFechaHoy = () => {
  const partes = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const year = partes.find((parte) => parte.type === 'year')?.value;
  const month = partes.find((parte) => parte.type === 'month')?.value;
  const day = partes.find((parte) => parte.type === 'day')?.value;

  return `${year}-${month}-${day}`;
};

/*
 * Sergio Manrique - 2026/07/12
 * Resuelve el rango de fechas (primer/último día) de un año/mes dados. Si no
 * se pasan, usa el mes actual.
 */
const resolverRangoMes = (query = {}) => {
  const hoy = new Date();
  const anio = Number(query.anio) || hoy.getFullYear();
  const mes = Number(query.mes) || hoy.getMonth() + 1; // 1-12

  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return null;
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return null;

  const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const ultimoDia = new Date(anio, mes, 0).getDate();
  const hasta = `${anio}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

  return { anio, mes, desde, hasta };
};

/*
 * Sergio Manrique - 2026/07/12
 * Dado un año/mes y un día de corte (10, 20, 25 o null para "fin de mes"),
 * arma la fecha del corte, la fecha del mismo corte un mes atrás y el
 * primer día de cada uno de esos dos meses (para acumular facturación
 * desde el inicio del mes hasta el corte).
 */
const resolverFechasCorte = (anio, mes, diaCorte) => {
  const ultimoDiaMes = new Date(anio, mes, 0).getDate();
  const dia = diaCorte || ultimoDiaMes;
  const corte = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const primerDiaMes = `${anio}-${String(mes).padStart(2, '0')}-01`;

  const mesAnteriorDate = new Date(anio, mes - 2, 1);
  const anioAnterior = mesAnteriorDate.getFullYear();
  const mesAnterior = mesAnteriorDate.getMonth() + 1;
  const ultimoDiaMesAnterior = new Date(anioAnterior, mesAnterior, 0).getDate();
  const diaCorteAnterior = diaCorte ? Math.min(diaCorte, ultimoDiaMesAnterior) : ultimoDiaMesAnterior;
  const corteAnterior = `${anioAnterior}-${String(mesAnterior).padStart(2, '0')}-${String(diaCorteAnterior).padStart(2, '0')}`;
  const primerDiaMesAnterior = `${anioAnterior}-${String(mesAnterior).padStart(2, '0')}-01`;

  return { corte, primerDiaMes, corteAnterior, primerDiaMesAnterior };
};

// Umbral de variación (en cantidad de alumnos, o en % para facturación) a
// partir del cual se considera "creciendo/adelantado" o "crítico/atrasado"
// en vez de "estable/en ritmo". Calibrado contra los ejemplos de la
// planilla del cliente (variaciones de ±5 o más cambian de estado).
const UMBRAL_SEMAFORO = 5;

const estadoPorVariacion = (variacion) => {
  if (variacion === null || variacion === undefined) return null;
  if (variacion >= UMBRAL_SEMAFORO) return 'CRECIENDO';
  if (variacion <= -UMBRAL_SEMAFORO) return 'CRITICO';
  return 'ESTABLE';
};

const estadoPorVariacionFacturacion = (variacionPct) => {
  if (variacionPct === null || variacionPct === undefined) return null;
  if (variacionPct >= UMBRAL_SEMAFORO) return 'ADELANTADO';
  if (variacionPct <= -UMBRAL_SEMAFORO) return 'ATRASADO';
  return 'EN_RITMO';
};

const CORTES_ACTIVIDAD = [
  { clave: '10', etiqueta: 'Día 10', dia: 10 },
  { clave: '20', etiqueta: 'Día 20', dia: 20 },
  { clave: '25', etiqueta: 'Día 25', dia: 25 },
  { clave: 'fin_mes', etiqueta: 'Fin de mes', dia: null }
];

/*
 * Sergio Manrique - 2026/07/12
 * Por cada sede y cada corte del mes (10 / 20 / 25 / fin de mes): cantidad de
 * alumnos activos a esa fecha, comparado contra el mismo corte del mes
 * anterior (variación + semáforo), facturación acumulada desde el inicio
 * del mes hasta el corte (comparada también contra el mes anterior) y %
 * de ocupación a esa fecha. Replica la planilla de seguimiento mensual del
 * cliente (activos acumulados, no cuotas nuevas por rango de días).
 *
 * "Activos a una fecha" se reconstruye con fecha_inicio/fecha_baja del
 * alumno (no con el campo `estado` actual, que solo refleja el presente),
 * para poder mirar hacia atrás en el tiempo.
 */
export const OBR_DashboardCortesActividad_CTS = async (req, res) => {
  try {
    const rango = resolverRangoMes(req.query);

    if (!rango) {
      return res.status(400).json({ ok: false, message: 'Parámetros anio/mes inválidos.' });
    }

    const sedeId = req.query.sede_id ? Number(req.query.sede_id) : null;

    const filasPorCorte = await Promise.all(
      CORTES_ACTIVIDAD.map(async (corteDef) => {
        const fechas = resolverFechasCorte(rango.anio, rango.mes, corteDef.dia);

        const rows = await db.query(
          `
          SELECT
            s.id AS sede_id,
            s.nombre AS sede,
            s.capacidad_operativa AS cupo_maximo,
            (SELECT COUNT(*) FROM alumnos_alumnos a
              WHERE a.sede_id = s.id
                AND a.fecha_inicio <= :corte
                AND (a.fecha_baja IS NULL OR a.fecha_baja > :corte)) AS activos,
            (SELECT COUNT(*) FROM alumnos_alumnos a
              WHERE a.sede_id = s.id
                AND a.fecha_inicio <= :corteAnterior
                AND (a.fecha_baja IS NULL OR a.fecha_baja > :corteAnterior)) AS activos_mes_anterior,
            (SELECT COALESCE(SUM(p.monto), 0) FROM pagos_pagos p
              WHERE p.sede_id = s.id AND p.estado = 'confirmado'
                AND DATE(p.fecha_pago) BETWEEN :primerDiaMes AND :corte) AS facturacion_acumulada,
            (SELECT COALESCE(SUM(p.monto), 0) FROM pagos_pagos p
              WHERE p.sede_id = s.id AND p.estado = 'confirmado'
                AND DATE(p.fecha_pago) BETWEEN :primerDiaMesAnterior AND :corteAnterior) AS facturacion_acumulada_mes_anterior
          FROM sedes_sedes s
          WHERE s.activo = 1
            ${sedeId ? 'AND s.id = :sede_id' : ''}
          ORDER BY s.nombre
          `,
          {
            replacements: {
              corte: fechas.corte,
              corteAnterior: fechas.corteAnterior,
              primerDiaMes: fechas.primerDiaMes,
              primerDiaMesAnterior: fechas.primerDiaMesAnterior,
              ...(sedeId ? { sede_id: sedeId } : {})
            },
            type: QueryTypes.SELECT
          }
        );

        return { clave: corteDef.clave, etiqueta: corteDef.etiqueta, rows };
      })
    );

    // Reagrupa de "un bloque por corte" a "un bloque por sede, con sus 3 cortes adentro".
    const sedesMap = new Map();

    for (const bloque of filasPorCorte) {
      for (const fila of bloque.rows) {
        if (!sedesMap.has(fila.sede_id)) {
          sedesMap.set(fila.sede_id, { sede_id: fila.sede_id, sede: fila.sede, cortes: [] });
        }

        const cupoMaximo = Number(fila.cupo_maximo) || 0;
        const activos = Number(fila.activos) || 0;
        const activosMesAnterior = Number(fila.activos_mes_anterior) || 0;
        const facturacionAcumulada = Number(fila.facturacion_acumulada) || 0;
        const facturacionAcumuladaMesAnterior = Number(fila.facturacion_acumulada_mes_anterior) || 0;

        const variacion = activos - activosMesAnterior;

        // Si el mes anterior facturó $0 en este corte, no se puede sacar un
        // % de variación (división por cero) — pero si este mes ya hay
        // facturación y antes no había nada, es un caso claro de "arrancó
        // de cero", así que se marca directamente como adelantado en vez
        // de devolver null (que se veía como "—" sin sentido).
        let variacionFacturacionPct = null;
        if (facturacionAcumuladaMesAnterior > 0) {
          variacionFacturacionPct = Math.round(
            ((facturacionAcumulada - facturacionAcumuladaMesAnterior) / facturacionAcumuladaMesAnterior) * 10000
          ) / 100;
        } else if (facturacionAcumulada > 0) {
          variacionFacturacionPct = UMBRAL_SEMAFORO;
        }

        sedesMap.get(fila.sede_id).cortes.push({
          clave: bloque.clave,
          etiqueta: bloque.etiqueta,
          activos,
          activos_mes_anterior: activosMesAnterior,
          variacion,
          facturacion_acumulada: facturacionAcumulada,
          porcentaje_ocupacion: cupoMaximo > 0 ? Math.round((activos / cupoMaximo) * 10000) / 100 : null,
          estado_activos: estadoPorVariacion(variacion),
          estado_facturacion: estadoPorVariacionFacturacion(variacionFacturacionPct)
        });
      }
    }

    return res.status(200).json({
      ok: true,
      message: 'Cortes de actividad por sede obtenidos correctamente.',
      filtros: { anio: rango.anio, mes: rango.mes, sede_id: sedeId },
      // Los umbrales de semáforo (±5) están calibrados contra los ejemplos
      // de la planilla de referencia del cliente, no confirmados por él.
      umbral_semaforo: UMBRAL_SEMAFORO,
      data: Array.from(sedesMap.values())
    });
  } catch (error) {
    console.error('Error OBR_DashboardCortesActividad_CTS:', error);
    return res.status(500).json({ ok: false, message: 'Error interno del servidor.' });
  }
};

/*
 * Sergio Manrique - 2026/07/12
 * Cierre mensual por sede: cuotas cobradas, cupo, ocupación, altas, bajas,
 * churn, LTV, facturación bruta/neta (+ en USD), gastos, ticket promedio,
 * margen neto y punto de equilibrio — mismas fórmulas que usa el cliente en
 * su planilla (LTV = ticket promedio / churn; punto de equilibrio = gastos /
 * ticket promedio; facturación neta USD = facturación neta / venta de la
 * cotización vigente al cierre del mes, según finanzas_cotizaciones_usd).
 *
 * Ticket promedio = facturación bruta (TODO lo vendido: cuotas + productos
 * sueltos) / cantidad de cuotas cobradas en el período. El cliente confirmó
 * (2026/07/17) que el divisor son las cuotas, no la cantidad total de
 * ventas/pagos: una venta suelta (agua, barrita, etc.) suma a la
 * facturación bruta pero NO cuenta como cuota. Por eso `cuotas_mensuales`
 * filtra `mensualidad_id IS NOT NULL` (los pagos sin mensualidad asociada
 * son ventas sueltas, no cuotas de socio).
 *
 * CAC Marketing = (gastos tipo Publicidad + Agencia) / altas del mes.
 * CAC Comercial = (gastos tipo Publicidad + Agencia + Front Comercial) /
 * altas del mes. Fórmulas y nombres de tipo de gasto confirmados por el
 * cliente (2026/07/17) — ver src/DataBase/sql/2026_07_17_gastos_tipos_cac.sql
 * para dar de alta esos 3 tipos de gasto en un entorno nuevo. Da `null` si
 * no hubo altas en el período (no por falta de datos del modelo).
 */
export const OBR_DashboardCierreMensual_CTS = async (req, res) => {
  try {
    const rango = resolverRangoMes(req.query);

    if (!rango) {
      return res.status(400).json({ ok: false, message: 'Parámetros anio/mes inválidos.' });
    }

    const sedeId = req.query.sede_id ? Number(req.query.sede_id) : null;

    const tipoDolar = TIPOS_DOLAR_VALIDOS.includes(req.query.tipo_dolar)
      ? req.query.tipo_dolar
      : 'oficial';

    // La cotización que corresponde a "la facturación de este mes" es la
    // vigente al último día del mes consultado (o la del día de hoy, si se
    // está mirando el mes en curso todavía sin terminar).
    const fechaCotizacion = rango.hasta < resolverFechaHoy()
      ? rango.hasta
      : resolverFechaHoy();

    const cotizacionUsd = await obtenerCotizacionUsdVigente({
      fecha: fechaCotizacion,
      tipo: tipoDolar
    });

    const rows = await db.query(
      `
      SELECT
        s.id AS sede_id,
        s.nombre AS sede,
        s.capacidad_operativa AS cupo_maximo,
        (SELECT COUNT(*) FROM alumnos_alumnos a
          WHERE a.sede_id = s.id
            AND a.fecha_inicio <= :hasta
            AND (a.fecha_baja IS NULL OR a.fecha_baja > :hasta)) AS alumnos_activos,
        (SELECT COUNT(*) FROM alumnos_alumnos a
          WHERE a.sede_id = s.id AND a.fecha_inicio BETWEEN :desde AND :hasta) AS altas_mensuales,
        (SELECT COUNT(*) FROM alumnos_alumnos a
          WHERE a.sede_id = s.id AND a.fecha_baja BETWEEN :desde AND :hasta) AS bajas_mensuales,
        (SELECT COUNT(*) FROM alumnos_alumnos a
          WHERE a.sede_id = s.id
            AND a.fecha_inicio < :desde
            AND (a.fecha_baja IS NULL OR a.fecha_baja >= :desde)) AS alumnos_inicio_mes,
        (SELECT COUNT(*) FROM pagos_pagos p
          WHERE p.sede_id = s.id AND p.estado = 'confirmado'
            AND p.mensualidad_id IS NOT NULL
            AND DATE(p.fecha_pago) BETWEEN :desde AND :hasta) AS cuotas_mensuales,
        (SELECT COALESCE(SUM(p.monto), 0) FROM pagos_pagos p
          WHERE p.sede_id = s.id AND p.estado = 'confirmado'
            AND DATE(p.fecha_pago) BETWEEN :desde AND :hasta) AS facturacion_bruta,
        (SELECT COALESCE(SUM(g.importe_total), 0) FROM gastos_gastos g
          WHERE g.sede_id = s.id AND g.estado <> 'anulado'
            AND g.fecha_gasto BETWEEN :desde AND :hasta) AS gastos,
        (SELECT COALESCE(SUM(g.importe_total), 0) FROM gastos_gastos g
          INNER JOIN gastos_tipos t ON t.id = g.tipo_gasto_id
          WHERE g.sede_id = s.id AND g.estado <> 'anulado'
            AND t.nombre IN ('Publicidad', 'Agencia')
            AND g.fecha_gasto BETWEEN :desde AND :hasta) AS gasto_marketing,
        (SELECT COALESCE(SUM(g.importe_total), 0) FROM gastos_gastos g
          INNER JOIN gastos_tipos t ON t.id = g.tipo_gasto_id
          WHERE g.sede_id = s.id AND g.estado <> 'anulado'
            AND t.nombre = 'Front Comercial'
            AND g.fecha_gasto BETWEEN :desde AND :hasta) AS gasto_front_comercial
      FROM sedes_sedes s
      WHERE s.activo = 1
        ${sedeId ? 'AND s.id = :sede_id' : ''}
      ORDER BY s.nombre
      `,
      {
        replacements: { desde: rango.desde, hasta: rango.hasta, ...(sedeId ? { sede_id: sedeId } : {}) },
        type: QueryTypes.SELECT
      }
    );

    // Los porcentajes/derivados se calculan acá en vez de en SQL para evitar
    // divisiones por cero repetidas en cada fila del query.
    const data = rows.map((fila) => {
      const cupoMaximo = Number(fila.cupo_maximo) || 0;
      const alumnosActivos = Number(fila.alumnos_activos) || 0;
      const alumnosInicioMes = Number(fila.alumnos_inicio_mes) || 0;
      const bajasMensuales = Number(fila.bajas_mensuales) || 0;
      const facturacionBruta = Number(fila.facturacion_bruta) || 0;
      const gastos = Number(fila.gastos) || 0;
      const gastoMarketing = Number(fila.gasto_marketing) || 0;
      const gastoFrontComercial = Number(fila.gasto_front_comercial) || 0;
      const altasMensuales = Number(fila.altas_mensuales) || 0;
      const cuotasMensuales = Number(fila.cuotas_mensuales) || 0;
      const facturacionNeta = facturacionBruta - gastos;

      const churnMensual = alumnosInicioMes > 0
        ? Math.round((bajasMensuales / alumnosInicioMes) * 10000) / 100
        : null;
      const ticketPromedio = cuotasMensuales > 0
        ? Math.round((facturacionBruta / cuotasMensuales) * 100) / 100
        : null;

      // LTV = ticket promedio / churn (fórmula tal cual la usa el cliente).
      const ltv = ticketPromedio !== null && churnMensual
        ? Math.round((ticketPromedio / (churnMensual / 100)) * 100) / 100
        : null;

      // Punto de equilibrio = gastos / ticket promedio (fórmula del cliente).
      const puntoEquilibrio = ticketPromedio
        ? Math.round((gastos / ticketPromedio) * 100) / 100
        : null;

      // Facturación neta convertida a USD con la cotización de venta del
      // dólar vigente al cierre del mes (o de hoy, si el mes sigue en curso).
      const facturacionNetaUsd = cotizacionUsd
        ? Math.round((facturacionNeta / Number(cotizacionUsd.venta)) * 100) / 100
        : null;

      // CAC Marketing = (Publicidad + Agencia) / altas del mes: evalúa el
      // trabajo de la agencia. CAC Comercial = eso + Front Comercial: cuánto
      // cuesta realmente incorporar un alumno. Fórmulas confirmadas por el
      // cliente (2026/07/17). Requiere que los gastos ya estén cargados con
      // sede y tipo ('Publicidad'/'Agencia'/'Front Comercial') asignados.
      const cacMarketing = altasMensuales > 0
        ? Math.round((gastoMarketing / altasMensuales) * 100) / 100
        : null;
      const cacComercial = altasMensuales > 0
        ? Math.round(((gastoMarketing + gastoFrontComercial) / altasMensuales) * 100) / 100
        : null;

      return {
        sede_id: fila.sede_id,
        sede: fila.sede,
        cupo_maximo: cupoMaximo || null,
        alumnos_activos: alumnosActivos,
        porcentaje_ocupacion: cupoMaximo > 0 ? Math.round((alumnosActivos / cupoMaximo) * 10000) / 100 : null,
        altas_mensuales: Number(fila.altas_mensuales) || 0,
        bajas_mensuales: bajasMensuales,
        churn_mensual: churnMensual,
        cuotas_mensuales: cuotasMensuales,
        ltv,
        facturacion_bruta: facturacionBruta,
        gastos,
        facturacion_neta: facturacionNeta,
        ticket_promedio: ticketPromedio,
        margen_neto: facturacionBruta > 0 ? Math.round((facturacionNeta / facturacionBruta) * 10000) / 100 : null,
        punto_equilibrio: puntoEquilibrio,
        facturacion_neta_usd: facturacionNetaUsd,
        cac_marketing: cacMarketing,
        cac_comercial: cacComercial,
        no_disponible: []
      };
    });

    return res.status(200).json({
      ok: true,
      message: 'Cierre mensual por sede obtenido correctamente.',
      filtros: { anio: rango.anio, mes: rango.mes, sede_id: sedeId },
      // Cotización usada para pasar facturación_neta_usd a dólares. Si es
      // null, no se pudo calcular facturacion_neta_usd (no hay cotización
      // capturada todavía hasta esa fecha).
      cotizacion_usd: cotizacionUsd
        ? {
            tipo: tipoDolar,
            fecha: cotizacionUsd.fecha,
            compra: Number(cotizacionUsd.compra),
            venta: Number(cotizacionUsd.venta)
          }
        : null,
      data
    });
  } catch (error) {
    console.error('Error OBR_DashboardCierreMensual_CTS:', error);
    return res.status(500).json({ ok: false, message: 'Error interno del servidor.' });
  }
};
