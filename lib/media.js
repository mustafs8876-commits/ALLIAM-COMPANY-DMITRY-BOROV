'use strict';
const MAX_FILES=3;
const MAX_SINGLE=2500000;
const MAX_TOTAL=2900000;
const ALLOWED=new Map([['image/jpeg','photo'],['image/png','photo'],['image/webp','photo'],['video/mp4','video'],['video/webm','video'],['video/quicktime','document']]);
function signature(buffer,mime){
  if(mime==='image/jpeg')return buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff;
  if(mime==='image/png')return buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(mime==='image/webp')return buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP';
  if(mime==='video/webm')return buffer.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
  if(mime==='video/mp4'||mime==='video/quicktime')return buffer.toString('ascii',4,8)==='ftyp';
  return false;
}
function parseAttachments(files){
  if(files===undefined||files===null)return [];
  if(!Array.isArray(files)||files.length>MAX_FILES)throw Error('Разрешено не более 3 вложений.');
  let total=0;
  return files.map((file,index)=>{
    if(!file || typeof file!=='object')throw Error('Некорректное вложение.');
    const mime=String(file.mime||'').toLowerCase();
    const kind=ALLOWED.get(mime);
    if(!kind)throw Error('Разрешены только фотографии и видео MP4, WebM, MOV.');
    if(typeof file.data!=='string'||file.data.length>Math.ceil(MAX_SINGLE*4/3)+12||! /^[A-Za-z0-9+/]*={0,2}$/.test(file.data)||file.data.length%4!==0)
      throw Error('Некорректный файл.');
    const buffer=Buffer.from(file.data,'base64');
    if(!buffer.length||buffer.length>MAX_SINGLE||!signature(buffer,mime))throw Error('Файл не прошёл проверку или слишком большой.');
    total+=buffer.length;
    if(total>MAX_TOTAL)throw Error('Общий размер вложений не должен превышать 2,9 МБ.');
    let filename=String(file.name||'file-'+(index+1)).split(/[\\/]/).pop().replace(/[^a-zA-Z0-9_. -]/g,'_').slice(0,80);
    if(!filename)filename='attachment-'+(index+1);
    return {filename,mime,kind,buffer,size:buffer.length};
  });
}
module.exports={parseAttachments,MAX_FILES,MAX_SINGLE,MAX_TOTAL};
