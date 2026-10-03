// Aplica prisma/migration_franquicia_club_abierto.sql (columna club_abierto en
// contrato_franquicia_detalles) contra la base de datos de DATABASE_URL. Ejecutar con:
//   node prisma/migrate_franquicia_club_abierto.js
//
// Se corre UNA vez. Seguro de correr más de una vez sobre una base ya migrada: el ALTER TABLE
// truena si la columna ya existe, así que en ese caso el script avisa y no revierte nada.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const schemaPath = path.join(__dirname, 'migration_franquicia_club_abierto.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log(`Aplicando ${schemaPath} contra ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')} ...`);

  try {
    await client.query(sql);
    console.log('Columna club_abierto aplicada correctamente (default true para todo lo existente).');
  } catch (err) {
    console.error('Error al aplicar la columna club_abierto:', err.message);
    console.error('Si el error es "ya existe" (columna duplicada), probablemente ya migraste antes; revisa a mano si falta algo.');
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
