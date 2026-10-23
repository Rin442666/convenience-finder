/* Tra cứu địa chỉ qua Nominatim (OpenStreetMap) — không cần API key.
   Chính sách dùng: tối đa ~1 request/giây, nên CHỈ gọi khi người dùng
   thao tác (rời ô địa chỉ/Enter/bấm bản đồ), không gọi theo từng ký tự. */

export interface GeocodedLocation {
    lat: number;
    lng: number;
    displayName: string;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org';
/* Khung Hà Nội để ưu tiên kết quả trong thành phố (không bắt buộc). */
const HANOI_VIEWBOX = '105.6,20.85,106.15,21.25';

function toNumber(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

/* Địa chỉ văn bản → tọa độ. Tự thêm "Hà Nội" nếu câu nhập chưa có. */
export async function geocodeAddress(query: string): Promise<GeocodedLocation | null> {
    const q = query.trim();
    if (!q) return null;
    const hasHanoi = /hà nội|ha noi|hanoi/i.test(q);
    const url =
        `${NOMINATIM}/search?format=json&limit=1&countrycodes=vn` +
        `&viewbox=${HANOI_VIEWBOX}&accept-language=vi` +
        `&q=${encodeURIComponent(hasHanoi ? q : `${q}, Hà Nội, Việt Nam`)}`;
    try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) return null;
        const data: unknown = await res.json();
        const first = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
        const lat = toNumber(first?.lat);
        const lng = toNumber(first?.lon);
        if (lat === null || lng === null) return null;
        return { lat, lng, displayName: String(first?.display_name ?? q) };
    } catch {
        return null;
    }
}

/* Tọa độ → địa chỉ văn bản (tiếng Việt). */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
    const url =
        `${NOMINATIM}/reverse?format=json&lat=${lat}&lon=${lng}` +
        `&accept-language=vi&zoom=18`;
    try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) return null;
        const data = (await res.json()) as Record<string, unknown>;
        const name = data.display_name;
        return typeof name === 'string' && name.trim() ? name.trim() : null;
    } catch {
        return null;
    }
}
