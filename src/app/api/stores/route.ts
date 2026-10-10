import { NextResponse } from 'next/server';
import { applyRoadDistances } from '@/lib/osrm';
import {
  applyRatingFilterAndSort,
  getStoreCatalog,
  getStoreCatalogFromDatabase,
  haversineDistanceMeters,
  queryStores,
  queryStoresFromDatabase,
} from '@/lib/store-db';

function parseArrayParam(value: string | null): string[] {
    if (!value) {
        return [];
    }

    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

// Kiểu tối thiểu của một kết quả Google Places Nearby Search
// (chỉ khai báo các field mà code đang dùng).
type GooglePlaceResult = {
    place_id: string;
    name?: string;
    vicinity?: string;
    rating?: number;
    geometry: {
        location: {
            lat: number;
            lng: number;
        };
    };
    opening_hours?: {
        open_now?: boolean;
        weekday_text?: unknown;
    };
};

// Đoán thương hiệu từ tên địa điểm trả về bởi Google Places.
// Không đoán được thì trả về 'other' (hiển thị khi lọc "Tất cả").
function inferBrandId(placeName: string): string {
    const normalized = placeName.toLowerCase();
    if (normalized.includes('circle k')) {
        return 'circle-k';
    }
    if (normalized.includes('winmart') || normalized.includes('win mart')) {
        return 'winmart';
    }
    if (normalized.includes('gs25') || normalized.includes('gs 25')) {
        return 'gs25';
    }
    if (normalized.includes('familymart') || normalized.includes('family mart')) {
        return 'familymart';
    }
    if (normalized.includes('7-eleven') || normalized.includes('7 eleven')) {
        return '7-eleven';
    }
    return 'other';
}

// Kiểu cửa hàng chuẩn hóa từ Google Places (đầy đủ tọa độ để tính đường bộ).
type GoogleStoreItem = {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    rating: number;
    isOpen: boolean;
    is24h: boolean;
    amenities: string[];
    brandId: string;
    distanceMeters: number;
};

// Kiểm tra có phải mở 24/7 thật không dựa trên weekday_text
// (ví dụ: "Monday: Open 24 hours"). Không suy ra từ open_now.
function isOpen24Hours(place: { opening_hours?: { weekday_text?: unknown } } | null | undefined): boolean {
    const weekdayText = place?.opening_hours?.weekday_text;
    if (!Array.isArray(weekdayText) || weekdayText.length === 0) {
        return false;
    }
    return weekdayText.every((line) => typeof line === 'string' && /24 hours/i.test(line));
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '21.03477');
    const lng = parseFloat(searchParams.get('lng') || '105.80266');
    const radius = parseInt(searchParams.get('radius') || '1000', 10);
    const brandIds = parseArrayParam(searchParams.get('brandIds'));
    const amenityIds = parseArrayParam(searchParams.get('amenityIds'));
    const openOnly = searchParams.get('openOnly') === 'true';
    const search = searchParams.get('search') || '';
    const sortParam = searchParams.get('sort');
    const sort: 'nearest' | 'rating' = sortParam === 'rating' ? 'rating' : 'nearest';
    const minRatingRaw = parseFloat(searchParams.get('minRating') || '0');
    const minRating = Number.isFinite(minRatingRaw) && minRatingRaw > 0 ? minRatingRaw : 0;

    const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (apiKey && apiKey !== 'YOUR_API_KEY') {
        try {
            const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=convenience_store&key=${apiKey}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.status === 'OK' && data.results && data.results.length > 0) {
                const normalizedSearch = search.trim().toLowerCase();

                const stores = applyRatingFilterAndSort<GoogleStoreItem>(
                    data.results
                        .map((place: GooglePlaceResult) => {
                            const placeLat = place.geometry.location.lat;
                            const placeLng = place.geometry.location.lng;
                            const openNow = place.opening_hours ? !!place.opening_hours.open_now : true;

                            return {
                                id: place.place_id,
                                name: place.name,
                                address: place.vicinity || 'Địa chỉ đang cập nhật',
                                lat: placeLat,
                                lng: placeLng,
                                rating: typeof place.rating === 'number' ? place.rating : 0,
                                isOpen: openNow,
                                is24h: isOpen24Hours(place),
                                // Google Places không trả về tiện ích chi tiết nên để mảng rỗng
                                // thay vì gán cứng — filter tiện ích sẽ loại các kết quả này
                                // một cách trung thực khi người dùng có chọn tiện ích.
                                amenities: [] as string[],
                                brandId: inferBrandId(place.name || ''),
                                distanceMeters: haversineDistanceMeters(lat, lng, placeLat, placeLng),
                            };
                        })
                        .filter((store: { distanceMeters: number; brandId: string; amenities: string[]; isOpen: boolean; is24h: boolean; name: string; address: string }) => {
                            const withinRadius = store.distanceMeters <= radius;
                            const matchesBrand = brandIds.length === 0 || brandIds.includes(store.brandId);
                            const matchesAmenity =
                                amenityIds.length === 0 || amenityIds.every((amenityId) => store.amenities.includes(amenityId));
                            const matchesOpen = !openOnly || store.isOpen || store.is24h;
                            const matchesSearch =
                                normalizedSearch.length === 0 ||
                                store.name.toLowerCase().includes(normalizedSearch) ||
                                store.address.toLowerCase().includes(normalizedSearch);

                            return withinRadius && matchesBrand && matchesAmenity && matchesOpen && matchesSearch;
                        }),
                    { sort, minRating }
                );

                // Ghi đè khoảng cách đường chim bay bằng khoảng cách đường bộ (OSRM)
                // rồi sắp xếp lại, cho khớp với số Google Maps báo khi bấm "Chỉ đường".
                const googleStores = applyRatingFilterAndSort(
                    await applyRoadDistances(stores, { lat, lng }),
                    { sort, minRating }
                );

                const googleCatalog = await getStoreCatalog();
                return NextResponse.json({ stores: googleStores, brands: googleCatalog.brands, amenities: googleCatalog.amenities });
            }
        } catch (error) {
            console.error('Lỗi khi gọi Google Places API:', error);
        }
    }

    const [dbCatalog, dbStores] = await Promise.all([
        getStoreCatalogFromDatabase(),
        queryStoresFromDatabase({
            lat,
            lng,
            radius,
            brandIds,
            amenityIds,
            openOnly,
            search,
            sort,
            minRating,
        }),
    ]);

    if (dbCatalog && dbStores) {
        // Ghi đè khoảng cách đường chim bay bằng khoảng cách đường bộ (OSRM)
        // rồi sắp xếp lại. Lọc bán kính vẫn theo đường chim bay như trước.
        const roadStores = applyRatingFilterAndSort(
            await applyRoadDistances(dbStores, { lat, lng }),
            { sort, minRating }
        );
        return NextResponse.json({
            stores: roadStores,
            brands: dbCatalog.brands,
            amenities: dbCatalog.amenities,
        });
    }

    const mockStores = await queryStores({
        lat,
        lng,
        radius,
        brandIds,
        amenityIds,
        openOnly,
        search,
        sort,
        minRating,
    });

    const { brands, amenities } = await getStoreCatalog();
    const roadMockStores = applyRatingFilterAndSort(
        await applyRoadDistances(mockStores, { lat, lng }),
        { sort, minRating }
    );

    return NextResponse.json({
        stores: roadMockStores,
        brands,
        amenities,
    });
}