'use client';

import { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore } from 'react';
import { MapPin, Star, Navigation, User, X, SearchX, Heart, Clock, Crosshair, Sun, Moon, SlidersHorizontal, ChevronDown } from 'lucide-react';
import MapView from '@/components/MapView';
import ToastHost, { toast } from '@/components/Toast';
import { AppUser, StoreRequestRecord, getRoleLabel, hasPermission } from '@/lib/auth-system';
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

type AdminUserItem = {
    id: string;
    fullName: string;
    email: string;
    role: string;
    isActive: boolean;
    createdAt: string;
};

type AdminReviewItem = {
    storeId: string;
    storeName: string;
    userId: string;
    userName: string;
    rating: number;
    comment: string;
    createdAt: string;
};

// Định dạng khoảng cách: < 1km hiện mét, >= 1km hiện km.
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

// Định dạng ngày bình luận theo kiểu Việt Nam (dd/MM/yyyy).
function formatReviewDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Một bình luận đánh giá (trả về từ GET /api/stores/[id]/reviews).
interface StoreReviewItem {
    userId: string;
    userName: string;
    rating: number;
    comment: string;
    createdAt: string;
}

const STORAGE_SESSION_KEY = 'finder_session';

type AuthMode = 'login' | 'register';
type MainView = 'main' | 'profile' | 'store-request' | 'admin';

// Session lưu ở client chỉ gồm token + thông tin công khai của user,
// KHÔNG bao giờ chứa password.
type SessionData = {
    token: string;
    user: Omit<AppUser, 'password'>;
};

function loadSession(): SessionData | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const saved = window.localStorage.getItem(STORAGE_SESSION_KEY);
        if (!saved) {
            return null;
        }
        const parsed = JSON.parse(saved) as SessionData;
        if (!parsed?.token || !parsed?.user?.id) {
            return null;
        }
        return parsed;
    } catch {
        window.localStorage.removeItem(STORAGE_SESSION_KEY);
        return null;
    }
}

function persistSession(session: SessionData | null) {
    if (typeof window === 'undefined') {
        return;
    }

    if (!session) {
        window.localStorage.removeItem(STORAGE_SESSION_KEY);
        return;
    }

    window.localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
}

// Dọn dữ liệu của phiên bản cũ (từng lưu cả password trong localStorage).
function clearLegacyAuthData() {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.removeItem('finder_users');
    window.localStorage.removeItem('finder_current_user');
}

// Dark mode lưu ở class "dark" trên <html> (script chặn trong <head> của
// layout gắn sẵn trước khi React hydrate). Đọc qua useSyncExternalStore
// thay vì useState để lần render đầu của client luôn khớp HTML từ server
// (getServerSnapshot trả về false), tránh lỗi hydration mismatch với
// những user đang dùng chế độ tối.
function subscribeDarkMode(onChange: () => void): () => void {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
}

function getDarkModeSnapshot(): boolean {
    return document.documentElement.classList.contains('dark');
}

function getDarkModeServerSnapshot(): boolean {
    return false;
}

// Viewport mobile/desktop: đọc qua useSyncExternalStore (giống darkMode) để
// lần render đầu của client khớp HTML từ server, tránh hydration mismatch.
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
    const [userLocation, setUserLocation] = useState<UserLocation>({
        lat: 21.03477,
        lng: 105.80266,
    });
    const [stores, setStores] = useState<Store[]>([]);
    const [isLoadingStores, setIsLoadingStores] = useState<boolean>(true);
    const [storesError, setStoresError] = useState<boolean>(false);
    const [storesRetryKey, setStoresRetryKey] = useState<number>(0);
    // Nguồn vị trí đang dùng để tính khoảng cách: 'locating' (đang xin GPS),
    // 'gps' (GPS thật), 'denied' (bị từ chối/lỗi -> dùng vị trí mặc định).
    const [locationStatus, setLocationStatus] = useState<'locating' | 'gps' | 'denied'>('locating');
    // Đánh số request để bỏ qua response cũ về sau (race condition khi
    // vị trí đổi lúc request trước chưa xong).
    const storesRequestIdRef = useRef<number>(0);
    const [radius, setRadius] = useState<number>(1000);
    const [selectedStore, setSelectedStore] = useState<Store | null>(null);
    const [searchTerm, setSearchTerm] = useState<string>('');
    // Debounce ô tìm kiếm 400ms để không bắn request theo từng ký tự gõ.
    // Debounce đặt trong event handler thay vì useEffect để tránh
    // setState đồng bộ trong effect (gây cảnh báo lint).
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleSearchChange = (value: string) => {
        setSearchTerm(value);
        if (searchDebounceRef.current) {
            clearTimeout(searchDebounceRef.current);
        }
        searchDebounceRef.current = setTimeout(() => setDebouncedSearchTerm(value), 400);
    };
    const [selectedBrand, setSelectedBrand] = useState<string>('all');
    const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
    const [openOnly, setOpenOnly] = useState<boolean>(false);
    // Thu gọn/mở rộng khối bộ lọc trên mobile (mặc định thu gọn để đỡ chiếm chỗ).
    // Desktop luôn mở (nút toggle bị ẩn bằng lg:hidden).
    const isMobileViewport = useSyncExternalStore(subscribeMobileViewport, getMobileViewportSnapshot, getMobileViewportServerSnapshot);
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState<boolean>(false);
    const filtersVisible = !isMobileViewport || mobileFiltersOpen;
    // Sắp xếp + lọc theo đánh giá (gửi lên API để cả 3 nguồn dữ liệu xử lý giống nhau).
    const [sortBy, setSortBy] = useState<'nearest' | 'rating'>('nearest');
    const [minRating, setMinRating] = useState<number>(0);
    // Số bộ lọc đang bật (hiện badge trên nút thu gọn mobile).
    const activeFilterCount =
        (searchTerm.trim() ? 1 : 0) +
        (radius !== 1000 ? 1 : 0) +
        (selectedBrand !== 'all' ? 1 : 0) +
        (sortBy !== 'nearest' ? 1 : 0) +
        (minRating > 0 ? 1 : 0) +
        selectedAmenities.length +
        (openOnly ? 1 : 0);
    // Chế độ "chọn vị trí trên bản đồ": bật nút rồi click vào bản đồ để tìm
    // cửa hàng quanh điểm đã chọn thay vì vị trí GPS.
    const [pickingLocation, setPickingLocation] = useState<boolean>(false);
    const [pickedLocation, setPickedLocation] = useState<boolean>(false);
    // Cửa hàng đang mở modal chi tiết.
    const [detailsStore, setDetailsStore] = useState<Store | null>(null);
    // Danh sách yêu thích của user đang đăng nhập. Khởi tạo lười từ
    // localStorage theo session đã lưu; đổi user (login/logout/register)
    // thì cập nhật ngay trong handler, không dùng effect để tránh
    // set-state-in-effect.
    const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
    const [favoritesOnly, setFavoritesOnly] = useState<boolean>(false);
    // Chế độ tối: đọc từ class "dark" trên <html> (Tailwind v4 custom-variant
    // áp dụng các class dark: theo class này). Ghi bằng cách toggle class +
    // lưu localStorage; MutationObserver báo cho store render lại.
    const darkMode = useSyncExternalStore(subscribeDarkMode, getDarkModeSnapshot, getDarkModeServerSnapshot);
    const setDarkMode = (next: boolean | ((prev: boolean) => boolean)) => {
        const value = typeof next === 'function' ? next(getDarkModeSnapshot()) : next;
        document.documentElement.classList.toggle('dark', value);
        try {
            window.localStorage.setItem('finder_dark_mode', value ? '1' : '0');
        } catch {
            // Bỏ qua khi trình duyệt chặn localStorage.
        }
    };

    // Nạp danh sách yêu thích từ server (bảng favorites) sau khi đăng nhập.
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
    const [currentUser, setCurrentUser] = useState<Omit<AppUser, 'password'> | null>(null);
    const [authToken, setAuthToken] = useState<string | null>(null);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    // State cho tính năng sửa thông tin cá nhân trong trang profile.
    const [profileName, setProfileName] = useState<string>('');
    const [profilePwCurrent, setProfilePwCurrent] = useState<string>('');
    const [profilePwNext, setProfilePwNext] = useState<string>('');
    const [profilePwConfirm, setProfilePwConfirm] = useState<string>('');
    const [updatingProfile, setUpdatingProfile] = useState<boolean>(false);
    const [changingPassword, setChangingPassword] = useState<boolean>(false);
    // Danh mục thương hiệu/tiện ích lấy từ server (admin quản lý), fallback khi chưa tải được.
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

    // Tên thương hiệu để hiển thị trong modal chi tiết (danh mục động từ server).
    function getBrandName(brandId?: string): string {
        const brand = catalogBrands.find((option) => option.id === brandId);
        return brand ? brand.name : 'Cửa hàng tiện lợi';
    }
    // State cho tính năng đánh giá sao trên từng card cửa hàng.
    const [ratingPickerStoreId, setRatingPickerStoreId] = useState<string | null>(null);
    const [pickerMyRating, setPickerMyRating] = useState<number | null>(null);
    // Bình luận đi kèm đánh giá trong popover chấm sao.
    const [pickerMyComment, setPickerMyComment] = useState<string>('');
    // Bình luận hiển thị trong modal chi tiết cửa hàng.
    const [detailsReviews, setDetailsReviews] = useState<StoreReviewItem[]>([]);
    const [loadingReviews, setLoadingReviews] = useState<boolean>(false);
    const [hoverStars, setHoverStars] = useState<number | null>(null);
    const [submittingRating, setSubmittingRating] = useState(false);
    const [authMode, setAuthMode] = useState<AuthMode>('login');
    const [accountMenuOpen, setAccountMenuOpen] = useState(false);
    const [mainView, setMainView] = useState<MainView>('main');
    const [loginForm, setLoginForm] = useState({ email: '', password: '' });
    const [registerForm, setRegisterForm] = useState({ fullName: '', email: '', password: '', confirmPassword: '' });
    const [storeRequestForm, setStoreRequestForm] = useState({
        storeName: '',
        brandName: 'Circle K',
        address: '',
        lat: 21.0285,
        lng: 105.8542,
        notes: '',
    });
    const [pendingRequests, setPendingRequests] = useState<StoreRequestRecord[]>([]);
    // State cho panel quản trị: người dùng, kiểm duyệt đánh giá, danh mục.
    type AdminTab = 'users' | 'reviews' | 'catalog';
    const [adminTab, setAdminTab] = useState<AdminTab>('users');
    const [adminUsers, setAdminUsers] = useState<AdminUserItem[]>([]);
    const [adminReviews, setAdminReviews] = useState<AdminReviewItem[]>([]);
    const [adminBrands, setAdminBrands] = useState<CatalogItem[]>([]);
    const [adminAmenities, setAdminAmenities] = useState<CatalogItem[]>([]);
    const [adminLoadedTab, setAdminLoadedTab] = useState<AdminTab | null>(null);
    const [newBrandSlug, setNewBrandSlug] = useState<string>('');
    const [newBrandName, setNewBrandName] = useState<string>('');
    const [newAmenitySlug, setNewAmenitySlug] = useState<string>('');
    const [newAmenityName, setNewAmenityName] = useState<string>('');
    const [editingCatalogSlug, setEditingCatalogSlug] = useState<string | null>(null);
    const [editingCatalogName, setEditingCatalogName] = useState<string>('');
    const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);

    useEffect(() => {
        clearLegacyAuthData();
        const saved = loadSession();
        if (saved) {
            setCurrentUser(saved.user);
            setAuthToken(saved.token);
        }
        // Tải danh mục thương hiệu/tiện ích do admin quản lý (fallback giữ nguyên nếu lỗi).
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
        // Quay về vị trí GPS thật: bỏ điểm đã chọn tay trên bản đồ.
        setPickedLocation(false);
        setPickingLocation(false);
        // Không set 'locating' đồng bộ ở đây để tránh setState trong effect;
        // trạng thái đã khởi tạo là 'locating', nút bấm lại cũng không cần.
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
        // Xin GPS 1 lần khi mở trang. setState bên trong requestLocation là
        // có chủ đích và chỉ chạy 1 lần (deps ổn định) nên không gây vòng lặp render.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        requestLocation();
    }, [requestLocation]);

    // Tự refresh danh sách chờ duyệt khi quay lại trang chính
    // (không sót yêu cầu mới gửi trong lúc admin đang xem trang khác).
    // Giữ nguyên shape "async function trong effect" như code gốc để
    // không vi phạm quy tắc set-state-in-effect của linter.
    useEffect(() => {
        if (mainView !== 'main') {
            return;
        }

        if (!currentUser || currentUser.role !== 'admin') {
            return;
        }

        async function fetchPendingRequests() {
            try {
                const res = await fetch('/api/store-requests', {
                    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
                });
                const data = await res.json();
                setPendingRequests(data.requests || []);
            } catch (error) {
                console.error('Lỗi tải yêu cầu cửa hàng:', error);
            }
        }

        fetchPendingRequests();
    }, [currentUser, authToken, mainView]);

    useEffect(() => {
        async function fetchStores() {
            // Mỗi lần fetch tăng số thứ tự; response nào không phải mới nhất
            // thì bị bỏ qua để tránh response cũ về sau ghi đè dữ liệu mới
            // (xảy ra khi vị trí GPS về sau lúc request đầu chưa xong).
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

                if (debouncedSearchTerm.trim()) {
                    params.set('search', debouncedSearchTerm.trim());
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
    }, [userLocation, radius, selectedBrand, selectedAmenities, openOnly, debouncedSearchTerm, sortBy, minRating, storesRetryKey]);

    const toggleAmenity = (amenityId: string) => {
        setSelectedAmenities((current) =>
            current.includes(amenityId)
                ? current.filter((id) => id !== amenityId)
                : [...current, amenityId]
        );
    };

    // Thêm/bỏ cửa hàng khỏi danh sách yêu thích của user đang đăng nhập.
    const toggleFavorite = async (store: Store) => {
        if (!currentUser) {
            toast('Đăng nhập để lưu cửa hàng yêu thích.', 'info');
            setIsAuthModalOpen(true);
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
            // Tính danh sách mới trước rồi mới setState + toast. Không được gọi
            // toast() (setState của ToastHost) bên trong updater của setFavoriteIds
            // vì updater có thể chạy trong lúc render -> React báo lỗi
            // "Cannot update a component while rendering a different component".
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

    // Người dùng click vào bản đồ khi đang ở chế độ chọn vị trí: lấy điểm đó
    // làm vị trí tìm kiếm mới (tự refetch nhờ userLocation đổi).
    const handleMapClick = (location: UserLocation) => {
        setUserLocation(location);
        setPickedLocation(true);
        setPickingLocation(false);
        setSelectedStore(null);
        toast('Đã chọn vị trí mới trên bản đồ.', 'success');
    };

    // Mở modal chi tiết cửa hàng (đồng thời chọn trên bản đồ để xem vị trí).
    const openStoreDetails = (store: Store) => {
        setSelectedStore(store);
        setDetailsStore(store);
        void loadStoreReviews(store.id);
    };

    // Tải bình luận đánh giá cho modal chi tiết.
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

    const handleLogin = async () => {
        try {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: loginForm.email.trim(),
                    password: loginForm.password,
                }),
            });

            const data = await res.json();
            if (!res.ok || !data.token) {
                toast(data.message || 'Email hoặc mật khẩu không đúng.', 'error');
                return;
            }

            setCurrentUser(data.user);
            setAuthToken(data.token);
            persistSession({ token: data.token, user: data.user });
            await refreshFavorites(data.token);
            setFavoritesOnly(false);
            setIsAuthModalOpen(false);
            setAccountMenuOpen(false);
            setAuthMode('login');
        } catch (error) {
            console.error('Lỗi đăng nhập:', error);
            toast('Không thể đăng nhập. Vui lòng thử lại.', 'error');
        }
    };

    const handleRegister = async () => {
        const trimmedName = registerForm.fullName.trim();
        const email = registerForm.email.trim();
        const password = registerForm.password;

        if (!trimmedName || !email || !password) {
            toast('Vui lòng nhập đầy đủ thông tin tài khoản.', 'error');
            return;
        }

        if (password.length < 6) {
            toast('Mật khẩu phải có ít nhất 6 ký tự.', 'error');
            return;
        }

        if (password !== registerForm.confirmPassword) {
            toast('Xác nhận mật khẩu không khớp.', 'error');
            return;
        }

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullName: trimmedName, email, password }),
            });

            const data = await res.json();
            if (!res.ok || !data.token) {
                toast(data.message || 'Không thể đăng ký tài khoản.', 'error');
                return;
            }

            // Đăng ký xong tự động đăng nhập
            setCurrentUser(data.user);
            setAuthToken(data.token);
            persistSession({ token: data.token, user: data.user });
            await refreshFavorites(data.token);
            setFavoritesOnly(false);
            setIsAuthModalOpen(false);
            setAuthMode('login');
            setLoginForm({ email: '', password: '' });
            setRegisterForm({ fullName: '', email: '', password: '', confirmPassword: '' });
            toast('Đăng ký thành công!', 'success');
        } catch (error) {
            console.error('Lỗi đăng ký:', error);
            toast('Không thể đăng ký. Vui lòng thử lại.', 'error');
        }
    };

    const handleLogout = () => {
        setCurrentUser(null);
        setAuthToken(null);
        persistSession(null);
        setFavoriteIds([]);
        setFavoritesOnly(false);
        setAccountMenuOpen(false);
        setMainView('main');
        setRatingPickerStoreId(null);
        setPickerMyRating(null);
        setPickerMyComment('');
        setHoverStars(null);
        setDetailsStore(null);  
    };

    // Nạp tên hiện tại vào form ngay khi mở trang profile.
    const openProfileView = () => {
        if (currentUser) {
            setProfileName(currentUser.fullName);
        }
        setProfilePwCurrent('');
        setProfilePwNext('');
        setProfilePwConfirm('');
        setMainView('profile');
        setAccountMenuOpen(false);
    };

    const handleUpdateProfileName = async () => {
        if (!currentUser || !authToken) {
            toast('Bạn cần đăng nhập.', 'error');
            return;
        }

        setUpdatingProfile(true);
        try {
            const res = await fetch('/api/profile', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${authToken}`,
                },
                body: JSON.stringify({ fullName: profileName }),
            });
            const data = await res.json();

            if (!res.ok || !data.user) {
                toast(data.message || 'Không thể cập nhật tên hiển thị.', 'error');
                return;
            }

            // Cập nhật ngay user trong state + session lưu local để header hiện tên mới.
            setCurrentUser(data.user);
            persistSession({ token: authToken, user: data.user });
            toast('Đã cập nhật tên hiển thị.', 'success');
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
        } finally {
            setUpdatingProfile(false);
        }
    };

    const handleChangePassword = async () => {
        if (!currentUser || !authToken) {
            toast('Bạn cần đăng nhập.', 'error');
            return;
        }
        if (profilePwNext !== profilePwConfirm) {
            toast('Mật khẩu mới nhập lại chưa khớp.', 'error');
            return;
        }

        setChangingPassword(true);
        try {
            const res = await fetch('/api/profile/password', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${authToken}`,
                },
                body: JSON.stringify({
                    currentPassword: profilePwCurrent,
                    newPassword: profilePwNext,
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                toast(data.message || 'Không thể đổi mật khẩu.', 'error');
                return;
            }

            setProfilePwCurrent('');
            setProfilePwNext('');
            setProfilePwConfirm('');
            toast('Đổi mật khẩu thành công.', 'success');
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
        } finally {
            setChangingPassword(false);
        }
    };

    const handleSubmitStoreRequest = async () => {
        if (!currentUser || !hasPermission(currentUser, 'submit_store_request')) {
            toast('Bạn cần đăng nhập để gửi yêu cầu thêm cửa hàng.', 'error');
            return;
        }

        if (!storeRequestForm.storeName.trim() || !storeRequestForm.address.trim()) {
            toast('Vui lòng nhập tên cửa hàng và địa chỉ.', 'error');
            return;
        }

        try {
            const res = await fetch('/api/store-requests', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
                },
                body: JSON.stringify({
                    storeName: storeRequestForm.storeName,
                    brandName: storeRequestForm.brandName,
                    address: storeRequestForm.address,
                    lat: Number(storeRequestForm.lat),
                    lng: Number(storeRequestForm.lng),
                    amenities: ['wifi', 'parking'],
                    notes: storeRequestForm.notes,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không thể gửi yêu cầu.', 'error');
                return;
            }

            setStoreRequestForm({
                storeName: '',
                brandName: 'Circle K',
                address: '',
                lat: 21.0285,
                lng: 105.8542,
                notes: '',
            });
            setMainView('main');
            toast(data.message || 'Yêu cầu đã được gửi cho Admin.', 'success');
        } catch (error) {
            console.error('Lỗi gửi yêu cầu:', error);
            toast('Không thể gửi yêu cầu thêm cửa hàng.', 'error');
        }
    };

    // Mở bảng chấm sao cho cửa hàng. Chưa đăng nhập thì mời đăng nhập.
    const openRatingPicker = async (store: Store) => {
        if (!currentUser) {
            toast('Đăng nhập để đánh giá cửa hàng.', 'info');
            setIsAuthModalOpen(true);
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
            // Không lấy được đánh giá cũ thì vẫn cho chấm sao bình thường.
        }
    };

    const submitRating = async (store: Store, stars: number) => {
        if (!currentUser) {
            toast('Đăng nhập để đánh giá cửa hàng.', 'info');
            setIsAuthModalOpen(true);
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

            // Cập nhật rating hiển thị ngay trên card, không cần tải lại danh sách.
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

    const handleApproveRequest = async (requestId: string, status: 'APPROVED' | 'REJECTED') => {
        if (!currentUser || !hasPermission(currentUser, 'approve_store_request')) {
            toast('Chỉ Admin mới được xác nhận yêu cầu.', 'error');
            return;
        }

        try {
            const res = await fetch('/api/store-requests', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
                },
                body: JSON.stringify({
                    requestId,
                    status,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không thể cập nhật trạng thái.', 'error');
                return;
            }

            setPendingRequests((requests) => requests.filter((item) => item.id !== requestId));
            // Khi duyệt: tải lại danh sách cửa hàng để cửa hàng mới hiện ngay.
            if (status === 'APPROVED') {
                setStoresRetryKey((key) => key + 1);
            }
            toast(`Yêu cầu đã được ${status === 'APPROVED' ? 'duyệt' : 'từ chối'}.`, 'success');
        } catch (error) {
            console.error('Lỗi cập nhật yêu cầu:', error);
            toast('Không thể cập nhật yêu cầu.', 'error');
        }
    };

    // ---- Panel quản trị: người dùng / đánh giá / danh mục (chỉ admin) ----
    const adminHeaders = (): Record<string, string> => ({
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    });

    const loadAdminUsers = async () => {
        try {
            const res = await fetch('/api/admin/users', { headers: adminHeaders() });
            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không thể tải danh sách người dùng.', 'error');
                return;
            }
            setAdminUsers(data.users || []);
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
        } finally {
            setAdminLoadedTab('users');
        }
    };

    const handleToggleUserActive = async (user: AdminUserItem) => {
        try {
            const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                body: JSON.stringify({ isActive: !user.isActive }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không thể cập nhật tài khoản.', 'error');
                return;
            }
            toast(user.isActive ? 'Đã khóa tài khoản.' : 'Đã mở khóa tài khoản.', 'success');
            await loadAdminUsers();
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
        }
    };

    const loadAdminReviews = async () => {
        try {
            const res = await fetch('/api/admin/reviews', { headers: adminHeaders() });
            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không thể tải danh sách đánh giá.', 'error');
                return;
            }
            setAdminReviews(data.reviews || []);
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
        } finally {
            setAdminLoadedTab('reviews');
        }
    };

    const handleDeleteReview = async (review: AdminReviewItem) => {
        const key = `review:${review.storeId}:${review.userId}`;
        if (confirmDeleteKey !== key) {
            setConfirmDeleteKey(key);
            return;
        }
        setConfirmDeleteKey(null);
        try {
            const res = await fetch(
                `/api/admin/reviews?storeId=${encodeURIComponent(review.storeId)}&userId=${encodeURIComponent(review.userId)}`,
                { method: 'DELETE', headers: adminHeaders() }
            );
            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không thể xóa đánh giá.', 'error');
                return;
            }
            toast('Đã xóa đánh giá.', 'success');
            await loadAdminReviews();
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
        }
    };

    const loadAdminCatalog = async () => {
        try {
            const [brandRes, amenityRes] = await Promise.all([
                fetch('/api/admin/brands', { headers: adminHeaders() }),
                fetch('/api/admin/amenities', { headers: adminHeaders() }),
            ]);
            const brandData = await brandRes.json();
            const amenityData = await amenityRes.json();
            if (!brandRes.ok || !amenityRes.ok) {
                toast('Không thể tải danh mục.', 'error');
                return;
            }
            setAdminBrands(brandData.brands || []);
            setAdminAmenities(amenityData.amenities || []);
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
        } finally {
            setAdminLoadedTab('catalog');
        }
    };

    const refreshPublicCatalog = async () => {
        try {
            const res = await fetch('/api/catalog');
            const data = await res.json();
            if (Array.isArray(data?.brands) && data.brands.length > 0) {
                setCatalogBrands(data.brands);
            }
            if (Array.isArray(data?.amenities) && data.amenities.length > 0) {
                setCatalogAmenities(data.amenities);
            }
        } catch {
            // Giữ danh mục hiện tại nếu tải lại thất bại.
        }
    };

    const handleAddCatalogItem = async (kind: 'brands' | 'amenities') => {
        const slug = kind === 'brands' ? newBrandSlug : newAmenitySlug;
        const name = kind === 'brands' ? newBrandName : newAmenityName;
        try {
            const res = await fetch(`/api/admin/${kind}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                body: JSON.stringify({ slug, name }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không thể thêm.', 'error');
                return;
            }
            if (kind === 'brands') {
                setNewBrandSlug('');
                setNewBrandName('');
            } else {
                setNewAmenitySlug('');
                setNewAmenityName('');
            }
            toast('Đã thêm.', 'success');
            await loadAdminCatalog();
            await refreshPublicCatalog();
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
        }
    };

    const handleRenameCatalogItem = async (kind: 'brands' | 'amenities', slug: string) => {
        try {
            const res = await fetch(`/api/admin/${kind}/${encodeURIComponent(slug)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                body: JSON.stringify({ name: editingCatalogName }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không thể đổi tên.', 'error');
                return;
            }
            setEditingCatalogSlug(null);
            setEditingCatalogName('');
            toast('Đã đổi tên.', 'success');
            await loadAdminCatalog();
            await refreshPublicCatalog();
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
        }
    };

    const handleDeleteCatalogItem = async (kind: 'brands' | 'amenities', slug: string) => {
        const key = `${kind}:${slug}`;
        if (confirmDeleteKey !== key) {
            setConfirmDeleteKey(key);
            return;
        }
        setConfirmDeleteKey(null);
        try {
            const res = await fetch(`/api/admin/${kind}/${encodeURIComponent(slug)}`, {
                method: 'DELETE',
                headers: adminHeaders(),
            });
            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không thể xóa.', 'error');
                return;
            }
            toast('Đã xóa.', 'success');
            await loadAdminCatalog();
            await refreshPublicCatalog();
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
        }
    };

    // Tải dữ liệu admin khi mở trang quản trị (chỉ khi đang đăng nhập bằng admin).
    useEffect(() => {
        if (mainView !== 'admin' || currentUser?.role !== 'admin') {
            return;
        }
        async function fetchCurrentAdminTab() {
            if (adminTab === 'users') {
                await loadAdminUsers();
            } else if (adminTab === 'reviews') {
                await loadAdminReviews();
            } else {
                await loadAdminCatalog();
            }
        }
        fetchCurrentAdminTab();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mainView, adminTab, currentUser?.role]);

    // Mở Google Maps chỉ đường. Dùng chung cho card và modal chi tiết.
    const openDirections = (store: Store) => {
        setSelectedStore(store);

        const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${store.lat},${store.lng}`;
        window.open(googleMapsUrl, '_blank');
    };

    const handleDirections = (e: React.MouseEvent, store: Store) => {
        e.stopPropagation();
        openDirections(store);
    };

    // Số liệu cho thẻ "Tổng quan" dưới bộ lọc — tính trực tiếp từ kết quả
    // đang hiển thị nên tự cập nhật khi đổi filter/tìm kiếm.
    // Khi sắp xếp theo đánh giá, cửa hàng đầu danh sách là đánh giá cao nhất.
    const openStoreCount = stores.filter((store) => store.isOpen || store.is24h).length;
    const nearestStore = sortBy === 'nearest' && stores.length > 0 ? stores[0] : undefined;
    // Tab "Yêu thích": lọc client-side theo danh sách đã lưu của user.
    const displayedStores = favoritesOnly ? stores.filter((store) => favoriteIds.includes(store.id)) : stores;

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
            <div className="max-w-7xl mx-auto mb-6 flex justify-between items-center gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                        <MapPin className="h-6 w-6" />
                        ConvenienceFinder
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Tìm cửa hàng tiện lợi gần bạn nhất</p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setDarkMode((prev) => !prev)}
                        title={darkMode ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
                        aria-label={darkMode ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
                        className="rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2.5 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                        {darkMode ? (
                            <Sun className="h-5 w-5 text-amber-400" />
                        ) : (
                            <Moon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                        )}
                    </button>
                    <div className="relative">
                    {currentUser ? (
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setAccountMenuOpen((prev) => !prev)}
                                className="flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                                    <User className="h-5 w-5" />
                                </span>
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{currentUser.fullName}</span>
                            </button>

                            {accountMenuOpen && (
                                <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 shadow-lg">
                                    <button
                                        type="button"
                                        onClick={openProfileView}
                                        className="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    >
                                        Xem thông tin tài khoản
                                    </button>
                                    {currentUser.role === 'admin' && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMainView('admin');
                                                setAccountMenuOpen(false);
                                            }}
                                            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                                        >
                                            Quản trị hệ thống
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMainView('store-request');
                                            setAccountMenuOpen(false);
                                        }}
                                        className="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    >
                                        Gửi yêu cầu thêm cửa hàng
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleLogout}
                                        className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
                                    >
                                        Đăng xuất tài khoản
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                setIsAuthModalOpen(true);
                                setAuthMode('login');
                            }}
                            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                        >
                            Đăng nhập / Đăng ký
                        </button>
                    )}
                    </div>
                </div>
            </div>

            {mainView === 'profile' && currentUser && (
                <div className="max-w-7xl mx-auto mb-6 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Thông tin tài khoản</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Quản lý tài khoản và quyền truy cập</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setMainView('main')}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                        >
                            Đóng
                        </button>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4">
                            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Họ tên</p>
                            <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-gray-200">{currentUser.fullName}</p>
                        </div>
                        <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4">
                            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Vai trò</p>
                            <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-gray-200">{getRoleLabel(currentUser.role)}</p>
                        </div>
                        <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 md:col-span-2">
                            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Username/Email</p>
                            <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-gray-200">{currentUser.email}</p>
                        </div>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4">
                            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Đổi tên hiển thị</p>
                            <input
                                type="text"
                                value={profileName}
                                onChange={(e) => setProfileName(e.target.value)}
                                placeholder="Tên hiển thị mới"
                                maxLength={50}
                                className="mt-2 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-200"
                            />
                            <button
                                type="button"
                                disabled={updatingProfile}
                                onClick={handleUpdateProfileName}
                                className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                {updatingProfile ? 'Đang lưu...' : 'Lưu tên'}
                            </button>
                        </div>
                        <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4">
                            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Đổi mật khẩu</p>
                            <input
                                type="password"
                                value={profilePwCurrent}
                                onChange={(e) => setProfilePwCurrent(e.target.value)}
                                placeholder="Mật khẩu hiện tại"
                                className="mt-2 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-200"
                            />
                            <input
                                type="password"
                                value={profilePwNext}
                                onChange={(e) => setProfilePwNext(e.target.value)}
                                placeholder="Mật khẩu mới (ít nhất 6 ký tự)"
                                className="mt-2 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-200"
                            />
                            <input
                                type="password"
                                value={profilePwConfirm}
                                onChange={(e) => setProfilePwConfirm(e.target.value)}
                                placeholder="Nhập lại mật khẩu mới"
                                className="mt-2 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-200"
                            />
                            <button
                                type="button"
                                disabled={changingPassword}
                                onClick={handleChangePassword}
                                className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                {changingPassword ? 'Đang lưu...' : 'Đổi mật khẩu'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {mainView === 'store-request' && currentUser && (
                <div className="max-w-7xl mx-auto mb-6 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Gửi yêu cầu thêm cửa hàng</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Yêu cầu của bạn sẽ được Admin xác nhận trước khi tạo cửa hàng mới.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setMainView('main')}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                        >
                            Quay lại
                        </button>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <input
                            value={storeRequestForm.storeName}
                            onChange={(e) => setStoreRequestForm({ ...storeRequestForm, storeName: e.target.value })}
                            className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm"
                            placeholder="Tên cửa hàng"
                        />
                        <input
                            value={storeRequestForm.brandName}
                            onChange={(e) => setStoreRequestForm({ ...storeRequestForm, brandName: e.target.value })}
                            className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm"
                            placeholder="Thương hiệu"
                        />
                        <input
                            value={storeRequestForm.address}
                            onChange={(e) => setStoreRequestForm({ ...storeRequestForm, address: e.target.value })}
                            className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm md:col-span-2"
                            placeholder="Địa chỉ cửa hàng"
                        />
                        <input
                            type="number"
                            step="0.0001"
                            value={storeRequestForm.lat}
                            onChange={(e) => setStoreRequestForm({ ...storeRequestForm, lat: Number(e.target.value) })}
                            className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm"
                            placeholder="Lat"
                        />
                        <input
                            type="number"
                            step="0.0001"
                            value={storeRequestForm.lng}
                            onChange={(e) => setStoreRequestForm({ ...storeRequestForm, lng: Number(e.target.value) })}
                            className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm"
                            placeholder="Lng"
                        />
                        <textarea
                            value={storeRequestForm.notes}
                            onChange={(e) => setStoreRequestForm({ ...storeRequestForm, notes: e.target.value })}
                            className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm md:col-span-2"
                            rows={4}
                            placeholder="Ghi chú, mô tả hoặc thông tin bổ sung"
                        />
                    </div>

                    <div className="mt-5 flex justify-end">
                        <button
                            type="button"
                            onClick={handleSubmitStoreRequest}
                            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                        >
                            Gửi yêu cầu
                        </button>
                    </div>
                </div>
            )}

            {currentUser && currentUser.role === 'admin' && pendingRequests.length > 0 && (
                <div className="max-w-7xl mx-auto mb-6 rounded-2xl border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950 p-5 shadow-sm">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Yêu cầu chờ xác nhận</h3>
                    <div className="mt-4 space-y-3">
                        {pendingRequests.map((request) => (
                            <div key={request.id} className="rounded-xl border border-yellow-200 dark:border-yellow-800 bg-white dark:bg-gray-900 p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="font-semibold text-gray-800 dark:text-gray-200">{request.storeName}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{request.address}</p>
                                    </div>
                                    <span className="rounded-full bg-yellow-100 dark:bg-yellow-900 px-2 py-1 text-xs font-medium text-yellow-700 dark:text-yellow-300">
                                        {request.status}
                                    </span>
                                </div>
                                <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">Người gửi: {request.submittedByName}</p>
                                <div className="mt-3 flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleApproveRequest(request.id, 'APPROVED')}
                                        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                                    >
                                        Duyệt
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleApproveRequest(request.id, 'REJECTED')}
                                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                                    >
                                        Từ chối
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Panel quản trị: người dùng / kiểm duyệt đánh giá / danh mục */}
            {mainView === 'admin' && currentUser && currentUser.role === 'admin' && (
                <div className="max-w-7xl mx-auto mb-6 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Quản trị hệ thống</h3>
                        <button
                            type="button"
                            onClick={() => setMainView('main')}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                        >
                            Quay lại
                        </button>
                    </div>
                    <div className="mt-3 flex gap-2 border-b border-gray-200 dark:border-gray-700">
                        {(
                            [
                                { id: 'users', label: 'Người dùng' },
                                { id: 'reviews', label: 'Đánh giá' },
                                { id: 'catalog', label: 'Danh mục' },
                            ] as { id: AdminTab; label: string }[]
                        ).map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => {
                                    setAdminTab(tab.id);
                                    setConfirmDeleteKey(null);
                                    setEditingCatalogSlug(null);
                                }}
                                className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
                                    adminTab === tab.id
                                        ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {adminLoadedTab !== adminTab && (
                        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Đang tải...</p>
                    )}

                    {adminLoadedTab === adminTab && adminTab === 'users' && (
                        <div className="mt-4 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        <th className="py-2 pr-3">Họ tên</th>
                                        <th className="py-2 pr-3">Username/Email</th>
                                        <th className="py-2 pr-3">Vai trò</th>
                                        <th className="py-2 pr-3">Trạng thái</th>
                                        <th className="py-2 pr-3">Ngày tạo</th>
                                        <th className="py-2">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {adminUsers.map((user) => (
                                        <tr key={user.id} className="border-t border-gray-100 dark:border-gray-800">
                                            <td className="py-2 pr-3 font-medium text-gray-800 dark:text-gray-200">{user.fullName}</td>
                                            <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">{user.email}</td>
                                            <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">{getRoleLabel(user.role as 'user' | 'admin')}</td>
                                            <td className="py-2 pr-3">
                                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${user.isActive ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'}`}>
                                                    {user.isActive ? 'Hoạt động' : 'Đã khóa'}
                                                </span>
                                            </td>
                                            <td className="py-2 pr-3 text-xs text-gray-500 dark:text-gray-400">{user.createdAt}</td>
                                            <td className="py-2">
                                                {user.id !== currentUser.id && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleUserActive(user)}
                                                        className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white ${user.isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
                                                    >
                                                        {user.isActive ? 'Khóa' : 'Mở khóa'}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {adminUsers.length === 0 && (
                                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Chưa có người dùng.</p>
                            )}
                        </div>
                    )}

                    {adminLoadedTab === adminTab && adminTab === 'reviews' && (
                        <div className="mt-4 space-y-3">
                            {adminReviews.map((review) => {
                                const key = `review:${review.storeId}:${review.userId}`;
                                return (
                                    <div key={key} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="font-semibold text-gray-800 dark:text-gray-200">
                                                    {review.storeName}
                                                    <span className="ml-2 text-sm font-normal text-amber-600 dark:text-amber-400">
                                                        {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                                                    </span>
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    {review.userName} • {review.createdAt}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteReview(review)}
                                                className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white ${confirmDeleteKey === key ? 'bg-red-700' : 'bg-red-600 hover:bg-red-700'}`}
                                            >
                                                {confirmDeleteKey === key ? 'Chắc chắn xóa?' : 'Xóa'}
                                            </button>
                                        </div>
                                        {review.comment ? (
                                            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{review.comment}</p>
                                        ) : (
                                            <p className="mt-2 text-xs italic text-gray-400 dark:text-gray-500">(không có bình luận)</p>
                                        )}
                                    </div>
                                );
                            })}
                            {adminReviews.length === 0 && (
                                <p className="text-sm text-gray-500 dark:text-gray-400">Chưa có đánh giá nào.</p>
                            )}
                        </div>
                    )}

                    {adminLoadedTab === adminTab && adminTab === 'catalog' && (
                        <div className="mt-4 grid gap-6 md:grid-cols-2">
                            {(
                                [
                                    { kind: 'brands', title: 'Thương hiệu', items: adminBrands, slug: newBrandSlug, setSlug: setNewBrandSlug, name: newBrandName, setName: setNewBrandName },
                                    { kind: 'amenities', title: 'Tiện ích', items: adminAmenities, slug: newAmenitySlug, setSlug: setNewAmenitySlug, name: newAmenityName, setName: setNewAmenityName },
                                ] as const
                            ).map((section) => (
                                <div key={section.kind}>
                                    <h4 className="font-semibold text-gray-800 dark:text-gray-200">{section.title}</h4>
                                    <div className="mt-2 flex gap-2">
                                        <input
                                            value={section.slug}
                                            onChange={(e) => section.setSlug(e.target.value)}
                                            placeholder="slug (vd: circle-k)"
                                            className="w-2/5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-200"
                                        />
                                        <input
                                            value={section.name}
                                            onChange={(e) => section.setName(e.target.value)}
                                            placeholder="Tên hiển thị"
                                            className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-200"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handleAddCatalogItem(section.kind)}
                                            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                                        >
                                            Thêm
                                        </button>
                                    </div>
                                    <ul className="mt-3 space-y-2">
                                        {section.items.map((item) => {
                                            const deleteKey = `${section.kind}:${item.id}`;
                                            const editingKey = `${section.kind}:${item.id}`;
                                            return (
                                                <li key={item.id} className="flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2">
                                                    <span className="text-xs text-gray-400 dark:text-gray-500 w-24 truncate">{item.id}</span>
                                                    {editingCatalogSlug === editingKey ? (
                                                        <>
                                                            <input
                                                                value={editingCatalogName}
                                                                onChange={(e) => setEditingCatalogName(e.target.value)}
                                                                className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-gray-800 dark:text-gray-200"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRenameCatalogItem(section.kind, item.id)}
                                                                className="rounded-lg bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
                                                            >
                                                                Lưu
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditingCatalogSlug(null)}
                                                                className="rounded-lg px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700"
                                                            >
                                                                Hủy
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200">{item.name}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setEditingCatalogSlug(editingKey);
                                                                    setEditingCatalogName(item.name);
                                                                    setConfirmDeleteKey(null);
                                                                }}
                                                                className="rounded-lg px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                                            >
                                                                Sửa
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteCatalogItem(section.kind, item.id)}
                                                                className={`rounded-lg px-2 py-1 text-xs font-medium text-white ${confirmDeleteKey === deleteKey ? 'bg-red-700' : 'bg-red-600 hover:bg-red-700'}`}
                                                            >
                                                                {confirmDeleteKey === deleteKey ? 'Chắc chắn?' : 'Xóa'}
                                                            </button>
                                                        </>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            ))}
                            <p className="md:col-span-2 text-xs text-gray-500 dark:text-gray-400">
                                Slug dùng làm định danh (chữ thường, số, gạch ngang). Không xóa được mục đang có cửa hàng sử dụng. Thay đổi áp dụng ngay cho bộ lọc ngoài trang chính.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Thanh bộ lọc ngang gọn (thay sidebar dài) + dải thống kê luôn nhìn thấy */}
            <div className="max-w-7xl mx-auto mb-6 rounded-2xl bg-white dark:bg-gray-900 px-4 py-3.5 shadow-md">
                {/* Nút thu gọn/mở rộng bộ lọc: chỉ hiện trên mobile, desktop luôn mở */}
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
                            value={searchTerm}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Tên cửa hàng hoặc địa chỉ"
                            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Bán kính</label>
                        <select
                            value={radius}
                            onChange={(e) => setRadius(Number(e.target.value))}
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
                            value={selectedBrand}
                            onChange={(e) => setSelectedBrand(e.target.value)}
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
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as 'nearest' | 'rating')}
                            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
                        >
                            <option value="nearest">Gần nhất trước</option>
                            <option value="rating">Đánh giá cao nhất</option>
                        </select>
                    </div>

                    <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Đánh giá tối thiểu</label>
                        <select
                            value={minRating}
                            onChange={(e) => setMinRating(Number(e.target.value))}
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
                        const active = selectedAmenities.includes(amenity.id);
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
                        onClick={() => setOpenOnly((prev) => !prev)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${openOnly
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }`}
                    >
                        Chỉ đang mở
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
                        {/* Cụm nút đặt ở góc phải để không che nút zoom +/- (góc trái) của bản đồ.
                            z-10: đủ nổi trên các lớp của Leaflet, nhưng thấp hơn modal (z-40)
                            để không đè lên modal chi tiết khi mở. */}
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

            {isAuthModalOpen && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
                    <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-2xl">
                        <div className="mb-5 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                                {authMode === 'login' ? 'Đăng nhập tài khoản' : 'Đăng ký tài khoản'}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setIsAuthModalOpen(false)}
                                aria-label="Đóng"
                                className="rounded-lg p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {authMode === 'login' ? (
                            <div className="space-y-4">
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Username/Email:</label>
                                    <input
                                        value={loginForm.email}
                                        onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                                        className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Mật khẩu:</label>
                                    <input
                                        type="password"
                                        value={loginForm.password}
                                        onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                                        className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={handleLogin}
                                    className="w-full rounded-xl bg-blue-600 py-3 text-lg font-semibold text-white shadow-sm hover:bg-blue-700"
                                >
                                    Đăng nhập
                                </button>

                                <div className="text-center text-base text-gray-900 dark:text-gray-100">
                                    <span>Bạn chưa có tài khoản? </span>
                                    <button
                                        type="button"
                                        onClick={() => setAuthMode('register')}
                                        className="font-semibold text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-200"
                                    >
                                        Đăng ký tài khoản mới
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Họ và tên:</label>
                                    <input
                                        value={registerForm.fullName}
                                        onChange={(e) => setRegisterForm({ ...registerForm, fullName: e.target.value })}
                                        className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Username/Email:</label>
                                    <input
                                        value={registerForm.email}
                                        onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                                        className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Mật khẩu:</label>
                                    <input
                                        type="password"
                                        value={registerForm.password}
                                        onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                                        className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Xác nhận mật khẩu:</label>
                                    <input
                                        type="password"
                                        value={registerForm.confirmPassword}
                                        onChange={(e) => setRegisterForm({ ...registerForm, confirmPassword: e.target.value })}
                                        className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={handleRegister}
                                    className="w-full rounded-xl bg-blue-600 py-3 text-lg font-semibold text-white shadow-sm hover:bg-blue-700"
                                >
                                    Đăng ký
                                </button>

                                <div className="text-center">
                                    <button
                                        type="button"
                                        onClick={() => setAuthMode('login')}
                                        className="text-base font-semibold text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-200"
                                    >
                                        Quay lại đăng nhập
                                    </button>
                                </div>
                            </div>
                        )}
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
            <ToastHost />
        </main>
    );
}