// Aplica prisma/migration_arrendamientos.sql (módulo de Arrendamientos) contra la base de
// datos de DATABASE_URL. Ejecutar con:
//   node prisma/migrate_arrendamientos.js
//
// Se corre UNA vez, después de que prisma/migration.sql ya esté aplicado (reusa la tabla
// `usuarios` y el tipo `rol_usuario` existentes). Es seguro correrlo más de una vez sobre una
// base ya migrada: los CREATE TABLE/TYPE truenan si el objeto ya existe, así que en ese caso
// el script avisa y no revierte nada (no hace DROP de nada).

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const schemaPath = path.join(__dirname, 'migration_arrendamientos.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log(`Aplicando ${schemaPath} contra ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')} ...`);

  try {
    await client.query(sql);
    console.log('Esquema de Arrendamientos aplicado correctamente.');
  } catch (err) {
    console.error('Error al aplicar el esquema de Arrendamientos:', err.message);
    console.error('Si el error es "ya existe" (tabla/tipo duplicado), probablemente ya migraste antes; revisa a mano si falta algo.');
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
