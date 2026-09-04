// Generación de folio único autoincremental por año, ej. "CT-2026-0001".
// Debe llamarse dentro de una transacción (recibe el `client`), usando un advisory lock
// para evitar folios duplicados ante inserts concurrentes.

async function generarFolio(client, año = new Date().getFullYear()) {
  // Advisory lock específico del año, se libera automáticamente al terminar la transacción.
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`folio-contrato-${año}`]);

  const prefijo = `CT-${año}-`;
  const { rows } = await client.query(
    `SELECT folio FROM contratos WHERE folio LIKE $1 ORDER BY folio DESC LIMIT 1`,
    [`${prefijo}%`]
  );

  let siguiente = 1;
  if (rows.length > 0) {
    const ultimoFolio = rows[0].folio;
    const numero = parseInt(ultimoFolio.slice(prefijo.length), 10);
    if (!Number.isNaN(numero)) siguiente = numero + 1;
  }

  return `${prefijo}${String(siguiente).padStart(4, '0')}`;
}

module.exports = { generarFolio };
