import { NextResponse } from 'next/server';
import { createStoreRequest, listPendingStoreRequests, updateStoreRequestStatus } from '@/lib/store-requests';
import { findServerUserById, getSessionFromRequest, sessionHasPermission } from '@/lib/server-auth';
import { addStoreToSeed, findBrandByName, listAmenitiesDb, type StoreRecord } from '@/lib/store-db';
import { vLatLng, vOptionalText, vSlugList, vText } from '@/lib/validate';

export async function GET(req: Request) {
  /* Quyền admin được suy ra từ session token đã verify,
     không tin query param `role` do client gửi lên. */
  const session = getSessionFromRequest(req);

  if (!sessionHasPermission(session, 'approve_store_request')) {
    return NextResponse.json({ requests: [] }, { status: 401 });
  }

  return NextResponse.json({ requests: await listPendingStoreRequests() });
}

export async function POST(req: Request) {
  try {
    const session = getSessionFromRequest(req);
    const actor = session ? await findServerUserById(session.id) : undefined;

    if (!actor || !sessionHasPermission(session, 'submit_store_request')) {
      return NextResponse.json(
        { message: 'Bạn không có quyền gửi yêu cầu thêm cửa hàng.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ message: 'Dữ liệu không hợp lệ.' }, { status: 400 });
    }

    /* Validate toàn bộ trường trước khi lưu: tên/địa chỉ/thương hiệu bắt
       buộc, tọa độ phải là vị trí thật đã chọn trên bản đồ, tiện ích chỉ
       nhận slug có trong danh mục. */
    const storeName = vText(body.storeName, 'Tên cửa hàng', { min: 2, max: 120 });
    if (!storeName.ok) {
      return NextResponse.json({ message: storeName.error }, { status: 400 });
    }
    const brandName = vText(body.brandName, 'Thương hiệu', { min: 1, max: 60 });
    if (!brandName.ok) {
      return NextResponse.json({ message: brandName.error }, { status: 400 });
    }
    const address = vText(body.address, 'Địa chỉ', { min: 5, max: 255 });
    if (!address.ok) {
      return NextResponse.json({ message: address.error }, { status: 400 });
    }
    const coords = vLatLng(body.lat, body.lng);
    if (!coords.ok) {
      return NextResponse.json({ message: coords.error }, { status: 400 });
    }
    let amenityIds: string[] = [];
    if (body.amenities !== undefined) {
      const list = vSlugList(body.amenities, 'Tiện ích');
      if (!list.ok) {
        return NextResponse.json({ message: list.error }, { status: 400 });
      }
      const validIds = new Set((await listAmenitiesDb()).map((a) => a.id));
      amenityIds = list.value.filter((slug) => validIds.has(slug));
    }
    const notes = vOptionalText(body.notes, 'Ghi chú', 500);
    if (!notes.ok) {
      return NextResponse.json({ message: notes.error }, { status: 400 });
    }

    // Thông tin người gửi lấy từ session đã xác thực, không lấy từ body.
    const createdRequest = await createStoreRequest({
      submittedBy: actor.id,
      submittedByName: actor.fullName,
      storeName: storeName.value,
      brandName: brandName.value,
      address: address.value,
      lat: coords.value.lat,
      lng: coords.value.lng,
      amenities: amenityIds,
      notes: notes.value || '',
    });


    return NextResponse.json({
      request: createdRequest,
      message: 'Yêu cầu thêm cửa hàng đã được gửi cho Admin.',
    });
  } catch {
    return NextResponse.json(
      { message: 'Không thể gửi yêu cầu thêm cửa hàng.' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const session = getSessionFromRequest(req);

    if (!sessionHasPermission(session, 'approve_store_request')) {
      return NextResponse.json(
        { message: 'Chỉ Admin mới được xác nhận yêu cầu cửa hàng.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => null);
    const status = body?.status;

    if (status !== 'APPROVED' && status !== 'REJECTED') {
      return NextResponse.json(
        { message: 'Trạng thái không hợp lệ.' },
        { status: 400 }
      );
    }
    if (typeof body?.requestId !== 'string' || !body.requestId.trim()) {
      return NextResponse.json(
        { message: 'Thiếu mã yêu cầu (requestId).' },
        { status: 400 }
      );
    }

    const updated = await updateStoreRequestStatus(body.requestId, status);

    if (!updated) {
      return NextResponse.json(
        { message: 'Không tìm thấy yêu cầu cần cập nhật.' },
        { status: 404 }
      );
    }


    if (updated.status === 'APPROVED' && Number.isFinite(updated.lat) && Number.isFinite(updated.lng) && updated.lat !== 0 && updated.lng !== 0) {
      const brand = await findBrandByName(updated.brandName);
      const dbAmenities = await listAmenitiesDb();
      const validAmenityIds = dbAmenities.map((amenity) => amenity.id);
      const newStore: StoreRecord = {
        id: `store-req-${updated.id}`,
        brandId: brand ? brand.id : 'other',
        name: updated.storeName,
        address: updated.address,
        lat: updated.lat,
        lng: updated.lng,
        rating: 0,
        isOpen: true,
        is24h: false,
        amenities: updated.amenities.filter((amenityId) => validAmenityIds.includes(amenityId)),
      };
      await addStoreToSeed(newStore);
    }

    return NextResponse.json({ request: updated });
  } catch {
    return NextResponse.json(
      { message: 'Không thể cập nhật trạng thái yêu cầu.' },
      { status: 500 }
    );
  }
}
