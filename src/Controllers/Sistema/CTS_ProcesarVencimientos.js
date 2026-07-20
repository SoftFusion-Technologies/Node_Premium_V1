/*
 * Benjamin Orellana - 2026/06/15 - Procesamiento operativo de vencimientos PREMIUM.
 * Sincroniza membresías, mensualidades y estado general de alumnos según cobertura vigente.
 */

import { Op } from 'sequelize';
import db from '../../DataBase/db.js';

import AlumnosModel from '../../Models/Alumno/MD_TB_Alumnos.js';
import AlumnosMembresiasModel from '../../Models/Alumno/MD_TB_AlumnosMembresias.js';
import PagosMensualidadesModel from '../../Models/Pago/MD_TB_PagosMensualidades.js';
import { normalizarCicloMembresiasAlumno } from '../../Services/Alumno/membresiaCiclo.service.js';

const ESTADOS_ALUMNO_NO_AUTOMATICOS = ['baja', 'congelado'];

const ESTADOS_MENSUALIDAD_COBRABLES = ['pendiente', 'parcial'];

const ESTADOS_MEMBRESIA_A_PROCESAR = ['activa', 'pendiente_pago'];

const responderError = (res, status, message, data = null) => {
  return res.status(status).json({
    ok: false,
    message,
    data
  });
};

// Benjamin Orellana - 2026/06/15 - Fecha local Argentina en formato YYYY-MM-DD.
const obtenerFechaArgentinaDateOnly = () => {
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

const esFechaDateOnlyValida = (value) => {
  if (!value || typeof value !== 'string') return false;

  const regexFecha = /^\d{4}-\d{2}-\d{2}$/;

  if (!regexFecha.test(value)) return false;

  const fecha = new Date(`${value}T00:00:00Z`);

  return !Number.isNaN(fecha.getTime());
};

const obtenerMembresiaVigenteActiva = async ({
  alumnoId,
  fechaProceso,
  transaction
}) => {
  return AlumnosMembresiasModel.findOne({
    where: {
      alumno_id: Number(alumnoId),
      estado: 'activa',
      fecha_inicio: {
        [Op.lte]: fechaProceso
      },
      fecha_vencimiento: {
        [Op.gte]: fechaProceso
      }
    },
    order: [
      ['fecha_inicio', 'DESC'],
      ['id', 'DESC']
    ],
    transaction
  });
};

const obtenerMembresiaPendienteActual = async ({
  alumnoId,
  fechaProceso,
  transaction
}) => {
  return AlumnosMembresiasModel.findOne({
    where: {
      alumno_id: Number(alumnoId),
      estado: 'pendiente_pago',
      fecha_inicio: {
        [Op.lte]: fechaProceso
      },
      fecha_vencimiento: {
        [Op.gte]: fechaProceso
      }
    },
    order: [
      ['fecha_inicio', 'ASC'],
      ['id', 'ASC']
    ],
    transaction
  });
};

const obtenerMembresiaFutura = async ({
  alumnoId,
  fechaProceso,
  transaction
}) => {
  return AlumnosMembresiasModel.findOne({
    where: {
      alumno_id: Number(alumnoId),
      estado: {
        [Op.in]: ['activa', 'pendiente_pago']
      },
      fecha_inicio: {
        [Op.gt]: fechaProceso
      }
    },
    order: [
      ['fecha_inicio', 'ASC'],
      ['id', 'ASC']
    ],
    transaction
  });
};

const actualizarAlumnoSiCorresponde = async ({
  alumno,
  payload,
  transaction
}) => {
  const cambios = {};

  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined) return;

    const actual = alumno[key];

    if (String(actual ?? '') !== String(value ?? '')) {
      cambios[key] = value;
    }
  });

  if (Object.keys(cambios).length === 0) {
    return false;
  }

  cambios.updated_at = new Date();

  await alumno.update(cambios, { transaction });

  return true;
};

const recalcularEstadoAlumno = async ({
  alumno,
  fechaProceso,
  transaction
}) => {
  const estadoAnterior = alumno.estado;

  if (ESTADOS_ALUMNO_NO_AUTOMATICOS.includes(alumno.estado)) {
    return {
      alumno_id: Number(alumno.id),
      accion: 'omitido_estado_manual',
      estado_anterior: estadoAnterior,
      estado_nuevo: alumno.estado
    };
  }

  const membresiaVigenteActiva = await obtenerMembresiaVigenteActiva({
    alumnoId: alumno.id,
    fechaProceso,
    transaction
  });

  if (membresiaVigenteActiva) {
    const actualizado = await actualizarAlumnoSiCorresponde({
      alumno,
      payload: {
        estado: 'activo',
        sede_id: Number(membresiaVigenteActiva.sede_id),
        fecha_inicio: alumno.fecha_inicio || membresiaVigenteActiva.fecha_inicio
      },
      transaction
    });

    return {
      alumno_id: Number(alumno.id),
      accion: actualizado ? 'actualizado_activo' : 'sin_cambios_activo',
      estado_anterior: estadoAnterior,
      estado_nuevo: 'activo',
      membresia_id: Number(membresiaVigenteActiva.id)
    };
  }

  const membresiaPendienteActual = await obtenerMembresiaPendienteActual({
    alumnoId: alumno.id,
    fechaProceso,
    transaction
  });

  if (membresiaPendienteActual) {
    const actualizado = await actualizarAlumnoSiCorresponde({
      alumno,
      payload: {
        estado: 'pendiente_pago',
        sede_id: Number(membresiaPendienteActual.sede_id),
        fecha_inicio:
          alumno.fecha_inicio || membresiaPendienteActual.fecha_inicio
      },
      transaction
    });

    return {
      alumno_id: Number(alumno.id),
      accion: actualizado
        ? 'actualizado_pendiente_pago'
        : 'sin_cambios_pendiente_pago',
      estado_anterior: estadoAnterior,
      estado_nuevo: 'pendiente_pago',
      membresia_id: Number(membresiaPendienteActual.id)
    };
  }

  const membresiaFutura = await obtenerMembresiaFutura({
    alumnoId: alumno.id,
    fechaProceso,
    transaction
  });

  if (membresiaFutura) {
    const actualizado = await actualizarAlumnoSiCorresponde({
      alumno,
      payload: {
        estado: 'inactivo'
      },
      transaction
    });

    return {
      alumno_id: Number(alumno.id),
      accion: actualizado
        ? 'actualizado_inactivo_con_cobertura_futura'
        : 'sin_cambios_inactivo_con_cobertura_futura',
      estado_anterior: estadoAnterior,
      estado_nuevo: 'inactivo',
      membresia_id: Number(membresiaFutura.id)
    };
  }

  const actualizado = await actualizarAlumnoSiCorresponde({
    alumno,
    payload: {
      estado: 'inactivo'
    },
    transaction
  });

  return {
    alumno_id: Number(alumno.id),
    accion: actualizado ? 'actualizado_inactivo' : 'sin_cambios_inactivo',
    estado_anterior: estadoAnterior,
    estado_nuevo: 'inactivo'
  };
};

export const ejecutarProcesamientoVencimientos = async ({
  fecha = null,
  alumnoId = null,
  origen = 'manual'
} = {}) => {
  const transaction = await db.transaction();

  try {
    const fechaProceso = fecha || obtenerFechaArgentinaDateOnly();

    if (!esFechaDateOnlyValida(fechaProceso)) {
      await transaction.rollback();

      return {
        ok: false,
        status: 400,
        message: 'La fecha de proceso debe tener formato YYYY-MM-DD.',
        data: null
      };
    }

    const alumnoIdFiltro = alumnoId ? Number(alumnoId) : null;

    if (
      alumnoIdFiltro !== null &&
      (!Number.isInteger(alumnoIdFiltro) || alumnoIdFiltro <= 0)
    ) {
      await transaction.rollback();

      return {
        ok: false,
        status: 400,
        message: 'El filtro alumno_id debe ser un ID válido.',
        data: null
      };
    }

    const whereAlumnos = {
      estado: {
        [Op.notIn]: ESTADOS_ALUMNO_NO_AUTOMATICOS
      }
    };

    if (alumnoIdFiltro) {
      whereAlumnos.id = alumnoIdFiltro;
    }

    const [membresiasVencidasCount] = await AlumnosMembresiasModel.update(
      {
        estado: 'vencida',
        // Los creditos no utilizados vencen con el periodo y no se trasladan.
        clases_disponibles: 0,
        updated_at: new Date()
      },
      {
        where: {
          ...(alumnoIdFiltro ? { alumno_id: alumnoIdFiltro } : {}),
          estado: {
            [Op.in]: ESTADOS_MEMBRESIA_A_PROCESAR
          },
          fecha_vencimiento: {
            [Op.lt]: fechaProceso
          }
        },
        transaction
      }
    );

    const [mensualidadesVencidasCount] = await PagosMensualidadesModel.update(
      {
        estado: 'vencida',
        updated_at: new Date()
      },
      {
        where: {
          ...(alumnoIdFiltro ? { alumno_id: alumnoIdFiltro } : {}),
          estado: {
            [Op.in]: ESTADOS_MENSUALIDAD_COBRABLES
          },
          saldo: {
            [Op.gt]: 0
          },
          fecha_vencimiento: {
            [Op.lt]: fechaProceso
          }
        },
        transaction
      }
    );

    const alumnos = await AlumnosModel.findAll({
      where: whereAlumnos,
      order: [['id', 'ASC']],
      transaction
    });

    const resultadosAlumnos = [];

    for (const alumno of alumnos) {
      // Tambien corrige alumnos que agotaron cupos y ya tenian una renovacion
      // confirmada en cola, aunque no hayan realizado otro cobro ese dia.
      await normalizarCicloMembresiasAlumno({
        alumnoId: alumno.id,
        fechaReferencia: fechaProceso,
        transaction
      });

      const resultado = await recalcularEstadoAlumno({
        alumno,
        fechaProceso,
        transaction
      });

      resultadosAlumnos.push(resultado);
    }

    await transaction.commit();

    const resumenAlumnos = resultadosAlumnos.reduce(
      (acc, item) => {
        acc.total += 1;

        if (item.estado_nuevo === 'activo') {
          acc.activos += 1;
        }

        if (item.estado_nuevo === 'pendiente_pago') {
          acc.pendientes_pago += 1;
        }

        if (item.estado_nuevo === 'inactivo') {
          acc.inactivos += 1;
        }

        if (item.accion === 'omitido_estado_manual') {
          acc.omitidos += 1;
        }

        if (item.accion?.startsWith('actualizado')) {
          acc.actualizados += 1;
        }

        return acc;
      },
      {
        total: 0,
        actualizados: 0,
        activos: 0,
        pendientes_pago: 0,
        inactivos: 0,
        omitidos: 0
      }
    );

    return {
      ok: true,
      status: 200,
      message: 'Vencimientos procesados correctamente.',
      data: {
        origen,
        fecha_proceso: fechaProceso,
        membresias_vencidas: membresiasVencidasCount,
        mensualidades_vencidas: mensualidadesVencidasCount,
        alumnos: resumenAlumnos,
        detalle: resultadosAlumnos
      }
    };
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }

    console.error('Error ejecutarProcesamientoVencimientos:', error);

    return {
      ok: false,
      status: 500,
      message: 'Error interno al procesar vencimientos.',
      data: null
    };
  }
};

export const PR_ProcesarVencimientos_CTS = async (req, res) => {
  const resultado = await ejecutarProcesamientoVencimientos({
    fecha: req.body?.fecha || req.query?.fecha || null,
    alumnoId: req.body?.alumno_id || req.query?.alumno_id || null,
    origen: 'manual'
  });

  if (!resultado.ok) {
    return responderError(
      res,
      resultado.status,
      resultado.message,
      resultado.data
    );
  }

  return res.status(resultado.status).json(resultado);
};
