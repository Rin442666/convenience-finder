'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Moon, Sun, User } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import AuthModal from '@/components/AuthModal';
import { useEscapeKey } from '@/hooks/use-escape';

export default function SiteHeader() {
    const { currentUser, authToken, darkMode, toggleDarkMode, logout, authRequestKey } = useApp();
    const pathname = usePathname();
    const router = useRouter();
    const [accountMenuOpen, setAccountMenuOpen] = useState(false);
    const [authModalOpen, setAuthModalOpen] = useState(false);
    const [pendingRequestCount, setPendingRequestCount] = useState(0);
    const accountMenuRef = useRef<HTMLDivElement>(null);
    const lastAuthRequestRef = useRef(0);

    useEscapeKey(() => setAccountMenuOpen(false), accountMenuOpen);

    useEffect(() => {
        if (authRequestKey > lastAuthRequestRef.current) {
            lastAuthRequestRef.current = authRequestKey;
            setAuthModalOpen(true);
        }
    }, [authRequestKey]);

    useEffect(() => {
        if (!accountMenuOpen) {
            return;
        }
        const handlePointerDown = (event: MouseEvent) => {
            if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
                setAccountMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [accountMenuOpen]);

    const navItems = [{ href: '/', label: 'Trang chủ' }];
    const isAdmin = currentUser?.role === 'admin';

    useEffect(() => {
        if (!isAdmin || !authToken) {
            return;
        }
        let cancelled = false;
        const fetchPendingCount = async () => {
            try {
                const res = await fetch('/api/admin/requests/pending-count', {
                    headers: { Authorization: `Bearer ${authToken}` },
                });
                if (!res.ok || cancelled) {
                    return;
                }
                const data = await res.json();
                setPendingRequestCount(Number(data.count) || 0);
            } catch {
                /* Bỏ qua lỗi poll ngầm, lần sau thử lại. */
            }
        };
        fetchPendingCount();
        const timer = setInterval(fetchPendingCount, 60000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [isAdmin, authToken]);

    const handleLogout = () => {
        logout();
        setAccountMenuOpen(false);
        router.push('/');
    };

    const menuLinkClass =
        'block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800';

    return (
        <>
            <div className="max-w-7xl mx-auto mb-6 flex justify-between items-center gap-4 flex-wrap">
                <div>
                    <Link href="/" className="flex items-center gap-2">
                        <img src="/images/logo.png" alt="ConvenienceFinder" className="h-9 w-9 rounded-xl" />
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-blue-600 dark:text-blue-400">
                            ConvenienceFinder
                        </h1>
                    </Link>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Tìm cửa hàng tiện lợi gần bạn
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <nav className="hidden sm:flex items-center gap-1 mr-1 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-1 shadow-sm">
                        {navItems.map((item) => {
                            const active = pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${
                                        active
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                                    }`}
                                >
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>
                    <button
                        type="button"
                        onClick={toggleDarkMode}
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
                            <div className="relative" ref={accountMenuRef}>
                                <button
                                    type="button"
                                    onClick={() => setAccountMenuOpen((prev) => !prev)}
                                    aria-label="Mở menu tài khoản"
                                    className="relative flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                                >
                                    {isAdmin && pendingRequestCount > 0 && (
                                        <span
                                            title={`${pendingRequestCount} yêu cầu chờ duyệt`}
                                            className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-gray-900"
                                        >
                                            {pendingRequestCount > 9 ? '9+' : pendingRequestCount}
                                        </span>
                                    )}
                                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                                        <User className="h-5 w-5" />
                                    </span>
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        {currentUser.fullName}
                                    </span>
                                    <Menu className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                </button>

                                {accountMenuOpen && (
                                    <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 shadow-lg">
                                        <Link
                                            href="/tai-khoan"
                                            onClick={() => setAccountMenuOpen(false)}
                                            className={menuLinkClass}
                                        >
                                            Xem thông tin tài khoản
                                        </Link>
                                        {!isAdmin && (
                                            <Link
                                                href="/yeu-cau"
                                                onClick={() => setAccountMenuOpen(false)}
                                                className={menuLinkClass}
                                            >
                                                Gửi yêu cầu
                                            </Link>
                                        )}
                                        {isAdmin && (
                                            <Link
                                                href="/admin"
                                                onClick={() => setAccountMenuOpen(false)}
                                                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                                            >
                                                <span>Quản trị hệ thống</span>
                                                {pendingRequestCount > 0 && (
                                                    <span className="flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-950 px-2 py-0.5 text-[11px] font-bold text-red-600 dark:text-red-400">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                                                        {pendingRequestCount} mới
                                                    </span>
                                                )}
                                            </Link>
                                        )}
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
                                onClick={() => setAuthModalOpen(true)}
                                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                            >
                                Đăng nhập / Đăng ký
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
        </>
    );
}
