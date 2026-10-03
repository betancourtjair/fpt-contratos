// Aplica prisma/migration_franquicia_alertas.sql (destinatarios configurables de alertas de
// Franquicias) contra la base de datos de DATABASE_URL. Ejecutar con:
//   node prisma/migrate_franquicia_alertas.js
//
// Se corre UNA vez, después de que prisma/migration.sql ya esté aplicado (reusa la tabla
// `usuarios` existente). Es seguro correrlo más de una vez sobre una base ya migrada: el
// CREATE TABLE truena si la tabla ya existe, así que en ese caso el script avisa y no revierte
// nada (no hace DROP de nada).

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const schemaPath = path.join(__dirname, 'migration_franquicia_alertas.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log(`Aplicando ${schemaPath} contra ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')} ...`);

  try {
    await client.query(sql);
    console.log('Esquema de destinatarios de alertas de Franquicias aplicado correctamente.');
  } catch (err) {
    console.error('Error al aplicar el esquema de destinatarios de alertas de Franquicias:', err.message);
    console.error('Si el error es "ya existe" (tabla duplicada), probablemente ya migraste antes; revisa a mano si falta algo.');
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
