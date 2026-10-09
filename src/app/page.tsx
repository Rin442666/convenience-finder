'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Star, Navigation, User, X, SearchX, ChartColumn } from 'lucide-react';
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
    const [currentUser, setCurrentUser] = useState<Omit<AppUser, 'password'> | null>(null);
    const [authToken, setAuthToken] = useState<string | null>(null);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
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
    }, [userLocation, radius, selectedBrand, selectedAmenities, openOnly, debouncedSearchTerm, storesRetryKey]);

    const toggleAmenity = (amenityId: string) => {
        setSelectedAmenities((current) =>
            current.includes(amenityId)
                ? current.filter((id) => id !== amenityId)
                : [...current, amenityId]
        );
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

    const handleDirections = (e: React.MouseEvent, store: Store) => {
        e.stopPropagation();
        setSelectedStore(store);

        const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${store.lat},${store.lng}`;
        window.open(googleMapsUrl, '_blank');
    };

    // Số liệu cho thẻ "Tổng quan" dưới bộ lọc — tính trực tiếp từ kết quả
    // đang hiển thị nên tự cập nhật khi đổi filter/tìm kiếm.
    // Danh sách đã được sắp xếp theo khoảng cách tăng dần từ API.
    const openStoreCount = stores.filter((store) => store.isOpen || store.is24h).length;
    const nearestStore = stores.length > 0 ? stores[0] : undefined;

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

            <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-6">
                <aside className="h-fit space-y-4">
                    <div className="bg-white rounded-2xl shadow-md p-4 space-y-5">
                    <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-2">Tìm kiếm</label>
                        <input
                            value={searchTerm}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Tên cửa hàng hoặc địa chỉ"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-2">Bán kính</label>
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
                        <label className="block text-sm font-semibold text-gray-800 mb-2">Thương hiệu</label>
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
                        <label className="block text-sm font-semibold text-gray-800 mb-2">Tiện ích</label>
                        <div className="space-y-2">
                            {amenityOptions.map((amenity) => {
                                const checked = selectedAmenities.includes(amenity.id);
                                return (
                                    <label key={amenity.id} className="flex items-center gap-2 text-sm text-gray-700">
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleAmenity(amenity.id)}
                                            className="rounded border-gray-300 text-blue-600 shadow-sm focus:ring-blue-500"
                                        />
                                        {amenity.name}
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={openOnly}
                            onChange={(e) => setOpenOnly(e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 shadow-sm focus:ring-blue-500"
                        />
                        Chỉ hiển thị đang mở
                    </label>
                    </div>

                    {!isLoadingStores && (
                        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-md">
                            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                                <ChartColumn className="h-4 w-4 text-blue-600" />
                                Tổng quan
                            </h3>
                            <dl className="mt-2.5 space-y-1.5 text-sm text-gray-600">
                                <div className="flex items-center justify-between gap-2">
                                    <dt>Trong bán kính {formatRadius(radius)}</dt>
                                    <dd className="font-semibold text-gray-900">{stores.length} cửa hàng</dd>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <dt>Đang mở cửa</dt>
                                    <dd className="font-semibold text-emerald-600">{openStoreCount}</dd>
                                </div>
                                {nearestStore && (
                                    <div className="flex items-center justify-between gap-2">
                                        <dt className="shrink-0">Gần nhất</dt>
                                        <dd className="truncate font-medium text-gray-900" title={nearestStore.name}>
                                            {nearestStore.name} • {formatDistanceValue(nearestStore.distanceMeters)}
                                        </dd>
                                    </div>
                                )}
                                <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-2">
                                    <dt className="flex shrink-0 items-center gap-1.5">
                                        <span
                                            className={`h-2 w-2 rounded-full ${locationStatus === 'gps'
                                                    ? 'bg-emerald-500'
                                                    : locationStatus === 'denied'
                                                        ? 'bg-amber-500'
                                                        : 'animate-pulse bg-blue-500'
                                                }`}
                                        />
                                        {locationStatus === 'gps'
                                            ? 'Vị trí GPS của bạn'
                                            : locationStatus === 'denied'
                                                ? 'Không lấy được vị trí'
                                                : 'Đang xác định vị trí...'}
                                    </dt>
                                    {locationStatus === 'denied' && (
                                        <dd>
                                            <button
                                                type="button"
                                                onClick={requestLocation}
                                                className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                                            >
                                                Dùng vị trí của tôi
                                            </button>
                                        </dd>
                                    )}
                                </div>
                            </dl>
                        </div>
                    )}
                </aside>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-2xl shadow-md p-2 h-[550px]">
                        <MapView center={userLocation} stores={stores} selectedStore={selectedStore} />
                    </div>

                    <div className="bg-white rounded-2xl shadow-md p-4 h-[550px] overflow-y-auto">
                        <h2 className="font-bold text-lg mb-4 text-gray-800">
                            Danh sách cửa hàng ({stores.length})
                        </h2>

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
                        ) : stores.length === 0 ? (
                            <div className="flex h-[380px] flex-col items-center justify-center text-center">
                                <SearchX className="h-10 w-10 text-gray-300" />
                                <p className="mt-3 font-semibold text-gray-700">Không tìm thấy cửa hàng nào</p>
                                <p className="mt-1 max-w-[240px] text-sm text-gray-500">
                                    Thử nới rộng bán kính tìm kiếm hoặc bỏ bớt điều kiện lọc.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {stores.map((store) => {
                                const isSelected = selectedStore?.id === store.id;
                                const distanceLabel = formatDistance(store.distanceMeters);
                                const storeAmenities = store.amenities || [];
                                const visibleAmenities = storeAmenities.slice(0, 3);
                                const hiddenAmenityCount = storeAmenities.length - visibleAmenities.length;
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
                                            <span className="flex items-center gap-1 text-xs font-medium text-amber-500 whitespace-nowrap">
                                                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                                {(store.rating ?? 0) > 0 ? store.rating : '—'}
                                            </span>
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

                                        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-gray-600">
                                            <span className="flex items-center gap-1.5">
                                                <span
                                                    className={`h-2 w-2 rounded-full ${store.isOpen ? 'bg-emerald-500' : 'bg-gray-300'}`}
                                                />
                                                {store.isOpen ? 'Đang mở' : 'Đã đóng'}
                                                {store.is24h ? ' • 24/7' : store.openHours ? ` • ${store.openHours}` : ''}
                                            </span>
                                            <button
                                                onClick={(e) => handleDirections(e, store)}
                                                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition"
                                            >
                                                <Navigation className="h-3.5 w-3.5" />
                                                Chỉ đường
                                            </button>
                                        </div>
                                    </div>
                                );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

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