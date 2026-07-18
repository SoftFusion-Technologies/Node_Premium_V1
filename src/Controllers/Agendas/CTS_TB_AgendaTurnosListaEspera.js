/*
 * Programador: Sergio Manrique
 * Fecha Creación: 23 / 06 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_AgendaTurnosListaEspera.js) contiene los controladores
 * para gestionar la lista de espera de turnos (agenda_turnos_lista_espera).
 * La promoción automática se maneja desde CTS_TB_AgendaTurnosReservas.js
 * al cancelar/reprogramar una reserva.
 *
 * Tema: Controladores - Agenda
 * Capa: Backend
 */

import { Op }                       from 'sequelize';
import AgendaTurnosListaEsperaModel from '../../Models/Agenda/MD_TB_AgendaTurnosListaEspera.js';
import AgendaTurnosModel            from '../../Models/Agenda/MD_TB_AgendaTurnos.js';
import AlumnosModel                 from '../../Models/Alumno/MD_TB_Alumnos.js';

// ─── ADMIN ────────────────────────────────────────────────────────────────────

/*
 * Sergio Manrique - 2026/06/23
 * Lista la lista de espera de un turno específico.
 */
export const OBRS_ListaEsperaTurno_CTS = async (req, res) => {
  try {
    const { turno_id } = req.params;

    const lista = await AgendaTurnosListaEsperaModel.findAll({
      where: { turno_id, estado: 'esperando' },
      include: [
        { model: AlumnosModel, as: 'alumno', attributes: ['id', 'nombre', 'apellido', 'telefono'] }
      ],
      order: [['posicion', 'ASC']]
    });

    return res.status(200).json(lista);
  } catch (error) {
    console.error('[OBRS_ListaEsperaTurno_CTS]', error);
    return res.status(500).json({ message: 'Error al obtener la lista de espera.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23
 * Admin elimina a un alumno de la lista de espera y reordena posiciones.
 */
export const ER_ListaEspera_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const entrada = await AgendaTurnosListaEsperaModel.findByPk(id);
    if (!entrada) {
      return res.status(404).json({ message: 'Entrada en lista de espera no encontrada.' });
    }

    if (entrada.estado !== 'esperando') {
      return res.status(400).json({ message: 'Solo se pueden remover entradas activas de la lista de espera.' });
    }

    const { turno_id, posicion } = entrada;

    await entrada.update({ estado: 'cancelado', fecha_resolucion: new Date(), updated_at: new Date() });

    // Reordenar los que están después
    const restantes = await AgendaTurnosListaEsperaModel.findAll({
      where:  { turno_id, estado: 'esperando', posicion: { [Op.gt]: posicion } },
      order:  [['posicion', 'ASC']]
    });

    for (let i = 0; i < restantes.length; i++) {
      await restantes[i].update({ posicion: posicion + i });
    }

    return res.status(200).json({ message: 'Alumno removido de la lista de espera.' });
  } catch (error) {
    console.error('[ER_ListaEspera_CTS]', error);
    return res.status(500).json({ message: 'Error al remover de la lista de espera.' });
  }
};

// ─── ALUMNO ───────────────────────────────────────────────────────────────────

/*
 * Sergio Manrique - 2026/06/23
 * Lista las entradas en lista de espera del alumno autenticado.
 */
export const OBRS_MiListaEspera_CTS = async (req, res) => {
  try {
    const alumno_id = req.alumno.id;

    const lista = await AgendaTurnosListaEsperaModel.findAll({
      where: { alumno_id, estado: 'esperando' },
      include: [
        {
          model:      AgendaTurnosModel,
          as:         'turno',
          attributes: ['id', 'fecha', 'hora_inicio', 'hora_fin', 'nombre_clase', 'cupo_maximo', 'cupos_reservados']
        }
      ],
      order: [['fecha_alta', 'ASC']]
    });

    return res.status(200).json(lista);
  } catch (error) {
    console.error('[OBRS_MiListaEspera_CTS]', error);
    return res.status(500).json({ message: 'Error al obtener tu lista de espera.' });
  }
};

/*
 * Sergio Manrique - 2026/06/23
 * Alumno se quita a sí mismo de la lista de espera de un turno.
 * Reordena las posiciones de los restantes.
 */
export const ER_MiListaEspera_CTS = async (req, res) => {
  try {
    const alumno_id = req.alumno.id;
    const { id }    = req.params;

    const entrada = await AgendaTurnosListaEsperaModel.findByPk(id);
    if (!entrada || entrada.alumno_id !== alumno_id) {
      return res.status(404).json({ message: 'Entrada en lista de espera no encontrada.' });
    }

    if (entrada.estado !== 'esperando') {
      return res.status(400).json({ message: 'Solo podés salir de listas de espera activas.' });
    }

    const { turno_id, posicion } = entrada;

    await entrada.update({ estado: 'cancelado', fecha_resolucion: new Date(), updated_at: new Date() });

    // Reordenar los que están después
    const restantes = await AgendaTurnosListaEsperaModel.findAll({
      where:  { turno_id, estado: 'esperando', posicion: { [Op.gt]: posicion } },
      order:  [['posicion', 'ASC']]
    });

    for (let i = 0; i < restantes.length; i++) {
      await restantes[i].update({ posicion: posicion + i });
    }

    return res.status(200).json({ message: 'Saliste de la lista de espera correctamente.' });
  } catch (error) {
    console.error('[ER_MiListaEspera_CTS]', error);
    return res.status(500).json({ message: 'Error al salir de la lista de espera.' });
  }
};
