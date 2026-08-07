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
    puede_ver_finanzas: false
  },
  FRONT_COMERCIAL: {
    puede_operar: true,
    puede_ver_reportes: false,
    puede_ver_finanzas: false
  },
  PROFESOR: {
    puede_operar: true,
    puede_ver_reportes: false,
    puede_ver_finanzas: true
  }
};

export const ROLES_CON_ACCESO_TODAS_SEDES = ['SUPER_ADMIN', 'DIRECCION'];

const normalizarBoolean = (value) => {
  return (
    value === true ||
    value === 1 ||
    value === '1' ||
    String(value || '').toLowerCase() === 'true'
  );
};

export const rolPuedeTenerAccesoTodasSedes = (rolCodigo) => {
  return ROLES_CON_ACCESO_TODAS_SEDES.includes(
    String(rolCodigo || '').toUpperCase()
  );
};

/*
 * Benjamin Orellana - 2026/07/28 - La bandera persistida es la fuente de
 * verdad del alcance global. El rol solamente determina si puede recibirlo.
 */
export const usuarioTieneAccesoTodasSedes = (user) => {
  return (
    rolPuedeTenerAccesoTodasSedes(user?.rol_codigo) &&
    normalizarBoolean(user?.acceso_todas_sedes)
  );
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
