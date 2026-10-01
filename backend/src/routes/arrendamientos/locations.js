const express = require('express');
const { query } = require('../../db');
const asyncHandler = require('../../utils/asyncHandler');
const { badRequest, notFound, traducirErrorPostgres } = require('../../utils/errors');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { ROLES_NIVEL_ADMIN } = require('../../utils/roles');

const router = express.Router();

// Campos editables de `locations` expuestos en el API en camelCase -> columna real.
const MAPA_COLUMNAS = {
  nombre: 'nombre',
  locationNumber: 'location_number',
  brandId: 'brand_id',
  companyId: 'company_id',
  address1: 'address1',
  address2: 'address2',
  city: 'city',
  state: 'state',
  zip: 'zip',
  country: 'country',
  fullAddress: 'full_address',
  latitude: 'latitude',
  longitude: 'longitude',
  locationType: 'location_type',
  locationSubtype: 'location_subtype',
  businessCategory: 'business_category',
  businessType: 'business_type',
  propertyName: 'property_name',
  squareMeters: 'square_meters',
  totalLeasedSqm: 'total_leased_sqm',
  totalSubleasedSqm: 'total_subleased_sqm',
  phone: 'phone',
  lockboxCode: 'lockbox_code',
  locationImageUrl: 'location_image_url',
};

// La "ubicación activa" de referencia (para mostrar landlord/expiración/renta en el listado)
// es el lease sin estatus 'cancelado' con la fecha de expiración más lejana; si no hay ninguno
// activo se usa el más reciente que exista, para no dejar el renglón completamente vacío.
const SUBQUERY_LEASE_ACTIVO = `(
  SELECT le.id FROM leases le
  WHERE le.location_id = l.id
  ORDER BY (le.estatus = 'activo') DESC, le.expiration_date DESC NULLS LAST
  LIMIT 1
)`;

// GET /api/locations - listado combinado (igual que el "Locations report" de Leasecake):
// ubicación + brand + company + datos del lease activo (landlord, vencimiento, renta actual).
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(`
      SELECT
        l.*,
        b.nombre AS brand_nombre,
        c.nombre AS company_nombre,
        le.id AS lease_activo_id,
        le.acquisition_type,
        le.lease_classification,
        le.landlord_nombre,
        le.expiration_date,
        le.expiration_date_including_options,
        le.is_month_to_month,
        (
          SELECT rs.monto FROM lease_rent_schedule rs
          WHERE rs.lease_id = le.id AND rs.categoria = 'Base Rent'
            AND rs.start_date <= CURRENT_DATE AND (rs.end_date IS NULL OR rs.end_date >= CURRENT_DATE)
          ORDER BY rs.start_date DESC LIMIT 1
        ) AS renta_actual
      FROM locations l
      LEFT JOIN brands b ON b.id = l.brand_id
      LEFT JOIN companies c ON c.id = l.company_id
      LEFT JOIN leases le ON le.id = ${SUBQUERY_LEASE_ACTIVO}
      ORDER BY l.nombre ASC
    `);
    res.json({ locations: rows });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(`
      SELECT l.*, b.nombre AS brand_nombre, c.nombre AS company_nombre
      FROM locations l
      LEFT JOIN brands b ON b.id = l.brand_id
      LEFT JOIN companies c ON c.id = l.company_id
      WHERE l.id = $1
    `, [req.params.id]);
    const location = rows[0];
    if (!location) throw notFound('Ubicación no encontrada.');

    const { rows: leases } = await query(
      `SELECT * FROM leases WHERE location_id = $1 ORDER BY (estatus = 'activo') DESC, expiration_date DESC NULLS LAST`,
      [req.params.id]
    );
    // Los documentos de la ubicación ya NO se leen de location_documents: viven directo en
    // SharePoint y se obtienen aparte con GET /locations/:id/documentos (ver documentos.js).

    res.json({ location, leases });
  })
);

router.post(
  '/',
  requireAuth,
  requireRole(...ROLES_NIVEL_ADMIN),
  asyncHandler(async (req, res) => {
    const { nombre } = req.body || {};
    if (!nombre) throw badRequest('nombre es requerido.');

    const columnas = ['nombre'];
    const valores = [nombre];
    for (const [campo, columna] of Object.entries(MAPA_COLUMNAS)) {
      if (campo === 'nombre') continue;
      if (req.body[campo] !== undefined) {
        columnas.push(columna);
        valores.push(req.body[campo]);
      }
    }
    const placeholders = columnas.map((_, i) => `$${i + 1}`);
    try {
      const { rows } = await query(
        `INSERT INTO locations (${columnas.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        valores
      );
      res.status(201).json({ location: rows[0] });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

router.patch(
  '/:id',
  requireAuth,
  requireRole(...ROLES_NIVEL_ADMIN),
  asyncHandler(async (req, res) => {
    const campos = [];
    const valores = [];
    let i = 1;
    for (const [campo, columna] of Object.entries(MAPA_COLUMNAS)) {
      if (req.body[campo] !== undefined) {
        campos.push(`${columna} = $${i++}`);
        valores.push(req.body[campo]);
      }
    }
    if (campos.length === 0) throw badRequest('No se envió ningún campo para actualizar.');
    campos.push('updated_at = now()');
    valores.push(req.params.id);

    try {
      const { rows } = await query(
        `UPDATE locations SET ${campos.join(', ')} WHERE id = $${i} RETURNING *`,
        valores
      );
      if (!rows[0]) throw notFound('Ubicación no encontrada.');
      res.json({ location: rows[0] });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// --- Hilo de comentarios (pestaña "Discussion") ---

router.get(
  '/:id/comentarios',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT lc.*, u.nombre AS usuario_nombre FROM location_comments lc
       JOIN usuarios u ON u.id = lc.usuario_id
       WHERE lc.location_id = $1 ORDER BY lc.created_at ASC`,
      [req.params.id]
    );
    res.json({ comentarios: rows });
  })
);

router.post(
  '/:id/comentarios',
  requireAuth,
  asyncHandler(async (req, res) => {
    const comentario = ((req.body || {}).comentario || '').trim();
    if (!comentario) throw badRequest('El comentario no puede estar vacío.');
    const { rows } = await query(
      `INSERT INTO location_comments (location_id, usuario_id, comentario) VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, req.usuario.id, comentario]
    );
    res.status(201).json({ comentario: { ...rows[0], usuario_nombre: req.usuario.nombre } });
  })
);

module.exports = router;
