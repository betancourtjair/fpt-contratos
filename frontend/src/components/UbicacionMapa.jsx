import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Vite no resuelve los iconos default de Leaflet por su cuenta (vienen referenciados
// como rutas relativas dentro del propio paquete) — hay que pisar la configuración con
// las URLs ya procesadas por el bundler, si no el pin del mapa sale invisible/roto.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/**
 * Mapa de una ubicación (equivalente al mapa de Leasecake en la pestaña "Location").
 * Usa OpenStreetMap vía Leaflet — sin costo ni API key, a diferencia de Mapbox.
 */
export default function UbicacionMapa({ latitude, longitude, nombre, direccion }) {
  const contenedorRef = useRef(null);
  const mapaRef = useRef(null);

  const lat = latitude !== null && latitude !== undefined ? Number(latitude) : null;
  const lng = longitude !== null && longitude !== undefined ? Number(longitude) : null;
  const tieneCoordenadas = lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng);

  useEffect(() => {
    if (!tieneCoordenadas || !contenedorRef.current) return undefined;

    const mapa = L.map(contenedorRef.current, {
      center: [lat, lng],
      zoom: 16,
      scrollWheelZoom: false,
    });
    mapaRef.current = mapa;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapa);

    L.marker([lat, lng])
      .addTo(mapa)
      .bindPopup(`<strong>${nombre || 'Ubicación'}</strong>${direccion ? `<br/>${direccion}` : ''}`);

    return () => {
      mapa.remove();
      mapaRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, tieneCoordenadas]);

  if (!tieneCoordenadas) {
    return <div className="empty-state">Esta ubicación no tiene coordenadas registradas.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div ref={contenedorRef} style={{ height: 320, width: '100%', borderRadius: 8, overflow: 'hidden' }} />
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
        target="_blank"
        rel="noreferrer"
        className="muted"
        style={{ fontSize: 12, alignSelf: 'flex-end' }}
      >
        Ver en Google Maps ↗
      </a>
    </div>
  );
}
