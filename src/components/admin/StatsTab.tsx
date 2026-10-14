'use client';

import { Heart, Inbox, Star, Store, Users } from 'lucide-react';

export type AdminStats = {
    totals: {
        stores: number;
        users: number;
        reviews: number;
        favorites: number;
        pendingRequests: number;
    };
    storesByBrand: { name: string; count: number }[];
    ratingDistribution: { rating: number; count: number }[];
    requestsByStatus: { status: string; count: number }[];
    topStores: { id: string; name: string; brandName: string; rating: number; ratingCount: number }[];
    topAmenities: { name: string; count: number }[];
};

const fmt = (n: number): string => n.toLocaleString('vi-VN');

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm">
            <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">{title}</h4>
            <div className="mt-4">{children}</div>
        </div>
    );
}

function BarRow({ label, count, max, barClass }: { label: string; count: number; max: number; barClass: string }) {
    const pct = max > 0 ? Math.max(2, Math.round((count / max) * 100)) : 0;
    return (
        <div>
            <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate font-medium text-gray-700 dark:text-gray-300">{label}</span>
                <span className="shrink-0 font-bold text-gray-900 dark:text-gray-100">{fmt(count)}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div className={`h-2 rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

const RATING_COLORS: Record<number, string> = {
    5: '#10b981',
    4: '#84cc16',
    3: '#f59e0b',
    2: '#f97316',
    1: '#ef4444',
};

function RatingDonut({ data }: { data: { rating: number; count: number }[] }) {
    const total = data.reduce((sum, d) => sum + d.count, 0);
    if (total === 0) {
        return <p className="text-sm text-gray-500 dark:text-gray-400">Chưa có đánh giá nào.</p>;
    }
    const ordered = [...data].sort((a, b) => b.rating - a.rating);
    const segments = ordered.reduce<{ rating: number; count: number; pct: number; offset: number }[]>(
        (acc, d) => {
            const prev = acc[acc.length - 1];
            const offset = prev ? prev.offset + prev.pct : 0;
            return [...acc, { rating: d.rating, count: d.count, pct: (d.count / total) * 100, offset }];
        },
        []
    );
    return (
        <div className="flex items-center gap-6">
            <div className="relative h-36 w-36 shrink-0">
                <svg viewBox="0 0 42 42" className="h-36 w-36 -rotate-90">
                    <circle cx="21" cy="21" r="15.9155" fill="none" strokeWidth="6" className="stroke-gray-100 dark:stroke-gray-800" />
                    {segments.map((seg) => (
                        <circle
                            key={seg.rating}
                            cx="21"
                            cy="21"
                            r="15.9155"
                            fill="none"
                            stroke={RATING_COLORS[seg.rating] || '#9ca3af'}
                            strokeWidth="6"
                            pathLength={100}
                            strokeDasharray={`${seg.pct} ${100 - seg.pct}`}
                            strokeDashoffset={-seg.offset}
                        />
                    ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmt(total)}</span>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">lượt đánh giá</span>
                </div>
            </div>
            <div className="space-y-2">
                {segments.map((seg) => (
                    <div key={seg.rating} className="flex items-center gap-2 text-xs">
                        <span
                            className="h-3 w-3 shrink-0 rounded-sm"
                            style={{ backgroundColor: RATING_COLORS[seg.rating] || '#9ca3af' }}
                        />
                        <span className="font-medium text-gray-700 dark:text-gray-300">{seg.rating} sao</span>
                        <span className="font-bold text-gray-900 dark:text-gray-100">{fmt(seg.count)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

const REQUEST_STATUS_META: Record<string, { label: string; barClass: string }> = {
    PENDING: { label: 'Chờ duyệt', barClass: 'bg-amber-500' },
    APPROVED: { label: 'Đã duyệt', barClass: 'bg-emerald-500' },
    REJECTED: { label: 'Từ chối', barClass: 'bg-rose-500' },
};

export default function StatsTab({ stats }: { stats: AdminStats | null }) {
    if (!stats) {
        return <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Đang tải...</p>;
    }

    const cards = [
        { label: 'Cửa hàng', value: stats.totals.stores, icon: Store, iconClass: 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400' },
        { label: 'Người dùng', value: stats.totals.users, icon: Users, iconClass: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' },
        { label: 'Lượt đánh giá', value: stats.totals.reviews, icon: Star, iconClass: 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400' },
        { label: 'Lượt yêu thích', value: stats.totals.favorites, icon: Heart, iconClass: 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400' },
        { label: 'Yêu cầu chờ duyệt', value: stats.totals.pendingRequests, icon: Inbox, iconClass: 'bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400' },
    ];

    const maxBrand = Math.max(0, ...stats.storesByBrand.map((b) => b.count));
    const maxAmenity = Math.max(0, ...stats.topAmenities.map((a) => a.count));
    const maxRequest = Math.max(0, ...stats.requestsByStatus.map((r) => r.count));
    const brandPalette = ['bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-orange-500'];

    return (
        <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                {cards.map((card) => (
                    <div
                        key={card.label}
                        className="flex items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-sm"
                    >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.iconClass}`}>
                            <card.icon className="h-5 w-5" />
                        </span>
                        <span>
                            <span className="block text-xl font-bold text-gray-900 dark:text-gray-100">{fmt(card.value)}</span>
                            <span className="block text-xs text-gray-500 dark:text-gray-400">{card.label}</span>
                        </span>
                    </div>
                ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Section title="Cửa hàng theo thương hiệu">
                    {stats.storesByBrand.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">Chưa có dữ liệu.</p>
                    ) : (
                        <div className="space-y-3">
                            {stats.storesByBrand.map((b, i) => (
                                <BarRow
                                    key={b.name}
                                    label={b.name}
                                    count={b.count}
                                    max={maxBrand}
                                    barClass={brandPalette[i % brandPalette.length]}
                                />
                            ))}
                        </div>
                    )}
                </Section>

                <Section title="Phân bố đánh giá sao">
                    <RatingDonut data={stats.ratingDistribution} />
                </Section>

                <Section title="Yêu cầu thêm cửa hàng theo trạng thái">
                    {stats.requestsByStatus.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">Chưa có yêu cầu nào.</p>
                    ) : (
                        <div className="space-y-3">
                            {stats.requestsByStatus.map((r) => {
                                const meta = REQUEST_STATUS_META[r.status] || { label: r.status, barClass: 'bg-gray-400' };
                                return (
                                    <BarRow
                                        key={r.status}
                                        label={meta.label}
                                        count={r.count}
                                        max={maxRequest}
                                        barClass={meta.barClass}
                                    />
                                );
                            })}
                        </div>
                    )}
                </Section>

                <Section title="Tiện ích phổ biến nhất">
                    {stats.topAmenities.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">Chưa có dữ liệu.</p>
                    ) : (
                        <div className="space-y-3">
                            {stats.topAmenities.map((a) => (
                                <BarRow key={a.name} label={a.name} count={a.count} max={maxAmenity} barClass="bg-cyan-500" />
                            ))}
                        </div>
                    )}
                </Section>
            </div>

            <Section title="Top 10 cửa hàng được đánh giá cao nhất">
                {stats.topStores.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Chưa có dữ liệu.</p>
                ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {stats.topStores.map((s, i) => (
                            <div key={s.id} className="flex items-center gap-3 py-2.5">
                                <span className="w-6 shrink-0 text-center text-sm font-bold text-gray-400 dark:text-gray-500">
                                    {i + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-200">{s.name}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{s.brandName}</p>
                                </div>
                                <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-gray-900 dark:text-gray-100">
                                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                                    {s.rating.toFixed(1)}
                                </span>
                                <span className="hidden shrink-0 text-xs text-gray-500 dark:text-gray-400 sm:block">
                                    {fmt(s.ratingCount)} lượt
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </Section>
        </div>
    );
}
