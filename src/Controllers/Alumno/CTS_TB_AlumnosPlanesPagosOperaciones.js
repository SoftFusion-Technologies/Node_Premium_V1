/*
 * Benjamin Orellana - 2026/06/15 - Operaciones funcionales de planes y pagos desde ficha de alumno.
 */

import { Op, QueryTypes } from 'sequelize';
import db from '../../DataBase/db.js';

import AlumnosModel from '../../Models/Alumno/MD_TB_Alumnos.js';
import AlumnosMembresiasModel from '../../Models/Alumno/MD_TB_AlumnosMembresias.js';
import PagosMensualidadesModel from '../../Models/Pago/MD_TB_PagosMensualidades.js';
import PagosModel from '../../Models/Pago/MD_TB_Pagos.js';
import PlanesModel from '../../Models/Plan/MD_TB_Planes.js';
import PlanesPreciosModel from '../../Models/Plan/MD_TB_PlanesPrecios.js';
import SedesModel from '../../Models/Sede/MD_TB_Sedes.js';
import PagosMetodosRecurrentesModel from '../../Models/Pago/MD_TB_PagosMetodosRecurrentes.js';
import SistemaAuditoriaLogsModel from '../../Models/Sistema/MD_TB_SistemaAuditoriaLogs.js';
import { copiarRestriccionesPlan } from '../../Services/Agenda/agendaRestricciones.service.js';
import { imputarReservasPendientesMembresia } from '../../Services/Agenda/reservasPendientes.service.js';

const responderError = (res, status, message, data = null) => {
  return res.status(status).json({
    ok: false,
    message,
    data
  });
};

const esIdValido = (valor) => {
  if (valor === null || valor === undefined || valor === '') return false;

  const numero = Number(valor);

  return Number.isInteger(numero) && numero > 0;
};

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

const sumarDiasDateOnly = (fecha, dias) => {
  const valor = new Date(`${String(fecha).slice(0, 10)}T00:00:00Z`);
  valor.setUTCDate(valor.getUTCDate() + Number(dias || 0));
  return valor.toISOString().slice(0, 10);
};

const obtenerReservasFuturasAlumno = async ({
  alumnoId,
  transaction,
  fechaDesde = obtenerFechaArgentinaDateOnly()
}) => {
  return db.query(
    `SELECT r.id, r.turno_id, r.membresia_id, r.estado,
            t.sede_id, t.fecha, t.hora_inicio, t.hora_fin,
            COALESCE(t.nombre_clase, 'Clase') AS nombre_clase,
            s.nombre AS sede_nombre
       FROM agenda_turnos_reservas r
       INNER JOIN agenda_turnos t ON t.id = r.turno_id
       LEFT JOIN sedes_sedes s ON s.id = t.sede_id
      WHERE r.alumno_id = :alumnoId
        AND r.estado = 'reservada'
        AND t.estado NOT IN ('cancelado', 'bloqueado')
        AND t.fecha >= :fechaDesde
      ORDER BY t.fecha ASC, t.hora_inicio ASC, r.id ASC`,
    {
      replacements: {
        alumnoId: Number(alumnoId),
        fechaDesde: String(fechaDesde).slice(0, 10)
      },
      type: QueryTypes.SELECT,
      transaction
    }
  );
};

const bloquearOperacionConReservas = async ({
  alumnoId,
  transaction,
  operacion
}) => {
  const reservas = await obtenerReservasFuturasAlumno({
    alumnoId,
    transaction
  });

  if (!reservas.length) return null;

  const error = new Error(
    `El alumno tiene ${reservas.length} reserva${reservas.length === 1 ? '' : 's'} futura${reservas.length === 1 ? '' : 's'}. Cancelá o reprogramá esos turnos antes de ${operacion}.`
  );
  error.status = 409;
  error.code = 'RESERVAS_FUTURAS_PENDIENTES';
  error.data = { reservas_futuras: reservas };
  throw error;
};

export const OBR_ContextoOperacionesMembresiaAlumnoPlanesPagos_CTS = async (
  req,
  res
) => {
  try {
    const { alumno_id } = req.params;

    if (!esIdValido(alumno_id)) {
      return responderError(res, 400, 'El parámetro alumno_id no es válido.');
    }

    const hoy = obtenerFechaArgentinaDateOnly();
    const [alumno, membresia, reservasFuturas] = await Promise.all([
      AlumnosModel.findByPk(alumno_id),
      AlumnosMembresiasModel.findOne({
        where: {
          alumno_id: Number(alumno_id),
          estado: { [Op.in]: ['activa', 'pendiente_pago', 'congelada'] },
          fecha_inicio: { [Op.lte]: hoy },
          fecha_vencimiento: { [Op.gte]: hoy }
        },
        order: [
          ['fecha_inicio', 'DESC'],
          ['id', 'DESC']
        ]
      }),
      obtenerReservasFuturasAlumno({ alumnoId: alumno_id })
    ]);

    if (!alumno) {
      return responderError(res, 404, 'No se encontró el alumno solicitado.');
    }

    return res.status(200).json({
      ok: true,
      data: {
        alumno_id: Number(alumno_id),
        estado_alumno: alumno.estado,
        membresia: toPlain(membresia),
        reservas_futuras: reservasFuturas,
        puede_operar_sin_reservas: reservasFuturas.length === 0
      }
    });
  } catch (error) {
    console.error(
      'Error en OBR_ContextoOperacionesMembresiaAlumnoPlanesPagos_CTS:',
      error
    );
    return responderError(res, 500, 'Error al consultar el contexto operativo.');
  }
};

const diferenciaDiasDateOnly = (fechaDesde, fechaHasta) => {
  if (!fechaDesde || !fechaHasta) return null;

  const desde = new Date(`${String(fechaDesde).slice(0, 10)}T00:00:00`);
  const hasta = new Date(`${String(fechaHasta).slice(0, 10)}T00:00:00`);

  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
    return null;
  }

  const diferenciaMs = hasta.getTime() - desde.getTime();

  return Math.ceil(diferenciaMs / (1000 * 60 * 60 * 24));
};

const toPlain = (item) => {
  if (!item) return null;

  if (typeof item.get === 'function') {
    return item.get({ plain: true });
  }

  return item;
};

const calcularClasesDisponibles = (membresia) => {
  if (!membresia) {
    return {
      clases_incluidas: 0,
      clases_usadas: 0,
      clases_disponibles: 0
    };
  }

  const clasesIncluidas = Number(
    membresia.clases_incluidas ||
      membresia.cantidad_clases_periodo ||
      membresia.clases_disponibles_iniciales ||
      membresia.plan?.cantidad_clases_periodo ||
      membresia.plan?.clases_por_mes ||
      0
  );

  const clasesUsadas = Number(
    membresia.clases_usadas ||
      membresia.asistencias_usadas ||
      membresia.cantidad_asistencias ||
      0
  );

  return {
    clases_incluidas: clasesIncluidas,
    clases_usadas: clasesUsadas,
    clases_disponibles: Math.max(clasesIncluidas - clasesUsadas, 0)
  };
};

const getFechaInicioMensualidad = (mensualidad, membresiaMap) => {
  const membresia = membresiaMap.get(Number(mensualidad.membresia_id));

  return (
    mensualidad.periodo_desde ||
    mensualidad.fecha_inicio ||
    membresia?.fecha_inicio ||
    mensualidad.fecha_emision ||
    null
  );
};

const getFechaFinMensualidad = (mensualidad, membresiaMap) => {
  const membresia = membresiaMap.get(Number(mensualidad.membresia_id));

  return (
    mensualidad.periodo_hasta ||
    mensualidad.fecha_fin ||
    membresia?.fecha_vencimiento ||
    mensualidad.fecha_vencimiento ||
    null
  );
};

const calcularResumenDeuda = ({ mensualidades, membresiaMap, hoy }) => {
  const mensualidadesConSaldo = mensualidades.filter((mensualidad) => {
    const estado = String(mensualidad.estado || '').toLowerCase();
    const saldo = Number(mensualidad.saldo || 0);

    return ['pendiente', 'parcial', 'vencida'].includes(estado) && saldo > 0;
  });

  const vigentes = [];
  const futuras = [];

  mensualidadesConSaldo.forEach((mensualidad) => {
    const fechaInicio = getFechaInicioMensualidad(mensualidad, membresiaMap);

    if (!fechaInicio || String(fechaInicio).slice(0, 10) <= hoy) {
      vigentes.push(mensualidad);
      return;
    }

    futuras.push(mensualidad);
  });

  const totalVigente = vigentes.reduce((acc, mensualidad) => {
    return acc + Number(mensualidad.saldo || 0);
  }, 0);

  const totalFutura = futuras.reduce((acc, mensualidad) => {
    return acc + Number(mensualidad.saldo || 0);
  }, 0);

  return {
    deuda_vigente: totalVigente,
    deuda_futura: totalFutura,
    cantidad_mensualidades_vigentes: vigentes.length,
    cantidad_mensualidades_futuras: futuras.length,
    mensualidades_vigentes: vigentes.map((mensualidad) => ({
      id: mensualidad.id,
      membresia_id: mensualidad.membresia_id,
      estado: mensualidad.estado,
      monto_total: Number(mensualidad.monto_total || 0),
      monto_pagado: Number(mensualidad.monto_pagado || 0),
      saldo: Number(mensualidad.saldo || 0),
      fecha_inicio: getFechaInicioMensualidad(mensualidad, membresiaMap),
      fecha_fin: getFechaFinMensualidad(mensualidad, membresiaMap),
      fecha_vencimiento: mensualidad.fecha_vencimiento
    })),
    mensualidades_futuras: futuras.map((mensualidad) => ({
      id: mensualidad.id,
      membresia_id: mensualidad.membresia_id,
      estado: mensualidad.estado,
      monto_total: Number(mensualidad.monto_total || 0),
      monto_pagado: Number(mensualidad.monto_pagado || 0),
      saldo: Number(mensualidad.saldo || 0),
      fecha_inicio: getFechaInicioMensualidad(mensualidad, membresiaMap),
      fecha_fin: getFechaFinMensualidad(mensualidad, membresiaMap),
      fecha_vencimiento: mensualidad.fecha_vencimiento
    }))
  };
};

/*
 * Benjamin Orellana - 2026/07/18
 * Una renovación futura pendiente no debe bloquear anticipadamente el período
 * que el alumno ya tiene activo y pagado. El estado global solo pasa a
 * pendiente_pago cuando hoy no existe cobertura operativa sin saldo.
 */
const obtenerEstadoAlumnoPorCoberturaActual = async ({
  alumnoId,
  hoy,
  transaction
}) => {
  const membresiaVigente = await AlumnosMembresiasModel.findOne({
    where: {
      alumno_id: Number(alumnoId),
      plan_id: { [Op.ne]: null },
      estado: 'activa',
      fecha_inicio: { [Op.lte]: hoy },
      fecha_vencimiento: { [Op.gte]: hoy }
    },
    order: [['fecha_inicio', 'DESC'], ['id', 'DESC']],
    transaction
  });

  if (!membresiaVigente) return 'pendiente_pago';

  const deudaCoberturaActual = await PagosMensualidadesModel.findOne({
    where: {
      alumno_id: Number(alumnoId),
      membresia_id: Number(membresiaVigente.id),
      estado: { [Op.in]: ['pendiente', 'parcial', 'vencida'] },
      saldo: { [Op.gt]: 0 }
    },
    transaction
  });

  return deudaCoberturaActual ? 'pendiente_pago' : 'activo';
};

const mapMembresiaResumen = (membresia, hoy) => {
  if (!membresia) return null;

  const clases = calcularClasesDisponibles(membresia);

  return {
    id: membresia.id,
    estado: membresia.estado,
    fecha_inicio: membresia.fecha_inicio,
    fecha_vencimiento: membresia.fecha_vencimiento,
    dias_restantes: diferenciaDiasDateOnly(hoy, membresia.fecha_vencimiento),
    plan: membresia.plan
      ? {
          id: membresia.plan.id,
          nombre: membresia.plan.nombre,
          codigo: membresia.plan.codigo,
          clases_por_mes: membresia.plan.clases_por_mes,
          cantidad_clases_periodo: membresia.plan.cantidad_clases_periodo,
          duracion_dias: membresia.plan.duracion_dias
        }
      : null,
    sede: membresia.sede
      ? {
          id: membresia.sede.id,
          nombre: membresia.sede.nombre,
          codigo: membresia.sede.codigo
        }
      : null,
    precio_lista: Number(membresia.precio_lista || 0),
    precio_final: Number(membresia.precio_final || 0),
    descuento_valor: Number(membresia.descuento_valor || 0),
    descuento_porcentaje: Number(membresia.descuento_porcentaje || 0),
    ...clases
  };
};


// Benjamin Orellana - 2026/06/30 - Valida fechas DATEONLY usadas al generar membresías operativas desde ficha de alumno.
const esFechaDateOnlyValida = (valor) => {
  if (!valor || typeof valor !== 'string') return false;

  const fecha = String(valor).slice(0, 10);
  const regexFecha = /^\d{4}-\d{2}-\d{2}$/;

  if (!regexFecha.test(fecha)) return false;

  const date = new Date(`${fecha}T00:00:00`);

  return !Number.isNaN(date.getTime());
};

// Benjamin Orellana - 2026/06/30 - Normaliza fechas opcionales conservando formato YYYY-MM-DD para operaciones de membresía.
const normalizarFechaDateOnlyOperativa = (valor, fechaDefault = null) => {
  if (valor === undefined || valor === null || valor === '') {
    return fechaDefault;
  }

  return String(valor).slice(0, 10);
};

// Benjamin Orellana - 2026/06/30 - Busca precio vigente priorizando sede específica y usando precio global si la sede no tiene precio propio.
const buscarPrecioVigentePlanOperativo = async ({
  planId,
  sedeId,
  fechaConsulta,
  transaction
}) => {
  const whereBase = {
    plan_id: Number(planId),
    activo: 1,
    fecha_desde: {
      [Op.lte]: fechaConsulta
    },
    [Op.or]: [
      { fecha_hasta: null },
      {
        fecha_hasta: {
          [Op.gte]: fechaConsulta
        }
      }
    ]
  };

  const precioSede = await PlanesPreciosModel.findOne({
    where: {
      ...whereBase,
      sede_id: Number(sedeId)
    },
    order: [
      ['fecha_desde', 'DESC'],
      ['id', 'DESC']
    ],
    transaction
  });

  if (precioSede) {
    return {
      precio: precioSede,
      origen_precio: 'sede'
    };
  }

  const precioGlobal = await PlanesPreciosModel.findOne({
    where: {
      ...whereBase,
      sede_id: null
    },
    order: [
      ['fecha_desde', 'DESC'],
      ['id', 'DESC']
    ],
    transaction
  });

  if (!precioGlobal) {
    return {
      precio: null,
      origen_precio: null
    };
  }

  return {
    precio: precioGlobal,
    origen_precio: 'global'
  };
};

// Benjamin Orellana - 2026/06/30 - Detecta membresías operativas superpuestas antes de crear una nueva cobertura.
const buscarMembresiaSuperpuestaOperativa = async ({
  alumnoId,
  fechaInicio,
  fechaVencimiento,
  transaction
}) => {
  return AlumnosMembresiasModel.findOne({
    where: {
      alumno_id: Number(alumnoId),
      estado: {
        [Op.in]: ['activa', 'pendiente_pago', 'congelada']
      },
      fecha_inicio: {
        [Op.lte]: fechaVencimiento
      },
      fecha_vencimiento: {
        [Op.gte]: fechaInicio
      }
    },
    order: [
      ['fecha_inicio', 'DESC'],
      ['id', 'DESC']
    ],
    transaction
  });
};

// Benjamin Orellana - 2026/08/01 - Valida enteros no negativos usados por la carga manual de créditos.
const esEnteroNoNegativo = (valor) => {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 0;
};

const obtenerUsuarioIdRequest = (req) =>
  Number(req.user?.id || req.user?.usuario_id) || null;

const obtenerIpRequest = (req) =>
  req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || null;

const obtenerRolCodigoRequest = (req) =>
  String(req.user?.rol_codigo || '').trim().toUpperCase();

const obtenerAsignacionSedeUsuario = (user, sedeId) => {
  if (!Number(sedeId) || !Array.isArray(user?.sedes)) return null;

  return (
    user.sedes.find(
      (sede) => Number(sede?.id ?? sede?.sede_id) === Number(sedeId)
    ) || null
  );
};

const usuarioPuedeOperarSedeMembresia = (user, sedeId) => {
  const rolCodigo = String(user?.rol_codigo || '').trim().toUpperCase();

  if (['SUPER_ADMIN', 'DIRECCION'].includes(rolCodigo)) return true;

  const sedeUsuario = obtenerAsignacionSedeUsuario(user, sedeId);
  const asignacion = sedeUsuario?.asignacion || {};

  return Boolean(
    sedeUsuario &&
      asignacion.activo !== false &&
      asignacion.puede_operar !== false
  );
};

const usuarioEsCoordinadorSede = (user, sedeId) => {
  const rolGlobal = String(user?.rol_codigo || '').trim().toUpperCase();
  if (rolGlobal === 'COORD_SEDE') return true;

  const sedeUsuario = obtenerAsignacionSedeUsuario(user, sedeId);
  const rolEfectivo = String(
    sedeUsuario?.asignacion?.rol_codigo || sedeUsuario?.rol_codigo || ''
  )
    .trim()
    .toUpperCase();

  return rolEfectivo === 'COORD_SEDE';
};

const registrarAuditoriaMembresiaMigracion = async ({
  req,
  alumno,
  membresia,
  accion,
  valoresAnteriores = null,
  valoresNuevos,
  transaction
}) => {
  await SistemaAuditoriaLogsModel.create(
    {
      usuario_id: obtenerUsuarioIdRequest(req),
      sede_id: Number(membresia.sede_id || alumno.sede_id) || null,
      modulo: 'ALUMNOS',
      accion,
      entidad: 'alumnos_membresias',
      entidad_id: Number(membresia.id),
      descripcion: `${accion === 'CREAR_MEMBRESIA_MIGRACION' ? 'Alta' : 'Actualización'} manual de membresía por migración para ${alumno.nombre} ${alumno.apellido}.`,
      valores_anteriores: valoresAnteriores,
      valores_nuevos: valoresNuevos,
      ip: obtenerIpRequest(req),
      user_agent: req.headers['user-agent'] || null
    },
    { transaction }
  );
};

const obtenerPayloadMembresiaMigracion = ({
  body,
  plan,
  fechaInicio,
  fechaVencimiento,
  precioLista,
  estadoActual = null
}) => {
  const clasesIncluidas = Number(body.clases_incluidas);
  const clasesDisponibles = Number(body.clases_disponibles);
  const clasesUsadas = clasesIncluidas - clasesDisponibles;
  const hoy = obtenerFechaArgentinaDateOnly();
  const estado =
    estadoActual === 'pendiente_pago'
      ? 'pendiente_pago'
      : fechaVencimiento < hoy
        ? 'vencida'
        : 'activa';

  return {
    plan_id: Number(plan.id),
    sede_id: Number(body.sede_id),
    fecha_inicio: fechaInicio,
    fecha_vencimiento: fechaVencimiento,
    estado,
    precio_lista: Number(precioLista || 0).toFixed(2),
    descuento_valor: '0.00',
    descuento_porcentaje: '0.00',
    precio_final: Number(precioLista || 0).toFixed(2),
    clases_incluidas: clasesIncluidas,
    clases_usadas: clasesUsadas,
    clases_disponibles: clasesDisponibles,
    origen_alta: 'migracion'
  };
};

const validarDatosMembresiaMigracion = ({
  body,
  fechaInicio,
  fechaVencimiento
}) => {
  const errores = [];

  if (!esIdValido(body.plan_id)) errores.push('El plan es obligatorio.');
  if (!esIdValido(body.sede_id)) errores.push('La sede es obligatoria.');

  if (!esFechaDateOnlyValida(fechaInicio)) {
    errores.push('La fecha de inicio debe tener formato YYYY-MM-DD.');
  }

  if (!esFechaDateOnlyValida(fechaVencimiento)) {
    errores.push('La fecha de vencimiento debe tener formato YYYY-MM-DD.');
  }

  if (
    esFechaDateOnlyValida(fechaInicio) &&
    esFechaDateOnlyValida(fechaVencimiento) &&
    fechaVencimiento < fechaInicio
  ) {
    errores.push('La fecha de vencimiento no puede ser anterior al inicio.');
  }

  if (!esEnteroNoNegativo(body.clases_incluidas)) {
    errores.push('Los créditos incluidos deben ser un entero mayor o igual a 0.');
  }

  if (!esEnteroNoNegativo(body.clases_disponibles)) {
    errores.push('Los créditos disponibles deben ser un entero mayor o igual a 0.');
  }

  if (
    esEnteroNoNegativo(body.clases_incluidas) &&
    esEnteroNoNegativo(body.clases_disponibles) &&
    Number(body.clases_disponibles) > Number(body.clases_incluidas)
  ) {
    errores.push('Los créditos disponibles no pueden superar los incluidos.');
  }

  return errores;
};

const normalizarObservacionMigracionUsuario = (valor) => {
  if (valor === undefined || valor === null) return null;

  const texto = String(valor).trim();
  return texto || null;
};

// La observación visible representa el dato actual de la migración. El
// historial de cada modificación se conserva en sistema_auditoria_logs, por
// lo que no se vuelven a concatenar leyendas técnicas en cada guardado.
const construirObservacionesMembresiaMigracion = ({
  tipo,
  observacionUsuario
}) => {
  const leyenda =
    tipo === 'crear'
      ? '[MIGRACIÓN] Membresía cargada manualmente sin generar cobro ni deuda.'
      : '[MIGRACIÓN] Plan, fechas o créditos ajustados manualmente.';
  const observacion = normalizarObservacionMigracionUsuario(observacionUsuario);

  return [leyenda, observacion].filter(Boolean).join('\n');
};

const obtenerPrecioReferenciaMigracion = async ({
  planId,
  sedeId,
  fechaInicio,
  transaction
}) => {
  const hoy = obtenerFechaArgentinaDateOnly();
  let resultado = await buscarPrecioVigentePlanOperativo({
    planId,
    sedeId,
    fechaConsulta: fechaInicio,
    transaction
  });

  if (!resultado.precio && fechaInicio !== hoy) {
    resultado = await buscarPrecioVigentePlanOperativo({
      planId,
      sedeId,
      fechaConsulta: hoy,
      transaction
    });
  }

  return Number(resultado.precio?.precio || 0);
};

// Benjamin Orellana - 2026/06/15 - Obtiene vencimientos y estado financiero operativo del alumno.
export const OBR_VencimientosAlumnoPlanesPagos_CTS = async (req, res) => {
  try {
    const { alumno_id } = req.params;

    if (!esIdValido(alumno_id)) {
      return responderError(res, 400, 'El parámetro alumno_id no es válido.');
    }

    const alumno = await AlumnosModel.findByPk(alumno_id, {
      include: [
        {
          model: SedesModel,
          as: 'sede',
          attributes: ['id', 'nombre', 'codigo']
        }
      ]
    });

    if (!alumno) {
      return responderError(res, 404, 'No se encontró el alumno solicitado.');
    }

    const hoy = obtenerFechaArgentinaDateOnly();

    const membresiasRows = await AlumnosMembresiasModel.findAll({
      where: {
        alumno_id: Number(alumno_id)
      },
      include: [
        {
          model: PlanesModel,
          as: 'plan',
          attributes: [
            'id',
            'nombre',
            'codigo',
            'clases_por_mes',
            'cantidad_clases_periodo',
            'duracion_dias',
            'activo'
          ]
        },
        {
          model: SedesModel,
          as: 'sede',
          attributes: ['id', 'nombre', 'codigo', 'activo']
        }
      ],
      order: [
        ['fecha_inicio', 'ASC'],
        ['id', 'ASC']
      ]
    });

    const membresias = membresiasRows.map(toPlain);

    const membresiaMap = new Map(
      membresias.map((membresia) => [Number(membresia.id), membresia])
    );

    const membresiaVigente =
      membresias.find((membresia) => {
        return (
          String(membresia.estado).toLowerCase() === 'activa' &&
          String(membresia.fecha_inicio).slice(0, 10) <= hoy &&
          String(membresia.fecha_vencimiento).slice(0, 10) >= hoy
        );
      }) || null;

    const membresiaPendienteActual =
      membresias.find((membresia) => {
        return (
          String(membresia.estado).toLowerCase() === 'pendiente_pago' &&
          String(membresia.fecha_inicio).slice(0, 10) <= hoy &&
          String(membresia.fecha_vencimiento).slice(0, 10) >= hoy
        );
      }) || null;

    const proximasMembresias = membresias.filter((membresia) => {
      return (
        String(membresia.fecha_inicio).slice(0, 10) > hoy &&
        !['cancelada', 'vencida'].includes(
          String(membresia.estado || '').toLowerCase()
        )
      );
    });

    const proximaRenovacion = proximasMembresias[0] || null;

    const mensualidadesRows = await PagosMensualidadesModel.findAll({
      where: {
        alumno_id: Number(alumno_id)
      },
      order: [
        ['fecha_vencimiento', 'DESC'],
        ['id', 'DESC']
      ]
    });

    const mensualidades = mensualidadesRows.map(toPlain);

    const resumenDeuda = calcularResumenDeuda({
      mensualidades,
      membresiaMap,
      hoy
    });

    const pagosPendientesRows = await PagosModel.findAll({
      where: {
        alumno_id: Number(alumno_id),
        estado: 'pendiente_validacion'
      },
      order: [
        ['created_at', 'DESC'],
        ['id', 'DESC']
      ]
    });

    const pagosPendientes = pagosPendientesRows.map(toPlain);

    const estadoOperativo = (() => {
      const estadoAlumno = String(alumno.estado || '').toLowerCase();

      if (estadoAlumno === 'baja') return 'baja';
      if (estadoAlumno === 'congelado') return 'congelado';
      if (membresiaVigente) return 'activo';
      if (membresiaPendienteActual) return 'pendiente_pago';
      return 'sin_cobertura_vigente';
    })();

    return res.status(200).json({
      ok: true,
      message: 'Vencimientos del alumno obtenidos correctamente.',
      data: {
        fecha_proceso: hoy,
        alumno: {
          id: alumno.id,
          nombre: alumno.nombre,
          apellido: alumno.apellido,
          dni: alumno.dni,
          email: alumno.email,
          telefono: alumno.telefono,
          estado: alumno.estado,
          estado_operativo: estadoOperativo,
          sede: alumno.sede
            ? {
                id: alumno.sede.id,
                nombre: alumno.sede.nombre,
                codigo: alumno.sede.codigo
              }
            : null
        },
        membresia_vigente: mapMembresiaResumen(membresiaVigente, hoy),
        membresia_pendiente_actual: mapMembresiaResumen(
          membresiaPendienteActual,
          hoy
        ),
        proxima_renovacion: mapMembresiaResumen(proximaRenovacion, hoy),
        resumen_deuda: resumenDeuda,
        pagos_pendientes_validacion: pagosPendientes.map((pago) => ({
          id: pago.id,
          mensualidad_id: pago.mensualidad_id,
          monto: Number(pago.monto || 0),
          estado: pago.estado,
          fecha_pago: pago.fecha_pago,
          referencia: pago.referencia,
          observaciones: pago.observaciones
        })),
        resumen: {
          tiene_cobertura_vigente: Boolean(membresiaVigente),
          tiene_proxima_renovacion: Boolean(proximaRenovacion),
          tiene_deuda_vigente: Number(resumenDeuda.deuda_vigente || 0) > 0,
          tiene_deuda_futura: Number(resumenDeuda.deuda_futura || 0) > 0,
          pagos_pendientes_validacion: pagosPendientes.length
        }
      }
    });
  } catch (error) {
    console.error('Error en OBR_VencimientosAlumnoPlanesPagos_CTS:', error);

    return responderError(
      res,
      500,
      'Error interno al obtener vencimientos del alumno.'
    );
  }
};

// Benjamin Orellana - 2026/06/30 - Genera membresía inicial o administrativa y deja una mensualidad pendiente sin registrar pago.
export const CR_GenerarMembresiaAlumnoPlanesPagos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { alumno_id } = req.params;

    if (!esIdValido(alumno_id)) {
      await transaction.rollback();
      return responderError(res, 400, 'El parámetro alumno_id no es válido.');
    }

    const {
      plan_id,
      sede_id,
      fecha_inicio,
      fecha_vencimiento,
      generar_mensualidad = true,
      descuento_valor = 0,
      descuento_porcentaje = 0,
      observaciones
    } = req.body;

    if (!esIdValido(plan_id)) {
      await transaction.rollback();
      return responderError(res, 400, 'El plan es obligatorio.');
    }

    if (!esIdValido(sede_id)) {
      await transaction.rollback();
      return responderError(res, 400, 'La sede es obligatoria.');
    }

    const hoy = obtenerFechaArgentinaDateOnly();
    const fechaInicioFinal = normalizarFechaDateOnlyOperativa(
      fecha_inicio,
      hoy
    );

    if (!esFechaDateOnlyValida(fechaInicioFinal)) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'La fecha de inicio debe ser válida y tener formato YYYY-MM-DD.'
      );
    }

    const alumno = await AlumnosModel.findByPk(alumno_id, { transaction });

    if (!alumno) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el alumno solicitado.');
    }

    if (String(alumno.estado).toLowerCase() === 'baja') {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'No se puede generar una membresía para un alumno dado de baja. Primero debe reingresar.'
      );
    }

    const sede = await SedesModel.findOne({
      where: {
        id: Number(sede_id),
        activo: 1
      },
      transaction
    });

    if (!sede) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró la sede indicada o está inactiva.'
      );
    }

    const plan = await PlanesModel.findOne({
      where: {
        id: Number(plan_id),
        activo: 1
      },
      transaction
    });

    if (!plan) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró el plan indicado o está inactivo.'
      );
    }

    const duracionDias = Number(plan.duracion_dias || 0);

    if (!Number.isFinite(duracionDias) || duracionDias <= 0) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El plan no tiene una duración válida para calcular el vencimiento.'
      );
    }

    const fechaVencimientoFinal = normalizarFechaDateOnlyOperativa(
      fecha_vencimiento,
      sumarDiasDateOnly(fechaInicioFinal, Math.max(duracionDias - 1, 0))
    );

    if (!esFechaDateOnlyValida(fechaVencimientoFinal)) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'La fecha de vencimiento debe ser válida y tener formato YYYY-MM-DD.'
      );
    }

    if (fechaVencimientoFinal < fechaInicioFinal) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'La fecha de vencimiento no puede ser menor que la fecha de inicio.'
      );
    }

    const membresiaSuperpuesta = await buscarMembresiaSuperpuestaOperativa({
      alumnoId: alumno_id,
      fechaInicio: fechaInicioFinal,
      fechaVencimiento: fechaVencimientoFinal,
      transaction
    });

    if (membresiaSuperpuesta) {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'El alumno ya tiene una membresía operativa que se superpone con el período indicado.',
        {
          membresia_id: membresiaSuperpuesta.id,
          fecha_inicio: membresiaSuperpuesta.fecha_inicio,
          fecha_vencimiento: membresiaSuperpuesta.fecha_vencimiento,
          estado: membresiaSuperpuesta.estado
        }
      );
    }

    const resultadoPrecio = await buscarPrecioVigentePlanOperativo({
      planId: plan_id,
      sedeId: sede_id,
      fechaConsulta: fechaInicioFinal,
      transaction
    });

    if (!resultadoPrecio.precio) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'No hay un precio vigente para este plan en la sede indicada ni un precio global vigente.'
      );
    }

    const precioLista = Number(resultadoPrecio.precio.precio || 0);
    const descuentoValorNumerico = Number(descuento_valor || 0);
    const descuentoPorcentajeNumerico = Number(descuento_porcentaje || 0);

    if (
      !Number.isFinite(precioLista) ||
      precioLista < 0 ||
      !Number.isFinite(descuentoValorNumerico) ||
      descuentoValorNumerico < 0 ||
      !Number.isFinite(descuentoPorcentajeNumerico) ||
      descuentoPorcentajeNumerico < 0
    ) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El precio o descuento indicado no es válido.'
      );
    }

    const descuentoPorPorcentaje =
      precioLista * (descuentoPorcentajeNumerico / 100);
    const precioFinal = Math.max(
      precioLista - descuentoValorNumerico - descuentoPorPorcentaje,
      0
    );

    const clasesIncluidas = Number(
      plan.cantidad_clases_periodo || plan.clases_por_mes || 0
    );

    const observacionMembresia = [
      '[GENERACIÓN MEMBRESÍA] Alta administrativa desde ficha del alumno',
      `Plan: ${plan.nombre || plan.id}`,
      `Sede: ${sede.nombre || sede.id}`,
      `Precio: ${precioLista}`,
      `Origen precio: ${resultadoPrecio.origen_precio}`,
      observaciones ? String(observaciones).trim() : null
    ]
      .filter(Boolean)
      .join(' - ');

    const nuevaMembresia = await AlumnosMembresiasModel.create(
      {
        alumno_id: Number(alumno_id),
        plan_id: Number(plan_id),
        sede_id: Number(sede_id),
        fecha_inicio: fechaInicioFinal,
        fecha_vencimiento: fechaVencimientoFinal,
        estado: 'pendiente_pago',
        precio_lista: precioLista.toFixed(2),
        descuento_valor: descuentoValorNumerico.toFixed(2),
        descuento_porcentaje: descuentoPorcentajeNumerico.toFixed(2),
        precio_final: precioFinal.toFixed(2),
        clases_incluidas: clasesIncluidas,
        clases_usadas: 0,
        clases_disponibles: clasesIncluidas,
        origen_alta: 'administracion',
        agenda_restricciones: await copiarRestriccionesPlan({ planId: plan.id, transaction }),
        observaciones: observacionMembresia
      },
      { transaction }
    );

    let nuevaMensualidad = null;

    if (generar_mensualidad !== false) {
      const fechaBasePeriodo = new Date(`${fechaInicioFinal}T00:00:00`);
      const estadoMensualidad =
        fechaVencimientoFinal < hoy ? 'vencida' : 'pendiente';

      nuevaMensualidad = await PagosMensualidadesModel.create(
        {
          alumno_id: Number(alumno_id),
          membresia_id: Number(nuevaMembresia.id),
          sede_id: Number(sede_id),
          periodo_anio: fechaBasePeriodo.getFullYear(),
          periodo_mes: fechaBasePeriodo.getMonth() + 1,
          periodo_desde: fechaInicioFinal,
          periodo_hasta: fechaVencimientoFinal,
          fecha_emision: hoy,
          fecha_vencimiento: fechaVencimientoFinal,
          monto_total: precioFinal.toFixed(2),
          monto_pagado: Number(0).toFixed(2),
          saldo: precioFinal.toFixed(2),
          estado: estadoMensualidad,
          observaciones:
            '[GENERACIÓN MEMBRESÍA] Mensualidad pendiente generada automáticamente.'
        },
        { transaction }
      );
    }

    let estadoAlumnoResultante = String(alumno.estado).toLowerCase();

    if (!['baja', 'congelado'].includes(estadoAlumnoResultante)) {
      estadoAlumnoResultante = await obtenerEstadoAlumnoPorCoberturaActual({
        alumnoId: alumno_id,
        hoy,
        transaction
      });

      await alumno.update(
        {
          sede_id: Number(sede_id),
          fecha_inicio: alumno.fecha_inicio || fechaInicioFinal,
          estado: estadoAlumnoResultante,
          updated_at: new Date()
        },
        { transaction }
      );
    }

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      message: 'Membresía generada correctamente.',
      data: {
        alumno_id: Number(alumno_id),
        membresia_id: nuevaMembresia.id,
        mensualidad_id: nuevaMensualidad?.id || null,
        plan_id: Number(plan_id),
        sede_id: Number(sede_id),
        fecha_inicio: fechaInicioFinal,
        fecha_vencimiento: fechaVencimientoFinal,
        estado_alumno: estadoAlumnoResultante,
        estado_membresia: nuevaMembresia.estado,
        estado_mensualidad: nuevaMensualidad?.estado || null,
        precio_lista: precioLista,
        precio_final: precioFinal,
        origen_precio: resultadoPrecio.origen_precio,
        mensualidad_generada: Boolean(nuevaMensualidad)
      }
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en CR_GenerarMembresiaAlumnoPlanesPagos_CTS:', error);

    return responderError(res, 500, 'Error interno al generar membresía.');
  }
};

// Benjamin Orellana - 2026/08/01 - Crea una membresía manual para migrar alumnos sin generar deuda ni caja.
export const CR_MembresiaMigracionAlumnoPlanesPagos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const alumnoId = Number(req.params.alumno_id);
    const fechaInicio = normalizarFechaDateOnlyOperativa(req.body.fecha_inicio);
    const fechaVencimiento = normalizarFechaDateOnlyOperativa(
      req.body.fecha_vencimiento
    );
    const errores = validarDatosMembresiaMigracion({
      body: req.body,
      fechaInicio,
      fechaVencimiento
    });

    if (!esIdValido(alumnoId)) {
      errores.unshift('El parámetro alumno_id no es válido.');
    }

    if (errores.length > 0) {
      await transaction.rollback();
      return responderError(res, 400, 'Datos inválidos para migrar la membresía.', errores);
    }

    const alumno = await AlumnosModel.findByPk(alumnoId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!alumno) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el alumno solicitado.');
    }

    if (
      ['baja', 'congelado'].includes(String(alumno.estado).toLowerCase())
    ) {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'No se puede asignar una membresía a un alumno dado de baja o congelado. Primero debe regularizar su estado.'
      );
    }

    const [plan, sede] = await Promise.all([
      PlanesModel.findOne({
        where: { id: Number(req.body.plan_id), activo: 1 },
        transaction
      }),
      SedesModel.findOne({
        where: { id: Number(req.body.sede_id), activo: 1 },
        transaction
      })
    ]);

    if (!plan) {
      await transaction.rollback();
      return responderError(res, 404, 'El plan indicado no existe o está inactivo.');
    }

    if (!sede) {
      await transaction.rollback();
      return responderError(res, 404, 'La sede indicada no existe o está inactiva.');
    }

    const superpuesta = await buscarMembresiaSuperpuestaOperativa({
      alumnoId,
      fechaInicio,
      fechaVencimiento,
      transaction
    });

    if (superpuesta) {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'El alumno ya tiene una membresía operativa superpuesta con las fechas seleccionadas.',
        {
          membresia_id: Number(superpuesta.id),
          fecha_inicio: superpuesta.fecha_inicio,
          fecha_vencimiento: superpuesta.fecha_vencimiento,
          estado: superpuesta.estado
        }
      );
    }

    const precioLista = await obtenerPrecioReferenciaMigracion({
      planId: plan.id,
      sedeId: sede.id,
      fechaInicio,
      transaction
    });
    const payload = obtenerPayloadMembresiaMigracion({
      body: req.body,
      plan,
      fechaInicio,
      fechaVencimiento,
      precioLista
    });
    const observaciones = construirObservacionesMembresiaMigracion({
      tipo: 'crear',
      observacionUsuario: req.body.observaciones
    });

    const membresia = await AlumnosMembresiasModel.create(
      {
        alumno_id: alumnoId,
        ...payload,
        agenda_restricciones: await copiarRestriccionesPlan({ planId: plan.id, transaction }),
        observaciones
      },
      { transaction }
    );

    if (payload.estado === 'activa') {
      await imputarReservasPendientesMembresia({ membresia, transaction });
    }

    const hoy = obtenerFechaArgentinaDateOnly();
    const cubreHoy = fechaInicio <= hoy && fechaVencimiento >= hoy;

    await alumno.update(
      {
        sede_id: Number(sede.id),
        fecha_inicio: alumno.fecha_inicio || fechaInicio,
        ...(cubreHoy && payload.estado === 'activa'
          ? {
              estado: 'activo',
              usuario_validacion_id:
                alumno.usuario_validacion_id || obtenerUsuarioIdRequest(req)
            }
          : {}),
        updated_at: new Date()
      },
      { transaction }
    );

    await registrarAuditoriaMembresiaMigracion({
      req,
      alumno,
      membresia,
      accion: 'CREAR_MEMBRESIA_MIGRACION',
      valoresNuevos: {
        alumno_id: alumnoId,
        ...payload,
        observaciones
      },
      transaction
    });

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      message: 'Plan, fechas y créditos migrados correctamente. No se generó deuda ni movimiento de caja.',
      data: {
        membresia_id: Number(membresia.id),
        alumno_id: alumnoId,
        ...payload,
        observaciones,
        cobrar_ahora: false
      }
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('Error en CR_MembresiaMigracionAlumnoPlanesPagos_CTS:', error);
    return responderError(res, 500, 'Error interno al migrar la membresía.');
  }
};

// Benjamin Orellana - 2026/08/01 - Ajusta manualmente fechas, plan y créditos de una membresía existente.
export const UR_MembresiaMigracionAlumnoPlanesPagos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const alumnoId = Number(req.params.alumno_id);
    const membresiaId = Number(req.params.membresia_id);
    const fechaInicio = normalizarFechaDateOnlyOperativa(req.body.fecha_inicio);
    const fechaVencimiento = normalizarFechaDateOnlyOperativa(
      req.body.fecha_vencimiento
    );
    const errores = validarDatosMembresiaMigracion({
      body: req.body,
      fechaInicio,
      fechaVencimiento
    });

    if (!esIdValido(alumnoId)) errores.unshift('El parámetro alumno_id no es válido.');
    if (!esIdValido(membresiaId)) errores.unshift('La membresía indicada no es válida.');

    if (errores.length > 0) {
      await transaction.rollback();
      return responderError(res, 400, 'Datos inválidos para actualizar la membresía.', errores);
    }

    const [alumno, membresia] = await Promise.all([
      AlumnosModel.findByPk(alumnoId, {
        transaction,
        lock: transaction.LOCK.UPDATE
      }),
      AlumnosMembresiasModel.findOne({
        where: { id: membresiaId, alumno_id: alumnoId },
        transaction,
        lock: transaction.LOCK.UPDATE
      })
    ]);

    if (!alumno) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el alumno solicitado.');
    }

    if (!membresia) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró la membresía del alumno.');
    }

    if (
      ['baja', 'congelado'].includes(String(alumno.estado).toLowerCase())
    ) {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'No se puede editar el plan de un alumno dado de baja o congelado. Primero debe regularizar su estado.'
      );
    }

    if (['cancelada', 'congelada'].includes(String(membresia.estado).toLowerCase())) {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'No se puede editar manualmente una membresía cancelada o congelada.'
      );
    }

    const rolCodigo = obtenerRolCodigoRequest(req);
    const esSuperAdmin = rolCodigo === 'SUPER_ADMIN';
    const esCoordinador = usuarioEsCoordinadorSede(
      req.user,
      membresia.sede_id
    );
    const fechaInicioActual = String(membresia.fecha_inicio).slice(0, 10);
    const fechaVencimientoActual = String(membresia.fecha_vencimiento).slice(
      0,
      10
    );

    if (!esSuperAdmin && !esCoordinador) {
      await transaction.rollback();
      return responderError(
        res,
        403,
        'No tiene permisos para ajustar esta membresía.'
      );
    }

    if (
      esCoordinador &&
      !usuarioPuedeOperarSedeMembresia(req.user, membresia.sede_id)
    ) {
      await transaction.rollback();
      return responderError(
        res,
        403,
        'No tiene acceso operativo a la sede de esta membresía.'
      );
    }

    if (esCoordinador) {
      const camposProtegidos = [];

      if (Number(req.body.plan_id) !== Number(membresia.plan_id)) {
        camposProtegidos.push('plan_id');
      }
      if (Number(req.body.sede_id) !== Number(membresia.sede_id)) {
        camposProtegidos.push('sede_id');
      }
      if (fechaInicio !== fechaInicioActual) {
        camposProtegidos.push('fecha_inicio');
      }

      if (camposProtegidos.length > 0) {
        await transaction.rollback();
        return responderError(
          res,
          403,
          'El coordinador solo puede modificar el vencimiento, los créditos disponibles y la observación.',
          { campos_bloqueados: camposProtegidos }
        );
      }
    }

    const [plan, sede] = await Promise.all([
      PlanesModel.findOne({
        where: { id: Number(req.body.plan_id), activo: 1 },
        transaction
      }),
      SedesModel.findOne({
        where: { id: Number(req.body.sede_id), activo: 1 },
        transaction
      })
    ]);

    if (!plan) {
      await transaction.rollback();
      return responderError(res, 404, 'El plan indicado no existe o está inactivo.');
    }

    if (!sede) {
      await transaction.rollback();
      return responderError(res, 404, 'La sede indicada no existe o está inactiva.');
    }

    const cambiaPlan = Number(membresia.plan_id) !== Number(plan.id);
    const cambiaSede = Number(membresia.sede_id) !== Number(sede.id);
    const cambiaFechaInicio = fechaInicioActual !== fechaInicio;
    const cambiaFechaVencimiento =
      fechaVencimientoActual !== fechaVencimiento;
    const acortaFechaVencimiento =
      fechaVencimiento < fechaVencimientoActual;

    // Regalar créditos o extender el vencimiento no invalida reservas existentes.
    // Se mantiene la protección cuando cambia plan/sede/inicio o se acorta la cobertura.
    if (
      cambiaPlan ||
      cambiaSede ||
      cambiaFechaInicio ||
      acortaFechaVencimiento
    ) {
      await bloquearOperacionConReservas({
        alumnoId,
        transaction,
        operacion: 'modificar el plan o reducir la cobertura de la membresía'
      });
    }

    // Los ajustes exclusivos de créditos u observaciones no deben quedar
    // bloqueados por superposiciones históricas que ya existían en los datos.
    // Si cambia el período, solo se bloquea cuando aparece una superposición
    // con una membresía que no se superponía antes de esta edición.
    if (cambiaFechaInicio || cambiaFechaVencimiento) {
      const estadosOperativos = ['activa', 'pendiente_pago', 'congelada'];

      const [superpuestasPrevias, superpuestasPropuestas] = await Promise.all([
        AlumnosMembresiasModel.findAll({
          attributes: ['id'],
          where: {
            id: { [Op.ne]: membresiaId },
            alumno_id: alumnoId,
            estado: { [Op.in]: estadosOperativos },
            fecha_inicio: { [Op.lte]: fechaVencimientoActual },
            fecha_vencimiento: { [Op.gte]: fechaInicioActual }
          },
          transaction
        }),
        AlumnosMembresiasModel.findAll({
          attributes: ['id'],
          where: {
            id: { [Op.ne]: membresiaId },
            alumno_id: alumnoId,
            estado: { [Op.in]: estadosOperativos },
            fecha_inicio: { [Op.lte]: fechaVencimiento },
            fecha_vencimiento: { [Op.gte]: fechaInicio }
          },
          transaction
        })
      ]);

      const idsSuperpuestosPrevios = new Set(
        superpuestasPrevias.map((item) => Number(item.id))
      );
      const superposicionNueva = superpuestasPropuestas.find(
        (item) => !idsSuperpuestosPrevios.has(Number(item.id))
      );

      if (superposicionNueva) {
        await transaction.rollback();
        return responderError(
          res,
          409,
          'Las nuevas fechas se superponen con otra membresía operativa del alumno.',
          { membresia_id: Number(superposicionNueva.id) }
        );
      }
    }

    const mensualidad = await PagosMensualidadesModel.findOne({
      where: { membresia_id: membresiaId, alumno_id: alumnoId },
      order: [['id', 'DESC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const cambiaPlanOSede = cambiaPlan || cambiaSede;

    if (mensualidad && cambiaPlanOSede) {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'La membresía ya tiene una mensualidad financiera asociada. Podés ajustar fechas y créditos, pero el cambio de plan o sede debe realizarse desde la operación específica.'
      );
    }

    const clasesUsadasActuales = Math.max(
      Number(membresia.clases_usadas || 0),
      0
    );
    const clasesDisponiblesSolicitadas = Number(
      req.body.clases_disponibles
    );
    const clasesIncluidasNormalizadas =
      clasesUsadasActuales + clasesDisponiblesSolicitadas;

    const precioLista = cambiaPlanOSede
      ? await obtenerPrecioReferenciaMigracion({
          planId: plan.id,
          sedeId: sede.id,
          fechaInicio,
          transaction
        })
      : Number(membresia.precio_lista || 0);
    const valoresAnteriores = {
      plan_id: Number(membresia.plan_id),
      sede_id: Number(membresia.sede_id),
      fecha_inicio: membresia.fecha_inicio,
      fecha_vencimiento: membresia.fecha_vencimiento,
      estado: membresia.estado,
      clases_incluidas: Number(membresia.clases_incluidas || 0),
      clases_usadas: Number(membresia.clases_usadas || 0),
      clases_disponibles: Number(membresia.clases_disponibles || 0),
      origen_alta: membresia.origen_alta,
      observaciones: membresia.observaciones || null
    };
    const payload = obtenerPayloadMembresiaMigracion({
      body: {
        ...req.body,
        clases_incluidas: clasesIncluidasNormalizadas,
        clases_disponibles: clasesDisponiblesSolicitadas
      },
      plan,
      fechaInicio,
      fechaVencimiento,
      precioLista,
      estadoActual: membresia.estado
    });

    // Los créditos consumidos son históricos y nunca se reescriben.
    // Al aumentar disponibles, se incrementan automáticamente los incluidos.
    payload.clases_incluidas = clasesIncluidasNormalizadas;
    payload.clases_usadas = clasesUsadasActuales;
    payload.clases_disponibles = clasesDisponiblesSolicitadas;

    // Ajustar fechas o créditos no debe reescribir descuentos, importes ni el
    // origen histórico de una membresía que ya posee trazabilidad financiera.
    if (!cambiaPlanOSede) {
      payload.precio_lista = Number(membresia.precio_lista || 0).toFixed(2);
      payload.descuento_valor = Number(
        membresia.descuento_valor || 0
      ).toFixed(2);
      payload.descuento_porcentaje = Number(
        membresia.descuento_porcentaje || 0
      ).toFixed(2);
      payload.precio_final = Number(membresia.precio_final || 0).toFixed(2);
      payload.origen_alta = membresia.origen_alta || 'migracion';
    }

    const observacionNueva = construirObservacionesMembresiaMigracion({
      tipo: 'actualizar',
      observacionUsuario: req.body.observaciones
    });

    await membresia.update(
      {
        ...payload,
        observaciones: observacionNueva,
        updated_at: new Date()
      },
      { transaction }
    );

    if (mensualidad) {
      await mensualidad.update(
        {
          sede_id: Number(sede.id),
          periodo_desde: fechaInicio,
          periodo_hasta: fechaVencimiento,
          fecha_vencimiento: fechaVencimiento,
          updated_at: new Date()
        },
        { transaction }
      );
    }

    const hoy = obtenerFechaArgentinaDateOnly();
    const estadoAlumnoResultante = await obtenerEstadoAlumnoPorCoberturaActual({
      alumnoId,
      hoy,
      transaction
    });
    const estadoAlumnoActual = String(alumno.estado || '').toLowerCase();

    await alumno.update(
      {
        sede_id: Number(sede.id),
        ...(!['baja', 'congelado'].includes(estadoAlumnoActual)
          ? { estado: estadoAlumnoResultante }
          : {}),
        updated_at: new Date()
      },
      { transaction }
    );

    await registrarAuditoriaMembresiaMigracion({
      req,
      alumno,
      membresia,
      accion: esCoordinador
        ? 'AJUSTAR_MEMBRESIA_COORD_SEDE'
        : 'ACTUALIZAR_MEMBRESIA_MIGRACION',
      valoresAnteriores,
      valoresNuevos: {
        ...payload,
        observaciones: observacionNueva
      },
      transaction
    });

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Plan, vencimiento y créditos actualizados correctamente.',
      data: {
        membresia_id: membresiaId,
        alumno_id: alumnoId,
        ...payload,
        observaciones: observacionNueva
      }
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('Error en UR_MembresiaMigracionAlumnoPlanesPagos_CTS:', error);
    return responderError(
      res,
      Number(error.status || 500),
      error.status ? error.message : 'Error interno al actualizar la membresía.',
      error.data || null
    );
  }
};

// Benjamin Orellana - 2026/06/15 - Marca una deuda manual operativa para un alumno.
export const CR_MarcarDeudaAlumnoPlanesPagos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { alumno_id } = req.params;

    if (!esIdValido(alumno_id)) {
      await transaction.rollback();
      return responderError(res, 400, 'El parámetro alumno_id no es válido.');
    }

    const {
      membresia_id,
      mensualidad_id,
      monto,
      fecha_vencimiento,
      motivo,
      observaciones
    } = req.body;

    const montoNumerico = Number(monto || 0);

    if (!Number.isFinite(montoNumerico) || montoNumerico <= 0) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El monto de la deuda debe ser mayor a 0.'
      );
    }

    const alumno = await AlumnosModel.findByPk(alumno_id, { transaction });

    if (!alumno) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el alumno solicitado.');
    }

    const hoy = obtenerFechaArgentinaDateOnly();

    let membresiaReferencia = null;

    if (esIdValido(membresia_id)) {
      membresiaReferencia = await AlumnosMembresiasModel.findOne({
        where: {
          id: Number(membresia_id),
          alumno_id: Number(alumno_id)
        },
        transaction
      });
    }

    if (!membresiaReferencia) {
      membresiaReferencia = await AlumnosMembresiasModel.findOne({
        where: {
          alumno_id: Number(alumno_id),
          estado: {
            [Op.in]: ['activa', 'pendiente_pago']
          },
          fecha_inicio: {
            [Op.lte]: hoy
          },
          fecha_vencimiento: {
            [Op.gte]: hoy
          }
        },
        order: [
          ['fecha_inicio', 'DESC'],
          ['id', 'DESC']
        ],
        transaction
      });
    }

    if (!membresiaReferencia) {
      membresiaReferencia = await AlumnosMembresiasModel.findOne({
        where: {
          alumno_id: Number(alumno_id),
          estado: {
            [Op.in]: ['activa', 'pendiente_pago']
          },
          fecha_inicio: {
            [Op.gt]: hoy
          }
        },
        order: [
          ['fecha_inicio', 'ASC'],
          ['id', 'ASC']
        ],
        transaction
      });
    }

    if (!membresiaReferencia) {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'El alumno no tiene una membresía vigente o futura sobre la cual marcar deuda.'
      );
    }

    const fechaVencimientoFinal =
      fecha_vencimiento && String(fecha_vencimiento).trim()
        ? String(fecha_vencimiento).slice(0, 10)
        : hoy;

    const motivoTexto = String(motivo || 'Deuda manual').trim();
    const observacionTexto = String(observaciones || '').trim();

    const observacionFinal = [`[DEUDA MANUAL] ${motivoTexto}`, observacionTexto]
      .filter(Boolean)
      .join(' - ');

    let mensualidad = null;
    let accion = 'creada';

    if (esIdValido(mensualidad_id)) {
      mensualidad = await PagosMensualidadesModel.findOne({
        where: {
          id: Number(mensualidad_id),
          alumno_id: Number(alumno_id)
        },
        transaction
      });

      if (!mensualidad) {
        await transaction.rollback();
        return responderError(
          res,
          404,
          'No se encontró la mensualidad indicada para este alumno.'
        );
      }

      if (mensualidad.estado === 'anulada') {
        await transaction.rollback();
        return responderError(
          res,
          409,
          'No se puede marcar deuda sobre una mensualidad anulada.'
        );
      }

      const montoTotalActual = Number(mensualidad.monto_total || 0);
      const montoPagadoActual = Number(mensualidad.monto_pagado || 0);
      const nuevoMontoTotal = montoTotalActual + montoNumerico;
      const nuevoSaldo = Math.max(nuevoMontoTotal - montoPagadoActual, 0);

      const nuevoEstado =
        nuevoSaldo <= 0
          ? 'pagada'
          : montoPagadoActual > 0
            ? 'parcial'
            : fechaVencimientoFinal < hoy
              ? 'vencida'
              : 'pendiente';

      await mensualidad.update(
        {
          monto_total: nuevoMontoTotal,
          saldo: nuevoSaldo,
          estado: nuevoEstado,
          observaciones: [mensualidad.observaciones, observacionFinal]
            .filter(Boolean)
            .join('\n'),
          updated_at: new Date()
        },
        { transaction }
      );

      accion = 'actualizada';
    } else {
      const periodoDesde = String(membresiaReferencia.fecha_inicio).slice(
        0,
        10
      );
      const periodoHasta = String(membresiaReferencia.fecha_vencimiento).slice(
        0,
        10
      );

      const fechaBasePeriodo = new Date(`${periodoDesde}T00:00:00`);

      const periodoAnio = fechaBasePeriodo.getFullYear();
      const periodoMes = fechaBasePeriodo.getMonth() + 1;

      const estadoInicial =
        fechaVencimientoFinal < hoy ? 'vencida' : 'pendiente';

      mensualidad = await PagosMensualidadesModel.create(
        {
          alumno_id: Number(alumno_id),
          membresia_id: Number(membresiaReferencia.id),
          sede_id: Number(membresiaReferencia.sede_id || alumno.sede_id),
          periodo_anio: periodoAnio,
          periodo_mes: periodoMes,
          periodo_desde: periodoDesde,
          periodo_hasta: periodoHasta,
          fecha_emision: hoy,
          fecha_vencimiento: fechaVencimientoFinal,
          monto_total: montoNumerico,
          monto_pagado: 0,
          saldo: montoNumerico,
          estado: estadoInicial,
          observaciones: observacionFinal
        },
        { transaction }
      );
    }

    const deudaEsVigente =
      String(mensualidad.periodo_desde).slice(0, 10) <= hoy &&
      Number(mensualidad.saldo || 0) > 0;

    if (
      deudaEsVigente &&
      !['baja', 'congelado'].includes(String(alumno.estado).toLowerCase())
    ) {
      await alumno.update(
        {
          estado: 'pendiente_pago',
          updated_at: new Date()
        },
        { transaction }
      );
    }

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      message:
        accion === 'creada'
          ? 'Deuda marcada correctamente.'
          : 'Deuda agregada correctamente a la mensualidad.',
      data: {
        accion,
        mensualidad_id: mensualidad.id,
        alumno_id: Number(alumno_id),
        membresia_id: mensualidad.membresia_id,
        monto_deuda: montoNumerico,
        saldo: Number(mensualidad.saldo || 0),
        estado_mensualidad: mensualidad.estado,
        afecta_estado_actual: deudaEsVigente
      }
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en CR_MarcarDeudaAlumnoPlanesPagos_CTS:', error);

    return responderError(res, 500, 'Error interno al marcar deuda.');
  }
};

// Benjamin Orellana - 2026/06/15 - Aplica bonificación administrativa sobre una mensualidad con deuda.
export const CR_AgregarBonificacionAlumnoPlanesPagos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { alumno_id } = req.params;

    if (!esIdValido(alumno_id)) {
      await transaction.rollback();
      return responderError(res, 400, 'El parámetro alumno_id no es válido.');
    }

    const {
      mensualidad_id,
      tipo = 'monto',
      valor,
      motivo,
      observaciones
    } = req.body;

    if (!esIdValido(mensualidad_id)) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'La mensualidad es obligatoria para aplicar la bonificación.'
      );
    }

    const valorNumerico = Number(valor || 0);

    if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El valor de la bonificación debe ser mayor a 0.'
      );
    }

    if (!['monto', 'porcentaje'].includes(String(tipo).toLowerCase())) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El tipo de bonificación debe ser monto o porcentaje.'
      );
    }

    if (String(tipo).toLowerCase() === 'porcentaje' && valorNumerico > 100) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El porcentaje de bonificación no puede superar el 100%.'
      );
    }

    const alumno = await AlumnosModel.findByPk(alumno_id, { transaction });

    if (!alumno) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el alumno solicitado.');
    }

    const mensualidad = await PagosMensualidadesModel.findOne({
      where: {
        id: Number(mensualidad_id),
        alumno_id: Number(alumno_id)
      },
      transaction
    });

    if (!mensualidad) {
      await transaction.rollback();
      return responderError(
        res,
        404,
        'No se encontró la mensualidad indicada para este alumno.'
      );
    }

    if (
      ['anulada', 'pagada'].includes(String(mensualidad.estado).toLowerCase())
    ) {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'Solo se puede bonificar una mensualidad con deuda pendiente.'
      );
    }

    const saldoActual = Number(mensualidad.saldo || 0);
    const montoTotalActual = Number(mensualidad.monto_total || 0);
    const montoPagadoActual = Number(mensualidad.monto_pagado || 0);

    if (saldoActual <= 0) {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'La mensualidad seleccionada no tiene saldo pendiente.'
      );
    }

    const tipoBonificacion = String(tipo).toLowerCase();

    const montoBonificacion =
      tipoBonificacion === 'porcentaje'
        ? saldoActual * (valorNumerico / 100)
        : valorNumerico;

    const montoBonificacionAplicado = Math.min(
      Number(montoBonificacion.toFixed(2)),
      saldoActual
    );

    const nuevoMontoTotal = Math.max(
      montoTotalActual - montoBonificacionAplicado,
      montoPagadoActual
    );

    const nuevoSaldo = Math.max(nuevoMontoTotal - montoPagadoActual, 0);

    const hoy = obtenerFechaArgentinaDateOnly();

    const nuevoEstado =
      nuevoSaldo <= 0
        ? 'pagada'
        : montoPagadoActual > 0
          ? 'parcial'
          : String(mensualidad.fecha_vencimiento).slice(0, 10) < hoy
            ? 'vencida'
            : 'pendiente';

    const motivoTexto = String(motivo || 'Bonificación administrativa').trim();
    const observacionTexto = String(observaciones || '').trim();

    const observacionFinal = [
      `[BONIFICACIÓN] ${motivoTexto}`,
      `Tipo: ${tipoBonificacion}`,
      `Valor solicitado: ${valorNumerico}`,
      `Monto aplicado: ${montoBonificacionAplicado}`,
      observacionTexto
    ]
      .filter(Boolean)
      .join(' - ');

    await mensualidad.update(
      {
        monto_total: nuevoMontoTotal,
        saldo: nuevoSaldo,
        estado: nuevoEstado,
        observaciones: [mensualidad.observaciones, observacionFinal]
          .filter(Boolean)
          .join('\n'),
        updated_at: new Date()
      },
      { transaction }
    );

    const membresiasAlumnoRows = await AlumnosMembresiasModel.findAll({
      where: {
        alumno_id: Number(alumno_id)
      },
      transaction
    });

    const membresiasPlain = membresiasAlumnoRows.map(toPlain);

    const membresiaMap = new Map(
      membresiasPlain.map((membresia) => [Number(membresia.id), membresia])
    );

    const mensualidadesAlumnoRows = await PagosMensualidadesModel.findAll({
      where: {
        alumno_id: Number(alumno_id)
      },
      transaction
    });

    const mensualidadesPlain = mensualidadesAlumnoRows.map(toPlain);

    const resumenDeuda = calcularResumenDeuda({
      mensualidades: mensualidadesPlain,
      membresiaMap,
      hoy
    });

    const membresiaVigente = await AlumnosMembresiasModel.findOne({
      where: {
        alumno_id: Number(alumno_id),
        estado: 'activa',
        fecha_inicio: {
          [Op.lte]: hoy
        },
        fecha_vencimiento: {
          [Op.gte]: hoy
        }
      },
      order: [
        ['fecha_inicio', 'DESC'],
        ['id', 'DESC']
      ],
      transaction
    });

    if (!['baja', 'congelado'].includes(String(alumno.estado).toLowerCase())) {
      if (Number(resumenDeuda.deuda_vigente || 0) > 0) {
        await alumno.update(
          {
            estado: 'pendiente_pago',
            updated_at: new Date()
          },
          { transaction }
        );
      } else if (membresiaVigente) {
        await alumno.update(
          {
            estado: 'activo',
            sede_id: Number(membresiaVigente.sede_id),
            updated_at: new Date()
          },
          { transaction }
        );
      }
    }

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      message: 'Bonificación aplicada correctamente.',
      data: {
        alumno_id: Number(alumno_id),
        mensualidad_id: mensualidad.id,
        monto_bonificacion: montoBonificacionAplicado,
        monto_total_anterior: montoTotalActual,
        monto_total_nuevo: nuevoMontoTotal,
        saldo_anterior: saldoActual,
        saldo_nuevo: nuevoSaldo,
        estado_mensualidad: nuevoEstado,
        deuda_vigente_actual: Number(resumenDeuda.deuda_vigente || 0)
      }
    });
  } catch (error) {
    await transaction.rollback();

    console.error(
      'Error en CR_AgregarBonificacionAlumnoPlanesPagos_CTS:',
      error
    );

    return responderError(res, 500, 'Error interno al agregar bonificación.');
  }
};

// Benjamin Orellana - 2026/06/15 - Congela membresía vigente del alumno.
export const UR_CongelarMembresiaAlumnoPlanesPagos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { alumno_id } = req.params;

    if (!esIdValido(alumno_id)) {
      await transaction.rollback();
      return responderError(res, 400, 'El parámetro alumno_id no es válido.');
    }

    const { motivo, fecha_desde, fecha_estimada_reactivacion, observaciones } =
      req.body;

    const motivoTexto = String(motivo || '').trim();

    if (!motivoTexto) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El motivo de congelamiento es obligatorio.'
      );
    }

    const alumno = await AlumnosModel.findByPk(alumno_id, { transaction });

    if (!alumno) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el alumno solicitado.');
    }

    if (String(alumno.estado).toLowerCase() === 'baja') {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'No se puede congelar una membresía de un alumno dado de baja.'
      );
    }

    if (String(alumno.estado).toLowerCase() === 'congelado') {
      await transaction.rollback();
      return responderError(res, 409, 'El alumno ya se encuentra congelado.');
    }

    const hoy = obtenerFechaArgentinaDateOnly();
    const fechaDesdeFinal =
      fecha_desde && String(fecha_desde).trim()
        ? String(fecha_desde).slice(0, 10)
        : hoy;

    if (fechaDesdeFinal !== hoy) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El congelamiento debe comenzar en la fecha actual.'
      );
    }

    if (
      fecha_estimada_reactivacion &&
      String(fecha_estimada_reactivacion).slice(0, 10) <= fechaDesdeFinal
    ) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'La reactivación estimada debe ser posterior al inicio del congelamiento.'
      );
    }

    const membresia = await AlumnosMembresiasModel.findOne({
      where: {
        alumno_id: Number(alumno_id),
        estado: {
          [Op.in]: ['activa', 'pendiente_pago']
        },
        fecha_inicio: {
          [Op.lte]: hoy
        },
        fecha_vencimiento: {
          [Op.gte]: hoy
        }
      },
      order: [
        ['fecha_inicio', 'DESC'],
        ['id', 'DESC']
      ],
      transaction
    });

    if (!membresia) {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'El alumno no tiene una membresía vigente para congelar.'
      );
    }

    await bloquearOperacionConReservas({
      alumnoId: alumno_id,
      transaction,
      operacion: 'congelar la membresía'
    });

    const observacionFinal = [
      `[CONGELAMIENTO] ${motivoTexto}`,
      `Desde: ${fechaDesdeFinal}`,
      fecha_estimada_reactivacion
        ? `Reactivación estimada: ${String(fecha_estimada_reactivacion).slice(0, 10)}`
        : null,
      observaciones ? String(observaciones).trim() : null
    ]
      .filter(Boolean)
      .join(' - ');

    await membresia.update(
      {
        estado: 'congelada',
        observaciones: [membresia.observaciones, observacionFinal]
          .filter(Boolean)
          .join('\n'),
        updated_at: new Date()
      },
      { transaction }
    );

    await alumno.update(
      {
        estado: 'congelado',
        updated_at: new Date()
      },
      { transaction }
    );

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Membresía congelada correctamente.',
      data: {
        alumno_id: Number(alumno_id),
        membresia_id: membresia.id,
        estado_alumno: 'congelado',
        estado_membresia: 'congelada',
        fecha_desde: fechaDesdeFinal
      }
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_CongelarMembresiaAlumnoPlanesPagos_CTS:', error);

    return responderError(
      res,
      Number(error.status || 500),
      error.status ? error.message : 'Error interno al congelar membresía.',
      error.data || null
    );
  }
};

// Benjamin Orellana - 2026/06/15 - Reactiva membresía congelada del alumno.
export const UR_ReactivarMembresiaAlumnoPlanesPagos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { alumno_id } = req.params;
    const { observaciones } = req.body;

    if (!esIdValido(alumno_id)) {
      await transaction.rollback();
      return responderError(res, 400, 'El parámetro alumno_id no es válido.');
    }

    const alumno = await AlumnosModel.findByPk(alumno_id, { transaction });

    if (!alumno) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el alumno solicitado.');
    }

    if (String(alumno.estado).toLowerCase() === 'baja') {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'No se puede reactivar una membresía de un alumno dado de baja.'
      );
    }

    const hoy = obtenerFechaArgentinaDateOnly();

    const membresia = await AlumnosMembresiasModel.findOne({
      where: {
        alumno_id: Number(alumno_id),
        estado: 'congelada'
      },
      order: [
        ['fecha_inicio', 'DESC'],
        ['id', 'DESC']
      ],
      transaction
    });

    if (!membresia) {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'El alumno no tiene una membresía congelada para reactivar.'
      );
    }

    const observacionesCongelamiento = String(membresia.observaciones || '');
    const coincidenciasDesde = [
      ...observacionesCongelamiento.matchAll(/Desde:\s*(\d{4}-\d{2}-\d{2})/g)
    ];
    const fechaActualizacionMembresia = membresia.updated_at
      ? new Date(membresia.updated_at).toISOString().slice(0, 10)
      : hoy;
    const fechaCongelamiento =
      coincidenciasDesde.at(-1)?.[1] || fechaActualizacionMembresia;
    const diasCongelados = Math.max(
      diferenciaDiasDateOnly(fechaCongelamiento, hoy) || 0,
      0
    );
    const vencimientoAnterior = String(membresia.fecha_vencimiento).slice(0, 10);
    const vencimientoExtendido = sumarDiasDateOnly(
      vencimientoAnterior,
      diasCongelados
    );

    const membresiasAlumnoRows = await AlumnosMembresiasModel.findAll({
      where: {
        alumno_id: Number(alumno_id)
      },
      transaction
    });

    const membresiasPlain = membresiasAlumnoRows.map(toPlain);

    const membresiaMap = new Map(
      membresiasPlain.map((item) => [Number(item.id), item])
    );

    const mensualidadesAlumnoRows = await PagosMensualidadesModel.findAll({
      where: {
        alumno_id: Number(alumno_id)
      },
      transaction
    });

    const mensualidadesPlain = mensualidadesAlumnoRows.map(toPlain);

    const resumenDeuda = calcularResumenDeuda({
      mensualidades: mensualidadesPlain,
      membresiaMap,
      hoy
    });

    const fechaInicio = String(membresia.fecha_inicio).slice(0, 10);
    const fechaVencimiento = vencimientoExtendido;

    const estaVigente = fechaInicio <= hoy && fechaVencimiento >= hoy;
    const estaVencida = fechaVencimiento < hoy;

    const observacionFinal = [
      '[REACTIVACIÓN] Membresía reactivada desde ficha del alumno',
      `Pausa aplicada: ${diasCongelados} día${diasCongelados === 1 ? '' : 's'}`,
      observaciones ? String(observaciones).trim() : null
    ]
      .filter(Boolean)
      .join(' - ');

    let nuevoEstadoMembresia = 'activa';

    if (estaVencida) {
      nuevoEstadoMembresia = 'vencida';
    }

    await membresia.update(
      {
        estado: nuevoEstadoMembresia,
        fecha_vencimiento: vencimientoExtendido,
        observaciones: [membresia.observaciones, observacionFinal]
          .filter(Boolean)
          .join('\n'),
        updated_at: new Date()
      },
      { transaction }
    );

    if (nuevoEstadoMembresia === 'activa') {
      await imputarReservasPendientesMembresia({ membresia, transaction });
    }

    let periodosFuturosDesplazados = 0;

    if (diasCongelados > 0) {
      const membresiasFuturas = await AlumnosMembresiasModel.findAll({
        where: {
          alumno_id: Number(alumno_id),
          id: { [Op.ne]: Number(membresia.id) },
          estado: { [Op.in]: ['activa', 'pendiente_pago', 'congelada'] },
          fecha_inicio: { [Op.gt]: vencimientoAnterior }
        },
        order: [
          ['fecha_inicio', 'ASC'],
          ['id', 'ASC']
        ],
        transaction
      });

      for (const futura of membresiasFuturas) {
        const nuevaFechaInicio = sumarDiasDateOnly(
          futura.fecha_inicio,
          diasCongelados
        );
        const nuevaFechaFin = sumarDiasDateOnly(
          futura.fecha_vencimiento,
          diasCongelados
        );

        await futura.update(
          {
            fecha_inicio: nuevaFechaInicio,
            fecha_vencimiento: nuevaFechaFin,
            observaciones: [
              futura.observaciones,
              `[REACTIVACIÓN] Período desplazado ${diasCongelados} día${diasCongelados === 1 ? '' : 's'} por congelamiento de membresía #${membresia.id}`
            ]
              .filter(Boolean)
              .join('\n'),
            updated_at: new Date()
          },
          { transaction }
        );

        await PagosMensualidadesModel.update(
          {
            periodo_desde: nuevaFechaInicio,
            periodo_hasta: nuevaFechaFin,
            fecha_vencimiento: nuevaFechaFin,
            updated_at: new Date()
          },
          {
            where: { membresia_id: Number(futura.id) },
            transaction
          }
        );

        periodosFuturosDesplazados += 1;
      }
    }

    // Benjamin Orellana - 2026/06/15 - Recalcula cobertura vigente real luego de reactivar.
    const membresiaVigenteReal = await AlumnosMembresiasModel.findOne({
      where: {
        alumno_id: Number(alumno_id),
        estado: 'activa',
        fecha_inicio: {
          [Op.lte]: hoy
        },
        fecha_vencimiento: {
          [Op.gte]: hoy
        }
      },
      order: [
        ['fecha_inicio', 'DESC'],
        ['id', 'DESC']
      ],
      transaction
    });

    let nuevoEstadoAlumno = 'inactivo';
    let sedeOperativa = alumno.sede_id;

    if (membresiaVigenteReal) {
      sedeOperativa = Number(membresiaVigenteReal.sede_id || alumno.sede_id);

      nuevoEstadoAlumno =
        Number(resumenDeuda.deuda_vigente || 0) > 0
          ? 'pendiente_pago'
          : 'activo';
    }

    await alumno.update(
      {
        estado: nuevoEstadoAlumno,
        sede_id: sedeOperativa,
        updated_at: new Date()
      },
      { transaction }
    );
    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Membresía reactivada correctamente.',
      data: {
        alumno_id: Number(alumno_id),
        membresia_id: membresia.id,
        estado_alumno: nuevoEstadoAlumno,
        estado_membresia: nuevoEstadoMembresia,
        dias_congelados: diasCongelados,
        fecha_vencimiento_anterior: vencimientoAnterior,
        fecha_vencimiento_nueva: vencimientoExtendido,
        periodos_futuros_desplazados: periodosFuturosDesplazados,
        deuda_vigente: Number(resumenDeuda.deuda_vigente || 0),
        cobertura_vigente: Boolean(membresiaVigenteReal)
      }
    });
  } catch (error) {
    await transaction.rollback();

    console.error(
      'Error en UR_ReactivarMembresiaAlumnoPlanesPagos_CTS:',
      error
    );

    return responderError(res, 500, 'Error interno al reactivar membresía.');
  }
};

// Benjamin Orellana - 2026/06/15 - Registra baja operativa del alumno.
export const UR_RegistrarBajaAlumnoPlanesPagos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { alumno_id } = req.params;

    if (!esIdValido(alumno_id)) {
      await transaction.rollback();
      return responderError(res, 400, 'El parámetro alumno_id no es válido.');
    }

    const {
      motivo,
      fecha_baja,
      politica_deuda = 'anular_deuda_futura',
      observaciones
    } = req.body;

    const motivoTexto = String(motivo || '').trim();

    if (!motivoTexto) {
      await transaction.rollback();
      return responderError(res, 400, 'El motivo de baja es obligatorio.');
    }

    const politicasPermitidas = [
      'mantener_deuda',
      'anular_deuda_futura',
      'anular_toda_deuda_pendiente'
    ];

    if (!politicasPermitidas.includes(politica_deuda)) {
      await transaction.rollback();
      return responderError(res, 400, 'La política de deuda no es válida.');
    }

    const alumno = await AlumnosModel.findByPk(alumno_id, { transaction });

    if (!alumno) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el alumno solicitado.');
    }

    if (String(alumno.estado).toLowerCase() === 'baja') {
      await transaction.rollback();
      return responderError(res, 409, 'El alumno ya está dado de baja.');
    }

    // La baja nunca crea deuda. Primero se releva el saldo que ya existía y,
    // cuando es cero, se fuerza una política neutra aunque un cliente antiguo
    // envíe una opción de anulación.
    const mensualidadesPendientes = await PagosMensualidadesModel.findAll({
      where: {
        alumno_id: Number(alumno_id),
        estado: {
          [Op.in]: ['pendiente', 'parcial', 'vencida']
        },
        saldo: {
          [Op.gt]: 0
        }
      },
      transaction
    });
    const deudaPendientePrevia = mensualidadesPendientes.reduce(
      (total, mensualidad) => total + Number(mensualidad.saldo || 0),
      0
    );
    const politicaDeudaAplicada =
      deudaPendientePrevia > 0 ? politica_deuda : 'mantener_deuda';

    const hoy = obtenerFechaArgentinaDateOnly();

    const fechaBajaFinal =
      fecha_baja && String(fecha_baja).trim()
        ? String(fecha_baja).slice(0, 10)
        : hoy;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaBajaFinal) || fechaBajaFinal > hoy) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'La fecha efectiva de baja no es válida ni puede ser futura.'
      );
    }

    const observacionFinal = [
      `[BAJA] ${motivoTexto}`,
      `Fecha efectiva: ${fechaBajaFinal}`,
      deudaPendientePrevia > 0
        ? `Política deuda: ${politicaDeudaAplicada}`
        : 'Sin deuda pendiente al momento de la baja',
      observaciones ? String(observaciones).trim() : null
    ]
      .filter(Boolean)
      .join(' - ');

    await bloquearOperacionConReservas({
      alumnoId: alumno_id,
      transaction,
      operacion: 'registrar la baja'
    });

    const membresiasAfectadas = await AlumnosMembresiasModel.findAll({
      where: {
        alumno_id: Number(alumno_id),
        estado: {
          [Op.in]: ['activa', 'pendiente_pago', 'congelada']
        }
      },
      transaction
    });

    for (const membresia of membresiasAfectadas) {
      await membresia.update(
        {
          estado: 'cancelada',
          clases_disponibles: 0,
          observaciones: [membresia.observaciones, observacionFinal]
            .filter(Boolean)
            .join('\n'),
          updated_at: new Date()
        },
        { transaction }
      );
    }

    let mensualidadesAnuladas = 0;

    if (politicaDeudaAplicada !== 'mantener_deuda') {
      for (const mensualidad of mensualidadesPendientes) {
        const periodoDesde =
          mensualidad.periodo_desde ||
          mensualidad.fecha_emision ||
          mensualidad.fecha_vencimiento;

        const esFutura =
          periodoDesde && String(periodoDesde).slice(0, 10) > hoy;

        const debeAnular =
          politicaDeudaAplicada === 'anular_toda_deuda_pendiente' ||
          (politicaDeudaAplicada === 'anular_deuda_futura' && esFutura);

        if (!debeAnular) continue;

        const saldoAnulado = Number(mensualidad.saldo || 0);
        const montoPagado = Number(mensualidad.monto_pagado || 0);

        await mensualidad.update(
          {
            estado: 'anulada',
            monto_total: montoPagado,
            saldo: 0,
            observaciones: [
              mensualidad.observaciones,
              `[BAJA] Deuda anulada por baja del alumno - Saldo anulado: ${saldoAnulado}`
            ]
              .filter(Boolean)
              .join('\n'),
            updated_at: new Date()
          },
          { transaction }
        );

        mensualidadesAnuladas += 1;
      }
    }

    const metodosRecurrentesAfectados =
      await PagosMetodosRecurrentesModel.findAll({
        where: {
          alumno_id: Number(alumno_id),
          estado: 'activo'
        },
        transaction
      });

    for (const metodo of metodosRecurrentesAfectados) {
      await metodo.update(
        {
          estado: 'inactivo',
          fecha_baja: new Date(),
          motivo_baja: `Baja del alumno: ${motivoTexto}`,
          updated_at: new Date()
        },
        { transaction }
      );
    }

    await alumno.update(
      {
        estado: 'baja',
        updated_at: new Date()
      },
      { transaction }
    );

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Baja registrada correctamente.',
      data: {
        alumno_id: Number(alumno_id),
        estado_alumno: 'baja',
        fecha_baja: fechaBajaFinal,
        membresias_canceladas: membresiasAfectadas.length,
        mensualidades_anuladas: mensualidadesAnuladas,
        metodos_recurrentes_inactivados: metodosRecurrentesAfectados.length,
        deuda_pendiente_previa: deudaPendientePrevia,
        deuda_generada: 0,
        politica_deuda: politicaDeudaAplicada,
        politica_deuda_solicitada: politica_deuda
      }
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_RegistrarBajaAlumnoPlanesPagos_CTS:', error);

    return responderError(
      res,
      Number(error.status || 500),
      error.status ? error.message : 'Error interno al registrar baja.',
      error.data || null
    );
  }
};

// Benjamin Orellana - 2026/06/15 - Reingresa un alumno dado de baja creando una nueva membresía.
export const CR_ReingresarAlumnoPlanesPagos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { alumno_id } = req.params;

    if (!esIdValido(alumno_id)) {
      await transaction.rollback();
      return responderError(res, 400, 'El parámetro alumno_id no es válido.');
    }

    const {
      plan_id,
      sede_id,
      fecha_inicio,
      monto,
      fecha_vencimiento,
      activar_debito = false,
      observaciones
    } = req.body;

    if (!esIdValido(plan_id)) {
      await transaction.rollback();
      return responderError(res, 400, 'El plan es obligatorio.');
    }

    if (!esIdValido(sede_id)) {
      await transaction.rollback();
      return responderError(res, 400, 'La sede es obligatoria.');
    }

    const montoNumerico = Number(monto || 0);

    if (!Number.isFinite(montoNumerico) || montoNumerico <= 0) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El monto de la nueva membresía debe ser mayor a 0.'
      );
    }

    const alumno = await AlumnosModel.findByPk(alumno_id, { transaction });

    if (!alumno) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el alumno solicitado.');
    }

    if (String(alumno.estado).toLowerCase() !== 'baja') {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'Solo se puede reingresar un alumno que esté dado de baja.'
      );
    }

    const plan = await PlanesModel.findByPk(plan_id, { transaction });

    if (!plan) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el plan indicado.');
    }

    const sede = await SedesModel.findByPk(sede_id, { transaction });

    if (!sede) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró la sede indicada.');
    }

    const hoy = obtenerFechaArgentinaDateOnly();

    const fechaInicioFinal =
      fecha_inicio && String(fecha_inicio).trim()
        ? String(fecha_inicio).slice(0, 10)
        : hoy;

    const duracionDias = Number(plan.duracion_dias || 30);

    const fechaVencimientoFinal =
      fecha_vencimiento && String(fecha_vencimiento).trim()
        ? String(fecha_vencimiento).slice(0, 10)
        : sumarDiasDateOnly(fechaInicioFinal, Math.max(duracionDias - 1, 0));

    const clasesIncluidas = Number(
      plan.cantidad_clases_periodo || plan.clases_por_mes || 0
    );

    const observacionReingreso = [
      '[REINGRESO] Alta nuevamente desde ficha del alumno',
      `Plan: ${plan.nombre || plan.id}`,
      `Sede: ${sede.nombre || sede.id}`,
      observaciones ? String(observaciones).trim() : null
    ]
      .filter(Boolean)
      .join(' - ');

    const nuevaMembresia = await AlumnosMembresiasModel.create(
      {
        alumno_id: Number(alumno_id),
        plan_id: Number(plan_id),
        sede_id: Number(sede_id),
        fecha_inicio: fechaInicioFinal,
        fecha_vencimiento: fechaVencimientoFinal,
        estado: 'pendiente_pago',
        precio_lista: montoNumerico,
        precio_final: montoNumerico,
        descuento_valor: 0,
        descuento_porcentaje: 0,
        clases_incluidas: clasesIncluidas,
        clases_usadas: 0,
        clases_disponibles: clasesIncluidas,
        agenda_restricciones: await copiarRestriccionesPlan({ planId: plan.id, transaction }),
        observaciones: observacionReingreso
      },
      { transaction }
    );

    const fechaBasePeriodo = new Date(`${fechaInicioFinal}T00:00:00`);

    const nuevaMensualidad = await PagosMensualidadesModel.create(
      {
        alumno_id: Number(alumno_id),
        membresia_id: Number(nuevaMembresia.id),
        sede_id: Number(sede_id),
        periodo_anio: fechaBasePeriodo.getFullYear(),
        periodo_mes: fechaBasePeriodo.getMonth() + 1,
        periodo_desde: fechaInicioFinal,
        periodo_hasta: fechaVencimientoFinal,
        fecha_emision: hoy,
        fecha_vencimiento: fechaVencimientoFinal,
        monto_total: montoNumerico,
        monto_pagado: 0,
        saldo: montoNumerico,
        estado: 'pendiente',
        observaciones: '[REINGRESO] Mensualidad generada por alta nuevamente.'
      },
      { transaction }
    );

    let metodoRecurrenteReactivado = null;

    if (activar_debito) {
      metodoRecurrenteReactivado = await PagosMetodosRecurrentesModel.findOne({
        where: {
          alumno_id: Number(alumno_id),
          estado: {
            [Op.in]: ['inactivo', 'vencido', 'error']
          }
        },
        order: [['id', 'DESC']],
        transaction
      });

      if (metodoRecurrenteReactivado) {
        await metodoRecurrenteReactivado.update(
          {
            estado: 'activo',
            fecha_baja: null,
            motivo_baja: null,
            updated_at: new Date()
          },
          { transaction }
        );
      }
    }

    await alumno.update(
      {
        estado: 'pendiente_pago',
        sede_id: Number(sede_id),
        updated_at: new Date()
      },
      { transaction }
    );

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      message: 'Alumno reingresado correctamente.',
      data: {
        alumno_id: Number(alumno_id),
        estado_alumno: 'pendiente_pago',
        membresia_id: nuevaMembresia.id,
        mensualidad_id: nuevaMensualidad.id,
        estado_membresia: 'pendiente_pago',
        estado_mensualidad: 'pendiente',
        monto: montoNumerico,
        fecha_inicio: fechaInicioFinal,
        fecha_vencimiento: fechaVencimientoFinal,
        metodo_recurrente_reactivado: Boolean(metodoRecurrenteReactivado)
      }
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en CR_ReingresarAlumnoPlanesPagos_CTS:', error);

    return responderError(res, 500, 'Error interno al reingresar alumno.');
  }
};

// Benjamin Orellana - 2026/06/15 - Cambia sede operativa del alumno sin alterar pagos históricos.
export const UR_CambiarSedeAlumnoPlanesPagos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { alumno_id } = req.params;

    if (!esIdValido(alumno_id)) {
      await transaction.rollback();
      return responderError(res, 400, 'El parámetro alumno_id no es válido.');
    }

    const { sede_id, alcance = 'actual_pendientes', observaciones } = req.body;

    if (!esIdValido(sede_id)) {
      await transaction.rollback();
      return responderError(res, 400, 'La nueva sede es obligatoria.');
    }

    const alcancesPermitidos = [
      'solo_actual',
      'actual_pendientes',
      'actual_y_futuras'
    ];

    if (!alcancesPermitidos.includes(alcance)) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El alcance del cambio de sede no es válido.'
      );
    }

    const alumno = await AlumnosModel.findByPk(alumno_id, { transaction });

    if (!alumno) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el alumno solicitado.');
    }

    if (String(alumno.estado).toLowerCase() === 'baja') {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'No se puede cambiar sede de un alumno dado de baja. Primero debe reingresar.'
      );
    }

    const nuevaSede = await SedesModel.findByPk(sede_id, { transaction });

    if (!nuevaSede) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró la sede indicada.');
    }

    if (
      nuevaSede.activo !== undefined &&
      Number(nuevaSede.activo) !== 1 &&
      nuevaSede.activo !== true
    ) {
      await transaction.rollback();
      return responderError(res, 409, 'La sede indicada no está activa.');
    }

    const hoy = obtenerFechaArgentinaDateOnly();

    const membresiaActual = await AlumnosMembresiasModel.findOne({
      where: {
        alumno_id: Number(alumno_id),
        estado: {
          [Op.in]: ['activa', 'pendiente_pago', 'congelada']
        },
        fecha_inicio: {
          [Op.lte]: hoy
        },
        fecha_vencimiento: {
          [Op.gte]: hoy
        }
      },
      order: [
        ['fecha_inicio', 'DESC'],
        ['id', 'DESC']
      ],
      transaction
    });

    if (!membresiaActual) {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'El alumno no tiene una membresía operativa vigente para cambiar de sede.'
      );
    }

    await bloquearOperacionConReservas({
      alumnoId: alumno_id,
      transaction,
      operacion: 'cambiar la sede'
    });

    const sedeAnteriorId = Number(
      alumno.sede_id || membresiaActual.sede_id || 0
    );
    const nuevaSedeId = Number(sede_id);

    if (
      sedeAnteriorId === nuevaSedeId &&
      Number(membresiaActual.sede_id) === nuevaSedeId
    ) {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'El alumno ya pertenece a la sede seleccionada.'
      );
    }

    const observacionFinal = [
      `[CAMBIO SEDE] Nueva sede: ${nuevaSede.nombre || nuevaSede.id}`,
      `Sede anterior ID: ${sedeAnteriorId || 'sin sede'}`,
      `Alcance: ${alcance}`,
      observaciones ? String(observaciones).trim() : null
    ]
      .filter(Boolean)
      .join(' - ');

    let membresiasAfectadas = [];

    if (alcance === 'actual_y_futuras') {
      membresiasAfectadas = await AlumnosMembresiasModel.findAll({
        where: {
          alumno_id: Number(alumno_id),
          estado: {
            [Op.in]: ['activa', 'pendiente_pago', 'congelada']
          },
          fecha_vencimiento: {
            [Op.gte]: hoy
          }
        },
        order: [
          ['fecha_inicio', 'ASC'],
          ['id', 'ASC']
        ],
        transaction
      });
    } else {
      membresiasAfectadas = [membresiaActual];
    }

    for (const membresia of membresiasAfectadas) {
      await membresia.update(
        {
          sede_id: nuevaSedeId,
          observaciones: [membresia.observaciones, observacionFinal]
            .filter(Boolean)
            .join('\n'),
          updated_at: new Date()
        },
        { transaction }
      );
    }

    let mensualidadesActualizadas = 0;

    if (alcance !== 'solo_actual') {
      const membresiaIds = membresiasAfectadas.map((item) => Number(item.id));

      const mensualidadesPendientes = await PagosMensualidadesModel.findAll({
        where: {
          alumno_id: Number(alumno_id),
          membresia_id: {
            [Op.in]: membresiaIds
          },
          estado: {
            [Op.in]: ['pendiente', 'parcial', 'vencida']
          },
          saldo: {
            [Op.gt]: 0
          }
        },
        transaction
      });

      for (const mensualidad of mensualidadesPendientes) {
        await mensualidad.update(
          {
            sede_id: nuevaSedeId,
            observaciones: [
              mensualidad.observaciones,
              `[CAMBIO SEDE] Mensualidad pendiente movida a ${nuevaSede.nombre || nuevaSede.id}`
            ]
              .filter(Boolean)
              .join('\n'),
            updated_at: new Date()
          },
          { transaction }
        );

        mensualidadesActualizadas += 1;
      }
    }

    await alumno.update(
      {
        sede_id: nuevaSedeId,
        updated_at: new Date()
      },
      { transaction }
    );

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Sede del alumno actualizada correctamente.',
      data: {
        alumno_id: Number(alumno_id),
        sede_anterior_id: sedeAnteriorId,
        sede_nueva_id: nuevaSedeId,
        alcance,
        membresias_actualizadas: membresiasAfectadas.length,
        mensualidades_actualizadas: mensualidadesActualizadas
      }
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_CambiarSedeAlumnoPlanesPagos_CTS:', error);

    return responderError(
      res,
      Number(error.status || 500),
      error.status
        ? error.message
        : 'Error interno al cambiar sede del alumno.',
      error.data || null
    );
  }
};

// Benjamin Orellana - 2026/06/15 - Cambia el plan operativo actual del alumno sin alterar historial financiero.
export const UR_CambiarPlanAlumnoPlanesPagos_CTS = async (req, res) => {
  const transaction = await db.transaction();

  try {
    const { alumno_id } = req.params;

    if (!esIdValido(alumno_id)) {
      await transaction.rollback();
      return responderError(res, 400, 'El parámetro alumno_id no es válido.');
    }

    const { plan_id, monto, observaciones } = req.body;

    if (!esIdValido(plan_id)) {
      await transaction.rollback();
      return responderError(res, 400, 'El nuevo plan es obligatorio.');
    }

    const montoNumerico = Number(monto || 0);

    if (!Number.isFinite(montoNumerico) || montoNumerico <= 0) {
      await transaction.rollback();
      return responderError(
        res,
        400,
        'El monto del nuevo plan debe ser mayor a 0.'
      );
    }

    const alumno = await AlumnosModel.findByPk(alumno_id, { transaction });

    if (!alumno) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el alumno solicitado.');
    }

    if (String(alumno.estado).toLowerCase() === 'baja') {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'No se puede cambiar el plan de un alumno dado de baja. Primero debe reingresar.'
      );
    }

    const nuevoPlan = await PlanesModel.findByPk(plan_id, { transaction });

    if (!nuevoPlan) {
      await transaction.rollback();
      return responderError(res, 404, 'No se encontró el plan indicado.');
    }

    if (
      nuevoPlan.activo !== undefined &&
      Number(nuevoPlan.activo) !== 1 &&
      nuevoPlan.activo !== true
    ) {
      await transaction.rollback();
      return responderError(res, 409, 'El plan indicado no está activo.');
    }

    const hoy = obtenerFechaArgentinaDateOnly();

    const membresiaActual = await AlumnosMembresiasModel.findOne({
      where: {
        alumno_id: Number(alumno_id),
        estado: {
          [Op.in]: ['activa', 'pendiente_pago', 'congelada']
        },
        fecha_inicio: {
          [Op.lte]: hoy
        },
        fecha_vencimiento: {
          [Op.gte]: hoy
        }
      },
      order: [
        ['fecha_inicio', 'DESC'],
        ['id', 'DESC']
      ],
      transaction
    });

    if (!membresiaActual) {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'El alumno no tiene una membresía operativa vigente para cambiar de plan.'
      );
    }

    await bloquearOperacionConReservas({
      alumnoId: alumno_id,
      transaction,
      operacion: 'cambiar el plan'
    });

    if (Number(membresiaActual.plan_id) === Number(plan_id)) {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'El alumno ya tiene asignado el plan seleccionado.'
      );
    }

    const mensualidadActual = await PagosMensualidadesModel.findOne({
      where: {
        alumno_id: Number(alumno_id),
        membresia_id: Number(membresiaActual.id),
        estado: {
          [Op.in]: ['pendiente', 'parcial', 'vencida']
        }
      },
      order: [['id', 'DESC']],
      transaction
    });

    if (!mensualidadActual) {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'No se encontró una mensualidad pendiente asociada a la membresía actual. Para una membresía ya pagada, usá cambio desde próxima renovación.'
      );
    }

    const montoPagadoActual = Number(mensualidadActual.monto_pagado || 0);

    if (montoPagadoActual > 0) {
      await transaction.rollback();
      return responderError(
        res,
        409,
        'La mensualidad actual ya tiene pagos imputados. Para evitar inconsistencias, usá cambio desde próxima renovación.'
      );
    }

    const clasesActualesUsadas = Number(membresiaActual.clases_usadas || 0);

    const clasesNuevoPlan = Number(
      nuevoPlan.cantidad_clases_periodo ||
        nuevoPlan.clases_por_mes ||
        membresiaActual.clases_incluidas ||
        0
    );

    const clasesDisponibles = Math.max(
      clasesNuevoPlan - clasesActualesUsadas,
      0
    );

    const saldoNuevo = Math.max(montoNumerico - montoPagadoActual, 0);

    const estadoMensualidad =
      saldoNuevo <= 0
        ? 'pagada'
        : String(mensualidadActual.fecha_vencimiento).slice(0, 10) < hoy
          ? 'vencida'
          : 'pendiente';

    const observacionFinal = [
      `[CAMBIO PLAN] Nuevo plan: ${nuevoPlan.nombre || nuevoPlan.id}`,
      `Plan anterior ID: ${membresiaActual.plan_id}`,
      `Monto anterior: ${Number(membresiaActual.precio_final || 0)}`,
      `Monto nuevo: ${montoNumerico}`,
      observaciones ? String(observaciones).trim() : null
    ]
      .filter(Boolean)
      .join(' - ');

    await membresiaActual.update(
      {
        plan_id: Number(plan_id),
        precio_lista: montoNumerico,
        precio_final: montoNumerico,
        descuento_valor: 0,
        descuento_porcentaje: 0,
        clases_incluidas: clasesNuevoPlan,
        clases_disponibles: clasesDisponibles,
        observaciones: [membresiaActual.observaciones, observacionFinal]
          .filter(Boolean)
          .join('\n'),
        updated_at: new Date()
      },
      { transaction }
    );

    await mensualidadActual.update(
      {
        monto_total: montoNumerico,
        saldo: saldoNuevo,
        estado: estadoMensualidad,
        observaciones: [
          mensualidadActual.observaciones,
          `[CAMBIO PLAN] Mensualidad ajustada al nuevo plan: ${
            nuevoPlan.nombre || nuevoPlan.id
          } - Monto nuevo: ${montoNumerico}`
        ]
          .filter(Boolean)
          .join('\n'),
        updated_at: new Date()
      },
      { transaction }
    );

    const nuevoEstadoAlumno =
      saldoNuevo > 0
        ? 'pendiente_pago'
        : String(alumno.estado).toLowerCase() === 'congelado'
          ? 'congelado'
          : 'activo';

    if (!['baja', 'congelado'].includes(String(alumno.estado).toLowerCase())) {
      await alumno.update(
        {
          estado: nuevoEstadoAlumno,
          updated_at: new Date()
        },
        { transaction }
      );
    }

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Plan del alumno actualizado correctamente.',
      data: {
        alumno_id: Number(alumno_id),
        membresia_id: membresiaActual.id,
        mensualidad_id: mensualidadActual.id,
        plan_anterior_id: Number(membresiaActual.plan_id),
        plan_nuevo_id: Number(plan_id),
        monto_nuevo: montoNumerico,
        saldo_nuevo: saldoNuevo,
        clases_incluidas: clasesNuevoPlan,
        clases_disponibles: clasesDisponibles,
        estado_mensualidad: estadoMensualidad,
        estado_alumno: nuevoEstadoAlumno
      }
    });
  } catch (error) {
    await transaction.rollback();

    console.error('Error en UR_CambiarPlanAlumnoPlanesPagos_CTS:', error);

    return responderError(
      res,
      Number(error.status || 500),
      error.status
        ? error.message
        : 'Error interno al cambiar plan del alumno.',
      error.data || null
    );
  }
};
