'use client';

// Gửi yêu cầu thêm cửa hàng: chọn vị trí trực tiếp trên bản đồ
// thay vì nhập tọa độ thủ công.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MapPin } from 'lucide-react';
import MapView from '@/components/MapView';
import { toast } from '@/components/Toast';
import { useApp } from '@/components/app-provider';
import { hasPermission } from '@/lib/auth-system';
import { Store, UserLocation } from '@/types/store';

const DEFAULT_CENTER: UserLocation = { lat: 21.0285, lng: 105.8542 };

type CatalogItem = { id: string; name: string };

const fallbackAmenityOptions: CatalogItem[] = [
    { id: 'wifi', name: 'Wi-Fi' },
    { id: 'parking', name: 'Bãi xe' },
    { id: 'seating', name: 'Chỗ ngồi' },
    { id: 'cashless', name: 'Có chuyển khoản' },
    { id: 'wc', name: 'Nhà vệ sinh' },
    { id: 'overnight', name: 'Cho phép qua đêm' },
];

const inputClass =
    'border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 w-full outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800';

export default function YeuCauPage() {
    const { currentUser, authToken, authReady } = useApp();
    const router = useRouter();
    const [storeName, setStoreName] = useState('');
    const [brandName, setBrandName] = useState('Circle K');
    const [address, setAddress] = useState('');
    const [notes, setNotes] = useState('');
    const [picked, setPicked] = useState<UserLocation | null>(null);
    const [amenityOptions, setAmenityOptions] = useState<CatalogItem[]>(fallbackAmenityOptions);
    const [selectedAmenities, setSelectedAmenities] = useState<string[]>(['wifi', 'parking']);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        if (authReady && !currentUser) {
            router.replace('/');
        }
    }, [authReady, currentUser, router]);

    useEffect(() => {
        fetch('/api/catalog')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (Array.isArray(data?.amenities) && data.amenities.length > 0) {
                    setAmenityOptions(data.amenities);
                }
            })
            .catch(() => {});
    }, []);

    if (!authReady || !currentUser) {
        return null;
    }

    const pickedStore: Store | null = picked
        ? { id: 'picked', name: 'Vị trí đã chọn', address: '', lat: picked.lat, lng: picked.lng }
        : null;

    const toggleAmenity = (id: string) => {
        setSelectedAmenities((prev) =>
            prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
        );
    };

    const handleSubmit = async () => {
        if (!hasPermission(currentUser, 'submit_store_request')) {
            toast('Bạn cần đăng nhập để gửi yêu cầu thêm cửa hàng.', 'error');
            return;
        }
        if (!storeName.trim() || !address.trim()) {
            toast('Vui lòng nhập tên cửa hàng và địa chỉ.', 'error');
            return;
        }
        if (!picked) {
            toast('Hãy bấm vào bản đồ để chọn vị trí cửa hàng.', 'error');
            return;
        }
        setSending(true);
        try {
            const res = await fetch('/api/store-requests', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
                },
                body: JSON.stringify({
                    storeName: storeName.trim(),
                    brandName: brandName.trim(),
                    address: address.trim(),
                    lat: picked.lat,
                    lng: picked.lng,
                    amenities: selectedAmenities,
                    notes: notes.trim(),
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không thể gửi yêu cầu.', 'error');
                return;
            }
            toast(data.message || 'Yêu cầu đã được gửi cho Admin.', 'success');
            router.push('/');
        } catch (error) {
            console.error('Lỗi gửi yêu cầu:', error);
            toast('Không thể gửi yêu cầu thêm cửa hàng.', 'error');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto mb-6 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Gửi yêu cầu thêm cửa hàng</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Bấm vào bản đồ để chọn vị trí cửa hàng. Yêu cầu sẽ được Admin xác nhận trước khi tạo cửa hàng mới.
                    </p>
                </div>
                <Link
                    href="/"
                    className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                >
                    Quay lại
                </Link>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
                <input
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className={inputClass}
                    placeholder="Tên cửa hàng"
                />
                <input
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    className={inputClass}
                    placeholder="Thương hiệu"
                />
                <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className={`${inputClass} md:col-span-2`}
                    placeholder="Địa chỉ cửa hàng"
                />
            </div>

            <div className="mt-4">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    Vị trí trên bản đồ
                    {picked && (
                        <span className="font-normal text-gray-500 dark:text-gray-400">
                            ({picked.lat.toFixed(5)}, {picked.lng.toFixed(5)})
                        </span>
                    )}
                </p>
                <div className="relative h-[320px] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                    <MapView
                        center={DEFAULT_CENTER}
                        stores={pickedStore ? [pickedStore] : []}
                        selectedStore={pickedStore}
                        pickingEnabled
                        onMapClick={(loc) => setPicked(loc)}
                    />
                    <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-slate-900/85 px-4 py-1.5 text-xs font-medium text-white shadow-md pointer-events-none">
                        Bấm vào bản đồ để chọn vị trí cửa hàng
                    </div>
                </div>
            </div>

            <div className="mt-4">
                <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Tiện ích</p>
                <div className="flex flex-wrap gap-2">
                    {amenityOptions.map((amenity) => {
                        const active = selectedAmenities.includes(amenity.id);
                        return (
                            <button
                                key={amenity.id}
                                type="button"
                                onClick={() => toggleAmenity(amenity.id)}
                                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                                    active
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                }`}
                            >
                                {amenity.name}
                            </button>
                        );
                    })}
                </div>
            </div>

            <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`${inputClass} mt-4`}
                rows={3}
                placeholder="Ghi chú, mô tả hoặc thông tin bổ sung"
            />

            <div className="mt-5 flex justify-end">
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={sending}
                    className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                >
                    {sending ? 'Đang gửi...' : 'Gửi yêu cầu'}
                </button>
            </div>
        </div>
    );
}
