'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ResetForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit() {
    if (password.length < 6) {
      setStatus('error');
      setMessage('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }
    if (password !== confirm) {
      setStatus('error');
      setMessage('Mật khẩu nhập lại chưa khớp.');
      return;
    }
    setStatus('sending');
    setMessage('');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setMessage(data.message || 'Không đặt lại được mật khẩu.');
        return;
      }
      setStatus('done');
      setMessage(data.message || 'Đặt lại mật khẩu thành công.');
    } catch {
      setStatus('error');
      setMessage('Không kết nối được máy chủ.');
    }
  }

  return (
    <div className="mx-auto mt-16 w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-xl">
      <h1 className="mb-1 text-xl font-bold text-gray-900 dark:text-gray-100">
        Đặt lại mật khẩu
      </h1>
      <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
        Nhập mật khẩu mới cho tài khoản của bạn.
      </p>

      {!token && (
        <p className="mb-4 rounded-xl bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          Link đặt lại không hợp lệ. Hãy yêu cầu link mới từ trang đăng nhập.
        </p>
      )}

      {status === 'done' ? (
        <div>
          <p className="mb-4 rounded-xl bg-green-50 dark:bg-green-900/30 px-4 py-3 text-sm text-green-700 dark:text-green-300">
            {message}
          </p>
          <Link
            href="/"
            className="block w-full rounded-xl bg-blue-600 py-3 text-center text-lg font-semibold text-white hover:bg-blue-700"
          >
            Về trang chủ đăng nhập
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Mật khẩu mới:
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Nhập lại mật khẩu mới:
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
            />
          </div>

          {status === 'error' && message && (
            <p className="rounded-xl bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {message}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={status === 'sending' || !token}
            className="w-full rounded-xl bg-blue-600 py-3 text-lg font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {status === 'sending' ? 'Đang xử lý...' : 'Đặt lại mật khẩu'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function DatLaiMatKhauPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4">
      <Suspense>
        <ResetForm />
      </Suspense>
    </main>
  );
}
