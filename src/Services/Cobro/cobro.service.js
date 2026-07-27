/*
 * Benjamin Orellana - 2026/07/14 - Servicio transaccional de Cobrar PREMIUM.
 * Recalcula importes y coordina cobro, plan, membresía, mensualidad, pago,
 * stock, caja y finanzas sin depender de controladores HTTP.
 */
import { Op, QueryTypes } from "sequelize";
import db from "../../DataBase/db.js";

import CobrosModel from "../../Models/Cobro/MD_TB_Cobros.js";
import CobrosDetallesModel from "../../Models/Cobro/MD_TB_CobrosDetalles.js";
import CobrosPagosModel from "../../Models/Cobro/MD_TB_CobrosPagos.js";
import CajasSesionesModel from "../../Models/Caja/MD_TB_CajasSesiones.js";
import CajasMovimientosModel from "../../Models/Caja/MD_TB_CajasMovimientos.js";
import AlumnosModel from "../../Models/Alumno/MD_TB_Alumnos.js";
import AlumnosMembresiasModel from "../../Models/Alumno/MD_TB_AlumnosMembresias.js";
import AlumnosSaldosModel from "../../Models/Alumno/MD_TB_AlumnosSaldos.js";
import AlumnosSaldosMovimientosModel from "../../Models/Alumno/MD_TB_AlumnosSaldosMovimientos.js";
import UsuariosModel from "../../Models/Usuario/MD_TB_Usuarios.js";
import PagosMensualidadesModel from "../../Models/Pago/MD_TB_PagosMensualidades.js";
import PagosModel from "../../Models/Pago/MD_TB_Pagos.js";
import PagosMediosPagoModel from "../../Models/Pago/MD_TB_PagosMediosPago.js";
import FinanzasMovimientosModel from "../../Models/Finanzas/MD_TB_FinanzasMovimientos.js";
import ProductosStockSedesModel from "../../Models/Catalogo/MD_TB_ProductosStockSedes.js";
import ProductosStockMovimientosModel from "../../Models/Catalogo/MD_TB_ProductosStockMovimientos.js";
import ProductosModel from "../../Models/Catalogo/MD_TB_Productos.js";
import { normalizarCicloMembresiasAlumno } from "../Alumno/membresiaCiclo.service.js";

const TIPOS_CONCEPTO = ["producto", "servicio", "plan"];
const TIPOS_CLIENTE = ["alumno", "empleado", "sin_cliente"];
const CODIGO_SALDO_FAVOR = "SALDO_FAVOR";

const incluirCobroCompleto = [
  { model: CobrosDetallesModel, as: "detalles" },
  {
    model: CobrosPagosModel,
    as: "pagos_cobro",
    include: [{ model: PagosMediosPagoModel, as: "medio_pago" }],
  },
];

export class CobroOperacionError extends Error {
  constructor(message, status = 400, code = "COBRO_INVALIDO") {
    super(message);
    this.name = "CobroOperacionError";
    this.status = status;
    this.code = code;
  }
}

const redondear = (valor) =>
  Math.round((Number(valor) + Number.EPSILON) * 100) / 100;

const idValido = (valor) =>
  Number.isInteger(Number(valor)) && Number(valor) > 0;

const porcentajeValido = (valor) => {
  const numero = Number(valor || 0);
  return Number.isFinite(numero) && numero >= 0 && numero <= 100;
};

const fechaArgentina = () => {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const valores = Object.fromEntries(
    partes
      .filter((item) => item.type !== "literal")
      .map((item) => [item.type, item.value]),
  );
  return `${valores.year}-${valores.month}-${valores.day}`;
};

const sumarDias = (fechaDateOnly, dias) => {
  const fecha = new Date(`${fechaDateOnly}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + Number(dias));
  return fecha.toISOString().slice(0, 10);
};

const validarSinReservasFuturasParaCambioPlan = async ({
  alumnoId,
  transaction,
}) => {
  const reservas = await db.query(
    `SELECT r.id, t.fecha, t.hora_inicio,
            COALESCE(t.nombre_clase, 'Clase') AS nombre_clase
       FROM agenda_turnos_reservas r
       INNER JOIN agenda_turnos t ON t.id = r.turno_id
      WHERE r.alumno_id = :alumnoId
        AND r.estado = 'reservada'
        AND t.estado NOT IN ('cancelado', 'bloqueado')
        AND t.fecha >= :hoy
      ORDER BY t.fecha ASC, t.hora_inicio ASC
      LIMIT 10`,
    {
      replacements: { alumnoId: Number(alumnoId), hoy: fechaArgentina() },
      type: QueryTypes.SELECT,
      transaction,
    },
  );

  if (reservas.length > 0) {
    throw new CobroOperacionError(
      `El alumno tiene ${reservas.length} reserva${reservas.length === 1 ? '' : 's'} futura${reservas.length === 1 ? '' : 's'}. Cancelá o reprogramá esos turnos antes de confirmar el cambio de plan.`,
      409,
      "RESERVAS_FUTURAS_PENDIENTES",
    );
  }
};

const MESES_POR_PERIODO = {
  mensual: 1,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

// Conserva el día del vencimiento al avanzar por períodos calendario.
// Ejemplo: 2026-08-06 + un período mensual = 2026-09-06.
const sumarMesesCalendario = (fechaDateOnly, meses) => {
  const fecha = new Date(`${fechaDateOnly}T00:00:00Z`);
  const diaOriginal = fecha.getUTCDate();

  fecha.setUTCDate(1);
  fecha.setUTCMonth(fecha.getUTCMonth() + Number(meses));

  const ultimoDiaMesDestino = new Date(
    Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 0),
  ).getUTCDate();
  fecha.setUTCDate(Math.min(diaOriginal, ultimoDiaMesDestino));

  return fecha.toISOString().slice(0, 10);
};

const consultaCatalogo = async ({
  tipo,
  referenciaId,
  sedeId,
  fecha,
  transaction,
}) => {
  const replacements = {
    id: Number(referenciaId),
    sedeId: Number(sedeId),
    fecha,
  };
  let sql;

  if (tipo === "producto") {
    sql = `
      SELECT p.id, p.nombre, c.nombre AS categoria_nombre, p.controla_stock,
        p.permite_stock_negativo, pr.precio, pr.moneda
      FROM productos_productos p
      INNER JOIN productos_categorias c ON c.id = p.categoria_id AND c.activo = 1
      INNER JOIN productos_precios pr ON pr.id = (
        SELECT pr2.id FROM productos_precios pr2
        WHERE pr2.producto_id = p.id AND pr2.activo = 1
          AND pr2.fecha_desde <= :fecha
          AND (pr2.fecha_hasta IS NULL OR pr2.fecha_hasta >= :fecha)
          AND (pr2.sede_id = :sedeId OR pr2.sede_id IS NULL)
        ORDER BY CASE WHEN pr2.sede_id = :sedeId THEN 0 ELSE 1 END,
          pr2.fecha_desde DESC, pr2.id DESC LIMIT 1
      )
      WHERE p.id = :id AND p.activo = 1 LIMIT 1`;
  } else if (tipo === "servicio") {
    sql = `
      SELECT s.id, s.nombre, c.nombre AS categoria_nombre, pr.precio, pr.moneda
      FROM servicios_servicios s
      INNER JOIN servicios_categorias c ON c.id = s.categoria_id AND c.activo = 1
      INNER JOIN servicios_precios pr ON pr.id = (
        SELECT pr2.id FROM servicios_precios pr2
        WHERE pr2.servicio_id = s.id AND pr2.activo = 1
          AND pr2.fecha_desde <= :fecha
          AND (pr2.fecha_hasta IS NULL OR pr2.fecha_hasta >= :fecha)
          AND (pr2.sede_id = :sedeId OR pr2.sede_id IS NULL)
        ORDER BY CASE WHEN pr2.sede_id = :sedeId THEN 0 ELSE 1 END,
          pr2.fecha_desde DESC, pr2.id DESC LIMIT 1
      )
      WHERE s.id = :id AND s.activo = 1 LIMIT 1`;
  } else {
    sql = `
      SELECT p.id, p.nombre, 'Planes' AS categoria_nombre, p.duracion_dias,
        p.clases_por_mes, p.cantidad_clases_periodo, p.periodo, pr.precio, pr.moneda
      FROM planes_planes p
      INNER JOIN planes_precios pr ON pr.id = (
        SELECT pr2.id FROM planes_precios pr2
        WHERE pr2.plan_id = p.id AND pr2.activo = 1
          AND pr2.fecha_desde <= :fecha
          AND (pr2.fecha_hasta IS NULL OR pr2.fecha_hasta >= :fecha)
          AND (pr2.sede_id = :sedeId OR pr2.sede_id IS NULL)
        ORDER BY CASE WHEN pr2.sede_id = :sedeId THEN 0 ELSE 1 END,
          pr2.fecha_desde DESC, pr2.id DESC LIMIT 1
      )
      WHERE p.id = :id AND p.activo = 1 LIMIT 1`;
  }

  const rows = await db.query(sql, {
    replacements,
    type: QueryTypes.SELECT,
    transaction,
  });
  return rows[0] || null;
};

const resolverConceptos = async ({ conceptos, sedeId, transaction }) => {
  if (!Array.isArray(conceptos) || conceptos.length === 0) {
    throw new CobroOperacionError(
      "Debe agregar al menos un concepto al cobro.",
    );
  }

  const fecha = fechaArgentina();
  const resueltos = [];

  for (const item of conceptos) {
    if (!TIPOS_CONCEPTO.includes(item.tipo) || !idValido(item.referencia_id)) {
      throw new CobroOperacionError("Uno de los conceptos no es válido.");
    }

    const cantidad = Number(item.cantidad || 1);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new CobroOperacionError(
        "La cantidad de cada concepto debe ser mayor a cero.",
      );
    }
    if (item.tipo === "plan" && cantidad !== 1) {
      throw new CobroOperacionError(
        "Los planes deben cobrarse de a una membresía por operación.",
      );
    }

    if (
      !porcentajeValido(item.descuento_porcentaje) ||
      !porcentajeValido(item.impuesto_porcentaje)
    ) {
      throw new CobroOperacionError(
        "Descuentos e impuestos deben estar entre 0% y 100%.",
      );
    }

    const catalogo = await consultaCatalogo({
      tipo: item.tipo,
      referenciaId: item.referencia_id,
      sedeId,
      fecha,
      transaction,
    });
    if (!catalogo) {
      throw new CobroOperacionError(
        `El ${item.tipo} indicado no está disponible para la sede.`,
        409,
      );
    }

    const precioCatalogo = Number(catalogo.precio || 0);
    const precioUnitario =
      item.precio_unitario === undefined
        ? precioCatalogo
        : Number(item.precio_unitario);
    if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
      throw new CobroOperacionError("El precio manual no es válido.");
    }

    const descuentoPorcentaje = Number(item.descuento_porcentaje || 0);
    const impuestoPorcentaje = Number(item.impuesto_porcentaje || 0);
    const importe = redondear(precioUnitario * cantidad);
    const descuentoImporte = redondear(importe * (descuentoPorcentaje / 100));
    const base = redondear(importe - descuentoImporte);
    const impuestoImporte = redondear(base * (impuestoPorcentaje / 100));
    const total = redondear(base + impuestoImporte);

    resueltos.push({
      ...catalogo,
      tipo: item.tipo,
      referencia_id: Number(item.referencia_id),
      cantidad,
      precio_catalogo: precioCatalogo,
      precio_unitario: precioUnitario,
      descuento_porcentaje: descuentoPorcentaje,
      descuento_importe: descuentoImporte,
      impuesto_porcentaje: impuestoPorcentaje,
      impuesto_importe: impuestoImporte,
      importe,
      total,
      fecha_inicio: item.fecha_inicio || null,
    });
  }

  if (resueltos.filter((item) => item.tipo === "plan").length > 1) {
    throw new CobroOperacionError(
      "La primera versión admite un solo plan por cobro.",
    );
  }

  return resueltos;
};

const validarCliente = async ({
  clienteTipo,
  alumnoId,
  clienteUsuarioId,
  cobradorUsuarioId,
  transaction,
}) => {
  if (!TIPOS_CLIENTE.includes(clienteTipo)) {
    throw new CobroOperacionError("Debe indicar un tipo de cliente válido.");
  }

  const cobrador = await UsuariosModel.findOne({
    where: { id: Number(cobradorUsuarioId), estado: "activo" },
    transaction,
  });
  if (!cobrador)
    throw new CobroOperacionError(
      "El empleado cobrador no existe o está inactivo.",
      404,
    );

  let alumno = null;
  if (clienteTipo === "alumno") {
    if (!idValido(alumnoId))
      throw new CobroOperacionError("Debe seleccionar un alumno válido.");
    alumno = await AlumnosModel.findByPk(Number(alumnoId), { transaction });
    if (!alumno)
      throw new CobroOperacionError(
        "No se encontró el alumno seleccionado.",
        404,
      );
  }

  if (clienteTipo === "empleado") {
    const empleado = await UsuariosModel.findOne({
      where: { id: Number(clienteUsuarioId), estado: "activo" },
      transaction,
    });
    if (!empleado)
      throw new CobroOperacionError(
        "No se encontró el empleado seleccionado.",
        404,
      );
  }

  return { alumno, cobrador };
};

const resolverPagos = async ({ pagos, total, transaction }) => {
  if (!Array.isArray(pagos) || pagos.length === 0) {
    throw new CobroOperacionError(
      "Debe seleccionar al menos un medio de pago.",
    );
  }

  const resueltos = [];
  for (const pago of pagos) {
    if (!idValido(pago.medio_pago_id))
      throw new CobroOperacionError("El medio de pago no es válido.");
    const monto = Number(pago.monto);
    if (!Number.isFinite(monto) || monto <= 0)
      throw new CobroOperacionError("El monto pagado debe ser mayor a cero.");

    const medio = await PagosMediosPagoModel.findOne({
      where: { id: Number(pago.medio_pago_id), activo: 1 },
      transaction,
    });
    if (!medio)
      throw new CobroOperacionError(
        "El medio de pago no existe o está inactivo.",
        404,
      );
    if (Number(medio.requiere_comprobante) === 1 && !pago.comprobante_url) {
      throw new CobroOperacionError(
        `El medio ${medio.nombre} requiere comprobante.`,
      );
    }
    resueltos.push({
      medio,
      medio_pago_id: Number(medio.id),
      es_saldo_favor:
        String(medio.codigo || "").toUpperCase() === CODIGO_SALDO_FAVOR,
      impacta_caja: Number(medio.impacta_caja) === 1,
      monto: redondear(monto),
      referencia: pago.referencia ? String(pago.referencia).trim() : null,
      comprobante_url: pago.comprobante_url
        ? String(pago.comprobante_url).trim()
        : null,
    });
  }

  const totalPagado = redondear(
    resueltos.reduce((suma, item) => suma + item.monto, 0),
  );
  if (totalPagado - total > 0.009) {
    throw new CobroOperacionError(
      "La suma de los medios de pago no puede superar el total del cobro.",
    );
  }

  return { pagos: resueltos, totalPagado };
};

const prepararConsumoSaldo = async ({ pagos, alumnoId, transaction }) => {
  const pagosSaldo = pagos.filter((item) => item.es_saldo_favor);
  if (pagosSaldo.length === 0) return null;
  if (pagosSaldo.length > 1) {
    throw new CobroOperacionError(
      "El saldo a favor solo puede aplicarse una vez por cobro.",
    );
  }
  if (!idValido(alumnoId)) {
    throw new CobroOperacionError(
      "Para utilizar saldo a favor debe seleccionar un alumno.",
    );
  }
  if (
    pagos.some(
      (item) =>
        !item.es_saldo_favor && Number(item.medio.requiere_validacion) === 1,
    )
  ) {
    throw new CobroOperacionError(
      "El saldo a favor no puede combinarse con un medio pendiente de validación.",
    );
  }

  const cuenta = await AlumnosSaldosModel.findOne({
    where: { alumno_id: Number(alumnoId) },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const saldoAnterior = Number(cuenta?.saldo || 0);
  const monto = Number(pagosSaldo[0].monto);
  if (!cuenta || saldoAnterior + 0.009 < monto) {
    throw new CobroOperacionError(
      "El alumno no dispone de saldo suficiente para completar el cobro.",
      409,
      "SALDO_INSUFICIENTE",
    );
  }

  return {
    cuenta,
    pago: pagosSaldo[0],
    saldoAnterior,
    saldoNuevo: redondear(saldoAnterior - monto),
  };
};

const aplicarConsumoSaldo = async ({
  consumo,
  alumnoId,
  sedeId,
  usuarioId,
  cobroId,
  transaction,
}) => {
  if (!consumo) return;
  await consumo.cuenta.update(
    { saldo: consumo.saldoNuevo.toFixed(2), updated_at: new Date() },
    { transaction },
  );
  await AlumnosSaldosMovimientosModel.create(
    {
      saldo_id: Number(consumo.cuenta.id),
      alumno_id: Number(alumnoId),
      sede_id: Number(sedeId),
      usuario_id: Number(usuarioId),
      tipo: "debito",
      origen: "uso_cobro",
      monto: Number(consumo.pago.monto).toFixed(2),
      saldo_anterior: consumo.saldoAnterior.toFixed(2),
      saldo_nuevo: consumo.saldoNuevo.toFixed(2),
      cobro_id: Number(cobroId),
      bonificacion_id: null,
      referencia: `COBRO-${cobroId}`,
      motivo: `Saldo aplicado al cobro #${cobroId}`,
    },
    { transaction },
  );
};

const crearMembresiaPlan = async ({
  alumno,
  sedeId,
  linea,
  estadoCobro,
  montoPagado,
  medioPagoId,
  usuarioId,
  cobroId,
  transaction,
}) => {
  const hoy = fechaArgentina();

  // La membresia operativa se determina por el periodo que cubre hoy, no por
  // el mayor vencimiento historico. Esto evita que datos futuros o periodos
  // solapados manden una renovacion explicita varios meses hacia adelante.
  const membresiasOperativas = await AlumnosMembresiasModel.findAll({
    where: {
      alumno_id: Number(alumno.id),
      estado: "activa",
      fecha_inicio: { [Op.lte]: hoy },
      fecha_vencimiento: { [Op.gte]: hoy },
    },
    order: [
      ["fecha_inicio", "DESC"],
      ["id", "DESC"],
    ],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const membresiaVigente = membresiasOperativas[0] || null;
  const renovarAhoraPorCuposAgotados = Boolean(
    membresiaVigente &&
      Number(membresiaVigente.clases_disponibles || 0) <= 0,
  );
  const cambiarPlanAhora = Boolean(
    membresiaVigente &&
      Number(membresiaVigente.plan_id) !== Number(linea.referencia_id),
  );
  const iniciarCicloAhora = renovarAhoraPorCuposAgotados || cambiarPlanAhora;

  if (cambiarPlanAhora) {
    await validarSinReservasFuturasParaCambioPlan({
      alumnoId: alumno.id,
      transaction,
    });
  }

  const renovacionFuturaExistente = await AlumnosMembresiasModel.findOne({
    where: {
      alumno_id: Number(alumno.id),
      estado: { [Op.in]: ["pendiente_pago", "activa"] },
      fecha_inicio: { [Op.gt]: hoy },
    },
    order: [
      ["fecha_inicio", "ASC"],
      ["id", "ASC"],
    ],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (renovacionFuturaExistente && !iniciarCicloAhora) {
    throw new CobroOperacionError(
      `El alumno ya tiene una renovación futura desde ${renovacionFuturaExistente.fecha_inicio}. Debe utilizar, completar o anular ese período antes de generar otro.`,
      409,
      "RENOVACION_FUTURA_EXISTENTE",
    );
  }

  const ultima = await AlumnosMembresiasModel.findOne({
    where: {
      alumno_id: Number(alumno.id),
      estado: { [Op.in]: ["pendiente_pago", "activa", "vencida", "congelada"] },
    },
    order: [
      ["fecha_vencimiento", "DESC"],
      ["id", "DESC"],
    ],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  const esContinuidadMismoPlan = Boolean(
    !linea.fecha_inicio &&
      ultima?.fecha_vencimiento &&
      ultima.fecha_vencimiento >= hoy &&
      Number(ultima.plan_id) === Number(linea.referencia_id),
  );
  const fechaInicio = iniciarCicloAhora
    ? hoy
    : linea.fecha_inicio ||
      (ultima?.fecha_vencimiento && ultima.fecha_vencimiento >= hoy
      ? sumarDias(ultima.fecha_vencimiento, 1)
      : hoy);
  const duracion = Math.max(Number(linea.duracion_dias || 1), 1);
  const mesesPeriodo =
    MESES_POR_PERIODO[String(linea.periodo || "")] || null;
  const fechaVencimiento = iniciarCicloAhora
    ? mesesPeriodo
      ? sumarDias(sumarMesesCalendario(fechaInicio, mesesPeriodo), -1)
      : sumarDias(fechaInicio, duracion - 1)
    : esContinuidadMismoPlan
      ? mesesPeriodo
        ? sumarMesesCalendario(ultima.fecha_vencimiento, mesesPeriodo)
        : sumarDias(fechaInicio, duracion - 1)
      : sumarDias(fechaInicio, duracion - 1);
  const clases = Number(
    linea.cantidad_clases_periodo ?? linea.clases_por_mes ?? 0,
  );
  const confirmado = estadoCobro === "confirmado";
  const montoPagadoConfirmado = confirmado
    ? redondear(Math.min(Number(montoPagado || 0), Number(linea.total)))
    : 0;
  const saldoMensualidad = redondear(
    Math.max(Number(linea.total) - montoPagadoConfirmado, 0),
  );
  const estadoMensualidad = confirmado
    ? saldoMensualidad > 0.009
      ? "parcial"
      : "pagada"
    : "pendiente";
  const basePlan = redondear(linea.importe - linea.descuento_importe);

  const membresia = await AlumnosMembresiasModel.create(
    {
      alumno_id: Number(alumno.id),
      plan_id: Number(linea.referencia_id),
      sede_id: Number(sedeId),
      fecha_inicio: fechaInicio,
      fecha_vencimiento: fechaVencimiento,
      estado: confirmado ? "activa" : "pendiente_pago",
      precio_lista: Number(linea.precio_unitario).toFixed(2),
      // La membresía histórica calcula precio final restando valor y porcentaje.
      // Como el drawer trabaja con descuento porcentual, no duplicamos el mismo
      // descuento también en descuento_valor.
      descuento_valor: "0.00",
      descuento_porcentaje: Number(linea.descuento_porcentaje).toFixed(2),
      precio_final: basePlan.toFixed(2),
      clases_incluidas: clases,
      clases_usadas: 0,
      clases_disponibles: clases,
      origen_alta: "administracion",
      observaciones: cambiarPlanAhora
        ? `Generada por cobro #${cobroId} | NUEVO_CICLO_CAMBIO_PLAN desde membresía #${membresiaVigente.id}`
        : renovarAhoraPorCuposAgotados
          ? `Generada por cobro #${cobroId} | NUEVO_CICLO_CUPOS_AGOTADOS desde membresía #${membresiaVigente.id}`
          : `Generada por cobro #${cobroId}`,
    },
    { transaction },
  );

  const fechaBase = new Date(`${fechaInicio}T00:00:00Z`);
  const mensualidad = await PagosMensualidadesModel.create(
    {
      alumno_id: Number(alumno.id),
      membresia_id: Number(membresia.id),
      sede_id: Number(sedeId),
      periodo_anio: fechaBase.getUTCFullYear(),
      periodo_mes: fechaBase.getUTCMonth() + 1,
      periodo_desde: fechaInicio,
      periodo_hasta: fechaVencimiento,
      fecha_emision: hoy,
      fecha_vencimiento: fechaVencimiento,
      monto_total: Number(linea.total).toFixed(2),
      monto_pagado: montoPagadoConfirmado.toFixed(2),
      saldo: confirmado
        ? saldoMensualidad.toFixed(2)
        : Number(linea.total).toFixed(2),
      estado: estadoMensualidad,
      observaciones: cambiarPlanAhora
        ? `Generada por cobro #${cobroId} | Cambio de plan inmediato desde membresía #${membresiaVigente.id}`
        : renovarAhoraPorCuposAgotados
          ? `Generada por cobro #${cobroId} | Nuevo ciclo inmediato por cupos agotados desde membresía #${membresiaVigente.id}`
          : `Generada por cobro #${cobroId}`,
    },
    { transaction },
  );

  // Renovar sin cupos o elegir un plan distinto reemplaza el ciclo operativo.
  // Los periodos anteriores conservan pagos, asistencias y trazabilidad, pero
  // dejan de competir como membresia actual.
  if (confirmado && iniciarCicloAhora) {
    const membresiasReemplazadas = cambiarPlanAhora
      ? await AlumnosMembresiasModel.findAll({
          where: {
            id: { [Op.ne]: Number(membresia.id) },
            alumno_id: Number(alumno.id),
            estado: { [Op.in]: ["activa", "pendiente_pago", "congelada"] },
          },
          transaction,
          lock: transaction.LOCK.UPDATE,
        })
      : membresiasOperativas;

    for (const membresiaAnterior of membresiasReemplazadas) {
      if (Number(membresiaAnterior.id) === Number(membresia.id)) continue;
      const observacionesAnteriores = String(
        membresiaAnterior.observaciones || "",
      ).trim();
      await membresiaAnterior.update(
        {
          estado: cambiarPlanAhora ? "cancelada" : "vencida",
          ...(cambiarPlanAhora ? { clases_disponibles: 0 } : {}),
          observaciones: `${observacionesAnteriores}${
            observacionesAnteriores ? " | " : ""
          }${
            cambiarPlanAhora
              ? `Reemplazada por cambio de plan del cobro #${cobroId}`
              : `Cerrada por nuevo ciclo inmediato del cobro #${cobroId}`
          }`,
          updated_at: new Date(),
        },
        { transaction },
      );
    }
  }

  const pago = await PagosModel.create(
    {
      mensualidad_id: Number(mensualidad.id),
      alumno_id: Number(alumno.id),
      sede_id: Number(sedeId),
      medio_pago_id: Number(medioPagoId),
      usuario_registro_id: Number(usuarioId),
      usuario_validacion_id: confirmado ? Number(usuarioId) : null,
      fecha_pago: new Date(),
      monto: Number(montoPagado).toFixed(2),
      estado: confirmado ? "confirmado" : "pendiente_validacion",
      referencia: `COBRO-${cobroId}`,
      observaciones: `Pago de plan generado por cobro #${cobroId}`,
    },
    { transaction },
  );

  // La normalizacion es deliberadamente no destructiva: ninguna reserva ni
  // cobro adelanta periodos futuros sin una accion administrativa explicita.
  if (confirmado) {
    await normalizarCicloMembresiasAlumno({
      alumnoId: alumno.id,
      fechaReferencia: hoy,
      transaction,
    });
  }

  if (confirmado) {
    await alumno.update(
      {
        estado: "activo",
        sede_id: Number(sedeId),
        fecha_inicio: alumno.fecha_inicio || fechaInicio,
        usuario_validacion_id:
          alumno.usuario_validacion_id || Number(usuarioId),
        updated_at: new Date(),
      },
      { transaction },
    );
  } else if (!ultima || ultima.estado !== "activa") {
    await alumno.update(
      {
        estado: "pendiente_pago",
        sede_id: Number(sedeId),
        updated_at: new Date(),
      },
      { transaction },
    );
  }

  return { membresia, mensualidad, pago };
};

const descontarStock = async ({
  linea,
  detalleId,
  sedeId,
  usuarioId,
  transaction,
}) => {
  if (linea.tipo !== "producto" || Number(linea.controla_stock) !== 1) return;

  let stock = await ProductosStockSedesModel.findOne({
    where: {
      producto_id: Number(linea.referencia_id),
      sede_id: Number(sedeId),
      activo: 1,
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!stock && Number(linea.permite_stock_negativo) === 1) {
    stock = await ProductosStockSedesModel.create(
      {
        producto_id: Number(linea.referencia_id),
        sede_id: Number(sedeId),
        cantidad_actual: 0,
        cantidad_reservada: 0,
        activo: 1,
      },
      { transaction },
    );
  }
  if (!stock)
    throw new CobroOperacionError(
      `No hay stock configurado para ${linea.nombre}.`,
      409,
      "STOCK_NO_CONFIGURADO",
    );

  const actual = Number(stock.cantidad_actual || 0);
  const reservado = Number(stock.cantidad_reservada || 0);
  const disponible = actual - reservado;
  if (
    Number(linea.permite_stock_negativo) !== 1 &&
    disponible < Number(linea.cantidad)
  ) {
    throw new CobroOperacionError(
      `Stock insuficiente para ${linea.nombre}. Disponible: ${disponible}.`,
      409,
      "STOCK_INSUFICIENTE",
    );
  }

  const nuevo = actual - Number(linea.cantidad);
  await stock.update(
    { cantidad_actual: nuevo, updated_at: new Date() },
    { transaction },
  );
  await ProductosStockMovimientosModel.create(
    {
      stock_sede_id: Number(stock.id),
      producto_id: Number(linea.referencia_id),
      sede_id: Number(sedeId),
      usuario_id: Number(usuarioId),
      tipo: "egreso_venta",
      cantidad: Number(linea.cantidad),
      stock_anterior: actual,
      stock_nuevo: nuevo,
      referencia_tipo: "cobro_detalle",
      referencia_id: Number(detalleId),
      motivo: "Venta confirmada desde Nuevo Cobro",
    },
    { transaction },
  );
};

export const registrarCobro = async ({ payload, usuario }) => {
  const transaction = await db.transaction();

  try {
    const sedeId = Number(payload.sede_id);
    const usuarioId = Number(usuario?.id || usuario?.usuario_id);
    const cobradorUsuarioId = Number(payload.cobrador_usuario_id || usuarioId);
    const idempotencyKey = String(payload.idempotency_key || "").trim();
    const clienteTipo = payload.cliente_tipo;

    if (!idValido(sedeId) || !idValido(usuarioId))
      throw new CobroOperacionError("Sede o usuario inválido.");
    if (!idValido(payload.caja_sesion_id))
      throw new CobroOperacionError("Debe indicar una sesión de caja válida.");
    if (!idValido(cobradorUsuarioId))
      throw new CobroOperacionError("Debe indicar el empleado cobrador.");
    if (idempotencyKey.length < 12 || idempotencyKey.length > 100) {
      throw new CobroOperacionError("La clave de idempotencia no es válida.");
    }

    const existente = await CobrosModel.findOne({
      where: { idempotency_key: idempotencyKey },
      include: incluirCobroCompleto,
      transaction,
    });
    if (existente) {
      await transaction.commit();
      return { cobro: existente, repetido: true };
    }

    const sesion = await CajasSesionesModel.findOne({
      where: {
        id: Number(payload.caja_sesion_id),
        sede_id: sedeId,
        estado: "abierta",
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!sesion)
      throw new CobroOperacionError(
        "No hay una caja abierta válida para registrar el cobro.",
        409,
        "CAJA_CERRADA",
      );

    const { alumno } = await validarCliente({
      clienteTipo,
      alumnoId: payload.alumno_id,
      clienteUsuarioId: payload.cliente_usuario_id,
      cobradorUsuarioId,
      transaction,
    });

    const conceptos = await resolverConceptos({
      conceptos: payload.conceptos,
      sedeId,
      transaction,
    });
    const lineaPlan = conceptos.find((item) => item.tipo === "plan");
    if (lineaPlan && clienteTipo !== "alumno") {
      throw new CobroOperacionError(
        "Para cobrar un plan debe seleccionar un alumno.",
      );
    }
    const resumen = conceptos.reduce(
      (acc, item) => ({
        importe: redondear(acc.importe + item.importe),
        descuentos: redondear(acc.descuentos + item.descuento_importe),
        impuestos: redondear(acc.impuestos + item.impuesto_importe),
        total: redondear(acc.total + item.total),
      }),
      { importe: 0, descuentos: 0, impuestos: 0, total: 0 },
    );
    if (resumen.total <= 0)
      throw new CobroOperacionError(
        "El total del cobro debe ser mayor a cero.",
      );

    const pagosResueltos = await resolverPagos({
      pagos: payload.pagos,
      total: resumen.total,
      transaction,
    });
    const pagos = pagosResueltos.pagos;
    const totalPagado = pagosResueltos.totalPagado;
    const esPagoParcial = totalPagado + 0.009 < resumen.total;
    const solicitaPagoParcial =
      payload.pago_parcial === true || Number(payload.pago_parcial) === 1;

    if (esPagoParcial) {
      if (!solicitaPagoParcial) {
        throw new CobroOperacionError(
          "La suma de los medios de pago debe coincidir con el total del cobro.",
        );
      }
      if (conceptos.length !== 1 || !lineaPlan) {
        throw new CobroOperacionError(
          "El pago parcial solo está disponible cuando el cobro contiene un único plan.",
          409,
          "PAGO_PARCIAL_NO_PERMITIDO",
        );
      }
    }
    const consumoSaldo = await prepararConsumoSaldo({
      pagos,
      alumnoId: alumno?.id,
      transaction,
    });
    const estadoCobro = pagos.some(
      (item) => Number(item.medio.requiere_validacion) === 1,
    )
      ? "pendiente_validacion"
      : "confirmado";

    const cobro = await CobrosModel.create(
      {
        idempotency_key: idempotencyKey,
        sede_id: sedeId,
        caja_sesion_id: Number(sesion.id),
        cliente_tipo: clienteTipo,
        alumno_id: clienteTipo === "alumno" ? Number(payload.alumno_id) : null,
        cliente_usuario_id:
          clienteTipo === "empleado"
            ? Number(payload.cliente_usuario_id)
            : null,
        cobrador_usuario_id: cobradorUsuarioId,
        usuario_registro_id: usuarioId,
        fecha_cobro: new Date(),
        moneda: "ARS",
        importe: resumen.importe.toFixed(2),
        descuentos: resumen.descuentos.toFixed(2),
        impuestos: resumen.impuestos.toFixed(2),
        total: resumen.total.toFixed(2),
        estado: estadoCobro,
        observaciones: esPagoParcial
          ? [
              payload.observaciones,
              `Pago parcial ${totalPagado.toFixed(2)}; deuda ${redondear(
                resumen.total - totalPagado,
              ).toFixed(2)}`,
            ]
              .filter(Boolean)
              .join(" | ")
          : payload.observaciones || null,
      },
      { transaction },
    );

    const pagosCreados = [];
    for (const item of pagos) {
      pagosCreados.push(
        await CobrosPagosModel.create(
          {
            cobro_id: Number(cobro.id),
            medio_pago_id: item.medio_pago_id,
            monto: item.monto.toFixed(2),
            estado: estadoCobro,
            referencia: item.referencia,
            comprobante_url: item.comprobante_url,
          },
          { transaction },
        ),
      );
    }

    await aplicarConsumoSaldo({
      consumo: consumoSaldo,
      alumnoId: alumno?.id,
      sedeId,
      usuarioId,
      cobroId: cobro.id,
      transaction,
    });

    let pagoPlan = null;
    const medioPagoPlan =
      pagos.find((item) => !item.es_saldo_favor) || pagos[0];
    for (const linea of conceptos) {
      const detalle = await CobrosDetallesModel.create(
        {
          cobro_id: Number(cobro.id),
          tipo: linea.tipo,
          referencia_id: linea.referencia_id,
          nombre_snapshot: linea.nombre,
          categoria_snapshot: linea.categoria_nombre || null,
          cantidad: linea.cantidad,
          precio_catalogo: linea.precio_catalogo.toFixed(2),
          precio_unitario: linea.precio_unitario.toFixed(2),
          descuento_porcentaje: linea.descuento_porcentaje.toFixed(2),
          descuento_importe: linea.descuento_importe.toFixed(2),
          impuesto_porcentaje: linea.impuesto_porcentaje.toFixed(2),
          impuesto_importe: linea.impuesto_importe.toFixed(2),
          importe: linea.importe.toFixed(2),
          total: linea.total.toFixed(2),
        },
        { transaction },
      );

      if (linea.tipo === "plan") {
        const resultadoPlan = await crearMembresiaPlan({
          alumno,
          sedeId,
          linea,
          estadoCobro,
          montoPagado: totalPagado,
          medioPagoId: medioPagoPlan.medio_pago_id,
          usuarioId,
          cobroId: cobro.id,
          transaction,
        });
        pagoPlan = resultadoPlan.pago;
        await detalle.update(
          {
            membresia_id: Number(resultadoPlan.membresia.id),
            mensualidad_id: Number(resultadoPlan.mensualidad.id),
            pago_id: Number(resultadoPlan.pago.id),
          },
          { transaction },
        );
      }

      if (estadoCobro === "confirmado") {
        await descontarStock({
          linea,
          detalleId: detalle.id,
          sedeId,
          usuarioId,
          transaction,
        });
      }
    }

    if (estadoCobro === "confirmado") {
      const esCobroExclusivoDePlan =
        conceptos.length === 1 && Boolean(pagoPlan);
      const movimientoFinanciero = await FinanzasMovimientosModel.create(
        {
          sede_id: sedeId,
          categoria_id: null,
          pago_id: esCobroExclusivoDePlan ? Number(pagoPlan.id) : null,
          tipo: "ingreso",
          fecha: fechaArgentina(),
          descripcion: `Cobro #${cobro.id}`,
          monto: totalPagado.toFixed(2),
          origen: esCobroExclusivoDePlan ? "pago_alumno" : "manual",
          referencia: `COBRO-${cobro.id}`,
          usuario_registro_id: usuarioId,
          estado: "vigente",
          observaciones: payload.observaciones || "Generado desde Nuevo Cobro",
        },
        { transaction },
      );
      await cobro.update(
        { finanzas_movimiento_id: Number(movimientoFinanciero.id) },
        { transaction },
      );

      for (let indice = 0; indice < pagosCreados.length; indice += 1) {
        if (pagos[indice].es_saldo_favor || !pagos[indice].impacta_caja) continue;
        await CajasMovimientosModel.create(
          {
            caja_sesion_id: Number(sesion.id),
            caja_id: Number(sesion.caja_id),
            sede_id: sedeId,
            cobro_pago_id: Number(pagosCreados[indice].id),
            medio_pago_id: Number(pagos[indice].medio_pago_id),
            usuario_registro_id: usuarioId,
            tipo: "ingreso",
            origen: "cobro",
            fecha_movimiento: new Date(),
            monto: Number(pagos[indice].monto).toFixed(2),
            descripcion: `Cobro #${cobro.id}`,
            estado: "vigente",
            referencia: `COBRO-${cobro.id}`,
          },
          { transaction },
        );
      }
    }

    await transaction.commit();
    const completo = await CobrosModel.findByPk(cobro.id, {
      include: incluirCobroCompleto,
    });
    return { cobro: completo, repetido: false };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();

    if (error?.name === "SequelizeUniqueConstraintError") {
      const existente = await CobrosModel.findOne({
        where: {
          idempotency_key: String(payload.idempotency_key || "").trim(),
        },
        include: incluirCobroCompleto,
      });
      if (existente) return { cobro: existente, repetido: true };
    }
    throw error;
  }
};

const obtenerUsuarioId = (usuario) =>
  Number(usuario?.id || usuario?.usuario_id);

const cargarCobroBloqueado = async ({ cobroId, sedeId, transaction }) => {
  if (!idValido(cobroId) || !idValido(sedeId)) {
    throw new CobroOperacionError("Cobro o sede inválidos.");
  }

  const cobro = await CobrosModel.findOne({
    where: { id: Number(cobroId), sede_id: Number(sedeId) },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!cobro)
    throw new CobroOperacionError(
      "No se encontró el cobro.",
      404,
      "COBRO_NO_ENCONTRADO",
    );
  return cobro;
};

const aplicarPlanPendiente = async ({ detalle, usuarioId, transaction }) => {
  if (detalle.tipo !== "plan") return null;

  const [membresia, mensualidad, pago] = await Promise.all([
    detalle.membresia_id
      ? AlumnosMembresiasModel.findByPk(detalle.membresia_id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        })
      : null,
    detalle.mensualidad_id
      ? PagosMensualidadesModel.findByPk(detalle.mensualidad_id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        })
      : null,
    detalle.pago_id
      ? PagosModel.findByPk(detalle.pago_id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        })
      : null,
  ]);

  if (!membresia || !mensualidad || !pago) {
    throw new CobroOperacionError(
      "El cobro pendiente no conserva todos los registros del plan.",
      409,
      "PLAN_INCOMPLETO",
    );
  }

  const observacionesMembresia = String(membresia.observaciones || "");
  const esNuevoCicloPorCupos = observacionesMembresia.includes(
    "NUEVO_CICLO_CUPOS_AGOTADOS",
  );
  const esNuevoCicloPorCambioPlan = observacionesMembresia.includes(
    "NUEVO_CICLO_CAMBIO_PLAN",
  );

  if (esNuevoCicloPorCambioPlan) {
    await validarSinReservasFuturasParaCambioPlan({
      alumnoId: membresia.alumno_id,
      transaction,
    });
  }

  if (esNuevoCicloPorCupos || esNuevoCicloPorCambioPlan) {
    const whereMembresiasAnteriores = esNuevoCicloPorCambioPlan
      ? {
          id: { [Op.ne]: Number(membresia.id) },
          alumno_id: Number(membresia.alumno_id),
          estado: { [Op.in]: ["activa", "pendiente_pago", "congelada"] },
        }
      : {
          id: { [Op.ne]: Number(membresia.id) },
          alumno_id: Number(membresia.alumno_id),
          estado: "activa",
          fecha_inicio: { [Op.lte]: membresia.fecha_inicio },
          fecha_vencimiento: { [Op.gte]: membresia.fecha_inicio },
        };
    const membresiasAnteriores = await AlumnosMembresiasModel.findAll({
      where: whereMembresiasAnteriores,
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    for (const membresiaAnterior of membresiasAnteriores) {
      const observacionesAnteriores = String(
        membresiaAnterior.observaciones || "",
      ).trim();
      await membresiaAnterior.update(
        {
          estado: esNuevoCicloPorCambioPlan ? "cancelada" : "vencida",
          ...(esNuevoCicloPorCambioPlan ? { clases_disponibles: 0 } : {}),
          observaciones: `${observacionesAnteriores}${
            observacionesAnteriores ? " | " : ""
          }${
            esNuevoCicloPorCambioPlan
              ? `Reemplazada al confirmar cambio de plan del cobro #${detalle.cobro_id}`
              : `Cerrada al confirmar nuevo ciclo del cobro #${detalle.cobro_id}`
          }`,
          updated_at: new Date(),
        },
        { transaction },
      );
    }
  }

  await membresia.update(
    { estado: "activa", updated_at: new Date() },
    { transaction },
  );
  const montoTotal = Number(mensualidad.monto_total || 0);
  const montoPagado = redondear(
    Math.min(Number(pago.monto || 0), montoTotal),
  );
  const saldoPendiente = redondear(Math.max(montoTotal - montoPagado, 0));
  await mensualidad.update(
    {
      monto_pagado: montoPagado.toFixed(2),
      saldo: saldoPendiente.toFixed(2),
      estado: saldoPendiente > 0.009 ? "parcial" : "pagada",
      updated_at: new Date(),
    },
    { transaction },
  );
  await pago.update(
    {
      estado: "confirmado",
      usuario_validacion_id: Number(usuarioId),
      updated_at: new Date(),
    },
    { transaction },
  );

  const alumno = await AlumnosModel.findByPk(mensualidad.alumno_id, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (alumno && !["baja", "congelado"].includes(alumno.estado)) {
    await alumno.update(
      {
        estado: "activo",
        sede_id: Number(membresia.sede_id),
        fecha_inicio: alumno.fecha_inicio || membresia.fecha_inicio,
        usuario_validacion_id:
          alumno.usuario_validacion_id || Number(usuarioId),
        updated_at: new Date(),
      },
      { transaction },
    );
  }

  return pago;
};

const aplicarStockPendiente = async ({
  detalle,
  sedeId,
  usuarioId,
  transaction,
}) => {
  if (detalle.tipo !== "producto") return;
  const producto = await ProductosModel.findByPk(detalle.referencia_id, {
    transaction,
  });
  if (!producto || Number(producto.activo) !== 1) {
    throw new CobroOperacionError(
      `El producto ${detalle.nombre_snapshot} ya no está disponible.`,
      409,
    );
  }

  await descontarStock({
    linea: {
      tipo: "producto",
      referencia_id: Number(detalle.referencia_id),
      cantidad: Number(detalle.cantidad),
      nombre: detalle.nombre_snapshot,
      controla_stock: producto.controla_stock,
      permite_stock_negativo: producto.permite_stock_negativo,
    },
    detalleId: detalle.id,
    sedeId,
    usuarioId,
    transaction,
  });
};

export const confirmarCobroPendiente = async ({
  cobroId,
  sedeId,
  cajaSesionId,
  usuario,
  observaciones,
}) => {
  const transaction = await db.transaction();
  try {
    const usuarioId = obtenerUsuarioId(usuario);
    if (!idValido(usuarioId))
      throw new CobroOperacionError("No se pudo identificar al usuario.", 401);

    const cobro = await cargarCobroBloqueado({ cobroId, sedeId, transaction });
    if (cobro.estado === "confirmado") {
      await transaction.commit();
      return { cobro, repetido: true };
    }
    if (cobro.estado !== "pendiente_validacion") {
      throw new CobroOperacionError(
        "El cobro ya no está pendiente de validación.",
        409,
        "ESTADO_COBRO_INVALIDO",
      );
    }

    const sesion = await CajasSesionesModel.findOne({
      where: {
        id: Number(cajaSesionId),
        sede_id: Number(sedeId),
        estado: "abierta",
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!sesion)
      throw new CobroOperacionError(
        "Debe existir una caja abierta para confirmar el cobro.",
        409,
        "CAJA_CERRADA",
      );

    const detalles = await CobrosDetallesModel.findAll({
      where: { cobro_id: Number(cobro.id) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const pagosCobro = await CobrosPagosModel.findAll({
      where: { cobro_id: Number(cobro.id), estado: "pendiente_validacion" },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (pagosCobro.length === 0) {
      throw new CobroOperacionError(
        "El cobro no tiene pagos pendientes.",
        409,
        "PAGO_PENDIENTE_NO_ENCONTRADO",
      );
    }
    const totalPagado = redondear(
      pagosCobro.reduce(
        (acumulado, pagoCobro) =>
          acumulado + Number(pagoCobro.monto || 0),
        0,
      ),
    );

    let pagoPlan = null;
    for (const detalle of detalles) {
      const pagoAplicado = await aplicarPlanPendiente({
        detalle,
        usuarioId,
        transaction,
      });
      if (pagoAplicado) pagoPlan = pagoAplicado;
      await aplicarStockPendiente({
        detalle,
        sedeId: Number(sedeId),
        usuarioId,
        transaction,
      });
    }

    const esCobroExclusivoDePlan = detalles.length === 1 && Boolean(pagoPlan);
    const movimientoFinanciero = await FinanzasMovimientosModel.create(
      {
        sede_id: Number(sedeId),
        categoria_id: null,
        pago_id: esCobroExclusivoDePlan ? Number(pagoPlan.id) : null,
        tipo: "ingreso",
        fecha: fechaArgentina(),
        descripcion: `Cobro #${cobro.id} validado`,
        monto: totalPagado.toFixed(2),
        origen: esCobroExclusivoDePlan ? "pago_alumno" : "manual",
        referencia: `COBRO-${cobro.id}`,
        usuario_registro_id: usuarioId,
        estado: "vigente",
        observaciones: observaciones || "Confirmado desde historial de cobros",
      },
      { transaction },
    );

    for (const pagoCobro of pagosCobro) {
      await pagoCobro.update(
        {
          estado: "confirmado",
          usuario_validacion_id: usuarioId,
          fecha_validacion: new Date(),
          observaciones_validacion: observaciones || null,
          updated_at: new Date(),
        },
        { transaction },
      );
      const medioPago = await PagosMediosPagoModel.findByPk(
        Number(pagoCobro.medio_pago_id),
        { transaction },
      );
      if (Number(medioPago?.impacta_caja) !== 1) continue;
      await CajasMovimientosModel.create(
        {
          caja_sesion_id: Number(sesion.id),
          caja_id: Number(sesion.caja_id),
          sede_id: Number(sedeId),
          cobro_pago_id: Number(pagoCobro.id),
          medio_pago_id: Number(pagoCobro.medio_pago_id),
          usuario_registro_id: usuarioId,
          tipo: "ingreso",
          origen: "cobro",
          fecha_movimiento: new Date(),
          monto: Number(pagoCobro.monto).toFixed(2),
          descripcion: `Cobro #${cobro.id} validado`,
          estado: "vigente",
          referencia: `COBRO-${cobro.id}`,
        },
        { transaction },
      );
    }

    await cobro.update(
      {
        estado: "confirmado",
        finanzas_movimiento_id: Number(movimientoFinanciero.id),
        updated_at: new Date(),
      },
      { transaction },
    );
    await transaction.commit();

    return {
      cobro: await CobrosModel.findByPk(cobro.id, {
        include: incluirCobroCompleto,
      }),
      repetido: false,
    };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

export const rechazarCobroPendiente = async ({
  cobroId,
  sedeId,
  usuario,
  motivo,
}) => {
  const transaction = await db.transaction();
  try {
    const usuarioId = obtenerUsuarioId(usuario);
    const motivoLimpio = String(motivo || "").trim();
    if (!idValido(usuarioId))
      throw new CobroOperacionError("No se pudo identificar al usuario.", 401);
    if (motivoLimpio.length < 3)
      throw new CobroOperacionError("Debe indicar el motivo del rechazo.");

    const cobro = await cargarCobroBloqueado({ cobroId, sedeId, transaction });
    if (cobro.estado === "rechazado") {
      await transaction.commit();
      return { cobro, repetido: true };
    }
    if (cobro.estado !== "pendiente_validacion") {
      throw new CobroOperacionError(
        "Solo pueden rechazarse cobros pendientes.",
        409,
        "ESTADO_COBRO_INVALIDO",
      );
    }

    const detalles = await CobrosDetallesModel.findAll({
      where: { cobro_id: Number(cobro.id) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const pagosCobro = await CobrosPagosModel.findAll({
      where: { cobro_id: Number(cobro.id) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    for (const detalle of detalles) {
      if (detalle.tipo !== "plan") continue;
      if (detalle.membresia_id) {
        await AlumnosMembresiasModel.update(
          {
            estado: "cancelada",
            clases_disponibles: 0,
            updated_at: new Date(),
          },
          { where: { id: detalle.membresia_id }, transaction },
        );
      }
      if (detalle.mensualidad_id) {
        await PagosMensualidadesModel.update(
          {
            estado: "anulada",
            monto_pagado: "0.00",
            saldo: "0.00",
            updated_at: new Date(),
          },
          { where: { id: detalle.mensualidad_id }, transaction },
        );
      }
      if (detalle.pago_id) {
        await PagosModel.update(
          {
            estado: "rechazado",
            usuario_validacion_id: usuarioId,
            observaciones: motivoLimpio,
            updated_at: new Date(),
          },
          { where: { id: detalle.pago_id }, transaction },
        );
      }
    }

    for (const pagoCobro of pagosCobro) {
      await pagoCobro.update(
        {
          estado: "rechazado",
          usuario_validacion_id: usuarioId,
          fecha_validacion: new Date(),
          observaciones_validacion: motivoLimpio,
          updated_at: new Date(),
        },
        { transaction },
      );
    }
    await cobro.update(
      { estado: "rechazado", updated_at: new Date() },
      { transaction },
    );

    if (cobro.alumno_id) {
      const hoy = fechaArgentina();
      const vigente = await AlumnosMembresiasModel.findOne({
        where: {
          alumno_id: Number(cobro.alumno_id),
          estado: "activa",
          fecha_inicio: { [Op.lte]: hoy },
          fecha_vencimiento: { [Op.gte]: hoy },
        },
        transaction,
      });
      const alumno = await AlumnosModel.findByPk(cobro.alumno_id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (alumno && !["baja", "congelado"].includes(alumno.estado)) {
        await alumno.update(
          {
            estado: vigente ? "activo" : "pendiente_pago",
            updated_at: new Date(),
          },
          { transaction },
        );
      }
    }

    await transaction.commit();
    return {
      cobro: await CobrosModel.findByPk(cobro.id, {
        include: incluirCobroCompleto,
      }),
      repetido: false,
    };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

const validarYRevertirPlan = async ({
  detalle,
  motivo,
  usuarioId,
  transaction,
}) => {
  if (detalle.tipo !== "plan") return;

  const membresia = detalle.membresia_id
    ? await AlumnosMembresiasModel.findByPk(detalle.membresia_id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      })
    : null;
  const mensualidad = detalle.mensualidad_id
    ? await PagosMensualidadesModel.findByPk(detalle.mensualidad_id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      })
    : null;
  const pago = detalle.pago_id
    ? await PagosModel.findByPk(detalle.pago_id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      })
    : null;

  if (!membresia || !mensualidad || !pago) {
    throw new CobroOperacionError(
      "El cobro no conserva todos los registros del plan y no puede anularse automáticamente.",
      409,
      "PLAN_INCOMPLETO",
    );
  }

  if (Number(membresia.clases_usadas || 0) > 0) {
    throw new CobroOperacionError(
      "La membresía ya tiene clases consumidas. Regularizá esas asistencias antes de anular el cobro.",
      409,
      "MEMBRESIA_CON_USO",
    );
  }

  const asistencias = await db.query(
    "SELECT COUNT(*) AS cantidad FROM alumnos_asistencias WHERE membresia_id = :membresiaId",
    {
      replacements: { membresiaId: Number(membresia.id) },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
  if (Number(asistencias[0]?.cantidad || 0) > 0) {
    throw new CobroOperacionError(
      "La membresía tiene asistencias registradas. Regularizalas antes de anular el cobro.",
      409,
      "MEMBRESIA_CON_ASISTENCIAS",
    );
  }

  const nota = `Anulado por usuario #${usuarioId}: ${motivo}`;
  await membresia.update(
    {
      estado: "cancelada",
      clases_disponibles: 0,
      observaciones: [membresia.observaciones, nota]
        .filter(Boolean)
        .join(" | "),
      updated_at: new Date(),
    },
    { transaction },
  );
  await mensualidad.update(
    {
      estado: "anulada",
      monto_pagado: "0.00",
      saldo: "0.00",
      observaciones: [mensualidad.observaciones, nota]
        .filter(Boolean)
        .join(" | "),
      updated_at: new Date(),
    },
    { transaction },
  );
  await pago.update(
    {
      estado: "anulado",
      observaciones: [pago.observaciones, nota].filter(Boolean).join(" | "),
      updated_at: new Date(),
    },
    { transaction },
  );
};

const devolverStockCobro = async ({
  detalle,
  sedeId,
  usuarioId,
  motivo,
  transaction,
}) => {
  if (detalle.tipo !== "producto") return;

  const salidaOriginal = await ProductosStockMovimientosModel.findOne({
    where: {
      referencia_tipo: "cobro_detalle",
      referencia_id: Number(detalle.id),
      tipo: "egreso_venta",
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!salidaOriginal) return;

  const stock = await ProductosStockSedesModel.findByPk(
    salidaOriginal.stock_sede_id,
    {
      transaction,
      lock: transaction.LOCK.UPDATE,
    },
  );
  if (!stock) {
    throw new CobroOperacionError(
      `No se encontró el depósito de stock usado para ${detalle.nombre_snapshot}.`,
      409,
      "STOCK_NO_CONFIGURADO",
    );
  }

  const anterior = Number(stock.cantidad_actual || 0);
  const cantidad = Number(detalle.cantidad || 0);
  const nuevo = anterior + cantidad;
  await stock.update(
    { cantidad_actual: nuevo, updated_at: new Date() },
    { transaction },
  );
  await ProductosStockMovimientosModel.create(
    {
      stock_sede_id: Number(stock.id),
      producto_id: Number(detalle.referencia_id),
      sede_id: Number(sedeId),
      usuario_id: Number(usuarioId),
      tipo: "devolucion",
      cantidad,
      stock_anterior: anterior,
      stock_nuevo: nuevo,
      referencia_tipo: "cobro_anulacion",
      referencia_id: Number(detalle.id),
      motivo: `Anulación de cobro: ${motivo}`,
    },
    { transaction },
  );
};

const devolverSaldoCobro = async ({
  cobro,
  pagoCobro,
  sedeId,
  usuarioId,
  motivo,
  transaction,
}) => {
  if (!idValido(cobro.alumno_id)) {
    throw new CobroOperacionError(
      "El cobro no conserva el alumno necesario para devolver el saldo.",
      409,
      "SALDO_SIN_ALUMNO",
    );
  }
  const cuenta = await AlumnosSaldosModel.findOne({
    where: { alumno_id: Number(cobro.alumno_id) },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!cuenta) {
    throw new CobroOperacionError(
      "No se encontró la cuenta de saldo utilizada por el cobro.",
      409,
      "CUENTA_SALDO_NO_ENCONTRADA",
    );
  }
  const saldoAnterior = Number(cuenta.saldo || 0);
  const monto = Number(pagoCobro.monto || 0);
  const saldoNuevo = redondear(saldoAnterior + monto);
  await cuenta.update(
    { saldo: saldoNuevo.toFixed(2), updated_at: new Date() },
    { transaction },
  );
  await AlumnosSaldosMovimientosModel.create(
    {
      saldo_id: Number(cuenta.id),
      alumno_id: Number(cobro.alumno_id),
      sede_id: Number(sedeId),
      usuario_id: Number(usuarioId),
      tipo: "credito",
      origen: "reversion",
      monto: monto.toFixed(2),
      saldo_anterior: saldoAnterior.toFixed(2),
      saldo_nuevo: saldoNuevo.toFixed(2),
      cobro_id: Number(cobro.id),
      bonificacion_id: null,
      referencia: `ANULACION-COBRO-${cobro.id}`,
      motivo: `Devolución de saldo por anulación: ${motivo}`,
    },
    { transaction },
  );
};

const actualizarEstadoAlumnoTrasAnulacion = async ({
  alumnoId,
  transaction,
}) => {
  if (!idValido(alumnoId)) return;
  const alumno = await AlumnosModel.findByPk(Number(alumnoId), {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!alumno || ["baja", "congelado"].includes(alumno.estado)) return;

  const hoy = fechaArgentina();
  const membresiaVigente = await AlumnosMembresiasModel.findOne({
    where: {
      alumno_id: Number(alumnoId),
      estado: "activa",
      fecha_inicio: { [Op.lte]: hoy },
      fecha_vencimiento: { [Op.gte]: hoy },
    },
    transaction,
  });
  await alumno.update(
    {
      estado: membresiaVigente ? "activo" : "pendiente_pago",
      updated_at: new Date(),
    },
    { transaction },
  );
};

export const anularCobroConfirmado = async ({
  cobroId,
  sedeId,
  cajaSesionId,
  usuario,
  motivo,
}) => {
  const transaction = await db.transaction();
  try {
    const usuarioId = obtenerUsuarioId(usuario);
    const motivoLimpio = String(motivo || "").trim();
    if (!idValido(usuarioId))
      throw new CobroOperacionError("No se pudo identificar al usuario.", 401);
    if (motivoLimpio.length < 3)
      throw new CobroOperacionError("Debe indicar el motivo de la anulación.");
    if (motivoLimpio.length > 500)
      throw new CobroOperacionError(
        "El motivo no puede superar los 500 caracteres.",
      );

    const cobro = await cargarCobroBloqueado({ cobroId, sedeId, transaction });
    if (cobro.estado === "anulado") {
      await transaction.commit();
      return { cobro, repetido: true };
    }
    if (cobro.estado !== "confirmado") {
      throw new CobroOperacionError(
        "Solo pueden anularse cobros confirmados.",
        409,
        "ESTADO_COBRO_INVALIDO",
      );
    }

    const sesion = await CajasSesionesModel.findOne({
      where: {
        id: Number(cajaSesionId),
        sede_id: Number(sedeId),
        estado: "abierta",
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!sesion) {
      throw new CobroOperacionError(
        "Debe existir una caja abierta para registrar la reversión.",
        409,
        "CAJA_CERRADA",
      );
    }

    const detalles = await CobrosDetallesModel.findAll({
      where: { cobro_id: Number(cobro.id) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const pagosCobro = await CobrosPagosModel.findAll({
      where: { cobro_id: Number(cobro.id) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const medioSaldo = await PagosMediosPagoModel.findOne({
      where: { codigo: CODIGO_SALDO_FAVOR },
      transaction,
    });
    if (
      pagosCobro.length === 0 ||
      pagosCobro.some((pago) => pago.estado !== "confirmado")
    ) {
      throw new CobroOperacionError(
        "Los medios de pago no están íntegramente confirmados.",
        409,
        "PAGOS_COBRO_INCONSISTENTES",
      );
    }
    const totalPagadoCobro = redondear(
      pagosCobro.reduce(
        (acumulado, pagoCobro) =>
          acumulado + Number(pagoCobro.monto || 0),
        0,
      ),
    );

    for (const detalle of detalles) {
      await validarYRevertirPlan({
        detalle,
        motivo: motivoLimpio,
        usuarioId,
        transaction,
      });
      await devolverStockCobro({
        detalle,
        sedeId: Number(sedeId),
        usuarioId,
        motivo: motivoLimpio,
        transaction,
      });
    }

    const movimientoReversion = await FinanzasMovimientosModel.create(
      {
        sede_id: Number(sedeId),
        categoria_id: null,
        pago_id: null,
        tipo: "egreso",
        fecha: fechaArgentina(),
        descripcion: `Anulación de cobro #${cobro.id}`,
        monto: totalPagadoCobro.toFixed(2),
        origen: "ajuste",
        referencia: `ANULACION-COBRO-${cobro.id}`,
        usuario_registro_id: usuarioId,
        estado: "vigente",
        observaciones: motivoLimpio,
      },
      { transaction },
    );

    for (const pagoCobro of pagosCobro) {
      const esSaldoFavor =
        medioSaldo && Number(pagoCobro.medio_pago_id) === Number(medioSaldo.id);
      if (esSaldoFavor) {
        await devolverSaldoCobro({
          cobro,
          pagoCobro,
          sedeId: Number(sedeId),
          usuarioId,
          motivo: motivoLimpio,
          transaction,
        });
      } else {
        const movimientoOriginal = await CajasMovimientosModel.findOne({
          where: {
            cobro_pago_id: Number(pagoCobro.id),
            origen: "cobro",
          },
          transaction,
        });
        if (!movimientoOriginal) {
          await pagoCobro.update(
            { estado: "anulado", updated_at: new Date() },
            { transaction },
          );
          continue;
        }
        await CajasMovimientosModel.create(
          {
            caja_sesion_id: Number(sesion.id),
            caja_id: Number(sesion.caja_id),
            sede_id: Number(sedeId),
            cobro_pago_id: Number(pagoCobro.id),
            medio_pago_id: Number(pagoCobro.medio_pago_id),
            usuario_registro_id: usuarioId,
            tipo: "egreso",
            origen: "reversion",
            fecha_movimiento: new Date(),
            monto: Number(pagoCobro.monto).toFixed(2),
            descripcion: `Anulación de cobro #${cobro.id}`,
            estado: "vigente",
            referencia: `ANULACION-COBRO-${cobro.id}`,
            observaciones: motivoLimpio,
          },
          { transaction },
        );
      }
      await pagoCobro.update(
        { estado: "anulado", updated_at: new Date() },
        { transaction },
      );
    }

    await actualizarEstadoAlumnoTrasAnulacion({
      alumnoId: cobro.alumno_id,
      transaction,
    });
    await cobro.update(
      {
        estado: "anulado",
        finanzas_reversion_id: Number(movimientoReversion.id),
        usuario_anulacion_id: usuarioId,
        fecha_anulacion: new Date(),
        motivo_anulacion: motivoLimpio,
        updated_at: new Date(),
      },
      { transaction },
    );

    await transaction.commit();
    return {
      cobro: await CobrosModel.findByPk(cobro.id, {
        include: incluirCobroCompleto,
      }),
      repetido: false,
    };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};
