'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import MapView from '@/components/MapView';
import { toast } from '@/components/Toast';
import { useApp } from '@/components/app-provider';
import { useEscapeKey } from '@/hooks/use-escape';
import { usePickLocation } from '@/hooks/use-pick-location';
import { StoreRequestRecord, getRoleLabel, hasPermission } from '@/lib/auth-system';
import { Store, UserLocation } from '@/types/store';
import StatsTab from '@/components/admin/StatsTab';
import type { AdminStats } from '@/components/admin/StatsTab';

type AdminTab = 'stats' | 'users' | 'reviews' | 'catalog' | 'requests';

type AdminUserItem = {
    id: string;
    fullName: string;
    email: string;
    username: string | null;
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

type CatalogItem = { id: string; name: string };

type AdminStoreItem = {
    id: string;
    brand_slug: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    base_rating: number;
    is_24h: number;
    open_hours: string | null;
    status: string;
};

const DEFAULT_CENTER: UserLocation = { lat: 21.0285, lng: 105.8542 };

const inputClass =
    'rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800';

export default function AdminPage() {
    const { currentUser, authToken, authReady } = useApp();
    const router = useRouter();

    const [adminTab, setAdminTab] = useState<AdminTab>('stats');
    const [adminLoadedTab, setAdminLoadedTab] = useState<AdminTab | null>(null);
    const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
    /* Tab thống kê tải lỗi (thường do DB thoáng qua) → hiện nút Thử lại. */
    const [statsLoadFailed, setStatsLoadFailed] = useState(false);
    const [adminUsers, setAdminUsers] = useState<AdminUserItem[]>([]);
    const [adminReviews, setAdminReviews] = useState<AdminReviewItem[]>([]);
    const [adminBrands, setAdminBrands] = useState<CatalogItem[]>([]);
    const [adminAmenities, setAdminAmenities] = useState<CatalogItem[]>([]);
    const [catalogReady, setCatalogReady] = useState(false);
    const [pendingRequests, setPendingRequests] = useState<StoreRequestRecord[]>([]);
    const [newBrandSlug, setNewBrandSlug] = useState('');
    const [newBrandName, setNewBrandName] = useState('');
    const [newAmenitySlug, setNewAmenitySlug] = useState('');
    const [newAmenityName, setNewAmenityName] = useState('');
    const [editingCatalogSlug, setEditingCatalogSlug] = useState<string | null>(null);
    const [editingCatalogName, setEditingCatalogName] = useState('');
    const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);

    const [adminStores, setAdminStores] = useState<AdminStoreItem[]>([]);
    const [storeStatusFilter, setStoreStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE');
    const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
    const [editingStore, setEditingStore] = useState<AdminStoreItem | null>(null);
    const [editName, setEditName] = useState('');
    const [editAddress, setEditAddress] = useState('');
    const [editBrand, setEditBrand] = useState('other');
    const [editOpenHours, setEditOpenHours] = useState('');
    const [editIs24h, setEditIs24h] = useState(false);
    const [editAmenities, setEditAmenities] = useState<string[]>([]);
    const [editLocation, setEditLocation] = useState<UserLocation | null>(null);
    const [savingStore, setSavingStore] = useState(false);

    const [addingStore, setAddingStore] = useState(false);
    const [addName, setAddName] = useState('');
    /* Địa chỉ ⇄ ghim bản đồ đồng bộ 2 chiều 1 lần duy nhất (xong thì khóa).
       Không tự xin GPS khi mount trang — chỉ xin khi mở modal. */
    const addPick = usePickLocation(DEFAULT_CENTER, false);
    /* Điểm ghim đỏ: vị trí đã chọn, chưa có thì lấy tâm bản đồ. */
    const addLoc: UserLocation = addPick.pin ?? addPick.mapCenter;
    const [addBrand, setAddBrand] = useState('other');
    const [addOpenHours, setAddOpenHours] = useState('');
    const [addIs24h, setAddIs24h] = useState(false);
    const [addAmenities, setAddAmenities] = useState<string[]>([]);
    const [savingAddStore, setSavingAddStore] = useState(false);

    const [editingUser, setEditingUser] = useState<AdminUserItem | null>(null);
    const [editUserName, setEditUserName] = useState('');
    const [editUserEmail, setEditUserEmail] = useState('');
    const [editUserUsername, setEditUserUsername] = useState('');
    const [editUserRole, setEditUserRole] = useState<'user' | 'admin'>('user');
    const [savingUser, setSavingUser] = useState(false);

    useEscapeKey(() => setEditingStore(null), editingStore !== null);
    useEscapeKey(() => setAddingStore(false), addingStore);
    useEscapeKey(() => setEditingUser(null), editingUser !== null);
    useEscapeKey(() => setConfirmDeleteKey(null), editingStore === null && confirmDeleteKey !== null);

    const isAdmin = !!currentUser && currentUser.role === 'admin';

    useEffect(() => {
        if (authReady && !isAdmin) {
            router.replace('/');
        }
    }, [authReady, isAdmin, router]);

    const adminHeaders = (): Record<string, string> => ({
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    });

    const loadAdminUsers = async () => {
        try {
            const res = await fetch('/api/admin/users', { headers: adminHeaders() });
            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không thể tải người dùng.', 'error');
                return;
            }
            setAdminUsers(data.users || []);
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
        } finally {
            setAdminLoadedTab('users');
        }
    };

    const loadAdminReviews = async () => {
        try {
            const res = await fetch('/api/admin/reviews', { headers: adminHeaders() });
            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không thể tải đánh giá.', 'error');
                return;
            }
            setAdminReviews(data.reviews || []);
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
        } finally {
            setAdminLoadedTab('reviews');
        }
    };

    /* Tải brands/amenities — dùng chung cho tab Danh mục và modal sửa cửa hàng.
       Tách khỏi flag tab để modal sửa luôn có data dù chưa mở tab Danh mục. */
    const fetchCatalog = async (): Promise<boolean> => {
        try {
            const [brandRes, amenityRes] = await Promise.all([
                fetch('/api/admin/brands', { headers: adminHeaders() }),
                fetch('/api/admin/amenities', { headers: adminHeaders() }),
            ]);
            const brandData = await brandRes.json();
            const amenityData = await amenityRes.json();
            if (!brandRes.ok || !amenityRes.ok) {
                toast('Không thể tải danh mục.', 'error');
                return false;
            }
            setAdminBrands(brandData.brands || []);
            setAdminAmenities(amenityData.amenities || []);
            return true;
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
            return false;
        }
    };

    const ensureCatalog = async () => {
        if (catalogReady) {
            return;
        }
        if (await fetchCatalog()) {
            setCatalogReady(true);
        }
    };

    const loadAdminCatalog = async () => {
        try {
            await fetchCatalog();
            setCatalogReady(true);
        } finally {
            setAdminLoadedTab('catalog');
        }
    };

    const loadAdminStats = async (retrying = false) => {
        if (!retrying) {
            setStatsLoadFailed(false);
        }
        try {
            const res = await fetch('/api/admin/stats', { headers: adminHeaders() });
            const text = await res.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch {
                throw new Error(`Máy chủ trả về HTTP ${res.status} (không phải JSON)`);
            }
            if (!res.ok) {
                throw new Error(data.detail || data.message || `HTTP ${res.status}`);
            }
            setAdminStats(data);
        } catch (err) {
            if (!retrying) {
                /* Lỗi thoáng qua phía DB (vd: Neon cold start) — thử lại 1 lần. */
                await new Promise((resolve) => setTimeout(resolve, 1500));
                return loadAdminStats(true);
            }
            const detail = err instanceof Error && err.message ? err.message.slice(0, 200) : '';
            toast(detail ? `Thống kê lỗi: ${detail}` : 'Không thể tải số liệu thống kê.', 'error');
            setStatsLoadFailed(true);
        } finally {
            setAdminLoadedTab('stats');
        }
    };

    const loadPendingRequests = async (markLoaded = true) => {
        try {
            const res = await fetch('/api/store-requests', { headers: adminHeaders() });
            const data = await res.json();
            if (res.ok) {
                setPendingRequests(data.requests || []);
            }
        } catch (error) {
            console.error('Lỗi tải yêu cầu cửa hàng:', error);
        } finally {
            if (markLoaded) {
                setAdminLoadedTab('requests');
            }
        }
    };

    useEffect(() => {
        if (!authReady || !isAdmin) {
            return;
        }
        async function fetchCurrentAdminTab() {
            if (adminTab === 'users') {
                await loadAdminUsers();
            } else if (adminTab === 'reviews') {
                await loadAdminReviews();
            } else if (adminTab === 'catalog') {
                await loadAdminCatalog();
            } else if (adminTab === 'stats') {
                await loadAdminStats();
            } else {
                await loadPendingRequests();
            }
            await ensureCatalog();
        }
        fetchCurrentAdminTab();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authReady, isAdmin, adminTab]);

    useEffect(() => {
        if (!authReady || !isAdmin) {
            return;
        }
        async function refreshPendingRequests() {
            await loadPendingRequests(false);
        }
        refreshPendingRequests();
        const timer = setInterval(refreshPendingRequests, 60000);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authReady, isAdmin]);

    const loadAdminStores = async () => {
        try {
            const params = storeStatusFilter === 'ALL' ? '' : `?status=${storeStatusFilter}`;
            const res = await fetch(`/api/admin/stores${params}`, { headers: adminHeaders() });
            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không thể tải cửa hàng.', 'error');
                return;
            }
            setAdminStores(data.stores || []);
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
        }
    };

    useEffect(() => {
        if (authReady && isAdmin) {
            async function fetchStores() {
                await loadAdminStores();
            }
            fetchStores();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authReady, isAdmin, storeStatusFilter]);

    if (!authReady || !isAdmin) {
        return null;
    }

    const handleToggleUserActive = async (user: AdminUserItem) => {
        try {
            const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                body: JSON.stringify({ isActive: !user.isActive }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không thể cập nhật.', 'error');
                return;
            }
            toast(user.isActive ? 'Đã khóa tài khoản.' : 'Đã mở khóa tài khoản.', 'success');
            await loadAdminUsers();
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
        }
    };

    const openEditUser = (user: AdminUserItem) => {
        setEditingUser(user);
        setEditUserName(user.fullName);
        setEditUserEmail(user.email);
        setEditUserUsername(user.username || '');
        setEditUserRole(user.role === 'admin' ? 'admin' : 'user');
        setConfirmDeleteKey(null);
    };

    const handleSaveUser = async () => {
        if (!editingUser) return;
        if (!editUserName.trim()) {
            toast('Vui lòng nhập họ tên.', 'error');
            return;
        }
        if (!editUserEmail.trim()) {
            toast('Vui lòng nhập email.', 'error');
            return;
        }
        setSavingUser(true);
        try {
            const res = await fetch(`/api/admin/users/${encodeURIComponent(editingUser.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                body: JSON.stringify({
                    fullName: editUserName.trim(),
                    email: editUserEmail.trim(),
                    username: editUserUsername.trim() || null,
                    role: editUserRole,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không thể cập nhật tài khoản.', 'error');
                return;
            }
            toast('Đã cập nhật tài khoản.', 'success');
            setEditingUser(null);
            await loadAdminUsers();
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
        } finally {
            setSavingUser(false);
        }
    };

    const handleDeleteUser = async (user: AdminUserItem) => {
        const key = `user:${user.id}`;
        if (confirmDeleteKey !== key) {
            setConfirmDeleteKey(key);
            return;
        }
        setConfirmDeleteKey(null);
        try {
            const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
                method: 'DELETE',
                headers: adminHeaders(),
            });
            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không thể xóa tài khoản.', 'error');
                return;
            }
            toast('Đã xóa tài khoản.', 'success');
            await loadAdminUsers();
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
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
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
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
                body: JSON.stringify({ requestId, status }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không thể cập nhật trạng thái.', 'error');
                return;
            }
            setPendingRequests((requests) => requests.filter((item) => item.id !== requestId));
            if (status === 'APPROVED') {
                await loadAdminStores();
            }
            toast(`Yêu cầu đã được ${status === 'APPROVED' ? 'duyệt' : 'từ chối'}.`, 'success');
        } catch (error) {
            console.error('Lỗi cập nhật yêu cầu:', error);
            toast('Không thể cập nhật yêu cầu.', 'error');
        }
    };

    const openEditStore = async (id: string) => {
        try {
            const res = await fetch(`/api/admin/stores/${encodeURIComponent(id)}`, {
                headers: adminHeaders(),
            });
            const data = await res.json();
            if (!res.ok || !data.store) {
                toast(data.message || 'Không tải được cửa hàng.', 'error');
                return;
            }
            const s = data.store;
            setEditingStore(s);
            setEditName(s.name || '');
            setEditAddress(s.address || '');
            setEditBrand(s.brand_slug || 'other');
            setEditOpenHours(s.open_hours || '');
            setEditIs24h(!!s.is_24h);
            setEditAmenities(Array.isArray(s.amenities) ? s.amenities : []);
            setEditLocation({ lat: s.lat, lng: s.lng });
            setConfirmDeleteKey(null);
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
        }
    };

    const handleSaveStore = async () => {
        if (!editingStore) return;
        if (!editName.trim()) {
            toast('Vui lòng nhập tên cửa hàng.', 'error');
            return;
        }
        setSavingStore(true);
        try {
            const res = await fetch(`/api/admin/stores/${encodeURIComponent(editingStore.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                body: JSON.stringify({
                    name: editName.trim(),
                    address: editAddress.trim(),
                    brand_slug: editBrand,
                    open_hours: editOpenHours.trim() || null,
                    is_24h: editIs24h,
                    amenities: editAmenities,
                    ...(editLocation ? { lat: editLocation.lat, lng: editLocation.lng } : {}),
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không thể lưu.', 'error');
                return;
            }
            toast('Đã cập nhật cửa hàng.', 'success');
            setEditingStore(null);
            await loadAdminStores();
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
        } finally {
            setSavingStore(false);
        }
    };

    const handleDeleteStore = async () => {
        if (!editingStore) return;
        const key = `store:${editingStore.id}`;
        if (confirmDeleteKey !== key) {
            setConfirmDeleteKey(key);
            return;
        }
        setConfirmDeleteKey(null);
        try {
            const res = await fetch(`/api/admin/stores/${encodeURIComponent(editingStore.id)}`, {
                method: 'DELETE',
                headers: adminHeaders(),
            });
            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không thể ẩn cửa hàng.', 'error');
                return;
            }
            toast('Đã ẩn cửa hàng.', 'success');
            setEditingStore(null);
            setSelectedStoreId(null);
            await loadAdminStores();
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
        }
    };

    const handleRestoreStore = async () => {
        if (!editingStore) return;
        try {
            const res = await fetch(`/api/admin/stores/${encodeURIComponent(editingStore.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                body: JSON.stringify({ status: 'ACTIVE' }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không thể khôi phục.', 'error');
                return;
            }
            toast('Đã khôi phục cửa hàng.', 'success');
            setEditingStore(null);
            await loadAdminStores();
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
        }
    };

    const toggleEditAmenity = (slug: string) => {
        setEditAmenities((prev) =>
            prev.includes(slug) ? prev.filter((a) => a !== slug) : [...prev, slug]
        );
    };

    const openAddStore = () => {
        setAddName('');
        setAddBrand(adminBrands.some((b) => b.id === 'other') ? 'other' : adminBrands[0]?.id || 'other');
        setAddOpenHours('');
        setAddIs24h(false);
        setAddAmenities([]);
        setConfirmDeleteKey(null);
        setAddingStore(true);
        /* Reset đồng bộ địa chỉ⇄ghim rồi xin GPS để bản đồ mở gần người dùng. */
        addPick.reset();
        addPick.requestGps();
    };

    const toggleAddAmenity = (slug: string) => {
        setAddAmenities((prev) =>
            prev.includes(slug) ? prev.filter((a) => a !== slug) : [...prev, slug]
        );
    };

    const handleAddStore = async () => {
        if (!addName.trim()) {
            toast('Vui lòng nhập tên cửa hàng.', 'error');
            return;
        }
        if (!addPick.address.trim()) {
            toast('Vui lòng nhập địa chỉ.', 'error');
            return;
        }
        setSavingAddStore(true);
        try {
            const res = await fetch('/api/admin/stores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                body: JSON.stringify({
                    name: addName.trim(),
                    address: addPick.address.trim(),
                    brand_slug: addBrand,
                    lat: addLoc.lat,
                    lng: addLoc.lng,
                    open_hours: addOpenHours.trim() || null,
                    is_24h: addIs24h,
                    amenities: addAmenities,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không thể thêm cửa hàng.', 'error');
                return;
            }
            toast('Đã thêm cửa hàng.', 'success');
            setAddingStore(false);
            setStoreStatusFilter('ACTIVE');
            await loadAdminStores();
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
        } finally {
            setSavingAddStore(false);
        }
    };

    const mapStores: Store[] = adminStores.map((s) => ({
        id: s.id,
        brandId: s.brand_slug,
        name: s.name,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        is24h: !!s.is_24h,
        openHours: s.open_hours || undefined,
    }));
    const selectedMapStore = mapStores.find((s) => s.id === selectedStoreId) || null;

    const tabs: { id: AdminTab; label: string }[] = [
        { id: 'stats', label: 'Thống kê' },
        { id: 'users', label: 'Người dùng' },
        { id: 'reviews', label: 'Đánh giá' },
        { id: 'catalog', label: 'Danh mục' },
        { id: 'requests', label: `Yêu cầu${pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}` },
    ];

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Quản trị hệ thống</h3>
                <div className="mt-3 flex gap-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto no-scrollbar">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => {
                                setAdminTab(tab.id);
                                setConfirmDeleteKey(null);
                                setEditingCatalogSlug(null);
                            }}
                            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${
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

                {adminLoadedTab === adminTab && adminTab === 'stats' && (
                    statsLoadFailed && !adminStats ? (
                        <div className="mt-4 text-center">
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Không tải được số liệu thống kê.
                            </p>
                            <button
                                type="button"
                                onClick={() => loadAdminStats()}
                                className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                            >
                                Thử lại
                            </button>
                        </div>
                    ) : (
                        <StatsTab stats={adminStats} />
                    )
                )}

                {adminLoadedTab === adminTab && adminTab === 'users' && (
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    <th className="py-2 pr-3">Họ tên</th>
                                    <th className="py-2 pr-3">Email</th>
                                    <th className="py-2 pr-3">Username</th>
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
                                        <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">{user.username || '—'}</td>
                                        <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">{getRoleLabel(user.role as 'user' | 'admin')}</td>
                                        <td className="py-2 pr-3">
                                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${user.isActive ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'}`}>
                                                {user.isActive ? 'Hoạt động' : 'Đã khóa'}
                                            </span>
                                        </td>
                                        <td className="py-2 pr-3 text-xs text-gray-500 dark:text-gray-400">{user.createdAt}</td>
                                        <td className="py-2">
                                            {user.id !== currentUser.id && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEditUser(user)}
                                                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                                                    >
                                                        Sửa
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleUserActive(user)}
                                                        className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white ${user.isActive ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}`}
                                                    >
                                                        {user.isActive ? 'Khóa' : 'Mở khóa'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteUser(user)}
                                                        className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white ${confirmDeleteKey === `user:${user.id}` ? 'bg-red-700' : 'bg-red-600 hover:bg-red-700'}`}
                                                    >
                                                        {confirmDeleteKey === `user:${user.id}` ? 'Chắc chắn xóa?' : 'Xóa'}
                                                    </button>
                                                </div>
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
                            <div key={section.kind} className="min-w-0">
                                <h4 className="font-semibold text-gray-800 dark:text-gray-200">{section.title}</h4>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <input
                                        value={section.slug}
                                        onChange={(e) => section.setSlug(e.target.value)}
                                        placeholder="slug (vd: circle-k)"
                                        className="w-2/5 min-w-0 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-200"
                                    />
                                    <input
                                        value={section.name}
                                        onChange={(e) => section.setName(e.target.value)}
                                        placeholder="Tên hiển thị"
                                        className="min-w-0 flex-1 basis-24 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-200"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleAddCatalogItem(section.kind)}
                                        className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                                    >
                                        Thêm
                                    </button>
                                </div>
                                <ul className="mt-3 space-y-2">
                                    {section.items.map((item) => {
                                        const deleteKey = `${section.kind}:${item.id}`;
                                        const editingKey = `${section.kind}:${item.id}`;
                                        return (
                                            <li key={item.id} className="overflow-hidden rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2">
                                                {editingCatalogSlug === editingKey ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            value={editingCatalogName}
                                                            onChange={(e) => setEditingCatalogName(e.target.value)}
                                                            className="min-w-0 flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-gray-800 dark:text-gray-200"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRenameCatalogItem(section.kind, item.id)}
                                                            className="shrink-0 rounded-lg bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
                                                        >
                                                            Lưu
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingCatalogSlug(null)}
                                                            className="shrink-0 rounded-lg px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700"
                                                        >
                                                            Hủy
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="flex items-center gap-2">
                                                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-200">{item.name}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setEditingCatalogSlug(editingKey);
                                                                    setEditingCatalogName(item.name);
                                                                    setConfirmDeleteKey(null);
                                                                }}
                                                                className="shrink-0 rounded-lg px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                                            >
                                                                Sửa
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteCatalogItem(section.kind, item.id)}
                                                                className={`shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-white ${confirmDeleteKey === deleteKey ? 'bg-red-700' : 'bg-red-600 hover:bg-red-700'}`}
                                                            >
                                                                {confirmDeleteKey === deleteKey ? 'Chắc chắn?' : 'Xóa'}
                                                            </button>
                                                        </div>
                                                        <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500">{item.id}</p>
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

                {adminLoadedTab === adminTab && adminTab === 'requests' && (
                    <div className="mt-4 space-y-3">
                        {pendingRequests.map((request) => (
                            <div key={request.id} className="rounded-xl border border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-950/20 p-4">
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
                                {request.notes && (
                                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Ghi chú: {request.notes}</p>
                                )}
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
                        {pendingRequests.length === 0 && (
                            <p className="text-sm text-gray-500 dark:text-gray-400">Không có yêu cầu chờ xác nhận.</p>
                        )}
                    </div>
                )}
            </div>

            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                        Cửa hàng ({adminStores.length})
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={openAddStore}
                            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Thêm cửa hàng
                        </button>
                    <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 text-xs font-medium">
                        {(
                            [
                                { id: 'ACTIVE', label: 'Đang hoạt động' },
                                { id: 'INACTIVE', label: 'Đã ẩn' },
                                { id: 'ALL', label: 'Tất cả' },
                            ] as const
                        ).map((opt) => (
                            <button
                                key={opt.id}
                                type="button"
                                onClick={() => setStoreStatusFilter(opt.id)}
                                className={`rounded-md px-2.5 py-1.5 transition ${
                                    storeStatusFilter === opt.id
                                        ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="relative h-[380px] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                        <MapView
                            center={DEFAULT_CENTER}
                            stores={mapStores}
                            selectedStore={selectedMapStore}
                            markerMode="dot"
                        />
                    </div>
                    <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1">
                        {adminStores.map((store) => {
                            const isSelected = selectedStoreId === store.id;
                            return (
                                <div
                                    key={store.id}
                                    onClick={() => {
                                        setSelectedStoreId(store.id);
                                        openEditStore(store.id);
                                    }}
                                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                                        isSelected
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                                            {store.name}
                                        </p>
                                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${store.status === 'ACTIVE' ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                                            {store.status === 'ACTIVE' ? 'Đang hoạt động' : 'Đã ẩn'}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">{store.address}</p>
                                </div>
                            );
                        })}
                        {adminStores.length === 0 && (
                            <p className="text-sm text-gray-500 dark:text-gray-400">Chưa có cửa hàng nào.</p>
                        )}
                    </div>
                </div>
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                    Bấm vào cửa hàng để sửa thông tin hoặc ẩn/khôi phục.
                </p>
            </div>

            {editingStore && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
                    <div className="w-full max-w-lg rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-2xl my-8">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                Sửa cửa hàng
                            </h2>
                            <button
                                type="button"
                                onClick={() => setEditingStore(null)}
                                aria-label="Đóng"
                                className="rounded-lg p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Tên cửa hàng</label>
                                <input value={editName} onChange={(e) => setEditName(e.target.value)} className={`${inputClass} w-full`} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Địa chỉ</label>
                                <input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} className={`${inputClass} w-full`} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Thương hiệu</label>
                                    <select value={editBrand} onChange={(e) => setEditBrand(e.target.value)} className={`${inputClass} w-full`}>
                                        {adminBrands.map((b) => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Giờ mở cửa</label>
                                    <input
                                        value={editOpenHours}
                                        onChange={(e) => setEditOpenHours(e.target.value)}
                                        placeholder="vd: 06:00-23:00"
                                        className={`${inputClass} w-full`}
                                    />
                                </div>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={editIs24h}
                                    onChange={(e) => setEditIs24h(e.target.checked)}
                                    className="h-4 w-4 rounded"
                                />
                                Mở 24/7
                            </label>
                            <div>
                                <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">Tiện ích</p>
                                <div className="flex flex-wrap gap-2">
                                    {adminAmenities.map((a) => {
                                        const active = editAmenities.includes(a.id);
                                        return (
                                            <button
                                                key={a.id}
                                                type="button"
                                                onClick={() => toggleEditAmenity(a.id)}
                                                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                                                    active
                                                        ? 'bg-blue-600 text-white shadow-sm'
                                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                                }`}
                                            >
                                                {a.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div>
                                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                                    <MapPin className="h-3.5 w-3.5" />
                                    Vị trí
                                    {editLocation && (
                                        <span className="font-normal">
                                            ({editLocation.lat.toFixed(5)}, {editLocation.lng.toFixed(5)})
                                        </span>
                                    )}
                                </p>
                                <div className="relative h-[220px] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                                    <MapView
                                        center={editLocation || DEFAULT_CENTER}
                                        stores={editLocation ? [{ id: 'picked', name: 'Vị trí', address: '', lat: editLocation.lat, lng: editLocation.lng }] : []}
                                        selectedStore={editLocation ? { id: 'picked', name: 'Vị trí', address: '', lat: editLocation.lat, lng: editLocation.lng } : null}
                                        pickingEnabled
                                        onMapClick={(loc) => setEditLocation(loc)}
                                    />
                                </div>
                                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Bấm vào bản đồ để đổi vị trí.</p>
                            </div>
                        </div>

                        <div className="mt-5 flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex gap-2">
                                {editingStore.status === 'ACTIVE' ? (
                                    <button
                                        type="button"
                                        onClick={handleDeleteStore}
                                        className={`flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${confirmDeleteKey === `store:${editingStore.id}` ? 'bg-red-700' : 'bg-red-600 hover:bg-red-700'}`}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        {confirmDeleteKey === `store:${editingStore.id}` ? 'Chắc chắn ẩn?' : 'Ẩn cửa hàng'}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleRestoreStore}
                                        className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
                                    >
                                        <RotateCcw className="h-4 w-4" />
                                        Khôi phục
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setEditingStore(null)}
                                    className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveStore}
                                    disabled={savingStore}
                                    className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                >
                                    <Pencil className="h-4 w-4" />
                                    {savingStore ? 'Đang lưu...' : 'Lưu thay đổi'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {addingStore && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
                    <div className="w-full max-w-lg rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-2xl my-8">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                Thêm cửa hàng
                            </h2>
                            <button
                                type="button"
                                onClick={() => setAddingStore(false)}
                                aria-label="Đóng"
                                className="rounded-lg p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Tên cửa hàng *</label>
                                <input value={addName} onChange={(e) => setAddName(e.target.value)} className={`${inputClass} w-full`} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Địa chỉ *</label>
                                <input
                                    value={addPick.address}
                                    onChange={(e) => addPick.setAddress(e.target.value)}
                                    /* Rời ô nhập hoặc Enter: địa chỉ → ghim tự nhảy tới (1 lần duy nhất). */
                                    onBlur={addPick.commitAddress}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            addPick.commitAddress();
                                        }
                                    }}
                                    className={`${inputClass} w-full`}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Thương hiệu</label>
                                    <select value={addBrand} onChange={(e) => setAddBrand(e.target.value)} className={`${inputClass} w-full`}>
                                        {adminBrands.map((b) => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Giờ mở cửa</label>
                                    <input
                                        value={addOpenHours}
                                        onChange={(e) => setAddOpenHours(e.target.value)}
                                        placeholder="vd: 06:00-23:00"
                                        className={`${inputClass} w-full`}
                                    />
                                </div>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={addIs24h}
                                    onChange={(e) => setAddIs24h(e.target.checked)}
                                    className="h-4 w-4 rounded"
                                />
                                Mở 24/7
                            </label>
                            <div>
                                <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">Tiện ích</p>
                                <div className="flex flex-wrap gap-2">
                                    {adminAmenities.map((a) => {
                                        const active = addAmenities.includes(a.id);
                                        return (
                                            <button
                                                key={a.id}
                                                type="button"
                                                onClick={() => toggleAddAmenity(a.id)}
                                                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                                                    active
                                                        ? 'bg-blue-600 text-white shadow-sm'
                                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                                }`}
                                            >
                                                {a.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div>
                                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                                    <MapPin className="h-3.5 w-3.5" />
                                    Vị trí
                                    <span className="font-normal">
                                        ({addLoc.lat.toFixed(5)}, {addLoc.lng.toFixed(5)})
                                    </span>
                                    {addPick.geocoding && (
                                        <span className="font-normal text-blue-500 dark:text-blue-400">
                                            Đang tìm địa chỉ…
                                        </span>
                                    )}
                                </p>
                                <div className="relative h-[220px] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                                    <MapView
                                        center={addPick.mapCenter}
                                        /* Chỉ vẽ ghim xanh khi có GPS thật; không vẽ chỉ đường
                                           trong modal chọn vị trí. */
                                        userLocation={addPick.pin}
                                        showRoute={false}
                                        stores={[{ id: 'picked', name: 'Vị trí', address: '', lat: addLoc.lat, lng: addLoc.lng }]}
                                        selectedStore={{ id: 'picked', name: 'Vị trí', address: '', lat: addLoc.lat, lng: addLoc.lng }}
                                        pickingEnabled
                                        onMapClick={(loc) => addPick.placePin(loc)}
                                    />
                                </div>
                                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                                    Bấm vào bản đồ để chọn vị trí cửa hàng.
                                    {addPick.locFailed && (
                                        <>
                                            {' '}Không lấy được vị trí của bạn — đang hiển thị bản đồ Hà Nội.{' '}
                                            <button
                                                type="button"
                                                onClick={addPick.requestGps}
                                                className="font-medium text-amber-600 dark:text-amber-400 hover:underline"
                                            >
                                                Thử lấy lại vị trí
                                            </button>
                                        </>
                                    )}
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setAddingStore(false)}
                                className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                onClick={handleAddStore}
                                disabled={savingAddStore}
                                className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                            >
                                <Plus className="h-4 w-4" />
                                {savingAddStore ? 'Đang thêm...' : 'Thêm cửa hàng'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editingUser && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
                    <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-2xl my-8">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                Sửa tài khoản
                            </h2>
                            <button
                                type="button"
                                onClick={() => setEditingUser(null)}
                                aria-label="Đóng"
                                className="rounded-lg p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Họ tên *</label>
                                <input value={editUserName} onChange={(e) => setEditUserName(e.target.value)} className={`${inputClass} w-full`} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Email *</label>
                                <input value={editUserEmail} onChange={(e) => setEditUserEmail(e.target.value)} className={`${inputClass} w-full`} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Username</label>
                                <input
                                    value={editUserUsername}
                                    onChange={(e) => setEditUserUsername(e.target.value)}
                                    placeholder="Để trống nếu không dùng"
                                    className={`${inputClass} w-full`}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Vai trò</label>
                                <select
                                    value={editUserRole}
                                    onChange={(e) => setEditUserRole(e.target.value as 'user' | 'admin')}
                                    className={`${inputClass} w-full`}
                                >
                                    <option value="user">Người dùng</option>
                                    <option value="admin">Quản trị viên</option>
                                </select>
                            </div>
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                                Đổi email/username sẽ ảnh hưởng cách người dùng này đăng nhập. Mật khẩu không đổi tại đây.
                            </p>
                        </div>

                        <div className="mt-5 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setEditingUser(null)}
                                className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveUser}
                                disabled={savingUser}
                                className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                            >
                                <Pencil className="h-4 w-4" />
                                {savingUser ? 'Đang lưu...' : 'Lưu thay đổi'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
