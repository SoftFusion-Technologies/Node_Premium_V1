/*
 * Sergio Manrique - 2026/08/01
 * Benjamin Orellana - 2026/08/11
 * Seguimiento comercial de alumnos: inactivos, vencidos y clientes perdidos.
 *
 * La bandeja es una cola operativa. Un alumno permanece mientras la etapa
 * actual no tenga un contacto resuelto; el historial nunca se elimina y se
 * utiliza para estadísticas. Las etapas no se solapan: 5-14 / 15+ días y
 * 1-<3 / 3+ meses.
 */

import { Op, QueryTypes } from 'sequelize';

import db from '../../DataBase/db.js';
import AlumnosModel from '../../Models/Alumno/MD_TB_Alumnos.js';
import AlumnosMembresiasModel from '../../Models/Alumno/MD_TB_AlumnosMembresias.js';
import AlumnosAnamnesisModel from '../../Models/Alumno/MD_TB_AlumnosAnamnesis.js';
import AlumnosContactosEmergenciaModel from '../../Models/Alumno/MD_TB_AlumnosContactosEmergencia.js';
import AlumnosRecaptacionesContactosModel from '../../Models/Alumno/MD_TB_AlumnosRecaptacionesContactos.js';
import UsuariosModel from '../../Models/Usuario/MD_TB_Usuarios.js';
import {
  aplicarScopeSedesAlumnos,
  calcularEtiquetaSeguimiento,
  construirAlumnoRespuesta,
  construirFiltroClientePerdido,
  construirFiltroSinRelacionAlumno,
  construirWhereBusquedaAlumno,
  normalizarTinyint,
  obtenerDiasSeguimientoPorAlumnos,
  ESTADOS_ALUMNO_VALIDOS,
  ROLES_LECTURA_ALUMNOS,
  ROLES_OPERATIVOS_ALUMNOS,
  validarRolLecturaAlumnos
} from './CTS_TB_Alumnos.js';

const MOTIVOS_SEGUIMIENTO_VALIDOS = [
  'inactividad_5',
  'inactividad_15',
  'cuota_1',
  'cuota_3',
  'cliente_perdido',
  'pendiente_validacion'
];

const MOTIVOS_ESTADISTICAS = ['inactividad_5', 'inactividad_15', 'cuota_1', 'cuota_3'];
const MEDIOS_CONTACTO_VALIDOS = ['whatsapp', 'llamada', 'email', 'presencial', 'otro'];
const MOTIVOS_CLIENTE_VALIDOS = ['personal', 'no_contesta', 'servicio', 'precio', 'otro'];
const RESULTADOS_GESTION_VALIDOS = ['positivo', 'negativo', 'pendiente', 'perdido'];
const RESULTADOS_FILTRO_VALIDOS = ['gestionados', 'positivo', 'negativo', 'perdido'];

const normalizarTexto = (value) => {
  if (value === undefined || value === null) return null;
  const texto = String(value).trim();
  return texto.length > 0 ? texto : null;
};

const queryGenerator = db.getQueryInterface().queryGenerator;
const ALIAS_ALUMNO = queryGenerator.quoteIdentifier(AlumnosModel.name);
const COLUMNA_ALUMNO_ID = queryGenerator.quoteIdentifier('id');

const expresionUltimaAsistencia = (aliasAlumno = ALIAS_ALUMNO) => `
  COALESCE(
    (
      SELECT MAX(aa.fecha)
      FROM alumnos_asistencias aa
      WHERE aa.alumno_id = ${aliasAlumno}.${COLUMNA_ALUMNO_ID}
        AND aa.estado = 'asistio'
    ),
    ${aliasAlumno}.fecha_inicio
  )
`;

const expresionCuotaVencidaMasAntigua = (aliasAlumno = ALIAS_ALUMNO) => `
  (
    SELECT MIN(pm.fecha_vencimiento)
    FROM pagos_mensualidades pm
    WHERE pm.alumno_id = ${aliasAlumno}.${COLUMNA_ALUMNO_ID}
      AND pm.saldo > 0
      AND pm.estado <> 'anulada'
      AND pm.estado IN ('vencida', 'pendiente', 'parcial')
      AND pm.fecha_vencimiento < CURDATE()
  )
`;

const construirFiltroInactividadRango = (diasDesde, diasHasta = null) => {
  const referencia = expresionUltimaAsistencia();
  const condiciones = [`DATEDIFF(CURDATE(), ${referencia}) >= ${Number(diasDesde)}`];

  if (diasHasta !== null) {
    condiciones.push(`DATEDIFF(CURDATE(), ${referencia}) < ${Number(diasHasta)}`);
  }

  return db.literal(condiciones.join(' AND '));
};

const construirFiltroCuotaRango = (mesesDesde, mesesHasta = null) => {
  const referencia = expresionCuotaVencidaMasAntigua();
  const condiciones = [
    `${referencia} IS NOT NULL`,
    `${referencia} <= DATE_SUB(CURDATE(), INTERVAL ${Number(mesesDesde)} MONTH)`
  ];

  if (mesesHasta !== null) {
    condiciones.push(
      `${referencia} > DATE_SUB(CURDATE(), INTERVAL ${Number(mesesHasta)} MONTH)`
    );
  }

  return db.literal(condiciones.join(' AND '));
};

const construirFiltroEtapaPendiente = (motivo, fechaDisparoSql) =>
  db.literal(`
    COALESCE((
      SELECT rc.resultado_gestion
      FROM alumnos_recaptaciones_contactos rc
      WHERE rc.alumno_id = ${ALIAS_ALUMNO}.${COLUMNA_ALUMNO_ID}
        AND rc.motivo_seguimiento = '${motivo}'
        AND rc.fecha_contacto >= ${fechaDisparoSql}
      ORDER BY rc.fecha_contacto DESC, rc.id DESC
      LIMIT 1
    ), 'pendiente') = 'pendiente'
  `);

const construirFiltroNoClientePerdido = () =>
  db.literal(`
    COALESCE((
      SELECT rc_perdido.resultado_gestion
      FROM alumnos_recaptaciones_contactos rc_perdido
      WHERE rc_perdido.alumno_id = ${ALIAS_ALUMNO}.${COLUMNA_ALUMNO_ID}
        AND rc_perdido.resultado_gestion <> 'pendiente'
      ORDER BY rc_perdido.fecha_contacto DESC, rc_perdido.id DESC
      LIMIT 1
    ), '') <> 'perdido'
  `);

const resultadosSqlPorFiltro = (resultadoFiltro) =>
  resultadoFiltro === 'gestionados'
    ? ['positivo', 'negativo', 'perdido']
    : [resultadoFiltro];

/*
 * Filtro histórico opcional. Se usa únicamente cuando el usuario pulsa una
 * métrica (Gestionados/Positivos/Negativos/Perdidos). La ausencia del filtro
 * conserva exactamente la bandeja operativa de pendientes.
 */
const construirFiltroResultadoHistorico = (motivo, resultadoFiltro) => {
  const resultados = resultadosSqlPorFiltro(resultadoFiltro)
    .map((resultado) => `'${resultado}'`)
    .join(', ');

  return db.literal(`
    EXISTS (
      SELECT 1
      FROM alumnos_recaptaciones_contactos rc_hist
      WHERE rc_hist.alumno_id = ${ALIAS_ALUMNO}.${COLUMNA_ALUMNO_ID}
        AND rc_hist.motivo_seguimiento = '${motivo}'
        AND rc_hist.resultado_gestion IN (${resultados})
    )
  `);
};

const construirFiltroMotivoSeguimiento = (motivo) => {
  const ultimaAsistencia = expresionUltimaAsistencia();
  const cuotaMasAntigua = expresionCuotaVencidaMasAntigua();

  switch (motivo) {
    case 'inactividad_5':
      return {
        [Op.and]: [
          construirFiltroInactividadRango(5, 15),
          construirFiltroNoClientePerdido(),
          construirFiltroEtapaPendiente(
            'inactividad_5',
            `DATE_ADD(${ultimaAsistencia}, INTERVAL 5 DAY)`
          )
        ]
      };
    case 'inactividad_15':
      return {
        [Op.and]: [
          construirFiltroInactividadRango(15),
          construirFiltroNoClientePerdido(),
          construirFiltroEtapaPendiente(
            'inactividad_15',
            `DATE_ADD(${ultimaAsistencia}, INTERVAL 15 DAY)`
          )
        ]
      };
    case 'cuota_1':
      return {
        [Op.and]: [
          construirFiltroCuotaRango(1, 3),
          construirFiltroNoClientePerdido(),
          construirFiltroEtapaPendiente(
            'cuota_1',
            `DATE_ADD(${cuotaMasAntigua}, INTERVAL 1 MONTH)`
          )
        ]
      };
    case 'cuota_3':
      return {
        [Op.and]: [
          construirFiltroCuotaRango(3),
          construirFiltroNoClientePerdido(),
          construirFiltroEtapaPendiente(
            'cuota_3',
            `DATE_ADD(${cuotaMasAntigua}, INTERVAL 3 MONTH)`
          )
        ]
      };
    case 'cliente_perdido':
      return construirFiltroClientePerdido();
    case 'pendiente_validacion':
      return { estado: 'pendiente_validacion' };
    default:
      return {
        [Op.or]: [
          construirFiltroMotivoSeguimiento('inactividad_5'),
          construirFiltroMotivoSeguimiento('inactividad_15'),
          construirFiltroMotivoSeguimiento('cuota_1'),
          construirFiltroMotivoSeguimiento('cuota_3'),
          construirFiltroClientePerdido(),
          { estado: 'pendiente_validacion' }
        ]
      };
  }
};

const obtenerConfiguracionContactoActual = (motivo, resultadoFiltro = null) => {
  if (!motivo) {
    return { filtroMotivo: '', filtroCiclo: '', filtroResultado: '', replacements: {} };
  }

  if (motivo === 'cliente_perdido') {
    return { filtroMotivo: '', filtroCiclo: '', filtroResultado: '', replacements: {} };
  }

  const filtroMotivo = 'AND c.motivo_seguimiento = :motivoContacto';
  const replacements = { motivoContacto: motivo };

  if (resultadoFiltro) {
    const resultados = resultadosSqlPorFiltro(resultadoFiltro)
      .map((resultado) => `'${resultado}'`)
      .join(', ');

    return {
      filtroMotivo,
      filtroCiclo: '',
      filtroResultado: `AND c.resultado_gestion IN (${resultados})`,
      replacements
    };
  }

  let disparo = null;

  if (motivo === 'inactividad_5' || motivo === 'inactividad_15') {
    const dias = motivo === 'inactividad_5' ? 5 : 15;
    disparo = `DATE_ADD(${expresionUltimaAsistencia('a')}, INTERVAL ${dias} DAY)`;
  } else if (motivo === 'cuota_1' || motivo === 'cuota_3') {
    const meses = motivo === 'cuota_1' ? 1 : 3;
    disparo = `DATE_ADD(${expresionCuotaVencidaMasAntigua('a')}, INTERVAL ${meses} MONTH)`;
  }

  return {
    filtroMotivo,
    filtroCiclo: disparo ? `AND c.fecha_contacto >= ${disparo}` : '',
    filtroResultado: '',
    replacements
  };
};

/*
 * Devuelve el último contacto de la etapa actual. Los contactos de ciclos
 * anteriores no se muestran como si fueran el estado de la cola presente.
 */
const obtenerResumenComercialPorAlumnos = async (alumnoIds, motivo = null, resultadoFiltro = null) => {
  if (!alumnoIds.length) {
    return { asistencias: new Map(), cuotasVencidas: new Map(), contactos: new Map() };
  }

  const config = obtenerConfiguracionContactoActual(motivo, resultadoFiltro);

  const [{ asistencias, cuotasVencidas }, filasContactos] = await Promise.all([
    obtenerDiasSeguimientoPorAlumnos(alumnoIds),
    db.query(
      `
      SELECT c.alumno_id, c.fecha_contacto, c.medio_contacto, c.motivo_seguimiento,
        c.motivo_cliente, c.respuesta_cliente, c.resultado_gestion, u.nombre AS usuario_nombre
      FROM alumnos_recaptaciones_contactos c
      INNER JOIN alumnos_alumnos a ON a.id = c.alumno_id
      LEFT JOIN usuarios_usuarios u ON u.id = c.usuario_id
      WHERE c.alumno_id IN (:alumnoIds)
        ${config.filtroMotivo}
        ${config.filtroCiclo}
        ${config.filtroResultado}
        AND c.id = (
          SELECT c2.id
          FROM alumnos_recaptaciones_contactos c2
          WHERE c2.alumno_id = c.alumno_id
            ${config.filtroMotivo.replaceAll('c.', 'c2.')}
            ${config.filtroCiclo.replaceAll('c.', 'c2.')}
            ${config.filtroResultado.replaceAll('c.', 'c2.')}
          ORDER BY c2.fecha_contacto DESC, c2.id DESC
          LIMIT 1
        )
      `,
      {
        replacements: { alumnoIds, ...config.replacements },
        type: QueryTypes.SELECT
      }
    )
  ]);

  const contactos = new Map(
    filasContactos.map((fila) => [
      Number(fila.alumno_id),
      {
        fecha_contacto: fila.fecha_contacto,
        medio_contacto: fila.medio_contacto,
        motivo_seguimiento: fila.motivo_seguimiento,
        motivo_cliente: fila.motivo_cliente,
        respuesta_cliente: fila.respuesta_cliente,
        resultado_gestion: fila.resultado_gestion,
        usuario_nombre: fila.usuario_nombre
      }
    ])
  );

  return { asistencias, cuotasVencidas, contactos };
};

const ETIQUETAS_MOTIVO_HISTORICO = {
  inactividad_5: '5 días de inactividad',
  inactividad_15: '15 días de inactividad',
  cuota_1: '1 mes vencido',
  cuota_3: '3 meses vencidos'
};

export const OBR_AlumnosRecaptaciones_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaAlumnos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar seguimiento comercial.'
      });
    }

    const {
      q,
      sede_id,
      motivo,
      resultado_gestion,
      estado,
      sin_plan,
      sin_anamnesis,
      sin_contacto_emergencia,
      sin_asistencias,
      page = 1,
      limit = 20
    } = req.query;

    if (motivo && !MOTIVOS_SEGUIMIENTO_VALIDOS.includes(motivo)) {
      return res.status(400).json({
        ok: false,
        message: 'Motivo de seguimiento inválido.',
        valores_validos: MOTIVOS_SEGUIMIENTO_VALIDOS
      });
    }

    if (resultado_gestion && !RESULTADOS_FILTRO_VALIDOS.includes(resultado_gestion)) {
      return res.status(400).json({
        ok: false,
        message: 'Filtro de resultado inválido.',
        valores_validos: RESULTADOS_FILTRO_VALIDOS
      });
    }

    if (resultado_gestion && !MOTIVOS_ESTADISTICAS.includes(motivo)) {
      return res.status(400).json({
        ok: false,
        message: 'El filtro por resultado requiere una etapa de inactivos o vencidos.'
      });
    }

    if (estado && !ESTADOS_ALUMNO_VALIDOS.includes(estado)) {
      return res.status(400).json({
        ok: false,
        message: 'Estado de alumno inválido.',
        estados_validos: ESTADOS_ALUMNO_VALIDOS
      });
    }

    const where = {};
    const scope = aplicarScopeSedesAlumnos(where, req.user, sede_id);

    if (!scope.ok) {
      return res.status(scope.status).json({ ok: false, message: scope.message });
    }

    if (estado) where.estado = estado;
    if (normalizarTinyint(sin_asistencias, 0) === 1) {
      where.ultima_asistencia = { [Op.is]: null };
    }

    const search = normalizarTexto(q);

    where[Op.and] = [
      ...(where[Op.and] || []),
      resultado_gestion
        ? construirFiltroResultadoHistorico(motivo, resultado_gestion)
        : construirFiltroMotivoSeguimiento(motivo),
      ...(search ? [construirWhereBusquedaAlumno(search)] : []),
      ...(normalizarTinyint(sin_plan, 0) === 1
        ? [construirFiltroSinRelacionAlumno(AlumnosMembresiasModel, 'membresias_filtro_recap')]
        : []),
      ...(normalizarTinyint(sin_anamnesis, 0) === 1
        ? [construirFiltroSinRelacionAlumno(AlumnosAnamnesisModel, 'anamnesis_filtro_recap')]
        : []),
      ...(normalizarTinyint(sin_contacto_emergencia, 0) === 1
        ? [
            construirFiltroSinRelacionAlumno(
              AlumnosContactosEmergenciaModel,
              'contactos_emergencia_filtro_recap'
            )
          ]
        : [])
    ];

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 20, 1), 200);
    const offset = (pageNumber - 1) * limitNumber;

    const { rows, count } = await AlumnosModel.findAndCountAll({
      where,
      limit: limitNumber,
      offset,
      order: [['id', 'DESC']]
    });

    const alumnoIds = rows.map((alumno) => alumno.id);
    const { asistencias, cuotasVencidas, contactos } =
      await obtenerResumenComercialPorAlumnos(alumnoIds, motivo, resultado_gestion);

    const data = await Promise.all(
      rows.map(async (alumno) => {
        const base = await construirAlumnoRespuesta(alumno);
        const diasInactividad = asistencias.has(alumno.id) ? asistencias.get(alumno.id) : null;
        const diasCuotaVencida = cuotasVencidas.has(alumno.id)
          ? cuotasVencidas.get(alumno.id)
          : null;
        const ultimoContacto = contactos.get(alumno.id) || null;

        return {
          ...base,
          dias_inactividad: diasInactividad,
          dias_cuota_vencida: diasCuotaVencida,
          etiqueta_seguimiento:
            motivo === 'cliente_perdido'
              ? 'Cliente perdido'
              : resultado_gestion
                ? `Histórico · ${ETIQUETAS_MOTIVO_HISTORICO[motivo] || 'Seguimiento'}`
                : calcularEtiquetaSeguimiento(diasInactividad, diasCuotaVencida, alumno.estado) ||
                  'Sin motivo detectado',
          ultimo_contacto: ultimoContacto,
          estado_seguimiento: ultimoContacto
            ? ultimoContacto.resultado_gestion
            : 'sin_contactar'
        };
      })
    );

    return res.status(200).json({
      ok: true,
      message: 'Seguimiento comercial obtenido correctamente.',
      total: count,
      page: pageNumber,
      limit: limitNumber,
      total_pages: Math.ceil(count / limitNumber),
      resultado_gestion: resultado_gestion || null,
      data
    });
  } catch (error) {
    console.error('Error OBR_AlumnosRecaptaciones_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener el seguimiento comercial.'
    });
  }
};

const estadisticaVacia = (motivo) => ({
  motivo,
  total_contactos: 0,
  pendientes: 0,
  positivos: 0,
  negativos: 0,
  perdidos: 0,
  total_gestionados: 0,
  tasa_positiva: 0
});

/*
 * Benjamin Orellana - 2026/08/11 - Estadísticas del historial de contactos.
 * La salida de una cola no borra el contacto: por eso esta métrica puede
 * reconstruirse directamente desde alumnos_recaptaciones_contactos.
 */
export const OBR_EstadisticasRecaptaciones_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaAlumnos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar estadísticas de seguimiento.'
      });
    }

    const { sede_id } = req.query;
    const whereAlumnos = {};
    const scope = aplicarScopeSedesAlumnos(whereAlumnos, req.user, sede_id);

    if (!scope.ok) {
      return res.status(scope.status).json({ ok: false, message: scope.message });
    }

    const alumnosPermitidos = await AlumnosModel.findAll({
      attributes: ['id'],
      where: whereAlumnos,
      raw: true
    });
    const alumnoIds = alumnosPermitidos.map((fila) => Number(fila.id));

    const resultado = Object.fromEntries(
      MOTIVOS_ESTADISTICAS.map((motivo) => [motivo, estadisticaVacia(motivo)])
    );

    if (alumnoIds.length) {
      const filas = await db.query(
        `
        SELECT motivo_seguimiento, resultado_gestion, COUNT(*) AS total
        FROM alumnos_recaptaciones_contactos
        WHERE alumno_id IN (:alumnoIds)
          AND motivo_seguimiento IN (:motivos)
        GROUP BY motivo_seguimiento, resultado_gestion
        `,
        {
          replacements: { alumnoIds, motivos: MOTIVOS_ESTADISTICAS },
          type: QueryTypes.SELECT
        }
      );

      filas.forEach((fila) => {
        const item = resultado[fila.motivo_seguimiento];
        if (!item) return;
        const total = Number(fila.total) || 0;
        item.total_contactos += total;

        if (fila.resultado_gestion === 'pendiente') item.pendientes += total;
        if (fila.resultado_gestion === 'positivo') item.positivos += total;
        if (fila.resultado_gestion === 'negativo') item.negativos += total;
        if (fila.resultado_gestion === 'perdido') item.perdidos += total;
      });
    }

    Object.values(resultado).forEach((item) => {
      item.total_gestionados = item.positivos + item.negativos + item.perdidos;
      item.tasa_positiva = item.total_gestionados
        ? Number(((item.positivos / item.total_gestionados) * 100).toFixed(1))
        : 0;
    });

    const wherePerdidos = { ...whereAlumnos };
    wherePerdidos[Op.and] = [
      ...(wherePerdidos[Op.and] || []),
      construirFiltroClientePerdido()
    ];
    const clientesPerdidosActuales = await AlumnosModel.count({ where: wherePerdidos });

    return res.status(200).json({
      ok: true,
      data: resultado,
      clientes_perdidos_actuales: clientesPerdidosActuales
    });
  } catch (error) {
    console.error('Error OBR_EstadisticasRecaptaciones_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener estadísticas de seguimiento.'
    });
  }
};

/*
 * Sergio Manrique - 2026/08/01 - Historial completo de contactos de
 * recaptación de un alumno, del más reciente al más antiguo.
 */
export const OBR_HistorialContactosRecaptacion_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaAlumnos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar el historial de recaptaciones.'
      });
    }

    const alumnoId = Number(req.params.alumno_id);

    if (!alumnoId) {
      return res.status(400).json({ ok: false, message: 'Alumno inválido.' });
    }

    const contactos = await AlumnosRecaptacionesContactosModel.findAll({
      where: { alumno_id: alumnoId },
      include: [{ model: UsuariosModel, as: 'usuario', attributes: ['id', 'nombre'] }],
      order: [['fecha_contacto', 'DESC']]
    });

    return res.status(200).json({
      ok: true,
      message: 'Historial de contactos obtenido correctamente.',
      data: contactos
    });
  } catch (error) {
    console.error('Error OBR_HistorialContactosRecaptacion_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener el historial de contactos.'
    });
  }
};

/*
 * Sergio Manrique - 2026/08/01 - Registra un nuevo contacto de recaptación
 * para un alumno.
 */
export const CR_ContactoRecaptacion_CTS = async (req, res) => {
  try {
    if (!ROLES_OPERATIVOS_ALUMNOS.includes(req.user?.rol_codigo)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para registrar contactos de recaptación.'
      });
    }

    const alumnoId = Number(req.params.alumno_id);

    if (!alumnoId) {
      return res.status(400).json({ ok: false, message: 'Alumno inválido.' });
    }

    const alumno = await AlumnosModel.findByPk(alumnoId);

    if (!alumno) {
      return res.status(404).json({ ok: false, message: 'Alumno no encontrado.' });
    }

    const {
      medio_contacto,
      motivo_seguimiento,
      motivo_cliente,
      observacion,
      respuesta_cliente,
      oferta_realizada,
      motivo_baja,
      resultado_gestion
    } = req.body;

    if (!MEDIOS_CONTACTO_VALIDOS.includes(medio_contacto)) {
      return res.status(400).json({
        ok: false,
        message: 'Medio de contacto inválido.',
        valores_validos: MEDIOS_CONTACTO_VALIDOS
      });
    }

    if (motivo_seguimiento && !MOTIVOS_SEGUIMIENTO_VALIDOS.includes(motivo_seguimiento)) {
      return res.status(400).json({
        ok: false,
        message: 'Motivo de seguimiento inválido.',
        valores_validos: MOTIVOS_SEGUIMIENTO_VALIDOS
      });
    }

    if (motivo_cliente && !MOTIVOS_CLIENTE_VALIDOS.includes(motivo_cliente)) {
      return res.status(400).json({
        ok: false,
        message: 'Motivo del cliente inválido.',
        valores_validos: MOTIVOS_CLIENTE_VALIDOS
      });
    }

    const resultadoFinal = resultado_gestion || 'pendiente';

    if (!RESULTADOS_GESTION_VALIDOS.includes(resultadoFinal)) {
      return res.status(400).json({
        ok: false,
        message: 'Resultado de gestión inválido.',
        valores_validos: RESULTADOS_GESTION_VALIDOS
      });
    }

    const contacto = await AlumnosRecaptacionesContactosModel.create({
      alumno_id: alumnoId,
      usuario_id: req.user.id,
      medio_contacto,
      motivo_seguimiento: motivo_seguimiento || null,
      motivo_cliente: motivo_cliente || null,
      observacion: normalizarTexto(observacion),
      respuesta_cliente: normalizarTexto(respuesta_cliente),
      oferta_realizada: normalizarTexto(oferta_realizada),
      motivo_baja: normalizarTexto(motivo_baja),
      resultado_gestion: resultadoFinal
    });

    return res.status(201).json({
      ok: true,
      message: 'Contacto registrado correctamente.',
      data: contacto
    });
  } catch (error) {
    console.error('Error CR_ContactoRecaptacion_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al registrar el contacto.'
    });
  }
};

/*
 * Sergio Manrique - 2026/08/01 - Busca un contacto de recaptación
 * verificando que pertenezca al alumno indicado en la URL.
 */
const buscarContactoDeAlumno = async (alumnoId, contactoId) => {
  const contacto = await AlumnosRecaptacionesContactosModel.findOne({
    where: { id: contactoId, alumno_id: alumnoId }
  });

  return contacto;
};

/*
 * Sergio Manrique - 2026/08/01 - Actualiza un contacto de recaptación ya
 * registrado. Pensado principalmente para pasar el resultado de "pendiente"
 * a "positivo"/"negativo" una vez que se conoce el desenlace de la gestión,
 * pero permite editar cualquier campo cargado por error.
 */
export const UR_ContactoRecaptacion_CTS = async (req, res) => {
  try {
    if (!ROLES_OPERATIVOS_ALUMNOS.includes(req.user?.rol_codigo)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para actualizar contactos de recaptación.'
      });
    }

    const alumnoId = Number(req.params.alumno_id);
    const contactoId = Number(req.params.contacto_id);

    if (!alumnoId || !contactoId) {
      return res.status(400).json({ ok: false, message: 'Datos inválidos.' });
    }

    const contacto = await buscarContactoDeAlumno(alumnoId, contactoId);

    if (!contacto) {
      return res.status(404).json({ ok: false, message: 'Contacto no encontrado.' });
    }

    const {
      medio_contacto,
      motivo_cliente,
      observacion,
      respuesta_cliente,
      oferta_realizada,
      motivo_baja,
      resultado_gestion
    } = req.body;

    if (medio_contacto !== undefined && !MEDIOS_CONTACTO_VALIDOS.includes(medio_contacto)) {
      return res.status(400).json({
        ok: false,
        message: 'Medio de contacto inválido.',
        valores_validos: MEDIOS_CONTACTO_VALIDOS
      });
    }

    if (
      motivo_cliente !== undefined &&
      motivo_cliente !== null &&
      motivo_cliente !== '' &&
      !MOTIVOS_CLIENTE_VALIDOS.includes(motivo_cliente)
    ) {
      return res.status(400).json({
        ok: false,
        message: 'Motivo del cliente inválido.',
        valores_validos: MOTIVOS_CLIENTE_VALIDOS
      });
    }

    if (resultado_gestion !== undefined && !RESULTADOS_GESTION_VALIDOS.includes(resultado_gestion)) {
      return res.status(400).json({
        ok: false,
        message: 'Resultado de gestión inválido.',
        valores_validos: RESULTADOS_GESTION_VALIDOS
      });
    }

    const cambios = {};
    if (medio_contacto !== undefined) cambios.medio_contacto = medio_contacto;
    if (motivo_cliente !== undefined) cambios.motivo_cliente = motivo_cliente || null;
    if (observacion !== undefined) cambios.observacion = normalizarTexto(observacion);
    if (respuesta_cliente !== undefined)
      cambios.respuesta_cliente = normalizarTexto(respuesta_cliente);
    if (oferta_realizada !== undefined)
      cambios.oferta_realizada = normalizarTexto(oferta_realizada);
    if (motivo_baja !== undefined) cambios.motivo_baja = normalizarTexto(motivo_baja);
    if (resultado_gestion !== undefined) cambios.resultado_gestion = resultado_gestion;
    cambios.updated_at = new Date();

    await contacto.update(cambios);

    return res.status(200).json({
      ok: true,
      message: 'Contacto actualizado correctamente.',
      data: contacto
    });
  } catch (error) {
    console.error('Error UR_ContactoRecaptacion_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al actualizar el contacto.'
    });
  }
};

/*
 * Sergio Manrique - 2026/08/01 - Elimina un contacto de recaptación
 * (ej. cargado por error). Mismo alcance de roles que crear/editar: el
 * equipo comercial gestiona su propio historial sin depender de un admin.
 */
export const ER_ContactoRecaptacion_CTS = async (req, res) => {
  try {
    if (!ROLES_OPERATIVOS_ALUMNOS.includes(req.user?.rol_codigo)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para eliminar contactos de recaptación.'
      });
    }

    const alumnoId = Number(req.params.alumno_id);
    const contactoId = Number(req.params.contacto_id);

    if (!alumnoId || !contactoId) {
      return res.status(400).json({ ok: false, message: 'Datos inválidos.' });
    }

    const contacto = await buscarContactoDeAlumno(alumnoId, contactoId);

    if (!contacto) {
      return res.status(404).json({ ok: false, message: 'Contacto no encontrado.' });
    }

    await contacto.destroy();

    return res.status(200).json({
      ok: true,
      message: 'Contacto eliminado correctamente.',
      data: { id: contactoId }
    });
  } catch (error) {
    console.error('Error ER_ContactoRecaptacion_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al eliminar el contacto.'
    });
  }
};
