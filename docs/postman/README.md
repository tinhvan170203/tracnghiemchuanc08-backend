# Postman API Documentation

Tài liệu Postman cho hệ thống trắc nghiệm C08 — dùng để import và test API.

## Import vào Postman

1. Mở **Postman** → **Import**
2. Import các file sau:
   - `C08-TracNghiem.postman_collection.json` — Collection API
   - `C08-Local.postman_environment.json` — Environment local (port 4000)
   - `C08-Production.postman_environment.json` — Environment production (tùy chọn)
3. Chọn environment **C08 Trắc Nghiệm - Local** ở góc trên bên phải
4. Sửa biến `tentaikhoan` và `matkhau` trong environment

## Test API

### Bước 1: Đăng nhập

Chạy request **Auth → Login**. Script tự động lưu cookie JWT vào biến environment:
- `accessToken` ← `accessToken_thitracnghiem`
- `refreshToken` ← `refreshToken_thitracnghiem`
- `userId` ← `_id` từ response

### Bước 2: Gọi API cần auth

Các request có auth sẽ tự gắn header `Cookie` từ environment. Chỉ cần chạy request.

### Bước 3: Điền ID động

Sau khi lấy dữ liệu, copy `_id` vào biến environment tương ứng:

| Biến | Mô tả |
|------|--------|
| `monthiId` | ID môn thi |
| `cuocthiId` | ID cuộc thi |
| `chuyendeId` | ID chuyên đề |
| `cauhoiId` | ID câu hỏi |
| `donviId` | ID đơn vị |
| `doiId` | ID đội |
| `lichsuThiId` | ID lịch sử thi (bài thi đang làm) |
| `videoId` | ID video |
| `tailieuId` | ID tài liệu |
| `diaphuongId` | ID địa phương |

## Cấu trúc thư mục

```
docs/postman/
├── endpoints.js                              # Nguồn dữ liệu API (sửa khi thêm route)
├── generate.js                               # Script tạo collection
├── C08-TracNghiem.postman_collection.json    # Collection (import file này)
├── C08-Local.postman_environment.json        # Environment local
├── C08-Production.postman_environment.json   # Environment production
└── README.md                                 # File này
```

## Cập nhật khi thêm/sửa API

1. Thêm endpoint vào `endpoints.js` (hoặc sửa/xóa entry tương ứng)
2. Chạy generator:

```bash
node docs/postman/generate.js
```

3. Re-import collection trong Postman (hoặc sync nếu dùng Postman workspace)

### Format endpoint trong `endpoints.js`

```js
{
  folder: 'Tên folder',           // Nhóm trong Postman
  name: 'Tên request',            // Tên hiển thị
  method: 'GET',                  // HTTP method
  path: '/c08/.../{{monthiId}}',  // Path, dùng {{biến}} cho ID động
  auth: true,                     // true | false | 'refresh'
  role: 'xem môn thi',            // Role RBAC (optional)
  description: 'Mô tả',           // (optional)
  query: [{ key: 'page', value: '1' }],  // Query params (optional)
  body: { ... },                  // JSON body (optional)
  bodyType: 'formdata',           // 'formdata' cho upload file (optional)
  formdata: [ ... ],              // Form fields (optional)
  testScript: true,               // Chỉ dùng cho Login (optional)
}
```

## Lưu ý xác thực

- JWT: sign và verify cùng `ACCESS_TOKEN_KEY` / `REFRESH_TOKEN_KEY` trong `.env`
- Cookie names: `accessToken_thitracnghiem`, `refreshToken_thitracnghiem`
- Login bị rate limit: **5 request/phút**
- Session admin: gọi `GET /c08/auth/me` để xác thực cookie trước khi vào dashboard

## Port mặc định

| Môi trường | Port |
|------------|------|
| Local dev | 4000 |
| PM2 production | 3000 |
