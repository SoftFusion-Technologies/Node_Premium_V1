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
import UsuariosSaldosModel from "../../Models/Usuario/MD_TB_UsuariosSaldos.js";
import UsuariosSaldosMovimientosModel from "../../Models/Usuario/MD_TB_UsuariosSaldosMovimientos.js";
import PagosMensualidadesModel from "../../Models/Pago/MD_TB_PagosMensualidades.js";
import PagosModel from "../../Models/Pago/MD_TB_Pagos.js";
import PagosMediosPagoModel from "../../Models/Pago/MD_TB_PagosMediosPago.js";
import FinanzasMovimientosModel from "../../Models/Finanzas/MD_TB_FinanzasMovimientos.js";
import ProductosStockSedesModel from "../../Models/Catalogo/MD_TB_ProductosStockSedes.js";
import ProductosStockMovimientosModel from "../../Models/Catalogo/MD_TB_ProductosStockMovimientos.js";
import ProductosModel from "../../Models/Catalogo/MD_TB_Productos.js";
import SistemaAuditoriaLogsModel from "../../Models/Sistema/MD_TB_SistemaAuditoriaLogs.js";
import {
  calcularFechaVencimientoPlan,
  normalizarCicloMembresiasAlumno
} from "../Alumno/membresiaCiclo.service.js";
import { copiarRestriccionesPlan } from "../Agenda/agendaRestricciones.service.js";
import { imputarReservasPendientesMembresia } from "../Agenda/reservasPendientes.service.js";

const TIPOS_CONCEPTO = ["producto", "servicio", "plan", "deuda"];
const TIPOS_CLIENTE = ["alumno", "empleado", "sin_cliente"];
const CODIGO_SALDO_FAVOR = "SALDO_FAVOR";
const REFERENCIA_VUELTO_SALDO = "VUELTO-SALDO-COBRO";

const esMedioEfectivoCobro = (medio) => {
  const codigo = String(medio?.codigo || "").trim().toUpperCase();
  const tipo = String(medio?.tipo || "").trim().toLowerCase();
  const nombre = String(medio?.nombre || "").trim().toLowerCase();
  return codigo === "EFECTIVO" || tipo === "efectivo" || nombre === "efectivo";
};

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

const horaArgentina = () => {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const valores = Object.fromEntries(
    partes
      .filter((item) => item.type !== "literal")
      .map((item) => [item.type, item.value]),
  );
  return `${valores.hour}:${valores.minute}:${valores.second}`;
};

const sumarDias = (fechaDateOnly, dias) => {
  const fecha = new Date(`${fechaDateOnly}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + Number(dias));
  return fecha.toISOString().slice(0, 10);
};

const esFechaDateOnlyValida = (valor) => {
  const fecha = String(valor || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;

  const fechaUtc = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(fechaUtc.getTime()) && fechaUtc.toISOString().slice(0, 10) === fecha;
};

const esEnteroNoNegativo = (valor) => {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 0;
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

// Benjamin Orellana - 2026/08/19 - MIGRACION_RESERVAS_CAMBIO_PLAN_AUTOMATICA
// Un cambio de plan no debe obligar a cancelar/reprogramar reservas futuras.
// Las reservas realmente futuras del ciclo reemplazado se conservan dentro de
// la misma transacción. Si el nuevo plan tiene crédito, se reasignan y consumen
// un crédito nuevo; si no alcanza, la reserva permanece ocupando el turno como
// pendiente_credito para que pueda regularizarse después sin perder el lugar.
const migrarReservasFuturasCambioPlan = async ({
  membresiaAnterior,
  membresiaNueva,
  cobroId,
  transaction,
}) => {
  if (!membresiaAnterior || !membresiaNueva) {
    return { migradas: 0, pendientes: 0 };
  }

  const hoy = fechaArgentina();
  const ahora = horaArgentina();
  const reservas = await db.query(
    `SELECT r.id, r.estado_credito, r.tipo_reserva,
            t.fecha, t.hora_inicio
       FROM agenda_turnos_reservas r
       INNER JOIN agenda_turnos t ON t.id = r.turno_id
      WHERE r.alumno_id = :alumnoId
        AND r.membresia_id = :membresiaAnteriorId
        AND r.estado = 'reservada'
        AND t.estado NOT IN ('cancelado', 'bloqueado')
        AND (
          t.fecha > :hoy
          OR (t.fecha = :hoy AND t.hora_inicio > :ahora)
        )
      ORDER BY t.fecha ASC, t.hora_inicio ASC, r.id ASC`,
    {
      replacements: {
        alumnoId: Number(membresiaNueva.alumno_id),
        membresiaAnteriorId: Number(membresiaAnterior.id),
        hoy,
        ahora,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  );

  if (reservas.length === 0) {
    return { migradas: 0, pendientes: 0 };
  }

  let disponibles = Math.max(Number(membresiaNueva.clases_disponibles || 0), 0);
  let usadasNuevas = Math.max(Number(membresiaNueva.clases_usadas || 0), 0);
  let creditosRetiradosAnterior = 0;
  let migradas = 0;
  let pendientes = 0;

  for (const reserva of reservas) {
    const consumiaCreditoAnterior = String(reserva.estado_credito || '') === 'consumido';
    if (consumiaCreditoAnterior) creditosRetiradosAnterior += 1;

    const marca = `Reasignada automáticamente por cambio de plan del cobro #${cobroId} desde membresía #${membresiaAnterior.id} a #${membresiaNueva.id}`;

    if (disponibles > 0) {
      await db.query(
        `UPDATE agenda_turnos_reservas
            SET membresia_id = :membresiaNuevaId,
                tipo_reserva = 'normal',
                estado_credito = 'consumido',
                observaciones = CONCAT_WS(' | ', NULLIF(TRIM(COALESCE(observaciones, '')), ''), :marca),
                updated_at = NOW()
          WHERE id = :reservaId`,
        {
          replacements: {
            membresiaNuevaId: Number(membresiaNueva.id),
            reservaId: Number(reserva.id),
            marca,
          },
          transaction,
        },
      );
      disponibles -= 1;
      usadasNuevas += 1;
      migradas += 1;
    } else {
      await db.query(
        `UPDATE agenda_turnos_reservas
            SET membresia_id = NULL,
                tipo_reserva = 'pendiente_credito',
                estado_credito = 'pendiente',
                observaciones = CONCAT_WS(' | ', NULLIF(TRIM(COALESCE(observaciones, '')), ''), :marca),
                updated_at = NOW()
          WHERE id = :reservaId`,
        {
          replacements: {
            reservaId: Number(reserva.id),
            marca: `${marca} | Sin crédito disponible en el nuevo plan: queda pendiente de imputación`,
          },
          transaction,
        },
      );
      pendientes += 1;
    }
  }

  await membresiaNueva.update(
    {
      clases_usadas: usadasNuevas,
      clases_disponibles: disponibles,
      updated_at: new Date(),
    },
    { transaction },
  );

  if (creditosRetiradosAnterior > 0) {
    await membresiaAnterior.update(
      {
        clases_usadas: Math.max(
          0,
          Number(membresiaAnterior.clases_usadas || 0) - creditosRetiradosAnterior,
        ),
        updated_at: new Date(),
      },
      { transaction },
    );
  }

  return { migradas, pendientes };
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

const resolverConceptos = async ({
  conceptos,
  sedeId,
  alumnoId = null,
  clienteTipo = "alumno",
  clienteUsuarioId = null,
  transaction,
}) => {
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
    if (["plan", "deuda"].includes(item.tipo) && cantidad !== 1) {
      throw new CobroOperacionError(
        item.tipo === "deuda"
          ? "Cada línea de deuda debe representar una mensualidad con cantidad 1."
          : "Los planes deben cobrarse de a una membresía por operación.",
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

    if (item.tipo === "deuda") {
      // Benjamin Orellana - 2026/08/19 - Para empleados, la propia venta
      // fiada/parcial es la fuente de verdad de la deuda. Los cobros posteriores
      // de tipo deuda referencian el cobro original, sin inventar mensualidades.
      if (clienteTipo === "empleado") {
        if (!idValido(clienteUsuarioId)) {
          throw new CobroOperacionError(
            "Para saldar una deuda debe seleccionar un empleado.",
            409,
            "DEUDA_REQUIERE_EMPLEADO",
          );
        }
        if (
          Number(item.descuento_porcentaje || 0) !== 0 ||
          Number(item.impuesto_porcentaje || 0) !== 0
        ) {
          throw new CobroOperacionError(
            "Una deuda existente no admite descuentos ni impuestos al saldarla.",
            409,
            "DEUDA_SIN_AJUSTES",
          );
        }

        const rowsEmpleado = await db.query(
          `SELECT
             c.id AS cobro_origen_id,
             c.total,
             c.fecha_cobro,
             c.observaciones,
             COALESCE((
               SELECT SUM(cp0.monto)
               FROM cobros_pagos cp0
               WHERE cp0.cobro_id = c.id
                 AND cp0.estado = 'confirmado'
             ), 0) AS pago_inicial,
             COALESCE((
               SELECT SUM(cd1.total)
               FROM cobros_detalles cd1
               INNER JOIN cobros_cobros c1 ON c1.id = cd1.cobro_id
               WHERE cd1.tipo = 'deuda'
                 AND cd1.referencia_id = c.id
                 AND c1.cliente_tipo = 'empleado'
                 AND c1.cliente_usuario_id = c.cliente_usuario_id
                 AND c1.sede_id = c.sede_id
                 AND c1.estado = 'confirmado'
             ), 0) AS pagado_deuda,
             COALESCE((
               SELECT SUM(cd2.total)
               FROM cobros_detalles cd2
               INNER JOIN cobros_cobros c2 ON c2.id = cd2.cobro_id
               WHERE cd2.tipo = 'deuda'
                 AND cd2.referencia_id = c.id
                 AND c2.cliente_tipo = 'empleado'
                 AND c2.cliente_usuario_id = c.cliente_usuario_id
                 AND c2.sede_id = c.sede_id
                 AND c2.estado = 'pendiente_validacion'
             ), 0) AS monto_en_validacion
           FROM cobros_cobros c
           WHERE c.id = :cobroOrigenId
             AND c.sede_id = :sedeId
             AND c.cliente_tipo = 'empleado'
             AND c.cliente_usuario_id = :clienteUsuarioId
             AND c.estado = 'confirmado'
             AND EXISTS (
               SELECT 1 FROM cobros_detalles cd0
               WHERE cd0.cobro_id = c.id
                 AND cd0.tipo IN ('producto','servicio')
             )
           LIMIT 1`,
          {
            replacements: {
              cobroOrigenId: Number(item.referencia_id),
              sedeId: Number(sedeId),
              clienteUsuarioId: Number(clienteUsuarioId),
            },
            type: QueryTypes.SELECT,
            transaction,
          },
        );

        const deudaEmpleado = rowsEmpleado[0] || null;
        if (!deudaEmpleado) {
          throw new CobroOperacionError(
            "La deuda seleccionada ya no está disponible o no pertenece al empleado/sede.",
            409,
            "DEUDA_NO_DISPONIBLE",
          );
        }
        const saldoPendienteEmpleado = redondear(
          Math.max(
            Number(deudaEmpleado.total || 0) -
              Number(deudaEmpleado.pago_inicial || 0) -
              Number(deudaEmpleado.pagado_deuda || 0),
            0,
          ),
        );
        const montoEnValidacionEmpleado = redondear(
          Number(deudaEmpleado.monto_en_validacion || 0),
        );
        const saldoDisponibleEmpleado = redondear(
          Math.max(saldoPendienteEmpleado - montoEnValidacionEmpleado, 0),
        );
        if (saldoDisponibleEmpleado <= 0.009) {
          throw new CobroOperacionError(
            "La deuda seleccionada ya no tiene saldo disponible para cobrar.",
            409,
            "DEUDA_EN_VALIDACION",
          );
        }
        const importeSaldarEmpleado =
          item.precio_unitario === undefined || item.precio_unitario === null
            ? saldoDisponibleEmpleado
            : redondear(Number(item.precio_unitario));
        if (!Number.isFinite(importeSaldarEmpleado) || importeSaldarEmpleado <= 0) {
          throw new CobroOperacionError("El importe a saldar no es válido.");
        }
        if (importeSaldarEmpleado - saldoDisponibleEmpleado > 0.009) {
          throw new CobroOperacionError(
            "El importe a saldar no puede superar el saldo disponible de la deuda.",
            409,
            "DEUDA_IMPORTE_EXCEDIDO",
          );
        }

        resueltos.push({
          id: Number(deudaEmpleado.cobro_origen_id),
          nombre: `Deuda · Compra #${Number(deudaEmpleado.cobro_origen_id)}`,
          categoria_nombre: "Deuda de empleado",
          tipo: "deuda",
          referencia_id: Number(deudaEmpleado.cobro_origen_id),
          cantidad: 1,
          precio_catalogo: saldoDisponibleEmpleado,
          precio_unitario: importeSaldarEmpleado,
          descuento_porcentaje: 0,
          descuento_importe: 0,
          impuesto_porcentaje: 0,
          impuesto_importe: 0,
          importe: importeSaldarEmpleado,
          total: importeSaldarEmpleado,
          membresia_id: null,
          mensualidad_id: null,
          plan_id: null,
          saldo_pendiente: saldoPendienteEmpleado,
          monto_en_validacion: montoEnValidacionEmpleado,
          saldo_disponible: saldoDisponibleEmpleado,
          monto_pagado_actual: redondear(
            Number(deudaEmpleado.pago_inicial || 0) +
              Number(deudaEmpleado.pagado_deuda || 0),
          ),
          fecha_vencimiento: String(deudaEmpleado.fecha_cobro || "").slice(0, 10),
          deuda_empleado: true,
        });
        continue;
      }

      if (!idValido(alumnoId)) {
        throw new CobroOperacionError(
          "Para saldar una deuda debe seleccionar un alumno.",
          409,
          "DEUDA_REQUIERE_ALUMNO",
        );
      }

      if (
        Number(item.descuento_porcentaje || 0) !== 0 ||
        Number(item.impuesto_porcentaje || 0) !== 0
      ) {
        throw new CobroOperacionError(
          "Una deuda existente no admite descuentos ni impuestos al saldarla.",
          409,
          "DEUDA_SIN_AJUSTES",
        );
      }

      const rows = await db.query(
        `SELECT
           pm.id,
           pm.alumno_id,
           pm.membresia_id,
           pm.sede_id,
           pm.monto_total,
           pm.monto_pagado,
           pm.saldo,
           COALESCE((
             SELECT SUM(ppv.monto)
             FROM pagos_pagos ppv
             WHERE ppv.mensualidad_id = pm.id
               AND ppv.estado = 'pendiente_validacion'
           ), 0) AS monto_en_validacion,
           pm.estado,
           pm.fecha_vencimiento,
           am.plan_id,
           COALESCE(p.nombre, CONCAT('Mensualidad #', pm.id)) AS nombre,
           'Deuda pendiente' AS categoria_nombre
         FROM pagos_mensualidades pm
         LEFT JOIN alumnos_membresias am ON am.id = pm.membresia_id
         LEFT JOIN planes_planes p ON p.id = am.plan_id
         WHERE pm.id = :mensualidadId
           AND pm.alumno_id = :alumnoId
           AND pm.sede_id = :sedeId
           AND pm.estado IN ('pendiente','parcial','vencida')
           AND pm.saldo > 0
         LIMIT 1`,
        {
          replacements: {
            mensualidadId: Number(item.referencia_id),
            alumnoId: Number(alumnoId),
            sedeId: Number(sedeId),
          },
          type: QueryTypes.SELECT,
          transaction,
        },
      );

      const deuda = rows[0] || null;
      if (!deuda) {
        throw new CobroOperacionError(
          "La deuda seleccionada ya no está disponible o no pertenece al alumno/sede.",
          409,
          "DEUDA_NO_DISPONIBLE",
        );
      }

      const saldoPendiente = redondear(Number(deuda.saldo || 0));
      const montoEnValidacion = redondear(Number(deuda.monto_en_validacion || 0));
      const saldoDisponible = redondear(
        Math.max(saldoPendiente - montoEnValidacion, 0),
      );
      if (saldoDisponible <= 0.009) {
        throw new CobroOperacionError(
          "La deuda seleccionada ya tiene todo su saldo cubierto por un pago pendiente de validación.",
          409,
          "DEUDA_EN_VALIDACION",
        );
      }

      const importeSaldar =
        item.precio_unitario === undefined || item.precio_unitario === null
          ? saldoDisponible
          : redondear(Number(item.precio_unitario));

      if (!Number.isFinite(importeSaldar) || importeSaldar <= 0) {
        throw new CobroOperacionError("El importe a saldar no es válido.");
      }
      if (importeSaldar - saldoDisponible > 0.009) {
        throw new CobroOperacionError(
          "El importe a saldar no puede superar el saldo disponible de la deuda. Puede haber un pago pendiente de validación.",
          409,
          "DEUDA_IMPORTE_EXCEDIDO",
        );
      }

      resueltos.push({
        id: Number(deuda.id),
        nombre: `Deuda · ${deuda.nombre}`,
        categoria_nombre: deuda.categoria_nombre,
        tipo: "deuda",
        referencia_id: Number(deuda.id),
        cantidad: 1,
        precio_catalogo: saldoDisponible,
        precio_unitario: importeSaldar,
        descuento_porcentaje: 0,
        descuento_importe: 0,
        impuesto_porcentaje: 0,
        impuesto_importe: 0,
        importe: importeSaldar,
        total: importeSaldar,
        membresia_id: deuda.membresia_id ? Number(deuda.membresia_id) : null,
        mensualidad_id: Number(deuda.id),
        plan_id: deuda.plan_id ? Number(deuda.plan_id) : null,
        saldo_pendiente: saldoPendiente,
        monto_en_validacion: montoEnValidacion,
        saldo_disponible: saldoDisponible,
        monto_pagado_actual: Number(deuda.monto_pagado || 0),
        fecha_vencimiento: deuda.fecha_vencimiento,
      });
      continue;
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

  const deudas = resueltos.filter((item) => item.tipo === "deuda");
  if (deudas.length > 0 && deudas.length !== resueltos.length) {
    throw new CobroOperacionError(
      "Las deudas deben cobrarse en una operación separada de planes, productos y servicios.",
      409,
      "DEUDA_COBRO_EXCLUSIVO",
    );
  }
  if (deudas.length > 0) {
    const idsDeuda = deudas.map((item) =>
      Number(item.mensualidad_id || item.referencia_id),
    );
    if (new Set(idsDeuda).size !== idsDeuda.length) {
      throw new CobroOperacionError(
        "Una misma deuda no puede agregarse dos veces al mismo cobro.",
        409,
        "DEUDA_DUPLICADA",
      );
    }
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
  let empleado = null;
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
    empleado = await UsuariosModel.findOne({
      where: { id: Number(clienteUsuarioId), estado: "activo" },
      transaction,
    });
    if (!empleado)
      throw new CobroOperacionError(
        "No se encontró el empleado seleccionado.",
        404,
      );
  }

  return { alumno, empleado, cobrador };
};

const resolverPagos = async ({
  pagos,
  total,
  permitirSinPagos = false,
  transaction,
}) => {
  if (!Array.isArray(pagos) || pagos.length === 0) {
    if (permitirSinPagos) {
      return { pagos: [], totalPagado: 0 };
    }
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

const obtenerCuentaSaldoCliente = async ({
  clienteTipo,
  alumnoId,
  clienteUsuarioId,
  crear = false,
  transaction,
}) => {
  if (clienteTipo === "empleado") {
    if (!idValido(clienteUsuarioId)) return null;
    if (crear) {
      await UsuariosSaldosModel.findOrCreate({
        where: { usuario_id: Number(clienteUsuarioId) },
        defaults: { saldo: "0.00", moneda: "ARS" },
        transaction,
      });
    }
    return UsuariosSaldosModel.findOne({
      where: { usuario_id: Number(clienteUsuarioId) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }

  if (!idValido(alumnoId)) return null;
  if (crear) {
    await AlumnosSaldosModel.findOrCreate({
      where: { alumno_id: Number(alumnoId) },
      defaults: { saldo: "0.00", moneda: "ARS" },
      transaction,
    });
  }
  return AlumnosSaldosModel.findOne({
    where: { alumno_id: Number(alumnoId) },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
};

const crearMovimientoSaldoCliente = async ({
  clienteTipo,
  cuenta,
  alumnoId,
  clienteUsuarioId,
  sedeId,
  usuarioId,
  tipo,
  origen,
  monto,
  saldoAnterior,
  saldoNuevo,
  cobroId = null,
  referencia = null,
  motivo = null,
  transaction,
}) => {
  if (clienteTipo === "empleado") {
    return UsuariosSaldosMovimientosModel.create(
      {
        saldo_id: Number(cuenta.id),
        usuario_cliente_id: Number(clienteUsuarioId),
        sede_id: Number(sedeId),
        usuario_registro_id: Number(usuarioId),
        tipo,
        origen,
        monto: Number(monto).toFixed(2),
        saldo_anterior: Number(saldoAnterior).toFixed(2),
        saldo_nuevo: Number(saldoNuevo).toFixed(2),
        cobro_id: idValido(cobroId) ? Number(cobroId) : null,
        referencia,
        motivo,
      },
      { transaction },
    );
  }

  return AlumnosSaldosMovimientosModel.create(
    {
      saldo_id: Number(cuenta.id),
      alumno_id: Number(alumnoId),
      sede_id: Number(sedeId),
      usuario_id: Number(usuarioId),
      tipo,
      origen,
      monto: Number(monto).toFixed(2),
      saldo_anterior: Number(saldoAnterior).toFixed(2),
      saldo_nuevo: Number(saldoNuevo).toFixed(2),
      cobro_id: idValido(cobroId) ? Number(cobroId) : null,
      bonificacion_id: null,
      referencia,
      motivo,
    },
    { transaction },
  );
};

const prepararConsumoSaldo = async ({
  pagos,
  clienteTipo,
  alumnoId,
  clienteUsuarioId,
  transaction,
}) => {
  const pagosSaldo = pagos.filter((item) => item.es_saldo_favor);
  if (pagosSaldo.length === 0) return null;
  if (pagosSaldo.length > 1) {
    throw new CobroOperacionError(
      "El saldo a favor solo puede aplicarse una vez por cobro.",
    );
  }
  if (!["alumno", "empleado"].includes(String(clienteTipo))) {
    throw new CobroOperacionError(
      "Para utilizar saldo a favor debe seleccionar un alumno o empleado.",
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

  const cuenta = await obtenerCuentaSaldoCliente({
    clienteTipo,
    alumnoId,
    clienteUsuarioId,
    transaction,
  });
  const saldoAnterior = Number(cuenta?.saldo || 0);
  const monto = Number(pagosSaldo[0].monto);
  if (!cuenta || saldoAnterior + 0.009 < monto) {
    throw new CobroOperacionError(
      "El cliente no dispone de saldo suficiente para completar el cobro.",
      409,
      "SALDO_INSUFICIENTE",
    );
  }

  return {
    cuenta,
    pago: pagosSaldo[0],
    clienteTipo,
    alumnoId,
    clienteUsuarioId,
    saldoAnterior,
    saldoNuevo: redondear(saldoAnterior - monto),
  };
};

const aplicarConsumoSaldo = async ({
  consumo,
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
  await crearMovimientoSaldoCliente({
    clienteTipo: consumo.clienteTipo,
    cuenta: consumo.cuenta,
    alumnoId: consumo.alumnoId,
    clienteUsuarioId: consumo.clienteUsuarioId,
    sedeId,
    usuarioId,
    tipo: "debito",
    origen: "uso_cobro",
    monto: Number(consumo.pago.monto),
    saldoAnterior: consumo.saldoAnterior,
    saldoNuevo: consumo.saldoNuevo,
    cobroId,
    referencia: `COBRO-${cobroId}`,
    motivo: `Saldo aplicado al cobro #${cobroId}`,
    transaction,
  });
};

const prepararVueltoSaldo = ({
  config,
  pagos,
  clienteTipo,
  alumnoId,
  clienteUsuarioId,
  solicitaPagoParcial,
}) => {
  if (!config) return null;
  if (!["alumno", "empleado"].includes(String(clienteTipo))) {
    throw new CobroOperacionError(
      "Para dejar el vuelto a favor debe seleccionar un alumno o empleado.",
      409,
      "VUELTO_SALDO_REQUIERE_CLIENTE",
    );
  }
  if (solicitaPagoParcial) {
    throw new CobroOperacionError(
      "No se puede dejar vuelto a favor mientras el cobro genera deuda.",
      409,
      "VUELTO_SALDO_CON_DEUDA",
    );
  }
  if (clienteTipo === "alumno" && !idValido(alumnoId)) {
    throw new CobroOperacionError("El alumno seleccionado no es válido.");
  }
  if (clienteTipo === "empleado" && !idValido(clienteUsuarioId)) {
    throw new CobroOperacionError("El empleado seleccionado no es válido.");
  }

  const medioPagoId = Number(config.medio_pago_id);
  const efectivoRecibido = redondear(Number(config.efectivo_recibido || 0));
  const monto = redondear(Number(config.monto || 0));
  const pagoEfectivo = pagos.find(
    (item) => Number(item.medio_pago_id) === medioPagoId,
  );
  if (!pagoEfectivo || !esMedioEfectivoCobro(pagoEfectivo.medio)) {
    throw new CobroOperacionError(
      "El vuelto a favor solo puede generarse desde un pago en efectivo.",
      409,
      "VUELTO_SALDO_REQUIERE_EFECTIVO",
    );
  }
  if (pagos.some((item) => Number(item.medio.requiere_validacion) === 1)) {
    throw new CobroOperacionError(
      "El vuelto a favor no puede combinarse con medios pendientes de validación.",
      409,
      "VUELTO_SALDO_CON_VALIDACION",
    );
  }
  const esperado = redondear(efectivoRecibido - Number(pagoEfectivo.monto || 0));
  if (efectivoRecibido <= Number(pagoEfectivo.monto || 0) + 0.009 || monto <= 0) {
    throw new CobroOperacionError("No hay vuelto positivo para dejar a favor.");
  }
  if (Math.abs(esperado - monto) > 0.009) {
    throw new CobroOperacionError(
      "El vuelto informado no coincide con el efectivo recibido.",
      409,
      "VUELTO_SALDO_INCONSISTENTE",
    );
  }
  return { medioPagoId, efectivoRecibido, monto };
};

const aplicarVueltoSaldo = async ({
  vuelto,
  cobro,
  clienteTipo,
  alumnoId,
  clienteUsuarioId,
  clienteNombre,
  sedeId,
  usuarioId,
  sesion,
  transaction,
}) => {
  if (!vuelto) return null;
  const cuenta = await obtenerCuentaSaldoCliente({
    clienteTipo,
    alumnoId,
    clienteUsuarioId,
    crear: true,
    transaction,
  });
  const saldoAnterior = Number(cuenta.saldo || 0);
  const saldoNuevo = redondear(saldoAnterior + Number(vuelto.monto || 0));
  await cuenta.update(
    { saldo: saldoNuevo.toFixed(2), updated_at: new Date() },
    { transaction },
  );
  const referencia = `${REFERENCIA_VUELTO_SALDO}-${cobro.id}`;
  await crearMovimientoSaldoCliente({
    clienteTipo,
    cuenta,
    alumnoId,
    clienteUsuarioId,
    sedeId,
    usuarioId,
    tipo: "credito",
    origen: "carga_saldo",
    monto: vuelto.monto,
    saldoAnterior,
    saldoNuevo,
    cobroId: cobro.id,
    referencia,
    motivo: `Vuelto del cobro #${cobro.id} dejado como saldo a favor`,
    transaction,
  });
  await CajasMovimientosModel.create(
    {
      caja_sesion_id: Number(sesion.id),
      caja_id: Number(sesion.caja_id),
      sede_id: Number(sedeId),
      cobro_pago_id: null,
      gasto_id: null,
      medio_pago_id: Number(vuelto.medioPagoId),
      usuario_registro_id: Number(usuarioId),
      tipo: "ingreso",
      origen: "manual",
      fecha_movimiento: new Date(),
      monto: Number(vuelto.monto).toFixed(2),
      descripcion: `Vuelto a saldo · ${clienteNombre || "Cliente"}`.slice(0, 255),
      estado: "vigente",
      referencia,
      observaciones: `Efectivo recibido ${Number(vuelto.efectivoRecibido).toFixed(2)} · Cobro ${Number(cobro.total).toFixed(2)}`,
    },
    { transaction },
  );
  return { saldoAnterior, saldoNuevo, referencia };
};

// Benjamin Orellana - 2026/08/01 - Valida la configuración manual enviada
// desde la migración antes de crear una membresía mediante el circuito real de cobro.
const prepararConfiguracionMembresiaMigracionCobro = async ({
  configuracion,
  conceptos,
  lineaPlan,
  alumno,
  sedeId,
  transaction,
}) => {
  if (configuracion === undefined || configuracion === null) return null;

  if (!configuracion || typeof configuracion !== "object" || Array.isArray(configuracion)) {
    throw new CobroOperacionError(
      "La configuración de membresía migrada no es válida.",
      400,
      "MEMBRESIA_MIGRACION_INVALIDA",
    );
  }

  if (!alumno || !lineaPlan || conceptos.length !== 1) {
    throw new CobroOperacionError(
      "La carga migrada con cobro debe contener un único plan para un alumno.",
      409,
      "MEMBRESIA_MIGRACION_REQUIERE_PLAN_UNICO",
    );
  }

  if (["baja", "congelado"].includes(String(alumno.estado || "").toLowerCase())) {
    throw new CobroOperacionError(
      "El alumno está dado de baja o congelado. Regularizá su estado antes de asignar y cobrar una membresía migrada.",
      409,
      "MEMBRESIA_MIGRACION_ALUMNO_BLOQUEADO",
    );
  }

  const planId = Number(configuracion.plan_id);
  const sedeConfiguradaId = Number(configuracion.sede_id);
  const fechaInicio = String(configuracion.fecha_inicio || "").slice(0, 10);
  const fechaVencimiento = String(
    configuracion.fecha_vencimiento || "",
  ).slice(0, 10);
  const clasesIncluidas = Number(configuracion.clases_incluidas);
  const clasesDisponibles = Number(configuracion.clases_disponibles);

  if (planId !== Number(lineaPlan.referencia_id)) {
    throw new CobroOperacionError(
      "El plan seleccionado no coincide con la configuración de migración.",
      409,
      "MEMBRESIA_MIGRACION_PLAN_INCONSISTENTE",
    );
  }

  if (sedeConfiguradaId !== Number(sedeId)) {
    throw new CobroOperacionError(
      "La sede del cobro no coincide con la sede de la membresía migrada.",
      409,
      "MEMBRESIA_MIGRACION_SEDE_INCONSISTENTE",
    );
  }

  if (!esFechaDateOnlyValida(fechaInicio) || !esFechaDateOnlyValida(fechaVencimiento)) {
    throw new CobroOperacionError(
      "Las fechas de la membresía migrada no son válidas.",
      400,
      "MEMBRESIA_MIGRACION_FECHAS_INVALIDAS",
    );
  }

  if (fechaVencimiento < fechaInicio) {
    throw new CobroOperacionError(
      "La fecha de vencimiento no puede ser anterior a la fecha de inicio.",
      400,
      "MEMBRESIA_MIGRACION_RANGO_INVALIDO",
    );
  }

  if (fechaVencimiento < fechaArgentina()) {
    throw new CobroOperacionError(
      "No se puede cobrar una membresía migrada que ya está vencida.",
      409,
      "MEMBRESIA_MIGRACION_YA_VENCIDA",
    );
  }

  if (!esEnteroNoNegativo(clasesIncluidas) || !esEnteroNoNegativo(clasesDisponibles)) {
    throw new CobroOperacionError(
      "Los créditos incluidos y disponibles deben ser números enteros no negativos.",
      400,
      "MEMBRESIA_MIGRACION_CREDITOS_INVALIDOS",
    );
  }

  if (clasesDisponibles > clasesIncluidas) {
    throw new CobroOperacionError(
      "Los créditos disponibles no pueden superar los créditos incluidos.",
      400,
      "MEMBRESIA_MIGRACION_CREDITOS_INCONSISTENTES",
    );
  }

  const membresiaSuperpuesta = await AlumnosMembresiasModel.findOne({
    where: {
      alumno_id: Number(alumno.id),
      estado: { [Op.in]: ["activa", "pendiente_pago", "congelada"] },
      fecha_inicio: { [Op.lte]: fechaVencimiento },
      fecha_vencimiento: { [Op.gte]: fechaInicio },
    },
    order: [
      ["fecha_inicio", "DESC"],
      ["id", "DESC"],
    ],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (membresiaSuperpuesta) {
    throw new CobroOperacionError(
      `El alumno ya tiene una membresía operativa entre ${membresiaSuperpuesta.fecha_inicio} y ${membresiaSuperpuesta.fecha_vencimiento}.`,
      409,
      "MEMBRESIA_MIGRACION_SUPERPUESTA",
    );
  }

  return {
    plan_id: planId,
    sede_id: sedeConfiguradaId,
    fecha_inicio: fechaInicio,
    fecha_vencimiento: fechaVencimiento,
    clases_incluidas: clasesIncluidas,
    clases_usadas: clasesIncluidas - clasesDisponibles,
    clases_disponibles: clasesDisponibles,
    observaciones: String(configuracion.observaciones || "").trim() || null,
  };
};

// Benjamin Orellana - 2026/08/01 - Crea la membresía con las fechas y créditos
// declarados durante la migración, reutilizando pagos, caja y finanzas del cobro.
const crearMembresiaPlanMigracionCobrada = async ({
  alumno,
  sedeId,
  linea,
  configuracion,
  estadoCobro,
  montoPagado,
  medioPagoId,
  usuarioId,
  cobroId,
  transaction,
}) => {
  const hoy = fechaArgentina();
  const confirmado = estadoCobro === "confirmado";
  const montoPagadoConfirmado = confirmado
    ? redondear(Math.min(Number(montoPagado || 0), Number(linea.total)))
    : 0;
  const saldoMensualidad = redondear(
    Math.max(Number(linea.total) - montoPagadoConfirmado, 0),
  );
  const estadoMensualidad = confirmado
    ? saldoMensualidad <= 0.009
      ? "pagada"
      : montoPagadoConfirmado > 0.009
        ? "parcial"
        : "pendiente"
    : "pendiente";
  const basePlan = redondear(linea.importe - linea.descuento_importe);
  const observacionesMembresia = [
    `Generada por cobro #${cobroId} | MIGRACION_MANUAL`,
    configuracion.observaciones,
  ]
    .filter(Boolean)
    .join(" | ");

  const membresia = await AlumnosMembresiasModel.create(
    {
      alumno_id: Number(alumno.id),
      plan_id: Number(linea.referencia_id),
      sede_id: Number(sedeId),
      fecha_inicio: configuracion.fecha_inicio,
      fecha_vencimiento: configuracion.fecha_vencimiento,
      estado: confirmado ? "activa" : "pendiente_pago",
      precio_lista: Number(linea.precio_unitario).toFixed(2),
      descuento_valor: "0.00",
      descuento_porcentaje: Number(linea.descuento_porcentaje).toFixed(2),
      precio_final: basePlan.toFixed(2),
      clases_incluidas: configuracion.clases_incluidas,
      clases_usadas: configuracion.clases_usadas,
      clases_disponibles: configuracion.clases_disponibles,
      origen_alta: "migracion",
      agenda_restricciones: await copiarRestriccionesPlan({
        planId: linea.referencia_id,
        transaction,
      }),
      observaciones: observacionesMembresia,
    },
    { transaction },
  );

  if (confirmado) {
    await imputarReservasPendientesMembresia({ membresia, transaction });
  }

  const fechaBase = new Date(`${configuracion.fecha_inicio}T00:00:00Z`);
  const mensualidad = await PagosMensualidadesModel.create(
    {
      alumno_id: Number(alumno.id),
      membresia_id: Number(membresia.id),
      sede_id: Number(sedeId),
      periodo_anio: fechaBase.getUTCFullYear(),
      periodo_mes: fechaBase.getUTCMonth() + 1,
      periodo_desde: configuracion.fecha_inicio,
      periodo_hasta: configuracion.fecha_vencimiento,
      fecha_emision: hoy,
      fecha_vencimiento: configuracion.fecha_vencimiento,
      monto_total: Number(linea.total).toFixed(2),
      monto_pagado: montoPagadoConfirmado.toFixed(2),
      saldo: confirmado
        ? saldoMensualidad.toFixed(2)
        : Number(linea.total).toFixed(2),
      estado: estadoMensualidad,
      observaciones: `Generada por cobro #${cobroId} | Membresía migrada manualmente`,
    },
    { transaction },
  );

  let pago = null;
  if (Number(montoPagado || 0) > 0.009) {
    if (!idValido(medioPagoId)) {
      throw new CobroOperacionError(
        "No se pudo identificar el medio usado para abonar el plan.",
        409,
        "MEDIO_PAGO_PLAN_INVALIDO",
      );
    }
    pago = await PagosModel.create(
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
        observaciones: `Pago de membresía migrada generado por cobro #${cobroId}`,
      },
      { transaction },
    );
  }

  await SistemaAuditoriaLogsModel.create(
    {
      usuario_id: Number(usuarioId),
      sede_id: Number(sedeId),
      modulo: "ALUMNOS",
      accion: "CREAR_MEMBRESIA_MIGRACION_COBRADA",
      entidad: "alumnos_membresias",
      entidad_id: Number(membresia.id),
      descripcion: `Membresía migrada manualmente y vinculada al cobro #${cobroId}.`,
      valores_anteriores: null,
      valores_nuevos: {
        alumno_id: Number(alumno.id),
        plan_id: Number(linea.referencia_id),
        sede_id: Number(sedeId),
        fecha_inicio: configuracion.fecha_inicio,
        fecha_vencimiento: configuracion.fecha_vencimiento,
        clases_incluidas: configuracion.clases_incluidas,
        clases_usadas: configuracion.clases_usadas,
        clases_disponibles: configuracion.clases_disponibles,
        cobro_id: Number(cobroId),
        mensualidad_id: Number(mensualidad.id),
        pago_id: pago?.id ? Number(pago.id) : null,
      },
      ip: null,
      user_agent: null,
    },
    { transaction },
  );

  if (confirmado) {
    await normalizarCicloMembresiasAlumno({
      alumnoId: alumno.id,
      fechaReferencia: hoy,
      transaction,
    });

    await alumno.update(
      {
        estado: "activo",
        sede_id: Number(sedeId),
        fecha_inicio: alumno.fecha_inicio || configuracion.fecha_inicio,
        usuario_validacion_id:
          alumno.usuario_validacion_id || Number(usuarioId),
        updated_at: new Date(),
      },
      { transaction },
    );
  } else {
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

const crearMembresiaPlan = async ({
  alumno,
  sedeId,
  linea,
  estadoCobro,
  montoPagado,
  medioPagoId,
  usuarioId,
  cobroId,
  renovacionExplicita = false,
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
  // RENOVACION_FUTURA_CONTEXTO_20260831
  // En una renovación explícita la fecha del cobro no obliga a iniciar el
  // nuevo ciclo hoy. Una fecha manual futura conserva el período actual.
  const fechaInicioSolicitadaRenovacion =
    renovacionExplicita && linea.fecha_inicio
      ? String(linea.fecha_inicio).slice(0, 10)
      : null;

  if (
    fechaInicioSolicitadaRenovacion &&
    !esFechaDateOnlyValida(fechaInicioSolicitadaRenovacion)
  ) {
    throw new CobroOperacionError(
      "La fecha de inicio seleccionada para la renovación no es válida.",
      400,
      "RENOVACION_FECHA_INICIO_INVALIDA",
    );
  }

  if (
    fechaInicioSolicitadaRenovacion &&
    fechaInicioSolicitadaRenovacion < hoy
  ) {
    throw new CobroOperacionError(
      "La fecha de inicio de la renovación no puede ser anterior a hoy.",
      409,
      "RENOVACION_FECHA_INICIO_ANTERIOR",
    );
  }

  const iniciarCicloAhora = renovacionExplicita
    ? fechaInicioSolicitadaRenovacion === hoy
    : renovarAhoraPorCuposAgotados || cambiarPlanAhora;

  // Las reservas futuras ya no bloquean el cambio de plan: se conservan y
  // reasignan automáticamente dentro de esta misma transacción.

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

  if (
    renovacionFuturaExistente &&
    (!iniciarCicloAhora || renovacionExplicita)
  ) {
    const mensualidadFutura = await PagosMensualidadesModel.findOne({
      where: {
        membresia_id: Number(renovacionFuturaExistente.id),
        alumno_id: Number(alumno.id),
      },
      order: [["id", "DESC"]],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const saldoFuturo = redondear(Number(mensualidadFutura?.saldo || 0));
    const estadoMensualidadFutura = String(
      mensualidadFutura?.estado || "",
    ).toLowerCase();

    if (
      mensualidadFutura &&
      (estadoMensualidadFutura === "pagada" || saldoFuturo <= 0.009)
    ) {
      throw new CobroOperacionError(
        `La membresía futura #${renovacionFuturaExistente.id} (${renovacionFuturaExistente.fecha_inicio} a ${renovacionFuturaExistente.fecha_vencimiento}) ya está pagada. No se registró otro cobro.`,
        409,
        "RENOVACION_FUTURA_PAGADA",
      );
    }

    if (mensualidadFutura && saldoFuturo > 0.009) {
      throw new CobroOperacionError(
        `La membresía futura #${renovacionFuturaExistente.id} ya existe y tiene un saldo pendiente de $${saldoFuturo.toFixed(2)}. Saldá esa deuda existente; no se creó otra membresía.`,
        409,
        "RENOVACION_FUTURA_CON_SALDO",
      );
    }

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

  const fechaInicio = renovacionExplicita
    ? fechaInicioSolicitadaRenovacion ||
      (ultima?.fecha_vencimiento && ultima.fecha_vencimiento >= hoy
        ? sumarDias(ultima.fecha_vencimiento, 1)
        : hoy)
    : iniciarCicloAhora
      ? hoy
      : linea.fecha_inicio ||
        (ultima?.fecha_vencimiento && ultima.fecha_vencimiento >= hoy
          ? sumarDias(ultima.fecha_vencimiento, 1)
          : hoy);
  const duracion = Math.max(Number(linea.duracion_dias || 1), 1);
  // Benjamin Orellana - 2026/08/10 - Unifica altas, cambios y renovaciones:
  // el periodo comercial del plan manda sobre la cantidad fija de días.
  const fechaVencimiento = calcularFechaVencimientoPlan({
    fechaInicio,
    periodo: linea.periodo,
    duracionDias: duracion
  });

  if (!fechaVencimiento) {
    throw new CobroOperacionError(
      "No se pudo calcular el vencimiento del plan seleccionado.",
      400,
      "VENCIMIENTO_PLAN_INVALIDO",
    );
  }
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
    ? saldoMensualidad <= 0.009
      ? "pagada"
      : montoPagadoConfirmado > 0.009
        ? "parcial"
        : "pendiente"
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
      agenda_restricciones: await copiarRestriccionesPlan({
        planId: linea.referencia_id,
        transaction,
      }),
      observaciones: renovacionExplicita
        ? iniciarCicloAhora
          ? `Generada por cobro #${cobroId} | NUEVO_CICLO_RENOVACION_EXPLICITA${
              membresiaVigente
                ? ` desde membresía #${membresiaVigente.id} | VENCIMIENTO_ANTERIOR=${String(
                    membresiaVigente.fecha_vencimiento || "",
                  ).slice(0, 10)}`
                : ""
            }`
          : `Generada por cobro #${cobroId} | RENOVACION_ANTICIPADA_PROGRAMADA | INICIO_PROGRAMADO=${fechaInicio}`
        : cambiarPlanAhora
          ? `Generada por cobro #${cobroId} | NUEVO_CICLO_CAMBIO_PLAN desde membresía #${membresiaVigente.id}`
          : renovarAhoraPorCuposAgotados
            ? `Generada por cobro #${cobroId} | NUEVO_CICLO_CUPOS_AGOTADOS desde membresía #${membresiaVigente.id}`
            : `Generada por cobro #${cobroId}`,
    },
    { transaction },
  );

  if (confirmado) {
    if (cambiarPlanAhora && membresiaVigente) {
      await migrarReservasFuturasCambioPlan({
        membresiaAnterior: membresiaVigente,
        membresiaNueva: membresia,
        cobroId,
        transaction,
      });
    }
    await imputarReservasPendientesMembresia({ membresia, transaction });
  }

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
      observaciones: renovacionExplicita
        ? iniciarCicloAhora
          ? `Generada por cobro #${cobroId} | Renovación explícita: nuevo ciclo desde ${fechaInicio}`
          : `Generada por cobro #${cobroId} | Renovación anticipada programada desde ${fechaInicio}`
        : cambiarPlanAhora
          ? `Generada por cobro #${cobroId} | Cambio de plan inmediato desde membresía #${membresiaVigente.id}`
          : renovarAhoraPorCuposAgotados
            ? `Generada por cobro #${cobroId} | Nuevo ciclo inmediato por cupos agotados desde membresía #${membresiaVigente.id}`
            : `Generada por cobro #${cobroId}`,
    },
    { transaction },
  );

  // Una renovación explícita, renovar sin cupos o elegir otro plan reemplaza
  // el ciclo operativo. El período anterior conserva pagos, reservas,
  // asistencias y créditos históricos, pero deja de competir como actual.
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
          ...(renovacionExplicita
            ? {
                fecha_vencimiento: (() => {
                  const fechaCierreRenovacion = sumarDias(fechaInicio, -1);
                  const fechaInicioAnterior = String(
                    membresiaAnterior.fecha_inicio || "",
                  ).slice(0, 10);
                  return fechaCierreRenovacion >= fechaInicioAnterior
                    ? fechaCierreRenovacion
                    : fechaInicioAnterior;
                })(),
              }
            : {}),
          observaciones: `${observacionesAnteriores}${
            observacionesAnteriores ? " | " : ""
          }${
            cambiarPlanAhora
              ? `Reemplazada por cambio de plan del cobro #${cobroId}`
              : renovacionExplicita
                ? `Cerrada por renovación explícita del cobro #${cobroId}`
                : `Cerrada por nuevo ciclo inmediato del cobro #${cobroId}`
          }`,
          updated_at: new Date(),
        },
        { transaction },
      );
    }
  }

  let pago = null;
  if (Number(montoPagado || 0) > 0.009) {
    if (!idValido(medioPagoId)) {
      throw new CobroOperacionError(
        "No se pudo identificar el medio usado para abonar el plan.",
        409,
        "MEDIO_PAGO_PLAN_INVALIDO",
      );
    }
    pago = await PagosModel.create(
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
  }

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

// Benjamin Orellana - 2026/08/18 - Una venta fiada de productos/servicios
// utiliza pagos_mensualidades como fuente de verdad del saldo deudor. La fila
// se crea sin membresía para no inventar un plan y queda identificada de forma
// estable por el cobro que la originó.
const marcadorDeudaFiadaCobro = (cobroId) => `[FIADO COBRO #${Number(cobroId)}]`;

const obtenerDeudaFiadaCobro = async ({
  cobroId,
  alumnoId,
  sedeId,
  transaction,
  bloquear = false,
}) => {
  if (!idValido(cobroId) || !idValido(alumnoId) || !idValido(sedeId)) return null;

  return PagosMensualidadesModel.findOne({
    where: {
      alumno_id: Number(alumnoId),
      sede_id: Number(sedeId),
      membresia_id: null,
      observaciones: {
        [Op.like]: `${marcadorDeudaFiadaCobro(cobroId)}%`,
      },
    },
    order: [["id", "DESC"]],
    transaction,
    ...(bloquear ? { lock: transaction.LOCK.UPDATE } : {}),
  });
};

const crearDeudaFiadaCobro = async ({
  cobro,
  conceptos,
  totalPagado,
  montoDeuda = null,
  usuarioId,
  transaction,
}) => {
  if (!idValido(cobro?.alumno_id)) return null;

  // Si el cobro mezcla plan + otros conceptos, la mensualidad del plan conserva
  // únicamente su propio saldo. Esta deuda administrativa representa solo la
  // parte impaga de productos/servicios para no duplicar el saldo del plan.
  const conceptosFiados = (conceptos || []).filter(
    (item) => String(item.tipo) !== "plan",
  );
  if (conceptosFiados.length === 0) return null;

  const totalConceptosFiados = redondear(
    conceptosFiados.reduce((suma, item) => suma + Number(item.total || 0), 0),
  );
  const deuda = redondear(
    montoDeuda == null
      ? Math.max(totalConceptosFiados - Number(totalPagado || 0), 0)
      : Math.max(Number(montoDeuda || 0), 0),
  );
  if (deuda <= 0.009) return null;

  const existente = await obtenerDeudaFiadaCobro({
    cobroId: cobro.id,
    alumnoId: cobro.alumno_id,
    sedeId: cobro.sede_id,
    transaction,
    bloquear: true,
  });
  if (existente) return existente;

  const hoy = fechaArgentina();
  const fechaBase = new Date(`${hoy}T00:00:00Z`);
  const detalleConceptos = conceptosFiados
    .map((item) => {
      const nombre = item.nombre_snapshot || item.nombre || "Concepto";
      const cantidad = Number(item.cantidad || 1);
      return `${nombre}${cantidad !== 1 ? ` x${cantidad}` : ""}`;
    })
    .join(", ")
    .slice(0, 300);
  const marcador = marcadorDeudaFiadaCobro(cobro.id);

  const mensualidad = await PagosMensualidadesModel.create(
    {
      alumno_id: Number(cobro.alumno_id),
      membresia_id: null,
      sede_id: Number(cobro.sede_id),
      periodo_anio: fechaBase.getUTCFullYear(),
      periodo_mes: fechaBase.getUTCMonth() + 1,
      periodo_desde: hoy,
      periodo_hasta: hoy,
      fecha_emision: hoy,
      fecha_vencimiento: hoy,
      monto_total: deuda.toFixed(2),
      monto_pagado: "0.00",
      saldo: deuda.toFixed(2),
      estado: "pendiente",
      observaciones: `${marcador} Venta fiada. Total ${totalConceptosFiados.toFixed(2)}; abonado ${Number(totalPagado || 0).toFixed(2)}; deuda ${deuda.toFixed(2)}${detalleConceptos ? `; conceptos: ${detalleConceptos}` : ""}`,
    },
    { transaction },
  );

  await SistemaAuditoriaLogsModel.create(
    {
      usuario_id: Number(usuarioId),
      sede_id: Number(cobro.sede_id),
      modulo: "COBROS",
      accion: "GENERAR_DEUDA_FIADA",
      entidad: "pagos_mensualidades",
      entidad_id: Number(mensualidad.id),
      descripcion: `Cobro #${cobro.id}: deuda fiada por ${deuda.toFixed(2)}.`,
      valores_anteriores: null,
      valores_nuevos: {
        cobro_id: Number(cobro.id),
        alumno_id: Number(cobro.alumno_id),
        monto_total_cobro: Number(cobro.total || 0),
        monto_total_conceptos_fiados: totalConceptosFiados,
        monto_abonado: Number(totalPagado || 0),
        deuda_generada: deuda,
        mensualidad_id: Number(mensualidad.id),
      },
      ip: null,
      user_agent: null,
    },
    { transaction },
  );

  return mensualidad;
};

const revertirDeudaFiadaCobro = async ({
  cobro,
  motivo,
  usuarioId,
  transaction,
}) => {
  if (!idValido(cobro?.alumno_id)) return null;
  const mensualidad = await obtenerDeudaFiadaCobro({
    cobroId: cobro.id,
    alumnoId: cobro.alumno_id,
    sedeId: cobro.sede_id,
    transaction,
    bloquear: true,
  });
  if (!mensualidad || mensualidad.estado === "anulada") return mensualidad;

  const pagoAplicado = await PagosModel.findOne({
    where: {
      mensualidad_id: Number(mensualidad.id),
      estado: { [Op.in]: ["confirmado", "pendiente_validacion"] },
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (pagoAplicado) {
    throw new CobroOperacionError(
      "La deuda generada por esta venta ya tiene un pago registrado. Anulá o regularizá ese pago antes de anular la venta fiada.",
      409,
      "DEUDA_FIADA_CON_PAGOS",
    );
  }

  const saldoAnteriorDeudaFiada = Number(mensualidad.saldo || 0);
  await mensualidad.update(
    {
      monto_pagado: "0.00",
      saldo: "0.00",
      estado: "anulada",
      observaciones: [
        mensualidad.observaciones,
        `[ANULACIÓN FIADO COBRO #${cobro.id}] ${motivo}`,
      ]
        .filter(Boolean)
        .join(" | "),
      updated_at: new Date(),
    },
    { transaction },
  );

  await SistemaAuditoriaLogsModel.create(
    {
      usuario_id: Number(usuarioId),
      sede_id: Number(cobro.sede_id),
      modulo: "COBROS",
      accion: "ANULAR_DEUDA_FIADA",
      entidad: "pagos_mensualidades",
      entidad_id: Number(mensualidad.id),
      descripcion: `Deuda fiada del cobro #${cobro.id} anulada junto con la venta.`,
      valores_anteriores: { saldo: saldoAnteriorDeudaFiada },
      valores_nuevos: { saldo: 0, estado: "anulada", motivo },
      ip: null,
      user_agent: null,
    },
    { transaction },
  );

  return mensualidad;
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

// Distribuye el importe abonado de forma determinística: primero cubre los
// planes (para que cada mensualidad reciba solo lo que le corresponde) y luego
// los productos/servicios. Así un cobro mixto puede quedar parcial o totalmente
// fiado sin duplicar deuda ni sobreimputar pagos a una mensualidad.
const distribuirPagoConceptos = ({ conceptos = [], totalPagado = 0 }) => {
  let disponible = redondear(Math.max(Number(totalPagado || 0), 0));
  const pagosPlan = new Map();

  for (const linea of conceptos) {
    if (String(linea.tipo) !== "plan") continue;
    const montoLinea = redondear(Math.max(Number(linea.total || 0), 0));
    const aplicado = redondear(Math.min(disponible, montoLinea));
    pagosPlan.set(linea, aplicado);
    disponible = redondear(Math.max(disponible - aplicado, 0));
  }

  const conceptosNoPlan = conceptos.filter(
    (linea) => String(linea.tipo) !== "plan",
  );
  const totalNoPlan = redondear(
    conceptosNoPlan.reduce(
      (suma, linea) => suma + Math.max(Number(linea.total || 0), 0),
      0,
    ),
  );
  const pagadoNoPlan = redondear(Math.min(disponible, totalNoPlan));
  const deudaNoPlan = redondear(Math.max(totalNoPlan - pagadoNoPlan, 0));

  return {
    pagosPlan,
    conceptosNoPlan,
    totalNoPlan,
    pagadoNoPlan,
    deudaNoPlan,
  };
};

export const registrarCobro = async ({ payload, usuario }) => {
  const transaction = await db.transaction();

  try {
    const sedeId = Number(payload.sede_id);
    const usuarioId = Number(usuario?.id || usuario?.usuario_id);
    const cobradorUsuarioId = Number(payload.cobrador_usuario_id || usuarioId);
    const idempotencyKey = String(payload.idempotency_key || "").trim();
    const clienteTipo = payload.cliente_tipo;
    const renovacionExplicita =
      String(payload.origen_operacion || "").trim().toLowerCase() ===
      "renovacion_membresia";

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

    const { alumno, empleado } = await validarCliente({
      clienteTipo,
      alumnoId: payload.alumno_id,
      clienteUsuarioId: payload.cliente_usuario_id,
      cobradorUsuarioId,
      transaction,
    });

    const conceptos = await resolverConceptos({
      conceptos: payload.conceptos,
      sedeId,
      alumnoId: alumno?.id,
      clienteTipo,
      clienteUsuarioId: payload.cliente_usuario_id,
      transaction,
    });
    const lineaPlan = conceptos.find((item) => item.tipo === "plan");
    if (lineaPlan && clienteTipo !== "alumno") {
      throw new CobroOperacionError(
        "Para cobrar un plan debe seleccionar un alumno.",
      );
    }
    const configuracionMembresiaMigracion =
      await prepararConfiguracionMembresiaMigracionCobro({
        configuracion: payload.membresia_migracion,
        conceptos,
        lineaPlan,
        alumno,
        sedeId,
        transaction,
      });
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

    const solicitaPagoParcial =
      payload.pago_parcial === true || Number(payload.pago_parcial) === 1;
    if (
      solicitaPagoParcial &&
      !["alumno", "empleado"].includes(String(clienteTipo))
    ) {
      throw new CobroOperacionError(
        "Solo se puede dejar deuda a un alumno o empleado identificado.",
        409,
        "FIADO_REQUIERE_CLIENTE",
      );
    }

    const pagosResueltos = await resolverPagos({
      pagos: payload.pagos,
      total: resumen.total,
      permitirSinPagos: solicitaPagoParcial,
      transaction,
    });
    const pagos = pagosResueltos.pagos;
    const totalPagado = pagosResueltos.totalPagado;
    const esPagoParcial = totalPagado + 0.009 < resumen.total;

    if (esPagoParcial) {
      if (!solicitaPagoParcial) {
        throw new CobroOperacionError(
          "La suma de los medios de pago debe coincidir con el total del cobro.",
        );
      }
      if (conceptos.some((item) => item.tipo === "deuda")) {
        throw new CobroOperacionError(
          "No se puede volver a fiar el pago de una deuda existente.",
          409,
          "DEUDA_NO_REFIABLE",
        );
      }
    }
    const distribucionPago = distribuirPagoConceptos({
      conceptos,
      totalPagado,
    });

    const consumoSaldo = await prepararConsumoSaldo({
      pagos,
      clienteTipo,
      alumnoId: alumno?.id,
      clienteUsuarioId: payload.cliente_usuario_id,
      transaction,
    });
    const vueltoSaldo = prepararVueltoSaldo({
      config: payload.vuelto_saldo,
      pagos,
      clienteTipo,
      alumnoId: alumno?.id,
      clienteUsuarioId: payload.cliente_usuario_id,
      solicitaPagoParcial: esPagoParcial,
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
              totalPagado <= 0.009
                ? `Venta fiada; deuda ${redondear(
                    resumen.total - totalPagado,
                  ).toFixed(2)}`
                : `Pago parcial ${totalPagado.toFixed(2)}; deuda ${redondear(
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
      sedeId,
      usuarioId,
      cobroId: cobro.id,
      transaction,
    });

    let pagoPlan = null;
    let pagoDeuda = null;
    const medioPagoPlan =
      pagos.find((item) => !item.es_saldo_favor) || pagos[0] || null;
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
        const resultadoPlan = configuracionMembresiaMigracion
          ? await crearMembresiaPlanMigracionCobrada({
              alumno,
              sedeId,
              linea,
              configuracion: configuracionMembresiaMigracion,
              estadoCobro,
              montoPagado: distribucionPago.pagosPlan.get(linea) || 0,
              medioPagoId: medioPagoPlan?.medio_pago_id || null,
              usuarioId,
              cobroId: cobro.id,
              transaction,
            })
          : await crearMembresiaPlan({
              alumno,
              sedeId,
              linea,
              estadoCobro,
              montoPagado: distribucionPago.pagosPlan.get(linea) || 0,
              medioPagoId: medioPagoPlan?.medio_pago_id || null,
              usuarioId,
              cobroId: cobro.id,
              renovacionExplicita,
              transaction,
            });
        pagoPlan = resultadoPlan.pago;
        await detalle.update(
          {
            membresia_id: Number(resultadoPlan.membresia.id),
            mensualidad_id: Number(resultadoPlan.mensualidad.id),
            pago_id: resultadoPlan.pago?.id
              ? Number(resultadoPlan.pago.id)
              : null,
          },
          { transaction },
        );
      }

      if (linea.tipo === "deuda") {
        if (clienteTipo === "empleado") {
          // La aplicación a deuda del empleado queda trazada por este mismo
          // cobro/detalle. El saldo se deriva del cobro original y de todos
          // los cobros de deuda confirmados, evitando una segunda contabilidad.
          if (!idValido(payload.cliente_usuario_id)) {
            throw new CobroOperacionError(
              "Debe seleccionar un empleado válido para saldar la deuda.",
              409,
              "DEUDA_REQUIERE_EMPLEADO",
            );
          }
        } else {
          const resultadoDeuda = await crearPagoDeudaCobro({
            alumno,
            sedeId,
            linea,
            estadoCobro,
            medioPagoId: medioPagoPlan.medio_pago_id,
            usuarioId,
            cobroId: cobro.id,
            transaction,
          });
          pagoDeuda = resultadoDeuda.pago;
          await detalle.update(
            {
              membresia_id: resultadoDeuda.membresiaId,
              mensualidad_id: Number(resultadoDeuda.mensualidad.id),
              pago_id: Number(resultadoDeuda.pago.id),
            },
            { transaction },
          );
        }
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
      if (esPagoParcial && distribucionPago.deudaNoPlan > 0.009) {
        await crearDeudaFiadaCobro({
          cobro,
          conceptos: distribucionPago.conceptosNoPlan,
          totalPagado: distribucionPago.pagadoNoPlan,
          montoDeuda: distribucionPago.deudaNoPlan,
          usuarioId,
          transaction,
        });
      }

      const pagoAlumno = conceptos.length === 1 ? pagoPlan || pagoDeuda : null;
      const esCobroExclusivoDeAlumno = Boolean(pagoAlumno);
      let movimientoFinanciero = null;
      if (totalPagado > 0.009) {
        movimientoFinanciero = await FinanzasMovimientosModel.create(
          {
            sede_id: sedeId,
            categoria_id: null,
            pago_id: esCobroExclusivoDeAlumno ? Number(pagoAlumno.id) : null,
            tipo: "ingreso",
            fecha: fechaArgentina(),
            descripcion: `Cobro #${cobro.id}`,
            monto: totalPagado.toFixed(2),
            origen: esCobroExclusivoDeAlumno ? "pago_alumno" : "manual",
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
      }

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

      if (vueltoSaldo) {
        const nombreClienteSaldo =
          clienteTipo === "alumno"
            ? [alumno?.nombre, alumno?.apellido].filter(Boolean).join(" ").trim()
            : [empleado?.nombre, empleado?.apellido].filter(Boolean).join(" ").trim();
        await aplicarVueltoSaldo({
          vuelto: vueltoSaldo,
          cobro,
          clienteTipo,
          alumnoId: alumno?.id,
          clienteUsuarioId: payload.cliente_usuario_id,
          clienteNombre: nombreClienteSaldo,
          sedeId,
          usuarioId,
          sesion,
          transaction,
        });
        const obsVuelto = `[VUELTO A SALDO ${Number(vueltoSaldo.monto).toFixed(2)}]`;
        await cobro.update(
          {
            observaciones: [cobro.observaciones, obsVuelto]
              .filter(Boolean)
              .join(" | ")
              .slice(0, 500),
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


// Benjamin Orellana - 2026/08/19 - Preanálisis centralizado de anulación.
// La misma lectura se reutiliza al ejecutar la transacción para que la UI pueda
// explicar qué se revertirá y el backend siga siendo la fuente de verdad.
const construirAnalisisAnulacionCobro = async ({
  cobro,
  detalles,
  pagosCobro,
  sedeId,
  transaction,
}) => {
  const impactos = [];
  const bloqueos = [];
  const advertencias = [];
  const noSeModifica = [
    "Otros cobros y pagos no vinculados a esta operación.",
    "Membresías, deudas y saldos del alumno que pertenezcan a otros cobros.",
  ];

  const agregarImpacto = (impacto) => impactos.push(impacto);
  const agregarBloqueo = (code, titulo, detalle = null, metadata = {}) => {
    if (bloqueos.some((item) => item.code === code && item.titulo === titulo)) return;
    bloqueos.push({ code, titulo, detalle, ...metadata });
  };
  const agregarAdvertencia = (titulo, detalle = null) =>
    advertencias.push({ titulo, detalle });

  const [clienteRow] = await db.query(
    `SELECT
       CASE
         WHEN c.cliente_tipo = 'alumno' THEN CONCAT_WS(' ', a.nombre, a.apellido)
         WHEN c.cliente_tipo = 'empleado' THEN CONCAT_WS(' ', u.nombre, u.apellido)
         ELSE 'Cobro sin cliente'
       END AS cliente_nombre
     FROM cobros_cobros c
     LEFT JOIN alumnos_alumnos a ON a.id = c.alumno_id
     LEFT JOIN usuarios_usuarios u ON u.id = c.cliente_usuario_id
     WHERE c.id = :cobroId
     LIMIT 1`,
    {
      replacements: { cobroId: Number(cobro.id) },
      type: QueryTypes.SELECT,
      transaction,
    },
  );

  if (cobro.estado === "anulado") {
    agregarBloqueo(
      "COBRO_YA_ANULADO",
      "El cobro ya se encuentra anulado.",
      cobro.motivo_anulacion || null,
    );
  } else if (cobro.estado !== "confirmado") {
    agregarBloqueo(
      "ESTADO_COBRO_INVALIDO",
      "Solo pueden anularse cobros confirmados.",
      `Estado actual: ${cobro.estado}.`,
    );
  }

  const pagosIncompatibles = (pagosCobro || []).filter(
    (pago) => !["confirmado", "anulado"].includes(String(pago.estado)),
  );
  if (pagosIncompatibles.length > 0) {
    agregarBloqueo(
      "PAGOS_COBRO_INCONSISTENTES",
      "Hay medios de pago con un estado incompatible con la anulación.",
      pagosIncompatibles
        .map((pago) => `Pago #${pago.id}: ${pago.estado}`)
        .join(" · "),
    );
  }

  const pagosConfirmados = (pagosCobro || []).filter(
    (pago) => String(pago.estado) === "confirmado",
  );
  const medioSaldo = await PagosMediosPagoModel.findOne({
    where: { codigo: CODIGO_SALDO_FAVOR },
    transaction,
  });
  const mediosIds = [...new Set(pagosConfirmados.map((pago) => Number(pago.medio_pago_id)).filter(idValido))];
  const medios = mediosIds.length
    ? await PagosMediosPagoModel.findAll({
        where: { id: { [Op.in]: mediosIds } },
        transaction,
      })
    : [];
  const medioPorId = new Map(medios.map((medio) => [Number(medio.id), medio]));

  const totalPagado = redondear(
    pagosConfirmados.reduce((suma, pago) => suma + Number(pago.monto || 0), 0),
  );
  if (totalPagado > 0.009) {
    const detalleMedios = pagosConfirmados
      .map((pago) => {
        const medio = medioPorId.get(Number(pago.medio_pago_id));
        return `${medio?.nombre || `Medio #${pago.medio_pago_id}`}: ${Number(pago.monto || 0).toFixed(2)}`;
      })
      .join(" · ");
    agregarImpacto({
      tipo: "pagos",
      titulo: "Pagos del cobro",
      detalle: `Se marcarán como anulados${detalleMedios ? ` · ${detalleMedios}` : ""}.`,
      monto: totalPagado,
    });
  } else {
    agregarAdvertencia(
      "El cobro no tiene dinero confirmado para revertir.",
      "Puede tratarse de una venta 100% fiada o de una anulación ya parcialmente sincronizada.",
    );
  }

  const pagosSaldoFavor = medioSaldo
    ? pagosConfirmados.filter(
        (pago) => Number(pago.medio_pago_id) === Number(medioSaldo.id),
      )
    : [];
  const totalSaldoFavor = redondear(
    pagosSaldoFavor.reduce((suma, pago) => suma + Number(pago.monto || 0), 0),
  );
  if (totalSaldoFavor > 0.009) {
    agregarImpacto({
      tipo: "saldo_favor",
      titulo: "Saldo a favor",
      detalle: "El importe consumido vuelve a acreditarse en la cuenta del cliente.",
      monto: totalSaldoFavor,
    });
  }

  const vueltoSaldoAnalisis = await obtenerVueltoSaldoCobro({ cobro, transaction });
  let movimientoCajaVuelto = null;
  if (vueltoSaldoAnalisis) {
    const montoVuelto = Number(vueltoSaldoAnalisis.movimiento.monto || 0);
    const saldoActualVuelto = Number(vueltoSaldoAnalisis.cuenta?.saldo || 0);
    if (!vueltoSaldoAnalisis.cuenta || saldoActualVuelto + 0.009 < montoVuelto) {
      agregarBloqueo(
        "VUELTO_SALDO_CONSUMIDO",
        "El vuelto dejado a favor ya fue utilizado.",
        `Se necesitan ${montoVuelto.toFixed(2)} disponibles para revertir ese saldo antes de anular.`,
      );
    } else {
      agregarImpacto({
        tipo: "vuelto_saldo",
        titulo: "Vuelto dejado a favor",
        detalle: "Se descontará de la cuenta del cliente y se compensará el efectivo adicional en Caja.",
        monto: montoVuelto,
      });
    }
    movimientoCajaVuelto = await CajasMovimientosModel.findOne({
      where: { referencia: vueltoSaldoAnalisis.referencia, estado: "vigente" },
      transaction,
    });
  }

  const pagosCajaIds = pagosConfirmados
    .filter(
      (pago) =>
        !medioSaldo || Number(pago.medio_pago_id) !== Number(medioSaldo.id),
    )
    .map((pago) => Number(pago.id));

  let movimientosCajaARevertir = [];
  if (pagosCajaIds.length > 0) {
    const originales = await CajasMovimientosModel.findAll({
      where: {
        cobro_pago_id: { [Op.in]: pagosCajaIds },
        origen: "cobro",
        estado: "vigente",
      },
      transaction,
    });
    const reversiones = await CajasMovimientosModel.findAll({
      where: {
        cobro_pago_id: { [Op.in]: pagosCajaIds },
        origen: "reversion",
        referencia: `ANULACION-COBRO-${cobro.id}`,
        estado: "vigente",
      },
      transaction,
    });
    const pagosYaRevertidos = new Set(
      reversiones.map((movimiento) => Number(movimiento.cobro_pago_id)),
    );
    movimientosCajaARevertir = originales.filter(
      (movimiento) => !pagosYaRevertidos.has(Number(movimiento.cobro_pago_id)),
    );
  }

  const totalCaja = redondear(
    movimientosCajaARevertir.reduce(
      (suma, movimiento) => suma + Number(movimiento.monto || 0),
      Number(movimientoCajaVuelto?.monto || 0),
    ),
  );
  const cantidadMovimientosCajaARevertir =
    movimientosCajaARevertir.length + (movimientoCajaVuelto ? 1 : 0);
  let sesionAbierta = null;
  if (cantidadMovimientosCajaARevertir > 0) {
    sesionAbierta = await CajasSesionesModel.findOne({
      where: { sede_id: Number(sedeId), estado: "abierta" },
      order: [["fecha_apertura", "DESC"], ["id", "DESC"]],
      transaction,
    });

    if (!sesionAbierta) {
      agregarBloqueo(
        "CAJA_CERRADA",
        "Debe existir una caja abierta para registrar la reversión.",
        `Hay ${cantidadMovimientosCajaARevertir} movimiento${cantidadMovimientosCajaARevertir === 1 ? "" : "s"} de caja por compensar.`,
      );
    } else {
      agregarImpacto({
        tipo: "caja",
        titulo: "Caja",
        detalle: `Se registrará ${cantidadMovimientosCajaARevertir === 1 ? "un movimiento compensatorio" : `${cantidadMovimientosCajaARevertir} movimientos compensatorios`} en la caja abierta #${sesionAbierta.id}.`,
        monto: totalCaja,
      });

      const esEntreTurnos = movimientosCajaARevertir.some(
        (movimiento) => Number(movimiento.caja_sesion_id) !== Number(sesionAbierta.id),
      );
      if (esEntreTurnos) {
        agregarAdvertencia(
          "La venta pertenece a otra sesión de caja.",
          `La sesión original se conserva como historial y la compensación se registrará en la caja abierta #${sesionAbierta.id}.`,
        );
      }
    }
  }

  const movimientoOriginalFinanzas = cobro.finanzas_movimiento_id
    ? await FinanzasMovimientosModel.findByPk(cobro.finanzas_movimiento_id, {
        transaction,
      })
    : await FinanzasMovimientosModel.findOne({
        where: { referencia: `COBRO-${cobro.id}` },
        transaction,
      });
  const movimientoReversionExistente = await FinanzasMovimientosModel.findOne({
    where: {
      referencia: `ANULACION-COBRO-${cobro.id}`,
      estado: "vigente",
    },
    transaction,
  });
  if (
    totalPagado > 0.009 &&
    movimientoOriginalFinanzas?.estado === "vigente" &&
    !movimientoReversionExistente
  ) {
    agregarImpacto({
      tipo: "finanzas",
      titulo: "Finanzas",
      detalle: "Se generará un egreso compensatorio vinculado a la anulación.",
      monto: totalPagado,
    });
  } else if (totalPagado > 0.009 && movimientoReversionExistente) {
    agregarAdvertencia(
      "La reversión financiera ya existe.",
      `Movimiento #${movimientoReversionExistente.id}; no se generará un duplicado.`,
    );
  } else if (totalPagado > 0.009 && !movimientoOriginalFinanzas) {
    agregarAdvertencia(
      "No se encontró un movimiento financiero original.",
      "La anulación continuará con los demás impactos y no inventará una reversión financiera.",
    );
  }

  // Deuda de empleado: la venta original es la cuenta de origen y los
  // cobros posteriores con detalle tipo deuda son sus aplicaciones.
  if (cobro.cliente_tipo === "empleado") {
    const dependenciasEmpleado = await db.query(
      `SELECT
         c2.id AS cobro_id,
         c2.total AS total_cobro,
         c2.estado,
         c2.fecha_cobro,
         SUM(cd2.total) AS monto_aplicado
       FROM cobros_detalles cd2
       INNER JOIN cobros_cobros c2 ON c2.id = cd2.cobro_id
       WHERE cd2.tipo = 'deuda'
         AND cd2.referencia_id = :cobroOrigenId
         AND c2.cliente_tipo = 'empleado'
         AND c2.cliente_usuario_id = :clienteUsuarioId
         AND c2.sede_id = :sedeId
         AND c2.estado IN ('confirmado','pendiente_validacion')
       GROUP BY c2.id, c2.total, c2.estado, c2.fecha_cobro
       ORDER BY c2.id ASC`,
      {
        replacements: {
          cobroOrigenId: Number(cobro.id),
          clienteUsuarioId: Number(cobro.cliente_usuario_id || 0),
          sedeId: Number(sedeId),
        },
        type: QueryTypes.SELECT,
        transaction,
      },
    );
    if (dependenciasEmpleado.length > 0) {
      agregarBloqueo(
        "DEUDA_EMPLEADO_CON_PAGOS",
        "La deuda generada por esta venta ya recibió pagos.",
        `Para anular este cobro, anulá primero ${dependenciasEmpleado
          .map((item) => `#${item.cobro_id}`)
          .join(", ")}.`,
        {
          dependencias: dependenciasEmpleado.map((item) => ({
            cobro_id: Number(item.cobro_id),
            total: Number(item.total_cobro || 0),
            monto_aplicado: Number(item.monto_aplicado || 0),
            estado: item.estado,
            fecha_cobro: item.fecha_cobro,
            motivo: "Pago posterior de deuda de empleado",
          })),
        },
      );
    } else {
      const pagoInicialEmpleado = redondear(
        (pagosCobro || [])
          .filter((pago) => String(pago.estado) === "confirmado")
          .reduce((suma, pago) => suma + Number(pago.monto || 0), 0),
      );
      const saldoEmpleado = redondear(
        Math.max(Number(cobro.total || 0) - pagoInicialEmpleado, 0),
      );
      if (saldoEmpleado > 0.009) {
        agregarImpacto({
          tipo: "deuda_empleado",
          titulo: "Saldo deudor del empleado",
          detalle: "La deuda desaparecerá junto con la venta anulada.",
          monto: saldoEmpleado,
        });
      }
    }
  }

  const deudaFiada = idValido(cobro.alumno_id)
    ? await obtenerDeudaFiadaCobro({
        cobroId: cobro.id,
        alumnoId: cobro.alumno_id,
        sedeId,
        transaction,
        bloquear: false,
      })
    : null;
  if (deudaFiada && deudaFiada.estado !== "anulada") {
    const pagosDeuda = await PagosModel.findAll({
      where: {
        mensualidad_id: Number(deudaFiada.id),
        estado: { [Op.in]: ["confirmado", "pendiente_validacion"] },
      },
      transaction,
    });
    if (pagosDeuda.length > 0) {
      const cobrosPagadores = await db.query(
        `SELECT
           cd.cobro_id,
           c.total AS total_cobro,
           c.estado,
           c.fecha_cobro,
           SUM(cd.total) AS monto_aplicado
         FROM cobros_detalles cd
         INNER JOIN cobros_cobros c ON c.id = cd.cobro_id
         WHERE cd.pago_id IN (:pagosIds)
         GROUP BY cd.cobro_id, c.total, c.estado, c.fecha_cobro
         ORDER BY cd.cobro_id ASC`,
        {
          replacements: { pagosIds: pagosDeuda.map((pago) => Number(pago.id)) },
          type: QueryTypes.SELECT,
          transaction,
        },
      );
      agregarBloqueo(
        "DEUDA_FIADA_CON_PAGOS",
        "La deuda generada por esta venta ya recibió pagos.",
        cobrosPagadores.length
          ? `Para anular este cobro, anulá primero ${cobrosPagadores.map((item) => `#${item.cobro_id}`).join(", ")}.`
          : "Primero anulá los pagos aplicados a esa deuda.",
        {
          dependencias: cobrosPagadores.map((item) => ({
            cobro_id: Number(item.cobro_id),
            total: Number(item.total_cobro || 0),
            monto_aplicado: Number(item.monto_aplicado || 0),
            estado: item.estado,
            fecha_cobro: item.fecha_cobro,
            motivo: "Pago posterior de la deuda generada por este cobro",
          })),
        },
      );
    } else {
      agregarImpacto({
        tipo: "deuda_fiada",
        titulo: "Saldo deudor generado",
        detalle: `Se anulará la deuda administrativa #${deudaFiada.id} originada por esta venta.`,
        monto: Number(deudaFiada.saldo || deudaFiada.monto_total || 0),
      });
    }
  }

  for (const detalle of detalles || []) {
    if (detalle.tipo === "producto") {
      const salida = await ProductosStockMovimientosModel.findOne({
        where: {
          referencia_tipo: "cobro_detalle",
          referencia_id: Number(detalle.id),
          tipo: "egreso_venta",
        },
        transaction,
      });
      const devolucionExistente = await ProductosStockMovimientosModel.findOne({
        where: {
          referencia_tipo: "cobro_anulacion",
          referencia_id: Number(detalle.id),
          tipo: "devolucion",
        },
        transaction,
      });
      if (salida && !devolucionExistente) {
        agregarImpacto({
          tipo: "stock",
          titulo: detalle.nombre_snapshot || "Producto",
          detalle: `Se devolverán ${Number(detalle.cantidad || 0)} unidad${Number(detalle.cantidad || 0) === 1 ? "" : "es"} al stock de la sede.`,
          cantidad: Number(detalle.cantidad || 0),
          referencia_id: Number(detalle.referencia_id),
        });
      } else if (devolucionExistente) {
        agregarAdvertencia(
          `El stock de ${detalle.nombre_snapshot || "un producto"} ya fue devuelto.`,
          `Movimiento #${devolucionExistente.id}; no se duplicará la devolución.`,
        );
      }
      continue;
    }

    if (detalle.tipo === "deuda") {
      if (cobro.cliente_tipo === "empleado") {
        agregarImpacto({
          tipo: "deuda_empleado",
          titulo: "Pago de deuda del empleado",
          detalle: `Se reabrirá ${Number(detalle.total || 0).toFixed(2)} del saldo de la compra #${detalle.referencia_id}.`,
          monto: Number(detalle.total || 0),
        });
        continue;
      }
      const mensualidad = detalle.mensualidad_id
        ? await PagosMensualidadesModel.findByPk(detalle.mensualidad_id, { transaction })
        : null;
      const pago = detalle.pago_id
        ? await PagosModel.findByPk(detalle.pago_id, { transaction })
        : null;
      if (!mensualidad || !pago) {
        agregarBloqueo(
          "DEUDA_INCOMPLETA",
          "El cobro no conserva todos los registros de la deuda.",
          detalle.nombre_snapshot || null,
        );
      } else if (pago.estado === "confirmado") {
        agregarImpacto({
          tipo: "deuda",
          titulo: "Pago de deuda",
          detalle: `Se reabrirá el saldo de la deuda #${mensualidad.id}.`,
          monto: Number(pago.monto || detalle.total || 0),
        });
      } else if (pago.estado !== "anulado") {
        agregarBloqueo(
          "DEUDA_PAGO_INVALIDO",
          "El pago asociado a una deuda no está confirmado.",
          `Pago #${pago.id}: ${pago.estado}.`,
        );
      }
      continue;
    }

    if (detalle.tipo === "plan") {
      const membresia = detalle.membresia_id
        ? await AlumnosMembresiasModel.findByPk(detalle.membresia_id, { transaction })
        : null;
      const mensualidad = detalle.mensualidad_id
        ? await PagosMensualidadesModel.findByPk(detalle.mensualidad_id, { transaction })
        : null;
      const pagoOriginal = detalle.pago_id
        ? await PagosModel.findByPk(detalle.pago_id, { transaction })
        : null;

      if (!membresia || !mensualidad) {
        agregarBloqueo(
          "PLAN_INCOMPLETO",
          "El cobro no conserva todos los registros del plan.",
          detalle.nombre_snapshot || null,
        );
        continue;
      }

      // Benjamin Orellana - 2026/08/24 - CORRECCION_ADMIN_SIN_BLOQUEO_POR_USO
      // Las clases/asistencias históricas NO impiden corregir un cobro.
      // Si la membresía ya tuvo uso, la reversión financiera continúa pero la
      // membresía y sus créditos se conservan para no destruir el historial ni
      // dejar al alumno sin el ciclo que efectivamente está utilizando.
      const clasesUsadasMembresia = Number(membresia.clases_usadas || 0);
      if (clasesUsadasMembresia > 0) {
        agregarAdvertencia(
          "La membresía ya tiene clases consumidas; no bloquea la anulación.",
          `Membresía #${membresia.id}: ${clasesUsadasMembresia} clases usadas. Se conservarán la membresía y sus créditos.`,
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
      const cantidadAsistencias = Number(asistencias[0]?.cantidad || 0);
      if (cantidadAsistencias > 0) {
        agregarAdvertencia(
          "La membresía tiene asistencias registradas; se conserva el historial.",
          `Membresía #${membresia.id}: ${cantidadAsistencias} asistencia${cantidadAsistencias === 1 ? "" : "s"}. Esto no impide anular el cobro.`,
        );
      }

      const pagosMensualidad = await PagosModel.findAll({
        where: {
          mensualidad_id: Number(mensualidad.id),
          estado: { [Op.in]: ["confirmado", "pendiente_validacion"] },
        },
        transaction,
      });
      const pagosPosteriores = pagosMensualidad.filter(
        (pago) => !idValido(detalle.pago_id) || Number(pago.id) !== Number(detalle.pago_id),
      );
      if (pagosPosteriores.length > 0) {
        const cobrosPagadores = await db.query(
          `SELECT
             cd.cobro_id,
             c.total AS total_cobro,
             c.estado,
             c.fecha_cobro,
             SUM(cd.total) AS monto_aplicado
           FROM cobros_detalles cd
           INNER JOIN cobros_cobros c ON c.id = cd.cobro_id
           WHERE cd.pago_id IN (:pagosIds)
           GROUP BY cd.cobro_id, c.total, c.estado, c.fecha_cobro
           ORDER BY cd.cobro_id ASC`,
          {
            replacements: { pagosIds: pagosPosteriores.map((pago) => Number(pago.id)) },
            type: QueryTypes.SELECT,
            transaction,
          },
        );
        agregarBloqueo(
          "PLAN_CON_PAGOS_POSTERIORES",
          "La cuota del plan recibió pagos posteriores a este cobro.",
          cobrosPagadores.length
            ? `Para anular este plan, anulá primero ${cobrosPagadores.map((item) => `#${item.cobro_id}`).join(", ")}.`
            : `Mensualidad #${mensualidad.id} tiene pagos adicionales.`,
          {
            dependencias: cobrosPagadores.map((item) => ({
              cobro_id: Number(item.cobro_id),
              total: Number(item.total_cobro || 0),
              monto_aplicado: Number(item.monto_aplicado || 0),
              estado: item.estado,
              fecha_cobro: item.fecha_cobro,
              motivo: `Pago posterior de la cuota #${mensualidad.id}`,
            })),
          },
        );
      }
      if (!pagoOriginal && Number(mensualidad.monto_pagado || 0) > 0.009) {
        agregarBloqueo(
          "PLAN_PAGO_INCONSISTENTE",
          "La mensualidad registra pagos que no pertenecen al cobro original.",
          `Mensualidad #${mensualidad.id}: pagado ${Number(mensualidad.monto_pagado || 0).toFixed(2)}.`,
        );
      }

      const preservarMembresiaPorUso =
        clasesUsadasMembresia > 0 || cantidadAsistencias > 0;
      agregarImpacto({
        tipo: "plan",
        titulo: detalle.nombre_snapshot || "Plan",
        detalle: preservarMembresiaPorUso
          ? `Se anularán la cuota #${mensualidad.id} y su pago, pero se conservará la membresía #${membresia.id} con sus créditos e historial.`
          : `Se cancelará la membresía #${membresia.id} y se anulará la cuota #${mensualidad.id}.`,
        monto: Number(mensualidad.saldo || 0),
      });
      if (
        !preservarMembresiaPorUso &&
        String(membresia.observaciones || "").includes("NUEVO_CICLO_RENOVACION_EXPLICITA")
      ) {
        agregarImpacto({
          tipo: "plan_restauracion",
          titulo: "Ciclo anterior",
          detalle: "Si corresponde por vigencia, se restaurará la membresía anterior que fue reemplazada por esta renovación.",
        });
      }
    }
  }

  const tienePlan = (detalles || []).some((detalle) => detalle.tipo === "plan");
  if ((pagosCobro || []).length === 0 && !deudaFiada && !tienePlan) {
    agregarBloqueo(
      "PAGOS_COBRO_INCONSISTENTES",
      "El cobro no conserva pagos ni una deuda vinculada que permita reconstruir la anulación.",
    );
  }

  agregarImpacto({
    tipo: "cobro",
    titulo: `Cobro #${cobro.id}`,
    detalle: "La cabecera quedará marcada como anulada con usuario, fecha y motivo.",
    monto: Number(cobro.total || 0),
  });

  return {
    cobro: {
      id: Number(cobro.id),
      sede_id: Number(cobro.sede_id),
      caja_sesion_id: Number(cobro.caja_sesion_id),
      alumno_id: cobro.alumno_id ? Number(cobro.alumno_id) : null,
      cliente_tipo: cobro.cliente_tipo,
      cliente_nombre: clienteRow?.cliente_nombre || "Cobro sin cliente",
      fecha_cobro: cobro.fecha_cobro,
      total: Number(cobro.total || 0),
      estado: cobro.estado,
      total_pagado: totalPagado,
      saldo_pendiente: redondear(Math.max(Number(cobro.total || 0) - totalPagado, 0)),
    },
    impactos,
    bloqueos,
    advertencias,
    no_se_modifica: noSeModifica,
    requiere_caja: cantidadMovimientosCajaARevertir > 0,
    caja_abierta: sesionAbierta
      ? { id: Number(sesionAbierta.id), caja_id: Number(sesionAbierta.caja_id) }
      : null,
    total_reversion_caja: totalCaja,
    total_reversion_finanzas:
      movimientoOriginalFinanzas?.estado === "vigente" && !movimientoReversionExistente
        ? totalPagado
        : 0,
    puede_anular: bloqueos.length === 0,
  };
};

export const analizarAnulacionCobro = async ({ cobroId, sedeId }) => {
  const transaction = await db.transaction();
  try {
    const cobro = await cargarCobroBloqueado({ cobroId, sedeId, transaction });
    const [detalles, pagosCobro] = await Promise.all([
      CobrosDetallesModel.findAll({
        where: { cobro_id: Number(cobro.id) },
        transaction,
      }),
      CobrosPagosModel.findAll({
        where: { cobro_id: Number(cobro.id) },
        transaction,
      }),
    ]);
    const analisis = await construirAnalisisAnulacionCobro({
      cobro,
      detalles,
      pagosCobro,
      sedeId: Number(sedeId),
      transaction,
    });
    await transaction.commit();
    return analisis;
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

// Benjamin Orellana - 2026/08/11 - Determina el estado de una mensualidad luego de imputar/revertir un pago.
const estadoMensualidadSegunSaldo = ({ montoTotal, montoPagado, fechaVencimiento }) => {
  const total = redondear(Number(montoTotal || 0));
  const pagado = redondear(Number(montoPagado || 0));
  const saldo = redondear(Math.max(total - pagado, 0));
  if (saldo <= 0.009) return "pagada";
  if (fechaVencimiento && String(fechaVencimiento).slice(0, 10) < fechaArgentina()) {
    return "vencida";
  }
  if (pagado > 0.009) return "parcial";
  return "pendiente";
};

// Benjamin Orellana - 2026/08/11 - Mantiene el mismo criterio operativo del módulo Pagos
// cuando una deuda se cobra desde el drawer central. No crea un segundo saldo paralelo.
const sincronizarEstadosDeuda = async ({ mensualidad, usuarioId, transaction }) => {
  const membresia = mensualidad.membresia_id
    ? await AlumnosMembresiasModel.findByPk(mensualidad.membresia_id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      })
    : null;
  const alumno = await AlumnosModel.findByPk(mensualidad.alumno_id, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!membresia || !alumno) return { membresia, alumno };
  if (["baja", "congelado"].includes(alumno.estado)) return { membresia, alumno };

  const mensualidadPagada = Number(mensualidad.saldo || 0) <= 0.009;
  const otraDeudaPendiente = mensualidadPagada
    ? await PagosMensualidadesModel.findOne({
        where: {
          id: { [Op.ne]: Number(mensualidad.id) },
          alumno_id: Number(mensualidad.alumno_id),
          membresia_id: Number(mensualidad.membresia_id),
          estado: { [Op.in]: ["pendiente", "parcial", "vencida"] },
          saldo: { [Op.gt]: 0 },
        },
        transaction,
      })
    : null;
  if (mensualidadPagada && !otraDeudaPendiente) {
    await membresia.update(
      { estado: "activa", updated_at: new Date() },
      { transaction },
    );
    await imputarReservasPendientesMembresia({ membresia, transaction });
    await alumno.update(
      {
        estado: "activo",
        sede_id: Number(membresia.sede_id),
        fecha_inicio: alumno.fecha_inicio || membresia.fecha_inicio,
        usuario_validacion_id:
          alumno.usuario_validacion_id || Number(usuarioId) || null,
        updated_at: new Date(),
      },
      { transaction },
    );
  } else {
    await membresia.update(
      { estado: "pendiente_pago", updated_at: new Date() },
      { transaction },
    );
    await alumno.update(
      {
        estado: "pendiente_pago",
        sede_id: Number(membresia.sede_id),
        updated_at: new Date(),
      },
      { transaction },
    );
  }

  return { membresia, alumno };
};

const aplicarImporteDeudaEnMensualidad = async ({
  mensualidad,
  monto,
  usuarioId,
  transaction,
}) => {
  const importe = redondear(Number(monto || 0));
  const saldoActual = redondear(Number(mensualidad.saldo || 0));
  if (!Number.isFinite(importe) || importe <= 0) {
    throw new CobroOperacionError("El importe de la deuda a saldar no es válido.");
  }
  if (importe - saldoActual > 0.009) {
    throw new CobroOperacionError(
      "El importe a saldar supera el saldo pendiente actual de la deuda.",
      409,
      "DEUDA_SALDO_CAMBIO",
    );
  }

  const nuevoPagado = redondear(Number(mensualidad.monto_pagado || 0) + importe);
  const nuevoSaldo = redondear(Math.max(Number(mensualidad.monto_total || 0) - nuevoPagado, 0));
  await mensualidad.update(
    {
      monto_pagado: nuevoPagado.toFixed(2),
      saldo: nuevoSaldo.toFixed(2),
      estado: estadoMensualidadSegunSaldo({
        montoTotal: mensualidad.monto_total,
        montoPagado: nuevoPagado,
        fechaVencimiento: mensualidad.fecha_vencimiento,
      }),
      updated_at: new Date(),
    },
    { transaction },
  );
  await sincronizarEstadosDeuda({ mensualidad, usuarioId, transaction });
};

const crearPagoDeudaCobro = async ({
  alumno,
  sedeId,
  linea,
  estadoCobro,
  medioPagoId,
  usuarioId,
  cobroId,
  transaction,
}) => {
  if (linea.tipo !== "deuda") return null;

  const mensualidad = await PagosMensualidadesModel.findOne({
    where: {
      id: Number(linea.mensualidad_id || linea.referencia_id),
      alumno_id: Number(alumno.id),
      sede_id: Number(sedeId),
      estado: { [Op.in]: ["pendiente", "parcial", "vencida"] },
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!mensualidad || Number(mensualidad.saldo || 0) <= 0) {
    throw new CobroOperacionError(
      "La deuda seleccionada ya fue saldada o dejó de estar disponible.",
      409,
      "DEUDA_NO_DISPONIBLE",
    );
  }

  // Reserva operativa: los pagos pendientes de validación todavía no reducen
  // pagos_mensualidades.saldo, pero sí deben descontarse del importe cobrable.
  // La mensualidad está bloqueada FOR UPDATE, por lo que también evita dos
  // cobros concurrentes sobre el mismo saldo.
  const montoEnValidacion = redondear(
    Number(
      (await PagosModel.sum("monto", {
        where: {
          mensualidad_id: Number(mensualidad.id),
          estado: "pendiente_validacion",
        },
        transaction,
      })) || 0,
    ),
  );
  const saldoDisponible = redondear(
    Math.max(Number(mensualidad.saldo || 0) - montoEnValidacion, 0),
  );
  if (saldoDisponible <= 0.009) {
    throw new CobroOperacionError(
      "La deuda ya tiene su saldo cubierto por un pago pendiente de validación.",
      409,
      "DEUDA_EN_VALIDACION",
    );
  }
  if (Number(linea.total || 0) - saldoDisponible > 0.009) {
    throw new CobroOperacionError(
      "El importe supera el saldo disponible de la deuda. Actualizá las deudas e intentá nuevamente.",
      409,
      "DEUDA_SALDO_RESERVADO",
    );
  }

  const confirmado = estadoCobro === "confirmado";
  const pago = await PagosModel.create(
    {
      mensualidad_id: Number(mensualidad.id),
      alumno_id: Number(alumno.id),
      sede_id: Number(sedeId),
      medio_pago_id: Number(medioPagoId),
      usuario_registro_id: Number(usuarioId),
      usuario_validacion_id: confirmado ? Number(usuarioId) : null,
      fecha_pago: new Date(),
      monto: Number(linea.total).toFixed(2),
      estado: confirmado ? "confirmado" : "pendiente_validacion",
      referencia: `COBRO-${cobroId}`,
      observaciones: `Pago de deuda generado desde cobro #${cobroId}`,
    },
    { transaction },
  );

  if (confirmado) {
    await aplicarImporteDeudaEnMensualidad({
      mensualidad,
      monto: linea.total,
      usuarioId,
      transaction,
    });
  }

  return {
    pago,
    mensualidad,
    membresiaId: mensualidad.membresia_id ? Number(mensualidad.membresia_id) : null,
  };
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
  const esNuevoCicloPorRenovacionExplicita = observacionesMembresia.includes(
    "NUEVO_CICLO_RENOVACION_EXPLICITA",
  );
  const esNuevoCicloPorCupos = observacionesMembresia.includes(
    "NUEVO_CICLO_CUPOS_AGOTADOS",
  );
  const esNuevoCicloPorCambioPlan = observacionesMembresia.includes(
    "NUEVO_CICLO_CAMBIO_PLAN",
  );

  // Si el pago requería validación, las reservas tampoco bloquean al confirmar:
  // se migran al nuevo ciclo antes de cerrar la membresía anterior.

  if (
    esNuevoCicloPorRenovacionExplicita ||
    esNuevoCicloPorCupos ||
    esNuevoCicloPorCambioPlan
  ) {
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
      if (esNuevoCicloPorCambioPlan) {
        await migrarReservasFuturasCambioPlan({
          membresiaAnterior,
          membresiaNueva: membresia,
          cobroId: detalle.cobro_id,
          transaction,
        });
      }
      const observacionesAnteriores = String(
        membresiaAnterior.observaciones || "",
      ).trim();
      await membresiaAnterior.update(
        {
          estado: esNuevoCicloPorCambioPlan ? "cancelada" : "vencida",
          ...(esNuevoCicloPorCambioPlan ? { clases_disponibles: 0 } : {}),
          ...(esNuevoCicloPorRenovacionExplicita
            ? {
                fecha_vencimiento: (() => {
                  const fechaInicioNuevo = String(
                    membresia.fecha_inicio || "",
                  ).slice(0, 10);
                  const fechaCierreConfirmacionRenovacion = sumarDias(
                    fechaInicioNuevo,
                    -1,
                  );
                  const fechaInicioAnterior = String(
                    membresiaAnterior.fecha_inicio || "",
                  ).slice(0, 10);
                  return fechaCierreConfirmacionRenovacion >= fechaInicioAnterior
                    ? fechaCierreConfirmacionRenovacion
                    : fechaInicioAnterior;
                })(),
              }
            : {}),
          observaciones: `${observacionesAnteriores}${
            observacionesAnteriores ? " | " : ""
          }${
            esNuevoCicloPorCambioPlan
              ? `Reemplazada al confirmar cambio de plan del cobro #${detalle.cobro_id}`
              : esNuevoCicloPorRenovacionExplicita
                ? `Cerrada al confirmar renovación explícita del cobro #${detalle.cobro_id}`
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
  await imputarReservasPendientesMembresia({ membresia, transaction });

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

const aplicarDeudaPendiente = async ({ detalle, cobro, usuarioId, transaction }) => {
  if (detalle.tipo !== "deuda") return null;
  // Para empleados no existe una mensualidad artificial: al confirmar el
  // cobro, el detalle pasa automáticamente a computar como pago de la deuda.
  if (cobro?.cliente_tipo === "empleado") return null;

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

  if (!mensualidad || !pago) {
    throw new CobroOperacionError(
      "El cobro pendiente no conserva los registros necesarios para saldar la deuda.",
      409,
      "DEUDA_INCOMPLETA",
    );
  }
  if (pago.estado === "confirmado") return pago;
  if (pago.estado !== "pendiente_validacion") {
    throw new CobroOperacionError(
      "El pago asociado a la deuda ya no está pendiente de validación.",
      409,
      "DEUDA_PAGO_INVALIDO",
    );
  }

  await aplicarImporteDeudaEnMensualidad({
    mensualidad,
    monto: Number(pago.monto),
    usuarioId,
    transaction,
  });
  await pago.update(
    {
      estado: "confirmado",
      usuario_validacion_id: Number(usuarioId),
      updated_at: new Date(),
    },
    { transaction },
  );
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

    // Un cobro confirmado que fue editado puede quedar pendiente porque el
    // nuevo medio requiere validación. En ese caso, los conceptos, el stock y
    // la membresía ya fueron aplicados antes de la edición y no deben volver a
    // impactarse al aprobar el nuevo medio de pago.
    const esRevalidacionDeEdicion = idValido(cobro.finanzas_movimiento_id);

    let pagoPlan = null;
    let pagoDeuda = null;
    if (!esRevalidacionDeEdicion) {
      for (const detalle of detalles) {
        const pagoAplicado = await aplicarPlanPendiente({
          detalle,
          usuarioId,
          transaction,
        });
        if (pagoAplicado) pagoPlan = pagoAplicado;
        const pagoDeudaAplicado = await aplicarDeudaPendiente({
          detalle,
          cobro,
          usuarioId,
          transaction,
        });
        if (pagoDeudaAplicado) pagoDeuda = pagoDeudaAplicado;
        await aplicarStockPendiente({
          detalle,
          sedeId: Number(sedeId),
          usuarioId,
          transaction,
        });
      }
    }

    const saldoPendienteCobro = redondear(
      Math.max(Number(cobro.total || 0) - totalPagado, 0),
    );
    const distribucionPagoPendiente = distribuirPagoConceptos({
      conceptos: detalles,
      totalPagado,
    });
    if (
      !esRevalidacionDeEdicion &&
      saldoPendienteCobro > 0.009 &&
      distribucionPagoPendiente.deudaNoPlan > 0.009 &&
      idValido(cobro.alumno_id)
    ) {
      await crearDeudaFiadaCobro({
        cobro,
        conceptos: distribucionPagoPendiente.conceptosNoPlan,
        totalPagado: distribucionPagoPendiente.pagadoNoPlan,
        montoDeuda: distribucionPagoPendiente.deudaNoPlan,
        usuarioId,
        transaction,
      });
    }

    const pagoAlumno = detalles.length === 1 ? pagoPlan || pagoDeuda : null;
    const esCobroExclusivoDeAlumno = Boolean(pagoAlumno);
    const movimientoFinanciero = esRevalidacionDeEdicion
      ? await FinanzasMovimientosModel.findByPk(
          Number(cobro.finanzas_movimiento_id),
          { transaction, lock: transaction.LOCK.UPDATE },
        )
      : await FinanzasMovimientosModel.create(
          {
            sede_id: Number(sedeId),
            categoria_id: null,
            pago_id: esCobroExclusivoDeAlumno ? Number(pagoAlumno.id) : null,
            tipo: "ingreso",
            fecha: fechaArgentina(),
            descripcion: `Cobro #${cobro.id} validado`,
            monto: totalPagado.toFixed(2),
            origen: esCobroExclusivoDeAlumno ? "pago_alumno" : "manual",
            referencia: `COBRO-${cobro.id}`,
            usuario_registro_id: usuarioId,
            estado: "vigente",
            observaciones:
              observaciones || "Confirmado desde historial de cobros",
          },
          { transaction },
        );

    if (esRevalidacionDeEdicion && movimientoFinanciero) {
      await movimientoFinanciero.update(
        {
          observaciones: [
            movimientoFinanciero.observaciones,
            `[VALIDACIÓN EDICIÓN COBRO] ${
              observaciones || "Medio de pago aprobado"
            }`,
          ]
            .filter(Boolean)
            .join(" | ")
            .slice(0, 500),
          updated_at: new Date(),
        },
        { transaction },
      );
    }

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
        finanzas_movimiento_id: movimientoFinanciero?.id
          ? Number(movimientoFinanciero.id)
          : cobro.finanzas_movimiento_id,
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
      if (detalle.tipo === "deuda") {
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
        continue;
      }
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

const revertirDeudaConfirmada = async ({
  detalle,
  cobro,
  motivo,
  usuarioId,
  transaction,
}) => {
  if (detalle.tipo !== "deuda") return;
  // Para empleados el pago de deuda se deriva del estado de este cobro. Al
  // anularlo deja de computar automáticamente, por lo que no hay otra fila que
  // revertir.
  if (cobro?.cliente_tipo === "empleado") return;

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

  if (!mensualidad || !pago) {
    throw new CobroOperacionError(
      "El cobro no conserva los registros de la deuda y no puede anularse automáticamente.",
      409,
      "DEUDA_INCOMPLETA",
    );
  }
  if (pago.estado === "anulado") return;
  if (pago.estado !== "confirmado") {
    throw new CobroOperacionError(
      "El pago asociado a la deuda no está confirmado.",
      409,
      "DEUDA_PAGO_INVALIDO",
    );
  }

  const nuevoPagado = redondear(
    Math.max(Number(mensualidad.monto_pagado || 0) - Number(pago.monto || 0), 0),
  );
  const nuevoSaldo = redondear(
    Math.max(Number(mensualidad.monto_total || 0) - nuevoPagado, 0),
  );
  await mensualidad.update(
    {
      monto_pagado: nuevoPagado.toFixed(2),
      saldo: nuevoSaldo.toFixed(2),
      estado: estadoMensualidadSegunSaldo({
        montoTotal: mensualidad.monto_total,
        montoPagado: nuevoPagado,
        fechaVencimiento: mensualidad.fecha_vencimiento,
      }),
      updated_at: new Date(),
    },
    { transaction },
  );
  await pago.update(
    {
      estado: "anulado",
      usuario_validacion_id: Number(usuarioId),
      observaciones: [pago.observaciones, `Anulado desde cobro: ${motivo}`]
        .filter(Boolean)
        .join(" | ")
        .slice(0, 1000),
      updated_at: new Date(),
    },
    { transaction },
  );
  await sincronizarEstadosDeuda({ mensualidad, usuarioId, transaction });
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

  if (!membresia || !mensualidad) {
    throw new CobroOperacionError(
      "El cobro no conserva todos los registros del plan y no puede anularse automáticamente.",
      409,
      "PLAN_INCOMPLETO",
    );
  }
  const pagosMensualidadVigentes = await PagosModel.findAll({
    where: {
      mensualidad_id: Number(mensualidad.id),
      estado: { [Op.in]: ["confirmado", "pendiente_validacion"] },
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const pagosPosteriores = pagosMensualidadVigentes.filter(
    (item) => !idValido(detalle.pago_id) || Number(item.id) !== Number(detalle.pago_id),
  );
  if (pagosPosteriores.length > 0) {
    throw new CobroOperacionError(
      "La mensualidad del plan recibió pagos posteriores. Anulá o regularizá esos cobros antes de anular la venta original.",
      409,
      "PLAN_CON_PAGOS_POSTERIORES",
    );
  }
  if (!pago && Number(mensualidad.monto_pagado || 0) > 0.009) {
    throw new CobroOperacionError(
      "La mensualidad registra pagos pero el cobro no conserva el pago asociado.",
      409,
      "PLAN_PAGO_INCONSISTENTE",
    );
  }

  // Benjamin Orellana - 2026/08/24 - CORRECCION_ADMIN_SIN_BLOQUEO_POR_USO
  // La corrección financiera nunca se bloquea por clases usadas/asistencias.
  // Cuando ya existe uso real, preservamos la membresía completa (estado,
  // créditos y vínculos históricos) y anulamos únicamente la parte financiera
  // originada por este cobro. De esta forma el administrador puede corregir una
  // carga de pago/fecha sin perder clases que corresponden al alumno.
  const clasesUsadasMembresia = Number(membresia.clases_usadas || 0);
  const asistencias = await db.query(
    "SELECT COUNT(*) AS cantidad FROM alumnos_asistencias WHERE membresia_id = :membresiaId",
    {
      replacements: { membresiaId: Number(membresia.id) },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
  const cantidadAsistencias = Number(asistencias[0]?.cantidad || 0);
  const preservarMembresiaPorUso =
    clasesUsadasMembresia > 0 || cantidadAsistencias > 0;

  const notaBase = `Anulado por usuario #${usuarioId}: ${motivo}`;
  const nota = preservarMembresiaPorUso
    ? `${notaBase} | Corrección administrativa: membresía #${membresia.id} preservada por registrar ${clasesUsadasMembresia} clases usadas y ${cantidadAsistencias} asistencias.`
    : notaBase;

  if (preservarMembresiaPorUso) {
    await membresia.update(
      {
        observaciones: [membresia.observaciones, nota]
          .filter(Boolean)
          .join(" | "),
        updated_at: new Date(),
      },
      { transaction },
    );
  } else {
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
  }
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
  if (pago) {
    await pago.update(
      {
        estado: "anulado",
        observaciones: [pago.observaciones, nota].filter(Boolean).join(" | "),
        updated_at: new Date(),
      },
      { transaction },
    );
  }

  const observacionesNueva = String(membresia.observaciones || "");
  if (
    !preservarMembresiaPorUso &&
    observacionesNueva.includes("NUEVO_CICLO_RENOVACION_EXPLICITA")
  ) {
    const coincidenciaOrigen = observacionesNueva.match(
      /NUEVO_CICLO_RENOVACION_EXPLICITA desde membresía #(\d+)/,
    );
    const coincidenciaVencimientoAnterior = observacionesNueva.match(
      /VENCIMIENTO_ANTERIOR=(\d{4}-\d{2}-\d{2})/,
    );
    const membresiaAnteriorId = Number(coincidenciaOrigen?.[1] || 0);
    const vencimientoAnteriorOriginal =
      coincidenciaVencimientoAnterior?.[1] || null;

    if (idValido(membresiaAnteriorId)) {
      const membresiaAnterior = await AlumnosMembresiasModel.findByPk(
        membresiaAnteriorId,
        { transaction, lock: transaction.LOCK.UPDATE },
      );
      const hoy = fechaArgentina();
      const otraActiva = await AlumnosMembresiasModel.findOne({
        where: {
          id: { [Op.notIn]: [Number(membresia.id), membresiaAnteriorId] },
          alumno_id: Number(membresia.alumno_id),
          estado: "activa",
          fecha_inicio: { [Op.lte]: hoy },
          fecha_vencimiento: { [Op.gte]: hoy },
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      const vencimientoParaRestaurar =
        vencimientoAnteriorOriginal ||
        String(membresiaAnterior?.fecha_vencimiento || "").slice(0, 10);

      if (
        membresiaAnterior &&
        !otraActiva &&
        String(membresiaAnterior.fecha_inicio || "").slice(0, 10) <= hoy &&
        vencimientoParaRestaurar >= hoy
      ) {
        const observacionesAnterior = String(
          membresiaAnterior.observaciones || "",
        ).trim();
        await membresiaAnterior.update(
          {
            estado: "activa",
            fecha_vencimiento: vencimientoParaRestaurar,
            observaciones: `${observacionesAnterior}${
              observacionesAnterior ? " | " : ""
            }Reactivada por anulación de renovación del cobro #${detalle.cobro_id}`,
            updated_at: new Date(),
          },
          { transaction },
        );
      }
    }
  }
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

  const devolucionExistente = await ProductosStockMovimientosModel.findOne({
    where: {
      referencia_tipo: "cobro_anulacion",
      referencia_id: Number(detalle.id),
      tipo: "devolucion",
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (devolucionExistente) return;

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
  const clienteTipo = String(cobro.cliente_tipo || "");
  const cuenta = await obtenerCuentaSaldoCliente({
    clienteTipo,
    alumnoId: cobro.alumno_id,
    clienteUsuarioId: cobro.cliente_usuario_id,
    transaction,
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
  await crearMovimientoSaldoCliente({
    clienteTipo,
    cuenta,
    alumnoId: cobro.alumno_id,
    clienteUsuarioId: cobro.cliente_usuario_id,
    sedeId,
    usuarioId,
    tipo: "credito",
    origen: "reversion",
    monto,
    saldoAnterior,
    saldoNuevo,
    cobroId: cobro.id,
    referencia: `ANULACION-COBRO-${cobro.id}`,
    motivo: `Devolución de saldo por anulación: ${motivo}`,
    transaction,
  });
};

const obtenerVueltoSaldoCobro = async ({ cobro, transaction }) => {
  const referencia = `${REFERENCIA_VUELTO_SALDO}-${cobro.id}`;
  if (cobro.cliente_tipo === "empleado") {
    const movimiento = await UsuariosSaldosMovimientosModel.findOne({
      where: {
        cobro_id: Number(cobro.id),
        tipo: "credito",
        origen: "carga_saldo",
        referencia,
      },
      transaction,
    });
    if (!movimiento) return null;
    const cuenta = await UsuariosSaldosModel.findOne({
      where: { usuario_id: Number(cobro.cliente_usuario_id) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    return { movimiento, cuenta, referencia };
  }
  if (cobro.cliente_tipo === "alumno") {
    const movimiento = await AlumnosSaldosMovimientosModel.findOne({
      where: {
        cobro_id: Number(cobro.id),
        tipo: "credito",
        origen: "carga_saldo",
        referencia,
      },
      transaction,
    });
    if (!movimiento) return null;
    const cuenta = await AlumnosSaldosModel.findOne({
      where: { alumno_id: Number(cobro.alumno_id) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    return { movimiento, cuenta, referencia };
  }
  return null;
};

const revertirVueltoSaldoCobro = async ({
  cobro,
  sedeId,
  usuarioId,
  motivo,
  sesion,
  transaction,
}) => {
  const vuelto = await obtenerVueltoSaldoCobro({ cobro, transaction });
  if (!vuelto) return;
  const monto = Number(vuelto.movimiento.monto || 0);
  const saldoAnterior = Number(vuelto.cuenta?.saldo || 0);
  if (!vuelto.cuenta || saldoAnterior + 0.009 < monto) {
    throw new CobroOperacionError(
      "El saldo originado por el vuelto ya fue utilizado. Regularizá ese saldo antes de anular el cobro.",
      409,
      "VUELTO_SALDO_CONSUMIDO",
    );
  }
  const saldoNuevo = redondear(saldoAnterior - monto);
  await vuelto.cuenta.update(
    { saldo: saldoNuevo.toFixed(2), updated_at: new Date() },
    { transaction },
  );
  await crearMovimientoSaldoCliente({
    clienteTipo: cobro.cliente_tipo,
    cuenta: vuelto.cuenta,
    alumnoId: cobro.alumno_id,
    clienteUsuarioId: cobro.cliente_usuario_id,
    sedeId,
    usuarioId,
    tipo: "debito",
    origen: "reversion",
    monto,
    saldoAnterior,
    saldoNuevo,
    cobroId: cobro.id,
    referencia: `ANULACION-${vuelto.referencia}`,
    motivo: `Reversión del vuelto dejado a favor: ${motivo}`,
    transaction,
  });

  const movimientoCaja = await CajasMovimientosModel.findOne({
    where: { referencia: vuelto.referencia, estado: "vigente" },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (movimientoCaja) {
    const reversionExistente = await CajasMovimientosModel.findOne({
      where: {
        referencia: `ANULACION-${vuelto.referencia}`,
        estado: "vigente",
      },
      transaction,
    });
    if (!reversionExistente) {
      if (!sesion) {
        throw new CobroOperacionError(
          "Debe existir una caja abierta para revertir el vuelto dejado a favor.",
          409,
          "CAJA_CERRADA",
        );
      }
      await CajasMovimientosModel.create(
        {
          caja_sesion_id: Number(sesion.id),
          caja_id: Number(sesion.caja_id),
          sede_id: Number(sedeId),
          cobro_pago_id: null,
          gasto_id: null,
          medio_pago_id: Number(movimientoCaja.medio_pago_id),
          usuario_registro_id: Number(usuarioId),
          tipo: "egreso",
          origen: "reversion",
          fecha_movimiento: new Date(),
          monto: monto.toFixed(2),
          descripcion: `Anulación de vuelto a saldo · Cobro #${cobro.id}`,
          estado: "vigente",
          referencia: `ANULACION-${vuelto.referencia}`,
          observaciones: motivo,
        },
        { transaction },
      );
    }
  }
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


export const corregirMedioPagoCobroConfirmado = async ({
  cobroId,
  sedeId,
  medioPagoId,
  referencia,
  motivo,
  usuario,
  ip = null,
  userAgent = null,
}) => {
  const transaction = await db.transaction();
  try {
    const usuarioId = obtenerUsuarioId(usuario);
    const motivoLimpio = String(motivo || "").trim();
    const referenciaLimpia = String(referencia || "").trim();

    if (!idValido(usuarioId)) {
      throw new CobroOperacionError("No se pudo identificar al usuario.", 401);
    }
    if (!idValido(medioPagoId)) {
      throw new CobroOperacionError("Debe seleccionar un medio de pago válido.");
    }
    if (motivoLimpio.length < 3) {
      throw new CobroOperacionError(
        "Debe indicar el motivo de la corrección con al menos 3 caracteres.",
      );
    }
    if (motivoLimpio.length > 500) {
      throw new CobroOperacionError(
        "El motivo no puede superar los 500 caracteres.",
      );
    }
    if (referenciaLimpia.length > 120) {
      throw new CobroOperacionError(
        "La referencia no puede superar los 120 caracteres.",
      );
    }

    const cobro = await cargarCobroBloqueado({ cobroId, sedeId, transaction });
    if (cobro.estado !== "confirmado") {
      throw new CobroOperacionError(
        "Solo puede corregirse el medio de pago de un cobro confirmado.",
        409,
        "ESTADO_COBRO_INVALIDO",
      );
    }

    const pagosCobro = await CobrosPagosModel.findAll({
      where: { cobro_id: Number(cobro.id) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (pagosCobro.length !== 1) {
      throw new CobroOperacionError(
        "Los cobros con pagos combinados no pueden corregirse desde esta acción.",
        409,
        "COBRO_PAGO_COMBINADO",
      );
    }

    const pagoCobro = pagosCobro[0];
    if (pagoCobro.estado !== "confirmado") {
      throw new CobroOperacionError(
        "El pago del cobro debe estar confirmado para poder corregirlo.",
        409,
        "PAGO_COBRO_NO_CONFIRMADO",
      );
    }

    const [medioAnterior, medioNuevo] = await Promise.all([
      PagosMediosPagoModel.findByPk(Number(pagoCobro.medio_pago_id), {
        transaction,
        lock: transaction.LOCK.UPDATE,
      }),
      PagosMediosPagoModel.findOne({
        where: { id: Number(medioPagoId), activo: 1 },
        transaction,
        lock: transaction.LOCK.UPDATE,
      }),
    ]);

    if (!medioAnterior) {
      throw new CobroOperacionError(
        "No se encontró el medio de pago original del cobro.",
        409,
        "MEDIO_ORIGINAL_NO_ENCONTRADO",
      );
    }
    if (!medioNuevo) {
      throw new CobroOperacionError(
        "El nuevo medio de pago no existe o se encuentra inactivo.",
        404,
        "MEDIO_NUEVO_NO_ENCONTRADO",
      );
    }
    if (
      String(medioAnterior.codigo || "").toUpperCase() === CODIGO_SALDO_FAVOR ||
      String(medioNuevo.codigo || "").toUpperCase() === CODIGO_SALDO_FAVOR
    ) {
      throw new CobroOperacionError(
        "Los movimientos de saldo a favor no pueden corregirse desde esta acción.",
        409,
        "SALDO_FAVOR_NO_EDITABLE",
      );
    }
    if (Number(medioNuevo.requiere_validacion) === 1) {
      throw new CobroOperacionError(
        "El medio seleccionado requiere validación y no puede aplicarse mediante una corrección directa.",
        409,
        "MEDIO_REQUIERE_VALIDACION",
      );
    }
    if (Number(medioAnterior.id) === Number(medioNuevo.id)) {
      await transaction.commit();
      return {
        cobro: await CobrosModel.findByPk(cobro.id, {
          include: incluirCobroCompleto,
        }),
        repetido: true,
      };
    }

    const impactabaCaja = Number(medioAnterior.impacta_caja) === 1;
    const impactaCaja = Number(medioNuevo.impacta_caja) === 1;
    let sesionOriginal = null;
    let movimientoCaja = null;

    if (impactabaCaja || impactaCaja) {
      sesionOriginal = await CajasSesionesModel.findOne({
        where: {
          id: Number(cobro.caja_sesion_id),
          sede_id: Number(sedeId),
          estado: "abierta",
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!sesionOriginal) {
        throw new CobroOperacionError(
          "La caja original del cobro debe permanecer abierta para corregir el medio de pago.",
          409,
          "CAJA_ORIGINAL_CERRADA",
        );
      }

      movimientoCaja = await CajasMovimientosModel.findOne({
        where: {
          cobro_pago_id: Number(pagoCobro.id),
          origen: "cobro",
          estado: "vigente",
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (impactabaCaja && !movimientoCaja) {
        throw new CobroOperacionError(
          "No se encontró el movimiento de caja original asociado al pago.",
          409,
          "MOVIMIENTO_CAJA_NO_ENCONTRADO",
        );
      }
      if (!impactabaCaja && movimientoCaja) {
        throw new CobroOperacionError(
          "El cobro presenta un movimiento de caja incompatible con su medio original.",
          409,
          "MOVIMIENTO_CAJA_INCONSISTENTE",
        );
      }
    }

    const referenciaAnterior = pagoCobro.referencia || null;
    const movimientoCajaIdAnterior = movimientoCaja?.id
      ? Number(movimientoCaja.id)
      : null;
    const resumenCorreccion = `Medio corregido de ${medioAnterior.nombre} a ${medioNuevo.nombre}. Motivo: ${motivoLimpio}`;
    const observacionesPago = [
      pagoCobro.observaciones_validacion,
      `[CORRECCIÓN MEDIO] ${resumenCorreccion}`,
    ]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 500);

    await pagoCobro.update(
      {
        medio_pago_id: Number(medioNuevo.id),
        referencia: referenciaLimpia || pagoCobro.referencia || null,
        usuario_validacion_id: Number(usuarioId),
        fecha_validacion: new Date(),
        observaciones_validacion: observacionesPago,
        updated_at: new Date(),
      },
      { transaction },
    );

    const [pagosAlumnoActualizados] = await PagosModel.update(
      {
        medio_pago_id: Number(medioNuevo.id),
        updated_at: new Date(),
      },
      {
        where: {
          referencia: `COBRO-${cobro.id}`,
          medio_pago_id: Number(medioAnterior.id),
          estado: "confirmado",
        },
        transaction,
      },
    );

    if (impactabaCaja && impactaCaja) {
      const observacionesCaja = [
        movimientoCaja.observaciones,
        `[CORRECCIÓN MEDIO] ${resumenCorreccion}`,
      ]
        .filter(Boolean)
        .join(" | ")
        .slice(0, 500);
      await movimientoCaja.update(
        {
          medio_pago_id: Number(medioNuevo.id),
          observaciones: observacionesCaja,
          updated_at: new Date(),
        },
        { transaction },
      );
    } else if (impactabaCaja && !impactaCaja) {
      const observacionesCaja = [
        movimientoCaja.observaciones,
        `[CORRECCIÓN MEDIO] Movimiento retirado de caja. ${resumenCorreccion}`,
      ]
        .filter(Boolean)
        .join(" | ")
        .slice(0, 500);
      await movimientoCaja.update(
        {
          estado: "anulado",
          observaciones: observacionesCaja,
          updated_at: new Date(),
        },
        { transaction },
      );
    } else if (!impactabaCaja && impactaCaja) {
      movimientoCaja = await CajasMovimientosModel.create(
        {
          caja_sesion_id: Number(sesionOriginal.id),
          caja_id: Number(sesionOriginal.caja_id),
          sede_id: Number(sedeId),
          cobro_pago_id: Number(pagoCobro.id),
          medio_pago_id: Number(medioNuevo.id),
          usuario_registro_id: Number(usuarioId),
          tipo: "ingreso",
          origen: "cobro",
          fecha_movimiento: new Date(),
          monto: Number(pagoCobro.monto).toFixed(2),
          descripcion: `Cobro #${cobro.id}`,
          estado: "vigente",
          referencia: `COBRO-${cobro.id}`,
          observaciones: `[CORRECCIÓN MEDIO] ${resumenCorreccion}`.slice(0, 500),
        },
        { transaction },
      );
    }

    await cobro.update({ updated_at: new Date() }, { transaction });

    await SistemaAuditoriaLogsModel.create(
      {
        usuario_id: Number(usuarioId),
        sede_id: Number(sedeId),
        modulo: "COBROS",
        accion: "CORREGIR_MEDIO_PAGO_COBRO",
        entidad: "cobros_cobros",
        entidad_id: Number(cobro.id),
        descripcion: resumenCorreccion,
        valores_anteriores: {
          cobro_pago_id: Number(pagoCobro.id),
          medio_pago_id: Number(medioAnterior.id),
          medio_pago: medioAnterior.nombre,
          referencia: referenciaAnterior,
          movimiento_caja_id: movimientoCajaIdAnterior,
        },
        valores_nuevos: {
          cobro_pago_id: Number(pagoCobro.id),
          medio_pago_id: Number(medioNuevo.id),
          medio_pago: medioNuevo.nombre,
          referencia: referenciaLimpia || pagoCobro.referencia || null,
          pagos_alumno_actualizados: Number(pagosAlumnoActualizados || 0),
          motivo: motivoLimpio,
        },
        ip,
        user_agent: userAgent,
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


export const editarCobroConfirmado = async ({
  cobroId,
  payload,
  usuario,
  ip = null,
  userAgent = null,
}) => {
  const transaction = await db.transaction();

  try {
    const usuarioId = obtenerUsuarioId(usuario);
    const sedeId = Number(payload?.sede_id);
    const motivoLimpio = String(payload?.motivo_edicion || "").trim();
    const observacionesNuevas = String(payload?.observaciones || "").trim();

    if (!idValido(usuarioId)) {
      throw new CobroOperacionError("No se pudo identificar al usuario.", 401);
    }
    if (!idValido(sedeId)) {
      throw new CobroOperacionError("Debe indicar una sede válida.");
    }
    if (motivoLimpio.length < 3) {
      throw new CobroOperacionError(
        "Debe indicar el motivo de la edición con al menos 3 caracteres.",
      );
    }
    if (motivoLimpio.length > 500) {
      throw new CobroOperacionError(
        "El motivo de la edición no puede superar los 500 caracteres.",
      );
    }

    const cobro = await cargarCobroBloqueado({
      cobroId,
      sedeId,
      transaction,
    });

    if (cobro.estado !== "confirmado") {
      throw new CobroOperacionError(
        "Solo pueden editarse cobros confirmados.",
        409,
        "ESTADO_COBRO_INVALIDO",
      );
    }

    // Benjamin Orellana - 2026/08/18 - La sesión original conserva el
    // contexto histórico del cobro, pero ya no debe permanecer abierta para
    // permitir una corrección posterior. Si el turno cambió, la compensación
    // se registra en la caja actualmente abierta de la misma sede.
    const sesionOriginal = await CajasSesionesModel.findOne({
      where: {
        id: Number(cobro.caja_sesion_id),
        sede_id: sedeId,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!sesionOriginal) {
      throw new CobroOperacionError(
        "No se encontró la caja original asociada al cobro.",
        409,
        "CAJA_ORIGINAL_NO_ENCONTRADA",
      );
    }

    const sesionOriginalAbierta = sesionOriginal.estado === "abierta";
    const cajaSesionOperacionId = Number(payload?.caja_sesion_id || 0);
    const sesionOperacion = sesionOriginalAbierta
      ? sesionOriginal
      : await CajasSesionesModel.findOne({
          where: {
            ...(idValido(cajaSesionOperacionId)
              ? { id: cajaSesionOperacionId }
              : {}),
            sede_id: sedeId,
            estado: "abierta",
          },
          order: [["fecha_apertura", "DESC"], ["id", "DESC"]],
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

    if (!sesionOperacion) {
      throw new CobroOperacionError(
        "Debe existir una caja abierta en la sede para registrar la edición del cobro.",
        409,
        "CAJA_CERRADA",
      );
    }

    const edicionEntreTurnos =
      Number(sesionOperacion.id) !== Number(sesionOriginal.id);

    const detallesAnteriores = await CobrosDetallesModel.findAll({
      where: { cobro_id: Number(cobro.id) },
      order: [["id", "ASC"]],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (detallesAnteriores.some((detalle) => detalle.tipo === "deuda")) {
      throw new CobroOperacionError(
        "Los cobros usados para saldar una deuda no se editan directamente. Anulá el cobro y registralo nuevamente para conservar la trazabilidad de la mensualidad.",
        409,
        "DEUDA_COBRO_NO_EDITABLE",
      );
    }

    const pagosAnteriores = await CobrosPagosModel.findAll({
      where: {
        cobro_id: Number(cobro.id),
        estado: "confirmado",
      },
      order: [["id", "ASC"]],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (pagosAnteriores.length === 0) {
      throw new CobroOperacionError(
        "El cobro no conserva medios de pago confirmados para editar.",
        409,
        "PAGOS_COBRO_INCONSISTENTES",
      );
    }

    const medioSaldo = await PagosMediosPagoModel.findOne({
      where: { codigo: CODIGO_SALDO_FAVOR },
      transaction,
    });
    if (
      medioSaldo &&
      pagosAnteriores.some(
        (pago) => Number(pago.medio_pago_id) === Number(medioSaldo.id),
      )
    ) {
      throw new CobroOperacionError(
        "Los cobros que utilizaron saldo a favor no pueden editarse. Deben anularse y registrarse nuevamente.",
        409,
        "SALDO_FAVOR_NO_EDITABLE",
      );
    }

    const cobradorUsuarioId = Number(
      payload?.cobrador_usuario_id || cobro.cobrador_usuario_id,
    );
    const clienteTipo = String(payload?.cliente_tipo || cobro.cliente_tipo);
    const { alumno } = await validarCliente({
      clienteTipo,
      alumnoId: payload?.alumno_id,
      clienteUsuarioId: payload?.cliente_usuario_id,
      cobradorUsuarioId,
      transaction,
    });

    const conceptosNuevos = await resolverConceptos({
      conceptos: payload?.conceptos,
      sedeId,
      alumnoId: alumno?.id,
      clienteTipo,
      clienteUsuarioId: payload?.cliente_usuario_id || cobro.cliente_usuario_id,
      transaction,
    });
    const planAnterior = detallesAnteriores.find(
      (detalle) => detalle.tipo === "plan",
    );
    const planesNuevos = conceptosNuevos.filter(
      (concepto) => concepto.tipo === "plan",
    );
    const planNuevo = planesNuevos[0] || null;

    if (planAnterior) {
      const clienteAnteriorId = Number(cobro.alumno_id || 0);
      const clienteNuevoId = Number(payload?.alumno_id || 0);
      if (
        clienteTipo !== "alumno" ||
        clienteAnteriorId <= 0 ||
        clienteNuevoId !== clienteAnteriorId
      ) {
        throw new CobroOperacionError(
          "Un cobro con plan no puede cambiar de alumno.",
          409,
          "PLAN_CLIENTE_NO_EDITABLE",
        );
      }
      if (
        planesNuevos.length !== 1 ||
        Number(planNuevo?.referencia_id) !== Number(planAnterior.referencia_id)
      ) {
        throw new CobroOperacionError(
          "El plan asociado no puede reemplazarse ni eliminarse desde la edición del cobro.",
          409,
          "PLAN_NO_EDITABLE",
        );
      }
    } else if (planNuevo) {
      throw new CobroOperacionError(
        "No se puede agregar un plan a un cobro existente. Registrá un cobro nuevo para generar la membresía.",
        409,
        "PLAN_NO_AGREGABLE",
      );
    }

    const resumen = conceptosNuevos.reduce(
      (acc, item) => ({
        importe: redondear(acc.importe + item.importe),
        descuentos: redondear(acc.descuentos + item.descuento_importe),
        impuestos: redondear(acc.impuestos + item.impuesto_importe),
        total: redondear(acc.total + item.total),
      }),
      { importe: 0, descuentos: 0, impuestos: 0, total: 0 },
    );

    if (resumen.total <= 0) {
      throw new CobroOperacionError(
        "El total del cobro debe ser mayor a cero.",
      );
    }

    const pagosResueltos = await resolverPagos({
      pagos: payload?.pagos,
      total: resumen.total,
      transaction,
    });
    const pagosNuevos = pagosResueltos.pagos;
    const totalPagado = pagosResueltos.totalPagado;

    if (Math.abs(totalPagado - resumen.total) > 0.009) {
      throw new CobroOperacionError(
        "En una edición, la suma de los medios de pago debe coincidir con el total del cobro.",
        409,
        "PAGO_EDICION_INCOMPLETO",
      );
    }
    if (pagosNuevos.some((item) => item.es_saldo_favor)) {
      throw new CobroOperacionError(
        "No se puede agregar saldo a favor al editar un cobro confirmado.",
        409,
        "SALDO_FAVOR_NO_EDITABLE",
      );
    }
    const requiereValidacionEdicion = pagosNuevos.some(
      (item) => Number(item.medio?.requiere_validacion || 0) === 1,
    );

    const snapshotAnterior = {
      cliente_tipo: cobro.cliente_tipo,
      alumno_id: cobro.alumno_id,
      cliente_usuario_id: cobro.cliente_usuario_id,
      cobrador_usuario_id: cobro.cobrador_usuario_id,
      importe: Number(cobro.importe || 0),
      descuentos: Number(cobro.descuentos || 0),
      impuestos: Number(cobro.impuestos || 0),
      total: Number(cobro.total || 0),
      observaciones: cobro.observaciones || null,
      conceptos: detallesAnteriores.map((item) => ({
        id: Number(item.id),
        tipo: item.tipo,
        referencia_id: Number(item.referencia_id),
        cantidad: Number(item.cantidad),
        precio_unitario: Number(item.precio_unitario),
        descuento_porcentaje: Number(item.descuento_porcentaje),
        impuesto_porcentaje: Number(item.impuesto_porcentaje),
        total: Number(item.total),
      })),
      pagos: pagosAnteriores.map((item) => ({
        id: Number(item.id),
        medio_pago_id: Number(item.medio_pago_id),
        monto: Number(item.monto),
        referencia: item.referencia || null,
      })),
    };

    for (const detalle of detallesAnteriores) {
      if (detalle.tipo === "producto") {
        await devolverStockCobro({
          detalle,
          sedeId,
          usuarioId,
          motivo: `Edición de cobro #${cobro.id}: ${motivoLimpio}`,
          transaction,
        });
      }
    }

    for (const pagoAnterior of pagosAnteriores) {
      const movimientosCaja = await CajasMovimientosModel.findAll({
        where: {
          cobro_pago_id: Number(pagoAnterior.id),
          origen: "cobro",
          estado: "vigente",
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      for (const movimiento of movimientosCaja) {
        const observacionesMovimiento = [
          movimiento.observaciones,
          `[EDICIÓN COBRO] Movimiento reemplazado. Motivo: ${motivoLimpio}`,
        ]
          .filter(Boolean)
          .join(" | ")
          .slice(0, 500);

        if (!edicionEntreTurnos) {
          // Mismo turno: el movimiento todavía pertenece a una caja abierta,
          // por lo que puede reemplazarse dentro de la misma sesión.
          await movimiento.update(
            {
              estado: "anulado",
              observaciones: observacionesMovimiento,
              updated_at: new Date(),
            },
            { transaction },
          );
          continue;
        }

        // Cambio de turno: NO se reescribe la caja ya cerrada. El movimiento
        // original permanece como evidencia histórica y se crea un egreso
        // compensatorio en la caja actualmente abierta.
        await CajasMovimientosModel.create(
          {
            caja_sesion_id: Number(sesionOperacion.id),
            caja_id: Number(sesionOperacion.caja_id),
            sede_id: sedeId,
            cobro_pago_id: Number(pagoAnterior.id),
            medio_pago_id: Number(movimiento.medio_pago_id),
            usuario_registro_id: usuarioId,
            tipo: "egreso",
            origen: "reversion",
            fecha_movimiento: new Date(),
            monto: Number(movimiento.monto).toFixed(2),
            descripcion: `Corrección de cobro #${cobro.id} · reversión de turno anterior`,
            estado: "vigente",
            referencia: `EDICION-COBRO-${cobro.id}`,
            observaciones: [
              `[EDICIÓN ENTRE TURNOS] Reversa movimiento #${movimiento.id} de la sesión #${sesionOriginal.id}.`,
              `Motivo: ${motivoLimpio}`,
            ]
              .join(" | ")
              .slice(0, 500),
          },
          { transaction },
        );
      }

      const observacionesPago = [
        pagoAnterior.observaciones_validacion,
        `[EDICIÓN COBRO] Pago reemplazado. Motivo: ${motivoLimpio}`,
      ]
        .filter(Boolean)
        .join(" | ")
        .slice(0, 500);
      await pagoAnterior.update(
        {
          estado: "anulado",
          observaciones_validacion: observacionesPago,
          updated_at: new Date(),
        },
        { transaction },
      );
    }

    await CobrosDetallesModel.destroy({
      where: {
        cobro_id: Number(cobro.id),
        tipo: { [Op.ne]: "plan" },
      },
      transaction,
    });

    const detallesNuevos = [];
    for (const linea of conceptosNuevos) {
      let detalle;
      if (linea.tipo === "plan" && planAnterior) {
        await planAnterior.update(
          {
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
        detalle = planAnterior;
      } else {
        detalle = await CobrosDetallesModel.create(
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
      }
      detallesNuevos.push({ detalle, linea });
    }

    for (const { detalle, linea } of detallesNuevos) {
      if (linea.tipo === "producto") {
        await descontarStock({
          linea,
          detalleId: detalle.id,
          sedeId,
          usuarioId,
          transaction,
        });
      }
    }

    const pagosCreados = [];
    for (const item of pagosNuevos) {
      const pagoRequiereValidacion =
        Number(item.medio?.requiere_validacion || 0) === 1;

      pagosCreados.push(
        await CobrosPagosModel.create(
          {
            cobro_id: Number(cobro.id),
            medio_pago_id: item.medio_pago_id,
            monto: item.monto.toFixed(2),
            estado: pagoRequiereValidacion
              ? "pendiente_validacion"
              : "confirmado",
            referencia: item.referencia,
            comprobante_url: item.comprobante_url,
            usuario_validacion_id: pagoRequiereValidacion
              ? null
              : Number(usuarioId),
            fecha_validacion: pagoRequiereValidacion ? null : new Date(),
            observaciones_validacion: `[EDICIÓN COBRO] ${motivoLimpio}`.slice(
              0,
              500,
            ),
            updated_at: new Date(),
          },
          { transaction },
        ),
      );
    }

    for (let indice = 0; indice < pagosCreados.length; indice += 1) {
      const pagoResuelto = pagosNuevos[indice];
      const pagoCreado = pagosCreados[indice];
      if (pagoCreado.estado !== "confirmado") continue;
      if (!pagoResuelto.impacta_caja) continue;
      await CajasMovimientosModel.create(
        {
          caja_sesion_id: Number(sesionOperacion.id),
          caja_id: Number(sesionOperacion.caja_id),
          sede_id: sedeId,
          cobro_pago_id: Number(pagosCreados[indice].id),
          medio_pago_id: Number(pagoResuelto.medio_pago_id),
          usuario_registro_id: usuarioId,
          tipo: "ingreso",
          origen: "cobro",
          fecha_movimiento: new Date(),
          monto: Number(pagoResuelto.monto).toFixed(2),
          descripcion: `Cobro #${cobro.id} editado`,
          estado: "vigente",
          referencia: `COBRO-${cobro.id}`,
          observaciones: `[EDICIÓN COBRO] ${motivoLimpio}`.slice(0, 500),
        },
        { transaction },
      );
    }

    if (planAnterior && planNuevo) {
      const medioPagoPlan = pagosNuevos[0];
      const montoPlanPagado = redondear(
        Math.min(totalPagado, Number(planNuevo.total)),
      );
      const saldoPlan = redondear(
        Math.max(Number(planNuevo.total) - montoPlanPagado, 0),
      );

      if (idValido(planAnterior.mensualidad_id)) {
        await PagosMensualidadesModel.update(
          {
            monto_total: Number(planNuevo.total).toFixed(2),
            monto_pagado: montoPlanPagado.toFixed(2),
            saldo: saldoPlan.toFixed(2),
            estado: saldoPlan > 0.009 ? "parcial" : "pagada",
            observaciones: `Ajustada por edición del cobro #${cobro.id}. Motivo: ${motivoLimpio}`,
            updated_at: new Date(),
          },
          {
            where: { id: Number(planAnterior.mensualidad_id) },
            transaction,
          },
        );
      }

      if (idValido(planAnterior.pago_id)) {
        await PagosModel.update(
          {
            medio_pago_id: Number(medioPagoPlan.medio_pago_id),
            monto: totalPagado.toFixed(2),
            referencia: medioPagoPlan.referencia || `COBRO-${cobro.id}`,
            observaciones: `Pago ajustado por edición del cobro #${cobro.id}. Motivo: ${motivoLimpio}`,
            updated_at: new Date(),
          },
          {
            where: { id: Number(planAnterior.pago_id), estado: "confirmado" },
            transaction,
          },
        );
      }

      if (idValido(planAnterior.membresia_id)) {
        const basePlan = redondear(
          planNuevo.importe - planNuevo.descuento_importe,
        );
        await AlumnosMembresiasModel.update(
          {
            precio_lista: Number(planNuevo.precio_unitario).toFixed(2),
            descuento_valor: "0.00",
            descuento_porcentaje: Number(
              planNuevo.descuento_porcentaje,
            ).toFixed(2),
            precio_final: basePlan.toFixed(2),
            updated_at: new Date(),
          },
          {
            where: { id: Number(planAnterior.membresia_id) },
            transaction,
          },
        );
      }
    }

    if (idValido(cobro.finanzas_movimiento_id)) {
      await FinanzasMovimientosModel.update(
        {
          monto: totalPagado.toFixed(2),
          descripcion: `Cobro #${cobro.id}`,
          observaciones: [
            observacionesNuevas || cobro.observaciones,
            `[EDICIÓN COBRO] ${motivoLimpio}`,
          ]
            .filter(Boolean)
            .join(" | "),
          updated_at: new Date(),
        },
        {
          where: {
            id: Number(cobro.finanzas_movimiento_id),
            estado: "vigente",
          },
          transaction,
        },
      );
    }

    await cobro.update(
      {
        cliente_tipo: clienteTipo,
        alumno_id:
          clienteTipo === "alumno" ? Number(payload?.alumno_id) : null,
        cliente_usuario_id:
          clienteTipo === "empleado"
            ? Number(payload?.cliente_usuario_id)
            : null,
        cobrador_usuario_id: cobradorUsuarioId,
        importe: resumen.importe.toFixed(2),
        descuentos: resumen.descuentos.toFixed(2),
        impuestos: resumen.impuestos.toFixed(2),
        total: resumen.total.toFixed(2),
        observaciones: observacionesNuevas || null,
        estado: requiereValidacionEdicion
          ? "pendiente_validacion"
          : "confirmado",
        updated_at: new Date(),
      },
      { transaction },
    );

    await SistemaAuditoriaLogsModel.create(
      {
        usuario_id: usuarioId,
        sede_id: sedeId,
        modulo: "COBROS",
        accion: "EDITAR_COBRO_CONFIRMADO",
        entidad: "cobros_cobros",
        entidad_id: Number(cobro.id),
        descripcion: `Cobro #${cobro.id} editado. Motivo: ${motivoLimpio}`,
        valores_anteriores: snapshotAnterior,
        valores_nuevos: {
          cliente_tipo: clienteTipo,
          alumno_id:
            clienteTipo === "alumno" ? Number(payload?.alumno_id) : null,
          cliente_usuario_id:
            clienteTipo === "empleado"
              ? Number(payload?.cliente_usuario_id)
              : null,
          cobrador_usuario_id: cobradorUsuarioId,
          importe: resumen.importe,
          descuentos: resumen.descuentos,
          impuestos: resumen.impuestos,
          total: resumen.total,
          estado: requiereValidacionEdicion
            ? "pendiente_validacion"
            : "confirmado",
          observaciones: observacionesNuevas || null,
          conceptos: conceptosNuevos.map((item) => ({
            tipo: item.tipo,
            referencia_id: item.referencia_id,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            descuento_porcentaje: item.descuento_porcentaje,
            impuesto_porcentaje: item.impuesto_porcentaje,
            total: item.total,
          })),
          pagos: pagosNuevos.map((item) => ({
            medio_pago_id: item.medio_pago_id,
            monto: item.monto,
            referencia: item.referencia,
          })),
          motivo: motivoLimpio,
          caja_sesion_original_id: Number(sesionOriginal.id),
          caja_sesion_operacion_id: Number(sesionOperacion.id),
          edicion_entre_turnos: edicionEntreTurnos,
        },
        ip,
        user_agent: userAgent,
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
      return {
        cobro,
        repetido: true,
        resumen_anulacion: {
          aplicado: true,
          repetido: true,
          cobro: {
            id: Number(cobro.id),
            total: Number(cobro.total || 0),
            estado: cobro.estado,
          },
          impactos: [],
          advertencias: [
            {
              titulo: "El cobro ya estaba anulado.",
              detalle: cobro.motivo_anulacion || null,
            },
          ],
        },
      };
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

    const analisis = await construirAnalisisAnulacionCobro({
      cobro,
      detalles,
      pagosCobro,
      sedeId: Number(sedeId),
      transaction,
    });
    if (!analisis.puede_anular) {
      const bloqueo = analisis.bloqueos[0];
      throw new CobroOperacionError(
        bloqueo?.detalle
          ? `${bloqueo.titulo} ${bloqueo.detalle}`
          : bloqueo?.titulo || "El cobro no puede anularse automáticamente.",
        409,
        bloqueo?.code || "ANULACION_BLOQUEADA",
      );
    }

    let sesion = null;
    if (analisis.requiere_caja) {
      if (idValido(cajaSesionId)) {
        sesion = await CajasSesionesModel.findOne({
          where: {
            id: Number(cajaSesionId),
            sede_id: Number(sedeId),
            estado: "abierta",
          },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
      }
      if (!sesion) {
        sesion = await CajasSesionesModel.findOne({
          where: { sede_id: Number(sedeId), estado: "abierta" },
          order: [["fecha_apertura", "DESC"], ["id", "DESC"]],
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
      }
      if (!sesion) {
        throw new CobroOperacionError(
          "Debe existir una caja abierta para registrar la reversión.",
          409,
          "CAJA_CERRADA",
        );
      }
    }

    const medioSaldo = await PagosMediosPagoModel.findOne({
      where: { codigo: CODIGO_SALDO_FAVOR },
      transaction,
    });
    const deudaFiada = idValido(cobro.alumno_id)
      ? await obtenerDeudaFiadaCobro({
          cobroId: cobro.id,
          alumnoId: cobro.alumno_id,
          sedeId,
          transaction,
          bloquear: true,
        })
      : null;

    // Benjamin Orellana - 2026/08/19 - Un plan 100% fiado puede no tener
    // cobros_pagos ni deuda administrativa: su deuda vive en la mensualidad.
    const tienePlanVinculado = detalles.some(
      (detalle) => detalle.tipo === "plan" && idValido(detalle.mensualidad_id),
    );
    const esVentaFiadaEmpleado =
      cobro.cliente_tipo === "empleado" &&
      detalles.some((detalle) => ["producto", "servicio"].includes(detalle.tipo));
    if (
      (pagosCobro.length === 0 &&
        !deudaFiada &&
        !tienePlanVinculado &&
        !esVentaFiadaEmpleado) ||
      pagosCobro.some(
        (pago) => !["confirmado", "anulado"].includes(String(pago.estado)),
      )
    ) {
      throw new CobroOperacionError(
        "Los medios de pago no tienen un estado compatible con la anulación.",
        409,
        "PAGOS_COBRO_INCONSISTENTES",
      );
    }

    if (deudaFiada) {
      await revertirDeudaFiadaCobro({
        cobro,
        motivo: motivoLimpio,
        usuarioId,
        transaction,
      });
    }

    // Solo se revierte dinero que todavía está confirmado. Los pagos históricos
    // anulados por una edición previa no forman parte del importe vigente.
    const pagosConfirmados = pagosCobro.filter(
      (pagoCobro) => String(pagoCobro.estado) === "confirmado",
    );
    const totalPagadoCobro = redondear(
      pagosConfirmados.reduce(
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
      await revertirDeudaConfirmada({
        detalle,
        cobro,
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

    // Una anulación iniciada desde Pagos podía haber marcado previamente como
    // anulado el movimiento financiero original sin actualizar cobros_cobros.
    // En ese caso no generamos un segundo egreso.
    const movimientoOriginalFinanzas = cobro.finanzas_movimiento_id
      ? await FinanzasMovimientosModel.findByPk(cobro.finanzas_movimiento_id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        })
      : await FinanzasMovimientosModel.findOne({
          where: { referencia: `COBRO-${cobro.id}` },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

    let movimientoReversion = await FinanzasMovimientosModel.findOne({
      where: {
        referencia: `ANULACION-COBRO-${cobro.id}`,
        estado: "vigente",
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (
      !movimientoReversion &&
      movimientoOriginalFinanzas?.estado === "vigente" &&
      totalPagadoCobro > 0.009
    ) {
      movimientoReversion = await FinanzasMovimientosModel.create(
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
    }

    await revertirVueltoSaldoCobro({
      cobro,
      sedeId: Number(sedeId),
      usuarioId,
      motivo: motivoLimpio,
      sesion,
      transaction,
    });

    for (const pagoCobro of pagosCobro) {
      if (pagoCobro.estado === "anulado") continue;

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
            estado: "vigente",
          },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!movimientoOriginal) {
          await pagoCobro.update(
            { estado: "anulado", updated_at: new Date() },
            { transaction },
          );
          continue;
        }
        const reversionCajaExistente = await CajasMovimientosModel.findOne({
          where: {
            cobro_pago_id: Number(pagoCobro.id),
            origen: "reversion",
            referencia: `ANULACION-COBRO-${cobro.id}`,
            estado: "vigente",
          },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!reversionCajaExistente) {
          if (!sesion) {
            throw new CobroOperacionError(
              "Debe existir una caja abierta para registrar la reversión.",
              409,
              "CAJA_CERRADA",
            );
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
        finanzas_reversion_id: movimientoReversion
          ? Number(movimientoReversion.id)
          : cobro.finanzas_reversion_id || null,
        usuario_anulacion_id: usuarioId,
        fecha_anulacion: new Date(),
        motivo_anulacion: motivoLimpio,
        updated_at: new Date(),
      },
      { transaction },
    );

    const fechaAnulacion = new Date();
    await SistemaAuditoriaLogsModel.create(
      {
        usuario_id: usuarioId,
        sede_id: Number(sedeId),
        modulo: "COBROS",
        accion: "ANULAR_COBRO_CENTRALIZADO",
        entidad: "cobros_cobros",
        entidad_id: Number(cobro.id),
        descripcion: `Cobro #${cobro.id} anulado de forma centralizada. Motivo: ${motivoLimpio}`,
        valores_anteriores: {
          estado: "confirmado",
          total: Number(cobro.total || 0),
          pagos_confirmados: totalPagadoCobro,
          caja_sesion_original_id: Number(cobro.caja_sesion_id),
          finanzas_movimiento_id: cobro.finanzas_movimiento_id || null,
        },
        valores_nuevos: {
          estado: "anulado",
          motivo: motivoLimpio,
          caja_sesion_reversion_id: sesion ? Number(sesion.id) : null,
          finanzas_reversion_id: movimientoReversion
            ? Number(movimientoReversion.id)
            : null,
          impactos: analisis.impactos,
        },
        ip: null,
        user_agent: null,
      },
      { transaction },
    );

    await transaction.commit();
    return {
      cobro: await CobrosModel.findByPk(cobro.id, {
        include: incluirCobroCompleto,
      }),
      repetido: false,
      resumen_anulacion: {
        ...analisis,
        aplicado: true,
        motivo: motivoLimpio,
        usuario_id: usuarioId,
        fecha_anulacion: fechaAnulacion,
        caja_reversion_id: sesion ? Number(sesion.id) : null,
        finanzas_reversion_id: movimientoReversion
          ? Number(movimientoReversion.id)
          : null,
      },
    };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

