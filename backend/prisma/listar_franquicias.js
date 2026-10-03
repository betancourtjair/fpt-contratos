// Diagnostico (de solo lectura, no modifica nada): lista todos los contratos de franquicia
// con su club asociado (si tiene), club_abierto y fecha_apertura, para encontrar por que
// Escobedo/Izazaga/Melt Polanco no matchearon por nombre (ILIKE) ni antes por nombre exacto.
// Posibles causas a confirmar con esta lista:
//   - El nombre real en el catalogo de clubes es distinto al que se asumio.
//   - El contrato de franquicia todavia no tiene club_id asignado (NULL) -- common si el club
//     fisico (en construccion) ni siquiera esta dado de alta en el catalogo de clubes.
//
// Ejecutar con:
//   node prisma/listar_franquicias.js

require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log(`Listando contratos de franquicia contra ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')} ...\n`);

  try {
    const { rows } = await client.query(
      `SELECT c.folio, c.titulo, c.estatus, cl.nombre AS club_nombre, fd.club_id,
              fd.club_abierto, fd.fecha_apertura, fd.fecha_limite_apertura
       FROM contratos c
       JOIN tipos_contrato tc ON tc.id = c.tipo_contrato_id
       JOIN contrato_franquicia_detalles fd ON fd.contrato_id = c.id
       LEFT JOIN clubes cl ON cl.id = fd.club_id
       WHERE tc.es_franquicia = true
       ORDER BY cl.nombre NULLS FIRST, c.folio`
    );
    console.log(`Total de contratos de franquicia: ${rows.length}\n`);
    for (const r of rows) {
      console.log(
        `${r.folio} | club="${r.club_nombre ?? '(sin club_id)'}" | abierto=${r.club_abierto} | ` +
        `fecha_apertura=${r.fecha_apertura ?? 'null'} | fecha_limite=${r.fecha_limite_apertura ?? 'null'} | estatus=${r.estatus}`
      );
    }
  } catch (err) {
    console.error('Error al listar franquicias:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
