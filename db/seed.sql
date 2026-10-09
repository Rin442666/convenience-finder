-- Seed data — generated from src/lib/store-db.ts initialStoreSeed
-- Chạy 1 lần duy nhất khi tạo database mới.

INSERT INTO roles (name) VALUES ('user'), ('admin');
INSERT INTO users (id, full_name, email, password_hash, role, is_active) VALUES
  ('user-001', 'Nguyễn Văn User', 'user@finder.local', 'scrypt:8679f3c2bd6bf819c2d6f95fe3361b0a:bb4bd3fd345b0a1651a6475312773b1ac4d9671d2ba595ae90138d6e6bce53fcf547087c075a0326d21740ec1f90afbbb7c416d248362766c861fc6e6c654527', 'user', 1),
  ('admin-001', 'Quản trị viên', 'admin@finder.local', 'scrypt:c80cd9c976c94cb320778fc905b37299:fb699ce47bef2916d592d924d105e838fea693b831a8a96ab2e94020c442acc12c75f66d7ee692ce4134d43192efa72da6847ea3309dabca816772d8c220e46c', 'admin', 1);

INSERT INTO brands (slug, name) VALUES
  ('circle-k', 'Circle K'),
  ('winmart', 'WinMart+'),
  ('gs25', 'GS25'),
  ('familymart', 'FamilyMart'),
  ('7-eleven', '7-Eleven'),
  ('other', 'Khác');

INSERT INTO amenities (slug, name) VALUES
  ('wifi', 'Wi-Fi'),
  ('parking', 'Bãi xe'),
  ('seating', 'Chỗ ngồi'),
  ('cashless', 'Có chuyển khoản'),
  ('wc', 'Nhà vệ sinh'),
  ('overnight', 'Cho phép qua đêm');

INSERT INTO stores (id, brand_slug, name, address, lat, lng, base_rating, is_24h, open_hours, status) VALUES
  ('store-1', 'circle-k', 'Circle K Cầu Giấy', 'Số 12, Đường Cầu Giấy, Hà Nội', 21.0368, 105.7987, 4.7, 1, '24/7', 'ACTIVE'),
  ('store-2', 'winmart', 'WinMart+ Quan Hoa', 'Ngõ 5, Phố Quan Hoa, Cầu Giấy, Hà Nội', 21.0314, 105.8041, 4.5, 0, '06:00-23:00', 'ACTIVE'),
  ('store-3', 'gs25', 'GS25 Nguyễn Khánh Toàn', 'Nguyễn Khánh Toàn, Cầu Giấy, Hà Nội', 21.0389, 105.8092, 4.8, 1, '24/7', 'ACTIVE'),
  ('store-4', 'familymart', 'FamilyMart Đào Tấn', 'Đào Tấn, Ba Đình, Hà Nội', 21.0295, 105.8174, 4.4, 0, '08:00-22:00', 'ACTIVE'),
  ('store-5', '7-eleven', '7-Eleven Phạm Hùng', 'Phạm Hùng, Nam Từ Liêm, Hà Nội', 21.0187, 105.7843, 4.3, 0, '07:00-22:00', 'ACTIVE'),
  ('store-6', 'circle-k', 'Circle K Lê Văn Lương', 'Lê Văn Lương, Thanh Xuân, Hà Nội', 20.9989, 105.8158, 4.6, 1, '24/7', 'ACTIVE'),
  ('store-7', 'winmart', 'WinMart+ Xuân Đỉnh', 'Xuân Đỉnh, Bắc Từ Liêm, Hà Nội', 21.0593, 105.7966, 4.5, 0, '06:30-22:30', 'ACTIVE'),
  ('store-8', 'gs25', 'GS25 Hoàng Đạo Thúy', 'Hoàng Đạo Thúy, Hà Nội', 21.0243, 105.8035, 4.7, 1, '24/7', 'ACTIVE'),
  ('store-9', 'circle-k', 'Circle K Hàng Bài', 'Số 45, Phố Hàng Bài, Hoàn Kiếm, Hà Nội', 21.0243, 105.8536, 4.6, 1, '24/7', 'ACTIVE'),
  ('store-10', 'winmart', 'WinMart+ Tràng Tiền', 'Số 12, Phố Tràng Tiền, Hoàn Kiếm, Hà Nội', 21.0243, 105.8575, 4.4, 0, '06:00-23:00', 'ACTIVE'),
  ('store-11', 'gs25', 'GS25 Lý Thường Kiệt', 'Số 28, Phố Lý Thường Kiệt, Hoàn Kiếm, Hà Nội', 21.0225, 105.8485, 4.8, 1, '24/7', 'ACTIVE'),
  ('store-12', 'familymart', 'FamilyMart Kim Mã', 'Số 360, Phố Kim Mã, Ba Đình, Hà Nội', 21.029, 105.816, 4.3, 0, '07:00-23:00', 'ACTIVE'),
  ('store-13', '7-eleven', '7-Eleven Liễu Giai', 'Số 15, Phố Liễu Giai, Ba Đình, Hà Nội', 21.0335, 105.8095, 4.5, 1, '24/7', 'ACTIVE'),
  ('store-14', 'circle-k', 'Circle K Tây Sơn', 'Số 210, Phố Tây Sơn, Đống Đa, Hà Nội', 21.0125, 105.8245, 4.4, 0, '22:00-06:00', 'ACTIVE'),
  ('store-15', 'winmart', 'WinMart+ Chùa Bộc', 'Số 68, Phố Chùa Bộc, Đống Đa, Hà Nội', 21.0085, 105.8275, 4.2, 0, '06:30-22:30', 'ACTIVE'),
  ('store-16', 'gs25', 'GS25 Bạch Mai', 'Số 175, Phố Bạch Mai, Hai Bà Trưng, Hà Nội', 21.0075, 105.8475, 4.6, 1, '24/7', 'ACTIVE'),
  ('store-17', 'familymart', 'FamilyMart Minh Khai', 'Số 422, Phố Minh Khai, Hai Bà Trưng, Hà Nội', 21.0055, 105.857, 4.3, 0, '08:00-22:00', 'ACTIVE'),
  ('store-18', 'circle-k', 'Circle K Lạc Long Quân', 'Số 88, Phố Lạc Long Quân, Tây Hồ, Hà Nội', 21.0515, 105.811, 4.5, 1, '24/7', 'ACTIVE'),
  ('store-19', 'winmart', 'WinMart+ Hoàng Quốc Việt', 'Số 105, Phố Hoàng Quốc Việt, Bắc Từ Liêm, Hà Nội', 21.0455, 105.7975, 4.4, 0, '06:00-22:00', 'ACTIVE'),
  ('store-20', '7-eleven', '7-Eleven Nguyễn Trãi', 'Số 250, Phố Nguyễn Trãi, Thanh Xuân, Hà Nội', 20.9995, 105.8155, 4.6, 1, '24/7', 'ACTIVE');

INSERT INTO store_amenities (store_id, amenity_slug) VALUES
  ('store-1', 'wifi'),
  ('store-1', 'parking'),
  ('store-1', 'cashless'),
  ('store-2', 'wifi'),
  ('store-2', 'seating'),
  ('store-2', 'parking'),
  ('store-3', 'wifi'),
  ('store-3', 'wc'),
  ('store-3', 'cashless'),
  ('store-4', 'overnight'),
  ('store-4', 'seating'),
  ('store-5', 'parking'),
  ('store-5', 'cashless'),
  ('store-5', 'wifi'),
  ('store-6', 'wifi'),
  ('store-6', 'parking'),
  ('store-6', 'cashless'),
  ('store-6', 'wc'),
  ('store-7', 'parking'),
  ('store-7', 'cashless'),
  ('store-7', 'seating'),
  ('store-8', 'wifi'),
  ('store-8', 'seating'),
  ('store-8', 'cashless'),
  ('store-9', 'wifi'),
  ('store-9', 'cashless'),
  ('store-9', 'wc'),
  ('store-10', 'cashless'),
  ('store-10', 'parking'),
  ('store-11', 'wifi'),
  ('store-11', 'seating'),
  ('store-11', 'cashless'),
  ('store-11', 'wc'),
  ('store-12', 'wifi'),
  ('store-12', 'seating'),
  ('store-13', 'wifi'),
  ('store-13', 'cashless'),
  ('store-13', 'parking'),
  ('store-14', 'wifi'),
  ('store-14', 'overnight'),
  ('store-14', 'cashless'),
  ('store-15', 'cashless'),
  ('store-15', 'seating'),
  ('store-16', 'wifi'),
  ('store-16', 'wc'),
  ('store-16', 'cashless'),
  ('store-17', 'parking'),
  ('store-17', 'seating'),
  ('store-18', 'wifi'),
  ('store-18', 'parking'),
  ('store-18', 'cashless'),
  ('store-19', 'cashless'),
  ('store-19', 'parking'),
  ('store-19', 'wc'),
  ('store-20', 'wifi'),
  ('store-20', 'seating'),
  ('store-20', 'cashless');

-- Yêu cầu demo cho admin duyệt thử
INSERT INTO store_requests (id, submitted_by, submitted_by_name, store_name, brand_name, address, lat, lng, amenities, notes, status) VALUES
  ('req-001', 'user-001', 'Nguyễn Văn User', 'Mini Mart Hà Đông', 'FamilyMart', 'Đường Hà Đông, Hà Nội', 20.9722, 105.7778, '["wifi","parking"]', 'Cửa hàng mới trên tuyến xe buýt trung tâm.', 'PENDING');
