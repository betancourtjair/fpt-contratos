# FPT Contratos — Frontend

Frontend de la plataforma de gestión contractual (CLM) de Fitness Para Todos (FPT). Reemplazo de LeaseCake: solicitud/revisión de contrato → flujo de autorización multi-nivel configurable → expediente (documentos, fechas, partes, montos).

React + Vite + React Router, pensado para desplegarse como sitio estático (p. ej. GitHub Pages), igual que el sistema de inventario de FPT.

## Instalación

```bash
npm install
```

## Correr en desarrollo

```bash
npm run dev
```

Levanta la app en `http://localhost:5173` (puerto por defecto de Vite).

## Configurar la URL del API

La app llama al backend a través de la variable de entorno `VITE_API_URL`. Si no se define, usa `http://localhost:4000/api` como fallback.

Para desarrollo local, copia `.env.example` a `.env` y ajusta si es necesario:

```bash
cp .env.example .env
```

```
VITE_API_URL=http://localhost:4000/api
```

Para producción (build estático), define `VITE_API_URL` en el entorno antes de compilar, por ejemplo:

```bash
VITE_API_URL=https://api.fpt-contratos.example.com/api npm run build
```

## Build de producción

```bash
npm run build
```

Genera el sitio estático en `dist/`. `vite.config.js` usa `base: './'` (rutas relativas) y el router de la app es `HashRouter`, para que el sitio funcione correctamente cuando se sirve desde una subcarpeta (como GitHub Pages) sin necesitar configuración de rewrites en el servidor.

```bash
npm run preview
```

sirve el build de `dist/` localmente para verificarlo antes de desplegar.

## Estructura

```
src/
  main.jsx              punto de entrada, monta AuthProvider + HashRouter
  App.jsx                definición de rutas
  api.js                 cliente API centralizado (fetch, JWT, manejo de 401, normalización de respuestas)
  auth/AuthContext.jsx    contexto de sesión (usuario actual, login/logout)
  components/             componentes compartidos (Layout, formularios, timeline de autorización, etc.)
  pages/                  pantallas (Dashboard, Contratos, Admin)
  styles/                 variables de marca FPT (tema morado) y estilos globales
```

## Notas de integración con el backend

- El JWT se guarda en `localStorage` y se envía como `Authorization: Bearer <token>` en cada llamada; un 401 limpia la sesión y redirige a `/login`.
- El backend real devuelve las filas de PostgreSQL con columnas en `snake_case` (p. ej. `fecha_fin`, `contraparte_nombre`) envueltas en objetos (`{ contrato: {...} }`, `{ contratos: [...] }`, etc.). `src/api.js` convierte automáticamente cada respuesta a `camelCase`, y expone un helper `unwrap(data, ...llaves)` que usan las páginas para leer el valor correcto sin importar si viene envuelto o no.
- Categorías de documento válidas: `borrador`, `version_firmada`, `anexo`, `evidencia`, `otro` (deben coincidir con el enum `categoria_documento` del backend).
- Roles: `super_admin`, `admin`, `juridico`, `aprobador`, `solicitante`, `lectura`.
