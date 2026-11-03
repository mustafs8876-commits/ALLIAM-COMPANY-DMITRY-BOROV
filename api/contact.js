'use strict';
// ALLIAM · server-side Telegram form endpoint (Vercel Node.js Function).
// Do NOT put TELEGRAM_BOT_TOKEN into public frontend files.
const crypto = require('node:crypto');
const trim = v => typeof v === 'string' ? v.trim() : '';
const chatId = () => trim(process.env.TELEGRAM_CHAT_ID) || '5675498860';
const isReady = () => !!(process.env.TELEGRAM_BOT_TOKEN && chatId());
const json = (res, code, data) => res.status(code).json(data);
const esc = s => s.replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const topics = new Set(['Долги и кредиты','Требования взыскателей','Анализ документов','Другое']);
function contactIsValid(s) {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 160) return true;
  if (/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(s)) return true;
  if (/^(?:https?:\/\/)?t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}\/?$/i.test(s)) return true;
  return /^\+?[0-9\s()\-]{7,35}$/.test(s) && s.replace(/\D/g,'').length >= 7 && s.replace(/\D/g,'').length <= 15;
}
async function fetchJson(url, options, timeoutMs=8000) {
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {...options, signal:controller.signal});
    let data={};
    try{data=await res.json()}catch{}
    return {res, data};
  } finally {clearTimeout(timeout)}
}
async function checkTurnstile(token, req) {
  if (!process.env.TURNSTILE_SECRET_KEY) return true;
  if (!token || token.length > 2048) return false;
  try {
    const {res,data} = await fetchJson('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({secret:process.env.TURNSTILE_SECRET_KEY,response:token,
        remoteip:trim(req.headers['x-forwarded-for']).split(',')[0]})
    });
    return res.ok && data.success === true;
  } catch {return false}
}
async function isRateLimited(req) {
  const base=process.env.UPSTASH_REDIS_REST_URL, token=process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!base || !token) return false;
  const ip=trim(req.headers['x-forwarded-for']||req.headers['x-real-ip']).split(',')[0] || 'unknown';
  const digest=crypto.createHmac('sha256', process.env.TELEGRAM_BOT_TOKEN).update(ip).digest('hex').slice(0,40);
  const key='alliam:contact:'+digest+':'+Math.floor(Date.now()/3600000);
  try {
    const {res,data} = await fetchJson(base.replace(/\/$/,''), {
      method:'POST',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify(['EVAL',
        "local c=redis.call('INCR',KEYS[1]); if c==1 then redis.call('EXPIRE',KEYS[1],3600) end; return c",
        1,key])
    },4000);
    return res.ok && Number(data.result)>5;
  } catch {return false}
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  if (req.method === 'GET') {
    return json(res,200,{ready:isReady(),captchaRequired:!!process.env.TURNSTILE_SECRET_KEY});
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow','GET, POST');
    return json(res,405,{error:'Метод не поддерживается.'});
  }
  if (!isReady()) return json(res,503,{error:'Telegram ещё не подключён. Обратитесь напрямую.'});
  if (!/^application\/json\b/i.test(trim(req.headers['content-type']))) {
    return json(res,415,{error:'Неверный формат запроса.'});
  }
  const origin=trim(req.headers.origin), host=trim(req.headers['x-forwarded-host'] || req.headers.host);
  if (origin && host) {
    try {if (new URL(origin).host !== host) return json(res,403,{error:'Источник запроса не разрешён.'});}
    catch {return json(res,403,{error:'Источник запроса не разрешён.'});}
  }
  if (Number(req.headers['content-length']||0)>15000) return json(res,413,{error:'Обращение слишком длинное.'});
  const body=req.body && typeof req.body==='object' && !Array.isArray(req.body) ? req.body : {};
  if (Object.keys(body).length>12) return json(res,400,{error:'Неверный запрос.'});
  if (trim(body.website)) return json(res,200,{ok:true});
  const name=trim(body.name), contact=trim(body.contact), topic=trim(body.topic), message=trim(body.message);
  if (name.length<2 || name.length>100 || !contactIsValid(contact) || !topics.has(topic)
      || message.length<10 || message.length>2500 || body.consent!=='on') {
    return json(res,400,{error:'Проверьте имя, контакт, тему, описание и согласие.'});
  }
  if (!await checkTurnstile(trim(body.turnstileToken),req)) return json(res,400,{error:'Проверка безопасности не пройдена.'});
  if (await isRateLimited(req)) {
    res.setHeader('Retry-After','3600');
    return json(res,429,{error:'Слишком много обращений. Попробуйте позднее.'});
  }
  const id=crypto.randomBytes(5).toString('hex').toUpperCase();
  const dt=new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Warsaw'}).format(new Date());
  const messageText=[
    '🔔 <b>НОВАЯ ЗАЯВКА · ALLIAM</b>',
    '🆔 Номер: <code>'+id+'</code>',
    '🕒 '+esc(dt)+' (Варшава)','',
    '👤 <b>Имя:</b> '+esc(name),
    '📲 <b>Контакт:</b> '+esc(contact),
    '📁 <b>Тема:</b> '+esc(topic),'',
    '📝 <b>Описание ситуации:</b>',esc(message),'',
    '✅ Согласие на обработку данных получено через форму сайта.'
  ].join('\n');
  const payload={chat_id:chatId(),text:messageText,parse_mode:'HTML',
    protect_content:true,link_preview_options:{is_disabled:true}};
  if (/^\d+$/.test(trim(process.env.TELEGRAM_THREAD_ID))) payload.message_thread_id=Number(process.env.TELEGRAM_THREAD_ID);
  const uname=contact.match(/^@([A-Za-z][A-Za-z0-9_]{4,31})$/) ||
    contact.match(/^(?:https?:\/\/)?t\.me\/([A-Za-z][A-Za-z0-9_]{4,31})\/?$/i);
  if (uname) payload.reply_markup={inline_keyboard:[[{text:'Написать в Telegram',url:'https://t.me/'+uname[1]}]]};
  try {
    const {res:tg,data} = await fetchJson(
      'https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/sendMessage',
      {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)},10000
    );
    if (tg.ok && data.ok === true && data.result && data.result.message_id) {
      return json(res,200,{ok:true,id});
    }
  } catch {}
  return json(res,502,{error:'Telegram не подтвердил доставку. Данные сохранены в форме, попробуйте повторить.'});
};
