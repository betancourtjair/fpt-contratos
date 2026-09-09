# Módulo de Franquicias — instrucciones de instalación

Este paquete agrega un módulo separado de "Franquicias" (dashboard propio, listado propio,
alta propia, catálogo de clubes) visible solo para **super_admin**, **administrador** y
**jurídico**. Los contratos de franquicia ya NO aparecen en el Dashboard ni en "Contratos"
general, y ya no se pueden crear desde "Nueva solicitud de contrato" general.

## 1. Copiar los archivos

Copia todos los archivos de este zip a las mismas rutas dentro de tu repo local
(`C:\Users\JairPulidoBetancourt\Downloads\Contratos`), reemplazando los que ya existen:

```
backend/prisma/migration.sql          (se le agregó SQL al final, no se borró nada)
backend/src/server.js
backend/src/routes/contratos.js
backend/src/routes/dashboard.js
backend/src/routes/clubes.js          (NUEVO)
backend/src/routes/franquicias.js     (NUEVO)

frontend/src/App.jsx
frontend/src/auth/AuthContext.jsx
frontend/src/components/ContratoForm.jsx
frontend/src/components/Layout.jsx
frontend/src/components/ProtectedRoute.jsx
frontend/src/pages/Dashboard.jsx
frontend/src/pages/contratos/DetalleContrato.jsx
frontend/src/pages/contratos/ListaContratos.jsx
frontend/src/pages/contratos/NuevaSolicitud.jsx
frontend/src/pages/franquicias/Clubes.jsx                 (NUEVO)
frontend/src/pages/franquicias/DashboardFranquicias.jsx    (NUEVO)
frontend/src/pages/franquicias/NuevaSolicitudFranquicia.jsx (NUEVO)
frontend/src/styles/global.css
```

## 2. Aplicar la migración en la base de datos (Neon)

**Este paso es obligatorio y aún no se ha aplicado en producción.** Abre el SQL Editor de
Neon (el mismo lugar donde corriste la migración anterior de versionado de documentos) y
pega/corre estas 3 sentencias. Si el editor las bloquea al pegarlas todas juntas, pégalas
una por una (cada bloque termina en `;`):

```sql
CREATE TABLE clubes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT UNIQUE NOT NULL,
  direccion TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

```sql
ALTER TABLE contrato_franquicia_detalles ADD COLUMN club_id UUID REFERENCES clubes(id);
```

```sql
CREATE INDEX idx_franquicia_club ON contrato_franquicia_detalles(club_id);
```

No necesitas correr nada más: la tabla `clubes` arranca vacía (no se precargó ningún club);
los das de alta tú desde el módulo (Franquicias → Clubes → "+ Nuevo club").

## 3. Comandos para copiar y pegar (PowerShell)

Parado en la carpeta del repo (`C:\Users\JairPulidoBetancourt\Downloads\Contratos`), después
de haber copiado encima los archivos del paso 1:

```powershell
cd C:\Users\JairPulidoBetancourt\Downloads\Contratos
git add .
git commit -m "Agregar modulo de Franquicias (dashboard, alta, catalogo de clubes)"
git push
```

Eso despliega el backend automáticamente en Render (unos minutos). Para publicar el frontend
actualizado en GitHub Pages, corre además:

```powershell
cd C:\Users\JairPulidoBetancourt\Downloads\Contratos\frontend
npm run build
npx gh-pages -d dist
```

## 4. Qué esperar después de desplegar

- En el menú lateral aparece una nueva sección **"Franquicias"** (Dashboard, Nueva solicitud,
  Clubes) — solo visible para super_admin, administrador y jurídico. Otros roles no la ven y
  no pueden entrar aunque escriban la URL directamente.
- El tipo de contrato "Franchise Agreement" (o el que tengas marcado como franquicia) ya no
  aparece como opción en "Nueva solicitud de contrato" general — se solicita únicamente desde
  Franquicias → Nueva solicitud, donde además debes elegir el club.
- El Dashboard general y el listado de "Contratos" ya no muestran contratos de franquicia.
- Franquicias → Dashboard muestra: contadores por estatus, clubes activos sin contrato,
  contratos próximos a vencer, avisos próximos (pago de regalías / apertura / auditoría), y
  la tabla completa de todos los contratos de franquicia con filtros por estatus, club y
  texto de búsqueda.
- Franquicias → Clubes es el catálogo (alta, edición, activar/desactivar). Cualquier usuario
  autenticado puede ver la lista de clubes (para poder editar un contrato de franquicia ya
  existente), pero solo super_admin/administrador/jurídico pueden crear o modificar clubes.

## 5. Primeros pasos sugeridos

1. Entra a Franquicias → Clubes y da de alta tus 50 clubes (nombre y, si quieres, dirección).
2. Si ya tenías contratos de franquicia creados antes de este módulo, entra a cada uno desde
   su expediente (Contratos → busca el folio, o el link que ya tengas) y asígnale su club
   desde el botón de editar — el campo "Club" queda disponible ahí también.
