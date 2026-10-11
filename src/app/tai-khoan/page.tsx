'use client';

// Trang thông tin tài khoản: xem + đổi tên hiển thị + đổi mật khẩu (qua modal + mail xác nhận).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';
import { useApp } from '@/components/app-provider';
import ChangePasswordModal from '@/components/ChangePasswordModal';

export default function TaiKhoanPage() {
    const { currentUser, authToken, authReady, updateCurrentUser } = useApp();
    const router = useRouter();
    const [profileName, setProfileName] = useState('');
    const [updatingProfile, setUpdatingProfile] = useState(false);
    const [passwordModalOpen, setPasswordModalOpen] = useState(false);

    useEffect(() => {
        if (authReady && !currentUser) {
            router.replace('/');
        }
    }, [authReady, currentUser, router]);

    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (currentUser) {
            setProfileName(currentUser.fullName);
        }
    }, [currentUser]);
    /* eslint-enable react-hooks/set-state-in-effect */

    if (!authReady || !currentUser) {
        return null;
    }

    const handleUpdateProfileName = async () => {
        if (!authToken) {
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
            updateCurrentUser(data.user);
            toast('Đã cập nhật tên hiển thị.', 'success');
        } catch {
            toast('Không thể kết nối máy chủ.', 'error');
        } finally {
            setUpdatingProfile(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto mb-6 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Thông tin tài khoản</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Quản lý tài khoản và quyền truy cập</p>
                </div>
                <Link
                    href="/"
                    className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                >
                    Đóng
                </Link>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Họ tên</p>
                    <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-gray-200">{currentUser.fullName}</p>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Email</p>
                    <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-gray-200">{currentUser.email}</p>
                </div>
                {currentUser.username && (
                    <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 md:col-span-2">
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Username</p>
                        <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-gray-200">{currentUser.username}</p>
                    </div>
                )}
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
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        Đổi mật khẩu cần xác nhận qua email đã đăng ký.
                    </p>
                    <button
                        type="button"
                        onClick={() => setPasswordModalOpen(true)}
                        className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                        Đổi mật khẩu
                    </button>
                </div>
            </div>

            <ChangePasswordModal open={passwordModalOpen} onClose={() => setPasswordModalOpen(false)} />
        </div>
    );
}
