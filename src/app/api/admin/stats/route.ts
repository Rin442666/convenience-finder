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

const num = (value: unknown): number => Number(value) || 0;

/* GET /api/admin/stats — số liệu tổng hợp cho tab Thống kê (chỉ admin). */
export async function GET(request: Request) {
    try {
        const admin = await requireAdmin(request);
        if (!admin) {
            return deny(request);
        }

        const [storeCount, userCount, reviewCount, favoriteCount, pendingCount] = await Promise.all([
            dbAll<{ c: unknown }>(`SELECT COUNT(*) AS c FROM stores WHERE status = 'ACTIVE'`),
            dbAll<{ c: unknown }>(`SELECT COUNT(*) AS c FROM users`),
            dbAll<{ c: unknown }>(`SELECT COUNT(*) AS c FROM reviews`),
            dbAll<{ c: unknown }>(`SELECT COUNT(*) AS c FROM favorites`),
            dbAll<{ c: unknown }>(`SELECT COUNT(*) AS c FROM store_requests WHERE status = 'PENDING'`),
        ]);

        const [storesByBrand, ratingDistribution, requestsByStatus, topStores, topAmenities] =
            await Promise.all([
                dbAll<{ name: string; count: unknown }>(
                    `SELECT b.name AS name, COUNT(s.id) AS count
                     FROM stores s JOIN brands b ON b.slug = s.brand_slug
                     WHERE s.status = 'ACTIVE'
                     GROUP BY b.name ORDER BY count DESC`
                ),
                dbAll<{ rating: unknown; count: unknown }>(
                    `SELECT rating, COUNT(*) AS count FROM reviews GROUP BY rating ORDER BY rating`
                ),
                dbAll<{ status: string; count: unknown }>(
                    `SELECT status, COUNT(*) AS count FROM store_requests GROUP BY status`
                ),
                dbAll<{ id: string; name: string; brand_name: string; rating: unknown; rating_count: unknown }>(
                    `SELECT s.id AS id, s.name AS name, COALESCE(b.name, s.brand_slug) AS brand_name,
                            ROUND((s.base_rating * 20 + COALESCE(SUM(r.rating), 0)) / (20 + COUNT(r.rating)), 1) AS rating,
                            (20 + COUNT(r.rating)) AS rating_count
                     FROM stores s
                     LEFT JOIN reviews r ON r.store_id = s.id
                     LEFT JOIN brands b ON b.slug = s.brand_slug
                     WHERE s.status = 'ACTIVE'
                     GROUP BY s.id, s.name, b.name, s.brand_slug, s.base_rating
                     ORDER BY rating DESC, rating_count DESC
                     LIMIT 10`
                ),
                dbAll<{ name: string; count: unknown }>(
                    `SELECT a.name AS name, COUNT(sa.store_id) AS count
                     FROM store_amenities sa JOIN amenities a ON a.slug = sa.amenity_slug
                     GROUP BY a.name ORDER BY count DESC LIMIT 10`
                ),
            ]);

        return NextResponse.json({
            totals: {
                stores: num(storeCount[0]?.c),
                users: num(userCount[0]?.c),
                reviews: num(reviewCount[0]?.c),
                favorites: num(favoriteCount[0]?.c),
                pendingRequests: num(pendingCount[0]?.c),
            },
            storesByBrand: storesByBrand.map((r) => ({ name: r.name, count: num(r.count) })),
            ratingDistribution: ratingDistribution.map((r) => ({ rating: num(r.rating), count: num(r.count) })),
            requestsByStatus: requestsByStatus.map((r) => ({ status: r.status, count: num(r.count) })),
            topStores: topStores.map((r) => ({
                id: r.id,
                name: r.name,
                brandName: r.brand_name,
                rating: num(r.rating),
                ratingCount: num(r.rating_count),
            })),
            topAmenities: topAmenities.map((r) => ({ name: r.name, count: num(r.count) })),
        });
    } catch {
        return NextResponse.json(
            { message: 'Không thể tải số liệu thống kê.' },
            { status: 500 }
        );
    }
}
