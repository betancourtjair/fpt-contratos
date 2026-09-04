// Seed inicial de FPT Contratos. Ejecutar con: node prisma/seed.js
// (No usa Prisma Client; solo vive bajo prisma/ por convención junto al schema/migración.)

require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { pool, withTransaction } = require('../src/db');

function generarPasswordAleatorio() {
  return crypto.randomBytes(9).toString('base64url'); // ~12 caracteres legibles
}

async function main() {
  const emailSuperAdmin = 'jair@fpt.com.mx';
  const passwordSuperAdmin = process.env.SEED_SUPERADMIN_PASSWORD || generarPasswordAleatorio();

  await withTransaction(async (client) => {
    // --- Usuario super_admin ---
    const { rows: existentes } = await client.query('SELECT id FROM usuarios WHERE email = $1', [emailSuperAdmin]);
    let superAdminId;
    if (existentes[0]) {
      superAdminId = existentes[0].id;
      console.log(`Usuario super_admin ${emailSuperAdmin} ya existe, no se modifica su password.`);
    } else {
      const hash = await bcrypt.hash(passwordSuperAdmin, 10);
      const { rows } = await client.query(
        `INSERT INTO usuarios (email, nombre, password_hash, rol)
         VALUES ($1, $2, $3, 'super_admin') RETURNING id`,
        [emailSuperAdmin, 'Jair (Super Admin)', hash]
      );
      superAdminId = rows[0].id;
      console.log(`Usuario super_admin creado: ${emailSuperAdmin}`);
      console.log(`Password temporal: ${passwordSuperAdmin}`);
      console.log('>>> Cámbiala después de tu primer login. <<<');
    }

    // --- Tipos de contrato típicos ---
    const tiposDeseados = [
      { nombre: 'Arrendamiento', descripcion: 'Contratos de renta de espacios para sucursales.' },
      { nombre: 'Proveedores', descripcion: 'Contratos con proveedores de bienes y servicios.' },
      { nombre: 'Confidencialidad (NDA)', descripcion: 'Acuerdos de confidencialidad.' },
      { nombre: 'Servicios Profesionales', descripcion: 'Contratación de servicios profesionales/consultoría.' },
    ];
    const tipoIdPorNombre = {};
    for (const tipo of tiposDeseados) {
      const { rows } = await client.query(
        `INSERT INTO tipos_contrato (nombre, descripcion)
         VALUES ($1, $2)
         ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion
         RETURNING id, nombre`,
        [tipo.nombre, tipo.descripcion]
      );
      tipoIdPorNombre[rows[0].nombre] = rows[0].id;
    }
    console.log(`Tipos de contrato listos: ${Object.keys(tipoIdPorNombre).join(', ')}`);

    // --- Plantilla de flujo default (tipo_contrato_id NULL) ---
    let plantillaDefaultId;
    const { rows: defaultExistente } = await client.query(
      `SELECT id FROM flujo_plantillas WHERE tipo_contrato_id IS NULL AND nombre = $1`,
      ['Flujo default']
    );
    if (defaultExistente[0]) {
      plantillaDefaultId = defaultExistente[0].id;
      console.log('Plantilla de flujo default ya existe, no se recrea.');
    } else {
      const { rows } = await client.query(
        `INSERT INTO flujo_plantillas (nombre, tipo_contrato_id) VALUES ($1, NULL) RETURNING id`,
        ['Flujo default']
      );
      plantillaDefaultId = rows[0].id;
      await client.query(
        `INSERT INTO flujo_pasos (plantilla_id, orden, nombre, rol_aprobador, obligatorio)
         VALUES ($1, 1, 'Revisión Jurídica', 'juridico', true)`,
        [plantillaDefaultId]
      );
      await client.query(
        `INSERT INTO flujo_pasos (plantilla_id, orden, nombre, rol_aprobador, monto_minimo, obligatorio)
         VALUES ($1, 2, 'Autorización Dirección (montos altos)', 'admin', 500000, true)`,
        [plantillaDefaultId]
      );
      console.log('Plantilla de flujo default creada con 2 pasos (juridico siempre; admin si monto >= 500,000).');
    }

    // --- Plantilla específica para Arrendamiento ---
    const tipoArrendamientoId = tipoIdPorNombre['Arrendamiento'];
    if (tipoArrendamientoId) {
      const { rows: arrendamientoExistente } = await client.query(
        `SELECT id FROM flujo_plantillas WHERE tipo_contrato_id = $1`,
        [tipoArrendamientoId]
      );
      if (arrendamientoExistente[0]) {
        console.log('Plantilla de flujo para Arrendamiento ya existe, no se recrea.');
      } else {
        const { rows } = await client.query(
          `INSERT INTO flujo_plantillas (nombre, tipo_contrato_id) VALUES ($1, $2) RETURNING id`,
          ['Flujo Arrendamiento', tipoArrendamientoId]
        );
        const plantillaArrendamientoId = rows[0].id;
        await client.query(
          `INSERT INTO flujo_pasos (plantilla_id, orden, nombre, rol_aprobador, obligatorio)
           VALUES ($1, 1, 'Revisión Jurídica', 'juridico', true)`,
          [plantillaArrendamientoId]
        );
        await client.query(
          `INSERT INTO flujo_pasos (plantilla_id, orden, nombre, rol_aprobador, obligatorio)
           VALUES ($1, 2, 'Autorización Dirección', 'admin', true)`,
          [plantillaArrendamientoId]
        );
        console.log('Plantilla de flujo específica para Arrendamiento creada con 2 pasos (juridico, luego admin, siempre).');
      }
    }
  });

  console.log('\nSeed completado.');
}

main()
  .catch((err) => {
    console.error('Error ejecutando el seed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
