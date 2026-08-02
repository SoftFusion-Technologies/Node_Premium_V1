/*
 * Sergio Manrique - 2026/08/01
 * Controlador del módulo Recaptaciones: listado de alumnos que requieren
 * seguimiento comercial (inactividad / cuota vencida / cliente perdido) e
 * historial de contactos registrados para cada uno.
 *
 * Reutiliza el mismo alcance de sede, búsqueda y armado de respuesta que ya
 * usa el listado de Alumnos (Controllers/Alumno/CTS_TB_Alumnos.js), para no
 * duplicar reglas de negocio.
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
  construirFiltroAlumnoCuotaVencida,
  construirFiltroAlumnoInactivo,
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

const MEDIOS_CONTACTO_VALIDOS = ['whatsapp', 'llamada', 'email', 'presencial', 'otro'];

// Motivo que da el propio cliente para no asistir/pagar (personal, no
// contesta, disconformidad con el servicio, precio, etc.), tal como lo
// venía registrando el coordinador en su planilla manual.
const MOTIVOS_CLIENTE_VALIDOS = ['personal', 'no_contesta', 'servicio', 'precio', 'otro'];

const RESULTADOS_GESTION_VALIDOS = ['positivo', 'negativo', 'pendiente'];

const normalizarTexto = (value) => {
  if (value === undefined || value === null) return null;

  const texto = String(value).trim();

  return texto.length > 0 ? texto : null;
};

// Arma el filtro Sequelize de un motivo puntual, o la unión de todos si no se indica.
const construirFiltroMotivoSeguimiento = (motivo) => {
  switch (motivo) {
    case 'inactividad_5':
      return construirFiltroAlumnoInactivo(5);
    case 'inactividad_15':
      return construirFiltroAlumnoInactivo(15);
    case 'cuota_1':
      return construirFiltroAlumnoCuotaVencida(1);
    case 'cuota_3':
      return construirFiltroAlumnoCuotaVencida(3);
    case 'cliente_perdido':
      // Definición acordada con el PM: cliente perdido = cuota vencida hace 1 mes o más.
      return construirFiltroAlumnoCuotaVencida(1);
    case 'pendiente_validacion':
      // Autoregistros (registro público) todavía sin validar: no tienen
      // asistencias ni cuotas generadas, así que nunca matchean inactividad
      // ni cuota vencida aunque necesiten seguimiento comercial igual.
      return { estado: 'pendiente_validacion' };
    default:
      // Sin motivo: bandeja completa. 15 días y 3 meses son subconjuntos de
      // 5 días y 1 mes respectivamente, así que la unión de estos dos ya
      // cubre esas 4 condiciones; se suma aparte pendiente_validacion, que
      // no se calcula por días sino por estado.
      return {
        [Op.or]: [
          construirFiltroAlumnoInactivo(5),
          construirFiltroAlumnoCuotaVencida(1),
          { estado: 'pendiente_validacion' }
        ]
      };
  }
};

/*
 * Trae, para un lote de alumno_id, los días de inactividad/cuota vencida
 * (función compartida con Alumnos) y el último contacto de recaptación
 * registrado (propio de este módulo).
 */
const obtenerResumenComercialPorAlumnos = async (alumnoIds) => {
  if (!alumnoIds.length) {
    return { asistencias: new Map(), cuotasVencidas: new Map(), contactos: new Map() };
  }

  const [{ asistencias, cuotasVencidas }, filasContactos] = await Promise.all([
    obtenerDiasSeguimientoPorAlumnos(alumnoIds),
    db.query(
      `
      SELECT c.alumno_id, c.fecha_contacto, c.medio_contacto, c.motivo_seguimiento,
        c.motivo_cliente, c.respuesta_cliente, c.resultado_gestion, u.nombre AS usuario_nombre
      FROM alumnos_recaptaciones_contactos c
      LEFT JOIN usuarios_usuarios u ON u.id = c.usuario_id
      INNER JOIN (
        SELECT alumno_id, MAX(fecha_contacto) AS ultima_fecha
        FROM alumnos_recaptaciones_contactos
        WHERE alumno_id IN (:alumnoIds)
        GROUP BY alumno_id
      ) ultimo ON ultimo.alumno_id = c.alumno_id AND ultimo.ultima_fecha = c.fecha_contacto
      WHERE c.alumno_id IN (:alumnoIds)
      `,
      { replacements: { alumnoIds }, type: QueryTypes.SELECT }
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

/*
 * Sergio Manrique - 2026/08/01 - Lista alumnos con seguimiento comercial
 * pendiente (bandeja de recaptaciones). Sin `motivo`, muestra la unión de
 * las 5 condiciones; con `motivo`, acota a esa condición puntual.
 */
export const OBR_AlumnosRecaptaciones_CTS = async (req, res) => {
  try {
    if (!validarRolLecturaAlumnos(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para consultar recaptaciones.'
      });
    }

    const {
      q,
      sede_id,
      motivo,
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

    if (estado) {
      where.estado = estado;
    }

    if (normalizarTinyint(sin_asistencias, 0) === 1) {
      where.ultima_asistencia = { [Op.is]: null };
    }

    const search = normalizarTexto(q);

    // Sergio Manrique - 2026/08/01 - Mismos filtros combinables que Alumnos
    // (estado, datos incompletos), sumados al motivo de seguimiento propio
    // de Recaptaciones, para que el equipo comercial pueda acotar la
    // bandeja (ej. "solo activos y sin plan") sin salir del módulo.
    where[Op.and] = [
      ...(where[Op.and] || []),
      construirFiltroMotivoSeguimiento(motivo),
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
      await obtenerResumenComercialPorAlumnos(alumnoIds);

    const data = await Promise.all(
      rows.map(async (alumno) => {
        const base = await construirAlumnoRespuesta(alumno);
        const diasInactividad = asistencias.has(alumno.id)
          ? asistencias.get(alumno.id)
          : null;
        const diasCuotaVencida = cuotasVencidas.has(alumno.id)
          ? cuotasVencidas.get(alumno.id)
          : null;
        const ultimoContacto = contactos.get(alumno.id) || null;

        return {
          ...base,
          dias_inactividad: diasInactividad,
          dias_cuota_vencida: diasCuotaVencida,
          etiqueta_seguimiento:
            calcularEtiquetaSeguimiento(diasInactividad, diasCuotaVencida, alumno.estado) ||
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
      message: 'Alumnos de recaptaciones obtenidos correctamente.',
      total: count,
      page: pageNumber,
      limit: limitNumber,
      total_pages: Math.ceil(count / limitNumber),
      data
    });
  } catch (error) {
    console.error('Error OBR_AlumnosRecaptaciones_CTS:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al obtener el listado de recaptaciones.'
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
