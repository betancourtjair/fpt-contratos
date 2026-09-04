// Wrapper para rutas/handlers async de Express. Aunque el proyecto también carga
// express-async-errors (que parchea el router para capturar rejections automáticamente),
// usamos este wrapper explícitamente en todas las rutas async como defensa en profundidad:
// un promise rejection NUNCA debe tumbar el proceso.
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
