import { API_URL } from '../../api.js';

export const ESTATUS_LABELS = { recibida: 'Recibida', en_proceso: 'En proceso', atendida: 'Atendida' };

export function resolverUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = API_URL.replace(/\/api\/?$/, '');
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function fmtFecha(valor) {
  if (!valor) return '—';
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

// Igual que visible() del backend (utils/arrSolicitudForm.js).
export function esVisible(item, datos) {
  if (!item.visibleSi) return true;
  return item.visibleSi.en.includes(datos[item.visibleSi.campo]);
}

export function EstatusBadge({ estatus }) {
  const clase = estatus === 'atendida' ? 'activo' : estatus === 'en_proceso' ? 'por_vencer' : 'borrador';
  return <span className={`badge badge-${clase}`}>{ESTATUS_LABELS[estatus] || estatus}</span>;
}
