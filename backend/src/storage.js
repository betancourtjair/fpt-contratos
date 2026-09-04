// Capa de abstracción de almacenamiento de archivos.
//
// El MVP implementa únicamente el backend "local" (disco, bajo backend/uploads/).
// El resto de la aplicación solo debe usar las funciones exportadas aquí (save/getUrl/delete),
// nunca tocar el filesystem directamente, para que en el futuro se pueda agregar un backend
// S3-compatible (STORAGE_DRIVER=s3) sin tocar rutas ni lógica de negocio.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOADS_DIR = path.resolve(process.cwd(), process.env.UPLOADS_DIR || 'uploads');
const STORAGE_DRIVER = process.env.STORAGE_DRIVER || 'local';

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function driverLocal() {
  return {
    /**
     * Guarda un archivo ya recibido en disco (multer con diskStorage lo deja en tmp/uploads)
     * y devuelve la "ruta" lógica (clave) con la que se guarda en la BD (ruta_archivo).
     * @param {{ buffer?: Buffer, path?: string, originalname: string, contratoId: string }} file
     */
    async save(file) {
      const ext = path.extname(file.originalname || '') || '';
      const nombreUnico = `${crypto.randomUUID()}${ext}`;
      const subdir = path.join('contratos', file.contratoId);
      const destDir = path.join(UPLOADS_DIR, subdir);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      const claveRelativa = path.join(subdir, nombreUnico).split(path.sep).join('/');
      const destPath = path.join(UPLOADS_DIR, claveRelativa);

      if (file.path) {
        // multer ya escribió el archivo en disco (diskStorage) en una ruta temporal: lo movemos.
        await fs.promises.rename(file.path, destPath);
      } else if (file.buffer) {
        await fs.promises.writeFile(destPath, file.buffer);
      } else {
        throw new Error('Archivo sin buffer ni path; no se puede guardar.');
      }

      return claveRelativa; // esto es lo que se guarda como ruta_archivo
    },

    /** Devuelve una URL/ruta pública (servida por Express en /uploads) para una clave dada. */
    getUrl(clave) {
      return `/uploads/${clave}`;
    },

    /** Elimina el archivo físico correspondiente a la clave. No truena si ya no existe. */
    async delete(clave) {
      const fullPath = path.join(UPLOADS_DIR, clave);
      try {
        await fs.promises.unlink(fullPath);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.error('Error al eliminar archivo del storage local:', err);
        }
      }
    },

    /** Ruta absoluta en disco para una clave, útil para streaming/descarga directa. */
    absolutePath(clave) {
      return path.join(UPLOADS_DIR, clave);
    },
  };
}

function getDriver() {
  switch (STORAGE_DRIVER) {
    case 'local':
      return driverLocal();
    // case 's3': return driverS3(); // futuro: mismo contrato (save/getUrl/delete)
    default:
      throw new Error(`STORAGE_DRIVER "${STORAGE_DRIVER}" no soportado en este MVP.`);
  }
}

const driver = getDriver();

module.exports = {
  UPLOADS_DIR,
  save: (file) => driver.save(file),
  getUrl: (clave) => driver.getUrl(clave),
  delete: (clave) => driver.delete(clave),
  absolutePath: (clave) => driver.absolutePath(clave),
};
