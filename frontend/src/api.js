// Cliente API centralizado para FPT Contratos.
// - Guarda el JWT en localStorage.
// - Adjunta el header Authorization en cada llamada.
// - Si el backend responde 401, limpia la sesión y redirige a /login.

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const TOKEN_KEY = 'fpt_contratos_token';
const USER_KEY = 'fpt_contratos_usuario';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getUsuario() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setUsuario(usuario) {
  if (usuario) localStorage.setItem(USER_KEY, JSON.stringify(usuario));
  else localStorage.removeItem(USER_KEY);
}

export function clearSesion() {
  setToken(null);
  setUsuario(null);
}

let onUnauthorized = () => {
  window.location.href = '/login';
};

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

// El backend devuelve filas de PostgreSQL con columnas snake_case (p.ej. fecha_fin,
// contraparte_nombre, rol_requerido). El resto del frontend trabaja en camelCase, así
// que convertimos recursivamente cada respuesta JSON antes de entregarla.
function snakeToCamelKey(key) {
  return key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function toCamelCase(value) {
  if (Array.isArray(value)) {
    return value.map(toCamelCase);
  }
  if (value && typeof value === 'object' && !(value instanceof File) && !(value instanceof Blob)) {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[snakeToCamelKey(key)] = toCamelCase(val);
    }
    return out;
  }
  return value;
}

/**
 * Llamada genérica al API.
 * @param {string} path - ruta relativa, p.ej. '/contratos'
 * @param {object} options
 * @param {string} options.method
 * @param {object} options.body - se serializa a JSON salvo que sea FormData
 * @param {object} options.query - parámetros de query string
 */
async function request(path, { method = 'GET', body, query, headers, ...rest } = {}) {
  let url = `${API_URL}${path}`;

  if (query && Object.keys(query).length) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value);
      }
    });
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const isFormData = body instanceof FormData;
  const finalHeaders = { ...headers };
  if (!isFormData && body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (token) {
    finalHeaders['Authorization'] = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
      ...rest,
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. Verifica tu conexión o intenta más tarde.', 0, null);
  }

  if (response.status === 401) {
    clearSesion();
    onUnauthorized();
    throw new ApiError('Sesión expirada. Vuelve a iniciar sesión.', 401, null);
  }

  let data = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await response.json().catch(() => null);
    data = toCamelCase(data);
  } else {
    data = await response.text().catch(() => null);
  }

  if (!response.ok) {
    const message = (data && (data.mensaje || data.message || data.error || data.detalle)) || `Error ${response.status}`;
    throw new ApiError(message, response.status, data);
  }

  return data;
}

export const api = {
  get: (path, query) => request(path, { method: 'GET', query }),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE' }),
};

/**
 * El backend envuelve casi todas las respuestas en un objeto ({ contratos: [...] },
 * { usuario: {...} }, etc.) en vez de devolver el valor "pelón". `unwrap` intenta cada
 * llave conocida y, si ninguna aplica, regresa la respuesta tal cual (por si el valor
 * ya viene sin envoltura).
 */
export function unwrap(data, ...keys) {
  if (data === null || data === undefined) return data;
  for (const key of keys) {
    if (data[key] !== undefined) return data[key];
  }
  return data;
}

export { ApiError };
