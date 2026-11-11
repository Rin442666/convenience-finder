import { NextResponse } from 'next/server';
import {
    brands,
    getStationsNearPoint,
    getStoreStationSummary,
    queryStores,
    type StoreFilters,
    type StoreRecord,
} from '@/lib/store-db';
import { dbAll } from '@/lib/db';
import { geocodeAddress } from '@/lib/geocode';
import {
    detectIntent,
    formatDistance,
    normalizeVi,
    DEFAULT_SUGGESTIONS,
    FIND_SUGGESTIONS,
    STATION_SUGGESTIONS,
    type StationType,
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
    /* Dòng tóm tắt trạm gần nhất (🚌/⚡/⛽ + khoảng cách) — thẻ nào
       cũng có vì luôn tra được trạm gần nhất của cửa hàng. */
    stationText?: string;
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
    origin: { lat: number; lng: number } | null,
    stationText?: string
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
        stationText,
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
    if (intent.districtName) {
        parts.push(`ở ${intent.districtName}`);
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
                reply: 'Mình có thể giúp bạn: tìm cửa hàng gần nhất theo thương hiệu (Circle K, WinMart+, GS25...), lọc cửa hàng 24h hoặc đang mở, tìm theo tiện ích (Wi-Fi, ATM, chuyển khoản...), xem cửa hàng được đánh giá cao nhất, hỏi trạm xe buýt / trạm sạc / cây xăng gần một cửa hàng hoặc một địa chỉ, hoặc hướng dẫn dùng các tính năng của web.',
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

        if (intent.kind === 'station') {
            const typeLabel: Record<StationType, string> = {
                bus: 'Trạm xe buýt',
                charging: 'Trạm sạc xe điện',
                gas: 'Cây xăng',
            };
            const typeEmoji: Record<StationType, string> = { bus: '🚌', charging: '⚡', gas: '⛽' };

            /* 1) Ưu tiên khớp tên cửa hàng trong câu hỏi — hỏi theo tên
               cửa hàng là cách hỏi tự nhiên nhất cho thông tin này. So
               cả tên đầy đủ lẫn tên bỏ tiền tố thương hiệu (ví dụ
               "hongkong tower" của "WinMart HongKong Tower"). */
            const msgNorm = normalizeVi(message);
            const storeRows = await dbAll<{ id: string; name: string; address: string }>(
                "SELECT id, name, address FROM stores WHERE status = 'ACTIVE'"
            );
            const BRAND_HEADS = [
                'winmart+', 'winmart', 'circle k', 'gs25', 'familymart', 'family mart',
                '7 eleven', 'agami', 'ohmee', 'ministop', 'tops daily', 'tops',
            ];
            type NameCandidate = { id: string; name: string; address: string; score: number };
            const candidates: NameCandidate[] = [];
            for (const row of storeRows) {
                const nname = normalizeVi(row.name);
                if (!nname) continue;
                let score = 0;
                if (msgNorm.includes(nname)) {
                    score = nname.length;
                }
                const parts = nname.split(' ');
                for (let cut = 1; cut <= 2 && cut < parts.length; cut++) {
                    if (BRAND_HEADS.includes(parts.slice(0, cut).join(' '))) {
                        const rest = parts.slice(cut).join(' ');
                        if (rest.length >= 4 && msgNorm.includes(rest)) {
                            score = Math.max(score, rest.length);
                        }
                    }
                }
                if (score > 0) {
                    candidates.push({ ...row, score });
                }
            }
            candidates.sort((a, b) => b.score - a.score);
            const bestScore = candidates[0]?.score ?? 0;
            const best = candidates.filter((c) => c.score === bestScore && c.score > 0);
            if (best.length === 1) {
                const store = best[0];
                const summary = await getStoreStationSummary(store.id);
                if (summary) {
                    const lines: string[] = [`Quanh ${store.name} (${store.address}):`];
                    lines.push(
                        summary.bus
                            ? `🚌 Trạm bus gần nhất: ${summary.bus.name} — cách ${formatDistance(summary.bus.distanceMeters)}${summary.bus.routes ? `. Tuyến: ${summary.bus.routes}` : ''}${summary.bus.withinRadius ? '' : ' (trạm gần nhất, ngoài 500 m)'}`
                            : '🚌 Chưa có dữ liệu trạm bus.'
                    );
                    lines.push(
                        summary.charging
                            ? `⚡ Trạm sạc gần nhất: ${summary.charging.name} — cách ${formatDistance(summary.charging.distanceMeters)}${summary.charging.operator ? ` (${summary.charging.operator})` : ''}${summary.charging.withinRadius ? '' : ' (trạm gần nhất, ngoài 1 km)'}`
                            : '⚡ Chưa có dữ liệu trạm sạc.'
                    );
                    lines.push(
                        summary.gas
                            ? `⛽ Cây xăng gần nhất: ${summary.gas.name} — cách ${formatDistance(summary.gas.distanceMeters)}${summary.gas.operator ? ` (${summary.gas.operator})` : ''}${summary.gas.withinRadius ? '' : ' (cây xăng gần nhất, ngoài 1 km)'}`
                            : '⛽ Chưa có dữ liệu cây xăng.'
                    );
                    return NextResponse.json<ChatResponse>({
                        reply: lines.join('\n'),
                        suggestions: STATION_SUGGESTIONS,
                    });
                }
            }
            if (best.length > 1) {
                return NextResponse.json<ChatResponse>({
                    reply: `Có ${best.length} cửa hàng khớp với tên bạn nói: ${best
                        .slice(0, 3)
                        .map((c) => c.name)
                        .join('; ')}. Bạn hỏi cửa hàng nào nhỉ?`,
                    suggestions: STATION_SUGGESTIONS,
                });
            }

            /* 2) Theo điểm: có địa chỉ thì geocode, không thì dùng GPS. */
            let point: { lat: number; lng: number } | null = null;
            let pointLabel = '';
            if (intent.addressText) {
                /* Địa chỉ có số nhà: thử dạng "<số> đường <tên>" trước —
                   Nominatim hiểu dạng này đúng phố hơn hẳn dạng trần
                   "<số> <tên>" (dễ nhầm sang phố khác cùng số nhà). */
                const houseMatch = intent.addressText.match(/^(\d+)\s+(.+)$/);
                const queries = houseMatch
                    ? [`${houseMatch[1]} đường ${houseMatch[2]}`, intent.addressText]
                    : [intent.addressText];
                for (const q of queries) {
                    const geo = await geocodeAddress(q);
                    if (geo) {
                        point = { lat: geo.lat, lng: geo.lng };
                        pointLabel = geo.displayName.split(',').slice(0, 3).join(',');
                        break;
                    }
                }
            }
            if (!point && hasLocation) {
                point = center;
                pointLabel = 'vị trí của bạn';
            }
            if (!point) {
                return NextResponse.json<ChatResponse>({
                    reply: intent.addressText
                        ? `Mình không tìm thấy địa chỉ "${intent.addressText}" trên bản đồ. Bạn thử ghi rõ số nhà + tên đường, hoặc hỏi theo tên cửa hàng (ví dụ: "WinMart ... có gần trạm bus không") nhé.`
                        : 'Bạn muốn hỏi trạm quanh đâu? Cho mình một địa chỉ hoặc tên cửa hàng, hoặc bật định vị rồi hỏi kiểu "trạm bus gần tôi" nhé.',
                    suggestions: STATION_SUGGESTIONS,
                });
            }
            const sections: string[] = [];
            for (const t of intent.types) {
                const list = await getStationsNearPoint(point.lat, point.lng, t);
                if (list.length === 0) {
                    sections.push(`${typeEmoji[t]} Chưa có dữ liệu ${typeLabel[t].toLowerCase()}.`);
                    continue;
                }
                const head = list[0].withinRadius
                    ? `${typeEmoji[t]} ${typeLabel[t]} quanh ${pointLabel}:`
                    : `${typeEmoji[t]} Không có ${typeLabel[t].toLowerCase()} nào trong 1 km quanh ${pointLabel} — gần nhất là:`;
                const items = list.map(
                    (st) =>
                        `• ${st.name} — cách ${formatDistance(st.distanceMeters)}${st.routes ? ` (tuyến ${st.routes})` : ''}${st.operator ? ` (${st.operator})` : ''}`
                );
                sections.push([head, ...items].join('\n'));
            }
            return NextResponse.json<ChatResponse>({
                reply: sections.join('\n'),
                suggestions: STATION_SUGGESTIONS,
            });
        }

        if (intent.kind === 'find') {
            /* Tìm theo quận thì bỏ giới hạn 5km quanh GPS (quận hỏi tới
               có thể ở xa vị trí hiện tại) — lấy toàn Hà Nội rồi lọc
               theo địa chỉ bên dưới. */
            const filters: StoreFilters = {
                lat: center.lat,
                lng: center.lng,
                radius: intent.district ? 100000 : 5000,
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
            if (intent.district) {
                const key = intent.district;
                stores = stores.filter((s) => normalizeVi(s.address).includes(key));
            }
            const top = stores.slice(0, 5);
            if (top.length === 0) {
                return NextResponse.json<ChatResponse>({
                    reply: intent.districtName
                        ? `Mình không tìm thấy cửa hàng nào ở ${intent.districtName}. Bạn thử quận khác hoặc nới lỏng điều kiện một chút nhé.`
                        : 'Mình không tìm thấy cửa hàng nào phù hợp trong bán kính 5km. Bạn thử nới lỏng điều kiện một chút nhé.',
                    suggestions: FIND_SUGGESTIONS,
                });
            }
            const desc = describeFind(intent);
            /* Khoảng cách đường chim bay — trung thực vì quãng đường thực tế
               còn phụ thuộc phương tiện di chuyển của người dùng. */
            return NextResponse.json<ChatResponse>({
                reply: `Tìm thấy ${top.length} cửa hàng ${desc}:`,
                stores: await Promise.all(
                    top.map(async (s) => {
                        const sum = await getStoreStationSummary(s.id);
                        let stationText: string | undefined;
                        if (sum) {
                            const parts: string[] = [];
                            if (sum.bus) parts.push(`🚌 ${formatDistance(sum.bus.distanceMeters)}`);
                            if (sum.charging) parts.push(`⚡ ${formatDistance(sum.charging.distanceMeters)}`);
                            if (sum.gas) parts.push(`⛽ ${formatDistance(sum.gas.distanceMeters)}`);
                            if (parts.length > 0) stationText = parts.join(' · ');
                        }
                        return toChatStore(s, hasLocation ? center : null, stationText);
                    })
                ),
                suggestions: FIND_SUGGESTIONS,
                mapAction: {
                    label: `Hiện ${top.length} cửa hàng lên bản đồ`,
                    search: intent.districtName,
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
