const express = require('express');
const { query } = require('../../db');
const asyncHandler = require('../../utils/asyncHandler');
const { badRequest, notFound, traducirErrorPostgres } = require('../../utils/errors');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { ROLES_NIVEL_ADMIN } = require('../../utils/roles');

const router = express.Router();

// Campos editables de `leases` expuestos en camelCase -> columna real. Ver prisma/schema.sql
// para el detalle de cada uno (fechas, renovación, landlord, pagos, COI, percent rent).
const MAPA_COLUMNAS = {
  tenantCompanyId: 'tenant_company_id', leaseName: 'lease_name', leaseType: 'lease_type',
  isSubLease: 'is_sub_lease', estatus: 'estatus', acquisitionType: 'acquisition_type',
  leaseClassification: 'lease_classification',
  leaseCommencementDate: 'lease_commencement_date', rentCommencementDate: 'rent_commencement_date',
  possessionDate: 'possession_date', deliveryDate: 'delivery_date', expirationDate: 'expiration_date',
  expirationDateIncludingOptions: 'expiration_date_including_options',
  isMonthToMonth: 'is_month_to_month', monthToMonthExpDate: 'month_to_month_exp_date',
  numberOfOptions: 'number_of_options', eachOptionYears: 'each_option_years',
  remainingOptions: 'remaining_options', remainingOptionsYears: 'remaining_options_years',
  renewalNoticePeriodStart: 'renewal_notice_period_start',
  renewalNoticeEarliestSubmissionDate: 'renewal_notice_earliest_submission_date',
  renewalNoticePeriodEnd: 'renewal_notice_period_end', renewalNoticeDeadline: 'renewal_notice_deadline',
  renewalNoticeIntention: 'renewal_notice_intention', lengthOfLeaseMonths: 'length_of_lease_months',
  landlordNombre: 'landlord_nombre', landlordParentCompany: 'landlord_parent_company',
  landlordVendorId: 'landlord_vendor_id', landlordAddress1: 'landlord_address1',
  landlordAddress2: 'landlord_address2', landlordCity: 'landlord_city', landlordState: 'landlord_state',
  landlordZip: 'landlord_zip', landlordCountry: 'landlord_country',
  landlordPocNombre: 'landlord_poc_nombre', landlordPocTelefono: 'landlord_poc_telefono',
  landlordPocEmail: 'landlord_poc_email',
  gracePeriodDias: 'grace_period_dias', lateFeeType: 'late_fee_type', lateFeeMonto: 'late_fee_monto',
  securityDeposit: 'security_deposit', rentalPrepayments: 'rental_prepayments',
  rentalPrepaymentsDetalle: 'rental_prepayments_detalle', initialDirectCosts: 'initial_direct_costs',
  noticeAddress: 'notice_address', paymentMethod: 'payment_method', paymentAddress: 'payment_address',
  remainingLeaseLiability: 'remaining_lease_liability',
  coiEffectiveDate: 'coi_effective_date', coiExpirationDate: 'coi_expiration_date',
  percentRentYn: 'percent_rent_yn', percentRentPaymentDate: 'percent_rent_payment_date',
  percentRentMonthStart: 'percent_rent_month_start', percentRentMonthEnd: 'percent_rent_month_end',
  percentRentSales: 'percent_rent_sales', percentRentBreakpoints: 'percent_rent_breakpoints',
  percentRentOverageSales: 'percent_rent_overage_sales', miscLeaseDetails: 'misc_lease_details',
};

function construirSet(body, mapa, incluirLocationId) {
  const campos = [];
  const valores = [];
  let i = 1;
  if (incluirLocationId && body.locationId !== undefined) {
    campos.push(`location_id = $${i++}`);
    valores.push(body.locationId);
  }
  for (const [campo, columna] of Object.entries(mapa)) {
    if (body[campo] !== undefined) {
      campos.push(`${columna} = $${i++}`);
      valores.push(body[campo]);
    }
  }
  return { campos, valores, siguiente: i };
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(`
      SELECT le.*, l.nombre AS location_nombre, c.nombre AS tenant_company_nombre
      FROM leases le
      JOIN locations l ON l.id = le.location_id
      LEFT JOIN companies c ON c.id = le.tenant_company_id
      ORDER BY le.expiration_date DESC NULLS LAST
    `);
    res.json({ leases: rows });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(`
      SELECT le.*, l.nombre AS location_nombre, c.nombre AS tenant_company_nombre
      FROM leases le
      JOIN locations l ON l.id = le.location_id
      LEFT JOIN companies c ON c.id = le.tenant_company_id
      WHERE le.id = $1
    `, [req.params.id]);
    const lease = rows[0];
    if (!lease) throw notFound('Lease no encontrado.');

    const [rentSchedule, oneTimePayments, taxSchedule, criticalClauses, notes] = await Promise.all([
      query('SELECT * FROM lease_rent_schedule WHERE lease_id = $1 ORDER BY start_date ASC', [req.params.id]),
      query('SELECT * FROM lease_one_time_payments WHERE lease_id = $1 ORDER BY due_date ASC', [req.params.id]),
      query('SELECT * FROM lease_tax_schedule WHERE lease_id = $1 ORDER BY start_date ASC', [req.params.id]),
      query('SELECT * FROM lease_critical_clauses WHERE lease_id = $1 ORDER BY created_at ASC', [req.params.id]),
      query('SELECT * FROM lease_notes WHERE lease_id = $1 ORDER BY COALESCE(fecha_nota, created_at) DESC', [req.params.id]),
    ]);

    res.json({
      lease,
      rentSchedule: rentSchedule.rows,
      oneTimePayments: oneTimePayments.rows,
      taxSchedule: taxSchedule.rows,
      criticalClauses: criticalClauses.rows,
      notes: notes.rows,
    });
  })
);

router.post(
  '/',
  requireAuth,
  requireRole(...ROLES_NIVEL_ADMIN),
  asyncHandler(async (req, res) => {
    const { locationId } = req.body || {};
    if (!locationId) throw badRequest('locationId es requerido.');
    const { campos, valores } = construirSet(req.body, MAPA_COLUMNAS, false);
    const columnas = ['location_id', ...campos.map((c) => c.split(' = ')[0])];
    const placeholders = ['$1', ...valores.map((_, idx) => `$${idx + 2}`)];
    try {
      const { rows } = await query(
        `INSERT INTO leases (${columnas.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        [locationId, ...valores]
      );
      res.status(201).json({ lease: rows[0] });
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
    const { campos, valores, siguiente } = construirSet(req.body, MAPA_COLUMNAS, true);
    if (campos.length === 0) throw badRequest('No se envió ningún campo para actualizar.');
    campos.push('updated_at = now()');
    valores.push(req.params.id);

    try {
      const { rows } = await query(
        `UPDATE leases SET ${campos.join(', ')} WHERE id = $${siguiente} RETURNING *`,
        valores
      );
      if (!rows[0]) throw notFound('Lease no encontrado.');
      res.json({ lease: rows[0] });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// --- Calendario de renta ---
router.post(
  '/:id/rent-schedule',
  requireAuth,
  requireRole(...ROLES_NIVEL_ADMIN),
  asyncHandler(async (req, res) => {
    const { categoria, startDate, endDate, monto, frecuencia, dueDate, proration, payee, pctChange, montoPorSqm, nota } = req.body || {};
    if (!startDate || monto === undefined) throw badRequest('startDate y monto son requeridos.');
    const { rows } = await query(
      `INSERT INTO lease_rent_schedule
        (lease_id, categoria, start_date, end_date, monto, frecuencia, due_date, proration, payee, pct_change, monto_por_sqm, nota)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.params.id, categoria || 'Base Rent', startDate, endDate || null, monto, frecuencia || 'Monthly',
       dueDate || null, proration || null, payee || null, pctChange ?? null, montoPorSqm ?? null, nota || null]
    );
    res.status(201).json({ item: rows[0] });
  })
);

router.delete(
  '/rent-schedule/:itemId',
  requireAuth,
  requireRole(...ROLES_NIVEL_ADMIN),
  asyncHandler(async (req, res) => {
    await query('DELETE FROM lease_rent_schedule WHERE id = $1', [req.params.itemId]);
    res.status(204).end();
  })
);

// --- Cláusulas críticas ---
router.post(
  '/:id/critical-clauses',
  requireAuth,
  requireRole(...ROLES_NIVEL_ADMIN),
  asyncHandler(async (req, res) => {
    const { clauseType, pageNumber, sectionNumber, leaseDocumentHeader, aiSummary, originalLanguage, leaseIsSilent } = req.body || {};
    if (!clauseType) throw badRequest('clauseType es requerido.');
    const { rows } = await query(
      `INSERT INTO lease_critical_clauses
        (lease_id, clause_type, page_number, section_number, lease_document_header, ai_summary, original_language, lease_is_silent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.id, clauseType, pageNumber || null, sectionNumber || null, leaseDocumentHeader || null,
       aiSummary || null, originalLanguage || null, !!leaseIsSilent]
    );
    res.status(201).json({ item: rows[0] });
  })
);

// --- Notas ---
router.post(
  '/:id/notes',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { titulo, nota, fechaNota } = req.body || {};
    if (!nota) throw badRequest('nota es requerida.');
    const { rows } = await query(
      `INSERT INTO lease_notes (lease_id, titulo, nota, autor_usuario_id, autor_nombre, fecha_nota)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, titulo || null, nota, req.usuario.id, req.usuario.nombre, fechaNota || new Date()]
    );
    res.status(201).json({ item: rows[0] });
  })
);

module.exports = router;
