// Da de alta 4 contratos de franquicia que faltaban en la plataforma, aunque los clubes ya
// estan abiertos segun https://directorio.fpt.com.mx/ (fuente oficial de Operaciones):
//   - Tlatelolco, Andamar y Glorieta: son 3 de los 4 clubes que quedaron pendientes de
//     validacion con Juridico (se les mando correo de validacion). Jair decidio (2026-10-03)
//     darlos de alta ya mismo con datos basicos, para que el dashboard cuadre con el
//     directorio, en vez de esperar a que Juridico termine de validar.
//   - Cuatro Caminos: club nuevo (abrio 28-may-2026) cuyo contrato nunca se creo.
//
// IMPORTANTE: esto crea un contrato con datos MINIMOS/PLACEHOLDER (contraparte generica,
// sin monto, sin documentos). Sirve para que el club cuente correctamente en el dashboard de
// Franquicias, pero el expediente sigue incompleto -- hay que entrar a cada uno desde
// Contratos/Franquicias y completar contraparte real, términos financieros, documento firmado,
// etc. cuando Juridico termine de validarlos.
//
// Seguro de correr mas de una vez: si el contrato ya existe (mismo club con tipo franquicia),
// no lo duplica.
//
// Ejecutar con:
//   node prisma/crear_contratos_faltantes.js

require('dotenv').config();
const { Client } = require('pg');

// nombre a usar en el catalogo de clubes (se crea si no existe) -> datos del contrato.
const CLUBES_FALTANTES = [
  { nombre: 'Tlatelolco, CDMX', fechaApertura: '2023-02-09' },
  { nombre: 'Andamar, VER', fechaApertura: '2024-12-21' },
  { nombre: 'Glorieta, SLP', fechaApertura: '2024-12-31' },
  { nombre: 'Cuatro Caminos, EDO MEX', fechaApertura: '2026-05-28' },
];

const PARTE_FPT = 'Fitness para todos, S. de R.L. de C.V.';

async function generarFolio(client, anio = new Date().getFullYear()) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`folio-contrato-${anio}`]);
  const prefijo = `CT-${anio}-`;
  const { rows } = await client.query(
    `SELECT folio FROM contratos WHERE folio LIKE $1 ORDER BY folio DESC LIMIT 1`,
    [`${prefijo}%`]
  );
  let siguiente = 1;
  if (rows.length > 0) {
    const numero = parseInt(rows[0].folio.slice(prefijo.length), 10);
    if (!Number.isNaN(numero)) siguiente = numero + 1;
  }
  return `${prefijo}${String(siguiente).padStart(4, '0')}`;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log(`Creando contratos faltantes contra ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')} ...\n`);

  try {
    const { rows: tipoRows } = await client.query(
      `SELECT id FROM tipos_contrato WHERE es_franquicia = true LIMIT 1`
    );
    if (!tipoRows.length) throw new Error('No se encontro un tipo_contrato con es_franquicia = true.');
    const tipoContratoId = tipoRows[0].id;

    const { rows: userRows } = await client.query(
      `SELECT id FROM usuarios WHERE email = 'jair@fpt.com.mx' LIMIT 1`
    );
    if (!userRows.length) throw new Error('No se encontro el usuario jair@fpt.com.mx para asignar como solicitante.');
    const solicitadoPorId = userRows[0].id;

    for (const { nombre, fechaApertura } of CLUBES_FALTANTES) {
      await client.query('BEGIN');
      try {
        // 1) Club: usar el existente si ya esta en el catalogo, o crearlo.
        let { rows: clubRows } = await client.query('SELECT id FROM clubes WHERE nombre = $1', [nombre]);
        let clubId;
        if (clubRows.length) {
          clubId = clubRows[0].id;
        } else {
          const { rows: nuevoClub } = await client.query(
            'INSERT INTO clubes (nombre) VALUES ($1) RETURNING id',
            [nombre]
          );
          clubId = nuevoClub[0].id;
          console.log(`Club creado en el catalogo: ${nombre}`);
        }

        // 2) Si ya existe un contrato de franquicia para este club, no duplicar.
        const { rows: existente } = await client.query(
          `SELECT c.folio FROM contratos c
           JOIN contrato_franquicia_detalles fd ON fd.contrato_id = c.id
           WHERE fd.club_id = $1`,
          [clubId]
        );
        if (existente.length) {
          console.log(`Ya existe contrato para ${nombre} (${existente[0].folio}), no se duplica.`);
          await client.query('ROLLBACK');
          continue;
        }

        // 3) Crear el contrato (placeholder, estatus activo -- igual que el resto de
        //    franquicias, que no pasan por flujo de autorizacion).
        const folio = await generarFolio(client);
        const { rows: contratoRows } = await client.query(
          `INSERT INTO contratos
             (folio, titulo, descripcion, tipo_contrato_id, parte, contraparte_nombre,
              fecha_inicio, estatus, solicitado_por_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'activo',$8)
           RETURNING id, folio`,
          [
            folio,
            `Contrato de Franquicia - ${nombre}`,
            'Alta con datos basicos (club ya abierto segun directorio.fpt.com.mx); expediente ' +
              'pendiente de completar: contraparte real, terminos financieros y documento firmado.',
            tipoContratoId,
            PARTE_FPT,
            `Franquiciatario de ${nombre} (pendiente de completar expediente)`,
            fechaApertura,
            solicitadoPorId,
          ]
        );
        const contrato = contratoRows[0];

        // 4) Datos de franquicia: club, ya abierto, con su fecha real.
        await client.query(
          `INSERT INTO contrato_franquicia_detalles (contrato_id, club_id, club_abierto, fecha_apertura)
           VALUES ($1,$2,true,$3)`,
          [contrato.id, clubId, fechaApertura]
        );

        await client.query('COMMIT');
        console.log(`Creado: ${contrato.folio} - ${nombre} (apertura ${fechaApertura})`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error al crear contrato para ${nombre}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Error general:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
