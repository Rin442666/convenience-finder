'use client';

// Modal đăng nhập / đăng ký. Dùng chung cho mọi trang
// (hiển thị từ SiteHeader). Enter trong form = gửi, không cần bấm nút.
// Quên mật khẩu có trang riêng /quen-mat-khau.
import { useState } from 'react';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';
import { useApp } from '@/components/app-provider';
import { useEscapeKey } from '@/lib/use-escape';

type AuthMode = 'login' | 'register';

const inputClass =
    'w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800';
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';

export default function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { login, register } = useApp();
    const router = useRouter();
    const [authMode, setAuthMode] = useState<AuthMode>('login');
    const [loginForm, setLoginForm] = useState({ identifier: '', password: '' });
    const [registerForm, setRegisterForm] = useState({ fullName: '', email: '', username: '', password: '', confirmPassword: '' });
    const [submitting, setSubmitting] = useState(false);

    const close = () => {
        onClose();
    };
    useEscapeKey(close, open);

    if (!open) {
        return null;
    }

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        try {
            const ok = await login(loginForm.identifier, loginForm.password);
            if (ok) {
                setLoginForm({ identifier: '', password: '' });
                close();
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleRegisterSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        const trimmedName = registerForm.fullName.trim();
        const email = registerForm.email.trim();
        const username = registerForm.username.trim();
        const password = registerForm.password;
        if (!trimmedName || !email || !password) {
            toast('Vui lòng nhập họ tên, email và mật khẩu.', 'error');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            toast('Email không đúng định dạng.', 'error');
            return;
        }
        if (username && !/^[a-zA-Z0-9._-]{3,30}$/.test(username)) {
            toast('Username chỉ gồm chữ, số, dấu . _ -, từ 3 đến 30 ký tự.', 'error');
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
        setSubmitting(true);
        try {
            const ok = await register(trimmedName, email, password, username || undefined);
            if (ok) {
                setLoginForm({ identifier: '', password: '' });
                setRegisterForm({ fullName: '', email: '', username: '', password: '', confirmPassword: '' });
                setAuthMode('login');
                close();
            }
        } finally {
            setSubmitting(false);
        }
    };

    const goForgotPassword = () => {
        close();
        router.push('/quen-mat-khau');
    };

    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-2xl">
                <div className="mb-5 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                        {authMode === 'login' ? 'Đăng nhập tài khoản' : 'Đăng ký tài khoản'}
                    </h2>
                    <button
                        type="button"
                        onClick={close}
                        aria-label="Đóng"
                        className="rounded-lg p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {authMode === 'login' ? (
                    <form onSubmit={handleLoginSubmit} className="space-y-4">
                        <div>
                            <label className={labelClass}>Username/Email:</label>
                            <input
                                value={loginForm.identifier}
                                onChange={(e) => setLoginForm({ ...loginForm, identifier: e.target.value })}
                                className={inputClass}
                                autoComplete="username"
                            />
                        </div>

                        <div>
                            <label className={labelClass}>Mật khẩu:</label>
                            <input
                                type="password"
                                value={loginForm.password}
                                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                                className={inputClass}
                                autoComplete="current-password"
                            />
                        </div>

                        <div className="text-right">
                            <button
                                type="button"
                                onClick={goForgotPassword}
                                className="text-sm font-medium text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-200"
                            >
                                Quên mật khẩu?
                            </button>
                        </div>

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full rounded-xl bg-blue-600 py-3 text-lg font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                        >
                            {submitting ? 'Đang xử lý...' : 'Đăng nhập'}
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
                    </form>
                ) : (
                    <form onSubmit={handleRegisterSubmit} className="space-y-4">
                        <div>
                            <label className={labelClass}>Họ và tên:</label>
                            <input
                                value={registerForm.fullName}
                                onChange={(e) => setRegisterForm({ ...registerForm, fullName: e.target.value })}
                                className={inputClass}
                                autoComplete="name"
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Email: <span className="text-red-500">*</span></label>
                            <input
                                type="email"
                                value={registerForm.email}
                                onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                                className={inputClass}
                                autoComplete="email"
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Username: <span className="font-normal text-gray-500 dark:text-gray-400">(không bắt buộc)</span></label>
                            <input
                                value={registerForm.username}
                                onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })}
                                className={inputClass}
                                autoComplete="username"
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Mật khẩu:</label>
                            <input
                                type="password"
                                value={registerForm.password}
                                onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                                className={inputClass}
                                autoComplete="new-password"
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Xác nhận mật khẩu:</label>
                            <input
                                type="password"
                                value={registerForm.confirmPassword}
                                onChange={(e) => setRegisterForm({ ...registerForm, confirmPassword: e.target.value })}
                                className={inputClass}
                                autoComplete="new-password"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full rounded-xl bg-blue-600 py-3 text-lg font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                        >
                            {submitting ? 'Đang xử lý...' : 'Đăng ký'}
                        </button>

                        <div className="text-center text-base text-gray-900 dark:text-gray-100">
                            <span>Đã có tài khoản? </span>
                            <button
                                type="button"
                                onClick={() => setAuthMode('login')}
                                className="font-semibold text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-200"
                            >
                                Quay lại đăng nhập
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
