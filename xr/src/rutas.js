// Convierte rutas del proyecto original ("assets/...") en direcciones de esta app.
export const url = ruta => `${import.meta.env.BASE_URL}${ruta.replace(/^\/+/u, '')}`;
