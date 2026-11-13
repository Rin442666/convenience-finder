import { NextResponse } from 'next/server';
import { geocodeAddressDetailed } from '@/lib/geocode';

/* Khung nội thành Hà Nội (nơi có dữ liệu cửa hàng). Điểm geocode nằm
   ngoài khung này thì báo out_of_area để giao diện không chuyển mốc —
   cùng quy tắc chatbot đang áp dụng. */
const INNER_HANOI = { minLat: 20.98, maxLat: 21.09, minLng: 105.75, maxLng: 105.89 };

/* GET /api/geocode?q=... — tra tọa độ cho một địa chỉ cụ thể ở ô tìm kiếm
   chính. Trả status: ok | out_of_area | not_found | unreachable để giao
   diện phân biệt "không thấy địa chỉ" với "mất kết nối OpenStreetMap". */
export async function GET(request: Request) {
    const q = (new URL(request.url).searchParams.get('q') || '').trim();
    if (!q) {
        return NextResponse.json({ status: 'not_found' });
    }
    /* Địa chỉ có số nhà: thử biến thể "<số> đường <tên>" TRƯỚC như
       chatbot vẫn làm — tra nguyên văn "68 Cầu Giấy" thì Nominatim dễ
       trả nhầm 68 Dương Đình Nghệ (đã gặp ở chatbot). */
    const candidates = [q];
    const houseMatch = q.match(/^(\d{1,4})\s+(.+)$/);
    if (houseMatch && !/^(đường|phố|ngõ|ngách|hẻm)\b/i.test(houseMatch[2])) {
        candidates.unshift(`${houseMatch[1]} đường ${houseMatch[2]}`);
    }
    let sawUnreachable = false;
    for (const candidate of candidates) {
        const outcome = await geocodeAddressDetailed(candidate);
        if (outcome.status === 'ok') {
            const { lat, lng, displayName } = outcome.location;
            const inArea =
                lat >= INNER_HANOI.minLat &&
                lat <= INNER_HANOI.maxLat &&
                lng >= INNER_HANOI.minLng &&
                lng <= INNER_HANOI.maxLng;
            return NextResponse.json({ status: inArea ? 'ok' : 'out_of_area', lat, lng, displayName });
        }
        if (outcome.status === 'unreachable') {
            sawUnreachable = true;
        }
    }
    return NextResponse.json({ status: sawUnreachable ? 'unreachable' : 'not_found' });
}
