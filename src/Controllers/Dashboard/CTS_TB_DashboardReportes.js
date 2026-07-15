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
 * Dado un año/mes y un día de corte (10, 20 o null para "fin de mes"),
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
  { clave: 'fin_mes', etiqueta: 'Fin de mes', dia: null }
];

/*
 * Sergio Manrique - 2026/07/12
 * Por cada sede y cada corte del mes (10 / 20 / fin de mes): cantidad de
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
 * churn, LTV, facturación bruta/neta, gastos, ticket promedio, margen neto
 * y punto de equilibrio — mismas fórmulas que usa el cliente en su planilla
 * (LTV = ticket promedio / churn; punto de equilibrio = gastos / ticket
 * promedio). CAC y facturación en USD siguen sin poder calcularse: no hay
 * datos suficientes en el modelo actual (ver `no_disponible`).
 */
export const OBR_DashboardCierreMensual_CTS = async (req, res) => {
  try {
    const rango = resolverRangoMes(req.query);

    if (!rango) {
      return res.status(400).json({ ok: false, message: 'Parámetros anio/mes inválidos.' });
    }

    const sedeId = req.query.sede_id ? Number(req.query.sede_id) : null;

    const rows = await db.query(
      `
      SELECT
        s.id AS sede_id,
        s.nombre AS sede,
        s.capacidad_operativa AS cupo_maximo,
        (SELECT COUNT(*) FROM alumnos_alumnos a
          WHERE a.sede_id = s.id AND a.estado = 'activo') AS alumnos_activos,
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
            AND DATE(p.fecha_pago) BETWEEN :desde AND :hasta) AS cuotas_mensuales,
        (SELECT COALESCE(SUM(p.monto), 0) FROM pagos_pagos p
          WHERE p.sede_id = s.id AND p.estado = 'confirmado'
            AND DATE(p.fecha_pago) BETWEEN :desde AND :hasta) AS facturacion_bruta,
        (SELECT COALESCE(SUM(g.importe_total), 0) FROM gastos_gastos g
          WHERE g.sede_id = s.id AND g.estado <> 'anulado'
            AND g.fecha_gasto BETWEEN :desde AND :hasta) AS gastos
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
        // No hay datos suficientes en el modelo actual para calcular estos:
        // CAC requiere vincular gasto de marketing con altas captadas,
        // facturación en USD requiere una fuente de cotización de dólar.
        cac: null,
        facturacion_neta_usd: null,
        no_disponible: ['cac', 'facturacion_neta_usd']
      };
    });

    return res.status(200).json({
      ok: true,
      message: 'Cierre mensual por sede obtenido correctamente.',
      filtros: { anio: rango.anio, mes: rango.mes, sede_id: sedeId },
      data
    });
  } catch (error) {
    console.error('Error OBR_DashboardCierreMensual_CTS:', error);
    return res.status(500).json({ ok: false, message: 'Error interno del servidor.' });
  }
};
