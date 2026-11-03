'use strict';
const crypto = require('node:crypto');
const ownerChat = () => String(process.env.TELEGRAM_CHAT_ID || '5675498860').trim();
const ownerUser = () => String(process.env.TELEGRAM_ADMIN_ID || '5675498860').trim();
const ready = () => Boolean(process.env.TELEGRAM_BOT_TOKEN && ownerChat());
const escapeHTML = v => String(v || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let meCache;
async function request(method, payload={}, timeout=9000) {
  if (!ready()) throw Error('Telegram bot not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/'+method, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload), signal:controller.signal
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true) throw Error('Telegram '+method+' rejected request ('+response.status+')');
    return result.result;
  } finally { clearTimeout(timer); }
}
async function upload(kind, buffer, filename, mime, caption) {
  if (!ready()) throw Error('Telegram bot not configured');
  const field = kind === 'photo' ? 'photo' : kind === 'video' ? 'video' : 'document';
  const method = kind === 'photo' ? 'sendPhoto' : kind === 'video' ? 'sendVideo' : 'sendDocument';
  const body = new FormData();
  body.set('chat_id', ownerChat());
  body.set('protect_content','true');
  body.set('caption',String(caption).slice(0,900));
  if (/^\d+$/.test(String(process.env.TELEGRAM_THREAD_ID || ''))) body.set('message_thread_id',String(process.env.TELEGRAM_THREAD_ID));
  body.set(field,new Blob([buffer],{type:mime}),filename);
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),12000);
  try {
    const response = await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/'+method,{method:'POST',body,signal:controller.signal});
    const result = await response.json().catch(()=>({}));
    if (!response.ok || result.ok !== true || !result.result?.message_id) throw Error('Telegram attachment delivery failed');
    return result.result;
  } finally {clearTimeout(timer);}
}
async function botInfo() {
  if(meCache && meCache.expires>Date.now()) return meCache.bot;
  const bot=await request('getMe',{},6000);
  meCache={bot,expires:Date.now()+3600000};
  return bot;
}
const issueId=()=>crypto.randomBytes(6).toString('hex').toUpperCase();
const signIssue=id=>crypto.createHmac('sha256',process.env.TELEGRAM_BOT_TOKEN).update('ALLIAM|'+id).digest('base64url').slice(0,16);
function deepLinkToken(id){return id+'_'+signIssue(id);}
function verifyToken(token){
  const m=/^([A-F0-9]{12})_([A-Za-z0-9_-]{16})$/.exec(String(token||''));
  if(!m || !ready()) return null;
  const actual=Buffer.from(m[2]), expected=Buffer.from(signIssue(m[1]));
  return actual.length===expected.length && crypto.timingSafeEqual(actual,expected) ? m[1] : null;
}
module.exports={request,upload,botInfo,ready,ownerChat,ownerUser,escapeHTML,issueId,deepLinkToken,verifyToken};
