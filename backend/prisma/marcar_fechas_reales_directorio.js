// Correccion masiva: reemplaza las fechas de apertura TENTATIVAS (fecha_limite_apertura - 7
// dias, asignadas por marcar_clubes_no_abiertos.js como aproximacion de partida) por las
// fechas REALES publicadas en https://directorio.fpt.com.mx/ (fuente oficial del area de
// Operaciones, con fecha de apertura real por club).
//
// Confirmado con Jair (2026-10-03): Gransur y Multiplaza Las Palmas (GRO) abrieron el
// 27-dic-2025 segun el directorio (no 29-dic-2026 como se habia dicho antes). Se usa la
// fecha del directorio para ambos.
//
// Clubes del directorio marcados "Por abrir" (El Refugio, Melt Polanco, Izazaga, Escobedo) NO
// estan en esta lista porque no existen todavia como contrato de franquicia en el sistema --
// nada que actualizar hasta que se cree su contrato. Lo mismo para Glorieta, Andamar,
// Tlatelolco y Cuatro Caminos (tampoco tienen contrato cargado).
//
// Un club del sistema, "Portal Queretaro, QRO", no aparece en el directorio en absoluto, asi
// que no se toca aqui (se queda con su fecha tentativa anterior hasta tener un dato real).
//
// Ejecutar con:
//   node prisma/marcar_fechas_reales_directorio.js
// Seguro de correr mas de una vez (siempre vuelve a poner la misma fecha real).

require('dotenv').config();
const { Client } = require('pg');

// nombre EXACTO en el catalogo de clubes (ver listar_franquicias.js) -> fecha real (ISO).
const FECHAS_REALES = {
  'Ciudad de Queretaro (Cimatario), QUE': '2022-03-16',
  'Plaza Torrecillas, PUE': '2022-04-14',
  'Ciudad de Queretaro (Candiles), QRO': '2022-04-23',
  'Cuernavaca (Galerias Cuernavaca), MOR': '2022-04-23',
  'Ciudad de Mexico (Paseo Acoxpa), CMX': '2022-05-30',
  'Plaza Satelite, EDO MEX': '2022-06-06',
  'Cuautitlan Izcalli (Plaza San Marcos), MEX': '2022-04-07',
  'La Paz Puebla, PUE': '2022-11-19',
  'Tlalnepantla de Baz (Valle Dorado), EDO MEX': '2022-12-17',
  'Encuentro Oceania, CDMX': '2023-09-09',
  'Lindavista, NL': '2023-04-11',
  'Libramiento (Villa Verde), PUE': '2023-04-11',
  'Paseo Tollocan, EDO MEX': '2023-11-11',
  'Santa Catarina, NL': '2018-04-14',
  'Monterrey (La Estanzuela), NL': '2019-12-08',
  'Guadalupe (Arcadia), NL': '2020-01-25',
  'Apodaca (El Molino), NL': '2020-01-02',
  'Saltillo (Santa Isabel), COA': '2020-01-10',
  'Angelopolis, PUE': '2024-03-30',
  'Coacalco, EDO MEX': '2024-03-30',
  'Punto Rio Nilo, JAL': '2024-03-30',
  'Acueducto, CDMX': '2024-03-30',
  'San Luis Potosi (The Park), SLP': '2024-04-13',
  'Xalapa (Paseo Jardines Xalapa), VER': '2024-05-21',
  'Center Plazas, EDO MEX': '2024-11-09',
  'Queretaro (Antea), QRO': '2024-09-13',
  'Ciudad de Mexico (Mixcoac), CDMX': '2024-10-19',
  'Cumbres la Viga, CDMX': '2024-11-15',
  'Las Americas (Ecatepec), EDO MEX': '2024-07-12',
  'Leon, GTO': '2024-07-12',
  'Veracruz (Los Pinos), VER': '2024-12-21',
  'Guadalajara (Plaza del Angel), JAL': '2024-12-31',
  'Mazatlan (La Gran Plaza), SIN': '2025-05-24',
  'Altolivo, CDMX': '2025-10-18',
  'Tlaquepaque (Celta), JAL': '2025-12-06',
  'Merida (Plaza Harbor), YUC': '2025-12-13',
  'Culiacan (Plaza Culiacan), SIN': '2025-12-20',
  'Guadalajara (Rancho Nuevo) / Estadio Guadalajara, JAL': '2025-12-20',
  'Leon (Parque Vertice), GTO': '2025-12-27',
  'Malecon Las Americas, ROO': '2025-12-27',
  'Punto Sur, JAL': '2025-12-27',
  'Galerias Guadalajara, JAL': '2025-12-27',
  'Multiplaza Las Palmas, GRO': '2025-12-27',
  'Gransur, CDMX': '2025-12-27',
  'Merida (Yucalpeten / Canek), YUC': '2026-08-31',
  'Centro Santa Fe, CDMX': '2026-09-11',
};

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log(`Aplicando fechas reales del directorio contra ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')} ...\n`);

  try {
    let actualizados = 0;
    const noEncontrados = [];
    for (const [nombre, fecha] of Object.entries(FECHAS_REALES)) {
      const { rows } = await client.query(
        `UPDATE contrato_franquicia_detalles fd
         SET club_abierto = true, fecha_apertura = $2, updated_at = now()
         FROM clubes cl
         WHERE fd.club_id = cl.id AND cl.nombre = $1
         RETURNING cl.nombre`,
        [nombre, fecha]
      );
      if (rows.length) {
        actualizados += 1;
      } else {
        noEncontrados.push(nombre);
      }
    }
    console.log(`Actualizados con fecha real: ${actualizados} de ${Object.keys(FECHAS_REALES).length} esperados.`);
    if (noEncontrados.length) {
      console.warn('No se encontraron (revisar nombre exacto en el catalogo de clubes):');
      for (const n of noEncontrados) console.warn(`  - ${n}`);
    }

    // Aviso informativo: cuales clubes del sistema se quedaron sin tocar (no estan en el mapa
    // de arriba), para que Jair sepa cuales siguen con fecha tentativa o sin fecha.
    const { rows: sinActualizar } = await client.query(
      `SELECT cl.nombre, fd.club_abierto, fd.fecha_apertura
       FROM contrato_franquicia_detalles fd
       JOIN clubes cl ON cl.id = fd.club_id
       WHERE cl.nombre != ALL($1::text[])
       ORDER BY cl.nombre`,
      [Object.keys(FECHAS_REALES)]
    );
    console.log(`\nClubes del sistema que NO estan en el directorio (sin tocar en esta corrida): ${sinActualizar.length}`);
    for (const r of sinActualizar) {
      console.log(`  - ${r.nombre} | abierto=${r.club_abierto} | fecha_apertura=${r.fecha_apertura ?? 'null'}`);
    }
  } catch (err) {
    console.error('Error al aplicar fechas reales del directorio:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
