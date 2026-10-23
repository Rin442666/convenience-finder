'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { UserLocation } from '@/types/store';
import { geocodeAddress, reverseGeocode } from '@/lib/geocode';
import { toast } from '@/components/Toast';

/* Đồng bộ 2 chiều theo HƯỚNG ĐƯỢC CHỌN — hướng nào được dùng trước
   thì tính năng hướng đó SỐNG TIẾP, hướng còn lại khóa hẳn:
   - Nhập địa chỉ trước (rời ô nhập / Enter) → từ đó về sau nhập địa chỉ
     mới ghim vẫn tự nhảy theo; bấm map chỉnh ghim thì chỉ dời ghim,
     không đụng ô địa chỉ.
   - Ghim trước (bấm bản đồ) → từ đó về sau bấm map tiếp ô địa chỉ vẫn
     tự điền theo; gõ địa chỉ tay thì ghim đứng yên
     ("nhập sau thì k sửa ghim nữa").
   Dùng chung cho trang /yeu-cau và modal "Thêm cửa hàng" của admin. */
export function usePickLocation(defaultCenter: UserLocation, autoGps = true) {
    const [address, setAddressState] = useState('');
    /* Gương của address để đọc trong callback async mà không bị stale. */
    const addressRef = useRef('');
    const [pin, setPin] = useState<UserLocation | null>(null);
    const [mapCenter, setMapCenter] = useState<UserLocation>(defaultCenter);
    const [locFailed, setLocFailed] = useState(false);
    const [geocoding, setGeocoding] = useState(false);
    /* Hướng đồng bộ đang hoạt động — 'idle' = chưa chọn hướng nào. */
    const directionRef = useRef<'idle' | 'address-to-pin' | 'pin-to-address'>('idle');
    /* Đang chờ geocode — chặn bấm map chen ngang gây race. */
    const busyRef = useRef(false);
    /* Địa chỉ đã geocode lần cuối — blur lại cùng nội dung thì bỏ qua. */
    const lastQueryRef = useRef('');

    const setAddress = useCallback((value: string) => {
        addressRef.current = value;
        setAddressState(value);
    }, []);

    const requestGps = useCallback(() => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            setLocFailed(true);
            return;
        }
        setLocFailed(false);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
                setMapCenter(loc);
                /* Ghim mặc định = vị trí hiện tại (chỉ khi chưa có ghim). */
                setPin((prev) => prev ?? loc);
            },
            () => setLocFailed(true),
            { timeout: 10000, maximumAge: 60000 }
        );
    }, []);

    useEffect(() => {
        if (autoGps) requestGps();
    }, [autoGps, requestGps]);

    /* Gọi khi rời ô địa chỉ hoặc Enter: địa chỉ → ghim.
       Hướng 'pin-to-address' thì khóa hẳn (nhập sau không sửa ghim nữa);
       các lần nhập tiếp theo ở hướng 'address-to-pin' ghim vẫn nhảy theo. */
    const commitAddress = useCallback(async () => {
        const q = addressRef.current.trim();
        if (!q || q === lastQueryRef.current || geocoding) return;
        if (directionRef.current === 'pin-to-address') return;
        lastQueryRef.current = q;
        /* Chặn bấm map chen ngang trong lúc đang tìm để tránh race. */
        busyRef.current = true;
        setGeocoding(true);
        try {
            const loc = await geocodeAddress(q);
            if (!loc) {
                toast('Không tìm thấy địa chỉ này trên bản đồ, bạn hãy bấm chọn thủ công.', 'error');
                return;
            }
            /* Tìm được mới chốt hướng — tìm lỗi thì vẫn cho đổi hướng. */
            directionRef.current = 'address-to-pin';
            setPin({ lat: loc.lat, lng: loc.lng });
            setMapCenter({ lat: loc.lat, lng: loc.lng });
        } finally {
            busyRef.current = false;
            setGeocoding(false);
        }
    }, [geocoding]);

    /* Gọi khi bấm bản đồ: luôn dời ghim; chỉ tự điền địa chỉ khi hướng
       'pin-to-address' đang hoạt động (hoặc chưa chọn hướng nào). */
    const placePin = useCallback((loc: UserLocation) => {
        setPin(loc);
        if (busyRef.current) return;
        if (directionRef.current === 'address-to-pin') return;
        directionRef.current = 'pin-to-address';
        reverseGeocode(loc.lat, loc.lng)
            .then((name) => {
                if (name) {
                    addressRef.current = name;
                    setAddressState(name);
                }
            })
            .catch(() => {});
    }, []);

    const reset = useCallback(() => {
        addressRef.current = '';
        lastQueryRef.current = '';
        directionRef.current = 'idle';
        busyRef.current = false;
        setAddressState('');
        setPin(null);
        setMapCenter(defaultCenter);
        setLocFailed(false);
        setGeocoding(false);
    }, [defaultCenter]);

    return {
        address,
        setAddress,
        commitAddress,
        geocoding,
        pin,
        placePin,
        mapCenter,
        locFailed,
        requestGps,
        reset,
    };
}
