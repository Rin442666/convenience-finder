import { NextResponse } from 'next/server';
import { GAS_STATION_RADIUS_METERS, getNearbyGasStations } from '@/lib/store-db';

// Next.js 16: params là Promise, phải await.
type RouteParams = { params: Promise<{ id: string }> };

/* GET /api/stores/[id]/gas-stations — các cây xăng gần cửa hàng.
   Có cây xăng trong 1 km → tối đa 5 cây gần nhất
   (withinRadius = true). Không có → đúng 1 cây gần nhất với
   withinRadius = false. */
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const stations = await getNearbyGasStations(id);
  if (stations === null) {
    return NextResponse.json({ message: 'Không tìm thấy cửa hàng.' }, { status: 404 });
  }
  return NextResponse.json({ storeId: id, radiusMeters: GAS_STATION_RADIUS_METERS, stations });
}
