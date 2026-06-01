# 🤖 Bot chat AI — tự điền Sheet bằng Google Apps Script

Nhắn tiếng Việt tự nhiên cho bot Telegram → Claude tách dữ liệu → tự ghi vào tab
**"Ngày của tôi"**. Hỏi được luôn ("tháng này có giỗ ai?"). Dữ liệu lưu vĩnh viễn
trong Google Sheet — **không bao giờ "quên" khi đóng chat**.

```
Bạn nhắn Telegram ──► Apps Script (webhook) ──► Claude (tách dữ liệu)
                                   │
                                   └──► ghi/sửa/xóa dòng trong Google Sheet
                                   └──► trả lời lại bạn qua Telegram
```

> Đây là **bot riêng cho việc nhập liệu**, chạy độc lập với bot nhắc 6h sáng
> (GitHub Actions). Cả hai dùng chung 1 Google Sheet.

---

## Cài đặt (làm 1 lần, ~10 phút)

### 1. Mở trình soạn Apps Script gắn với Sheet
Mở [Google Sheet](https://docs.google.com/spreadsheets/d/1RQkkjYbg9x2evjpAnlL0pfBQiN6YUuD9-MPD1cHaW9I/edit)
→ menu **Tiện ích mở rộng → Apps Script**.

### 2. Dán code
- Xóa nội dung file `Code.gs` mặc định, dán toàn bộ **`Code.gs`** trong thư mục này.
- Bấm **+ → Script**, đặt tên `Lunar`, dán toàn bộ **`Lunar.gs`**.
- Lưu (Ctrl/Cmd + S).

### 3. Khai báo khóa bí mật
**⚙ Project Settings** (bánh răng bên trái) → kéo xuống **Script properties** →
**Add script property**, thêm 3 dòng:

| Property | Value |
|----------|-------|
| `TELEGRAM_BOT_TOKEN` | token bot Telegram (từ @BotFather) |
| `ANTHROPIC_API_KEY` | API key Claude — lấy ở <https://console.anthropic.com> |
| `ALLOWED_CHAT_ID` | chat_id của bạn (để chỉ mình bạn dùng được — khuyến nghị) |

### 4. Deploy thành Web App
**Deploy → New deployment** → ⚙ chọn **Web app**:
- *Execute as*: **Me**
- *Who has access*: **Anyone**
- **Deploy** → cấp quyền (chọn tài khoản → Advanced → Allow).

### 5. Đăng ký webhook
Trên thanh hàm, chọn **`setWebhook`** → **Run**. Mở **Execution log** thấy
`{"ok":true,...}` là xong.

### 6. Test
Nhắn cho bot Telegram:
```
thêm giỗ ông nội 20 tháng 8 âm, mất năm 1985, nhắc trước 7 và 3 ngày
```
Bot trả lời "✅ Đã thêm…" và bạn thấy dòng mới xuất hiện trong tab "Ngày của tôi".

---

## Bot hiểu được gì

| Bạn nhắn | Bot làm |
|----------|---------|
| "thêm sinh nhật mẹ 12/5 dương, sinh 1958" | thêm dòng mới |
| "đổi giỗ bà ngoại sang mùng 7 tháng 3 âm" | sửa dòng |
| "xóa kỷ niệm cưới" | xóa dòng |
| "tắt nhắc sinh nhật bố" / "bật lại giỗ ông nội" | bật/tắt cột Bật |
| "tháng này nhà mình có giỗ ai?" / "sắp tới có gì?" | đọc Sheet, trả lời |

## Ghi chú
- Model mặc định: `claude-haiku-4-5` (rẻ, nhanh — đổi ở biến `CLAUDE_MODEL` trong `Code.gs`).
- Mỗi lần sửa code phải **Deploy → Manage deployments → Edit → Version: New version**
  để bản mới có hiệu lực.
- Mặc định âm/dương: **giỗ → Âm**, **sinh nhật → Dương** (nói rõ thì bot theo bạn).
