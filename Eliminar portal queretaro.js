// eliminar_portal_queretaro.js
// Elimina el contrato CT-2026-0012 (Portal Queretaro, QRO) y su club del catalogo.
// Portal Queretaro ya no existe: el club se cambio de ubicacion a Tlatelolco (Primera
// Enmienda al FA #4358, efectiva 4-may-2023). Esa informacion se carga en CT-2026-0056.
//
// Correr DESPUES de completar-tlatelolco.ps1. Se niega a borrar si Tlatelolco todavia no
// tiene el expediente del FA #4358 cargado.
//
// Colocar este archivo en backend/prisma y correr desde backend/ (con .env de produccion):
//   node prisma/eliminar_portal_queretaro.js
// Borra el .env local al terminar. No hacer commit de este archivo (es de un solo uso).

require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log(`Conectado a ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')}\n`);
  try {
    await client.query('BEGIN');

    const { rows: tlat } = await client.query(
      `SELECT folio, titulo FROM contratos WHERE folio = 'CT-2026-0056'`
    );
    if (!tlat.length || !String(tlat[0].titulo).includes('4358')) {
      throw new Error('CT-2026-0056 (Tlatelolco) todavia no tiene el expediente del FA #4358. Corre primero completar-tlatelolco.ps1.');
    }

    const { rows } = await client.query(
      `SELECT c.id AS contrato_id, c.folio, cl.id AS club_id, cl.nombre
       FROM contratos c
       JOIN contrato_franquicia_detalles fd ON fd.contrato_id = c.id
       JOIN clubes cl ON cl.id = fd.club_id
       WHERE c.folio = 'CT-2026-0012' AND cl.nombre = 'Portal Queretaro, QRO'`
    );
    if (!rows.length) throw new Error('No se encontro CT-2026-0012 / Portal Queretaro, QRO (quiza ya se elimino).');
    const { contrato_id, club_id, folio, nombre } = rows[0];

    const { rows: docs } = await client.query(
      'SELECT COUNT(*)::int AS n FROM contrato_documentos WHERE contrato_id = $1', [contrato_id]
    );
    console.log(`Se eliminara ${folio} - ${nombre} (${docs[0].n} documento(s) registrados).`);

    await client.query('DELETE FROM audit_logs WHERE contrato_id = $1', [contrato_id]);
    await client.query('DELETE FROM contratos WHERE id = $1', [contrato_id]);
    console.log('Contrato eliminado.');

    await client.query('SAVEPOINT club');
    try {
      await client.query('DELETE FROM clubes WHERE id = $1', [club_id]);
      console.log('Club eliminado del catalogo.');
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT club');
      await client.query('UPDATE clubes SET activo = false WHERE id = $1', [club_id]);
      console.log(`El club tiene otras referencias (${err.message}); se desactivo en vez de eliminarlo.`);
    }

    await client.query('COMMIT');
    console.log('\nListo.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error, no se cambio nada:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
main();