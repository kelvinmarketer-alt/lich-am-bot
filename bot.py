"""
Bot nhắc lịch âm + ngày quan trọng của gia đình qua Telegram.

Chạy 1 lần/ngày (GitHub Actions cron lúc 06:00 giờ VN). Đọc dữ liệu từ Google
Sheet (2 tab: "Lễ Việt Nam" và "Ngày của tôi") qua link CSV công khai — KHÔNG
cần service account. Với mỗi sự kiện, bot tính ngày dương sắp tới và gửi nhắc
khi còn đúng các mốc trong cột "Nhắc trước" (mặc định 7,3,1,0 ngày).

Cấu hình qua biến môi trường (đặt trong GitHub Actions secrets/env):
  TELEGRAM_BOT_TOKEN   token bot Telegram (BotFather)
  TELEGRAM_CHAT_ID     chat_id nơi nhận thông báo
  SHEET_ID             ID Google Sheet (phần giữa /d/.../edit trên URL)
  SHEET_GIDS           gid các tab, ngăn cách bởi dấu phẩy (mặc định 2 tab đã tạo)
  REMIND_DAYS          mốc nhắc mặc định khi ô "Nhắc trước" để trống (mặc định 7,3,1,0)
  DAILY_REPORT         "1" = mỗi sáng báo lịch âm hôm nay; "0" = chỉ báo khi có sự kiện
  DRY_RUN              "1" = in ra màn hình thay vì gửi Telegram (để test)
"""
import csv
import io
import os
import sys
import unicodedata
from datetime import date, datetime, timedelta, timezone

import lunar

# ---------------- Cấu hình ----------------
TG_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
TG_CHAT = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
SHEET_ID = os.environ.get("SHEET_ID", "").strip()
SHEET_GIDS = [g.strip() for g in os.environ.get("SHEET_GIDS", "0,1294263411").split(",") if g.strip()]
DEFAULT_REMIND = os.environ.get("REMIND_DAYS", "7,3,1,0")
DAILY_REPORT = os.environ.get("DAILY_REPORT", "1") == "1"
DRY_RUN = os.environ.get("DRY_RUN", "0") == "1"

VN_TZ = timezone(timedelta(hours=7))
THU = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]

# Khóa đã bỏ dấu (vì 'loai' được chuẩn hóa qua _strip).
ICONS = {
    "gio": "🕯", "sinh nhat": "🎂", "ky niem": "💍",
    "le": "🎌", "khac": "📌",
}


def today_vn():
    return datetime.now(VN_TZ).date()


def _strip(s):
    """Bỏ dấu + lower để so khớp cột/giá trị không phân biệt dấu/hoa thường."""
    s = unicodedata.normalize("NFD", (s or "").strip().lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def _to_int(v):
    try:
        return int(float(str(v).strip()))
    except (ValueError, TypeError):
        return None


def parse_remind(text):
    if not text or not str(text).strip():
        text = DEFAULT_REMIND
    out = []
    for x in str(text).replace(";", ",").split(","):
        n = _to_int(x)
        if n is not None and n >= 0:
            out.append(n)
    return sorted(set(out)) or [0]


# ---------------- Đọc Google Sheet ----------------
def fetch_rows():
    """Tải mọi tab (gid) dưới dạng CSV và trả về list dict (key = tên cột)."""
    import requests
    rows = []
    for gid in SHEET_GIDS:
        url = (
            "https://docs.google.com/spreadsheets/d/%s/gviz/tq?tqx=out:csv&gid=%s"
            % (SHEET_ID, gid)
        )
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        r.encoding = "utf-8"
        rows.extend(csv.DictReader(io.StringIO(r.text)))
    return rows


# Bản đồ tên cột (đã bỏ dấu) -> khóa nội bộ
COLMAP = {
    "ten": "name", "phan loai": "loai", "ngay": "day", "thang": "month",
    "am/duong": "amduong", "amduong": "amduong", "lap": "lap",
    "nam goc": "base_year", "nhac truoc": "remind", "bat": "on", "ghi chu": "note",
}


def normalize(raw):
    """Chuẩn hóa 1 dòng Sheet -> event dict, hoặc None nếu bỏ qua."""
    row = {}
    for k, v in raw.items():
        key = COLMAP.get(_strip(k))
        if key:
            row[key] = (v or "").strip()

    name = row.get("name", "")
    if not name or name.startswith("("):
        return None
    if _strip(row.get("on", "x")) not in ("x", "co", "1", "true", "bat"):
        return None  # cột Bật không bật

    loai = _strip(row.get("loai", "")) or "khac"
    day = _to_int(row.get("day"))
    month = _to_int(row.get("month"))
    if day is None:
        return None

    lap = _strip(row.get("lap", ""))
    amduong = _strip(row.get("amduong", ""))
    # Mặc định âm/dương khi để trống: giỗ -> Âm, còn lại -> Dương.
    if amduong not in ("am", "duong"):
        amduong = "am" if "gio" in loai else "duong"

    if "thang" in lap:                 # Lặp = "Hằng tháng" (Rằm / Mùng 1)
        kind = "monthly"
    elif "mot lan" in lap or "1 lan" in lap or "once" in lap:   # Lặp = "Một lần"
        kind = "once_lunar" if amduong == "am" else "once_solar"
    elif amduong == "am":
        kind = "lunar"
    else:
        kind = "solar"

    if kind in ("lunar", "solar", "once_lunar", "once_solar") and month is None:
        return None

    icon = ICONS.get(loai, "📌")
    if kind == "monthly":
        icon = "🌑" if day == 1 else "🌕" if day == 15 else "🗓"

    return {
        "name": name, "loai": loai, "icon": icon, "kind": kind,
        "day": day, "month": month, "amduong": amduong,
        "remind": parse_remind(row.get("remind")),
        "base_year": _to_int(row.get("base_year")),
    }


# ---------------- Tính ngày sắp tới ----------------
def next_solar_yearly(day, month, today):
    for y in (today.year, today.year + 1):
        try:
            cand = date(y, month, day)
        except ValueError:        # 29/2 năm không nhuận -> bỏ qua năm đó
            continue
        if cand >= today:
            return cand
    return None


def next_lunar_yearly(day, month, today, max_days=420):
    for i in range(max_days):
        d = today + timedelta(days=i)
        ld, lm, _ly, _leap = lunar.solar2lunar(d.day, d.month, d.year)
        if ld == day and lm == month:
            return d
    # Ngày 30 nhưng năm nay tháng thiếu -> lùi về 29.
    if day == 30:
        return next_lunar_yearly(29, month, today, max_days)
    return None


def next_lunar_monthly(day, today, max_days=70):
    for i in range(max_days):
        d = today + timedelta(days=i)
        ld, _lm, _ly, _leap = lunar.solar2lunar(d.day, d.month, d.year)
        if ld == day:
            return d
    return None


def once_date(ev, today):
    """Sự kiện 1 lần: cần Năm (cột Năm gốc) để biết xảy ra khi nào.
    Qua ngày rồi -> trả None (ngừng nhắc)."""
    year = ev.get("base_year")
    if not year:
        return None
    if ev["kind"] == "once_solar":
        try:
            d = date(year, ev["month"], ev["day"])
        except ValueError:
            return None
    else:  # once_lunar: đổi ngày âm (ngày, tháng, năm) -> dương
        sd, sm, sy = lunar.lunar2solar(ev["day"], ev["month"], year)
        if sy == 0:
            return None
        d = date(sy, sm, sd)
    return d if d >= today else None


def resolve_next(ev, today):
    k = ev["kind"]
    if k == "monthly":
        return next_lunar_monthly(ev["day"], today)
    if k == "lunar":
        return next_lunar_yearly(ev["day"], ev["month"], today)
    if k == "solar":
        return next_solar_yearly(ev["day"], ev["month"], today)
    if k in ("once_solar", "once_lunar"):
        return once_date(ev, today)
    return None


def lunar_label(d):
    ld, lm, _ly, leap = lunar.solar2lunar(d.day, d.month, d.year)
    return "%d/%d%s ÂL" % (ld, lm, " nhuận" if leap else "")


# ---------------- Dựng tin nhắn ----------------
def daily_header(today):
    ld, lm, ly, leap = lunar.solar2lunar(today.day, today.month, today.year)
    loai, truc, good = lunar.ngay_hoang_dao(today.day, today.month, today.year, lm)
    leap_txt = " nhuận" if leap else ""
    return (
        "📅 *%s, %02d/%02d/%d*\n"
        "🌙 %d/%d%s âm lịch\n"
        "🐉 Ngày %s · Tháng %s · Năm %s\n"
        "%s %s (trực %s)"
    ) % (
        THU[today.weekday()], today.day, today.month, today.year,
        ld, lm, leap_txt,
        lunar.can_chi_ngay(today.day, today.month, today.year),
        lunar.can_chi_thang(lm, ly), lunar.can_chi_nam(ly),
        "✅" if good else "⚠️", loai, truc,
    )


def extra_note(ev, occ):
    """'giỗ năm thứ X' / 'tròn Y tuổi' nếu có Năm gốc."""
    if ev["kind"] in ("once_solar", "once_lunar"):
        return ""   # sự kiện 1 lần: Năm gốc là năm diễn ra, không tính tuổi
    if not ev["base_year"]:
        return ""
    n = occ.year - ev["base_year"]
    if n <= 0:
        return ""
    if "gio" in ev["loai"]:
        return " — giỗ năm thứ %d" % n
    if "sinh" in ev["loai"]:
        return " — tròn %d tuổi" % n
    if "ky niem" in ev["loai"]:
        return " — kỷ niệm %d năm" % n
    return ""


def build_message(today, events):
    reminders = []
    for ev in events:
        occ = resolve_next(ev, today)
        if not occ:
            continue
        days = (occ - today).days
        if days in ev["remind"]:
            reminders.append((days, ev, occ))
    reminders.sort(key=lambda x: (x[0], x[1]["name"]))

    lines = []
    if DAILY_REPORT:
        lines.append(daily_header(today))
    if reminders:
        lines.append("\n🔔 *NHẮC NGÀY QUAN TRỌNG*")
        for days, ev, occ in reminders:
            when = "🟥 *HÔM NAY*" if days == 0 else "còn *%d ngày*" % days
            lines.append(
                "%s %s — %s%s\n    ↳ %02d/%02d/%d (%s)"
                % (ev["icon"], ev["name"], when, extra_note(ev, occ),
                   occ.day, occ.month, occ.year, lunar_label(occ))
            )
    return "\n".join(lines), reminders


def main():
    if not SHEET_ID:
        print("Thiếu SHEET_ID", file=sys.stderr)
        sys.exit(1)
    today = today_vn()
    events = [e for e in (normalize(r) for r in fetch_rows()) if e]
    text, reminders = build_message(today, events)

    if not DAILY_REPORT and not reminders:
        print("Hôm nay không có gì để nhắc.")
        return

    if DRY_RUN or not (TG_TOKEN and TG_CHAT):
        print("----- DRY RUN (không gửi Telegram) -----")
        print(text)
        return

    import requests
    resp = requests.post(
        "https://api.telegram.org/bot%s/sendMessage" % TG_TOKEN,
        json={"chat_id": TG_CHAT, "text": text, "parse_mode": "Markdown"},
        timeout=30,
    )
    print("Telegram:", resp.status_code, resp.text[:200])
    resp.raise_for_status()


if __name__ == "__main__":
    main()
