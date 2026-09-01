/*
 * Benjamin Orellana - 2026/08/31 - FIADO_RESERVABLE_20260831
 *
 * Estado financiero != habilitación operativa.
 * pendiente_pago sólo reserva cuando TODAS sus deudas abiertas pertenecen
 * a una venta de plan 100% fiada y confirmada.
 */

import { QueryTypes } from 'sequelize';
import db from '../../DataBase/db.js';

export const evaluarMembresiaReservable = async ({
  membresia,
  transaction = null
}) => {
  if (!membresia) {
    return { permitido: false, fiado_autorizado: false, motivo: 'Sin membresía.' };
  }

  const estado = String(membresia.estado || '').trim().toLowerCase();

  if (estado === 'activa') {
    return { permitido: true, fiado_autorizado: false, motivo: null };
  }

  if (estado !== 'pendiente_pago') {
    return {
      permitido: false,
      fiado_autorizado: false,
      motivo: 'El estado de la membresía no permite reservar.'
    };
  }

  const rows = await db.query(
    `
      SELECT
        pm.id AS mensualidad_id,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM cobros_detalles cd
            INNER JOIN cobros_cobros c
              ON c.id = cd.cobro_id
            WHERE cd.tipo = 'plan'
              AND cd.membresia_id = :membresiaId
              AND cd.mensualidad_id = pm.id
              AND c.estado = 'confirmado'
              AND LOWER(TRIM(COALESCE(c.observaciones, '')))
                    LIKE 'venta fiada; deuda %'
              AND NOT EXISTS (
                SELECT 1
                FROM cobros_pagos cp
                WHERE cp.cobro_id = c.id
                  AND cp.estado = 'confirmado'
              )
          )
          THEN 1
          ELSE 0
        END AS deuda_fiada_autorizada
      FROM pagos_mensualidades pm
      WHERE pm.membresia_id = :membresiaId
        AND pm.estado IN ('pendiente', 'parcial', 'vencida')
        AND pm.saldo > 0.009
      ORDER BY pm.id ASC
    `,
    {
      replacements: { membresiaId: Number(membresia.id) },
      type: QueryTypes.SELECT,
      transaction
    }
  );

  if (!rows.length) {
    return {
      permitido: false,
      fiado_autorizado: false,
      motivo: 'La membresía tiene el pago pendiente.'
    };
  }

  const todasFiadas = rows.every(
    (row) => Number(row.deuda_fiada_autorizada) === 1
  );

  return {
    permitido: todasFiadas,
    fiado_autorizado: todasFiadas,
    motivo: todasFiadas ? null : 'La membresía tiene el pago pendiente.'
  };
};

export const membresiaPuedeReservar = async ({
  membresia,
  transaction = null
}) => {
  const resultado = await evaluarMembresiaReservable({ membresia, transaction });
  return resultado.permitido;
};
