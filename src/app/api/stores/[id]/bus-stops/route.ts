import { NextResponse } from 'next/server';
import { BUS_STOP_RADIUS_METERS, getNearbyBusStops } from '@/lib/store-db';

// Next.js 16: params là Promise, phải await.
type RouteParams = { params: Promise<{ id: string }> };

/* GET /api/stores/[id]/bus-stops — các trạm xe buýt gần cửa hàng.
   Có trạm trong 500 m → tối đa 5 trạm gần nhất (withinRadius = true).
   Không có → đúng 1 trạm gần nhất với withinRadius = false. */
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const stops = await getNearbyBusStops(id);
  if (stops === null) {
    return NextResponse.json({ message: 'Không tìm thấy cửa hàng.' }, { status: 404 });
  }
  return NextResponse.json({ storeId: id, radiusMeters: BUS_STOP_RADIUS_METERS, stops });
}
