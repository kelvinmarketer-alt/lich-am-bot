# 🌙 Lịch Nhắc Gia Đình — Âm lịch & Ngày quan trọng

Bot Telegram tự động nhắc mỗi sáng (06:00 giờ VN):

1. **Mùng 1 & Rằm** hằng tháng (âm lịch Việt Nam, thuật toán Hồ Ngọc Đức +7).
2. **Các ngày lễ Việt Nam** (Tết, Giỗ Tổ, Vu Lan, Trung Thu, 30/4, 2/9…).
3. **Giỗ & sinh nhật trong gia đình**, nhắc trước theo lịch **7 / 3 / 1 / 0 ngày**.
4. **Ngày tự thêm** của bạn — cũng nhắc theo lịch.

Toàn bộ danh sách ngày nằm trong **Google Sheet**, bạn tự thêm/sửa trên điện thoại,
không cần đụng code. Bot chạy miễn phí trên **GitHub Actions**.

---

## 📄 Dữ liệu: Google Sheet

Sheet: <https://docs.google.com/spreadsheets/d/1RQkkjYbg9x2evjpAnlL0pfBQiN6YUuD9-MPD1cHaW9I/edit>

Có 2 tab:

| Tab | Dùng để |
|-----|---------|
| **Lễ Việt Nam** | ~22 ngày lễ mặc định (đã điền sẵn). Bật/tắt hoặc đổi lịch nhắc tùy ý. |
| **Ngày của tôi** | Giỗ, sinh nhật, kỷ niệm… của riêng bạn. |

### Các cột

| Cột | Ý nghĩa |
|-----|---------|
| **Tên** | Tên sự kiện hiển thị trong tin nhắn |
| **Phân loại** | `giỗ` · `sinh nhật` · `kỷ niệm` · `lễ` · `khác` (chọn từ dropdown) |
| **Ngày / Tháng** | Ngày & tháng của sự kiện |
| **Âm/Dương** | `Âm` hay `Dương`. Để trống: **giỗ → Âm**, còn lại → **Dương** |
| **Lặp** | `Hằng năm` (giỗ, sinh nhật, lễ) hoặc `Hằng tháng` (Mùng 1, Rằm) |
| **Năm gốc** | (tùy chọn) năm mất / năm sinh → bot tự tính "giỗ năm thứ X" / "tròn Y tuổi" |
| **Nhắc trước** | Số ngày nhắc trước, vd `7,3,1,0`. Để trống = mặc định `7,3,1,0` |
| **Bật** | `x` để bật, để trống để tạm tắt |

> Thêm 1 ngày mới = thêm 1 dòng. Bỏ nhắc tạm thời = xóa chữ `x` ở cột **Bật**.

---

## ⚙️ Cài đặt (làm 1 lần)

### 1. Chia sẻ Sheet để bot đọc được
Mở Sheet → **Chia sẻ** (góc trên phải) → đổi "Người xem có quyền truy cập" thành
**Bất kỳ ai có đường liên kết → Người xem** → Xong.

### 2. Tạo bot Telegram
1. Mở Telegram, chat với **@BotFather** → gửi `/newbot` → đặt tên → nhận **token**
   (dạng `8123456789:AAH...`).
2. Chat với bot vừa tạo, bấm **Start**, gửi 1 tin bất kỳ.
3. Lấy **chat_id**: mở
   `https://api.telegram.org/bot<TOKEN>/getUpdates` trên trình duyệt →
   tìm `"chat":{"id":...}`. (Nếu muốn nhận trong nhóm gia đình: thêm bot vào nhóm,
   gửi 1 tin, rồi lấy `id` âm của nhóm.)

### 3. Đặt secrets trên GitHub
Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Tên secret | Giá trị |
|-----------|---------|
| `TELEGRAM_BOT_TOKEN` | token từ BotFather |
| `TELEGRAM_CHAT_ID` | chat_id của bạn / nhóm |
| `SHEET_ID` | `1RQkkjYbg9x2evjpAnlL0pfBQiN6YUuD9-MPD1cHaW9I` |

### 4. Chạy thử
Repo → tab **Actions** → workflow "Nhắc lịch âm & ngày quan trọng" → **Run workflow**.
Bạn sẽ nhận tin nhắn ngay nếu cấu hình đúng.

Sau đó bot tự chạy **06:00 sáng mỗi ngày** (cron `0 23 * * *` UTC).

---

## 🧪 Test trên máy

```bash
pip install -r requirements.txt
python3 test_local.py          # kiểm tra thuật toán âm lịch (không cần mạng)

# Xem thử tin nhắn hôm nay từ Sheet thật (cần đã chia sẻ Sheet ở bước 1):
SHEET_ID=1RQkkjYbg9x2evjpAnlL0pfBQiN6YUuD9-MPD1cHaW9I DRY_RUN=1 python3 bot.py
```

## 📁 Cấu trúc

| File | Vai trò |
|------|---------|
| `lunar.py` | Thuật toán âm lịch VN (Hồ Ngọc Đức, +7): đổi âm↔dương, can-chi, hoàng đạo |
| `bot.py` | Đọc Sheet → tính ngày sắp tới → gửi Telegram |
| `test_local.py` | Test offline thuật toán + logic nhắc |
| `.github/workflows/notify.yml` | Lịch chạy hằng ngày trên GitHub Actions |
