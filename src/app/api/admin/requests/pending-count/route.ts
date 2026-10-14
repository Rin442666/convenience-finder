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

/* GET /api/admin/requests/pending-count — số yêu cầu chờ duyệt (chỉ admin).
   Endpoint nhẹ cho header poll để hiện chấm đỏ thông báo. */
export async function GET(request: Request) {
    try {
        const admin = await requireAdmin(request);
        if (!admin) {
            return deny(request);
        }
        const rows = await dbAll<{ c: unknown }>(
            `SELECT COUNT(*) AS c FROM store_requests WHERE status = 'PENDING'`
        );
        return NextResponse.json({ count: Number(rows[0]?.c) || 0 });
    } catch {
        return NextResponse.json(
            { message: 'Không thể tải số yêu cầu chờ duyệt.' },
            { status: 500 }
        );
    }
}
