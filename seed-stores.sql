USE ConvenienceFinder;
GO

BEGIN TRANSACTION;

DELETE FROM StoreAmenities;
DELETE FROM Stores;
DELETE FROM Brands;
DELETE FROM Amenities;
DELETE FROM Users;
DELETE FROM Roles;

INSERT INTO Roles (Name) VALUES
    (N'user'),
    (N'admin');

INSERT INTO Users (FullName, Email, PasswordHash, RoleId, IsActive)
VALUES
    (N'Nguyễn Văn User', N'user@finder.local', N'123456', (SELECT Id FROM Roles WHERE Name = N'user'), 1),
    (N'Quản trị viên', N'admin@finder.local', N'admin123', (SELECT Id FROM Roles WHERE Name = N'admin'), 1);

INSERT INTO Brands (Slug, Name, LogoUrl)
VALUES
    (N'circle-k', N'Circle K', N'https://example.com/logo/circlek.png'),
    (N'winmart', N'WinMart+', N'https://example.com/logo/winmart.png');

INSERT INTO Amenities (Slug, Name)
VALUES
    (N'wifi', N'Wi‑Fi'),
    (N'parking', N'Bãi đậu xe'),
    (N'seating', N'Chỗ ngồi'),
    (N'24h', N'24/7'),
    (N'cashless', N'Chuyển khoản / thẻ'),
    (N'wc', N'Nhà vệ sinh'),
    (N'overnight', N'Qua đêm');

INSERT INTO Stores (BrandId, Name, Address, Latitude, Longitude, Rating, IsOpen, Is24h, OpenHours, Status, CreatedByUserId)
VALUES
    ((SELECT Id FROM Brands WHERE Slug = N'winmart'), N'WinMart+ 68 Cầu Giấy', N'68 Cầu Giấy, Hà Nội', 21.03181253208188, 105.80129905043917, 4.5, 1, 1, N'24/7', N'ACTIVE', (SELECT Id FROM Users WHERE Email = N'admin@finder.local')),
    ((SELECT Id FROM Brands WHERE Slug = N'circle-k'), N'Circle K 18 Nguyễn Khánh Toàn', N'18 Nguyễn Khánh Toàn, Hà Nội', 21.03558397772377, 105.80396520263896, 4.7, 1, 1, N'24/7', N'ACTIVE', (SELECT Id FROM Users WHERE Email = N'admin@finder.local')),
    ((SELECT Id FROM Brands WHERE Slug = N'winmart'), N'WinMart+ 28 Trần Tử Bình', N'28 Trần Tử Bình, Hà Nội', 21.04278120481234, 105.79258910293812, 4.4, 1, 0, N'06:00-23:00', N'ACTIVE', (SELECT Id FROM Users WHERE Email = N'admin@finder.local')),
    ((SELECT Id FROM Brands WHERE Slug = N'winmart'), N'WinMart+ 01 B1 Nghĩa Tân', N'01 B1 Nghĩa Tân, Hà Nội', 21.04351289123011, 105.79124018239011, 4.3, 1, 0, N'06:30-22:30', N'ACTIVE', (SELECT Id FROM Users WHERE Email = N'admin@finder.local')),
    ((SELECT Id FROM Brands WHERE Slug = N'circle-k'), N'Circle K 106 Hoàng Quốc Việt', N'106 Hoàng Quốc Việt, Hà Nội', 21.04625019238102, 105.79381029381022, 4.6, 1, 1, N'24/7', N'ACTIVE', (SELECT Id FROM Users WHERE Email = N'admin@finder.local')),
    ((SELECT Id FROM Brands WHERE Slug = N'circle-k'), N'Circle K 31 Trần Quốc Hoàn', N'31 Trần Quốc Hoàn, Hà Nội', 21.04231502938102, 105.78762102938102, 4.5, 1, 1, N'24/7', N'ACTIVE', (SELECT Id FROM Users WHERE Email = N'admin@finder.local')),
    ((SELECT Id FROM Brands WHERE Slug = N'winmart'), N'WinMart+ 175 Trung Kính', N'175 Trung Kính, Hà Nội', 21.01891203918203, 105.79234102938102, 4.4, 1, 0, N'07:00-22:00', N'ACTIVE', (SELECT Id FROM Users WHERE Email = N'admin@finder.local')),
    ((SELECT Id FROM Brands WHERE Slug = N'circle-k'), N'Circle K 84 Trần Thái Tông', N'84 Trần Thái Tông, Hà Nội', 21.03215402938102, 105.78652302938102, 4.8, 1, 1, N'24/7', N'ACTIVE', (SELECT Id FROM Users WHERE Email = N'admin@finder.local')),
    ((SELECT Id FROM Brands WHERE Slug = N'winmart'), N'WinMart+ 162 Xã Đàn', N'162 Xã Đàn, Hà Nội', 21.01185019238102, 105.83642029381022, 4.2, 1, 0, N'06:00-23:00', N'ACTIVE', (SELECT Id FROM Users WHERE Email = N'admin@finder.local')),
    ((SELECT Id FROM Brands WHERE Slug = N'circle-k'), N'Circle K 2 Chùa Bộc', N'2 Chùa Bộc, Hà Nội', 21.00842019238102, 105.82851029381022, 4.6, 1, 1, N'24/7', N'ACTIVE', (SELECT Id FROM Users WHERE Email = N'admin@finder.local')),
    ((SELECT Id FROM Brands WHERE Slug = N'winmart'), N'WinMart+ 98 Tôn Đức Thắng', N'98 Tôn Đức Thắng, Hà Nội', 21.02615019238102, 105.83321029381022, 4.5, 1, 0, N'06:00-23:00', N'ACTIVE', (SELECT Id FROM Users WHERE Email = N'admin@finder.local')),
    ((SELECT Id FROM Brands WHERE Slug = N'circle-k'), N'Circle K 101 A2 Đặng Văn Ngữ', N'101 A2 Đặng Văn Ngữ, Hà Nội', 21.01021019238102, 105.83154029381022, 4.7, 1, 1, N'24/7', N'ACTIVE', (SELECT Id FROM Users WHERE Email = N'admin@finder.local')),
    ((SELECT Id FROM Brands WHERE Slug = N'winmart'), N'WinMart+ 36 Hoàng Cầu', N'36 Hoàng Cầu, Hà Nội', 21.01953019238102, 105.82245029381022, 4.5, 1, 0, N'07:00-22:00', N'ACTIVE', (SELECT Id FROM Users WHERE Email = N'admin@finder.local')),
    ((SELECT Id FROM Brands WHERE Slug = N'circle-k'), N'Circle K 17 Lương Định Của', N'17 Lương Định Của, Hà Nội', 21.00685019238102, 105.83512029381022, 4.4, 1, 1, N'24/7', N'ACTIVE', (SELECT Id FROM Users WHERE Email = N'admin@finder.local')),
    ((SELECT Id FROM Brands WHERE Slug = N'winmart'), N'WinMart+ 85 Nguyễn Lương Bằng', N'85 Nguyễn Lương Bằng, Hà Nội', 21.01452019238102, 105.82631029381022, 4.3, 1, 0, N'06:00-23:00', N'ACTIVE', (SELECT Id FROM Users WHERE Email = N'admin@finder.local')),
    ((SELECT Id FROM Brands WHERE Slug = N'circle-k'), N'Circle K 44 Nguyễn Chí Thanh', N'44 Nguyễn Chí Thanh, Hà Nội', 21.02081019238102, 105.80962029381022, 4.6, 1, 1, N'24/7', N'ACTIVE', (SELECT Id FROM Users WHERE Email = N'admin@finder.local'));

INSERT INTO StoreAmenities (StoreId, AmenityId)
SELECT s.Id, a.Id
FROM Stores s
JOIN Amenities a ON a.Slug = N'wifi'
WHERE s.Name IN (
    N'WinMart+ 68 Cầu Giấy',
    N'Circle K 18 Nguyễn Khánh Toàn',
    N'WinMart+ 28 Trần Tử Bình',
    N'WinMart+ 01 B1 Nghĩa Tân',
    N'Circle K 106 Hoàng Quốc Việt',
    N'Circle K 31 Trần Quốc Hoàn',
    N'WinMart+ 175 Trung Kính',
    N'Circle K 84 Trần Thái Tông',
    N'WinMart+ 162 Xã Đàn',
    N'Circle K 2 Chùa Bộc',
    N'WinMart+ 98 Tôn Đức Thắng',
    N'Circle K 101 A2 Đặng Văn Ngữ',
    N'WinMart+ 36 Hoàng Cầu',
    N'Circle K 17 Lương Định Của',
    N'WinMart+ 85 Nguyễn Lương Bằng',
    N'Circle K 44 Nguyễn Chí Thanh'
);

INSERT INTO StoreAmenities (StoreId, AmenityId)
SELECT s.Id, a.Id
FROM Stores s
JOIN Amenities a ON a.Slug = N'parking'
WHERE s.Name IN (
    N'WinMart+ 68 Cầu Giấy',
    N'WinMart+ 28 Trần Tử Bình',
    N'WinMart+ 01 B1 Nghĩa Tân',
    N'WinMart+ 175 Trung Kính',
    N'WinMart+ 162 Xã Đàn',
    N'WinMart+ 98 Tôn Đức Thắng',
    N'WinMart+ 36 Hoàng Cầu',
    N'WinMart+ 85 Nguyễn Lương Bằng',
    N'Circle K 18 Nguyễn Khánh Toàn',
    N'Circle K 106 Hoàng Quốc Việt',
    N'Circle K 84 Trần Thái Tông',
    N'Circle K 2 Chùa Bộc',
    N'Circle K 101 A2 Đặng Văn Ngữ',
    N'Circle K 44 Nguyễn Chí Thanh'
);

INSERT INTO StoreAmenities (StoreId, AmenityId)
SELECT s.Id, a.Id
FROM Stores s
JOIN Amenities a ON a.Slug = N'cashless'
WHERE s.Name IN (
    N'WinMart+ 68 Cầu Giấy',
    N'Circle K 18 Nguyễn Khánh Toàn',
    N'WinMart+ 28 Trần Tử Bình',
    N'WinMart+ 01 B1 Nghĩa Tân',
    N'Circle K 106 Hoàng Quốc Việt',
    N'Circle K 31 Trần Quốc Hoàn',
    N'Circle K 84 Trần Thái Tông',
    N'Circle K 2 Chùa Bộc',
    N'WinMart+ 98 Tôn Đức Thắng',
    N'Circle K 101 A2 Đặng Văn Ngữ',
    N'Circle K 44 Nguyễn Chí Thanh'
);

INSERT INTO StoreAmenities (StoreId, AmenityId)
SELECT s.Id, a.Id
FROM Stores s
JOIN Amenities a ON a.Slug = N'24h'
WHERE s.Name IN (
    N'WinMart+ 68 Cầu Giấy',
    N'Circle K 18 Nguyễn Khánh Toàn',
    N'Circle K 106 Hoàng Quốc Việt',
    N'Circle K 31 Trần Quốc Hoàn',
    N'Circle K 84 Trần Thái Tông',
    N'Circle K 2 Chùa Bộc',
    N'Circle K 101 A2 Đặng Văn Ngữ',
    N'Circle K 17 Lương Định Của',
    N'Circle K 44 Nguyễn Chí Thanh'
);

INSERT INTO StoreAmenities (StoreId, AmenityId)
SELECT s.Id, a.Id
FROM Stores s
JOIN Amenities a ON a.Slug = N'seating'
WHERE s.Name IN (
    N'WinMart+ 68 Cầu Giấy',
    N'WinMart+ 28 Trần Tử Bình',
    N'WinMart+ 175 Trung Kính',
    N'WinMart+ 162 Xã Đàn',
    N'WinMart+ 36 Hoàng Cầu',
    N'WinMart+ 85 Nguyễn Lương Bằng'
);

INSERT INTO StoreAmenities (StoreId, AmenityId)
SELECT s.Id, a.Id
FROM Stores s
JOIN Amenities a ON a.Slug = N'wc'
WHERE s.Name IN (
    N'Circle K 18 Nguyễn Khánh Toàn',
    N'Circle K 106 Hoàng Quốc Việt',
    N'Circle K 84 Trần Thái Tông',
    N'Circle K 2 Chùa Bộc',
    N'Circle K 101 A2 Đặng Văn Ngữ'
);

INSERT INTO StoreAmenities (StoreId, AmenityId)
SELECT s.Id, a.Id
FROM Stores s
JOIN Amenities a ON a.Slug = N'overnight'
WHERE s.Name IN (
    N'WinMart+ 68 Cầu Giấy',
    N'Circle K 18 Nguyễn Khánh Toàn',
    N'Circle K 84 Trần Thái Tông',
    N'Circle K 2 Chùa Bộc'
);

COMMIT TRANSACTION;
GO

SELECT * FROM Roles;
SELECT * FROM Brands;
SELECT * FROM Amenities;
SELECT * FROM Stores ORDER BY Id;
SELECT * FROM StoreAmenities ORDER BY StoreId, AmenityId;
