'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Star, Navigation, User, X, SearchX, Heart, Clock, Crosshair } from 'lucide-react';
import MapView from '@/components/MapView';
import ToastHost, { toast } from '@/components/Toast';
import { AppUser, StoreRequestRecord, getRoleLabel, hasPermission } from '@/lib/auth-system';
import { Store, UserLocation } from '@/types/store';

const brandOptions = [
    { id: 'all', name: 'Tất cả' },
    { id: 'circle-k', name: 'Circle K' },
    { id: 'winmart', name: 'WinMart+' },
    { id: 'gs25', name: 'GS25' },
    { id: 'familymart', name: 'FamilyMart' },
    { id: '7-eleven', name: '7-Eleven' },
];

const amenityOptions = [
    { id: 'wifi', name: 'Wi‑Fi' },
    { id: 'parking', name: 'Bãi xe' },
    { id: 'seating', name: 'Chỗ ngồi' },
    { id: 'cashless', name: 'Có chuyển khoản' },
    { id: 'wc', name: 'Nhà vệ sinh' },
    { id: 'overnight', name: 'Cho phép qua đêm' },
];

const amenityNameById: Record<string, string> = Object.fromEntries(
    amenityOptions.map((amenity) => [amenity.id, amenity.name])
);

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

const STORAGE_SESSION_KEY = 'finder_session';
const STORAGE_FAVORITES_KEY = 'finder_favorites';

type AuthMode = 'login' | 'register';
type MainView = 'main' | 'profile' | 'store-request';

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

// Danh sách yêu thích lưu theo từng user trong localStorage:
// { [userId]: [storeId, ...] }. Reset server không mất vì nằm ở client.
function loadFavorites(userId: string): string[] {
    if (typeof window === 'undefined') {
        return [];
    }
    try {
        const saved = window.localStorage.getItem(STORAGE_FAVORITES_KEY);
        if (!saved) {
            return [];
        }
        const parsed = JSON.parse(saved) as Record<string, unknown>;
        const ids = parsed[userId];
        return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
    } catch {
        return [];
    }
}

function persistFavorites(userId: string, storeIds: string[]) {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        const saved = window.localStorage.getItem(STORAGE_FAVORITES_KEY);
        const parsed = (saved ? JSON.parse(saved) : {}) as Record<string, string[]>;
        parsed[userId] = storeIds;
        window.localStorage.setItem(STORAGE_FAVORITES_KEY, JSON.stringify(parsed));
    } catch {
        // localStorage đầy hoặc bị chặn thì bỏ qua, không crash app.
    }
}

// Tên thương hiệu để hiển thị trong modal chi tiết.
function getBrandName(brandId?: string): string {
    const brand = brandOptions.find((option) => option.id === brandId);
    return brand ? brand.name : 'Cửa hàng tiện lợi';
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
    // Sắp xếp + lọc theo đánh giá (gửi lên API để cả 3 nguồn dữ liệu xử lý giống nhau).
    const [sortBy, setSortBy] = useState<'nearest' | 'rating'>('nearest');
    const [minRating, setMinRating] = useState<number>(0);
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
    const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
        const saved = loadSession();
        return saved ? loadFavorites(saved.user.id) : [];
    });
    const [favoritesOnly, setFavoritesOnly] = useState<boolean>(false);
    const [currentUser, setCurrentUser] = useState<Omit<AppUser, 'password'> | null>(null);
    const [authToken, setAuthToken] = useState<string | null>(null);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    // State cho tính năng đánh giá sao trên từng card cửa hàng.
    const [ratingPickerStoreId, setRatingPickerStoreId] = useState<string | null>(null);
    const [pickerMyRating, setPickerMyRating] = useState<number | null>(null);
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

    useEffect(() => {
        clearLegacyAuthData();
        const saved = loadSession();
        if (saved) {
            setCurrentUser(saved.user);
            setAuthToken(saved.token);
        }
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
    const toggleFavorite = (store: Store) => {
        if (!currentUser) {
            toast('Đăng nhập để lưu cửa hàng yêu thích.', 'info');
            setIsAuthModalOpen(true);
            return;
        }

        // Tính danh sách mới trước rồi mới setState + toast. Không được gọi
        // toast() (setState của ToastHost) bên trong updater của setFavoriteIds
        // vì updater có thể chạy trong lúc render -> React báo lỗi
        // "Cannot update a component while rendering a different component".
        const isFavorite = favoriteIds.includes(store.id);
        const next = isFavorite
            ? favoriteIds.filter((id) => id !== store.id)
            : [...favoriteIds, store.id];
        setFavoriteIds(next);
        persistFavorites(currentUser.id, next);
        toast(isFavorite ? 'Đã bỏ khỏi danh sách yêu thích.' : 'Đã lưu vào danh sách yêu thích.', 'success');
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
            setFavoriteIds(loadFavorites(data.user.id));
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
            setFavoriteIds(loadFavorites(data.user.id));
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
        setHoverStars(null);

        try {
            const res = await fetch(`/api/stores/${encodeURIComponent(store.id)}/rate`, {
                headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
            });
            const data = await res.json();
            setPickerMyRating(typeof data.myRating === 'number' ? data.myRating : null);
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
                body: JSON.stringify({ stars }),
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
        <main className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto mb-6 flex justify-between items-center gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-blue-600 flex items-center gap-2">
                        <MapPin className="h-6 w-6" />
                        ConvenienceFinder
                    </h1>
                    <p className="text-gray-500 text-sm">Tìm cửa hàng tiện lợi gần bạn nhất</p>
                </div>

                <div className="relative">
                    {currentUser ? (
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setAccountMenuOpen((prev) => !prev)}
                                className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 shadow-sm hover:bg-gray-50"
                            >
                                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                                    <User className="h-5 w-5" />
                                </span>
                                <span className="text-sm font-medium text-gray-700">{currentUser.fullName}</span>
                            </button>

                            {accountMenuOpen && (
                                <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMainView('profile');
                                            setAccountMenuOpen(false);
                                        }}
                                        className="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                                    >
                                        Xem thông tin tài khoản
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMainView('store-request');
                                            setAccountMenuOpen(false);
                                        }}
                                        className="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                                    >
                                        Gửi yêu cầu thêm cửa hàng
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleLogout}
                                        className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
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

            {mainView === 'profile' && currentUser && (
                <div className="max-w-7xl mx-auto mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Thông tin tài khoản</h2>
                            <p className="text-sm text-gray-500">Quản lý tài khoản và quyền truy cập</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setMainView('main')}
                            className="text-sm text-blue-600 hover:text-blue-800"
                        >
                            Đóng
                        </button>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="rounded-xl bg-gray-50 p-4">
                            <p className="text-xs uppercase tracking-wide text-gray-500">Họ tên</p>
                            <p className="mt-1 text-lg font-semibold text-gray-800">{currentUser.fullName}</p>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-4">
                            <p className="text-xs uppercase tracking-wide text-gray-500">Vai trò</p>
                            <p className="mt-1 text-lg font-semibold text-gray-800">{getRoleLabel(currentUser.role)}</p>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-4 md:col-span-2">
                            <p className="text-xs uppercase tracking-wide text-gray-500">Email</p>
                            <p className="mt-1 text-lg font-semibold text-gray-800">{currentUser.email}</p>
                        </div>
                    </div>
                </div>
            )}

            {mainView === 'store-request' && currentUser && (
                <div className="max-w-7xl mx-auto mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Gửi yêu cầu thêm cửa hàng</h2>
                            <p className="text-sm text-gray-500">Yêu cầu của bạn sẽ được Admin xác nhận trước khi tạo cửa hàng mới.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setMainView('main')}
                            className="text-sm text-blue-600 hover:text-blue-800"
                        >
                            Quay lại
                        </button>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <input
                            value={storeRequestForm.storeName}
                            onChange={(e) => setStoreRequestForm({ ...storeRequestForm, storeName: e.target.value })}
                            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                            placeholder="Tên cửa hàng"
                        />
                        <input
                            value={storeRequestForm.brandName}
                            onChange={(e) => setStoreRequestForm({ ...storeRequestForm, brandName: e.target.value })}
                            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                            placeholder="Thương hiệu"
                        />
                        <input
                            value={storeRequestForm.address}
                            onChange={(e) => setStoreRequestForm({ ...storeRequestForm, address: e.target.value })}
                            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm md:col-span-2"
                            placeholder="Địa chỉ cửa hàng"
                        />
                        <input
                            type="number"
                            step="0.0001"
                            value={storeRequestForm.lat}
                            onChange={(e) => setStoreRequestForm({ ...storeRequestForm, lat: Number(e.target.value) })}
                            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                            placeholder="Lat"
                        />
                        <input
                            type="number"
                            step="0.0001"
                            value={storeRequestForm.lng}
                            onChange={(e) => setStoreRequestForm({ ...storeRequestForm, lng: Number(e.target.value) })}
                            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                            placeholder="Lng"
                        />
                        <textarea
                            value={storeRequestForm.notes}
                            onChange={(e) => setStoreRequestForm({ ...storeRequestForm, notes: e.target.value })}
                            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm md:col-span-2"
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
                <div className="max-w-7xl mx-auto mb-6 rounded-2xl border border-yellow-200 bg-yellow-50 p-5 shadow-sm">
                    <h3 className="text-lg font-bold text-gray-900">Yêu cầu chờ xác nhận</h3>
                    <div className="mt-4 space-y-3">
                        {pendingRequests.map((request) => (
                            <div key={request.id} className="rounded-xl border border-yellow-200 bg-white p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="font-semibold text-gray-800">{request.storeName}</p>
                                        <p className="text-xs text-gray-500">{request.address}</p>
                                    </div>
                                    <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700">
                                        {request.status}
                                    </span>
                                </div>
                                <p className="mt-2 text-xs text-gray-600">Người gửi: {request.submittedByName}</p>
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

            {/* Thanh bộ lọc ngang gọn (thay sidebar dài) + dải thống kê luôn nhìn thấy */}
            <div className="max-w-7xl mx-auto mb-6 rounded-2xl bg-white px-4 py-3.5 shadow-md">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_130px_160px_180px_160px]">
                    <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Tìm kiếm</label>
                        <input
                            value={searchTerm}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Tên cửa hàng hoặc địa chỉ"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Bán kính</label>
                        <select
                            value={radius}
                            onChange={(e) => setRadius(Number(e.target.value))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        >
                            <option value={300}>300 m</option>
                            <option value={500}>500 m</option>
                            <option value={1000}>1 km</option>
                            <option value={2000}>2 km</option>
                            <option value={5000}>5 km</option>
                        </select>
                    </div>

                    <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Thương hiệu</label>
                        <select
                            value={selectedBrand}
                            onChange={(e) => setSelectedBrand(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        >
                            {brandOptions.map((brand) => (
                                <option key={brand.id} value={brand.id}>
                                    {brand.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Sắp xếp</label>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as 'nearest' | 'rating')}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        >
                            <option value="nearest">Gần nhất trước</option>
                            <option value="rating">Đánh giá cao nhất</option>
                        </select>
                    </div>

                    <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Đánh giá tối thiểu</label>
                        <select
                            value={minRating}
                            onChange={(e) => setMinRating(Number(e.target.value))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        >
                            <option value={0}>Mọi mức</option>
                            <option value={3}>Từ 3.0 sao</option>
                            <option value={4}>Từ 4.0 sao</option>
                            <option value={4.5}>Từ 4.5 sao</option>
                        </select>
                    </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                    {amenityOptions.map((amenity) => {
                        const active = selectedAmenities.includes(amenity.id);
                        return (
                            <button
                                key={amenity.id}
                                type="button"
                                onClick={() => toggleAmenity(amenity.id)}
                                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${active
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                    >
                        Chỉ đang mở
                    </button>
                </div>

                {!isLoadingStores && (
                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-gray-100 pt-3 text-sm text-gray-600">
                        <span>
                            <span className="font-bold text-gray-900">{stores.length}</span> cửa hàng trong {formatRadius(radius)}
                        </span>
                        <span>
                            <span className="font-bold text-emerald-600">{openStoreCount}</span> đang mở
                        </span>
                        {nearestStore && (
                            <span className="min-w-0 truncate">
                                Gần nhất: <span className="font-semibold text-gray-900">{nearestStore.name}</span>
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
                                    className="font-semibold text-blue-600 hover:text-blue-800"
                                >
                                    Dùng vị trí của tôi
                                </button>
                            )}
                        </span>
                    </div>
                )}
            </div>

            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6">

                <div className="relative bg-white rounded-2xl shadow-md p-2 h-[600px]">
                        {/* Cụm nút đặt ở góc phải để không che nút zoom +/- (góc trái) của bản đồ.
                            z-10: đủ nổi trên các lớp của Leaflet, nhưng thấp hơn modal (z-40)
                            để không đè lên modal chi tiết khi mở. */}
                        <div className="absolute right-4 top-4 z-10 flex gap-2">
                            <button
                                type="button"
                                onClick={() => setPickingLocation((prev) => !prev)}
                                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold shadow-md transition ${pickingLocation
                                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                                        : 'bg-white text-gray-700 hover:bg-gray-50'
                                    }`}
                            >
                                <Crosshair className="h-4 w-4" />
                                {pickingLocation ? 'Đang chọn vị trí...' : 'Chọn vị trí trên bản đồ'}
                            </button>
                            {pickedLocation && (
                                <button
                                    type="button"
                                    onClick={requestLocation}
                                    className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-blue-600 shadow-md hover:bg-blue-50"
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

                    <div className="bg-white rounded-2xl shadow-md h-[600px] flex flex-col overflow-hidden">
                        <div className="shrink-0 p-4 pb-3">
                            <h2 className="font-bold text-base text-gray-800">
                                Danh sách cửa hàng ({displayedStores.length})
                            </h2>
                            {currentUser && (
                                <div className="mt-2.5 flex rounded-lg bg-gray-100 p-0.5 text-xs font-medium">
                                    <button
                                        type="button"
                                        onClick={() => setFavoritesOnly(false)}
                                        className={`flex-1 whitespace-nowrap rounded-md px-2.5 py-1.5 transition ${!favoritesOnly
                                                ? 'bg-white text-gray-900 shadow-sm'
                                                : 'text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        Tất cả
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFavoritesOnly(true)}
                                        className={`flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1.5 transition ${favoritesOnly
                                                ? 'bg-white text-gray-900 shadow-sm'
                                                : 'text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        <Heart className={`h-3.5 w-3.5 shrink-0 ${favoritesOnly ? 'fill-red-500 text-red-500' : ''}`} />
                                        Yêu thích
                                    </button>
                                </div>
                            )}

                        {storesError && stores.length > 0 && (
                            <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                <span>Đang hiển thị kết quả cũ do tải mới thất bại.</span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStoresError(false);
                                        setStoresRetryKey((key) => key + 1);
                                    }}
                                    className="shrink-0 font-semibold text-amber-900 underline hover:text-amber-700"
                                >
                                    Tải lại
                                </button>
                            </div>
                        )}

                        </div>
                        <div className="flex-1 overflow-y-auto px-4 pb-4">
                        {isLoadingStores ? (
                            <div className="space-y-3" aria-label="Đang tải danh sách cửa hàng">
                                {[0, 1, 2].map((skeletonIndex) => (
                                    <div
                                        key={skeletonIndex}
                                        className="animate-pulse rounded-xl border border-gray-200 p-4"
                                    >
                                        <div className="h-4 w-2/3 rounded bg-gray-200" />
                                        <div className="mt-2 h-3 w-1/2 rounded bg-gray-200" />
                                        <div className="mt-3 h-3 w-1/3 rounded bg-gray-200" />
                                    </div>
                                ))}
                            </div>
                        ) : displayedStores.length === 0 ? (
                            <div className="flex h-[380px] flex-col items-center justify-center text-center">
                                {favoritesOnly ? (
                                    <>
                                        <Heart className="h-10 w-10 text-gray-300" />
                                        <p className="mt-3 font-semibold text-gray-700">Chưa có cửa hàng yêu thích</p>
                                        <p className="mt-1 max-w-[240px] text-sm text-gray-500">
                                            Nhấn biểu tượng trái tim trên cửa hàng để lưu lại những nơi bạn hay ghé.
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <SearchX className="h-10 w-10 text-gray-300" />
                                        <p className="mt-3 font-semibold text-gray-700">Không tìm thấy cửa hàng nào</p>
                                        <p className="mt-1 max-w-[240px] text-sm text-gray-500">
                                            Thử nới rộng bán kính tìm kiếm hoặc bỏ bớt điều kiện lọc.
                                        </p>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-3">
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
                                        className={`p-4 rounded-xl border transition-all cursor-pointer ${isSelected
                                                ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start gap-3">
                                            <div>
                                                <h3 className="font-semibold text-gray-900">{store.name}</h3>
                                                <p className="text-xs text-gray-500 mt-1">{store.address}</p>
                                                {distanceLabel && (
                                                    <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-blue-600">
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
                                                    className="rounded-lg p-1.5 transition hover:bg-red-50"
                                                >
                                                    <Heart
                                                        className={`h-4.5 w-4.5 ${isFavorite
                                                                ? 'fill-red-500 text-red-500'
                                                                : 'text-gray-300 hover:text-red-400'
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
                                                    className="flex items-center gap-1 text-xs font-medium text-amber-500 whitespace-nowrap hover:text-amber-600"
                                                >
                                                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                                    {(store.rating ?? 0) > 0 ? store.rating : '—'}
                                                    {(store.ratingCount ?? 0) > 0 && (
                                                        <span className="text-gray-400">({store.ratingCount})</span>
                                                    )}
                                                </button>
                                                {ratingPickerStoreId === store.id && (
                                                    <div
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
                                                    >
                                                        <p className="mb-2 text-xs font-medium text-gray-700">
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
                                                                        onClick={() => submitRating(store, starValue)}
                                                                        className="disabled:opacity-50"
                                                                        aria-label={`${starValue} sao`}
                                                                    >
                                                                        <Star
                                                                            className={`h-6 w-6 ${starValue <= activeValue
                                                                                    ? 'fill-amber-400 text-amber-400'
                                                                                    : 'text-gray-300'
                                                                                }`}
                                                                        />
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                        {pickerMyRating !== null && (
                                                            <p className="mt-2 text-[11px] text-gray-500">
                                                                Bạn đã chấm {pickerMyRating} sao. Chấm lại để cập nhật.
                                                            </p>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => setRatingPickerStoreId(null)}
                                                            className="mt-2 text-[11px] font-medium text-gray-500 hover:text-gray-700"
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
                                                        className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
                                                    >
                                                        {amenityNameById[amenityId] || amenityId}
                                                    </span>
                                                ))}
                                                {hiddenAmenityCount > 0 && (
                                                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
                                                        +{hiddenAmenityCount}
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
                                            <span className="flex items-center gap-1.5">
                                                <span
                                                    className={`h-2 w-2 rounded-full ${store.isOpen ? 'bg-emerald-500' : 'bg-gray-300'}`}
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
                                                    className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1 bg-gray-100 px-2.5 py-1.5 rounded-lg hover:bg-gray-200 transition"
                                                >
                                                    Chi tiết
                                                </button>
                                                <button
                                                    onClick={(e) => handleDirections(e, store)}
                                                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition"
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
                        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                                    {getBrandName(detailsStore.brandId)}
                                </span>
                                <h2 className="mt-2 text-xl font-bold text-gray-900">{detailsStore.name}</h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setDetailsStore(null)}
                                aria-label="Đóng"
                                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
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
                                <span className="text-gray-500">({detailsStore.ratingCount} lượt đánh giá)</span>
                            )}
                            <span
                                className={`ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${detailsStore.isOpen
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-gray-100 text-gray-600'
                                    }`}
                            >
                                <span className={`h-2 w-2 rounded-full ${detailsStore.isOpen ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                                {detailsStore.isOpen ? 'Đang mở cửa' : 'Đã đóng cửa'}
                            </span>
                        </div>

                        <div className="mt-4 space-y-2.5 text-sm text-gray-700">
                            <p className="flex items-start gap-2">
                                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                                {detailsStore.address}
                            </p>
                            {formatDistance(detailsStore.distanceMeters) && (
                                <p className="flex items-center gap-2 font-medium text-blue-600">
                                    <Navigation className="h-4 w-4 shrink-0 text-gray-400" />
                                    {formatDistance(detailsStore.distanceMeters)}
                                </p>
                            )}
                            <p className="flex items-center gap-2">
                                <Clock className="h-4 w-4 shrink-0 text-gray-400" />
                                {detailsStore.is24h
                                    ? 'Mở cửa 24/7'
                                    : detailsStore.openHours
                                        ? `Giờ mở cửa: ${detailsStore.openHours} (giờ Việt Nam)`
                                        : 'Giờ mở cửa: đang cập nhật'}
                            </p>
                            <p className="text-xs text-gray-400">
                                Tọa độ: {detailsStore.lat.toFixed(5)}, {detailsStore.lng.toFixed(5)}
                            </p>
                        </div>

                        {(detailsStore.amenities?.length ?? 0) > 0 && (
                            <div className="mt-4">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Tiện ích</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {detailsStore.amenities!.map((amenityId) => (
                                        <span
                                            key={amenityId}
                                            className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
                                        >
                                            {amenityNameById[amenityId] || amenityId}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

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
                                        ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                            >
                                <Heart
                                    className={`h-4 w-4 ${favoriteIds.includes(detailsStore.id) ? 'fill-red-500 text-red-500' : ''}`}
                                />
                                {favoriteIds.includes(detailsStore.id) ? 'Đã yêu thích' : 'Yêu thích'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isAuthModalOpen && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
                    <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
                        <div className="mb-5 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-gray-900">
                                {authMode === 'login' ? 'Đăng nhập tài khoản' : 'Đăng ký tài khoản'}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setIsAuthModalOpen(false)}
                                aria-label="Đóng"
                                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {authMode === 'login' ? (
                            <div className="space-y-4">
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Tài khoản:</label>
                                    <input
                                        value={loginForm.email}
                                        onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                                        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Mật khẩu:</label>
                                    <input
                                        type="password"
                                        value={loginForm.password}
                                        onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                                        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={handleLogin}
                                    className="w-full rounded-xl bg-blue-600 py-3 text-lg font-semibold text-white shadow-sm hover:bg-blue-700"
                                >
                                    Đăng nhập
                                </button>

                                <div className="text-center text-base text-gray-900">
                                    <span>Bạn chưa có tài khoản? </span>
                                    <button
                                        type="button"
                                        onClick={() => setAuthMode('register')}
                                        className="font-semibold text-blue-600 underline hover:text-blue-800"
                                    >
                                        Đăng ký tài khoản mới
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Họ và tên:</label>
                                    <input
                                        value={registerForm.fullName}
                                        onChange={(e) => setRegisterForm({ ...registerForm, fullName: e.target.value })}
                                        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Tài khoản:</label>
                                    <input
                                        value={registerForm.email}
                                        onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                                        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Mật khẩu:</label>
                                    <input
                                        type="password"
                                        value={registerForm.password}
                                        onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                                        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Xác nhận mật khẩu:</label>
                                    <input
                                        type="password"
                                        value={registerForm.confirmPassword}
                                        onChange={(e) => setRegisterForm({ ...registerForm, confirmPassword: e.target.value })}
                                        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
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
                                        className="text-base font-semibold text-blue-600 underline hover:text-blue-800"
                                    >
                                        Quay lại đăng nhập
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            <footer className="mx-auto mt-10 max-w-7xl border-t border-gray-200 px-2 py-6 text-center">
                <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-gray-700">
                    <MapPin className="h-4 w-4 text-blue-600" />
                    ConvenienceFinder
                </p>
                <p className="mt-1.5 text-xs text-gray-500">
                    Dữ liệu bản đồ © OpenStreetMap contributors • Vị trí của bạn chỉ dùng để tìm kiếm
                </p>
            </footer>
            <ToastHost />
        </main>
    );
}