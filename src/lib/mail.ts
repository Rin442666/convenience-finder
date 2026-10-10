// Gửi email qua Gmail SMTP (nodemailer). Module này chỉ được import từ
// API routes, không bao giờ import từ client component.
//
// Cần 2 biến môi trường:
//   EMAIL_USER — địa chỉ Gmail gửi đi
//   EMAIL_PASS — App Password 16 ký tự (Google Account → Bảo mật →
//                Mật khẩu ứng dụng), KHÔNG phải mật khẩu Gmail thường.
import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

export function isMailConfigured(): boolean {
  return Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

function getTransporter(): nodemailer.Transporter {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Chưa cấu hình EMAIL_USER / EMAIL_PASS.');
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return transporter;
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const from = process.env.EMAIL_USER as string;
  await getTransporter().sendMail({
    from: `"ConvenienceFinder" <${from}>`,
    to,
    subject: 'Đặt lại mật khẩu — ConvenienceFinder',
    text:
      `Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu cho tài khoản ConvenienceFinder.\n\n` +
      `Bấm vào link sau để đặt mật khẩu mới (hết hạn sau 15 phút):\n${resetUrl}\n\n` +
      `Nếu bạn không yêu cầu, hãy bỏ qua email này.`,
    html:
      `<p>Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu cho tài khoản ConvenienceFinder.</p>` +
      `<p><a href="${resetUrl}">Bấm vào đây để đặt mật khẩu mới</a> (link hết hạn sau 15 phút).</p>` +
      `<p>Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>`,
  });
}
