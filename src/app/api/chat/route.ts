import { NextResponse } from 'next/server';
import { brands, queryStores, type StoreFilters, type StoreRecord } from '@/lib/store-db';
import {
    detectIntent,
    formatDistance,
    DEFAULT_SUGGESTIONS,
    FIND_SUGGESTIONS,
} from '@/lib/chatbot';

export type ChatStore = {
    id: string;
    name: string;
    address: string;
    brandName: string;
    rating: number;
    ratingCount: number;
    distanceText: string;
    openText: string;
    lat: number;
    lng: number;
    directionsUrl: string;
};

export type ChatMapAction = {
    label: string;
    search?: string;
    brandId?: string;
    amenityIds?: string[];
    openOnly?: boolean;
};

export type ChatResponse = {
    reply: string;
    stores?: ChatStore[];
    suggestions: string[];
    mapAction?: ChatMapAction;
};

const DEFAULT_CENTER = { lat: 21.0285, lng: 105.8542 };
const brandNameOf = (brandId?: string): string =>
    brands.find((b) => b.id === brandId)?.name ?? '';

function toChatStore(
    store: StoreRecord,
    origin: { lat: number; lng: number } | null
): ChatStore {
    const openText = store.is24h ? 'Mở 24h' : store.isOpen ? 'Đang mở' : 'Đã đóng cửa';
    /* Gắn origin (vị trí GPS của người dùng) vào link để Google Maps chỉ
       đường đúng ngay cả khi người dùng chưa cho Google Maps quyền vị trí. */
    const directionsUrl = origin
        ? `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${store.lat},${store.lng}`
        : `https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`;
    return {
        id: store.id,
        name: store.name,
        address: store.address,
        brandName: brandNameOf(store.brandId),
        rating: store.rating,
        ratingCount: store.ratingCount ?? 0,
        distanceText: formatDistance(store.distanceMeters),
        openText,
        lat: store.lat,
        lng: store.lng,
        directionsUrl,
    };
}

function describeFind(intent: Extract<ReturnType<typeof detectIntent>, { kind: 'find' }>): string {
    const parts: string[] = [];
    if (intent.brandName) {
        parts.push(intent.brandName);
    }
    if (intent.amenityNames?.length) {
        parts.push(`có ${intent.amenityNames.join(', ')}`);
    }
    if (intent.want24h) {
        parts.push('mở 24h');
    } else if (intent.openOnly) {
        parts.push('đang mở cửa');
    }
    if (intent.topRated) {
        parts.push('được đánh giá cao nhất');
    }
    return parts.length > 0 ? parts.join(' ') : 'gần bạn nhất';
}

/* POST /api/chat — chatbot rule-based, tìm kiếm từ data cửa hàng. */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const message = String(body?.message ?? '').slice(0, 500);
        const lat = Number(body?.lat);
        const lng = Number(body?.lng);
        /* Chỉ gắn origin vào link chỉ đường khi client gửi vị trí GPS thật
           (không dùng fallback trung tâm Hà Nội). */
        const hasLocation =
            body?.lat != null &&
            body?.lng != null &&
            Number.isFinite(lat) &&
            Number.isFinite(lng);
        const center = {
            lat: Number.isFinite(lat) ? lat : DEFAULT_CENTER.lat,
            lng: Number.isFinite(lng) ? lng : DEFAULT_CENTER.lng,
        };

        const intent = detectIntent(message);

        if (intent.kind === 'greeting') {
            return NextResponse.json<ChatResponse>({
                reply: 'Chào bạn! Mình là trợ lý tìm cửa hàng tiện lợi. Bạn muốn tìm cửa hàng nào, cứ hỏi mình nhé.',
                suggestions: DEFAULT_SUGGESTIONS,
            });
        }
        if (intent.kind === 'thanks') {
            return NextResponse.json<ChatResponse>({
                reply: 'Không có gì! Cần tìm cửa hàng lúc nào thì cứ hỏi mình nhé.',
                suggestions: DEFAULT_SUGGESTIONS,
            });
        }
        if (intent.kind === 'help') {
            return NextResponse.json<ChatResponse>({
                reply: 'Mình có thể giúp bạn: tìm cửa hàng gần nhất theo thương hiệu (Circle K, WinMart+, GS25...), lọc cửa hàng 24h hoặc đang mở, tìm theo tiện ích (Wi-Fi, ATM, chuyển khoản...), xem cửa hàng được đánh giá cao nhất, hoặc hướng dẫn dùng các tính năng của web.',
                suggestions: DEFAULT_SUGGESTIONS,
            });
        }
        if (intent.kind === 'hours') {
            return NextResponse.json<ChatResponse>({
                reply: 'Giờ mở cửa của từng cửa hàng hiện ngay trên thẻ cửa hàng (có nhãn "24h" nếu mở xuyên đêm). Bạn tìm thử một cửa hàng rồi bấm "Chi tiết" để xem giờ cụ thể nhé.',
                suggestions: ['Tìm Circle K gần tôi', 'Cửa hàng 24h'],
            });
        }
        if (intent.kind === 'directions') {
            return NextResponse.json<ChatResponse>({
                reply: 'Để chỉ đường: bấm nút "Chỉ đường" trên thẻ cửa hàng, web sẽ mở Google Maps dẫn đường từ vị trí của bạn tới đó. Hoặc bấm vào từng kết quả bên dưới mình vừa tìm giúp bạn.',
                suggestions: FIND_SUGGESTIONS,
            });
        }
        if (intent.kind === 'rating-howto') {
            return NextResponse.json<ChatResponse>({
                reply: 'Để đánh giá: mở "Chi tiết" của cửa hàng, kéo xuống mục "Đánh giá của bạn", chọn số sao và viết bình luận rồi bấm "Đăng bình luận". Mỗi người được đánh giá 1 lần cho mỗi cửa hàng, đánh giá lại sẽ cập nhật điểm cũ.',
                suggestions: ['Đánh giá cao nhất', 'Tìm Circle K gần tôi'],
            });
        }
        if (intent.kind === 'request-howto') {
            return NextResponse.json<ChatResponse>({
                reply: 'Muốn thêm cửa hàng mới: đăng nhập rồi bấm vào tên tài khoản ở góc phải, chọn "Gửi yêu cầu", điền thông tin cửa hàng và gửi. Admin sẽ duyệt rồi thêm vào bản đồ.',
                suggestions: DEFAULT_SUGGESTIONS,
            });
        }

        if (intent.kind === 'find') {
            const filters: StoreFilters = {
                lat: center.lat,
                lng: center.lng,
                radius: 5000,
                sort: intent.topRated ? 'rating' : 'nearest',
            };
            if (intent.brandId) {
                filters.brandIds = [intent.brandId];
            }
            if (intent.amenityIds?.length) {
                filters.amenityIds = intent.amenityIds;
            }
            if (intent.openOnly) {
                filters.openOnly = true;
            }
            let stores = await queryStores(filters);
            if (intent.want24h) {
                stores = stores.filter((s) => s.is24h);
            }
            const top = stores.slice(0, 5);
            if (top.length === 0) {
                return NextResponse.json<ChatResponse>({
                    reply: 'Mình không tìm thấy cửa hàng nào phù hợp trong bán kính 5km. Bạn thử nới lỏng điều kiện một chút nhé.',
                    suggestions: FIND_SUGGESTIONS,
                });
            }
            const desc = describeFind(intent);
            /* Khoảng cách đường chim bay — trung thực vì quãng đường thực tế
               còn phụ thuộc phương tiện di chuyển của người dùng. */
            return NextResponse.json<ChatResponse>({
                reply: `Tìm thấy ${top.length} cửa hàng ${desc}:`,
                stores: top.map((s) => toChatStore(s, hasLocation ? center : null)),
                suggestions: FIND_SUGGESTIONS,
                mapAction: {
                    label: `Hiện ${top.length} cửa hàng lên bản đồ`,
                    brandId: intent.brandId,
                    amenityIds: intent.amenityIds,
                    openOnly: intent.openOnly,
                },
            });
        }

        return NextResponse.json<ChatResponse>({
            reply: 'Mình chưa hiểu ý bạn lắm. Bạn thử hỏi theo kiểu: "tìm Circle K gần tôi", "cửa hàng 24h", "chỗ nào có Wi-Fi" nhé.',
            suggestions: DEFAULT_SUGGESTIONS,
        });
    } catch {
        return NextResponse.json<ChatResponse>({
            reply: 'Có lỗi xảy ra, bạn thử lại giúp mình nhé.',
            suggestions: DEFAULT_SUGGESTIONS,
        });
    }
}
