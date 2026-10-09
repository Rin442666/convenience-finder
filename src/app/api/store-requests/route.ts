import { NextResponse } from 'next/server';
import { createStoreRequest, listPendingStoreRequests, updateStoreRequestStatus } from '@/lib/auth-system';
import { findServerUserById, getSessionFromRequest, sessionHasPermission } from '@/lib/server-auth';

export async function GET(req: Request) {
  // Quyền admin được suy ra từ session token đã verify,
  // không tin query param `role` do client gửi lên.
  const session = getSessionFromRequest(req);

  if (!sessionHasPermission(session, 'approve_store_request')) {
    return NextResponse.json({ requests: [] }, { status: 401 });
  }

  return NextResponse.json({ requests: listPendingStoreRequests() });
}

export async function POST(req: Request) {
  try {
    const session = getSessionFromRequest(req);
    const actor = session ? findServerUserById(session.id) : undefined;

    if (!actor || !sessionHasPermission(session, 'submit_store_request')) {
      return NextResponse.json(
        { message: 'Bạn không có quyền gửi yêu cầu thêm cửa hàng.' },
        { status: 403 }
      );
    }

    const body = await req.json();

    // Thông tin người gửi lấy từ session đã xác thực, không lấy từ body.
    const createdRequest = createStoreRequest({
      submittedBy: actor.id,
      submittedByName: actor.fullName,
      storeName: String(body.storeName || '').trim(),
      brandName: String(body.brandName || '').trim(),
      address: String(body.address || '').trim(),
      lat: Number(body.lat || 0),
      lng: Number(body.lng || 0),
      amenities: Array.isArray(body.amenities) ? body.amenities.map(String) : [],
      notes: String(body.notes || '').trim(),
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

    const body = await req.json();
    const status = body.status;

    if (status !== 'APPROVED' && status !== 'REJECTED') {
      return NextResponse.json(
        { message: 'Trạng thái không hợp lệ.' },
        { status: 400 }
      );
    }

    const updated = updateStoreRequestStatus(body.requestId, status);

    if (!updated) {
      return NextResponse.json(
        { message: 'Không tìm thấy yêu cầu cần cập nhật.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ request: updated });
  } catch {
    return NextResponse.json(
      { message: 'Không thể cập nhật trạng thái yêu cầu.' },
      { status: 500 }
    );
  }
}
