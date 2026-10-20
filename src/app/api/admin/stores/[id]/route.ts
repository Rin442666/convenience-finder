import { NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun } from '@/lib/db';
import { getSessionFromRequest, requireAdmin } from '@/lib/server-auth';
import { vBool, vLat, vLng, vOptionalText, vSlugList, vText } from '@/lib/validate';

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
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ message: 'Dữ liệu không hợp lệ.' }, { status: 400 });
    }

    const existing = await dbGet<{ id: string }>(`SELECT id FROM stores WHERE id = ?`, [id]);
    if (!existing) {
      return NextResponse.json({ message: 'Cửa hàng không tồn tại.' }, { status: 404 });
    }

    /* Validate chặt: trường nào gửi lên mà sai định dạng → 400 ngay,
       không lặng lẽ bỏ qua như trước. */
    const updates: string[] = [];
    const values: unknown[] = [];
    const bad = (error: string) => NextResponse.json({ message: error }, { status: 400 });

    if (body.name !== undefined) {
      const name = vText(body.name, 'Tên cửa hàng', { min: 1, max: 120 });
      if (!name.ok) return bad(name.error);
      updates.push('name = ?');
      values.push(name.value);
    }
    if (body.address !== undefined) {
      const address = vText(body.address, 'Địa chỉ', { min: 1, max: 255 });
      if (!address.ok) return bad(address.error);
      updates.push('address = ?');
      values.push(address.value);
    }
    if (body.brand_slug !== undefined) {
      const brandSlug = vText(body.brand_slug, 'Thương hiệu', { min: 1, max: 64 });
      if (!brandSlug.ok) return bad(brandSlug.error);
      const brand = await dbGet<{ slug: string }>('SELECT slug FROM brands WHERE slug = ?', [
        brandSlug.value,
      ]);
      if (!brand) return bad('Thương hiệu không tồn tại.');
      updates.push('brand_slug = ?');
      values.push(brandSlug.value);
    }
    if (body.lat !== undefined) {
      const lat = vLat(body.lat);
      if (!lat.ok) return bad(lat.error);
      updates.push('lat = ?');
      values.push(lat.value);
    }
    if (body.lng !== undefined) {
      const lng = vLng(body.lng);
      if (!lng.ok) return bad(lng.error);
      updates.push('lng = ?');
      values.push(lng.value);
    }
    if (body.open_hours !== undefined) {
      const openHours = vOptionalText(body.open_hours, 'Giờ mở cửa', 64);
      if (!openHours.ok) return bad(openHours.error);
      updates.push('open_hours = ?');
      values.push(openHours.value);
    }
    if (body.is_24h !== undefined) {
      const flag = vBool(body.is_24h, 'Mở 24/7');
      if (!flag.ok) return bad(flag.error);
      updates.push('is_24h = ?');
      values.push(flag.value ? 1 : 0);
    }
    if (body.status !== undefined) {
      if (body.status !== 'ACTIVE' && body.status !== 'INACTIVE') {
        return bad('Trạng thái cửa hàng không hợp lệ.');
      }
      updates.push('status = ?');
      values.push(body.status);
    }

    let amenitySlugs: string[] | null = null;
    if (body.amenities !== undefined) {
      const list = vSlugList(body.amenities, 'Tiện ích');
      if (!list.ok) return bad(list.error);
      amenitySlugs = list.value;
      for (const slug of amenitySlugs) {
        const exists = await dbGet<{ slug: string }>(
          'SELECT slug FROM amenities WHERE slug = ?',
          [slug]
        );
        if (!exists) return bad(`Tiện ích không tồn tại: ${slug}.`);
      }
    }

    if (updates.length === 0 && amenitySlugs === null) {
      return NextResponse.json({ message: 'Không có gì để cập nhật.' }, { status: 400 });
    }

    if (updates.length > 0) {
      await dbRun(`UPDATE stores SET ${updates.join(', ')} WHERE id = ?`, [...values, id]);
    }

    // Đồng bộ tiện ích (nếu gửi kèm mảng slug đã validate).
    if (amenitySlugs !== null) {
      await dbRun(`DELETE FROM store_amenities WHERE store_id = ?`, [id]);
      for (const slug of amenitySlugs) {
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
