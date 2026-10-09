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

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="vi" suppressHydrationWarning>
            <body className={beVietnamPro.className} suppressHydrationWarning>{children}</body>
        </html>
    );
}
