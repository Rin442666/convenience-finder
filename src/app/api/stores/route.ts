import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '21.0285');
    const lng = parseFloat(searchParams.get('lng') || '105.8542');
    const radius = parseInt(searchParams.get('radius') || '1000', 10);

    const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (apiKey && apiKey !== 'YOUR_API_KEY') {
        try {
            const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=convenience_store&key=${apiKey}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.status === 'OK' && data.results && data.results.length > 0) {
                const stores = data.results.map((place: any) => ({
                    id: place.place_id,
                    name: place.name,
                    address: place.vicinity || 'Địa chỉ đang cập nhật',
                    lat: place.geometry.location.lat,
                    lng: place.geometry.location.lng,
                    rating: place.rating || 4.2,
                    isOpen: place.opening_hours ? place.opening_hours.open_now : true,
                }));
                return NextResponse.json({ stores });
            }
        } catch (error) {
            console.error('Lỗi khi gọi Google Places API:', error);
        }
    }

    // Dữ liệu dự phòng tự động tính theo tọa độ vị trí hiện tại
    const mockStores = [
        {
            id: 'mock-1',
            name: 'Circle K Chùa Hà',
            address: 'Đường Chùa Hà, Cầu Giấy, Hà Nội',
            lat: lat + 0.002,
            lng: lng + 0.003,
            rating: 4.6,
            isOpen: true,
        },
        {
            id: 'mock-2',
            name: 'WinMart+ Quan Hoa',
            address: 'Đường Quan Hoa, Cầu Giấy, Hà Nội',
            lat: lat - 0.002,
            lng: lng - 0.002,
            rating: 4.3,
            isOpen: true,
        },
        {
            id: 'mock-3',
            name: 'GS25 Nguyễn Khánh Toàn',
            address: 'Nguyễn Khánh Toàn, Cầu Giấy, Hà Nội',
            lat: lat + 0.004,
            lng: lng - 0.001,
            rating: 4.8,
            isOpen: true,
        },
        {
            id: 'mock-4',
            name: '7-Eleven Đào Tấn',
            address: 'Đào Tấn, Ba Đình, Hà Nội',
            lat: lat - 0.003,
            lng: lng + 0.004,
            rating: 4.5,
            isOpen: false,
        },
    ];

    return NextResponse.json({ stores: mockStores });
}