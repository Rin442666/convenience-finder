import { NextResponse } from 'next/server';
import { dbAll } from '@/lib/db';
import { getSessionFromRequest, requireAdmin } from '@/lib/server-auth';

function deny(request: Request) {
  const session = getSessionFromRequest(request);
  return NextResponse.json(
    { message: session ? 'Bạn không có quyền thực hiện hành động này.' : 'Bạn cần đăng nhập.' },
    { status: session ? 403 : 401 }
  );
}

/** GET /api/admin/stores — danh sách cửa hàng cho admin (kèm đã ẩn). */
export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return deny(request);
    }
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // 'ACTIVE' | 'INACTIVE' | null (tất cả)
    const rows = await dbAll<{
      id: string;
      brand_slug: string;
      name: string;
      address: string;
      lat: number;
      lng: number;
      base_rating: number;
      is_24h: number;
      open_hours: string | null;
      status: string;
    }>(
      status === 'ACTIVE' || status === 'INACTIVE'
        ? `SELECT id, brand_slug, name, address, lat, lng, base_rating, is_24h, open_hours, status
           FROM stores WHERE status = ? ORDER BY name`
        : `SELECT id, brand_slug, name, address, lat, lng, base_rating, is_24h, open_hours, status
           FROM stores ORDER BY name`,
      status === 'ACTIVE' || status === 'INACTIVE' ? [status] : []
    );
    return NextResponse.json({ stores: rows });
  } catch {
    return NextResponse.json(
      { message: 'Không thể tải danh sách cửa hàng.' },
      { status: 500 }
    );
  }
}
