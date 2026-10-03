// Corrección puntual (una sola vez): de los 51 contratos de franquicia cargados, solo un
// puñado son clubes genuinamente nuevos (ver crear-franquicias-lote-2026.ps1). De esos:
//   - Cuatro Caminos ya abrió el 30 de mayo de 2026 -> se marca abierto con esa fecha real.
//   - Escobedo, Izazaga y Melt Polanco todavía NO abren -> se dejan en false (sin fecha).
// Todo lo demás (el resto del portafolio histórico) ya estaba operando desde hace años, pero
// no tenemos capturada la fecha real en que cada uno abrió. Mientras Jair confirma club por
// club (a mano desde el expediente, o con un Excel que entregue más adelante), se les pone una
// fecha TENTATIVA: fecha_limite_apertura menos 7 días (es decir, "abrió una semana antes de su
// fecha límite"). Es solo un valor de partida razonable, no un hecho verificado.
//
// La columna club_abierto (ver migration_franquicia_club_abierto.sql) se agrega con
// DEFAULT true a propósito -- cubre automáticamente a todo el histórico. Este script solo:
//   1) voltea a false los 3 clubes de la lista que de verdad no han abierto;
//   2) marca Cuatro Caminos como abierto con su fecha real;
//   3) rellena fecha_apertura tentativa (fecha_limite_apertura - 7 días) para todos los demás
//      contratos de franquicia que sigan con club_abierto = true y sin fecha_apertura capturada.
//
// Ejecutar UNA vez con:
//   node prisma/marcar_clubes_no_abiertos.js
// Seguro de correr más de una vez: si ya tienen valor, simplemente no los vuelve a tocar
// (los WHERE excluyen filas que ya tienen fecha_apertura o que ya están en false).

require('dotenv').config();
const { Client } = require('pg');

// Nombres EXACTOS tal como quedaron en el catálogo de clubes (ver crear-franquicias-lote-2026.ps1).
const CLUB_ABIERTO_CON_FECHA = {
  'Cuatro Caminos, EDO MEX': '2026-05-30',
};
const CLUBES_NO_ABIERTOS = [
  'Escobedo (Av. Las Torres), NLE',
  'Izazaga, CDMX',
  'Melt Polanco, CDMX',
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log(`Corrigiendo aperturas de franquicia contra ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')} ...`);

  try {
    // 1) Clubes nuevos que ya abrieron, con su fecha real.
    for (const [nombre, fecha] of Object.entries(CLUB_ABIERTO_CON_FECHA)) {
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

    // 2) Clubes nuevos que todavia NO abren.
    const { rows: noAbiertos } = await client.query(
      `UPDATE contrato_franquicia_detalles fd
       SET club_abierto = false, fecha_apertura = NULL, updated_at = now()
       FROM clubes cl
       WHERE fd.club_id = cl.id AND cl.nombre = ANY($1::text[])
       RETURNING cl.nombre`,
      [CLUBES_NO_ABIERTOS]
    );
    console.log(`Marcados como aun no abiertos (${noAbiertos.length} de ${CLUBES_NO_ABIERTOS.length} esperados):`);
    for (const r of noAbiertos) console.log(`  - ${r.nombre}`);
    const encontrados = new Set(noAbiertos.map((r) => r.nombre));
    const faltantes = CLUBES_NO_ABIERTOS.filter((n) => !encontrados.has(n));
    if (faltantes.length) {
      console.warn('No se encontraron (revisar nombre exacto en el catalogo de clubes):');
      for (const n of faltantes) console.warn(`  - ${n}`);
    }

    // 3) Resto del historico: fecha de apertura TENTATIVA = fecha limite de apertura - 7 dias,
    //    solo para los que siguen marcados como abiertos y aun no tienen fecha capturada.
    const { rows: tentativos } = await client.query(
      `UPDATE contrato_franquicia_detalles fd
       SET fecha_apertura = fd.fecha_limite_apertura - INTERVAL '7 days', updated_at = now()
       WHERE fd.club_abierto = true
         AND fd.fecha_apertura IS NULL
         AND fd.fecha_limite_apertura IS NOT NULL
       RETURNING fd.contrato_id`
    );
    console.log(`Fecha de apertura tentativa (limite - 7 dias) asignada a ${tentativos.length} contratos del historico.`);
    console.log('Esas fechas son tentativas: hay que confirmarlas club por club con la fecha real.');
  } catch (err) {
    console.error('Error al corregir aperturas de franquicia:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
