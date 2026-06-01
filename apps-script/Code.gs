/**
 * Bot chat AI — quản lý lịch nhắc gia đình bằng tiếng Việt qua Telegram.
 *
 * Nhắn "thêm giỗ ông nội 20/8 âm, mất 1985" -> Claude tách dữ liệu -> ghi vào
 * tab "Ngày của tôi". Hỏi "tháng này có giỗ ai" -> đọc Sheet trả lời.
 *
 * CÀI ĐẶT (Project Settings -> Script properties):
 *   TELEGRAM_BOT_TOKEN   token bot Telegram (BotFather)            [bắt buộc]
 *   ALLOWED_CHAT_ID      chat_id của bạn -> chỉ mình bạn dùng được [nên có]
 *   --- chọn 1 trong 2 nhà cung cấp AI ---
 *   OPENAI_API_KEY       API key OpenAI (platform.openai.com)
 *   ANTHROPIC_API_KEY    API key Claude (console.anthropic.com)
 *   AI_PROVIDER          'openai' hoặc 'claude' (tùy chọn; tự đoán theo key đang có)
 * Rồi: Deploy -> New deployment -> Web app -> Execute as: Me, Who has access:
 * Anyone -> Deploy. Sau đó chạy hàm setWebhook() 1 lần.
 */

var SHEET_ID = '1RQkkjYbg9x2evjpAnlL0pfBQiN6YUuD9-MPD1cHaW9I';
var SHEET_NAME = 'Ngày của tôi';
var OPENAI_MODEL = 'gpt-4o-mini';                  // rẻ, nhanh, hỗ trợ function calling
var CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

// Cột (1-based) trong tab "Ngày của tôi"
var COL = { on:1, name:2, loai:3, lap:4, day:5, month:6, amduong:7, base:8, remind:9, note:10 };

function prop(k){ return PropertiesService.getScriptProperties().getProperty(k) || ''; }
function sheet_(){ return SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME); }

function stripAccents(s){
  return (s||'').toString().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/đ/g,'d').trim();
}

// ---------------- Webhook Telegram ----------------
function doGet(){ return ContentService.createTextOutput('Bot lịch âm đang chạy ✓'); }

function doPost(e){
  var update;
  try { update = JSON.parse(e.postData.contents); }
  catch (err){ return ContentService.createTextOutput(''); }

  // ----- Chống xử lý TRÙNG khi Telegram gửi lại cùng một update -----
  // Đánh dấu trước để các bản gửi lại không xử lý đôi; nếu xử lý LỖI thì gỡ
  // dấu để Telegram thử lại (tránh mất câu trả lời khi gặp trục trặc tạm thời).
  var id = String(update.update_id || '');
  var cache = CacheService.getScriptCache();
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err){ return ContentService.createTextOutput(''); }
  var dup = false;
  try {
    if (id && cache.get('u_' + id)) dup = true;
    else if (id) cache.put('u_' + id, '1', 600);
  } finally { lock.releaseLock(); }
  if (dup) return ContentService.createTextOutput('');

  try {
    var msg = update.message || update.edited_message;
    if (!msg || !msg.text) return ContentService.createTextOutput('');
    var chatId = msg.chat.id.toString();
    var text = msg.text.trim();

    var allowed = prop('ALLOWED_CHAT_ID');
    if (allowed && chatId !== allowed){
      tgSend(chatId, 'Xin lỗi, bạn không có quyền dùng bot này.');
      return ContentService.createTextOutput('');
    }

    if (text === '/start' || text === '/help'){
      tgSend(chatId, helpText());
      return ContentService.createTextOutput('');
    }

    handleMessage(chatId, text);
  } catch (err){
    if (id) cache.remove('u_' + id);   // lỗi -> cho phép Telegram thử lại
  }
  return ContentService.createTextOutput('');
}

function helpText(){
  return '👋 *Bot Lịch Nhắc Gia Đình*\n\n' +
    'Cứ nhắn tự nhiên, mình tự ghi vào Google Sheet:\n' +
    '• _“thêm giỗ ông nội 20 tháng 8 âm, mất năm 1985”_\n' +
    '• _“sinh nhật mẹ 12/5 dương, sinh 1958, nhắc trước 7 và 1 ngày”_\n' +
    '• _“đổi giỗ bà ngoại sang mùng 7 tháng 3 âm”_\n' +
    '• _“xóa kỷ niệm cưới”_ · _“tắt nhắc sinh nhật bố”_\n' +
    '• _“tháng này nhà mình có giỗ ai?”_ · _“sắp tới có gì?”_';
}

// ---------------- Xử lý 1 tin nhắn ----------------
function handleMessage(chatId, text){
  var events = readEvents();
  var result = callLLM(text, events);

  if (result.tool){
    var reply;
    var t = result.tool, inp = result.input || {};
    if (t === 'add_event') reply = doAdd(inp);
    else if (t === 'update_event') reply = doUpdate(inp, events);
    else if (t === 'delete_event') reply = doDelete(inp, events);
    else if (t === 'set_enabled') reply = doSetEnabled(inp, events);
    else reply = 'Mình chưa hiểu thao tác này.';
    tgSend(chatId, reply);
  } else {
    tgSend(chatId, result.text || 'Mình chưa rõ ý bạn, thử nói cụ thể hơn nhé.');
  }
}

// ---------------- Gọi AI (OpenAI hoặc Claude) ----------------
function buildSystem(events){
  var today = new Date();
  var ctx = events.length
    ? events.map(function(ev){
        return '- ' + ev.name + ' (' + ev.loai + ', ' + ev.lap + ', ' +
               ev.day + (ev.month ? '/' + ev.month : '') + ' ' + ev.amduong +
               (ev.base ? ', năm gốc ' + ev.base : '') +
               (ev.on ? '' : ' [đang tắt]') + ')';
      }).join('\n')
    : '(chưa có ngày nào)';
  return 'Bạn là trợ lý quản lý lịch nhắc gia đình của người Việt, ghi dữ liệu vào Google Sheet.\n' +
    'Hôm nay: ' + today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate() + ' (dương lịch).\n' +
    'Danh sách ngày hiện có (tab "Ngày của tôi"):\n' + ctx + '\n\n' +
    'QUY TẮC:\n' +
    '- Khi người dùng muốn THÊM/SỬA/XÓA/BẬT-TẮT một ngày: gọi đúng tool/function tương ứng.\n' +
    '- Khi người dùng HỎI hoặc trò chuyện: trả lời bằng tiếng Việt, ngắn gọn, KHÔNG gọi tool.\n' +
    '- Mặc định âm/dương theo phân loại: giỗ -> "Âm", sinh nhật -> "Dương", nếu người dùng không nói rõ.\n' +
    '- "lap" mặc định "Hằng năm". Mùng 1 / ngày Rằm thì "Hằng tháng" và bỏ trống tháng.\n' +
    '- Sự kiện chỉ xảy ra MỘT LẦN rồi thôi (đi lễ, hẹn, sự kiện có ngày cụ thể) -> lap "Một lần" và base_year = NĂM diễn ra. Nếu người dùng không nói năm, suy ra năm sắp tới gần nhất so với hôm nay.\n' +
    '- "remind" là chuỗi số ngày cách nhau dấu phẩy, ví dụ "7,3,1,0". Nếu người dùng không nói, bỏ trống.\n' +
    '- Để sửa/xóa/bật-tắt, dùng "match_name" khớp gần đúng với tên đang có ở trên.';
}

function toolDefs(){
  return [
    { name:'add_event', description:'Thêm một ngày mới (giỗ, sinh nhật, kỷ niệm...) vào Sheet.',
      input_schema:{ type:'object', properties:{
        name:{type:'string', description:'Tên sự kiện, vd "Giỗ ông nội"'},
        loai:{type:'string', enum:['giỗ','sinh nhật','kỷ niệm','lễ','khác']},
        day:{type:'integer'}, month:{type:'integer', description:'Bỏ trống nếu lặp Hằng tháng'},
        amduong:{type:'string', enum:['Âm','Dương']},
        lap:{type:'string', enum:['Hằng năm','Hằng tháng','Một lần']},
        base_year:{type:'integer', description:'Năm mất/năm sinh; với Lặp "Một lần" thì là NĂM diễn ra sự kiện'},
        remind:{type:'string', description:'vd "7,3,1,0" (tùy chọn)'},
        note:{type:'string'}
      }, required:['name','loai','day'] } },
    { name:'update_event', description:'Sửa một ngày đã có (khớp theo match_name).',
      input_schema:{ type:'object', properties:{
        match_name:{type:'string'},
        name:{type:'string'}, loai:{type:'string'}, day:{type:'integer'}, month:{type:'integer'},
        amduong:{type:'string', enum:['Âm','Dương']}, lap:{type:'string'},
        base_year:{type:'integer'}, remind:{type:'string'}, note:{type:'string'}
      }, required:['match_name'] } },
    { name:'delete_event', description:'Xóa một ngày (khớp theo match_name).',
      input_schema:{ type:'object', properties:{ match_name:{type:'string'} }, required:['match_name'] } },
    { name:'set_enabled', description:'Bật hoặc tắt nhắc một ngày.',
      input_schema:{ type:'object', properties:{
        match_name:{type:'string'}, enabled:{type:'boolean'} }, required:['match_name','enabled'] } }
  ];
}

function callLLM(userText, events){
  var system = buildSystem(events), tools = toolDefs();
  var provider = prop('AI_PROVIDER') || (prop('OPENAI_API_KEY') ? 'openai' : 'claude');
  return provider === 'claude'
    ? callClaude(system, userText, tools)
    : callOpenAI(system, userText, tools);
}

function callOpenAI(system, userText, tools){
  var oaTools = tools.map(function(t){
    return { type:'function', function:{ name:t.name, description:t.description, parameters:t.input_schema } };
  });
  var payload = {
    model: OPENAI_MODEL, max_tokens: 1024, tool_choice:'auto', tools: oaTools,
    messages: [{ role:'system', content: system }, { role:'user', content: userText }]
  };
  var res = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method:'post', contentType:'application/json',
    headers:{ Authorization: 'Bearer ' + prop('OPENAI_API_KEY') },
    payload: JSON.stringify(payload), muteHttpExceptions:true
  });
  var data = JSON.parse(res.getContentText());
  if (!data.choices) return { text:'Lỗi gọi OpenAI: ' + res.getContentText().slice(0,160) };
  var m = data.choices[0].message;
  if (m.tool_calls && m.tool_calls.length){
    var tc = m.tool_calls[0];
    var args = {}; try { args = JSON.parse(tc.function.arguments || '{}'); } catch(e){}
    return { tool: tc.function.name, input: args };
  }
  return { text: m.content || '' };
}

function callClaude(system, userText, tools){
  var payload = {
    model: CLAUDE_MODEL, max_tokens: 1024, system: system, tools: tools,
    messages: [{ role:'user', content: userText }]
  };
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method:'post', contentType:'application/json',
    headers:{ 'x-api-key': prop('ANTHROPIC_API_KEY'), 'anthropic-version':'2023-06-01' },
    payload: JSON.stringify(payload), muteHttpExceptions:true
  });
  var data = JSON.parse(res.getContentText());
  if (!data.content) return { text:'Lỗi gọi Claude: ' + res.getContentText().slice(0,160) };
  var textOut = '';
  for (var i=0; i<data.content.length; i++){
    var b = data.content[i];
    if (b.type === 'tool_use') return { tool:b.name, input:b.input };
    if (b.type === 'text') textOut += b.text;
  }
  return { text: textOut };
}

// ---------------- Đọc / ghi Sheet ----------------
function readEvents(){
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last-1, 10).getValues();
  var out = [];
  for (var i=0; i<vals.length; i++){
    var r = vals[i], name = (r[COL.name-1]||'').toString().trim();
    if (!name || name.charAt(0) === '(') continue;
    var lap = (r[COL.lap-1]||'').toString(), amduong = (r[COL.amduong-1]||'').toString();
    var sl = stripAccents(lap);
    var kind = sl.indexOf('thang') >= 0 ? 'monthly'
             : (sl.indexOf('mot lan') >= 0 || sl.indexOf('1 lan') >= 0)
                 ? (stripAccents(amduong) === 'am' ? 'once_lunar' : 'once_solar')
                 : (stripAccents(amduong) === 'am' ? 'lunar' : 'solar');
    out.push({
      row: i+2, on: r[COL.on-1] === true || stripAccents(r[COL.on-1]) === 'x' || stripAccents(r[COL.on-1])==='true',
      name:name, loai:(r[COL.loai-1]||'').toString(), lap:lap,
      day:parseInt(r[COL.day-1],10), month:parseInt(r[COL.month-1],10) || null,
      amduong:amduong, base:parseInt(r[COL.base-1],10) || null,
      remind:(r[COL.remind-1]||'').toString(), kind:kind
    });
  }
  return out;
}

function findWriteRow(sh){
  var last = sh.getLastRow();
  for (var r=2; r<=last; r++){
    var nm = (sh.getRange(r, COL.name).getValue()||'').toString().trim();
    if (!nm || nm.charAt(0) === '(') return r;
  }
  return last + 1;
}

function resolveAmDuong(loai, amduong){
  if (amduong === 'Âm' || amduong === 'Dương') return amduong;
  return stripAccents(loai).indexOf('gio') >= 0 ? 'Âm' : 'Dương';
}

function doAdd(inp){
  var sh = sheet_();
  var row = findWriteRow(sh);
  var amduong = resolveAmDuong(inp.loai, inp.amduong);
  var lap = inp.lap || 'Hằng năm';
  sh.getRange(row, COL.on).setValue(true);
  sh.getRange(row, COL.name).setValue(inp.name);
  sh.getRange(row, COL.loai).setValue(inp.loai || 'khác');
  sh.getRange(row, COL.lap).setValue(lap);
  sh.getRange(row, COL.day).setValue(inp.day);
  sh.getRange(row, COL.month).setValue(stripAccents(lap).indexOf('thang')>=0 ? '' : (inp.month||''));
  sh.getRange(row, COL.amduong).setValue(amduong);
  sh.getRange(row, COL.base).setValue(inp.base_year || '');
  sh.getRange(row, COL.remind).setNumberFormat('@').setValue(inp.remind || '');
  sh.getRange(row, COL.note).setValue(inp.note || '');

  var slap = stripAccents(lap);
  var okind = slap.indexOf('thang')>=0 ? 'monthly'
            : (slap.indexOf('mot lan')>=0 || slap.indexOf('1 lan')>=0)
                ? (amduong==='Âm'?'once_lunar':'once_solar')
                : (amduong==='Âm'?'lunar':'solar');
  var when = occurrenceText({ kind: okind, day: inp.day, month: inp.month, year: inp.base_year });
  return '✅ Đã thêm *' + inp.name + '*\n' +
    '   ' + (inp.day) + (inp.month?('/'+inp.month):'') + ' ' + amduong +
    (inp.base_year?(' · năm gốc '+inp.base_year):'') +
    '\n   Nhắc trước: ' + (inp.remind || '7,3,1,0 (mặc định)') + when;
}

function matchRow(events, matchName){
  var key = stripAccents(matchName);
  var hit = null;
  for (var i=0; i<events.length; i++){
    var n = stripAccents(events[i].name);
    if (n === key) return events[i];
    if (n.indexOf(key) >= 0 || key.indexOf(n) >= 0) hit = hit || events[i];
  }
  return hit;
}

function doUpdate(inp, events){
  var ev = matchRow(events, inp.match_name);
  if (!ev) return '❓ Không tìm thấy ngày nào khớp "' + inp.match_name + '".';
  var sh = sheet_(), row = ev.row;
  if (inp.name != null) sh.getRange(row, COL.name).setValue(inp.name);
  if (inp.loai != null) sh.getRange(row, COL.loai).setValue(inp.loai);
  if (inp.lap != null) sh.getRange(row, COL.lap).setValue(inp.lap);
  if (inp.day != null) sh.getRange(row, COL.day).setValue(inp.day);
  if (inp.month != null) sh.getRange(row, COL.month).setValue(inp.month);
  if (inp.amduong != null) sh.getRange(row, COL.amduong).setValue(inp.amduong);
  if (inp.base_year != null) sh.getRange(row, COL.base).setValue(inp.base_year);
  if (inp.remind != null) sh.getRange(row, COL.remind).setNumberFormat('@').setValue(inp.remind);
  if (inp.note != null) sh.getRange(row, COL.note).setValue(inp.note);
  return '✏️ Đã cập nhật *' + (inp.name || ev.name) + '*.';
}

function doDelete(inp, events){
  var ev = matchRow(events, inp.match_name);
  if (!ev) return '❓ Không tìm thấy ngày nào khớp "' + inp.match_name + '".';
  sheet_().deleteRow(ev.row);
  return '🗑 Đã xóa *' + ev.name + '*.';
}

function doSetEnabled(inp, events){
  var ev = matchRow(events, inp.match_name);
  if (!ev) return '❓ Không tìm thấy ngày nào khớp "' + inp.match_name + '".';
  sheet_().getRange(ev.row, COL.on).setValue(!!inp.enabled);
  return (inp.enabled ? '🔔 Đã BẬT nhắc *' : '🔕 Đã TẮT nhắc *') + ev.name + '*.';
}

function occurrenceText(ev){
  try {
    var occ;
    if (ev.kind === 'once_solar' || ev.kind === 'once_lunar'){
      if (!ev.year || !ev.day || !ev.month) return '';
      if (ev.kind === 'once_solar'){ occ = new Date(ev.year, ev.month-1, ev.day); }
      else { var s = lunar2solar(ev.day, ev.month, ev.year); if (s[0]===0) return ''; occ = new Date(s[2], s[1]-1, s[0]); }
    } else {
      if (!ev.day || (ev.kind !== 'monthly' && !ev.month)) return '';
      occ = nextOccurrence(ev, new Date());
    }
    if (!occ) return '';
    var dd = ('0'+occ.getDate()).slice(-2), mm = ('0'+(occ.getMonth()+1)).slice(-2);
    return '\n   ➜ Lần tới: ' + dd + '/' + mm + '/' + occ.getFullYear() + ' (dương)';
  } catch (e){ return ''; }
}

// ---------------- Telegram gửi tin ----------------
function tgSend(chatId, text){
  UrlFetchApp.fetch('https://api.telegram.org/bot' + prop('TELEGRAM_BOT_TOKEN') + '/sendMessage', {
    method:'post', contentType:'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: text, parse_mode:'Markdown' }),
    muteHttpExceptions:true
  });
}

// ---------------- Chạy 1 lần để đăng ký webhook ----------------
function setWebhook(){
  var url = ScriptApp.getService().getUrl();
  var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + prop('TELEGRAM_BOT_TOKEN') +
    '/setWebhook?url=' + encodeURIComponent(url), { muteHttpExceptions:true });
  Logger.log(r.getContentText());
}
function deleteWebhook(){
  UrlFetchApp.fetch('https://api.telegram.org/bot' + prop('TELEGRAM_BOT_TOKEN') + '/deleteWebhook');
}
function getWebhookInfo(){
  Logger.log(UrlFetchApp.fetch('https://api.telegram.org/bot' + prop('TELEGRAM_BOT_TOKEN') + '/getWebhookInfo').getContentText());
}
