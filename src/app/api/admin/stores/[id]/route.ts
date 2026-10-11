import { NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun } from '@/lib/db';
import { getSessionFromRequest, requireAdmin } from '@/lib/server-auth';

function deny(request: Request) {
  const session = getSessionFromRequest(request);
  return NextResponse.json(
    { message: session ? 'Bạn không có quyền thực hiện hành động này.' : 'Bạn cần đăng nhập.' },
    { status: session ? 403 : 401 }
  );
}

type Params = { params: Promise<{ id: string }> };

/** GET /api/admin/stores/[id] — chi tiết cửa hàng kèm tiện ích (chỉ admin). */
export async function GET(request: Request, { params }: Params) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return deny(request);
    }
    const { id } = await params;
    const store = await dbGet<{
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
      `SELECT id, brand_slug, name, address, lat, lng, base_rating, is_24h, open_hours, status
       FROM stores WHERE id = ?`,
      [id]
    );
    if (!store) {
      return NextResponse.json({ message: 'Cửa hàng không tồn tại.' }, { status: 404 });
    }
    const amenityRows = await dbAll<{ amenity_slug: string }>(
      `SELECT amenity_slug FROM store_amenities WHERE store_id = ?`,
      [id]
    );
    return NextResponse.json({
      store: { ...store, amenities: amenityRows.map((r) => r.amenity_slug) },
    });
  } catch {
    return NextResponse.json(
      { message: 'Không thể tải cửa hàng.' },
      { status: 500 }
    );
  }
}

/** PATCH /api/admin/stores/[id] — sửa thông tin cửa hàng (chỉ admin). */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return deny(request);
    }
    const { id } = await params;
    const body = await request.json();

    const existing = await dbGet<{ id: string }>(`SELECT id FROM stores WHERE id = ?`, [id]);
    if (!existing) {
      return NextResponse.json({ message: 'Cửa hàng không tồn tại.' }, { status: 404 });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    const setIfPresent = (column: string, value: unknown, validate?: (v: unknown) => boolean) => {
      if (value !== undefined && (!validate || validate(value))) {
        updates.push(`${column} = ?`);
        values.push(value);
      }
    };

    setIfPresent('name', typeof body?.name === 'string' ? body.name.trim() : undefined, (v) => (v as string).length > 0 && (v as string).length <= 120);
    setIfPresent('address', typeof body?.address === 'string' ? body.address.trim() : undefined, (v) => (v as string).length <= 255);
    setIfPresent('brand_slug', body?.brand_slug, (v) => typeof v === 'string' && v.length > 0 && v.length <= 64);
    setIfPresent('lat', body?.lat, (v) => typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90);
    setIfPresent('lng', body?.lng, (v) => typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180);
    setIfPresent('open_hours', body?.open_hours === null ? null : typeof body?.open_hours === 'string' ? body.open_hours.trim().slice(0, 64) : undefined);
    setIfPresent('is_24h', body?.is_24h === undefined ? undefined : body.is_24h ? 1 : 0);
    setIfPresent('status', body?.status, (v) => v === 'ACTIVE' || v === 'INACTIVE');

    if (updates.length === 0) {
      return NextResponse.json({ message: 'Không có gì để cập nhật.' }, { status: 400 });
    }

    await dbRun(`UPDATE stores SET ${updates.join(', ')} WHERE id = ?`, [...values, id]);

    // Đồng bộ tiện ích (nếu gửi kèm mảng slug).
    if (Array.isArray(body?.amenities)) {
      const slugs = body.amenities.filter((s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= 64);
      await dbRun(`DELETE FROM store_amenities WHERE store_id = ?`, [id]);
      for (const slug of slugs) {
        await dbRun(`INSERT INTO store_amenities (store_id, amenity_slug) VALUES (?, ?)`, [id, slug]);
      }
    }

    return NextResponse.json({ message: 'Đã cập nhật cửa hàng.' });
  } catch {
    return NextResponse.json(
      { message: 'Không thể cập nhật cửa hàng.' },
      { status: 500 }
    );
  }
}

/** DELETE /api/admin/stores/[id] — ẩn cửa hàng (xóa mềm, chỉ admin). */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return deny(request);
    }
    const { id } = await params;
    const existing = await dbGet<{ id: string }>(`SELECT id FROM stores WHERE id = ?`, [id]);
    if (!existing) {
      return NextResponse.json({ message: 'Cửa hàng không tồn tại.' }, { status: 404 });
    }
    // Xóa mềm: giữ lại reviews/favorites, chỉ ẩn khỏi danh sách chung.
    await dbRun(`UPDATE stores SET status = 'INACTIVE' WHERE id = ?`, [id]);
    return NextResponse.json({ message: 'Đã ẩn cửa hàng.' });
  } catch {
    return NextResponse.json(
      { message: 'Không thể ẩn cửa hàng.' },
      { status: 500 }
    );
  }
}
