#!/bin/bash

# Benjamin Orellana - 2026/05/10 - Script de estructura inicial backend PREMIUM.

set -e

echo "Creando estructura inicial backend PREMIUM..."

mkdir -p src/Models/Sistema
mkdir -p src/Models/Sede
mkdir -p src/Models/Usuario
mkdir -p src/Models/Plan
mkdir -p src/Models/Alumno
mkdir -p src/Models/Pago
mkdir -p src/Models/Agenda
mkdir -p src/Models/Finanzas
mkdir -p src/Models/ARCA

mkdir -p src/Controllers/Sistema
mkdir -p src/Controllers/Sede
mkdir -p src/Controllers/Usuario
mkdir -p src/Controllers/Plan
mkdir -p src/Controllers/Alumno
mkdir -p src/Controllers/Pago
mkdir -p src/Controllers/Agenda
mkdir -p src/Controllers/Finanzas
mkdir -p src/Controllers/ARCA

mkdir -p src/Routes
mkdir -p src/Middlewares

mkdir -p src/Services/Sistema
mkdir -p src/Services/Usuario
mkdir -p src/Services/Alumno
mkdir -p src/Services/Pago
mkdir -p src/Services/Agenda
mkdir -p src/Services/Finanzas
mkdir -p src/Services/ARCA

touch server.js
touch .env
touch package.json


touch src/Routes/routes.js

touch src/Models/Sistema/MD_TB_SistemaConfiguracion.js
touch src/Models/Sistema/MD_TB_SistemaAlertas.js
touch src/Models/Sistema/MD_TB_SistemaAuditoriaLogs.js
touch src/Models/Sistema/relacionesSistema.js

touch src/Models/Sede/MD_TB_Sedes.js
touch src/Models/Sede/relacionesSede.js

touch src/Models/Usuario/MD_TB_UsuariosRoles.js
touch src/Models/Usuario/MD_TB_UsuariosPermisos.js
touch src/Models/Usuario/MD_TB_UsuariosRolesPermisos.js
touch src/Models/Usuario/MD_TB_Usuarios.js
touch src/Models/Usuario/MD_TB_UsuariosSedes.js
touch src/Models/Usuario/relacionesUsuario.js

touch src/Models/Plan/MD_TB_Planes.js
touch src/Models/Plan/MD_TB_PlanesPrecios.js
touch src/Models/Plan/relacionesPlan.js

touch src/Models/Alumno/MD_TB_Alumnos.js
touch src/Models/Alumno/MD_TB_AlumnosContactosEmergencia.js
touch src/Models/Alumno/MD_TB_AlumnosAnamnesis.js
touch src/Models/Alumno/MD_TB_AlumnosMembresias.js
touch src/Models/Alumno/MD_TB_AlumnosAsistencias.js
touch src/Models/Alumno/relacionesAlumno.js

touch src/Models/Pago/MD_TB_PagosMediosPago.js
touch src/Models/Pago/MD_TB_PagosMensualidades.js
touch src/Models/Pago/MD_TB_Pagos.js
touch src/Models/Pago/MD_TB_PagosMetodosRecurrentes.js
touch src/Models/Pago/relacionesPago.js

touch src/Models/Agenda/MD_TB_AgendaHorariosSede.js
touch src/Models/Agenda/MD_TB_AgendaTurnos.js
touch src/Models/Agenda/MD_TB_AgendaTurnosReservas.js
touch src/Models/Agenda/MD_TB_AgendaTurnosListaEspera.js
touch src/Models/Agenda/relacionesAgenda.js

touch src/Models/Finanzas/MD_TB_FinanzasCategorias.js
touch src/Models/Finanzas/MD_TB_FinanzasMovimientos.js
touch src/Models/Finanzas/MD_TB_FinanzasObjetivos.js
touch src/Models/Finanzas/relacionesFinanzas.js

touch src/Models/ARCA/MD_TB_ArcaEmpresas.js
touch src/Models/ARCA/MD_TB_ArcaPuntosVenta.js
touch src/Models/ARCA/MD_TB_ArcaComprobantes.js
touch src/Models/ARCA/MD_TB_ArcaTokens.js
touch src/Models/ARCA/relacionesARCA.js

echo "Estructura inicial backend PREMIUM creada correctamente."