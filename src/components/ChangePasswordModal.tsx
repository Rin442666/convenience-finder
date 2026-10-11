'use client';

// Modal đổi mật khẩu: nhập mật khẩu hiện tại + mật khẩu mới,
// server gửi mail xác nhận — mật khẩu chỉ đổi sau khi bấm link trong mail.
import { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from '@/components/Toast';
import { useEscapeKey } from '@/lib/use-escape';

const inputClass =
    'w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800';
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';

export default function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const close = () => {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        onClose();
    };
    useEscapeKey(close, open);

    if (!open) {
        return null;
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        if (!currentPassword || !newPassword) {
            toast('Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới.', 'error');
            return;
        }
        if (newPassword.length < 6) {
            toast('Mật khẩu mới phải có ít nhất 6 ký tự.', 'error');
            return;
        }
        if (newPassword !== confirmPassword) {
            toast('Xác nhận mật khẩu mới không khớp.', 'error');
            return;
        }
        if (currentPassword === newPassword) {
            toast('Mật khẩu mới phải khác mật khẩu hiện tại.', 'error');
            return;
        }
        setSubmitting(true);
        try {
            const res = await fetch('/api/profile/password/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast(data.message || 'Không gửi được yêu cầu.', 'error');
                return;
            }
            toast(data.message || 'Đã gửi mail xác nhận.', 'success');
            close();
        } catch {
            toast('Không kết nối được máy chủ.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-2xl">
                <div className="mb-5 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                        Đổi mật khẩu
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

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className={labelClass}>Mật khẩu hiện tại:</label>
                        <input
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className={inputClass}
                            autoComplete="current-password"
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Mật khẩu mới:</label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className={inputClass}
                            autoComplete="new-password"
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Xác nhận mật khẩu mới:</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className={inputClass}
                            autoComplete="new-password"
                        />
                    </div>

                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Sau khi gửi, hệ thống sẽ gửi một email xác nhận. Mật khẩu mới chỉ có
                        hiệu lực sau khi bạn bấm vào link trong email.
                    </p>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full rounded-xl bg-blue-600 py-3 text-lg font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                    >
                        {submitting ? 'Đang gửi...' : 'Gửi mail xác nhận'}
                    </button>
                </form>
            </div>
        </div>
    );
}
