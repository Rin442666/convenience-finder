/* Helper validate dữ liệu đầu vào dùng chung cho các API route (server-only).
   Mọi trường client gửi lên đều qua các hàm này trước khi chạm vào DB —
   trả { ok: true, value } khi hợp lệ hoặc { ok: false, error } kèm thông
   báo tiếng Việt để route trả thẳng 400 cho client. */
import { EMAIL_RE, USERNAME_RE } from './server-auth';

export type Valid<T> = { ok: true; value: T } | { ok: false; error: string };

function ok<T>(value: T): Valid<T> {
  return { ok: true, value };
}

function fail<T>(error: string): Valid<T> {
  return { ok: false, error };
}

/** Chuỗi bắt buộc: phải là string, trim xong dài trong [min, max]. */
export function vText(
  value: unknown,
  label: string,
  options: { min?: number; max?: number } = {}
): Valid<string> {
  const min = options.min ?? 1;
  const max = options.max ?? 255;
  if (typeof value !== 'string') {
    return fail(`${label} không hợp lệ.`);
  }
  const clean = value.trim();
  if (clean.length < min) {
    return fail(
      min <= 1 ? `${label} không được để trống.` : `${label} phải có ít nhất ${min} ký tự.`
    );
  }
  if (clean.length > max) {
    return fail(`${label} tối đa ${max} ký tự.`);
  }
  return ok(clean);
}

/** Chuỗi tùy chọn: null/undefined/chuỗi rỗng → null; có giá trị thì phải ≤ max. */
export function vOptionalText(value: unknown, label: string, max = 255): Valid<string | null> {
  if (value === undefined || value === null) {
    return ok(null);
  }
  if (typeof value !== 'string') {
    return fail(`${label} không hợp lệ.`);
  }
  const clean = value.trim();
  if (!clean) {
    return ok(null);
  }
  if (clean.length > max) {
    return fail(`${label} tối đa ${max} ký tự.`);
  }
  return ok(clean);
}

/** Email: đúng định dạng, chuẩn hóa chữ thường. */
export function vEmail(value: unknown): Valid<string> {
  const text = vText(value, 'Email', { max: 120 });
  if (!text.ok) {
    return text;
  }
  const mail = text.value.toLowerCase();
  if (!EMAIL_RE.test(mail)) {
    return fail('Email không đúng định dạng.');
  }
  return ok(mail);
}

/** Username: để trống → null (không dùng); có thì 3–30 ký tự chữ/số/./_/-. */
export function vUsername(value: unknown): Valid<string | null> {
  if (value === undefined || value === null) {
    return ok(null);
  }
  if (typeof value !== 'string') {
    return fail('Username không hợp lệ.');
  }
  const clean = value.trim();
  if (!clean) {
    return ok(null);
  }
  if (!USERNAME_RE.test(clean)) {
    return fail('Username chỉ gồm chữ, số, dấu . _ -, từ 3 đến 30 ký tự.');
  }
  return ok(clean);
}

/** Mật khẩu: tối thiểu 6 ký tự (khớp rule đăng ký hiện tại). */
export function vPassword(value: unknown, label = 'Mật khẩu'): Valid<string> {
  if (typeof value !== 'string' || value.length === 0) {
    return fail(`${label} không được để trống.`);
  }
  if (value.length < 6) {
    return fail(`${label} phải có ít nhất 6 ký tự.`);
  }
  if (value.length > 128) {
    return fail(`${label} tối đa 128 ký tự.`);
  }
  return ok(value);
}

/** Vĩ độ: số hữu hạn trong [-90, 90]. */
export function vLat(value: unknown): Valid<number> {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -90 || value > 90) {
    return fail('Vĩ độ (lat) phải là số từ -90 đến 90.');
  }
  return ok(value);
}

/** Kinh độ: số hữu hạn trong [-180, 180]. */
export function vLng(value: unknown): Valid<number> {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -180 || value > 180) {
    return fail('Kinh độ (lng) phải là số từ -180 đến 180.');
  }
  return ok(value);
}

/** Cặp tọa độ vị trí thật: hợp lệ và không phải (0, 0) — điểm giữa đại dương,
    dấu hiệu client chưa chọn vị trí trên bản đồ. */
export function vLatLng(lat: unknown, lng: unknown): Valid<{ lat: number; lng: number }> {
  const la = vLat(lat);
  if (!la.ok) {
    return la;
  }
  const ln = vLng(lng);
  if (!ln.ok) {
    return ln;
  }
  if (la.value === 0 && ln.value === 0) {
    return fail('Vui lòng chọn vị trí trên bản đồ.');
  }
  return ok({ lat: la.value, lng: ln.value });
}

/** Boolean bắt buộc đúng kiểu (không nhận 'true'/1). */
export function vBool(value: unknown, label: string): Valid<boolean> {
  if (typeof value !== 'boolean') {
    return fail(`${label} phải là true hoặc false.`);
  }
  return ok(value);
}

/** Mảng slug (định danh danh mục): mỗi phần tử là string ≤ 64 ký tự, bỏ trùng. */
export function vSlugList(value: unknown, label: string, maxItems = 50): Valid<string[]> {
  if (!Array.isArray(value)) {
    return fail(`${label} không hợp lệ.`);
  }
  if (value.length > maxItems) {
    return fail(`${label} tối đa ${maxItems} mục.`);
  }
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0 || item.length > 64) {
      return fail(`${label} chứa mục không hợp lệ.`);
    }
    seen.add(item);
  }
  return ok([...seen]);
}

/** Số nguyên trong khoảng [min, max] (vd: số sao 1–5). */
export function vIntInRange(value: unknown, label: string, min: number, max: number): Valid<number> {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(num) || num < min || num > max) {
    return fail(`${label} phải là số nguyên từ ${min} đến ${max}.`);
  }
  return ok(num);
}
