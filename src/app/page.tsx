'use client';

import { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore } from 'react';
import { MapPin, Star, Navigation, X, SearchX, Heart, Clock, Crosshair, SlidersHorizontal, ChevronDown } from 'lucide-react';
import MapView from '@/components/MapView';
import { toast } from '@/components/Toast';
import { useApp } from '@/components/app-provider';
import { useEscapeKey } from '@/lib/use-escape';
import { Store, UserLocation } from '@/types/store';

const fallbackBrandOptions = [
    { id: 'circle-k', name: 'Circle K' },
    { id: 'winmart', name: 'WinMart+' },
    { id: 'gs25', name: 'GS25' },
    { id: 'familymart', name: 'FamilyMart' },
    { id: '7-eleven', name: '7-Eleven' },
    { id: 'other', name: 'Khác' },
];

const fallbackAmenityOptions = [
    { id: 'wifi', name: 'Wi‑Fi' },
    { id: 'parking', name: 'Bãi xe' },
    { id: 'seating', name: 'Chỗ ngồi' },
    { id: 'cashless', name: 'Có chuyển khoản' },
    { id: 'wc', name: 'Nhà vệ sinh' },
    { id: 'overnight', name: 'Cho phép qua đêm' },
];

type CatalogItem = { id: string; name: string };


function formatDistanceValue(meters?: number): string {
    if (meters === undefined || !Number.isFinite(meters) || meters < 0) {
        return '';
    }
    if (meters < 1000) {
        return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
}

function formatDistance(meters?: number): string {
    const value = formatDistanceValue(meters);
    return value ? `Cách bạn ${value}` : '';
}

function formatRadius(meters: number): string {
    return meters < 1000 ? `${meters} m` : `${meters / 1000} km`;
}

function formatReviewDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface StoreReviewItem {
    userId: string;
    userName: string;
    rating: number;
    comment: string;
    createdAt: string;
}

/* Viewport mobile/desktop: đọc qua useSyncExternalStore (giống darkMode) để
   lần render đầu của client khớp HTML từ server, tránh hydration mismatch. */
function subscribeMobileViewport(onChange: () => void): () => void {
    const mq = window.matchMedia('(max-width: 1023px)');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
}

function getMobileViewportSnapshot(): boolean {
    return window.matchMedia('(max-width: 1023px)').matches;
}

function getMobileViewportServerSnapshot(): boolean {
    return false;
}

export default function Home() {
    const { currentUser, authToken, requestAuth } = useApp();
    const [userLocation, setUserLocation] = useState<UserLocation>({
        lat: 21.03477,
        lng: 105.80266,
    });
    const [stores, setStores] = useState<Store[]>([]);
    const [isLoadingStores, setIsLoadingStores] = useState<boolean>(true);
    const [storesError, setStoresError] = useState<boolean>(false);
    const [storesRetryKey, setStoresRetryKey] = useState<number>(0);
    const [locationStatus, setLocationStatus] = useState<'locating' | 'gps' | 'denied'>('locating');
    /* Đánh số request để bỏ qua response cũ về sau (race condition khi
       vị trí đổi lúc request trước chưa xong). */
    const storesRequestIdRef = useRef<number>(0);
    const [radius, setRadius] = useState<number>(1000);
    const [selectedStore, setSelectedStore] = useState<Store | null>(null);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [selectedBrand, setSelectedBrand] = useState<string>('all');
    const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
    const [openOnly, setOpenOnly] = useState<boolean>(false);
    const isMobileViewport = useSyncExternalStore(subscribeMobileViewport, getMobileViewportSnapshot, getMobileViewportServerSnapshot);
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState<boolean>(false);
    const filtersVisible = !isMobileViewport || mobileFiltersOpen;
    const [sortBy, setSortBy] = useState<'nearest' | 'rating'>('nearest');
    const [minRating, setMinRating] = useState<number>(0);
    const activeFilterCount =
        (searchTerm.trim() ? 1 : 0) +
        (radius !== 1000 ? 1 : 0) +
        (selectedBrand !== 'all' ? 1 : 0) +
        (sortBy !== 'nearest' ? 1 : 0) +
        (minRating > 0 ? 1 : 0) +
        selectedAmenities.length +
        (openOnly ? 1 : 0);
    const [draftSearchTerm, setDraftSearchTerm] = useState<string>('');
    const [draftRadius, setDraftRadius] = useState<number>(1000);
    const [draftSelectedBrand, setDraftSelectedBrand] = useState<string>('all');
    const [draftSelectedAmenities, setDraftSelectedAmenities] = useState<string[]>([]);
    const [draftOpenOnly, setDraftOpenOnly] = useState<boolean>(false);
    const [draftSortBy, setDraftSortBy] = useState<'nearest' | 'rating'>('nearest');
    const [draftMinRating, setDraftMinRating] = useState<number>(0);
    const hasPendingFilters =
        draftSearchTerm.trim() !== searchTerm.trim() ||
        draftRadius !== radius ||
        draftSelectedBrand !== selectedBrand ||
        draftSortBy !== sortBy ||
        draftMinRating !== minRating ||
        draftOpenOnly !== openOnly ||
        draftSelectedAmenities.length !== selectedAmenities.length ||
        draftSelectedAmenities.some((id) => !selectedAmenities.includes(id));
    const applyFilters = () => {
        setSearchTerm(draftSearchTerm);
        setRadius(draftRadius);
        setSelectedBrand(draftSelectedBrand);
        setSelectedAmenities(draftSelectedAmenities);
        setOpenOnly(draftOpenOnly);
        setSortBy(draftSortBy);
        setMinRating(draftMinRating);
        setMobileFiltersOpen(false);
    };
    const [pickingLocation, setPickingLocation] = useState<boolean>(false);
    const [pickedLocation, setPickedLocation] = useState<boolean>(false);
    const [detailsStore, setDetailsStore] = useState<Store | null>(null);
    /* Danh sách yêu thích của user đang đăng nhập. Khởi tạo lười từ
       localStorage theo session đã lưu; đổi user (login/logout/register)
       thì cập nhật ngay trong handler, không dùng effect để tránh
       set-state-in-effect. */
    const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
    const [favoritesOnly, setFavoritesOnly] = useState<boolean>(false);

    const refreshFavorites = async (token: string) => {
        try {
            const res = await fetch('/api/favorites', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setFavoriteIds(Array.isArray(data.storeIds) ? data.storeIds.filter((id: unknown): id is string => typeof id === 'string') : []);
        } catch {
            setFavoriteIds([]);
        }
    };

    const [catalogBrands, setCatalogBrands] = useState<CatalogItem[]>(fallbackBrandOptions);
    const [catalogAmenities, setCatalogAmenities] = useState<CatalogItem[]>(fallbackAmenityOptions);
    const brandOptions = useMemo(
        () => [{ id: 'all', name: 'Tất cả' }, ...catalogBrands],
        [catalogBrands]
    );
    const amenityNameById: Record<string, string> = useMemo(
        () => Object.fromEntries(catalogAmenities.map((amenity) => [amenity.id, amenity.name])),
        [catalogAmenities]
    );

    function getBrandName(brandId?: string): string {
        const brand = catalogBrands.find((option) => option.id === brandId);
        return brand ? brand.name : 'Cửa hàng tiện lợi';
    }
    const [ratingPickerStoreId, setRatingPickerStoreId] = useState<string | null>(null);
    const [pickerMyRating, setPickerMyRating] = useState<number | null>(null);
    const [pickerMyComment, setPickerMyComment] = useState<string>('');
    const [detailsReviews, setDetailsReviews] = useState<StoreReviewItem[]>([]);
    const [loadingReviews, setLoadingReviews] = useState<boolean>(false);
    const [hoverStars, setHoverStars] = useState<number | null>(null);
    const [submittingRating, setSubmittingRating] = useState(false);

    useEscapeKey(() => setRatingPickerStoreId(null), ratingPickerStoreId !== null);
    useEscapeKey(() => setDetailsStore(null), detailsStore !== null && ratingPickerStoreId === null);

    /* Đồng bộ favorites + reset state đánh giá mỗi khi user đổi
       (đăng nhập/đăng xuất/đổi tài khoản).
       setState trong effect này là có chủ đích (đồng bộ theo user). */
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (currentUser && authToken) {
            refreshFavorites(authToken);
        } else {
            setFavoriteIds([]);
            setFavoritesOnly(false);
            setRatingPickerStoreId(null);
            setPickerMyRating(null);
            setPickerMyComment('');
            setHoverStars(null);
            setDetailsStore(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser]);
    /* eslint-enable react-hooks/set-state-in-effect */

    useEffect(() => {
        fetch('/api/catalog')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (Array.isArray(data?.brands) && data.brands.length > 0) {
                    setCatalogBrands(data.brands);
                }
                if (Array.isArray(data?.amenities) && data.amenities.length > 0) {
                    setCatalogAmenities(data.amenities);
                }
            })
            .catch(() => {});
    }, []);

    const requestLocation = useCallback(() => {
        if (!navigator.geolocation) {
            setLocationStatus('denied');
            return;
        }
        setPickedLocation(false);
        setPickingLocation(false);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setUserLocation({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                });
                setLocationStatus('gps');
            },
            () => {
                setLocationStatus('denied');
                toast('Không lấy được vị trí GPS, đang dùng vị trí mặc định.', 'error');
            },
            { timeout: 8000 }
        );
    }, []);

    useEffect(() => {
        /* Xin GPS 1 lần khi mở trang. setState bên trong requestLocation là
           có chủ đích và chỉ chạy 1 lần (deps ổn định) nên không gây vòng lặp render. */
        // eslint-disable-next-line react-hooks/set-state-in-effect
        requestLocation();
    }, [requestLocation]);


    useEffect(() => {
        async function fetchStores() {
            /* Mỗi lần fetch tăng số thứ tự; response nào không phải mới nhất
               thì bị bỏ qua để tránh response cũ về sau ghi đè dữ liệu mới
               (xảy ra khi vị trí GPS về sau lúc request đầu chưa xong). */
            const requestId = ++storesRequestIdRef.current;
            const isLatest = () => storesRequestIdRef.current === requestId;

            setIsLoadingStores(true);
            try {
                const params = new URLSearchParams({
                    lat: String(userLocation.lat),
                    lng: String(userLocation.lng),
                    radius: String(radius),
                    openOnly: String(openOnly),
                    sort: sortBy,
                    minRating: String(minRating),
                });

                if (selectedBrand !== 'all') {
                    params.set('brandIds', selectedBrand);
                }

                if (selectedAmenities.length > 0) {
                    params.set('amenityIds', selectedAmenities.join(','));
                }

                if (searchTerm.trim()) {
                    params.set('search', searchTerm.trim());
                }

                const res = await fetch(`/api/stores?${params.toString()}`);
                if (!res.ok) {
                    throw new Error(`Tải danh sách cửa hàng thất bại (${res.status})`);
                }
                const data = await res.json();
                if (!isLatest()) {
                    return;
                }
                setStores(data.stores || []);
                setStoresError(false);
            } catch (err) {
                if (!isLatest()) {
                    return;
                }
                console.error('Lỗi lấy danh sách cửa hàng:', err);
                setStoresError(true);
                toast('Không tải được danh sách cửa hàng mới.', 'error');
            } finally {
                if (isLatest()) {
                    setIsLoadingStores(false);
                }
            }
        }

        fetchStores();
    }, [userLocation, radius, selectedBrand, selectedAmenities, openOnly, searchTerm, sortBy, minRating, storesRetryKey]);

    const toggleAmenity = (amenityId: string) => {
        setDraftSelectedAmenities((current) =>
            current.includes(amenityId)
                ? current.filter((id) => id !== amenityId)
                : [...current, amenityId]
        );
    };

    // Thêm/bỏ cửa hàng khỏi danh sách yêu thích của user đang đăng nhập.
    const toggleFavorite = async (store: Store) => {
        if (!currentUser) {
            toast('Đăng nhập để lưu cửa hàng yêu thích.', 'info');
            requestAuth();
            return;
        }

        try {
            const res = await fetch('/api/favorites', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
                },
                body: JSON.stringify({ storeId: store.id }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không thể cập nhật danh sách yêu thích.', 'error');
                return;
            }
            /* Tính danh sách mới trước rồi mới setState + toast. Không được gọi
               toast() (setState của ToastHost) bên trong updater của setFavoriteIds
               vì updater có thể chạy trong lúc render -> React báo lỗi
               "Cannot update a component while rendering a different component". */
            const favorited = data.favorited === true;
            const next = favorited
                ? [...favoriteIds.filter((id) => id !== store.id), store.id]
                : favoriteIds.filter((id) => id !== store.id);
            setFavoriteIds(next);
            toast(favorited ? 'Đã lưu vào danh sách yêu thích.' : 'Đã bỏ khỏi danh sách yêu thích.', 'success');
        } catch (error) {
            console.error('Lỗi cập nhật yêu thích:', error);
            toast('Không thể cập nhật danh sách yêu thích.', 'error');
        }
    };

    const handleMapClick = (location: UserLocation) => {
        setUserLocation(location);
        setPickedLocation(true);
        setPickingLocation(false);
        setSelectedStore(null);
        toast('Đã chọn vị trí mới trên bản đồ.', 'success');
    };

    const openStoreDetails = (store: Store) => {
        setSelectedStore(store);
        setDetailsStore(store);
        void loadStoreReviews(store.id);
    };

    const loadStoreReviews = async (storeId: string) => {
        setDetailsReviews([]);
        setLoadingReviews(true);
        try {
            const res = await fetch(`/api/stores/${encodeURIComponent(storeId)}/reviews`);
            const data = await res.json();
            setDetailsReviews(Array.isArray(data.reviews) ? data.reviews : []);
        } catch {
            setDetailsReviews([]);
        } finally {
            setLoadingReviews(false);
        }
    };

    const openRatingPicker = async (store: Store) => {
        if (!currentUser) {
            toast('Đăng nhập để đánh giá cửa hàng.', 'info');
            requestAuth();
            return;
        }

        setRatingPickerStoreId(store.id);
        setPickerMyRating(null);
        setPickerMyComment('');
        setHoverStars(null);

        try {
            const res = await fetch(`/api/stores/${encodeURIComponent(store.id)}/rate`, {
                headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
            });
            const data = await res.json();
            setPickerMyRating(typeof data.myRating === 'number' ? data.myRating : null);
            setPickerMyComment(typeof data.myComment === 'string' ? data.myComment : '');
        } catch {
        }
    };

    const submitRating = async (store: Store, stars: number) => {
        if (!currentUser) {
            toast('Đăng nhập để đánh giá cửa hàng.', 'info');
            requestAuth();
            return;
        }

        setSubmittingRating(true);
        try {
            const res = await fetch(`/api/stores/${encodeURIComponent(store.id)}/rate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
                },
                body: JSON.stringify({ stars, comment: pickerMyComment }),
            });
            const data = await res.json();

            if (!res.ok) {
                toast(data.message || 'Không thể gửi đánh giá.', 'error');
                return;
            }

            setStores((prevStores) =>
                prevStores.map((item) =>
                    item.id === store.id ? { ...item, rating: data.rating, ratingCount: data.ratingCount } : item
                )
            );
            setPickerMyRating(stars);
            toast('Cảm ơn bạn đã đánh giá!', 'success');
        } catch (error) {
            console.error('Lỗi gửi đánh giá:', error);
            toast('Không thể gửi đánh giá.', 'error');
        } finally {
            setSubmittingRating(false);
        }
    };

    const openDirections = (store: Store) => {
        setSelectedStore(store);

        const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${store.lat},${store.lng}`;
        window.open(googleMapsUrl, '_blank');
    };

    const handleDirections = (e: React.MouseEvent, store: Store) => {
        e.stopPropagation();
        openDirections(store);
    };

    const openStoreCount = stores.filter((store) => store.isOpen || store.is24h).length;
    const nearestStore = sortBy === 'nearest' && stores.length > 0 ? stores[0] : undefined;
    const displayedStores = favoritesOnly ? stores.filter((store) => favoriteIds.includes(store.id)) : stores;

    return (
        <>

            <div className="max-w-7xl mx-auto mb-6 rounded-2xl bg-white dark:bg-gray-900 px-4 py-3.5 shadow-md">
                <button
                    type="button"
                    onClick={() => setMobileFiltersOpen((prev) => !prev)}
                    aria-expanded={filtersVisible}
                    className="lg:hidden mb-1 flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300"
                >
                    <SlidersHorizontal className="h-4 w-4" />
                    Tìm kiếm & bộ lọc
                    {activeFilterCount > 0 && (
                        <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">
                            {activeFilterCount}
                        </span>
                    )}
                    <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${filtersVisible ? 'rotate-180' : ''}`} />
                </button>
                <div className={`${filtersVisible ? 'block' : 'hidden'} lg:block`}>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_130px_160px_180px_160px]">
                    <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Tìm kiếm</label>
                        <input
                            value={draftSearchTerm}
                            onChange={(e) => setDraftSearchTerm(e.target.value)}
                            placeholder="Tên cửa hàng hoặc địa chỉ"
                            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Bán kính</label>
                        <select
                            value={draftRadius}
                            onChange={(e) => setDraftRadius(Number(e.target.value))}
                            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
                        >
                            <option value={300}>300 m</option>
                            <option value={500}>500 m</option>
                            <option value={1000}>1 km</option>
                            <option value={2000}>2 km</option>
                            <option value={5000}>5 km</option>
                        </select>
                    </div>

                    <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Thương hiệu</label>
                        <select
                            value={draftSelectedBrand}
                            onChange={(e) => setDraftSelectedBrand(e.target.value)}
                            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
                        >
                            {brandOptions.map((brand) => (
                                <option key={brand.id} value={brand.id}>
                                    {brand.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Sắp xếp</label>
                        <select
                            value={draftSortBy}
                            onChange={(e) => setDraftSortBy(e.target.value as 'nearest' | 'rating')}
                            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
                        >
                            <option value="nearest">Gần nhất trước</option>
                            <option value="rating">Đánh giá cao nhất</option>
                        </select>
                    </div>

                    <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Đánh giá tối thiểu</label>
                        <select
                            value={draftMinRating}
                            onChange={(e) => setDraftMinRating(Number(e.target.value))}
                            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
                        >
                            <option value={0}>Mọi mức</option>
                            <option value={3}>Từ 3.0 sao</option>
                            <option value={4}>Từ 4.0 sao</option>
                            <option value={4.5}>Từ 4.5 sao</option>
                        </select>
                    </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                    {catalogAmenities.map((amenity) => {
                        const active = draftSelectedAmenities.includes(amenity.id);
                        return (
                            <button
                                key={amenity.id}
                                type="button"
                                onClick={() => toggleAmenity(amenity.id)}
                                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${active
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                    }`}
                            >
                                {amenity.name}
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        onClick={() => setDraftOpenOnly((prev) => !prev)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${draftOpenOnly
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }`}
                    >
                        Chỉ đang mở
                    </button>
                    <button
                        type="button"
                        onClick={applyFilters}
                        disabled={!hasPendingFilters}
                        className={`ml-auto w-full sm:w-auto rounded-xl px-5 py-2 text-sm font-semibold text-white shadow-sm transition ${hasPendingFilters
                                ? 'bg-blue-600 hover:bg-blue-700'
                                : 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed'
                            }`}
                    >
                        Áp dụng bộ lọc
                    </button>
                </div>
                </div>

                {!isLoadingStores && (
                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-gray-100 dark:border-gray-800 pt-3 text-sm text-gray-600 dark:text-gray-400">
                        <span>
                            <span className="font-bold text-gray-900 dark:text-gray-100">{stores.length}</span> cửa hàng trong {formatRadius(radius)}
                        </span>
                        <span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">{openStoreCount}</span> đang mở
                        </span>
                        {nearestStore && (
                            <span className="min-w-0 truncate">
                                Gần nhất: <span className="font-semibold text-gray-900 dark:text-gray-100">{nearestStore.name}</span>
                                {' '}• {formatDistanceValue(nearestStore.distanceMeters)}
                            </span>
                        )}
                        <span className="ml-auto flex items-center gap-1.5 text-xs">
                            <span
                                className={`h-2 w-2 rounded-full ${locationStatus === 'gps' && !pickedLocation
                                        ? 'bg-emerald-500'
                                        : pickedLocation
                                            ? 'bg-violet-500'
                                            : locationStatus === 'denied'
                                                ? 'bg-amber-500'
                                                : 'animate-pulse bg-blue-500'
                                    }`}
                            />
                            {pickedLocation
                                ? 'Vị trí đã chọn trên bản đồ'
                                : locationStatus === 'gps'
                                    ? 'Vị trí GPS của bạn'
                                    : locationStatus === 'denied'
                                        ? 'Không lấy được vị trí'
                                        : 'Đang xác định vị trí...'}
                            {(locationStatus === 'denied' || pickedLocation) && (
                                <button
                                    type="button"
                                    onClick={requestLocation}
                                    className="font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                                >
                                    Dùng vị trí của tôi
                                </button>
                            )}
                        </span>
                    </div>
                )}
            </div>

            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6">

                <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-md p-2 h-[600px]">
                        <div className="absolute right-4 top-4 z-10 flex gap-2">
                            <button
                                type="button"
                                onClick={() => setPickingLocation((prev) => !prev)}
                                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold shadow-md transition ${pickingLocation
                                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                                        : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                                    }`}
                            >
                                <Crosshair className="h-4 w-4" />
                                {pickingLocation ? 'Đang chọn vị trí...' : 'Chọn vị trí trên bản đồ'}
                            </button>
                            {pickedLocation && (
                                <button
                                    type="button"
                                    onClick={requestLocation}
                                    className="rounded-lg bg-white dark:bg-gray-900 px-3 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 shadow-md hover:bg-blue-50 dark:hover:bg-blue-950"
                                >
                                    Về vị trí của tôi
                                </button>
                            )}
                        </div>
                        {pickingLocation && (
                            <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-slate-900/85 px-4 py-1.5 text-xs font-medium text-white shadow-md">
                                Nhấn vào bản đồ để chọn vị trí tìm kiếm
                            </div>
                        )}
                        <MapView
                            center={userLocation}
                            stores={stores}
                            selectedStore={selectedStore}
                            pickingEnabled={pickingLocation}
                            onMapClick={handleMapClick}
                        />
                    </div>

                    {isLoadingStores && !pickingLocation && (
                         <div className="pointer-events-none fixed left-1/2 top-5 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900/85 px-4 py-1.5 text-xs font-medium text-white shadow-md">
                             <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                             Đang cập nhật ...
                         </div>
                )}


                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-md h-auto lg:h-[600px] flex flex-col overflow-hidden">
                        <div className="shrink-0 p-4 pb-3">
                            <h2 className="font-bold text-base text-gray-800 dark:text-gray-200">
                                Danh sách cửa hàng ({displayedStores.length})
                            </h2>
                            {currentUser && (
                                <div className="mt-2.5 flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 text-xs font-medium">
                                    <button
                                        type="button"
                                        onClick={() => setFavoritesOnly(false)}
                                        className={`flex-1 whitespace-nowrap rounded-md px-2.5 py-1.5 transition ${!favoritesOnly
                                                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                            }`}
                                    >
                                        Tất cả
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFavoritesOnly(true)}
                                        className={`flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1.5 transition ${favoritesOnly
                                                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                            }`}
                                    >
                                        <Heart className={`h-3.5 w-3.5 shrink-0 ${favoritesOnly ? 'fill-red-500 text-red-500 dark:text-red-400' : ''}`} />
                                        Yêu thích
                                    </button>
                                </div>
                            )}

                        {storesError && stores.length > 0 && (
                            <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                                <span>Đang hiển thị kết quả cũ do tải mới thất bại.</span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStoresError(false);
                                        setStoresRetryKey((key) => key + 1);
                                    }}
                                    className="shrink-0 font-semibold text-amber-900 dark:text-amber-200 underline hover:text-amber-700 dark:hover:text-amber-300"
                                >
                                    Tải lại
                                </button>
                            </div>
                        )}

                        </div>
                        <div className="flex-1 overflow-x-auto lg:overflow-x-hidden overflow-y-hidden lg:overflow-y-auto px-4 pb-4 snap-x [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {isLoadingStores ? (
                            <div className="flex gap-3 space-y-0 lg:block lg:space-y-3" aria-label="Đang tải danh sách cửa hàng">
                                {[0, 1, 2].map((skeletonIndex) => (
                                    <div
                                        key={skeletonIndex}
                                        className="w-[82%] shrink-0 snap-start lg:w-auto animate-pulse rounded-xl border border-gray-200 dark:border-gray-700 p-4"
                                    >
                                        <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
                                        <div className="mt-2 h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
                                        <div className="mt-3 h-3 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
                                    </div>
                                ))}
                            </div>
                        ) : displayedStores.length === 0 ? (
                            <div className="flex h-[380px] flex-col items-center justify-center text-center">
                                {favoritesOnly ? (
                                    <>
                                        <Heart className="h-10 w-10 text-gray-300 dark:text-gray-600" />
                                        <p className="mt-3 font-semibold text-gray-700 dark:text-gray-300">Chưa có cửa hàng yêu thích</p>
                                        <p className="mt-1 max-w-[240px] text-sm text-gray-500 dark:text-gray-400">
                                            Nhấn biểu tượng trái tim trên cửa hàng để lưu lại những nơi bạn hay ghé.
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <SearchX className="h-10 w-10 text-gray-300 dark:text-gray-600" />
                                        <p className="mt-3 font-semibold text-gray-700 dark:text-gray-300">Không tìm thấy cửa hàng nào</p>
                                        <p className="mt-1 max-w-[240px] text-sm text-gray-500 dark:text-gray-400">
                                            Thử nới rộng bán kính tìm kiếm hoặc bỏ bớt điều kiện lọc.
                                        </p>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="flex gap-3 space-y-0 lg:block lg:space-y-3">
                                {displayedStores.map((store) => {
                                const isSelected = selectedStore?.id === store.id;
                                const distanceLabel = formatDistance(store.distanceMeters);
                                const storeAmenities = store.amenities || [];
                                const visibleAmenities = storeAmenities.slice(0, 3);
                                const hiddenAmenityCount = storeAmenities.length - visibleAmenities.length;
                                const isFavorite = favoriteIds.includes(store.id);
                                return (
                                    <div
                                        key={store.id}
                                        onClick={() => setSelectedStore(store)}
                                        className={`w-[82%] shrink-0 snap-start lg:w-auto p-4 rounded-xl border transition-all cursor-pointer ${isSelected
                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 shadow-sm'
                                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start gap-3">
                                            <div>
                                                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{store.name}</h3>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{store.address}</p>
                                                {distanceLabel && (
                                                    <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                                                        <MapPin className="h-3.5 w-3.5" />
                                                        {distanceLabel}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex shrink-0 items-start gap-1.5">
                                                <button
                                                    type="button"
                                                    title={isFavorite ? 'Bỏ yêu thích' : 'Lưu yêu thích'}
                                                    aria-label={isFavorite ? 'Bỏ yêu thích' : 'Lưu yêu thích'}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleFavorite(store);
                                                    }}
                                                    className="rounded-lg p-1.5 transition hover:bg-red-50 dark:hover:bg-red-950"
                                                >
                                                    <Heart
                                                        className={`h-4.5 w-4.5 ${isFavorite
                                                                ? 'fill-red-500 text-red-500 dark:text-red-400'
                                                                : 'text-gray-300 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-300'
                                                            }`}
                                                    />
                                                </button>
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    title="Đánh giá cửa hàng"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (ratingPickerStoreId === store.id) {
                                                            setRatingPickerStoreId(null);
                                                        } else {
                                                            openRatingPicker(store);
                                                        }
                                                    }}
                                                    className="flex items-center gap-1 text-xs font-medium text-amber-500 whitespace-nowrap hover:text-amber-600 dark:hover:text-amber-400"
                                                >
                                                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                                    {(store.rating ?? 0) > 0 ? store.rating : '—'}
                                                    {(store.ratingCount ?? 0) > 0 && (
                                                        <span className="text-gray-400 dark:text-gray-500">({store.ratingCount})</span>
                                                    )}
                                                </button>
                                                {ratingPickerStoreId === store.id && (
                                                    <div
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 shadow-lg"
                                                    >
                                                        <p className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                                                            Đánh giá của bạn
                                                        </p>
                                                        <div
                                                            className="flex gap-1"
                                                            onMouseLeave={() => setHoverStars(null)}
                                                        >
                                                            {[1, 2, 3, 4, 5].map((starValue) => {
                                                                const activeValue = hoverStars ?? pickerMyRating ?? 0;
                                                                return (
                                                                    <button
                                                                        key={starValue}
                                                                        type="button"
                                                                        disabled={submittingRating}
                                                                        onMouseEnter={() => setHoverStars(starValue)}
                                                                        onClick={() => setPickerMyRating(starValue)}
                                                                        className="disabled:opacity-50"
                                                                        aria-label={`${starValue} sao`}
                                                                    >
                                                                        <Star
                                                                            className={`h-6 w-6 ${starValue <= activeValue
                                                                                    ? 'fill-amber-400 text-amber-400'
                                                                                    : 'text-gray-300 dark:text-gray-600'
                                                                                }`}
                                                                        />
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                        <textarea
                                                            value={pickerMyComment}
                                                            onChange={(e) => setPickerMyComment(e.target.value.slice(0, 500))}
                                                            rows={2}
                                                            maxLength={500}
                                                            disabled={submittingRating}
                                                            placeholder="Viết bình luận (không bắt buộc)..."
                                                            className="mt-2 w-full resize-none rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2.5 py-2 text-xs text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                                        />
                                                        {pickerMyRating !== null ? (
                                                            <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                                                                Bạn đã chấm {pickerMyRating} sao. Sửa sao/bình luận rồi bấm Lưu để cập nhật.
                                                            </p>
                                                        ) : (
                                                            <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                                                                Chọn số sao, viết bình luận (nếu muốn) rồi bấm Lưu.
                                                            </p>
                                                        )}
                                                        <button
                                                            type="button"
                                                            disabled={submittingRating || pickerMyRating === null}
                                                            onClick={() => {
                                                                if (pickerMyRating !== null) {
                                                                    submitRating(store, pickerMyRating);
                                                                }
                                                            }}
                                                            className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                                                        >
                                                            {submittingRating ? 'Đang lưu...' : 'Lưu đánh giá'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setRatingPickerStoreId(null)}
                                                            className="mt-2 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                                                        >
                                                            Đóng
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            </div>
                                        </div>

                                        {visibleAmenities.length > 0 && (
                                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                                                {visibleAmenities.map((amenityId) => (
                                                    <span
                                                        key={amenityId}
                                                        className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] text-gray-600 dark:text-gray-400"
                                                    >
                                                        {amenityNameById[amenityId] || amenityId}
                                                    </span>
                                                ))}
                                                {hiddenAmenityCount > 0 && (
                                                    <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                                                        +{hiddenAmenityCount}
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-400">
                                            <span className="flex items-center gap-1.5">
                                                <span
                                                    className={`h-2 w-2 rounded-full ${store.isOpen ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                                                />
                                                {store.isOpen ? 'Đang mở' : 'Đã đóng'}
                                                {store.is24h ? ' • 24/7' : store.openHours ? ` • ${store.openHours}` : ''}
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openStoreDetails(store);
                                                    }}
                                                    className="text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1 bg-gray-100 dark:bg-gray-800 px-2.5 py-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                                                >
                                                    Chi tiết
                                                </button>
                                                <button
                                                    onClick={(e) => handleDirections(e, store)}
                                                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 flex items-center gap-1 bg-blue-50 dark:bg-blue-950 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900 transition"
                                                >
                                                    <Navigation className="h-3.5 w-3.5" />
                                                    Chỉ đường
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                                })}
                            </div>
                        )}
                        </div>
                    </div>
            </div>

            {detailsStore && (
                <div
                    className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4"
                    onClick={() => setDetailsStore(null)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-2xl"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <span className="inline-block rounded-full bg-blue-100 dark:bg-blue-900 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                                    {getBrandName(detailsStore.brandId)}
                                </span>
                                <h2 className="mt-2 text-xl font-bold text-gray-900 dark:text-gray-100">{detailsStore.name}</h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setDetailsStore(null)}
                                aria-label="Đóng"
                                className="rounded-lg p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="mt-3 flex items-center gap-2 text-sm">
                            <span className="flex items-center gap-1 font-semibold text-amber-500">
                                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                                {(detailsStore.rating ?? 0) > 0 ? detailsStore.rating : '—'}
                            </span>
                            {(detailsStore.ratingCount ?? 0) > 0 && (
                                <span className="text-gray-500 dark:text-gray-400">({detailsStore.ratingCount} lượt đánh giá)</span>
                            )}
                            <span
                                className={`ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${detailsStore.isOpen
                                        ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                                    }`}
                            >
                                <span className={`h-2 w-2 rounded-full ${detailsStore.isOpen ? 'bg-emerald-500' : 'bg-gray-400 dark:bg-gray-500'}`} />
                                {detailsStore.isOpen ? 'Đang mở cửa' : 'Đã đóng cửa'}
                            </span>
                        </div>

                        <div className="mt-4 space-y-2.5 text-sm text-gray-700 dark:text-gray-300">
                            <p className="flex items-start gap-2">
                                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
                                {detailsStore.address}
                            </p>
                            {formatDistance(detailsStore.distanceMeters) && (
                                <p className="flex items-center gap-2 font-medium text-blue-600 dark:text-blue-400">
                                    <Navigation className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
                                    {formatDistance(detailsStore.distanceMeters)}
                                </p>
                            )}
                            <p className="flex items-center gap-2">
                                <Clock className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
                                {detailsStore.is24h
                                    ? 'Mở cửa 24/7'
                                    : detailsStore.openHours
                                        ? `Giờ mở cửa: ${detailsStore.openHours} (giờ Việt Nam)`
                                        : 'Giờ mở cửa: đang cập nhật'}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                                Tọa độ: {detailsStore.lat.toFixed(5)}, {detailsStore.lng.toFixed(5)}
                            </p>
                        </div>

                        {(detailsStore.amenities?.length ?? 0) > 0 && (
                            <div className="mt-4">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Tiện ích</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {detailsStore.amenities!.map((amenityId) => (
                                        <span
                                            key={amenityId}
                                            className="rounded-full bg-blue-50 dark:bg-blue-950 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300"
                                        >
                                            {amenityNameById[amenityId] || amenityId}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="mt-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Bình luận đánh giá{detailsReviews.length > 0 && ` (${detailsReviews.length})`}
                            </p>
                            {loadingReviews ? (
                                <p className="text-xs text-gray-400 dark:text-gray-500">Đang tải bình luận...</p>
                            ) : detailsReviews.length === 0 ? (
                                <p className="text-xs text-gray-400 dark:text-gray-500">
                                    Chưa có bình luận nào. Hãy là người đầu tiên đánh giá!
                                </p>
                            ) : (
                                <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                                    {detailsReviews.map((review) => (
                                        <div
                                            key={`${review.userId}-${review.createdAt}`}
                                            className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="truncate text-xs font-semibold text-gray-800 dark:text-gray-200">
                                                    {review.userName}
                                                </span>
                                                <span className="flex shrink-0 items-center gap-0.5" aria-label={`${review.rating} sao`}>
                                                    {[1, 2, 3, 4, 5].map((starValue) => (
                                                        <Star
                                                            key={starValue}
                                                            className={`h-3 w-3 ${starValue <= review.rating
                                                                    ? 'fill-amber-400 text-amber-400'
                                                                    : 'text-gray-300 dark:text-gray-600'
                                                                }`}
                                                        />
                                                    ))}
                                                </span>
                                            </div>
                                            <p className="mt-1 break-words whitespace-pre-wrap text-xs text-gray-600 dark:text-gray-400">
                                                {review.comment}
                                            </p>
                                            {formatReviewDate(review.createdAt) && (
                                                <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                                                    {formatReviewDate(review.createdAt)}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="mt-6 flex gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    openDirections(detailsStore);
                                    setDetailsStore(null);
                                }}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                            >
                                <Navigation className="h-4 w-4" />
                                Chỉ đường
                            </button>
                            <button
                                type="button"
                                onClick={() => toggleFavorite(detailsStore)}
                                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${favoriteIds.includes(detailsStore.id)
                                        ? 'bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                    }`}
                            >
                                <Heart
                                    className={`h-4 w-4 ${favoriteIds.includes(detailsStore.id) ? 'fill-red-500 text-red-500 dark:text-red-400' : ''}`}
                                />
                                {favoriteIds.includes(detailsStore.id) ? 'Đã yêu thích' : 'Yêu thích'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <footer className="mx-auto mt-10 max-w-7xl border-t border-gray-200 dark:border-gray-700 px-2 py-6 text-center">
                <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    ConvenienceFinder
                </p>
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    Dữ liệu bản đồ © OpenStreetMap contributors • Vị trí của bạn chỉ dùng để tìm kiếm
                </p>
            </footer>
        </>
    );
}