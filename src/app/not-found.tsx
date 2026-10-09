import Link from 'next/link';
import { MapPin } from 'lucide-react';

export default function NotFound() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100">
                <MapPin className="h-7 w-7 text-blue-600" />
            </span>
            <p className="mt-5 text-5xl font-extrabold text-gray-900">404</p>
            <h1 className="mt-2 text-lg font-semibold text-gray-700">Không tìm thấy trang</h1>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
                Trang bạn đang tìm không tồn tại hoặc đã được di chuyển.
            </p>
            <Link
                href="/"
                className="mt-6 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
                Về trang chủ
            </Link>
        </main>
    );
}
