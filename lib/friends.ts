export const MIN_CITY_SEARCH_LENGTH = 2;
export const MAX_CITY_SEARCH_LENGTH = 120;

export function normalizeCitySearch(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_CITY_SEARCH_LENGTH);
}

export function canSearchCity(city: string) {
  return city.length >= MIN_CITY_SEARCH_LENGTH;
}
