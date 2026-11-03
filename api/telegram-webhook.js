'use strict';
const crypto=require('node:crypto');
const {request,ownerChat,ownerUser,escapeHTML,verifyToken,ready}=require('../lib/telegram');
const response=(res,code,data)=>res.status(code).json(data);
let recent=new Set();
const adminKeyboard=id=>({inline_keyboard:[
  [{text:'⏳ В работе',callback_data:'status|'+id+'|work'},{text:'✅ Закрыто',callback_data:'status|'+id+'|closed'}],
  [{text:'📄 Запросить детали',callback_data:'template|'+id+'|details'},{text:'📞 Свяжусь позже',callback_data:'template|'+id+'|later'}]
]});
const adminId=()=>String(ownerUser());
const isAdmin=from=>String(from?.id||'')===adminId();
const clientFromReply=msg=>{
  if(!msg?.reply_to_message?.from?.is_bot)return null;
  const m=String(msg.reply_to_message.text||msg.reply_to_message.caption||'').match(/Клиент ID:\s*(\d{3,16})/);
  return m?m[1]:null;
};
const mediaMessage=msg=>Boolean(msg.photo||msg.video||msg.document||msg.voice||msg.audio||msg.video_note||msg.animation);
async function botSend(to,text,extra={}){
  return request('sendMessage',{chat_id:to,text,parse_mode:'HTML',link_preview_options:{is_disabled:true},...extra});
}
async function notifyOwner(user,body,extra={}){
  const userId=String(user.id);
  const name=[user.first_name,user.last_name].filter(Boolean).join(' ').slice(0,100)||'Клиент';
  const header='🟣 <b>ALLIAM · сообщение клиента</b>\nКлиент ID: '+userId+'\n👤 '+escapeHTML(name)+'\n'+body+'\n\n↩️ Ответьте на ЭТО сообщение, чтобы написать клиенту.';
  return botSend(ownerChat(),header,{reply_markup:adminKeyboard(userId),...extra});
}
async function adminReply(msg){
  const recipient=clientFromReply(msg);
  if(!recipient)return false;
  if(recipient===adminId())return true;
  try{
    if(mediaMessage(msg)){
      await request('copyMessage',{chat_id:recipient,from_chat_id:msg.chat.id,message_id:msg.message_id});
    } else if(typeof msg.text==='string' && !msg.text.startsWith('/')){
      await botSend(recipient,'💬 <b>Ответ специалиста ALLIAM</b>\n\n'+escapeHTML(msg.text.slice(0,3400)));
    } else return false;
    await botSend(ownerChat(),'✅ Ответ доставлен клиенту.');
  }catch{await botSend(ownerChat(),'⚠️ Клиент пока недоступен. Возможно, он заблокировал бота.');}
  return true;
}
async function handleAdmin(msg){
  if(await adminReply(msg))return;
  const command=String(msg.text||'').split(' ')[0].toLowerCase();
  if(command==='/start'||command==='/help'||command==='/admin'){
    return botSend(ownerChat(),'👋 <b>Панель ALLIAM</b>\n\nСюда приходят заявки с сайта.\n\nЧтобы ответить клиенту, он должен открыть чат с ботом по ссылке после отправки заявки. После этого вы получите сообщение с «Клиент ID». Ответьте на него текстом, фото или видео.\n\nПод сообщением доступны кнопки статуса и готовых ответов.\n\nБольшие видео клиенты могут присылать напрямую в этот бот.');
  }
}
async function handleClient(msg){
  const id=String(msg.from.id);
  const content=String(msg.text||msg.caption||'').trim();
  if(content.startsWith('/start')){
    const token=content.split(/\s+/)[1]||'';
    const issue=verifyToken(token);
    if(issue){
      await botSend(id,'✅ <b>ALLIAM · заявка №'+issue+'</b>\n\nДиалог подключён! Теперь вы можете написать специалисту, отправить фотографии, документы или видео прямо в этот чат. Ответ придёт сюда.\n\nНе отправляйте пароли, коды подтверждения или номера банковских карт.');
      await notifyOwner(msg.from,'🆔 Заявка №<b>'+issue+'</b>\n✅ Клиент подключил Telegram-диалог.');
    }else{
      await botSend(id,'Здравствуйте! Это официальный бот обращений ALLIAM. Напишите ваш вопрос или отправьте фотографию либо видео — мы передадим сообщение специалисту.\n\nНе отправляйте пароли и платёжные реквизиты.');
    }
    return;
  }
  if(content==='/help')return botSend(id,'💬 Напишите вопрос или пришлите фото, документ, видео либо голосовое. Специалист получит сообщение. Для прекращения диалога не отправляйте новых сообщений или заблокируйте бота.');
  if(content==='/privacy')return botSend(id,'🔒 Данные сообщений поступают специалисту ALLIAM через Telegram. Не отправляйте пароли, коды или полные реквизиты карт. Политика: https://alliam-company-dmitry-borov.vercel.app/privacy');
  if(content.startsWith('/'))return botSend(id,'Неизвестная команда. Используйте /help или отправьте сообщение.');
  const excerpt=escapeHTML(content.slice(0,1500))||'📎 Медиафайл или голосовое сообщение';
  const header=await notifyOwner(msg.from,'✉️ '+excerpt);
  if(mediaMessage(msg)){
    try{
      await request('copyMessage',{chat_id:ownerChat(),from_chat_id:msg.chat.id,message_id:msg.message_id,
        reply_parameters:header?.message_id?{message_id:header.message_id}:undefined});
    }catch{await botSend(ownerChat(),'⚠️ Не удалось передать вложение от клиента ID: '+id);}
  }
}
async function handleCallback(q){
  if(!isAdmin(q.from)){
    await request('answerCallbackQuery',{callback_query_id:q.id,text:'Недостаточно прав.',show_alert:true});return;
  }
  const m=/^(status|template)\|(\d{3,16})\|(work|closed|details|later)$/.exec(q.data||'');
  if(!m){await request('answerCallbackQuery',{callback_query_id:q.id,text:'Неизвестная кнопка.'});return;}
  const [,type,target,action]=m;
  const templates={work:'⏳ Ваш вопрос взят в работу. Специалист ALLIAM изучает обращение.',closed:'✅ По вашему обращению завершён текущий этап. Если остались вопросы, напишите сюда.',details:'📄 Для уточнения ситуации опишите даты, суммы и название организации. Не присылайте пароли или полные данные банковских карт.',later:'📞 Спасибо! Специалист свяжется с вами при первой возможности. Точное время не гарантируется.'};
  try{
    await botSend(target,'💬 <b>ALLIAM</b>\n\n'+templates[action]);
    await request('answerCallbackQuery',{callback_query_id:q.id,text:'Сообщение отправлено клиенту.'});
    await botSend(ownerChat(),'✅ Клиенту ID: '+target+' отправлено: '+escapeHTML(templates[action]));
  }catch{await request('answerCallbackQuery',{callback_query_id:q.id,text:'Доставить сообщение не удалось.',show_alert:true});}
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return response(res,405,{error:'Метод не поддерживается.'});}
  const secret=String(process.env.TELEGRAM_WEBHOOK_SECRET||'');
  const provided=String(req.headers['x-telegram-bot-api-secret-token']||'');
  const a=Buffer.from(secret),b=Buffer.from(provided);
  if(!ready()||secret.length<16||a.length!==b.length||!crypto.timingSafeEqual(a,b))return response(res,403,{error:'Forbidden'});
  const update=req.body;
  if(!update||typeof update!=='object'||!Number.isSafeInteger(update.update_id))return response(res,400,{error:'Invalid update'});
  if(recent.has(update.update_id))return response(res,200,{ok:true});
  recent.add(update.update_id);
  if(recent.size>300)recent=new Set(Array.from(recent).slice(-150));
  try{
    if(update.callback_query)await handleCallback(update.callback_query);
    else if(update.message?.from?.id && update.message.chat){
      const msg=update.message;
      if(isAdmin(msg.from)&&String(msg.chat.id)===String(ownerChat()))await handleAdmin(msg);
      else if(msg.chat.type==='private'&&!msg.from.is_bot)await handleClient(msg);
    }
  }catch(e){
    // Telegram will retry. Never log message text or attachment data.
    recent.delete(update.update_id);
    return response(res,500,{error:'Temporary failure'});
  }
  return response(res,200,{ok:true});
};
