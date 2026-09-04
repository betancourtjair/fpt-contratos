// Capa de acceso a datos. NO se usa Prisma Client en runtime (la descarga del query
// engine binario está bloqueada en este entorno); en su lugar usamos `pg` (node-postgres)
// con SQL parametrizado. prisma/schema.prisma se conserva solo como documentación del modelo.

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  // Un error en un cliente inactivo del pool no debe tumbar el proceso.
  console.error('Error inesperado en el pool de Postgres:', err);
});

/**
 * Ejecuta una consulta parametrizada contra el pool.
 * @param {string} text
 * @param {Array<any>} [params]
 */
function query(text, params) {
  return pool.query(text, params);
}

/**
 * Obtiene un cliente dedicado del pool para ejecutar una transacción.
 * Uso:
 *   const client = await getClient();
 *   try {
 *     await client.query('BEGIN');
 *     ...
 *     await client.query('COMMIT');
 *   } catch (e) {
 *     await client.query('ROLLBACK');
 *     throw e;
 *   } finally {
 *     client.release();
 *   }
 */
async function getClient() {
  const client = await pool.connect();
  return client;
}

/**
 * Ejecuta `fn(client)` dentro de una transacción, con BEGIN/COMMIT/ROLLBACK automáticos.
 * @param {(client: import('pg').PoolClient) => Promise<any>} fn
 */
async function withTransaction(fn) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Error al hacer ROLLBACK:', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, getClient, withTransaction };
