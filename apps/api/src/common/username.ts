// Minúsculas, números, puntos, guiones o guiones bajos; 3-30 caracteres,
// sin empezar/terminar con separador. Ej: "juan", "lissette", "ana.lopez".
export const PATRON_USERNAME = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$/;

export const MENSAJE_USERNAME_INVALIDO =
  'El usuario debe tener 3-30 caracteres: minúsculas, números, puntos, guiones o guiones bajos';
