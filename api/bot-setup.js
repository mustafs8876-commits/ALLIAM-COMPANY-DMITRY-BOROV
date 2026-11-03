'use strict';
const {request,ready,botInfo}=require('../lib/telegram');
const webhookUrl='https://alliam-company-dmitry-borov.vercel.app/api/telegram-webhook';
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Метод не поддерживается.'});}
  if(!ready()||!process.env.TELEGRAM_WEBHOOK_SECRET||process.env.TELEGRAM_WEBHOOK_SECRET.length<16)
    return res.status(503).json({configured:false,error:'Webhook secret not configured'});
  try{
    const current=await request('getWebhookInfo');
    if(current.url && current.url!==webhookUrl){
      return res.status(409).json({configured:false,error:'Бот уже подключён к другому webhook. Настройки другого сервиса не изменены.'});
    }
    if(current.url!==webhookUrl){
      await request('setWebhook',{url:webhookUrl,secret_token:process.env.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates:['message','callback_query'],drop_pending_updates:false,max_connections:5},10000);
    }
    const bot=await botInfo();
    return res.status(200).json({configured:true,webhook:webhookUrl,botUsername:bot.username||'',message:'Диалог с клиентами подключён.'});
  }catch{return res.status(502).json({configured:false,error:'Telegram не подтвердил регистрацию webhook.'});}
};
