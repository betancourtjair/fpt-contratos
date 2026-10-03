// Correccion puntual con fechas reales confirmadas por Jair (2026-10-03):
//   - Gransur, CDMX: abrio el 29 de diciembre de 2026.
//   - Multiplaza Las Palmas, GRO: abrio el 29 de diciembre de 2026.
// (Oaxaca (Col del Maestro), Playa del Carmen (Mision las Flores) y Saltillo (Echeverria)
// siguen SIN abrir -- esos ya quedan en false con corregir_fechas_futuras.js, no necesitan
// nada aqui.)
//
// IMPORTANTE: este script debe correrse DESPUES de corregir_fechas_futuras.js. Ese script
// marca como no-abiertos a todos los clubes con fecha limite en el futuro (incluyendo estos
// 2), y este lo vuelve a abrir explicitamente con la fecha real que ya se confirmo. Si se
// corre en el orden contrario, corregir_fechas_futuras.js deshace esta correccion.
//
// Ejecutar con (en este orden):
//   node prisma/corregir_fechas_futuras.js
//   node prisma/marcar_aperturas_confirmadas.js
// Seguro de correr mas de una vez.

require('dotenv').config();
const { Client } = require('pg');

const APERTURAS_CONFIRMADAS = {
  'Gransur, CDMX': '2026-12-29',
  'Multiplaza Las Palmas, GRO': '2026-12-29',
};

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log(`Marcando aperturas confirmadas contra ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')} ...\n`);

  try {
    for (const [nombre, fecha] of Object.entries(APERTURAS_CONFIRMADAS)) {
      const { rows } = await client.query(
        `UPDATE contrato_franquicia_detalles fd
         SET club_abierto = true, fecha_apertura = $2, updated_at = now()
         FROM clubes cl
         WHERE fd.club_id = cl.id AND cl.nombre = $1
         RETURNING cl.nombre`,
        [nombre, fecha]
      );
      if (rows.length) console.log(`Marcado como abierto (${fecha}): ${nombre}`);
      else console.warn(`No se encontro (revisar nombre exacto en el catalogo de clubes): ${nombre}`);
    }
  } catch (err) {
    console.error('Error al marcar aperturas confirmadas:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
