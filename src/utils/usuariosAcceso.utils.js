// Perfil inicial de acceso por sede. Los permisos RBAC efectivos siguen
// resolviéndose mediante roles/permisos; estos flags solo habilitan el alcance.
export const PERFILES_ACCESO_SEDE = {
  SUPER_ADMIN: {
    puede_operar: true,
    puede_ver_reportes: true,
    puede_ver_finanzas: true
  },
  DIRECCION: {
    puede_operar: true,
    puede_ver_reportes: true,
    puede_ver_finanzas: true
  },
  COORD_SEDE: {
    puede_operar: true,
    puede_ver_reportes: true,
    puede_ver_finanzas: true
  },
  FRONT_COMERCIAL: {
    puede_operar: true,
    puede_ver_reportes: false,
    puede_ver_finanzas: false
  },
  PROFESOR: {
    puede_operar: true,
    puede_ver_reportes: false,
    puede_ver_finanzas: false
  }
};

export const obtenerPerfilAccesoSede = (rolCodigo) => {
  return {
    ...(PERFILES_ACCESO_SEDE[String(rolCodigo || '').toUpperCase()] || {
      puede_operar: true,
      puede_ver_reportes: false,
      puede_ver_finanzas: false
    })
  };
};
