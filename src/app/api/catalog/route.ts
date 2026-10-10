import { NextResponse } from 'next/server';
import { amenities, brands, getStoreCatalogFromDatabase } from '@/lib/store-db';

/** GET /api/catalog — danh mục thương hiệu + tiện ích cho bộ lọc (công khai). */
export async function GET() {
  try {
    const fromDb = await getStoreCatalogFromDatabase();
    return NextResponse.json({
      brands: fromDb?.brands ?? brands,
      amenities: fromDb?.amenities ?? amenities,
    });
  } catch {
    return NextResponse.json({ brands, amenities });
  }
}
