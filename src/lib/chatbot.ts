/* Logic chatbot rule-based: chuẩn hóa tiếng Việt + nhận diện ý định.
   File thuần túy (không import DB) để dễ unit-test; truy vấn DB nằm ở
   API route /api/chat. Không dùng AI API bên ngoài. */

export type ChatIntent =
    | { kind: 'greeting' }
    | { kind: 'help' }
    | { kind: 'thanks' }
    | { kind: 'hours' }
    | { kind: 'directions' }
    | { kind: 'rating-howto' }
    | { kind: 'request-howto' }
    | {
          kind: 'find';
          brandId?: string;
          brandName?: string;
          amenityIds?: string[];
          amenityNames?: string[];
          want24h?: boolean;
          openOnly?: boolean;
          topRated?: boolean;
          /* Quận/huyện (khóa không dấu, ví dụ 'cau giay') + tên hiển thị. */
          district?: string;
          districtName?: string;
      }
    | { kind: 'fallback' };

/* Bỏ dấu tiếng Việt để so khớp từ khóa: "cửa hàng" -> "cua hang". */
export function normalizeVi(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9\s+]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const BRAND_KEYWORDS: { id: string; name: string; keys: string[] }[] = [
    { id: 'circle-k', name: 'Circle K', keys: ['circle k', 'circlek'] },
    { id: 'winmart', name: 'WinMart+', keys: ['winmart', 'win mart'] },
    { id: 'gs25', name: 'GS25', keys: ['gs25', 'gs 25'] },
    { id: 'familymart', name: 'FamilyMart', keys: ['familymart', 'family mart'] },
    { id: '7-eleven', name: '7-Eleven', keys: ['7 eleven', '7eleven'] },
];

const AMENITY_KEYWORDS: { slug: string; name: string; keys: string[] }[] = [
    { slug: 'wifi', name: 'Wi-Fi', keys: ['wifi', 'wi fi'] },
    { slug: 'cashless', name: 'chuyển khoản', keys: ['chuyen khoan', 'chuyen tien', 'ck', 'qr'] },
    { slug: 'atm', name: 'cây ATM', keys: ['atm', 'rut tien'] },
    { slug: 'delivery', name: 'giao hàng', keys: ['giao hang', 'ship', 'dat hang'] },
    { slug: 'parking', name: 'bãi xe', keys: ['bai xe', 'do xe', 'gui xe', 'cho de xe'] },
    { slug: 'seating', name: 'chỗ ngồi', keys: ['cho ngoi', 'ngoi lai'] },
    { slug: 'wc', name: 'nhà vệ sinh', keys: ['nha ve sinh', 'wc', 'toilet', 've sinh'] },
    { slug: 'coffee', name: 'cà phê pha máy', keys: ['ca phe', 'coffee'] },
    { slug: 'topup', name: 'nạp tiền điện thoại', keys: ['nap tien', 'nap card'] },
    { slug: 'bill_payment', name: 'thanh toán hóa đơn', keys: ['thanh toan hoa don', 'dong tien dien', 'hoa don'] },
    { slug: 'hot_water', name: 'nước nóng', keys: ['nuoc nong'] },
    { slug: 'microwave', name: 'lò vi sóng', keys: ['lo vi song', 'ham nong'] },
    { slug: 'fresh_food', name: 'đồ ăn nóng', keys: ['do an nong', 'do an'] },
    { slug: 'charging', name: 'ổ cắm sạc', keys: ['o cam', 'sac dien thoai', 'sac pin'] },
    { slug: 'overnight', name: 'cho phép qua đêm', keys: ['qua dem', 'xuyen dem'] },
    { slug: 'outdoor', name: 'chỗ ngồi ngoài trời', keys: ['ngoai troi'] },
    { slug: 'parcel', name: 'nhận/gửi bưu kiện', keys: ['buu kien', 'buu dien', 'gui hang'] },
    { slug: 'print_scan', name: 'in ấn/scan', keys: ['in an', 'scan', 'photocopy'] },
    { slug: 'medicine', name: 'thuốc cơ bản', keys: ['thuoc'] },
    { slug: 'lottery', name: 'vé số', keys: ['ve so', 'xo so'] },
    { slug: 'ev_charging', name: 'trạm sạc xe điện', keys: ['sac xe dien', 'tram sac'] },
];

/* Quận/huyện Hà Nội (khóa không dấu để so khớp sau normalizeVi).
   So khớp dạng chuỗi con nên "quận cầu giấy" hay "q. cầu giấy" đều
   bắt được qua khóa "cau giay". Địa chỉ trong DB có ghi tên quận. */
const DISTRICT_KEYWORDS: { key: string; name: string }[] = [
    { key: 'cau giay', name: 'Cầu Giấy' },
    { key: 'dong da', name: 'Đống Đa' },
    { key: 'hoan kiem', name: 'Hoàn Kiếm' },
    { key: 'ba dinh', name: 'Ba Đình' },
    { key: 'hai ba trung', name: 'Hai Bà Trưng' },
    { key: 'thanh xuan', name: 'Thanh Xuân' },
    { key: 'hoang mai', name: 'Hoàng Mai' },
    { key: 'long bien', name: 'Long Biên' },
    { key: 'tay ho', name: 'Tây Hồ' },
    { key: 'nam tu liem', name: 'Nam Từ Liêm' },
    { key: 'bac tu liem', name: 'Bắc Từ Liêm' },
    { key: 'ha dong', name: 'Hà Đông' },
    { key: 'thanh tri', name: 'Thanh Trì' },
    { key: 'gia lam', name: 'Gia Lâm' },
    { key: 'dong anh', name: 'Đông Anh' },
    { key: 'soc son', name: 'Sóc Sơn' },
    { key: 'son tay', name: 'Sơn Tây' },
    { key: 'me linh', name: 'Mê Linh' },
    { key: 'dan phuong', name: 'Đan Phượng' },
    { key: 'hoai duc', name: 'Hoài Đức' },
    { key: 'quoc oai', name: 'Quốc Oai' },
    { key: 'thach that', name: 'Thạch Thất' },
    { key: 'chuong my', name: 'Chương Mỹ' },
    { key: 'thanh oai', name: 'Thanh Oai' },
    { key: 'thuong tin', name: 'Thường Tín' },
    { key: 'phu xuyen', name: 'Phú Xuyên' },
    { key: 'ung hoa', name: 'Ứng Hòa' },
    { key: 'my duc', name: 'Mỹ Đức' },
    { key: 'ba vi', name: 'Ba Vì' },
    { key: 'phuc tho', name: 'Phúc Thọ' },
];

const hasAny = (text: string, patterns: RegExp[]): boolean => patterns.some((p) => p.test(text));
const includesAny = (text: string, keys: string[]): boolean => keys.some((k) => text.includes(k));

export function detectIntent(rawMessage: string): ChatIntent {
    const text = normalizeVi(rawMessage);
    if (!text) {
        return { kind: 'fallback' };
    }

    if (hasAny(text, [/\bchao\b/, /^hi\b/, /\bhello\b/, /xin chao/])) {
        return { kind: 'greeting' };
    }
    if (includesAny(text, ['cam on', 'thank'])) {
        return { kind: 'thanks' };
    }
    if (hasAny(text, [/giup/, /huong dan/, /lam duoc gi/, /co the lam gi/])) {
        return { kind: 'help' };
    }
    if (hasAny(text, [/chi duong/, /duong di/, /\bdi den\b/, /lam sao den/, /dan duong/])) {
        return { kind: 'directions' };
    }
    if (hasAny(text, [/gio mo cua/, /may gio mo/, /may gio dong/, /gio dong cua/, /mo den may gio/])) {
        return { kind: 'hours' };
    }
    if (hasAny(text, [/danh gia/, /rate/, /vote/, /sao/]) && !hasAny(text, [/cao/, /tot nhat/, /nhieu nhat/])) {
        return { kind: 'rating-howto' };
    }
    if (hasAny(text, [/gui yeu cau/, /them cua hang/, /de xuat/, /yeu cau them/])) {
        return { kind: 'request-howto' };
    }

    const brand = BRAND_KEYWORDS.find((b) => includesAny(text, b.keys));
    const amenities = AMENITY_KEYWORDS.filter((a) => includesAny(text, a.keys));
    /* Khớp quận theo ranh giới từ (\\b) — khớp chuỗi con thô sẽ nhận
       nhầm "hà đông đang mở" thành "đống đa" vì "dong dang" chứa "dong da". */
    const district = DISTRICT_KEYWORDS.find((d) => new RegExp(`\\b${d.key}\\b`).test(text));
    const want24h = hasAny(text, [/\b24\s*h\b/, /24\/7/, /xuyen dem/, /ca dem/]);
    const openOnly = hasAny(text, [/dang mo/, /\bmo cua\b/, /con mo/]);
    const topRated = hasAny(text, [/danh gia cao/, /tot nhat/, /ngon nhat/, /uy tin/, /chat luong/]);
    const wantsFind = hasAny(text, [
        /\btim\b/,
        /gan toi/,
        /gan nhat/,
        /gan day/,
        /cua hang/,
        /\bo dau\b/,
        /cho nao/,
        /quan nao/,
    ]);

    if (brand || amenities.length > 0 || want24h || openOnly || topRated || district || wantsFind) {
        return {
            kind: 'find',
            brandId: brand?.id,
            brandName: brand?.name,
            amenityIds: amenities.map((a) => a.slug),
            amenityNames: amenities.map((a) => a.name),
            want24h: want24h || undefined,
            openOnly: openOnly || undefined,
            topRated: topRated || undefined,
            district: district?.key,
            districtName: district?.name,
        };
    }
    return { kind: 'fallback' };
}

export function formatDistance(meters?: number): string {
    if (meters === undefined || meters === null || Number.isNaN(meters)) {
        return '';
    }
    if (meters < 1000) {
        return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
}

export const DEFAULT_SUGGESTIONS = [
    'Tìm Circle K gần tôi',
    'Cửa hàng 24h',
    'Đánh giá cao nhất',
    'Chỗ nào có Wi-Fi',
];

export const FIND_SUGGESTIONS = [
    'Tìm WinMart+ gần tôi',
    'Cửa hàng đang mở',
    'Chỗ nào có ATM',
    'Đánh giá cao nhất',
];
