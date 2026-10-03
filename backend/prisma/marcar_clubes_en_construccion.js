// Corrección puntual (seguimiento a marcar_clubes_no_abiertos.js): Escobedo, Izazaga y Melt
// Polanco siguen en construcción, pero el primer script no los encontró (probablemente el
// nombre exacto en el catalogo de clubes no coincidia caracter por caracter con el de la
// lista), asi que se quedaron con club_abierto = true (el default). Este script los busca por
// coincidencia parcial (ILIKE) en vez de nombre exacto, para no fallar otra vez por un acento,
// espacio o abreviatura distinta, y los marca como aun no abiertos.
//
// Ejecutar con:
//   node prisma/marcar_clubes_en_construccion.js
// Seguro de correr mas de una vez.

require('dotenv').config();
const { Client } = require('pg');

// Patrones de busqueda (parcial, insensible a mayusculas/acentos no garantizado por ILIKE puro,
// pero cubre el caso comun de que el nombre completo no coincidia exacto).
const PATRONES = ['%escobedo%', '%izazaga%', '%melt%'];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log(`Corrigiendo clubes en construccion contra ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')} ...`);

  try {
    // 1) Mostrar que clubes de franquicia matchean los patrones, con su estado actual, antes de tocar nada.
    const { rows: candidatos } = await client.query(
      `SELECT cl.id, cl.nombre, fd.club_abierto, fd.fecha_apertura
       FROM clubes cl
       JOIN contrato_franquicia_detalles fd ON fd.club_id = cl.id
       WHERE cl.nombre ILIKE ANY($1::text[])
       ORDER BY cl.nombre`,
      [PATRONES]
    );
    console.log(`Encontrados ${candidatos.length} club(es) que matchean escobedo/izazaga/melt:`);
    for (const c of candidatos) {
      console.log(`  - ${c.nombre} | club_abierto=${c.club_abierto} | fecha_apertura=${c.fecha_apertura ?? 'null'}`);
    }

    if (!candidatos.length) {
      console.warn('No se encontro ningun club con esos patrones. Revisa el nombre exacto en el catalogo de clubes.');
      return;
    }

    // 2) Marcarlos como aun no abiertos (en construccion).
    const { rows: actualizados } = await client.query(
      `UPDATE contrato_franquicia_detalles fd
       SET club_abierto = false, fecha_apertura = NULL, updated_at = now()
       FROM clubes cl
       WHERE fd.club_id = cl.id AND cl.nombre ILIKE ANY($1::text[])
       RETURNING cl.nombre`,
      [PATRONES]
    );
    console.log(`Marcados como aun no abiertos (en construccion): ${actualizados.length}`);
    for (const r of actualizados) console.log(`  - ${r.nombre}`);
  } catch (err) {
    console.error('Error al corregir clubes en construccion:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
