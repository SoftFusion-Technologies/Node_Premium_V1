/*
 * Benjamin Orellana - 2026/07/15 - Saldo a favor y bonificaciones auditables.
 * Reducir deuda y acreditar saldo son operaciones explícitamente diferentes.
 */
import { Op, QueryTypes } from "sequelize";
import db from "../../DataBase/db.js";

import AlumnosModel from "../../Models/Alumno/MD_TB_Alumnos.js";
import AlumnosMembresiasModel from "../../Models/Alumno/MD_TB_AlumnosMembresias.js";
import AlumnosSaldosModel from "../../Models/Alumno/MD_TB_AlumnosSaldos.js";
import AlumnosSaldosMovimientosModel from "../../Models/Alumno/MD_TB_AlumnosSaldosMovimientos.js";
import AlumnosBonificacionesModel from "../../Models/Alumno/MD_TB_AlumnosBonificaciones.js";
import PagosMensualidadesModel from "../../Models/Pago/MD_TB_PagosMensualidades.js";

const error = (res, status, message) =>
  res.status(status).json({ ok: false, message, data: null });

const idValido = (value) =>
  Number.isInteger(Number(value)) && Number(value) > 0;

const redondear = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const fechaArgentina = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
};

const obtenerCuentaBloqueada = async ({ alumnoId, transaction }) => {
  await AlumnosSaldosModel.findOrCreate({
    where: { alumno_id: Number(alumnoId), moneda: "ARS" },
    defaults: { saldo: "0.00" },
    transaction,
  });

  return AlumnosSaldosModel.findOne({
    where: { alumno_id: Number(alumnoId), moneda: "ARS" },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
};

const actualizarEstadoAlumnoPorDeuda = async ({ alumno, transaction }) => {
  if (["baja", "congelado"].includes(String(alumno.estado).toLowerCase())) {
    return;
  }

  const hoy = fechaArgentina();
  const rows = await db.query(
    `SELECT COALESCE(SUM(pm.saldo), 0) AS deuda
       FROM pagos_mensualidades pm
       LEFT JOIN alumnos_membresias am ON am.id = pm.membresia_id
      WHERE pm.alumno_id = :alumnoId
        AND pm.estado IN ('pendiente','parcial','vencida')
        AND pm.saldo > 0
        AND COALESCE(pm.periodo_desde, am.fecha_inicio, pm.fecha_emision) <= :hoy`,
    {
      replacements: { alumnoId: Number(alumno.id), hoy },
      type: QueryTypes.SELECT,
      transaction,
    },
  );

  if (Number(rows[0]?.deuda || 0) > 0) {
    await alumno.update(
      { estado: "pendiente_pago", updated_at: new Date() },
      { transaction },
    );
    return;
  }

  const membresiaVigente = await AlumnosMembresiasModel.findOne({
    where: {
      alumno_id: Number(alumno.id),
      estado: "activa",
      fecha_inicio: { [Op.lte]: hoy },
      fecha_vencimiento: { [Op.gte]: hoy },
    },
    transaction,
  });

  if (membresiaVigente) {
    await alumno.update(
      {
        estado: "activo",
        sede_id: Number(membresiaVigente.sede_id),
        updated_at: new Date(),
      },
      { transaction },
    );
  }
};

export const OBR_SaldoAlumno_CTS = async (req, res) => {
  try {
    const { alumno_id } = req.params;
    if (!idValido(alumno_id)) return error(res, 400, "Alumno inválido.");

    const alumno = await AlumnosModel.findByPk(alumno_id);
    if (!alumno) return error(res, 404, "No se encontró el alumno.");

    const [cuenta, movimientos, bonificaciones] = await Promise.all([
      AlumnosSaldosModel.findOne({
        where: { alumno_id: Number(alumno_id), moneda: "ARS" },
      }),
      AlumnosSaldosMovimientosModel.findAll({
        where: { alumno_id: Number(alumno_id) },
        order: [["id", "DESC"]],
        limit: 50,
      }),
      AlumnosBonificacionesModel.findAll({
        where: { alumno_id: Number(alumno_id) },
        order: [["id", "DESC"]],
        limit: 50,
      }),
    ]);

    return res.json({
      ok: true,
      data: {
        alumno_id: Number(alumno_id),
        moneda: "ARS",
        saldo: Number(cuenta?.saldo || 0),
        movimientos,
        bonificaciones,
      },
    });
  } catch (requestError) {
    console.error("Error OBR_SaldoAlumno_CTS:", requestError);
    return error(res, 500, "Error interno al consultar el saldo.");
  }
};

export const CR_BonificacionAlumno_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { alumno_id } = req.params;
    const usuarioId = Number(req.user?.id || req.user?.usuario_id);
    const {
      modalidad = "reduccion_deuda",
      mensualidad_id,
      tipo = "monto",
      valor,
      motivo,
      observaciones,
    } = req.body;

    if (!idValido(alumno_id) || !idValido(usuarioId)) {
      throw Object.assign(new Error("Alumno o usuario inválido."), {
        status: 400,
      });
    }

    if (!["reduccion_deuda", "saldo_favor"].includes(modalidad)) {
      throw Object.assign(new Error("La modalidad no es válida."), {
        status: 400,
      });
    }

    const valorNumerico = Number(valor || 0);
    if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
      throw Object.assign(
        new Error("El valor de la bonificación debe ser mayor a 0."),
        { status: 400 },
      );
    }

    if (!["monto", "porcentaje"].includes(tipo)) {
      throw Object.assign(new Error("El tipo debe ser monto o porcentaje."), {
        status: 400,
      });
    }
    if (tipo === "porcentaje" && valorNumerico > 100) {
      throw Object.assign(new Error("El porcentaje no puede superar 100%."), {
        status: 400,
      });
    }
    if (modalidad === "saldo_favor" && tipo !== "monto") {
      throw Object.assign(
        new Error("El saldo a favor debe expresarse como monto fijo."),
        { status: 400 },
      );
    }

    const alumno = await AlumnosModel.findByPk(alumno_id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!alumno) {
      throw Object.assign(new Error("No se encontró el alumno."), {
        status: 404,
      });
    }

    const motivoLimpio = String(motivo || "Bonificación administrativa").trim();
    const observacionesLimpias = String(observaciones || "").trim() || null;

    if (modalidad === "saldo_favor") {
      const cuenta = await obtenerCuentaBloqueada({
        alumnoId: alumno.id,
        transaction,
      });
      const saldoAnterior = Number(cuenta.saldo || 0);
      const montoAplicado = redondear(valorNumerico);
      const saldoNuevo = redondear(saldoAnterior + montoAplicado);

      const bonificacion = await AlumnosBonificacionesModel.create(
        {
          alumno_id: Number(alumno.id),
          sede_id: alumno.sede_id ? Number(alumno.sede_id) : null,
          mensualidad_id: null,
          usuario_id: usuarioId,
          modalidad,
          tipo_valor: "monto",
          valor_solicitado: valorNumerico.toFixed(2),
          monto_aplicado: montoAplicado.toFixed(2),
          motivo: motivoLimpio,
          observaciones: observacionesLimpias,
        },
        { transaction },
      );

      await cuenta.update(
        { saldo: saldoNuevo.toFixed(2), updated_at: new Date() },
        { transaction },
      );
      await AlumnosSaldosMovimientosModel.create(
        {
          saldo_id: Number(cuenta.id),
          alumno_id: Number(alumno.id),
          sede_id: alumno.sede_id ? Number(alumno.sede_id) : null,
          usuario_id: usuarioId,
          tipo: "credito",
          origen: "bonificacion",
          monto: montoAplicado.toFixed(2),
          saldo_anterior: saldoAnterior.toFixed(2),
          saldo_nuevo: saldoNuevo.toFixed(2),
          bonificacion_id: Number(bonificacion.id),
          referencia: `BONIFICACION-${bonificacion.id}`,
          motivo: motivoLimpio,
        },
        { transaction },
      );

      await transaction.commit();
      return res.status(201).json({
        ok: true,
        message: "Saldo a favor acreditado correctamente.",
        data: {
          modalidad,
          bonificacion_id: Number(bonificacion.id),
          alumno_id: Number(alumno.id),
          monto_bonificacion: montoAplicado,
          saldo_anterior: saldoAnterior,
          saldo_nuevo: saldoNuevo,
        },
      });
    }

    if (!idValido(mensualidad_id)) {
      throw Object.assign(
        new Error("Seleccioná una mensualidad con deuda para bonificar."),
        { status: 400 },
      );
    }

    const mensualidad = await PagosMensualidadesModel.findOne({
      where: {
        id: Number(mensualidad_id),
        alumno_id: Number(alumno.id),
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!mensualidad) {
      throw Object.assign(new Error("No se encontró la mensualidad."), {
        status: 404,
      });
    }
    if (
      ["anulada", "pagada"].includes(
        String(mensualidad.estado).toLowerCase(),
      ) ||
      Number(mensualidad.saldo || 0) <= 0
    ) {
      throw Object.assign(
        new Error("La mensualidad no tiene una deuda bonificable."),
        { status: 409 },
      );
    }

    const saldoAnterior = Number(mensualidad.saldo || 0);
    const montoTotalAnterior = Number(mensualidad.monto_total || 0);
    const montoPagado = Number(mensualidad.monto_pagado || 0);
    const calculado =
      tipo === "porcentaje"
        ? saldoAnterior * (valorNumerico / 100)
        : valorNumerico;
    const montoAplicado = Math.min(redondear(calculado), saldoAnterior);
    const montoTotalNuevo = Math.max(
      redondear(montoTotalAnterior - montoAplicado),
      montoPagado,
    );
    const saldoNuevo = Math.max(redondear(montoTotalNuevo - montoPagado), 0);
    const hoy = fechaArgentina();
    const estadoNuevo =
      saldoNuevo <= 0
        ? "pagada"
        : montoPagado > 0
          ? "parcial"
          : String(mensualidad.fecha_vencimiento).slice(0, 10) < hoy
            ? "vencida"
            : "pendiente";

    const bonificacion = await AlumnosBonificacionesModel.create(
      {
        alumno_id: Number(alumno.id),
        sede_id: mensualidad.sede_id
          ? Number(mensualidad.sede_id)
          : alumno.sede_id
            ? Number(alumno.sede_id)
            : null,
        mensualidad_id: Number(mensualidad.id),
        usuario_id: usuarioId,
        modalidad,
        tipo_valor: tipo,
        valor_solicitado: valorNumerico.toFixed(2),
        monto_aplicado: montoAplicado.toFixed(2),
        motivo: motivoLimpio,
        observaciones: observacionesLimpias,
      },
      { transaction },
    );

    const nota = `[BONIFICACIÓN #${bonificacion.id}] ${motivoLimpio} - ${montoAplicado.toFixed(2)}`;
    await mensualidad.update(
      {
        monto_total: montoTotalNuevo.toFixed(2),
        saldo: saldoNuevo.toFixed(2),
        estado: estadoNuevo,
        observaciones: [mensualidad.observaciones, nota]
          .filter(Boolean)
          .join("\n"),
        updated_at: new Date(),
      },
      { transaction },
    );

    await actualizarEstadoAlumnoPorDeuda({ alumno, transaction });
    await transaction.commit();

    return res.status(201).json({
      ok: true,
      message: "Bonificación aplicada a la deuda correctamente.",
      data: {
        modalidad,
        bonificacion_id: Number(bonificacion.id),
        alumno_id: Number(alumno.id),
        mensualidad_id: Number(mensualidad.id),
        monto_bonificacion: montoAplicado,
        saldo_anterior: saldoAnterior,
        saldo_nuevo: saldoNuevo,
        estado_mensualidad: estadoNuevo,
      },
    });
  } catch (requestError) {
    if (!transaction.finished) await transaction.rollback();
    console.error("Error CR_BonificacionAlumno_CTS:", requestError);
    return error(
      res,
      Number(requestError.status || 500),
      requestError.status
        ? requestError.message
        : "Error interno al aplicar la bonificación.",
    );
  }
};
