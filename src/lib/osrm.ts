// Khoảng cách đường bộ qua OSRM Table service (cùng engine với nét vẽ
// chỉ đường trên bản đồ). Dùng để hiển thị/sắp xếp/lọc theo quãng đường
// thực tế thay vì đường chim bay (haversine), cho sai số nhỏ so với Google Maps.

export type LatLng = { lat: number; lng: number };

const OSRM_TABLE_URL = 'https://router.project-osrm.org/table/v1/driving';
// OSRM demo server miễn phí nhưng giới hạn ~100 tọa độ/request.
const MAX_COORDS_PER_REQUEST = 99;
const REQUEST_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 120_000;
const CACHE_MAX_ENTRIES = 50;

const distanceCache = new Map<string, { expires: number; values: (number | null)[] }>();

function roundCoord(value: number): string {
  return value.toFixed(4);
}

function cacheKey(origin: LatLng, destinations: LatLng[]): string {
  const point = (p: LatLng) => `${roundCoord(p.lat)},${roundCoord(p.lng)}`;
  return `${point(origin)}|${destinations.map(point).join(';')}`;
}

/**
 * Khoảng cách đường bộ (mét) từ origin tới từng destination, đúng thứ tự đầu vào.
 * Trả về null cho điểm nào OSRM không tính được — caller tự fallback về haversine.
 * Mọi lỗi (mạng, timeout, sai định dạng) đều trả về toàn null, không throw.
 */
export async function getRoadDistances(
  origin: LatLng,
  destinations: LatLng[]
): Promise<(number | null)[]> {
  const fallback: (number | null)[] = destinations.map(() => null);
  if (destinations.length === 0) {
    return [];
  }

  const limited = destinations.slice(0, MAX_COORDS_PER_REQUEST);
  const key = cacheKey(origin, limited);
  const cached = distanceCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.values;
  }

  try {
    const coords = [origin, ...limited].map((p) => `${p.lng},${p.lat}`).join(';');
    const url = `${OSRM_TABLE_URL}/${coords}?sources=0&annotations=distance`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        return fallback;
      }
      const data = await res.json();
      const row = data?.distances?.[0];
      if (data?.code !== 'Ok' || !Array.isArray(row)) {
        return fallback;
      }
      // distances[0][0] là origin->origin (=0); destination thứ i ở index i+1.
      // Điểm nào không đi được bằng đường bộ thì entry là null.
      const values = limited.map((_, i) => {
        const v = row[i + 1];
        return typeof v === 'number' && v >= 0 ? v : null;
      });
      const result: (number | null)[] = [...values, ...destinations.slice(MAX_COORDS_PER_REQUEST).map(() => null)];
      if (distanceCache.size >= CACHE_MAX_ENTRIES) {
        distanceCache.clear();
      }
      distanceCache.set(key, { expires: Date.now() + CACHE_TTL_MS, values: result });
      return result;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return fallback;
  }
}

/**
 * Ghi đè distanceMeters của từng cửa hàng bằng khoảng cách đường bộ (nếu lấy được).
 * KHÔNG lọc theo bán kính ở đây — lọc bán kính vẫn dùng đường chim bay như trước
 * (khớp với vòng tròn bán kính trên bản đồ); chỉ số hiển thị/sắp xếp là đường bộ.
 */
export async function applyRoadDistances<T extends LatLng & { distanceMeters?: number }>(
  stores: T[],
  origin: LatLng
): Promise<T[]> {
  if (stores.length === 0) {
    return stores;
  }
  const roads = await getRoadDistances(origin, stores);
  return stores.map((store, i) => {
    const road = roads[i];
    const base = store.distanceMeters ?? 0;
    return { ...store, distanceMeters: typeof road === 'number' ? road : base };
  });
}
