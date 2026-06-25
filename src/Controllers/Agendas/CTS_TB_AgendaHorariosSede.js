/*
 * Programador: Sergio Manrique
 * Fecha Creación: 23 / 06 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_AgendaHorariosSede.js) contiene los controladores
 * para gestionar las plantillas de horarios por sede (agenda_horarios_sede).
 * Son las plantillas base desde las que se generan los turnos concretos.
 *
 * Tema: Controladores - Agenda
 * Capa: Backend
 */

import { Op }                  from 'sequelize';
import AgendaHorariosSedeModel from '../../Models/Agenda/MD_TB_AgendaHorariosSede.js';
import SedesModel              from '../../Models/Sede/MD_TB_Sedes.js';
import UsuariosModel           from '../../Models/Usuario/MD_TB_Usuarios.js';

// ─── ADMIN ────────────────────────────────────────────────────────────────────

/*
 * Sergio Manrique - 2026/06/23
 * Lista todos los horarios de sede con sede y profesor incluidos.
 * Soporta filtro por sede_id y activo via query params.
 */
export const OBRS_HorariosSede_CTS = async (req, res) => {
  try {
    const { sede_id, activo } = req.query;

    const where = {};
    if (sede_id) where.sede_id = sede_id;
    if (activo !== undefined) where.activo = activo;

    const horarios = await AgendaHorariosSedeModel.findAll({
      where,
      include: [
        { model: SedesModel,    as: 'sede',     attributes: ['id', 'nombre'] },
        { model: UsuariosModel, as: 'profesor',  attributes: ['id', 'nombre', 'apellido'] }
      ],
      order: [['dia_semana', 'ASC'], ['hora_inicio', 'ASC']]
    });

    return res.status(200).json(horarios);
  } catch (error) {
    console.error('[OBRS_HorariosSede_CTS]', error);
    return res.status(500).json({ message: 'Error al obtener horarios.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23
 * Obtiene el detalle de un horario por ID.
 */
export const OBRS_DetHorarioSede_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const horario = await AgendaHorariosSedeModel.findByPk(id, {
      include: [
        { model: SedesModel,    as: 'sede',    attributes: ['id', 'nombre'] },
        { model: UsuariosModel, as: 'profesor', attributes: ['id', 'nombre', 'apellido'] }
      ]
    });

    if (!horario) {
      return res.status(404).json({ message: 'Horario no encontrado.' });
    }

    return res.status(200).json(horario);
  } catch (error) {
    console.error('[OBRS_DetHorarioSede_CTS]', error);
    return res.status(500).json({ message: 'Error al obtener el horario.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23
 * Crea un nuevo horario de sede (plantilla).
 */
export const CR_HorarioSede_CTS = async (req, res) => {
  try {
    const {
      sede_id,
      profesor_id,
      dia_semana,
      hora_inicio,
      hora_fin,
      cupo_maximo,
      tipo_clase,
      nombre_clase
    } = req.body;

    if (!sede_id || !dia_semana || !hora_inicio || !hora_fin) {
      return res.status(400).json({ message: 'Faltan campos requeridos: sede_id, dia_semana, hora_inicio, hora_fin.' });
    }

    // Evitar duplicados: ya existe una plantilla para esa sede, día y horario
    const horarioDuplicado = await AgendaHorariosSedeModel.findOne({
      where: { sede_id, dia_semana, hora_inicio }
    });
    if (horarioDuplicado) {
      return res.status(400).json({ message: 'Ya existe un horario para esa sede, día y horario.' });
    }

    const horario = await AgendaHorariosSedeModel.create({
      sede_id,
      profesor_id:  profesor_id  || null,
      dia_semana,
      hora_inicio,
      hora_fin,
      cupo_maximo:  cupo_maximo  || 6,
      tipo_clase:   tipo_clase   || 'presencial',
      nombre_clase: nombre_clase || null,
      activo: 1
    });

    return res.status(201).json({ message: 'Horario creado correctamente.', horario });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ message: 'Ya existe un horario para esa sede, día y horario.' });
    }
    console.error('[CR_HorarioSede_CTS]', error);
    return res.status(500).json({ message: 'Error al crear el horario.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23
 * Actualiza un horario de sede existente.
 */
export const UR_HorarioSede_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      profesor_id,
      dia_semana,
      hora_inicio,
      hora_fin,
      cupo_maximo,
      tipo_clase,
      nombre_clase
    } = req.body;

    const horario = await AgendaHorariosSedeModel.findByPk(id);
    if (!horario) {
      return res.status(404).json({ message: 'Horario no encontrado.' });
    }

    const diaSemanaFinal  = dia_semana  ?? horario.dia_semana;
    const horaInicioFinal = hora_inicio ?? horario.hora_inicio;

    // Evitar duplicados al mover el horario a otro día/franja ya ocupado
    if (dia_semana || hora_inicio) {
      const horarioDuplicado = await AgendaHorariosSedeModel.findOne({
        where: {
          sede_id:     horario.sede_id,
          dia_semana:  diaSemanaFinal,
          hora_inicio: horaInicioFinal,
          id:          { [Op.ne]: horario.id }
        }
      });
      if (horarioDuplicado) {
        return res.status(400).json({ message: 'Ya existe un horario para esa sede, día y horario.' });
      }
    }

    await horario.update({
      profesor_id:  profesor_id  ?? horario.profesor_id,
      dia_semana:   diaSemanaFinal,
      hora_inicio:  horaInicioFinal,
      hora_fin:     hora_fin     ?? horario.hora_fin,
      cupo_maximo:  cupo_maximo  ?? horario.cupo_maximo,
      tipo_clase:   tipo_clase   ?? horario.tipo_clase,
      nombre_clase: nombre_clase ?? horario.nombre_clase,
      updated_at:   new Date()
    });

    return res.status(200).json({ message: 'Horario actualizado correctamente.', horario });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ message: 'Ya existe un horario para esa sede, día y horario.' });
    }
    console.error('[UR_HorarioSede_CTS]', error);
    return res.status(500).json({ message: 'Error al actualizar el horario.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23
 * Activa o desactiva un horario (baja lógica).
 */
export const UR_EstadoHorarioSede_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const horario = await AgendaHorariosSedeModel.findByPk(id);
    if (!horario) {
      return res.status(404).json({ message: 'Horario no encontrado.' });
    }

    await horario.update({
      activo:     horario.activo ? 0 : 1,
      updated_at: new Date()
    });

    const estado = horario.activo ? 'activado' : 'desactivado';
    return res.status(200).json({ message: `Horario ${estado} correctamente.`, horario });
  } catch (error) {
    console.error('[UR_EstadoHorarioSede_CTS]', error);
    return res.status(500).json({ message: 'Error al cambiar estado del horario.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23
 * Elimina un horario de sede permanentemente.
 * Solo si no tiene turnos futuros asociados.
 */
export const ER_HorarioSede_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const horario = await AgendaHorariosSedeModel.findByPk(id);
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
