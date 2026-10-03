# Levantar Documenso self-hosted — lo que ya hice y lo que falta

## Ya hecho (no tienes que tocar esto)

1. **Base de datos**: creé un proyecto nuevo en Neon llamado `fpt-documenso`
   (separado de `fpt-contratos`, mismo patrón que ya usas para cada app).
2. **Servicio en Render**: creé `fpt-documenso` (imagen Docker
   `docker.io/documenso/documenso:latest`, plan gratis, región Oregon —
   mismo patrón que `fpt-docuseal`). Ya le puse las variables que no son
   credenciales: `PORT`, `NODE_ENV`, `NEXTAUTH_SECRET`,
   `NEXT_PRIVATE_ENCRYPTION_KEY`, `NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY`
   (secretos generados al azar, de un solo uso interno de la app — no son
   contraseñas de ninguna cuenta), y la config de SMTP que no es sensible
   (`NEXT_PRIVATE_SMTP_TRANSPORT`, `HOST`, `PORT`, `SECURE`, `FROM_NAME`).
3. **Certificado de firma**: generé un certificado autofirmado
   (`cert.p12`, adjunto), con contraseña `documenso` — es solo para que
   Documenso pueda estampar la firma digital en el PDF (firma electrónica
   simple, no cambia el hecho de que no es NOM-151).

Ahora mismo el servicio `fpt-documenso` va a aparecer "fallido" o
reiniciándose en Render — es normal, le faltan las credenciales de abajo.

**No pude tocar nada de lo de abajo yo mismo: son contraseñas/API
keys/credenciales, y por política no las escribo en ningún formulario aunque
sea tu propio panel de Render.** Son unos 10 minutos copiando y pegando.

## 1. Conectar la base de datos

1. Ve a tu proyecto **fpt-documenso** en Neon → botón **Connect**.
2. Copia la cadena de conexión **pooled** (la que trae `-pooler` en el host).
3. En Render → servicio **fpt-documenso** → **Environment** → agrega:
   - `NEXT_PRIVATE_DATABASE_URL` = (la cadena pooled que copiaste)
   - `NEXT_PRIVATE_DIRECT_DATABASE_URL` = (la cadena **sin** `-pooler`, para
     migraciones — Neon te la da en el mismo diálogo de Connect, o quítale
     `-pooler` al host)

## 2. Correo (Office 365)

Con el buzón que vayas a usar para mandar las invitaciones de firma (ej.
`notificaciones@fpt.com.mx`), agrega en el mismo Environment de
`fpt-documenso`:

- `NEXT_PRIVATE_SMTP_USERNAME` = el correo completo del buzón
- `NEXT_PRIVATE_SMTP_PASSWORD` = su contraseña (si el buzón tiene MFA,
  necesitas una "contraseña de aplicación" en vez de la contraseña normal)
- `NEXT_PRIVATE_SMTP_FROM_ADDRESS` = el mismo correo

## 3. Certificado de firma

1. En Render → `fpt-documenso` → **Environment** → sección **Secret
   Files** → **Add file**.
2. Nombre del archivo (ruta): `/opt/documenso/cert.p12`
3. Sube el archivo `cert.p12` que te adjunté.
4. De vuelta en **Environment Variables**, agrega:
   - `NEXT_PRIVATE_SIGNING_TRANSPORT` = `local`
   - `NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH` = `/opt/documenso/cert.p12`
   - `NEXT_PRIVATE_SIGNING_PASSPHRASE` = `documenso` (o cambia la
     contraseña del certificado tú mismo con `openssl` si prefieres otra)

Guarda cambios — Render va a redesplegar el servicio automáticamente.
Espera a que el estado pase a "Live" (revisa la pestaña **Logs** si tarda
o falla).

## 4. Crear tu cuenta y "Team" en Documenso

Esto lo tienes que hacer tú — no puedo crear cuentas ni escribir
contraseñas en tu nombre:

1. Abre `https://fpt-documenso.onrender.com` una vez que el servicio esté
   "Live".
2. Crea tu cuenta (Sign up) con tu correo.
3. Crea un **Team** (los webhooks y los API tokens solo existen a nivel
   Team, una cuenta personal no puede generarlos).
4. Dentro del Team → **Settings → API Tokens** → crea un token nuevo.
   Cópialo (empieza con `api_...`).
5. Dentro del Team → **Settings → Webhooks** → agrega uno:
   - URL: `https://fpt-contratos-backend.onrender.com/api/webhooks/documenso`
   - Secreto: el que tú quieras (guárdalo, lo vas a necesitar abajo)

## 5. Conectar el backend de Contratos a Documenso

En Render → servicio **fpt-contratos-backend** → **Environment**:

- Agrega `DOCUMENSO_URL` = `https://fpt-documenso.onrender.com`
- Agrega `DOCUMENSO_API_TOKEN` = el token del paso 4
- Agrega `DOCUMENSO_WEBHOOK_SECRET` = el secreto del webhook del paso 4
- Borra las variables viejas: `DOCUSEAL_URL`, `DOCUSEAL_API_TOKEN`,
  `DOCUSEAL_WEBHOOK_SECRET`

Guarda — esto redespliega `fpt-contratos-backend` automáticamente.

## 6. Dar de baja DocuSeal

Una vez que confirmemos que Documenso funciona con una prueba real, borra
el servicio **fpt-docuseal** en Render (Settings → Delete Service al final
de la página). No encontré una base de datos separada para DocuSeal en
Neon, así que probablemente no hay nada más que borrar ahí.

## 7. Avísame cuando termines

En cuanto termines los pasos 1-5 (o si algo no cuadra, como que el
servicio no arranque), dime y hago la prueba real de firma con los 3
firmantes (jair@fpt.com.mx, roberto.sacasa@fpt.com.mx,
alejandro@fpt.com.mx) directo desde la app de Contratos.
