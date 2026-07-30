/* Benjamin Orellana - 2026/07/14 - Rutas transaccionales de Cobros y Caja. */
import express from 'express';
import {
  authenticateToken,
  requireFinanzasSede,
  requirePermission,
  requireSedeAccess
} from '../Security/auth.js';
import {
  CR_AbrirCajaPrincipal_CTS,
  CR_MovimientoManualCaja_CTS,
  OBR_AperturaSugeridaCaja_CTS,
  OBR_CajaSesionActiva_CTS,
  OBR_ResumenCaja_CTS,
  OBR_SesionesCaja_CTS,
  UR_CerrarCaja_CTS,
  UR_RegistrarConteoCaja_CTS
} from '../Controllers/Caja/CTS_TB_Cajas.js';
import {
  CR_Cobros_CTS,
  OBR_CobroDetalle_CTS,
  OBR_CobrosPendientesCount_CTS,
  OBR_Cobros_CTS,
  OBR_MediosPagoCobro_CTS,
  OBR_SaldoDisponibleCobro_CTS,
  UR_AnularCobro_CTS,
  UR_ConfirmarCobro_CTS,
  UR_RechazarCobro_CTS
} from '../Controllers/Cobro/CTS_TB_Cobros.js';
import { requireCobroDelDiaActual } from '../Security/operationalDayScope.js';

const router = express.Router();
const seguridadSede = [authenticateToken, requireSedeAccess];
const seguridadCaja = [authenticateToken, requireSedeAccess, requireFinanzasSede];

router.get(
  '/cobros/medios-pago',
  ...seguridadSede,
  requirePermission(['cobros.registrar', 'medios_pago.ver']),
  OBR_MediosPagoCobro_CTS
);

router.get(
  '/cobros/alumnos/:alumno_id/saldo-disponible',
  ...seguridadSede,
  requirePermission('cobros.registrar'),
  OBR_SaldoDisponibleCobro_CTS
);

router.get(
  '/cajas/sesion-activa',
  ...seguridadSede,
  requirePermission(['caja.ver', 'cobros.registrar']),
  OBR_CajaSesionActiva_CTS
);

router.get(
  '/cajas/apertura-sugerida',
  ...seguridadCaja,
  requirePermission('caja.abrir'),
  OBR_AperturaSugeridaCaja_CTS
);

router.get(
  '/cajas/resumen',
  ...seguridadCaja,
  requirePermission('caja.ver'),
  OBR_ResumenCaja_CTS
);
router.get(
  '/cajas/sesiones',
  ...seguridadCaja,
  requirePermission('caja.ver'),
  OBR_SesionesCaja_CTS
);

router.get(
  '/cobros',
  ...seguridadSede,
  requirePermission('cobros.ver'),
  OBR_Cobros_CTS
);

router.get(
  '/cobros/pendientes/count',
  ...seguridadSede,
  requirePermission('cobros.validar'),
  OBR_CobrosPendientesCount_CTS
);

router.get(
  '/cobros/:id',
  ...seguridadSede,
  requirePermission('cobros.ver'),
  requireCobroDelDiaActual,
  OBR_CobroDetalle_CTS
);

router.post(
  '/cajas/abrir',
  ...seguridadCaja,
  requirePermission('caja.abrir'),
  CR_AbrirCajaPrincipal_CTS
);

router.post(
  '/cajas/movimientos/manual',
  ...seguridadCaja,
  requirePermission('caja.movimiento_manual'),
  CR_MovimientoManualCaja_CTS
);

router.patch(
  '/cajas/conteo',
  ...seguridadCaja,
  requirePermission('caja.contar'),
  UR_RegistrarConteoCaja_CTS
);
router.patch(
  '/cajas/cerrar',
  ...seguridadCaja,
  requirePermission('caja.cerrar'),
  UR_CerrarCaja_CTS
);

router.post(
  '/cobros',
  ...seguridadSede,
  requirePermission('cobros.registrar'),
  CR_Cobros_CTS
);

router.patch(
  '/cobros/:id/confirmar',
  ...seguridadSede,
  requirePermission('cobros.validar'),
  requireCobroDelDiaActual,
  UR_ConfirmarCobro_CTS
);

router.patch(
  '/cobros/:id/rechazar',
  ...seguridadSede,
  requirePermission('cobros.rechazar'),
  requireCobroDelDiaActual,
  UR_RechazarCobro_CTS
);

router.patch(
  '/cobros/:id/anular',
  ...seguridadSede,
  requirePermission('cobros.anular'),
  requireCobroDelDiaActual,
  UR_AnularCobro_CTS
);

export default router;
