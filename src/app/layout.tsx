import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

// Be Vietnam Pro hỗ trợ đầy đủ ký tự tiếng Việt (trước đây dùng Geist
// nhưng quên gắn vào body, lại chỉ load subset latin khiến chữ có dấu
// bị rớt sang font hệ thống).
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
    title: 'ConvenienceFinder | Tìm cửa hàng tiện lợi gần bạn',
    description:
        'Tra cứu cửa hàng tiện lợi gần vị trí của bạn: xem giờ mở cửa, tiện ích, khoảng cách và chỉ đường.',
};

// Script chặn (blocking) chạy trước khi React hydrate: đọc lựa chọn dark
// mode đã lưu trong localStorage (chưa lưu thì theo hệ điều hành) và gắn
// class "dark" lên <html> ngay từ đầu. Nhờ đó trang không bị nháy sáng
// rồi mới tối, và lần render đầu của client khớp với HTML từ server
// (tránh lỗi hydration mismatch).
const darkModeInitScript = `(function(){try{var s=localStorage.getItem('finder_dark_mode');var d=s!==null?s==='1':(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="vi" suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: darkModeInitScript }} />
            </head>
            <body className={beVietnamPro.className} suppressHydrationWarning>{children}</body>
        </html>
    );
}
