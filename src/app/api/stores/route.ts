import { NextResponse } from 'next/server';
import { getStoreCatalog, getStoreCatalogFromDatabase, queryStores, queryStoresFromDatabase } from '@/lib/store-db';

function parseArrayParam(value: string | null): string[] {
    if (!value) {
        return [];
    }

    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
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
                    is24h: place.opening_hours ? place.opening_hours.open_now : true,
                    amenities: ['wifi'],
                    brandId: 'circle-k',
                }));

                return NextResponse.json({ stores, brands: getStoreCatalog().brands, amenities: getStoreCatalog().amenities });
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
        }),
    ]);

    if (dbCatalog && dbStores) {
        return NextResponse.json({
            stores: dbStores,
            brands: dbCatalog.brands,
            amenities: dbCatalog.amenities,
        });
    }

    const stores = queryStores({
        lat,
        lng,
        radius,
        brandIds,
        amenityIds,
        openOnly,
        search,
    });

    const { brands, amenities } = getStoreCatalog();

    return NextResponse.json({
        stores,
        brands,
        amenities,
    });
}