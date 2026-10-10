import { NextResponse } from 'next/server';
import { getSessionFromRequest, requireAdmin } from '@/lib/server-auth';
import { createAmenity, listAmenitiesDb } from '@/lib/store-db';

function deny(request: Request) {
  const session = getSessionFromRequest(request);
  return NextResponse.json(
    { message: session ? 'Bạn không có quyền thực hiện hành động này.' : 'Bạn cần đăng nhập.' },
    { status: session ? 403 : 401 }
  );
}

/** GET /api/admin/amenities — danh sách tiện ích (chỉ admin). */
export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return deny(request);
    }
    const amenities = await listAmenitiesDb();
    return NextResponse.json({ amenities });
  } catch {
    return NextResponse.json(
      { message: 'Không thể tải danh sách tiện ích.' },
      { status: 500 }
    );
  }
}

/** POST /api/admin/amenities — thêm tiện ích (chỉ admin). */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return deny(request);
    }
    const body = await request.json();
    const result = await createAmenity(String(body?.slug || ''), String(body?.name || ''));
    if (result.error) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { message: 'Không thể thêm tiện ích.' },
      { status: 500 }
    );
  }
}
