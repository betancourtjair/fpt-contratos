const express = require('express');
const multer = require('multer');
const { query } = require('../../db');
const asyncHandler = require('../../utils/asyncHandler');
const { badRequest, notFound } = require('../../utils/errors');
const { requireAuth } = require('../../middleware/auth');
const sharepointUbicaciones = require('../../sharepointUbicaciones');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Los documentos de cada ubicación (pestaña "Files" de Leasecake) viven directo en SharePoint
// (carpeta Ubicaciones/<nombre de la ubicación>/<categoría>/), no en nuestra base de datos: se
// migraron a mano desde Leasecake y SharePoint es la única fuente de verdad. Por eso estas rutas
// solo resuelven el nombre de la ubicación y delegan todo a sharepointUbicaciones (ver ese
// archivo). Si SharePoint no está configurado (faltan las variables MS_GRAPH_*/SHAREPOINT_*),
// se devuelve la lista vacía en vez de tronar, para no romper la página de la ubicación.

async function obtenerNombreUbicacion(locationId) {
  const { rows } = await query('SELECT nombre FROM locations WHERE id = $1', [locationId]);
  if (!rows[0]) throw notFound('Ubicación no encontrada.');
  return rows[0].nombre;
}

router.post(
  '/locations/:locationId/documentos',
  requireAuth,
  upload.single('archivo'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('archivo es requerido.');
    const { categoria } = req.body || {};
    const nombreUbicacion = await obtenerNombreUbicacion(req.params.locationId);

    const documento = await sharepointUbicaciones.subir(nombreUbicacion, categoria, req.file.originalname, req.file.buffer);
    res.status(201).json({ documento });
  })
);

router.get(
  '/locations/:locationId/documentos',
  requireAuth,
  asyncHandler(async (req, res) => {
    const nombreUbicacion = await obtenerNombreUbicacion(req.params.locationId);
    const { configurado, documentos } = await sharepointUbicaciones.listar(nombreUbicacion);
    res.json({ documentos, sharepointConfigurado: configurado });
  })
);

router.delete(
  '/documentos/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    // :id es el driveItem id de SharePoint (string opaco), no un id de nuestra base de datos.
    await sharepointUbicaciones.eliminar(req.params.id);
    res.status(204).end();
  })
);

module.exports = router;
