import SedesModel          from './MD_TB_Sedes.js';
import SedesHorariosModel  from './MD_TB_SedesHorarios.js';

SedesModel.hasMany(SedesHorariosModel,    { foreignKey: 'sede_id', as: 'horarios' });
SedesHorariosModel.belongsTo(SedesModel,  { foreignKey: 'sede_id', as: 'sede'    });
