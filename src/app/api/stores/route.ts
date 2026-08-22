import { NextResponse } from 'next/server';

// Danh sách các máy chủ Overpass mã nguồn mở để dự phòng
const OVERPASS_ENDPOINTS = [
    'https://overpass.openstreetmap.fr/api/interpreter', 
    'https://overpass-api.de/api/interpreter',        
    'https://overpass.osm.ch/api/interpreter',       
    'https://overpass.nchc.org.tw/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
];

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const radius = searchParams.get('radius') || '1000';

    if (!lat || !lng) {
        return NextResponse.json({ error: 'Thiếu tọa độ' }, { status: 400 });
    }

    const query = `[out:json][timeout:15];(node["shop"="convenience"](around:${radius},${lat},${lng});way["shop"="convenience"](around:${radius},${lat},${lng}););out center;`;

    // Vòng lặp thử từng máy chủ
    for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain',
                    'Accept': 'application/json',
                    'User-Agent': 'ConvenienceFinderApp/1.0 (Du an mon hoc ma nguon mo - Sinh vien)'
                },
                body: query
            });

            // Nếu máy chủ này báo lỗi (429, 500, 502), bỏ qua và thử máy chủ tiếp theo
            if (!response.ok) {
                console.warn(`Máy chủ ${endpoint} lỗi ${response.status}, đang thử máy chủ khác...`);
                continue; 
            }

            const data = await response.json();

            const stores = (data.elements || []).map((el: any) => {
                const storeLat = el.lat || el.center?.lat;
                const storeLng = el.lon || el.center?.lon;
                const name = el.tags?.name || el.tags?.brand || 'Cửa hàng tiện lợi';
                const address = `${el.tags?.['addr:housenumber'] || ''} ${el.tags?.['addr:street'] || ''}`.trim() || 'Chưa cập nhật địa chỉ';

                return {
                    id: el.id.toString(),
                    name,
                    address,
                    lat: storeLat,
                    lng: storeLng,
                    rating: (Math.random() * (5 - 4) + 4).toFixed(1),
                    isOpen: true,
                };
            });

            // Nếu thành công ở một máy chủ bất kỳ, trả về kết quả và kết thúc luôn
            return NextResponse.json({ stores });

        } catch (error) {
            console.warn(`Không thể kết nối tới ${endpoint}, tiếp tục thử...`);
        }
    }

    // Nếu tất cả máy chủ đều sập, trả về mảng rỗng để bảo vệ giao diện
    console.error('Tất cả máy chủ Overpass đều không phản hồi.');
    return NextResponse.json({ stores: [] });
}