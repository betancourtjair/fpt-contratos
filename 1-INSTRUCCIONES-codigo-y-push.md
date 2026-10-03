# Migración DocuSeal → Documenso — código y push

## 0. Ya hecho (no tienes que hacer nada más para esto)

- La base de datos de Neon (producción) ya tiene las columnas nuevas
  `documenso_*` y ya no tiene las `docuseal_*`. Corrí ese SQL directo en el
  SQL Editor de Neon.
- Todo el código ya está commiteado en este entorno, pero no lo pude pushear
  a GitHub porque esta sesión no tiene permiso de escritura sobre el repo.

## 1. Copiar los archivos

Descomprime este zip completo y copia todo su contenido a tu repo local
(`C:\Users\JairPulidoBetancourt\Downloads\Proyectos Desarrollo Jair\Contratos`),
reemplazando los archivos que ya existen. Incluye:

```
backend/.env.example
backend/prisma/migration.sql
backend/prisma/schema.prisma
backend/src/documensoClient.js                 (NUEVO)
backend/src/jobs/scheduler.js
backend/src/routes/contratos.js
backend/src/routes/documensoWebhook.js         (NUEVO)
backend/src/routes/jobs.js
backend/src/server.js
backend/src/sharepointStorage.js
backend/src/storage.js
backend/src/storageContratos.js
backend/src/utils/firmaElectronica.js
frontend/src/components/DocumentosContrato.jsx
frontend/src/components/EnviarAFirmarModal.jsx
.gitignore                                     (ya trae las líneas de dist/ agregadas)
cert.p12                                        (para el paso 3 del archivo 2-INSTRUCCIONES...)
```

No copies este archivo `.md` ni el `cert.p12` dentro de tu repo — el `.p12`
va aparte, a Render (ver el archivo `2-INSTRUCCIONES-provisioning-render-neon.md`).

## 2. Borrar los dos archivos de DocuSeal (ya no se usan)

```
backend/src/docusealClient.js
backend/src/routes/docusealWebhook.js
```

## 3. Comandos para copiar y pegar (PowerShell)

```powershell
cd "C:\Users\JairPulidoBetancourt\Downloads\Proyectos Desarrollo Jair\Contratos"
git add -A
git commit -m "Reemplazar DocuSeal por Documenso (self-hosted) para firma electronica"
git push
```

Eso despliega el backend en Render automáticamente (branch `main`). El
frontend también cambió (los textos "Enviar a firmar por Documenso" y las
etiquetas de estatus), así que publícalo también:

```powershell
cd frontend
npm run build
npx gh-pages -d dist
cd ..
```

## 4. Qué falta después de esto

El backend va a desplegar con la integración de Documenso ya en el código,
pero **todavía no va a funcionar** hasta que completes el archivo
`2-INSTRUCCIONES-provisioning-render-neon.md` de este mismo zip (base de
datos, SMTP, certificado, cuenta de Documenso).
