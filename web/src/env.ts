const fromViteEnv = (key: string): string => import.meta.env[key] || "";

const withoutTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

export const frontendEnv = {
  API_PROXY_TARGET: withoutTrailingSlash(
    fromViteEnv("VITE_API_PROXY_TARGET")
  ),
  FLESPI_TOKEN_HELP_URL: fromViteEnv("VITE_FLESPI_TOKEN_HELP_URL"),
  SIPGATE_API_CLIENTS_URL: fromViteEnv("VITE_SIPGATE_API_CLIENTS_URL"),
  SIPGATE_PAT_URL: fromViteEnv("VITE_SIPGATE_PAT_URL"),
  OPENSTREETMAP_URL: withoutTrailingSlash(
    fromViteEnv("VITE_OPENSTREETMAP_URL")
  ),
  GOOGLE_MAPS_URL: withoutTrailingSlash(
    fromViteEnv("VITE_GOOGLE_MAPS_URL")
  ),
};

export const buildOpenStreetMapUrl = (lat: number, lon: number): string =>
  `${frontendEnv.OPENSTREETMAP_URL}/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;

export const buildGoogleMapsUrl = (lat: number, lon: number): string =>
  `${frontendEnv.GOOGLE_MAPS_URL}?q=${lat},${lon}`;

/** Turn-by-turn / route to destination (uses device GPS as destination). */
export const buildGoogleMapsDirectionsUrl = (lat: number, lon: number): string => {
  const base = frontendEnv.GOOGLE_MAPS_URL.replace(/\/+$/, "");
  return `${base}/dir/?api=1&destination=${lat},${lon}`;
};

export const buildAppleMapsDirectionsUrl = (lat: number, lon: number): string =>
  `https://maps.apple.com/?dirflg=d&daddr=${encodeURIComponent(`${lat},${lon}`)}`;

export const buildOpenStreetMapEmbedUrl = (
  lat: number,
  lon: number,
  bounds: string
): string =>
  `${frontendEnv.OPENSTREETMAP_URL}/export/embed.html?bbox=${bounds}&layer=mapnik&marker=${lat}%2C${lon}`;
