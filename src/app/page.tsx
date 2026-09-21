'use client';

import { useState, useEffect } from 'react';
import MapView from '@/components/MapView';
import { AppUser, demoUsers, getRoleLabel, hasPermission, permissionByRole } from '@/lib/auth-system';
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

const STORAGE_USERS_KEY = 'finder_users';
const STORAGE_SESSION_KEY = 'finder_current_user';

type AuthMode = 'login' | 'register';
type MainView = 'main' | 'profile' | 'store-request';

function getRegisteredUsers(): AppUser[] {
    if (typeof window === 'undefined') {
        return demoUsers;
    }

    const saved = window.localStorage.getItem(STORAGE_USERS_KEY);
    if (!saved) {
        window.localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(demoUsers));
        return demoUsers;
    }

    try {
        return JSON.parse(saved) as AppUser[];
    } catch {
        window.localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(demoUsers));
        return demoUsers;
    }
}

function persistUserSession(user: AppUser | null) {
    if (typeof window === 'undefined') {
        return;
    }

    if (!user) {
        window.localStorage.removeItem(STORAGE_SESSION_KEY);
        return;
    }

    window.localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(user));
}

export default function Home() {
    const [userLocation, setUserLocation] = useState<UserLocation>({
        lat: 21.03477,
        lng: 105.80266,
    });
    const [stores, setStores] = useState<Store[]>([]);
    const [radius, setRadius] = useState<number>(1000);
    const [selectedStore, setSelectedStore] = useState<Store | null>(null);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [selectedBrand, setSelectedBrand] = useState<string>('all');
    const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
    const [openOnly, setOpenOnly] = useState<boolean>(false);
    const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [authMode, setAuthMode] = useState<AuthMode>('login');
    const [accountMenuOpen, setAccountMenuOpen] = useState(false);
    const [mainView, setMainView] = useState<MainView>('main');
    const [loginForm, setLoginForm] = useState({ email: 'user@finder.local', password: '123456' });
    const [registerForm, setRegisterForm] = useState({ fullName: '', email: '', password: '', confirmPassword: '' });
    const [storeRequestForm, setStoreRequestForm] = useState({
        storeName: '',
        brandName: 'Circle K',
        address: '',
        lat: 21.0285,
        lng: 105.8542,
        notes: '',
    });
    const [pendingRequests, setPendingRequests] = useState<any[]>([]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const savedUser = window.localStorage.getItem(STORAGE_SESSION_KEY);
        if (savedUser) {
            try {
                const parsed = JSON.parse(savedUser) as AppUser;
                setCurrentUser(parsed);
            } catch {
                window.localStorage.removeItem(STORAGE_SESSION_KEY);
            }
        }
    }, []);

    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setUserLocation({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                    });
                },
                () => console.log('Không lấy được vị trí, dùng vị trí mặc định.')
            );
        }
    }, []);

    useEffect(() => {
        if (!currentUser || currentUser.role !== 'admin') {
            return;
        }

        async function fetchPendingRequests() {
            try {
                const res = await fetch('/api/store-requests?role=admin');
                const data = await res.json();
                setPendingRequests(data.requests || []);
            } catch (error) {
                console.error('Lỗi tải yêu cầu cửa hàng:', error);
            }
        }

        fetchPendingRequests();
    }, [currentUser]);

    useEffect(() => {
        async function fetchStores() {
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

                if (searchTerm.trim()) {
                    params.set('search', searchTerm.trim());
                }

                const res = await fetch(`/api/stores?${params.toString()}`);
                const data = await res.json();
                setStores(data.stores || []);
            } catch (err) {
                console.error('Lỗi lấy danh sách cửa hàng:', err);
            }
        }

        fetchStores();
    }, [userLocation, radius, selectedBrand, selectedAmenities, openOnly, searchTerm]);

    const toggleAmenity = (amenityId: string) => {
        setSelectedAmenities((current) =>
            current.includes(amenityId)
                ? current.filter((id) => id !== amenityId)
                : [...current, amenityId]
        );
    };

    const handleLogin = async () => {
        const users = getRegisteredUsers();
        const matchedUser = users.find(
            (user) => user.email.toLowerCase() === loginForm.email.trim().toLowerCase() && user.password === loginForm.password
        );

        if (!matchedUser) {
            alert('Email hoặc mật khẩu không đúng.');
            return;
        }

        setCurrentUser(matchedUser);
        persistUserSession(matchedUser);
        setIsAuthModalOpen(false);
        setAccountMenuOpen(false);
        setAuthMode('login');
    };

    const handleRegister = () => {
        const trimmedName = registerForm.fullName.trim();
        const email = registerForm.email.trim();
        const password = registerForm.password;

        if (!trimmedName || !email || !password) {
            alert('Vui lòng nhập đầy đủ thông tin tài khoản.');
            return;
        }

        if (password.length < 6) {
            alert('Mật khẩu phải có ít nhất 6 ký tự.');
            return;
        }

        if (password !== registerForm.confirmPassword) {
            alert('Xác nhận mật khẩu không khớp.');
            return;
        }

        const users = getRegisteredUsers();
        const alreadyExists = users.some((user) => user.email.toLowerCase() === email.toLowerCase());

        if (alreadyExists) {
            alert('Tài khoản này đã tồn tại trong hệ thống.');
            return;
        }

        const newUser: AppUser = {
            id: `user-${Date.now()}`,
            fullName: trimmedName,
            email,
            password,
            role: 'user',
            permissions: permissionByRole.user,
            isActive: true,
        };

        const nextUsers = [...users, newUser];
        window.localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(nextUsers));
        setAuthMode('login');
        setLoginForm({ email, password });
        setRegisterForm({ fullName: '', email: '', password: '', confirmPassword: '' });
        alert('Đăng ký thành công. Vui lòng đăng nhập.');
    };

    const handleLogout = () => {
        setCurrentUser(null);
        persistUserSession(null);
        setAccountMenuOpen(false);
        setMainView('main');
    };

    const handleSubmitStoreRequest = async () => {
        if (!currentUser || !hasPermission(currentUser, 'submit_store_request')) {
            alert('Bạn cần đăng nhập để gửi yêu cầu thêm cửa hàng.');
            return;
        }

        if (!storeRequestForm.storeName.trim() || !storeRequestForm.address.trim()) {
            alert('Vui lòng nhập tên cửa hàng và địa chỉ.');
            return;
        }

        try {
            const res = await fetch('/api/store-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user: currentUser,
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
                alert(data.message || 'Không thể gửi yêu cầu.');
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
            alert(data.message || 'Yêu cầu đã được gửi cho Admin.');
        } catch (error) {
            console.error('Lỗi gửi yêu cầu:', error);
            alert('Không thể gửi yêu cầu thêm cửa hàng.');
        }
    };

    const handleApproveRequest = async (requestId: string, status: 'APPROVED' | 'REJECTED') => {
        if (!currentUser || !hasPermission(currentUser, 'approve_store_request')) {
            alert('Chỉ Admin mới được xác nhận yêu cầu.');
            return;
        }

        try {
            const res = await fetch('/api/store-requests', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    actor: currentUser,
                    requestId,
                    status,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                alert(data.message || 'Không thể cập nhật trạng thái.');
                return;
            }

            setPendingRequests((requests) => requests.filter((item) => item.id !== requestId));
            alert(`Yêu cầu đã được ${status === 'APPROVED' ? 'duyệt' : 'từ chối'}.`);
        } catch (error) {
            console.error('Lỗi cập nhật yêu cầu:', error);
            alert('Không thể cập nhật yêu cầu.');
        }
    };

    const handleDirections = (e: React.MouseEvent, store: Store) => {
        e.stopPropagation();
        setSelectedStore(store);

        const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${store.lat},${store.lng}`;
        window.open(googleMapsUrl, '_blank');
    };

    return (
        <main className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto mb-6 flex justify-between items-center gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-blue-600 flex items-center gap-2">
                        📍 ConvenienceFinder
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
                                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-lg text-blue-700">👤</span>
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
                            className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
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
                <aside className="bg-white rounded-2xl shadow-md p-4 space-y-5 h-fit">
                    <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-2">Tìm kiếm</label>
                        <input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
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
                </aside>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-2xl shadow-md p-2 h-[550px]">
                        <MapView center={userLocation} stores={stores} selectedStore={selectedStore} />
                    </div>

                    <div className="bg-white rounded-2xl shadow-md p-4 h-[550px] overflow-y-auto">
                        <h2 className="font-bold text-lg mb-4 text-gray-800">
                            Danh sách cửa hàng ({stores.length})
                        </h2>

                        <div className="space-y-3">
                            {stores.map((store) => {
                                const isSelected = selectedStore?.id === store.id;
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
                                            </div>
                                            <span className="text-xs font-medium text-amber-500 whitespace-nowrap">
                                                ⭐ {store.rating}
                                            </span>
                                        </div>

                                        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-gray-600">
                                            <span>
                                                {store.isOpen ? 'Đang mở' : 'Đã đóng'}
                                                {store.is24h ? ' • 24/7' : store.openHours ? ` • ${store.openHours}` : ''}
                                            </span>
                                            <button
                                                onClick={(e) => handleDirections(e, store)}
                                                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition"
                                            >
                                                🚀 Chỉ đường
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {isAuthModalOpen && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
                    <div className="w-full max-w-md rounded-[28px] border-4 border-violet-500 bg-[#b7b2b2] p-6 shadow-2xl">
                        <div className="mb-5 flex items-center justify-between">
                            <h2 className="text-3xl font-bold text-gray-900">
                                {authMode === 'login' ? 'Đăng nhập tài khoản' : 'Đăng ký tài khoản'}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setIsAuthModalOpen(false)}
                                className="text-2xl font-bold text-gray-800 hover:text-gray-600"
                            >
                                ×
                            </button>
                        </div>

                        {authMode === 'login' ? (
                            <div className="space-y-4">
                                <div>
                                    <label className="mb-2 block text-lg font-medium text-gray-900">Tài khoản:</label>
                                    <input
                                        value={loginForm.email}
                                        onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                                        className="w-full rounded-[18px] border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:border-violet-500"
                                    />
                                </div>

                                <div>
                                    <label className="mb-2 block text-lg font-medium text-gray-900">Mật khẩu:</label>
                                    <input
                                        type="password"
                                        value={loginForm.password}
                                        onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                                        className="w-full rounded-[18px] border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:border-violet-500"
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={handleLogin}
                                    className="w-full rounded-xl bg-violet-600 py-3 text-lg font-semibold text-white shadow-sm hover:bg-violet-700"
                                >
                                    Đăng nhập
                                </button>

                                <div className="text-center text-base text-gray-900">
                                    <span>Bạn chưa có tài khoản? </span>
                                    <button
                                        type="button"
                                        onClick={() => setAuthMode('register')}
                                        className="font-semibold text-violet-700 underline hover:text-violet-800"
                                    >
                                        Đăng ký tài khoản mới
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="mb-2 block text-lg font-medium text-gray-900">Họ và tên:</label>
                                    <input
                                        value={registerForm.fullName}
                                        onChange={(e) => setRegisterForm({ ...registerForm, fullName: e.target.value })}
                                        className="w-full rounded-[18px] border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:border-violet-500"
                                    />
                                </div>

                                <div>
                                    <label className="mb-2 block text-lg font-medium text-gray-900">Tài khoản:</label>
                                    <input
                                        value={registerForm.email}
                                        onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                                        className="w-full rounded-[18px] border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:border-violet-500"
                                    />
                                </div>

                                <div>
                                    <label className="mb-2 block text-lg font-medium text-gray-900">Mật khẩu:</label>
                                    <input
                                        type="password"
                                        value={registerForm.password}
                                        onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                                        className="w-full rounded-[18px] border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:border-violet-500"
                                    />
                                </div>

                                <div>
                                    <label className="mb-2 block text-lg font-medium text-gray-900">Xác nhận mật khẩu:</label>
                                    <input
                                        type="password"
                                        value={registerForm.confirmPassword}
                                        onChange={(e) => setRegisterForm({ ...registerForm, confirmPassword: e.target.value })}
                                        className="w-full rounded-[18px] border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:border-violet-500"
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={handleRegister}
                                    className="w-full rounded-xl bg-violet-600 py-3 text-lg font-semibold text-white shadow-sm hover:bg-violet-700"
                                >
                                    Đăng ký
                                </button>

                                <div className="text-center">
                                    <button
                                        type="button"
                                        onClick={() => setAuthMode('login')}
                                        className="text-base font-semibold text-violet-700 underline hover:text-violet-800"
                                    >
                                        Quay lại đăng nhập
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </main>
    );
}