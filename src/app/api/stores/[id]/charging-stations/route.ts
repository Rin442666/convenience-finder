import { NextResponse } from 'next/server';
import { CHARGING_RADIUS_METERS, getNearbyChargingStations } from '@/lib/store-db';

// Next.js 16: params là Promise, phải await.
type RouteParams = { params: Promise<{ id: string }> };

/* GET /api/stores/[id]/charging-stations — các trạm sạc xe điện gần
   cửa hàng. Có trạm trong 1 km → tối đa 5 trạm gần nhất
   (withinRadius = true). Không có → đúng 1 trạm gần nhất với
   withinRadius = false. */
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const stations = await getNearbyChargingStations(id);
  if (stations === null) {
    return NextResponse.json({ message: 'Không tìm thấy cửa hàng.' }, { status: 404 });
  }
  return NextResponse.json({ storeId: id, radiusMeters: CHARGING_RADIUS_METERS, stations });
}
