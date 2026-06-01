/**
 * Lịch âm Việt Nam — thuật toán Hồ Ngọc Đức (timezone +7), bản port JavaScript.
 * Dùng cho Apps Script để đổi âm <-> dương khi bot trả lời.
 */
var LUNAR_TZ = 7.0;
var CAN = ['Giáp','Ất','Bính','Đinh','Mậu','Kỷ','Canh','Tân','Nhâm','Quý'];
var CHI = ['Tý','Sửu','Dần','Mão','Thìn','Tỵ','Ngọ','Mùi','Thân','Dậu','Tuất','Hợi'];

function INT(x){ return Math.floor(x); }

function jdFromDate(dd, mm, yy){
  var a = INT((14 - mm) / 12);
  var y = yy + 4800 - a;
  var m = mm + 12 * a - 3;
  var jd = dd + INT((153*m+2)/5) + 365*y + INT(y/4) - INT(y/100) + INT(y/400) - 32045;
  if (jd < 2299161) jd = dd + INT((153*m+2)/5) + 365*y + INT(y/4) - 32083;
  return jd;
}

function jdToDate(jd){
  var a, b, c, d, e, m;
  if (jd > 2299160){
    a = jd + 32044; b = INT((4*a+3)/146097); c = a - INT((b*146097)/4);
  } else { b = 0; c = jd + 32082; }
  d = INT((4*c+3)/1461); e = c - INT((1461*d)/4); m = INT((5*e+2)/153);
  var day = e - INT((153*m+2)/5) + 1;
  var month = m + 3 - 12*INT(m/10);
  var year = b*100 + d - 4800 + INT(m/10);
  return [day, month, year];
}

function NewMoon(k){
  var T = k/1236.85, T2 = T*T, T3 = T2*T, dr = Math.PI/180;
  var Jd1 = 2415020.75933 + 29.53058868*k + 0.0001178*T2 - 0.000000155*T3;
  Jd1 = Jd1 + 0.00033*Math.sin((166.56 + 132.87*T - 0.009173*T2)*dr);
  var M = 359.2242 + 29.10535608*k - 0.0000333*T2 - 0.00000347*T3;
  var Mpr = 306.0253 + 385.81691806*k + 0.0107306*T2 + 0.00001236*T3;
  var F = 21.2964 + 390.67050646*k - 0.0016528*T2 - 0.00000239*T3;
  var C1 = (0.1734 - 0.000393*T)*Math.sin(M*dr) + 0.0021*Math.sin(2*dr*M);
  C1 = C1 - 0.4068*Math.sin(Mpr*dr) + 0.0161*Math.sin(dr*2*Mpr);
  C1 = C1 - 0.0004*Math.sin(dr*3*Mpr);
  C1 = C1 + 0.0104*Math.sin(dr*2*F) - 0.0051*Math.sin(dr*(M+Mpr));
  C1 = C1 - 0.0074*Math.sin(dr*(M-Mpr)) + 0.0004*Math.sin(dr*(2*F+M));
  C1 = C1 - 0.0004*Math.sin(dr*(2*F-M)) - 0.0006*Math.sin(dr*(2*F+Mpr));
  C1 = C1 + 0.0010*Math.sin(dr*(2*F-Mpr)) + 0.0005*Math.sin(dr*(2*Mpr+M));
  var deltat;
  if (T < -11) deltat = 0.001 + 0.000839*T + 0.0002261*T2 - 0.00000845*T3 - 0.000000081*T*T3;
  else deltat = -0.000278 + 0.000265*T + 0.000262*T2;
  return Jd1 + C1 - deltat;
}

function SunLongitude(jdn){
  var T = (jdn - 2451545.0)/36525, T2 = T*T, dr = Math.PI/180;
  var M = 357.52910 + 35999.05030*T - 0.0001559*T2 - 0.00000048*T*T2;
  var L0 = 280.46645 + 36000.76983*T + 0.0003032*T2;
  var DL = (1.914600 - 0.004817*T - 0.000014*T2)*Math.sin(dr*M);
  DL = DL + (0.019993 - 0.000101*T)*Math.sin(dr*2*M) + 0.000290*Math.sin(dr*3*M);
  var L = L0 + DL; L = L*dr; L = L - Math.PI*2*INT(L/(Math.PI*2));
  return L;
}

function getNewMoonDay(k, tz){ return INT(NewMoon(k) + 0.5 + tz/24); }
function getSunLongitude(dn, tz){ return INT(SunLongitude(dn - 0.5 - tz/24)/Math.PI*6); }

function getLunarMonth11(yy, tz){
  var off = jdFromDate(31,12,yy) - 2415021;
  var k = INT(off/29.530588853);
  var nm = getNewMoonDay(k, tz);
  if (getSunLongitude(nm, tz) >= 9) nm = getNewMoonDay(k-1, tz);
  return nm;
}

function getLeapMonthOffset(a11, tz){
  var k = INT((a11 - 2415021.076998695)/29.530588853 + 0.5);
  var i = 1, arc = getSunLongitude(getNewMoonDay(k+i, tz), tz), last;
  do { last = arc; i++; arc = getSunLongitude(getNewMoonDay(k+i, tz), tz); }
  while (arc != last && i < 14);
  return i - 1;
}

/** (dd,mm,yy) dương -> [ngày_âm, tháng_âm, năm_âm, nhuận]. */
function solar2lunar(dd, mm, yy, tz){
  tz = tz || LUNAR_TZ;
  var dayNumber = jdFromDate(dd, mm, yy);
  var k = INT((dayNumber - 2415021.076998695)/29.530588853);
  var monthStart = getNewMoonDay(k+1, tz);
  if (monthStart > dayNumber) monthStart = getNewMoonDay(k, tz);
  var a11 = getLunarMonth11(yy, tz), b11 = a11, lunarYear;
  if (a11 >= monthStart){ lunarYear = yy; a11 = getLunarMonth11(yy-1, tz); }
  else { lunarYear = yy+1; b11 = getLunarMonth11(yy+1, tz); }
  var lunarDay = dayNumber - monthStart + 1;
  var diff = INT((monthStart - a11)/29);
  var lunarLeap = 0, lunarMonth = diff + 11;
  if (b11 - a11 > 365){
    var lo = getLeapMonthOffset(a11, tz);
    if (diff >= lo){ lunarMonth = diff + 10; if (diff == lo) lunarLeap = 1; }
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
  return [lunarDay, lunarMonth, lunarYear, lunarLeap];
}

/** (ngày,tháng,năm) âm -> [dd,mm,yy] dương, hoặc [0,0,0] nếu không hợp lệ. */
function lunar2solar(lDay, lMonth, lYear, lLeap, tz){
  tz = tz || LUNAR_TZ; lLeap = lLeap || 0;
  var a11, b11;
  if (lMonth < 11){ a11 = getLunarMonth11(lYear-1, tz); b11 = getLunarMonth11(lYear, tz); }
  else { a11 = getLunarMonth11(lYear, tz); b11 = getLunarMonth11(lYear+1, tz); }
  var k = INT(0.5 + (a11 - 2415021.076998695)/29.530588853);
  var off = lMonth - 11; if (off < 0) off += 12;
  if (b11 - a11 > 365){
    var lo = getLeapMonthOffset(a11, tz);
    var leapMonth = lo - 2; if (leapMonth < 0) leapMonth += 12;
    if (lLeap != 0 && lMonth != leapMonth) return [0,0,0];
    else if (lLeap != 0 || off >= lo) off += 1;
  }
  var monthStart = getNewMoonDay(k + off, tz);
  return jdToDate(monthStart + lDay - 1);
}

function canChiNam(lYear){ return CAN[(lYear+6)%10] + ' ' + CHI[(lYear+8)%12]; }

/** Tìm ngày dương sắp tới (>= today) cho 1 sự kiện lặp. Trả về Date. */
function nextOccurrence(ev, today){
  var t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (ev.kind === 'solar'){
    for (var y = t.getFullYear(); y <= t.getFullYear()+1; y++){
      var d = new Date(y, ev.month-1, ev.day);
      if (d >= t) return d;
    }
  } else { // lunar (hằng năm) hoặc monthly
    var max = ev.kind === 'monthly' ? 70 : 420;
    for (var i = 0; i < max; i++){
      var dd = new Date(t.getTime() + i*86400000);
      var lu = solar2lunar(dd.getDate(), dd.getMonth()+1, dd.getFullYear());
      if (lu[0] === ev.day && (ev.kind === 'monthly' || lu[1] === ev.month)) return dd;
    }
  }
  return null;
}
