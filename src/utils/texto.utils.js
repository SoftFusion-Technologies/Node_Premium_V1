/**
 * Normaliza textos:
 * - Elimina espacios sobrantes
 * - Convierte a minúsculas
 * - Capitaliza cada palabra
 *
 * Ej:
 * "  jUaN   caRLos  " => "Juan Carlos"
 */
export const capitalizarTexto = (texto) => {
  if (!texto || typeof texto !== "string") {
    return "";
  }

  return texto
    .trim()
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map(
      (palabra) =>
        palabra.charAt(0).toUpperCase() +
        palabra.slice(1)
    )
    .join(" ");
};

/**
 * Normaliza emails.
 *
 * Ej:
 * " TEST@GMAIL.COM "
 * => "test@gmail.com"
 */
export const normalizarEmail = (email) => {
  if (!email || typeof email !== "string") {
    return "";
  }

  return email.trim().toLowerCase();
};

/**
 * Conserva únicamente números.
 *
 * Ej:
 * "(381) 555-1234"
 * => "3815551234"
 */
export const normalizarTelefono = (telefono) => {
  if (!telefono || typeof telefono !== "string") {
    return "";
  }

  return telefono.replace(/\D/g, "");
};

/**
 * Conserva únicamente números.
 *
 * Ej:
 * "42.123.456"
 * => "42123456"
 */
export const normalizarDni = (dni) => {
  if (!dni || typeof dni !== "string") {
    return "";
  }

  return dni.replace(/\D/g, "");
};