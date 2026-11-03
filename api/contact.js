'use strict';
const crypto=require('node:crypto');
const {request,upload,botInfo,ready,ownerChat,escapeHTML,issueId,deepLinkToken}=require('../lib/telegram');
const {parseAttachments,MAX_FILES,MAX_SINGLE,MAX_TOTAL}=require('../lib/media');
const trim=v=>typeof v==='string'?v.trim():'';
const json=(res,code,data)=>res.status(code).json(data);
const TOPICS=new Set(['Долги и кредиты','Требования взыскателей','Анализ документов','Другое']);
const CHANNELS=new Set(['any','telegram','phone','email']);
const WINDOWS=new Set(['any','morning','day','evening']);
const PRIORITIES=new Set(['standard','urgent']);
function validContact(value){
  if(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)&&value.length<=160)return true;
  if(/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value))return true;
  if(/^(?:https?:\/\/)?t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}\/?$/i.test(value))return true;
  return /^\+?[0-9\s()\-]{7,35}$/.test(value)&&value.replace(/\D/g,'').length>=7&&value.replace(/\D/g,'').length<=15;
}
async function fetchJson(url,body,timeoutMs=5000){
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),timeoutMs);
  try {const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:ac.signal});
    return {ok:response.ok,data:await response.json().catch(()=>({}))};}
  finally {clearTimeout(timer);}
}
async function checkCaptcha(token,req){
  if(!process.env.TURNSTILE_SECRET_KEY)return true;
  if(!token||token.length>2048)return false;
  try{const {ok,data}=await fetchJson('https://challenges.cloudflare.com/turnstile/v0/siteverify',{secret:process.env.TURNSTILE_SECRET_KEY,response:token,remoteip:trim(req.headers['x-forwarded-for']).split(',')[0]});return ok&&data.success===true;}
  catch{return false;}
}
async function limitRequests(req){
  const root=process.env.UPSTASH_REDIS_REST_URL,key=process.env.UPSTASH_REDIS_REST_TOKEN;
  if(!root||!key)return false;
  const ip=trim(req.headers['x-forwarded-for']||req.headers['x-real-ip']).split(',')[0]||'unknown';
  const hash=crypto.createHmac('sha256',process.env.TELEGRAM_BOT_TOKEN).update(ip).digest('hex').slice(0,40);
  const rateKey='alliam:lead:'+hash+':'+Math.floor(Date.now()/3600000);
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),4000);
  try {const r=await fetch(root.replace(/\/$/,''),{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(['EVAL',"local c=redis.call('INCR',KEYS[1]); if c==1 then redis.call('EXPIRE',KEYS[1],3600) end; return c",1,rateKey]),signal:ac.signal});
    const data=await r.json().catch(()=>({}));return r.ok&&Number(data.result)>5;}
  catch{return false;}finally{clearTimeout(timer);}
}
function requireSameOrigin(req){
  const origin=trim(req.headers.origin),host=trim(req.headers['x-forwarded-host']||req.headers.host);
  if(!origin||!host)return true;
  try{return new URL(origin).host===host;}catch{return false;}
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method==='GET')return json(res,200,{ready:ready(),captchaRequired:!!process.env.TURNSTILE_SECRET_KEY,attachments:{maxFiles:MAX_FILES,maxFileBytes:MAX_SINGLE,maxTotalBytes:MAX_TOTAL},dialogSupported:!!process.env.TELEGRAM_WEBHOOK_SECRET});
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return json(res,405,{error:'Метод не поддерживается.'});}
  if(!ready())return json(res,503,{error:'Получение заявок временно недоступно. Используйте Telegram.'});
  if(!requireSameOrigin(req))return json(res,403,{error:'Источник запроса не разрешён.'});
  if(!/^application\/json\b/i.test(trim(req.headers['content-type'])))return json(res,415,{error:'Ожидается JSON.'});
  if(Number(req.headers['content-length']||0)>4100000)return json(res,413,{error:'Файлы слишком большие. Используйте Telegram для длинного видео.'});
  const b=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
  if(Object.keys(b).length>20)return json(res,400,{error:'Некорректная заявка.'});
  if(trim(b.website))return json(res,200,{ok:true});
  const name=trim(b.name),contact=trim(b.contact),topic=trim(b.topic),message=trim(b.message);
  if(name.length<2||name.length>100||!validContact(contact)||!TOPICS.has(topic)||message.length<10||message.length>2500||b.consent!=='on')return json(res,400,{error:'Проверьте имя, контакт, тему, описание и согласие.'});
  const channel=trim(b.responseMethod)||'any',window=trim(b.contactWindow)||'any',priority=trim(b.priority)||'standard';
  if(!CHANNELS.has(channel)||!WINDOWS.has(window)||!PRIORITIES.has(priority))return json(res,400,{error:'Некорректные параметры связи.'});
  let media;
  try{media=parseAttachments(b.files);}catch(e){return json(res,400,{error:e.message});}
  if(!await checkCaptcha(trim(b.turnstileToken),req))return json(res,400,{error:'Не пройдена проверка безопасности.'});
  if(await limitRequests(req)){res.setHeader('Retry-After','3600');return json(res,429,{error:'Слишком много заявок. Попробуйте позднее.'});}
  const id=issueId();
  const date=new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Warsaw'}).format(new Date());
  const channelLabel={any:'Любой удобный способ',telegram:'Telegram',phone:'Телефон',email:'E-mail'}[channel];
  const windowLabel={any:'В любое время',morning:'Утром',day:'Днём',evening:'Вечером'}[window];
  const pieces=[
    '🟨 <b>НОВАЯ ЗАЯВКА · ALLIAM</b>','🆔 <b>№'+id+'</b>','🕓 '+escapeHTML(date)+' (Варшава)','',
    '👤 <b>Имя:</b> '+escapeHTML(name),'📲 <b>Контакт:</b> '+escapeHTML(contact),
    '📁 <b>Тема:</b> '+escapeHTML(topic),
    '💬 <b>Связаться:</b> '+channelLabel,'⏰ <b>Когда:</b> '+windowLabel,
    '⚡ <b>Приоритет:</b> '+(priority==='urgent'?'Срочный вопрос':'Обычный'),
    '📎 <b>Файлы:</b> '+media.length,'','📝 <b>Обращение:</b>',escapeHTML(message),'',
    '✅ Согласие на обработку указанных данных получено через форму.'
  ];
  const user=contact.match(/^@([A-Za-z][A-Za-z0-9_]{4,31})$/)||contact.match(/^(?:https?:\/\/)?t\.me\/([A-Za-z][A-Za-z0-9_]{4,31})\/?$/i);
  const payload={chat_id:ownerChat(),text:pieces.join('\n'),parse_mode:'HTML',protect_content:true,link_preview_options:{is_disabled:true}};
  if(/^\d+$/.test(String(process.env.TELEGRAM_THREAD_ID||'')))payload.message_thread_id=Number(process.env.TELEGRAM_THREAD_ID);
  if(user)payload.reply_markup={inline_keyboard:[[{text:'Открыть Telegram клиента',url:'https://t.me/'+user[1]}]]};
  try{const sent=await request('sendMessage',payload,10000);if(!sent?.message_id)throw Error('No delivery receipt');}
  catch{return json(res,502,{error:'Telegram не подтвердил отправку заявки. Повторите попытку.'});}
  const results=await Promise.allSettled(media.map((item,i)=>upload(item.kind,item.buffer,item.filename,item.mime,'ALLIAM · '+id+' · '+(i+1)+'/'+media.length+' · '+item.filename)));
  const filesSent=results.filter(x=>x.status==='fulfilled').length;
  let chatLink='';
  if(process.env.TELEGRAM_WEBHOOK_SECRET){
    try{const me=await botInfo();if(me.username)chatLink='https://t.me/'+me.username+'?start='+deepLinkToken(id);}catch{}
  }
  return json(res,200,{ok:true,id,filesSent,filesFailed:media.length-filesSent,chatLink});
};
