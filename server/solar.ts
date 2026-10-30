export interface SolarResult {
  date: string;
  latitude: number;
  longitude: number;
  timezone: 'UTC';
  solarNoonUtc: string;
  solarElevationDegreesAtSolarNoon: number;
  sunriseUtc: string | null;
  sunsetUtc: string | null;
  sunriseSunsetDefined: boolean;
  condition?: 'polar-day' | 'polar-night';
  units: { angles: 'degrees'; times: 'ISO 8601 UTC' };
  accuracy: string;
}

function isoAt(date: string, minutes: number) { return new Date(Date.parse(`${date}T00:00:00Z`) + minutes * 60_000).toISOString(); }
function dayOfYear(date: string) { return Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${date.slice(0, 4)}-01-01T00:00:00Z`)) / 86_400_000) + 1; }

export function calculateSolar(date: string, latitude: number, longitude: number): SolarResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('date must be a valid YYYY-MM-DD calendar date.');
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error('latitude must be between -90 and 90.');
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('longitude must be between -180 and 180.');
  const n = dayOfYear(date);
  const gamma = 2 * Math.PI / 365 * (n - 1);
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const solarNoon = 720 - 4 * longitude - eqtime;
  const lat = latitude * Math.PI / 180;
  const cosine = (Math.cos(90.833 * Math.PI / 180) / (Math.cos(lat) * Math.cos(decl))) - Math.tan(lat) * Math.tan(decl);
  const base: SolarResult = { date, latitude, longitude, timezone: 'UTC', solarNoonUtc: isoAt(date, solarNoon), solarElevationDegreesAtSolarNoon: 90 - Math.abs(latitude - decl * 180 / Math.PI), sunriseUtc: null, sunsetUtc: null, sunriseSunsetDefined: false, units: { angles: 'degrees', times: 'ISO 8601 UTC' }, accuracy: 'Approximate NOAA solar equations; typically within a few minutes for sunrise/sunset and without atmospheric/refraction or terrain corrections.' };
  if (cosine > 1) return { ...base, condition: 'polar-night' };
  if (cosine < -1) return { ...base, condition: 'polar-day' };
  const hourAngle = Math.acos(cosine) * 180 / Math.PI;
  return { ...base, sunriseUtc: isoAt(date, 720 - 4 * (longitude + hourAngle) - eqtime), sunsetUtc: isoAt(date, 720 - 4 * (longitude - hourAngle) - eqtime), sunriseSunsetDefined: true };
}
