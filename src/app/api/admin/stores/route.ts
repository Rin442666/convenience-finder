import { NextResponse } from 'next/server';
import { dbAll, dbGet } from '@/lib/db';
import { getSessionFromRequest, requireAdmin } from '@/lib/server-auth';
import { addStoreToSeed, type StoreRecord } from '@/lib/store-db';
import { vBool, vLatLng, vOptionalText, vSlugList, vText } from '@/lib/validate';

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

/**
 * POST /api/admin/stores — admin thêm cửa hàng trực tiếp (chỉ admin).
 * Validate toàn bộ: tên/địa chỉ bắt buộc, thương hiệu + tiện ích phải có
 * trong danh mục, tọa độ phải là vị trí thật (không nhận 0,0).
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return deny(request);
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ message: 'Dữ liệu không hợp lệ.' }, { status: 400 });
    }

    const name = vText(body.name, 'Tên cửa hàng', { min: 2, max: 120 });
    if (!name.ok) {
      return NextResponse.json({ message: name.error }, { status: 400 });
    }
    const address = vText(body.address, 'Địa chỉ', { min: 5, max: 255 });
    if (!address.ok) {
      return NextResponse.json({ message: address.error }, { status: 400 });
    }
    const brandSlug = vText(body.brand_slug, 'Thương hiệu', { min: 1, max: 64 });
    if (!brandSlug.ok) {
      return NextResponse.json({ message: brandSlug.error }, { status: 400 });
    }
    const brand = await dbGet<{ slug: string }>('SELECT slug FROM brands WHERE slug = ?', [
      brandSlug.value,
    ]);
    if (!brand) {
      return NextResponse.json({ message: 'Thương hiệu không tồn tại.' }, { status: 400 });
    }
    const coords = vLatLng(body.lat, body.lng);
    if (!coords.ok) {
      return NextResponse.json({ message: coords.error }, { status: 400 });
    }
    let is24h = false;
    if (body.is_24h !== undefined) {
      const flag = vBool(body.is_24h, 'Mở 24/7');
      if (!flag.ok) {
        return NextResponse.json({ message: flag.error }, { status: 400 });
      }
      is24h = flag.value;
    }
    const openHours = vOptionalText(body.open_hours, 'Giờ mở cửa', 64);
    if (!openHours.ok) {
      return NextResponse.json({ message: openHours.error }, { status: 400 });
    }
    let amenitySlugs: string[] = [];
    if (body.amenities !== undefined) {
      const list = vSlugList(body.amenities, 'Tiện ích');
      if (!list.ok) {
        return NextResponse.json({ message: list.error }, { status: 400 });
      }
      amenitySlugs = list.value;
      for (const slug of amenitySlugs) {
        const exists = await dbGet<{ slug: string }>('SELECT slug FROM amenities WHERE slug = ?', [
          slug,
        ]);
        if (!exists) {
          return NextResponse.json(
            { message: `Tiện ích không tồn tại: ${slug}.` },
            { status: 400 }
          );
        }
      }
    }

    const store: StoreRecord = {
      id: `store-admin-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      brandId: brandSlug.value,
      name: name.value,
      address: address.value,
      lat: coords.value.lat,
      lng: coords.value.lng,
      rating: 0,
      isOpen: true,
      is24h,
      openHours: openHours.value || undefined,
      amenities: amenitySlugs,
    };
    await addStoreToSeed(store);
    return NextResponse.json(
      { message: 'Đã thêm cửa hàng.', store: { id: store.id } },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { message: 'Không thể thêm cửa hàng.' },
      { status: 500 }
    );
  }
}
