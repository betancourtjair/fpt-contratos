// Aplica el modulo Operaciones: rol 'operaciones' + tablas de solicitudes y documentos.
//   node prisma/migrate_operaciones.js
// Seguro de correr mas de una vez (todo es IF NOT EXISTS).

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log(`Aplicando modulo Operaciones contra ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')} ...`);
  try {
    // El ALTER TYPE va solo (sin transaccion que use el valor nuevo).
    await client.query(`ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'operaciones'`);
    console.log("Rol 'operaciones' listo.");

    const sql = fs.readFileSync(path.join(__dirname, 'migration_operaciones.sql'), 'utf8');
    await client.query(sql);
    console.log('Tablas operaciones_solicitudes y operaciones_documentos listas.');
  } catch (err) {
    console.error('Error al aplicar la migracion de Operaciones:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
