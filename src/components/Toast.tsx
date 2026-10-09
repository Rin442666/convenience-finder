'use client';

import { useEffect, useState } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

type ToastItem = {
  id: number;
  message: string;
  kind: ToastKind;
};

type PushToast = (message: string, kind?: ToastKind) => void;

// Singleton đơn giản để bất kỳ component nào cũng gọi được `toast(...)`
// mà không cần context/provider.
let pushToast: PushToast | null = null;

export function toast(message: string, kind: ToastKind = 'info'): void {
  pushToast?.(message, kind);
}

const kindStyles: Record<ToastKind, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-blue-200 bg-blue-50 text-blue-900',
};

const kindDot: Record<ToastKind, string> = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
};

export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    let nextId = 0;

    pushToast = (message, kind = 'info') => {
      const id = ++nextId;
      setItems((prev) => [...prev.slice(-2), { id, message, kind }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }, 3200);
    };

    return () => {
      pushToast = null;
    };
  }, []);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4">
      {items.map((item) => (
        <div
          key={item.id}
          className={`toast-in pointer-events-auto flex w-full items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${kindStyles[item.kind]}`}
          role="status"
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${kindDot[item.kind]}`} />
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  );
}
