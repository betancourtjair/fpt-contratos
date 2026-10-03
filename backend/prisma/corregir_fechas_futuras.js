// Correccion de un bug del fix anterior (marcar_clubes_no_abiertos.js, paso 3): la fecha de
// apertura TENTATIVA (fecha_limite_apertura - 7 dias) se asigno a todos los contratos con
// club_abierto=true y fecha_apertura vacia, sin fijarse si fecha_limite_apertura ya habia
// pasado. Resultado: algunos clubes que genuinamente AUN NO ABREN (su fecha limite es en el
// futuro) quedaron marcados como "ya abiertos" con una fecha de apertura que tambien esta en
// el futuro (ver salida de listar_franquicias.js: Gransur, Multiplaza Las Palmas, Laureles,
// Oaxaca, Playa del Carmen, Saltillo Echeverria).
//
// Este script revierte eso: cualquier contrato de franquicia cuya fecha_limite_apertura sea
// posterior a hoy se marca como aun no abierto (club_abierto=false, fecha_apertura=NULL). No
// toca los que ya tienen una fecha de apertura confirmada a mano con fecha_limite en el pasado
// (esos siguen igual).
//
// Ejecutar con:
//   node prisma/corregir_fechas_futuras.js
// Seguro de correr mas de una vez: si ya estan en false, no los vuelve a tocar.

require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log(`Corrigiendo clubes con fecha limite futura contra ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')} ...\n`);

  try {
    const { rows } = await client.query(
      `UPDATE contrato_franquicia_detalles fd
       SET club_abierto = false, fecha_apertura = NULL, updated_at = now()
       FROM clubes cl
       WHERE fd.club_id = cl.id
         AND fd.club_abierto = true
         AND fd.fecha_limite_apertura IS NOT NULL
         AND fd.fecha_limite_apertura > CURRENT_DATE
       RETURNING cl.nombre, fd.fecha_limite_apertura`
    );
    console.log(`Corregidos ${rows.length} club(es) que tenian fecha limite futura y estaban marcados como ya abiertos:`);
    for (const r of rows) {
      console.log(`  - ${r.nombre} (fecha limite: ${r.fecha_limite_apertura.toISOString().slice(0, 10)})`);
    }
    if (!rows.length) {
      console.log('  (ninguno -- ya estaba corregido, o no hay clubes con fecha limite futura)');
    }
  } catch (err) {
    console.error('Error al corregir fechas futuras:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
