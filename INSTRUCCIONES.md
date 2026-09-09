# Dropdown de "Parte que contrata (FPT)"

Cambia el campo "Parte que contrata (FPT)" en el formulario de nueva solicitud / edición
de contrato: antes era texto libre, ahora es un menú desplegable con únicamente estas
dos opciones:

- Fitness para todos, S. de R.L. de C.V.
- Jeg-México Bueno, S. de R.L. de C.V.

Es un solo archivo de frontend, sin cambios de backend ni de base de datos.

## Pasos

1. Copia `frontend/src/components/ContratoForm.jsx` de este paquete a tu repo, en la misma ruta (reemplaza el archivo existente).
2. Sube el código fuente:
   ```powershell
   git add frontend/src/components/ContratoForm.jsx
   git commit -m "Convierte 'Parte que contrata' en dropdown de 2 opciones"
   git push origin main
   ```
3. Compila y publica el sitio:
   ```powershell
   cd frontend
   npm run build
   npx gh-pages -d dist
   cd ..
   ```

Nota: si algún contrato ya existente tiene guardado un texto distinto a estas dos opciones
(de cuando el campo era libre), al editarlo el dropdown se mostrará vacío hasta que
selecciones una de las dos razones sociales válidas.
