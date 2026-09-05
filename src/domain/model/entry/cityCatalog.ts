export const CITY_CATALOG_VERSION = 'ru-cities-v1';

export type SearchCity = { id: string; name: string; country: string; coordinates: [number, number] };

// Approximate city centres, not home addresses. Device coordinates are optional.
export const SEARCH_CITIES: readonly SearchCity[] = [
  { id: 'kz-kyzylorda', name: 'Кызылорда', country: 'Казахстан', coordinates: [65.51, 44.85] },
  { id: 'kz-almaty', name: 'Алматы', country: 'Казахстан', coordinates: [76.89, 43.24] },
  { id: 'kz-astana', name: 'Астана', country: 'Казахстан', coordinates: [71.43, 51.13] },
  { id: 'kz-shymkent', name: 'Шымкент', country: 'Казахстан', coordinates: [69.59, 42.32] },
  { id: 'kz-karaganda', name: 'Караганда', country: 'Казахстан', coordinates: [73.1, 49.8] },
  { id: 'kz-aktobe', name: 'Актобе', country: 'Казахстан', coordinates: [57.17, 50.28] },
  { id: 'kz-aktau', name: 'Актау', country: 'Казахстан', coordinates: [51.18, 43.65] },
  { id: 'kz-atyrau', name: 'Атырау', country: 'Казахстан', coordinates: [51.88, 47.11] },
  { id: 'ru-moscow', name: 'Москва', country: 'Россия', coordinates: [37.62, 55.75] },
  { id: 'ru-spb', name: 'Санкт-Петербург', country: 'Россия', coordinates: [30.32, 59.94] },
  { id: 'ru-novosibirsk', name: 'Новосибирск', country: 'Россия', coordinates: [82.92, 55.03] },
  { id: 'ru-ekaterinburg', name: 'Екатеринбург', country: 'Россия', coordinates: [60.6, 56.84] },
  { id: 'ru-kazan', name: 'Казань', country: 'Россия', coordinates: [49.12, 55.8] },
  { id: 'ru-nizhny', name: 'Нижний Новгород', country: 'Россия', coordinates: [44.0, 56.33] },
  { id: 'ru-samara', name: 'Самара', country: 'Россия', coordinates: [50.1, 53.2] },
  { id: 'ru-omsk', name: 'Омск', country: 'Россия', coordinates: [73.37, 54.99] },
  { id: 'ru-rostov', name: 'Ростов-на-Дону', country: 'Россия', coordinates: [39.72, 47.24] },
  { id: 'ru-ufa', name: 'Уфа', country: 'Россия', coordinates: [55.96, 54.74] },
  { id: 'ru-krasnoyarsk', name: 'Красноярск', country: 'Россия', coordinates: [92.87, 56.01] },
  { id: 'ru-perm', name: 'Пермь', country: 'Россия', coordinates: [56.25, 58.01] },
  { id: 'ru-voronezh', name: 'Воронеж', country: 'Россия', coordinates: [39.2, 51.67] },
  { id: 'ru-volgograd', name: 'Волгоград', country: 'Россия', coordinates: [44.5, 48.71] },
  { id: 'ru-krasnodar', name: 'Краснодар', country: 'Россия', coordinates: [38.98, 45.04] },
  { id: 'ru-sochi', name: 'Сочи', country: 'Россия', coordinates: [39.73, 43.6] },
  { id: 'ru-vladivostok', name: 'Владивосток', country: 'Россия', coordinates: [131.89, 43.12] },
  { id: 'ru-irkutsk', name: 'Иркутск', country: 'Россия', coordinates: [104.3, 52.29] },
  { id: 'by-minsk', name: 'Минск', country: 'Беларусь', coordinates: [27.56, 53.9] },
  { id: 'uz-tashkent', name: 'Ташкент', country: 'Узбекистан', coordinates: [69.24, 41.3] },
  { id: 'kg-bishkek', name: 'Бишкек', country: 'Кыргызстан', coordinates: [74.6, 42.87] },
  { id: 'am-yerevan', name: 'Ереван', country: 'Армения', coordinates: [44.51, 40.19] },
  { id: 'ge-tbilisi', name: 'Тбилиси', country: 'Грузия', coordinates: [44.8, 41.72] },
  { id: 'az-baku', name: 'Баку', country: 'Азербайджан', coordinates: [49.87, 40.41] },
  { id: 'md-chisinau', name: 'Кишинёв', country: 'Молдова', coordinates: [28.86, 47.01] },
  { id: 'rs-belgrade', name: 'Белград', country: 'Сербия', coordinates: [20.46, 44.82] },
  { id: 'tr-istanbul', name: 'Стамбул', country: 'Турция', coordinates: [28.98, 41.01] },
];

export const coarseCoordinates = (coordinates: [number, number]): [number, number] => [
  Math.round(coordinates[0] * 100) / 100,
  Math.round(coordinates[1] * 100) / 100,
];
