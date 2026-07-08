/*
 * Programador: Sergio Manrique
 * Fecha Creación: 08 / 07 / 2026
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_AlumnosAsistencias.js) contiene el controlador de
 * solo lectura para consultar el historial de asistencias de un alumno
 * (tabla alumnos_asistencias), usado en la ficha del alumno (VerAlumno).
 *
 * Tema: Controladores - Alumno
 * Capa: Backend
 */

import AlumnosModel              from '../../Models/Alumno/MD_TB_Alumnos.js';
import AlumnosAsistenciasModel   from '../../Models/Alumno/MD_TB_AlumnosAsistencias.js';
import AgendaTurnosModel         from '../../Models/Agenda/MD_TB_AgendaTurnos.js';
import SedesModel                from '../../Models/Sede/MD_TB_Sedes.js';
import UsuariosModel             from '../../Models/Usuario/MD_TB_Usuarios.js';

/*
 * Sergio Manrique - 2026/07/08
 * Lista el historial completo de asistencias de un alumno (más reciente
 * primero), con la sede, el turno y quién la registró. Es la base para el
 * historial, el resumen y la "evolución reciente" que se muestran en la
 * ficha del alumno — no incluye estadísticas calculadas, eso lo arma el
 * frontend a partir de esta lista.
 */
export const OBRS_AsistenciasAlumno_CTS = async (req, res) => {
  try {
    const { alumno_id } = req.params;

    const alumno = await AlumnosModel.findByPk(alumno_id, { attributes: ['id'] });
    if (!alumno) {
      return res.status(404).json({ message: 'Alumno no encontrado.' });
    }

    const asistencias = await AlumnosAsistenciasModel.findAll({
      where: { alumno_id },
      include: [
        { model: SedesModel,        as: 'sede',           attributes: ['id', 'nombre'] },
        { model: AgendaTurnosModel, as: 'turno',           attributes: ['id', 'nombre_clase', 'hora_inicio', 'hora_fin'] },
        { model: UsuariosModel,     as: 'registrado_por',  attributes: ['id', 'nombre', 'apellido'] }
      ],
      order: [['fecha', 'DESC'], ['hora_registro', 'DESC']]
    });

    return res.status(200).json({ status: 'success', data: asistencias, total: asistencias.length });
  } catch (error) {
    console.error('[OBRS_AsistenciasAlumno_CTS]', error);
    return res.status(500).json({ message: 'Error al obtener las asistencias del alumno.' });
  }
};
