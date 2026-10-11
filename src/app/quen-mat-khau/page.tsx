'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function QuenMatKhauPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setStatus('error');
      setMessage('Vui lòng nhập email.');
      return;
    }
    setStatus('sending');
    setMessage('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setMessage(data.message || 'Không xử lý được yêu cầu.');
        return;
      }
      setStatus('done');
      setMessage(data.message || 'Đã gửi link đặt lại mật khẩu.');
    } catch {
      setStatus('error');
      setMessage('Không kết nối được máy chủ.');
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4">
      <div className="mx-auto mt-16 w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-xl">
        <h1 className="mb-1 text-xl font-bold text-gray-900 dark:text-gray-100">
          Quên mật khẩu
        </h1>
        <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
          Nhập email đã đăng ký, chúng tôi sẽ gửi link đặt lại mật khẩu cho bạn.
        </p>

        {status === 'done' ? (
          <div>
            <p className="mb-4 rounded-xl bg-green-50 dark:bg-green-900/30 px-4 py-3 text-sm text-green-700 dark:text-green-300">
              {message}
            </p>
            <Link
              href="/"
              className="block w-full rounded-xl bg-blue-600 py-3 text-center text-lg font-semibold text-white hover:bg-blue-700"
            >
              Về trang chủ
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email:
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
              />
            </div>

            {status === 'error' && message && (
              <p className="rounded-xl bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full rounded-xl bg-blue-600 py-3 text-lg font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
            >
              {status === 'sending' ? 'Đang gửi...' : 'Gửi link đặt lại'}
            </button>

            <Link
              href="/"
              className="block text-center text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Quay lại đăng nhập
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}
