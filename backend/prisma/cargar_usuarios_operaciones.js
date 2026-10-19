// Carga masiva de usuarios de clubes (rol operaciones, sin jefe directo).
// Uso: cd backend; npm run cargar:usuarios-operaciones   (requiere DATABASE_URL en .env)
// Idempotente: omite correos ya existentes. No envia correos.
// Genera contrasenas temporales aleatorias (debe_cambiar_password = true) y las guarda en
// usuarios_operaciones_credenciales.csv (BORRAR despues de entregarlas).
require('dotenv').config();
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Client } = require('pg');

const CLUBES = [
 [
  "PF Plaza Cimatario",
  "pfcimatario@fpt.com.mx"
 ],
 [
  "PF Plaza Torrecillas",
  "pftorrecillas@fpt.com.mx"
 ],
 [
  "PF Plaza Candiles",
  "pfcandiles@fpt.com.mx"
 ],
 [
  "PF Galer\u00edas Cuernavaca",
  "pfcuernavaca@fpt.com.mx"
 ],
 [
  "PF Paseo Acoxpa",
  "pfacoxpa@fpt.com.mx"
 ],
 [
  "PF Plaza Satelite",
  "pfsatelite@fpt.com.mx"
 ],
 [
  "PF Plaza San Marcos",
  "pfsanmarcos@fpt.com.mx"
 ],
 [
  "PF La Paz Puebla",
  "pflapaz@fpt.com.mx"
 ],
 [
  "PF Multiplaza Valle Dorado",
  "pfvalledorado@fpt.com.mx"
 ],
 [
  "PF Tlatelolco",
  "pftlatelolco@fpt.com.mx"
 ],
 [
  "PF Encuentro Oceania",
  "pfoceania@fpt.com.mx"
 ],
 [
  "PF Lindavista",
  "pflindavista@fpt.com.mx"
 ],
 [
  "PF Serviplaza Villa Verde",
  "pfvillaverde@fpt.com.mx"
 ],
 [
  "PF Tollocan",
  "pftollocan@fpt.com.mx"
 ],
 [
  "PF Santa Catarina",
  "pfsantacatarina@fpt.com.mx"
 ],
 [
  "PF La Estanzuela",
  "pflaestanzuela@fpt.com.mx"
 ],
 [
  "PF Arcadia",
  "pfarcadia@fpt.com.mx"
 ],
 [
  "PF El Molino",
  "pfelmolino@fpt.com.mx"
 ],
 [
  "PF Santa Isabel",
  "pfsantaisabel@fpt.com.mx"
 ],
 [
  "PF Angel\u00f3polis",
  "pfangelopolis@fpt.com.mx"
 ],
 [
  "PF Coacalco",
  "pfcoacalco@fpt.com.mx"
 ],
 [
  "PF Punto Rio Nilo",
  "pfrionilo@fpt.com.mx"
 ],
 [
  "PF Acueducto",
  "pfacueducto@fpt.com.mx"
 ],
 [
  "PF The Park",
  "pfthepark@fpt.com.mx"
 ],
 [
  "PF Jardines Xalapa",
  "pfjardinesxalapa@fpt.com.mx"
 ],
 [
  "PF Center Plazas",
  "pfcenterplaza@fpt.com.mx"
 ],
 [
  "PF Antea",
  "pfantea@fpt.com.mx"
 ],
 [
  "PF Mixcoac",
  "pfmixcoac@fpt.com.mx"
 ],
 [
  "PF Cumbres 1188",
  "pfcumbreslaviga@fpt.com.mx"
 ],
 [
  "PF Centro Las Americas",
  "pfcentrolasamericas@fpt.com.mx"
 ],
 [
  "PF Punto Le\u00f3n",
  "pfpuntoleon@fpt.com.mx"
 ],
 [
  "Andamar",
  "pfandamar@fpt.com.mx"
 ],
 [
  "Los Pinos",
  "pflospinos@fpt.com.mx"
 ],
 [
  "PF Glorieta",
  "pfglorieta@fpt.com.mx"
 ],
 [
  "PF Plaza Del Angel",
  "pfplazadelangel@fpt.com.mx"
 ],
 [
  "PF Gran Plaza Mazatl\u00e1n",
  "pflagranplazamazatlan@fpt.com.mx"
 ],
 [
  "PF Altolivo",
  "pfaltolivo@fpt.com.mx"
 ],
 [
  "Celta Lopez Mateos",
  "pfcelta@fpt.com.mx"
 ],
 [
  "Harbor",
  "pfharbor@fpt.com.mx"
 ],
 [
  "Zapata Culiacan",
  "pfzapataculiacan@fpt.com.mx"
 ],
 [
  "Estadio Guadalajara",
  "pfestadio@fpt.com.mx"
 ],
 [
  "Parque Vertice",
  "pfparquevertice@fpt.com.mx"
 ],
 [
  "Malecon Las Americas",
  "pfmaleconlasamericas@fpt.com.mx"
 ],
 [
  "Punto Sur",
  "pfpuntosur@fpt.com.mx"
 ],
 [
  "Galerias Guadalajara",
  "pfgalerias@fpt.com.mx"
 ],
 [
  "Multiplaza Las Palmas",
  "pflaspalmas@fpt.com.mx"
 ],
 [
  "Gran Sur",
  "pfgransur@fpt.com.mx"
 ],
 [
  "Canek",
  "pfcanek@fpt.com.mx"
 ],
 [
  "Cuatro Caminos",
  "pfcuatrocaminos@fpt.com.mx"
 ],
 [
  "Centro Santa F\u00e9",
  "pfcentrosantafe@fpt.com.mx"
 ]
];

function genPassword() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let p = '';
  for (let i = 0; i < 10; i++) p += abc[crypto.randomInt(abc.length)];
  return p + crypto.randomInt(10) + '!';
}

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false } });
  await client.connect();
  const salida = ['club,email,password_temporal'];
  let creados = 0, omitidos = 0;
  for (const [nombre, email] of CLUBES) {
    const ex = await client.query('SELECT 1 FROM usuarios WHERE lower(email) = $1', [email]);
    if (ex.rowCount) { omitidos++; console.log('OMITIDO (ya existe): ' + email); continue; }
    const pass = genPassword();
    const hash = await bcrypt.hash(pass, 10);
    await client.query(
      "INSERT INTO usuarios (email, nombre, password_hash, rol, area, jefe_directo_id, debe_cambiar_password) VALUES ($1,$2,$3,'operaciones',$4,NULL,true)",
      [email, nombre, hash, nombre]
    );
    salida.push('"' + nombre + '",' + email + ',' + pass);
    creados++;
    console.log('CREADO: ' + email);
  }
  await client.end();
  if (creados) fs.writeFileSync('usuarios_operaciones_credenciales.csv', '\ufeff' + salida.join('\r\n') + '\r\n');
  console.log('\nCreados: ' + creados + ' | Omitidos: ' + omitidos);
  if (creados) console.log('Contrasenas en backend/usuarios_operaciones_credenciales.csv (borrar al terminar).');
})().catch(e => { console.error(e); process.exit(1); });
