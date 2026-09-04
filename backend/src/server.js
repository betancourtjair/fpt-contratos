require('dotenv').config();
require('express-async-errors'); // defensa adicional; además usamos asyncHandler explícito en cada ruta

const path = require('path');
const express = require('express');
const cors = require('cors');

const { pool } = require('./db');
const { traducirErrorPostgres, AppError } = require('./utils/errors');

const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');
const tiposContratoRoutes = require('./routes/tiposContrato');
const flujoPlantillasRoutes = require('./routes/flujoPlantillas');
const contratosRoutes = require('./routes/contratos');
const documentosRoutes = require('./routes/documentos');
const dashboardRoutes = require('./routes/dashboard');
const jobsRoutes = require('./routes/jobs');

const app = express();

const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(
  cors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((o) => o.trim()),
  })
);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Archivos subidos (documentos de contratos), servidos como estáticos bajo /uploads.
const uploadsDir = path.resolve(process.cwd(), process.env.UPLOADS_DIR || 'uploads');
app.use('/uploads', express.static(uploadsDir));

app.get('/health', (req, res) => {
  res.json({ ok: true, servicio: 'fpt-contratos-backend', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/tipos-contrato', tiposContratoRoutes);
app.use('/api/flujo-plantillas', flujoPlantillasRoutes);
app.use('/api/contratos', contratosRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/jobs', jobsRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

// Manejador de errores centralizado.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, detalle: err.detalle });
  }

  const traducido = traducirErrorPostgres(err);
  if (traducido) {
    return res.status(traducido.status).json({ error: traducido.message, detalle: traducido.detalle });
  }

  if (err && err.name === 'MulterError') {
    return res.status(400).json({ error: `Error al procesar el archivo: ${err.message}` });
  }

  console.error('Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// Errores no controlados a nivel proceso: se registran pero NUNCA tumban el servidor.
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection (no tumba el proceso):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('uncaughtException (no tumba el proceso):', err);
});

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`FPT Contratos backend escuchando en http://localhost:${PORT}`);
  });

  const apagar = async (señal) => {
    console.log(`\nRecibido ${señal}, cerrando servidor...`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => apagar('SIGINT'));
  process.on('SIGTERM', () => apagar('SIGTERM'));
}

module.exports = app;
