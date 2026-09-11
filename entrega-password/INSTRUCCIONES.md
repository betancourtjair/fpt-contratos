# Correo de bienvenida + cambio de contraseña forzoso — instrucciones

Esto agrega dos cosas al alta de usuarios (Usuarios → + Nuevo usuario):

1. Al crear un usuario, le llega un correo con el URL del sitio, su correo y su
   contraseña temporal.
2. Un checkbox **"Pedir cambiar la contraseña en el primer inicio de sesión"**
   (marcado por default). Si queda marcado, la primera vez que esa persona inicie
   sesión, la aplicación la bloquea en una pantalla de "Cambiar contraseña" hasta
   que establezca una propia — no puede usar el resto del sitio mientras tanto.

## 1. Copiar los archivos

Copia todos los archivos de este zip a las mismas rutas dentro de tu repo local
(`C:\Users\JairPulidoBetancourt\Downloads\Contratos`), reemplazando los que ya existen:

```
backend/.env.example                       (solo referencia, documenta FRONTEND_URL)
backend/prisma/migration.sql                (se le agregó SQL al final, no se borró nada)
backend/src/routes/auth.js

frontend/src/App.jsx
frontend/src/auth/AuthContext.jsx
frontend/src/components/ProtectedRoute.jsx
frontend/src/pages/CambiarPassword.jsx      (NUEVO)
frontend/src/pages/admin/Usuarios.jsx
```

## 2. Aplicar la migración en la base de datos (Neon)

Este paso es obligatorio. Abre el SQL Editor de Neon y corre:

```sql
ALTER TABLE usuarios ADD COLUMN debe_cambiar_password BOOLEAN NOT NULL DEFAULT false;
```

El default es `false` a nivel de columna para no afectar a los usuarios que ya
tienes — nadie existente se verá forzado a cambiar su contraseña por esto. El
checkbox marcado por default solo aplica a los usuarios que crees de aquí en
adelante.

## 3. Comandos para copiar y pegar (PowerShell)

Parado en la carpeta del repo, después de haber copiado encima los archivos del paso 1:

```powershell
cd C:\Users\JairPulidoBetancourt\Downloads\Contratos
git add .
git commit -m "Agregar correo de bienvenida y cambio de contrasena forzoso en primer login"
git push
```

Eso despliega el backend en Render. Para publicar el frontend:

```powershell
cd C:\Users\JairPulidoBetancourt\Downloads\Contratos\frontend
npm run build
npx gh-pages -d dist
```

## 4. Sobre el envío del correo (importante)

El correo se envía con el mismo mecanismo que ya usa la plataforma para avisos de
autorización y vencimientos (Microsoft Graph API). Si esas notificaciones ya te
están llegando hoy, esto también te va a llegar sin que tengas que configurar
nada más.

Si el backend en Render **no** tiene configuradas las variables `MS_GRAPH_CLIENT_ID`,
`MS_GRAPH_CLIENT_SECRET`, `MS_GRAPH_TENANT_ID` y `MS_GRAPH_SENDER_EMAIL`, el correo no
se envía de verdad — solo queda registrado en los logs del servidor ("modo dev"). En
ese caso puedes revisar los logs de Render para confirmar que el contenido se generó
bien, y configurar esas variables cuando quieras activar el envío real.

Opcionalmente puedes definir `FRONTEND_URL` en las variables de entorno de Render con
la URL exacta de tu sitio; si no la defines, el correo usa por default
`https://betancourtjair.github.io/fpt-contratos/`, que es donde ya vive el sitio hoy.

## 5. Qué esperar después de desplegar

- Al abrir "+ Nuevo usuario" en Usuarios, verás el checkbox ya marcado. Puedes
  desmarcarlo si por alguna razón no quieres forzar el cambio (por ejemplo, una
  cuenta de servicio).
- Al crear el usuario, le llega el correo con sitio + credenciales.
- Cuando esa persona inicie sesión por primera vez, verá de inmediato la pantalla
  "Cambiar contraseña" y no podrá navegar a ninguna otra parte del sitio hasta
  completar el cambio (pide su contraseña actual — la temporal — y la nueva dos
  veces).
- Una vez que cambie su contraseña, entra normal al resto de la plataforma y no
  se le vuelve a pedir esto en logins futuros.
