# FPT Contratos — Backend

Backend de la plataforma de gestión contractual (CLM) de Fitness Para Todos (FPT):
solicitud/revisión de contrato → flujo de autorización multi-nivel configurable →
al autorizarse, el propio contrato se convierte en el "expediente" donde se
administran documentos, fechas, partes y montos.

## Stack

- Node.js + Express
- PostgreSQL vía `pg` (node-postgres), SQL parametrizado — **sin ORM en runtime**.
  `prisma/schema.prisma` se conserva únicamente como documentación del modelo de
  datos; Prisma Client **no se usa** (la descarga del query engine binario está
  bloqueada en este entorno).
- JWT (`jsonwebtoken`) + `bcrypt` para autenticación.
- `multer` + una capa de abstracción de almacenamiento (`src/storage.js`) para
  documentos, guardados en disco local bajo `uploads/` (preparada para agregar
  un backend S3-compatible en el futuro sin tocar rutas).
- Notificaciones por correo vía Microsoft Graph API (`src/email.js`), con modo
  dev (console.log) si no hay credenciales configuradas.
- `express-async-errors` + un `asyncHandler` explícito en cada ruta async, para
  que un promise rejection nunca tumbe el proceso.

## Requisitos

- Node.js 22+, npm 10+
- PostgreSQL 16 accesible (local o remoto)

## Instalación

```bash
cd backend
npm install
cp .env.example .env   # y ajusta los valores (ver tabla abajo)
```

## Base de datos

La migración es SQL puro (no Prisma Migrate). Aplícala con `psql`:

```bash
psql "$DATABASE_URL" -f prisma/migration.sql
```

(Si ya fue aplicada contra tu base, este paso no es necesario.)

## Seed

Crea el usuario `super_admin` inicial, tipos de contrato típicos y las
plantillas de flujo de ejemplo (default + Arrendamiento):

```bash
npm run seed
```

El usuario `super_admin` se crea con el email `jair@fpt.com.mx`. La contraseña
temporal se toma de `SEED_SUPERADMIN_PASSWORD` si está definida en `.env`, o
se genera aleatoriamente e imprime en consola. **Cámbiala en el primer login**
(no hay endpoint de cambio de password en este MVP; usa
`PATCH /api/usuarios/:id` como admin, o actualízala directamente).

El seed es idempotente: correrlo de nuevo no duplica usuarios/tipos/plantillas
ya existentes.

## Correr el servidor

```bash
npm start        # producción
npm run dev       # con --watch, recarga en cambios
```

Por defecto escucha en `http://localhost:4000`. `GET /health` no requiere
autenticación y sirve para verificar que el proceso está vivo.

## Variables de entorno

| Variable | Descripción |
|---|---|
| `PORT` | Puerto HTTP del servidor (default 4000). |
| `NODE_ENV` | `development` / `production`. |
| `CORS_ORIGIN` | Orígenes permitidos por CORS, separados por coma, o `*`. |
| `DATABASE_URL` | Cadena de conexión Postgres. |
| `JWT_SECRET` | Secreto para firmar JWT. **Cámbialo en producción.** |
| `JWT_EXPIRES_IN` | Expiración de los tokens (ej. `8h`). |
| `STORAGE_DRIVER` | `local` (único implementado en este MVP). |
| `UPLOADS_DIR` | Carpeta donde se guardan los documentos subidos. |
| `MS_GRAPH_CLIENT_ID` / `MS_GRAPH_CLIENT_SECRET` / `MS_GRAPH_TENANT_ID` / `MS_GRAPH_SENDER_EMAIL` | Credenciales de una app registrada en Azure AD (client credentials flow) con permiso `Mail.Send` para el buzón remitente. Si faltan, `src/email.js` opera en modo dev (solo `console.log`, nunca truena el proceso). |
| `SEED_SUPERADMIN_PASSWORD` | Password temporal del super_admin creado por el seed. Opcional. |

## Estructura

```
backend/
  prisma/
    schema.prisma   # documentación del modelo de datos (NO se usa en runtime)
    migration.sql   # migración SQL real, aplicada a mano con psql
    seed.js          # seed ejecutable con `node prisma/seed.js`
  src/
    server.js        # arranque de Express, montaje de rutas, manejo de errores
    db.js             # pool de pg + helper de transacciones
    storage.js        # abstracción de almacenamiento de archivos (driver local)
    email.js           # notificaciones vía Microsoft Graph API
    middleware/
      auth.js           # requireAuth, requireRole
    routes/
      auth.js, usuarios.js, tiposContrato.js, flujoPlantillas.js,
      contratos.js, documentos.js, dashboard.js, jobs.js
    utils/
      asyncHandler.js, errors.js, audit.js, folio.js, flujoEngine.js,
      visibilidad.js, vencimientos.js
  uploads/            # documentos subidos (creado automáticamente)
```

## Motor de flujo de autorización multi-nivel

- Cada `TipoContrato` puede tener su propia `FlujoPlantilla` (`tipo_contrato_id`
  no nulo), o se usa la plantilla **default** (`tipo_contrato_id IS NULL`).
- Cada `FlujoPaso` define quién aprueba: por rol (`rol_aprobador`, cualquier
  usuario con ese rol puede resolver el paso) o por usuario específico
  (`aprobador_id`). Puede tener `montoMinimo`/`montoMaximo` opcionales: si el
  monto del contrato no cae en el rango, el paso se marca `omitido`
  automáticamente al generar las aprobaciones.
- `POST /api/contratos/:id/enviar-autorizacion` resuelve la plantilla
  aplicable, genera las filas `contrato_aprobaciones`, pone el contrato en
  `en_autorizacion`, fija `paso_actual_orden` al primer paso no omitido y
  notifica por correo.
- `POST /api/contratos/:id/aprobaciones/:aprobacionId/decidir` valida que
  quien decide sea el aprobador correcto y que sea el paso pendiente actual.
  Al aprobar el último paso, el contrato pasa a `activo` — **no existe una
  tabla de "proyecto" separada**: el propio contrato autorizado es el
  expediente donde se administran documentos y metadatos. Al rechazar, el
  contrato pasa a `rechazado` y el flujo se detiene.
- Cada decisión y transición de estatus se registra en `audit_logs`.

## Endpoints implementados (prefijo `/api`)

- `GET /health`
- Auth: `POST /auth/login`, `POST /auth/register` (admin+), `GET /auth/me`
- Usuarios: `GET /usuarios` (admin+), `PATCH /usuarios/:id` (admin+)
- Tipos de contrato: `GET/POST/PATCH /tipos-contrato` (POST/PATCH admin+)
- Plantillas de flujo: `GET/POST/PATCH /flujo-plantillas` y anidado
  `GET/POST/PATCH/DELETE /flujo-plantillas/:id/pasos` (escritura admin+)
- Contratos: `POST /contratos`, `GET /contratos` (filtros: `estatus`,
  `tipoContratoId`, `texto`, `proximosAVencer=true`), `GET /contratos/:id`,
  `PATCH /contratos/:id`, `POST /contratos/:id/enviar-autorizacion`,
  `POST /contratos/:id/aprobaciones/:aprobacionId/decidir`,
  `GET /contratos/mis-pendientes-aprobar`
- Documentos: `POST /contratos/:id/documentos` (multipart, campo `archivo`),
  `GET /contratos/:id/documentos`, `DELETE /documentos/:id`
- Dashboard: `GET /dashboard/resumen`
- Job de vencimientos: `POST /jobs/revisar-vencimientos` (admin+; pensado para
  ser llamado por un cron externo, ej. un Cron Job de Render, con un JWT de
  servicio con rol admin/super_admin)

## Roles y visibilidad

Roles (`rol_usuario`): `super_admin`, `admin`, `juridico`, `aprobador`,
`solicitante`, `lectura`.

- `super_admin` / `admin` / `juridico`: ven todos los contratos.
- `lectura`: ve todos los contratos (solo lectura; no tiene endpoints de
  escritura habilitados salvo los genéricamente abiertos como crear/editar su
  propio contrato, que en la práctica no aplican a este rol).
- `solicitante`: ve solo los contratos que solicitó.
- `aprobador`: ve los que solicitó + aquellos en los que aparece como
  aprobador (por usuario específico o por su rol) en cualquier paso.

## Notas de diseño / decisiones

- **bcrypt real** (no `bcryptjs`): en este entorno el binario nativo compiló e
  instaló sin problemas, así que se usó tal cual pidió el stack.
- El folio (`CT-2026-0001`) se genera dentro de una transacción con un
  `pg_advisory_xact_lock` sobre el año, para evitar duplicados ante creaciones
  concurrentes.
- `PATCH /contratos/:id` solo permite editar metadata mientras el contrato
  está en `borrador` (o en cualquier momento si quien edita es admin/
  super_admin).
- El job de vencimientos requiere rol admin/super_admin — un cron externo debe
  llamarlo con un JWT válido de un usuario con ese rol (no hay un mecanismo de
  API key separado en este MVP).
- Pendiente / fuera de alcance de este MVP: renovación automática real
  (el campo `renovacionAutomatica` se guarda pero no dispara lógica),
  versionado explícito de documentos más allá del campo `version`, y
  paginación en los listados (se devuelven completos, aceptable para el
  volumen esperado de 50+ sucursales).

## Pruebas manuales realizadas

Se corrió un flujo completo de punta a punta contra la base de datos local
(`DATABASE_URL` en `.env`): login → creación de usuarios (juridico, admin,
solicitante) → creación de contrato con folio autogenerado → envío a
autorización → resolución de la plantilla default (2 pasos: juridico siempre,
admin si monto ≥ 500,000) → aprobación de ambos pasos con los roles correctos
→ verificación de que el contrato queda en `activo` → subida de documento →
verificación del dashboard → prueba de rechazo (contrato con monto bajo, un
solo paso) → prueba del job de vencimientos → pruebas de control de acceso
(403/401) y de traducción de errores de Postgres (FK 23503, unique 23505).
