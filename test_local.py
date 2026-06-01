"""Test offline: kiểm tra thuật toán âm lịch + logic nhắc, không cần mạng."""
from datetime import date
import lunar
import bot

# 1) Kiểm tra đổi dương -> âm với các mốc đã biết chắc
KNOWN = [
    # (dd, mm, yyyy) -> (ngày_âm, tháng_âm)
    ((29, 1, 2025), (1, 1)),    # Mùng 1 Tết Ất Tỵ
    ((10, 2, 2024), (1, 1)),    # Mùng 1 Tết Giáp Thìn
    ((12, 2, 2025), (15, 1)),   # Rằm tháng Giêng 2025
    ((6, 2, 2026), (19, 12)),   # áp Tết 2026
    ((17, 2, 2026), (1, 1)),    # Mùng 1 Tết Bính Ngọ 2026
]
print("== Đổi dương -> âm ==")
ok = True
for (d, m, y), (ed, em) in KNOWN:
    ld, lm, ly, leap = lunar.solar2lunar(d, m, y)
    status = "OK" if (ld, lm) == (ed, em) else "SAI"
    if status == "SAI":
        ok = False
    print(f"  {d:02d}/{m:02d}/{y} -> {ld}/{lm} ÂL (mong đợi {ed}/{em}) [{status}]")

# 2) Đổi âm -> dương (Tết 2026 phải ra 17/2/2026)
sd, sm, sy = lunar.lunar2solar(1, 1, 2026)
print(f"\n== Đổi âm -> dương == Mùng 1/1/2026 ÂL -> {sd:02d}/{sm:02d}/{sy}",
      "[OK]" if (sd, sm, sy) == (17, 2, 2026) else "[SAI]")

# 3) Logic nhắc: giả lập hôm nay, vài sự kiện mẫu
rows = [
    {"Tên": "Giỗ ông nội", "Phân loại": "giỗ", "Ngày": "20", "Tháng": "8",
     "Âm/Dương": "Âm", "Lặp": "Hằng năm", "Năm gốc": "1985", "Nhắc trước": "", "Bật": "x"},
    {"Tên": "Sinh nhật Mẹ", "Phân loại": "sinh nhật", "Ngày": "12", "Tháng": "5",
     "Âm/Dương": "Dương", "Lặp": "Hằng năm", "Năm gốc": "1958", "Nhắc trước": "7,1,0", "Bật": "x"},
    {"Tên": "Ngày Rằm", "Phân loại": "lễ", "Ngày": "15", "Tháng": "",
     "Âm/Dương": "Âm", "Lặp": "Hằng tháng", "Năm gốc": "", "Nhắc trước": "0", "Bật": "x"},
    {"Tên": "Tết Nguyên Đán", "Phân loại": "lễ", "Ngày": "1", "Tháng": "1",
     "Âm/Dương": "Âm", "Lặp": "Hằng năm", "Năm gốc": "", "Nhắc trước": "7,3,1,0", "Bật": "x"},
    {"Tên": "(dòng trống)", "Phân loại": "", "Ngày": "", "Tháng": "", "Bật": ""},
]
events = [e for e in (bot.normalize(r) for r in rows) if e]
print(f"\n== Chuẩn hóa: {len(events)} sự kiện hợp lệ (mong đợi 4) ==")
for e in events:
    print(f"  {e['icon']} {e['name']:18s} kind={e['kind']:8s} remind={e['remind']} base={e['base_year']}")

today = date(2026, 6, 1)
print(f"\n== Tin nhắn mẫu (giả lập hôm nay {today}) ==")
text, rem = bot.build_message(today, events)
print(text)

print("\n>>> KẾT QUẢ:", "TẤT CẢ OK" if ok else "CÓ LỖI ÂM LỊCH — KIỂM TRA LẠI")
