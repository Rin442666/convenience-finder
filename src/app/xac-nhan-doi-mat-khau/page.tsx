'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ConfirmBox() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState<'working' | 'done' | 'error'>('working');
  const [message, setMessage] = useState('Đang xác nhận...');

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!token) {
      setStatus('error');
      setMessage('Link xác nhận không hợp lệ.');
      return;
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    (async () => {
      try {
        const res = await fetch('/api/profile/password/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) {
          setStatus('error');
          setMessage(data.message || 'Không xác nhận được.');
          return;
        }
        setStatus('done');
        setMessage(data.message || 'Đổi mật khẩu thành công.');
      } catch {
        setStatus('error');
        setMessage('Không kết nối được máy chủ.');
      }
    })();
  }, [token]);

  return (
    <div className="mx-auto mt-16 w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-xl">
      <h1 className="mb-1 text-xl font-bold text-gray-900 dark:text-gray-100">
        Xác nhận đổi mật khẩu
      </h1>

      {status === 'working' && (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{message}</p>
      )}
      {status === 'done' && (
        <div>
          <p className="mt-4 mb-4 rounded-xl bg-green-50 dark:bg-green-900/30 px-4 py-3 text-sm text-green-700 dark:text-green-300">
            {message}
          </p>
          <Link
            href="/"
            className="block w-full rounded-xl bg-blue-600 py-3 text-center text-lg font-semibold text-white hover:bg-blue-700"
          >
            Về trang chủ đăng nhập
          </Link>
        </div>
      )}
      {status === 'error' && (
        <div>
          <p className="mt-4 mb-4 rounded-xl bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {message}
          </p>
          <Link
            href="/tai-khoan"
            className="block w-full rounded-xl bg-blue-600 py-3 text-center text-lg font-semibold text-white hover:bg-blue-700"
          >
            Về trang tài khoản
          </Link>
        </div>
      )}
    </div>
  );
}

export default function XacNhanDoiMatKhauPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4">
      <Suspense>
        <ConfirmBox />
      </Suspense>
    </main>
  );
}
