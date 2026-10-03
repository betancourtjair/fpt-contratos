// Corrección de datos (una sola vez): los Franchise Agreement históricos que se cargaron en
// bloque (ver backend/prisma/ y los scripts de PowerShell que los subieron) se subieron con
// categoria = 'version_firmada' en vez de 'firmado_manual'. Eso hace que
// FirmaContratoBadge (ver frontend/src/components/FirmaContratoBadge.jsx y SQL_FIRMADO en
// backend/src/routes/contratos.js) los muestre como "Pendiente de firma", cuando en realidad
// SÍ están firmados -- se firman a mano, se escanean y se suben, según confirmó el negocio.
//
// Este script recategoriza a 'firmado_manual' el documento 'version_firmada' de cada contrato
// de franquicia que todavía no tenga ninguna prueba de firma (ni Documenso ni firmado_manual).
// No toca los 4 clubes que se quedaron sin PDF cargado (Glorieta, El Refugio, Andamar,
// Tlatelolco): esos simplemente no tienen ningún documento 'version_firmada' que recategorizar,
// así que correctamente siguen viéndose como "Pendiente de firma" hasta que se resuelva con
// Jurídico/IT.
//
// Ejecutar UNA vez con:
//   node prisma/marcar_franquicias_firmadas.js
// Es seguro volver a correrlo: la segunda vez no encuentra documentos 'version_firmada'
// pendientes de recategorizar (ya quedaron en 'firmado_manual') y no hace nada.

require('dotenv').config();
const { Client } = require('pg');

const SQL = `
  UPDATE contrato_documentos cd
  SET categoria = 'firmado_manual'
  FROM contratos c
  JOIN tipos_contrato tc ON tc.id = c.tipo_contrato_id
  WHERE cd.contrato_id = c.id
    AND tc.es_franquicia = true
    AND cd.categoria = 'version_firmada'
    AND NOT EXISTS (
      SELECT 1 FROM contrato_documentos cd2
      WHERE cd2.contrato_id = cd.contrato_id
        AND (cd2.documenso_firmado_en IS NOT NULL OR cd2.categoria = 'firmado_manual')
    )
  RETURNING cd.contrato_id, c.folio;
`;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log(`Corrigiendo categoria de documentos de franquicia contra ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')} ...`);

  try {
    const { rows } = await client.query(SQL);
    if (rows.length === 0) {
      console.log('Nada que corregir (ya estaban bien, o ya se habia corrido este script antes).');
    } else {
      console.log(`Recategorizados ${rows.length} documentos a 'firmado_manual' (ahora se veran como "Firmado"):`);
      for (const r of rows) console.log(`  - ${r.folio}`);
    }
  } catch (err) {
    console.error('Error al corregir la categoria de documentos de franquicia:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
