/*
 * Programador: Sergio Manrique
 * Fecha Creación: 02 / 07 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_SedesHorarios.js) contiene los controladores
 * para gestionar los horarios de apertura por sede y día de la semana
 * (tabla sedes_horarios). Una fila por (sede_id, dia_semana).
 * Si no existe fila para un día, ese día no tiene clases habilitadas.
 *
 * Tema: Controladores - Sede
 * Capa: Backend
 */

import SedesHorariosModel from '../../Models/Sede/MD_TB_SedesHorarios.js';
import SedesModel         from '../../Models/Sede/MD_TB_Sedes.js'; // usado en CR_HorarioSede_CTS para validar que la sede exista

const DIAS_VALIDOS = [1, 2, 3, 4, 5, 6, 7]; // 1=Lun...7=Dom

/*
 * Sergio Manrique - 2026/07/02
 * Lista los horarios de todas las sedes (o de una sede específica).
 * Query params opcionales: sede_id, activo
 */
export const OBRS_HorariosSedes_CTS = async (req, res) => {
  try {
    const { sede_id, activo } = req.query;

    const where = {};
    if (sede_id) where.sede_id = sede_id;
    if (activo !== undefined) where.activo = activo === 'true' || activo === '1' ? 1 : 0;

    const horarios = await SedesHorariosModel.findAll({
      where,
      order: [['sede_id', 'ASC'], ['dia_semana', 'ASC']]
    });

    return res.status(200).json(horarios);
  } catch (error) {
    console.error('[OBRS_HorariosSedes_CTS]', error);
    return res.status(500).json({ message: 'Error al obtener los horarios.' });
  }
};

/*
 * Sergio Manrique - 2026/07/02
 * Obtiene un horario por ID.
 */
export const OBRS_HorarioSedePorId_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const horario = await SedesHorariosModel.findByPk(id);

    if (!horario) {
      return res.status(404).json({ message: 'Horario no encontrado.' });
    }

    return res.status(200).json(horario);
  } catch (error) {
    console.error('[OBRS_HorarioSedePorId_CTS]', error);
    return res.status(500).json({ message: 'Error al obtener el horario.' });
  }
};

/*
 * Sergio Manrique - 2026/07/02
 * Crea un horario para una sede y día de la semana.
 * Body: { sede_id, dia_semana, hora_inicio, hora_fin }
 */
export const CR_HorarioSede_CTS = async (req, res) => {
  try {
    const { sede_id, dia_semana, hora_inicio, hora_fin } = req.body;

    if (!sede_id || !dia_semana || !hora_inicio || !hora_fin) {
      return res.status(400).json({ message: 'Faltan campos requeridos: sede_id, dia_semana, hora_inicio, hora_fin.' });
    }

    if (!DIAS_VALIDOS.includes(Number(dia_semana))) {
      return res.status(400).json({ message: 'dia_semana debe estar entre 1 (Lunes) y 7 (Domingo).' });
    }

    if (hora_inicio >= hora_fin) {
      return res.status(400).json({ message: 'hora_inicio debe ser anterior a hora_fin.' });
    }

    const sede = await SedesModel.findByPk(sede_id);
    if (!sede) {
      return res.status(404).json({ message: 'Sede no encontrada.' });
    }

    const horario = await SedesHorariosModel.create({
      sede_id,
      dia_semana: Number(dia_semana),
      hora_inicio,
      hora_fin,
      activo: 1
    });

    return res.status(201).json({ message: 'Horario creado correctamente.', horario });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Ya existe un horario para esa sede y día de la semana.' });
    }
    console.error('[CR_HorarioSede_CTS]', error);
    return res.status(500).json({ message: 'Error al crear el horario.' });
  }
};

/*
 * Sergio Manrique - 2026/07/02
 * Actualiza un horario existente.
 * Body: { hora_inicio?, hora_fin?, activo? }
 */
export const UR_HorarioSede_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const { hora_inicio, hora_fin, activo } = req.body;

    const horario = await SedesHorariosModel.findByPk(id);
    if (!horario) {
      return res.status(404).json({ message: 'Horario no encontrado.' });
    }

    const nuevaInicio = hora_inicio ?? horario.hora_inicio;
    const nuevaFin    = hora_fin    ?? horario.hora_fin;

    if (nuevaInicio >= nuevaFin) {
      return res.status(400).json({ message: 'hora_inicio debe ser anterior a hora_fin.' });
    }

    await horario.update({
      hora_inicio: nuevaInicio,
      hora_fin:    nuevaFin,
      activo:      activo !== undefined ? (activo ? 1 : 0) : horario.activo,
      updated_at:  new Date()
    });

    return res.status(200).json({ message: 'Horario actualizado correctamente.', horario });
  } catch (error) {
    console.error('[UR_HorarioSede_CTS]', error);
    return res.status(500).json({ message: 'Error al actualizar el horario.' });
  }
};

/*
 * Sergio Manrique - 2026/07/02
 * Activa o desactiva un horario sin eliminarlo.
 */
export const UR_ToggleHorarioSede_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const horario = await SedesHorariosModel.findByPk(id);
    if (!horario) {
      return res.status(404).json({ message: 'Horario no encontrado.' });
    }

    await horario.update({ activo: horario.activo ? 0 : 1, updated_at: new Date() });

    return res.status(200).json({
      message: `Horario ${horario.activo ? 'activado' : 'desactivado'} correctamente.`,
      horario
    });
  } catch (error) {
    console.error('[UR_ToggleHorarioSede_CTS]', error);
    return res.status(500).json({ message: 'Error al cambiar el estado del horario.' });
  }
};

/*
 * Sergio Manrique - 2026/07/02
 * Elimina un horario de sede.
 */
export const ER_HorarioSede_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const horario = await SedesHorariosModel.findByPk(id);
    if (!horario) {
      return res.status(404).json({ message: 'Horario no encontrado.' });
    }

    await horario.destroy();

    return res.status(200).json({ message: 'Horario eliminado correctamente.' });
  } catch (error) {
    console.error('[ER_HorarioSede_CTS]', error);
    return res.status(500).json({ message: 'Error al eliminar el horario.' });
  }
};
