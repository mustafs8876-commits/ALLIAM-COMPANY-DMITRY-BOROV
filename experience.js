(() => {
  'use strict';
  const form=document.getElementById('contact-form');
  if(!form)return;
  const fileInput=document.getElementById('media-input');
  const dropzone=document.getElementById('media-dropzone');
  const preview=document.getElementById('media-preview');
  const meter=document.getElementById('media-meter');
  const feedback=document.getElementById('media-feedback');
  const counter=document.getElementById('message-counter');
  const charProgress=document.getElementById('form-progress');
  const topicButtons=document.querySelectorAll('[data-topic-hint]');
  const successCard=document.getElementById('success-card');
  const successRef=document.getElementById('success-ref');
  const chatLink=document.getElementById('dialog-link');
  const MAX_FILES=3,MAX_FILE=2500000,MAX_TOTAL=2900000;
  const types=new Map([['image/jpeg','photo'],['image/png','photo'],['image/webp','photo'],['video/mp4','video'],['video/webm','video'],['video/quicktime','video']]);
  const selected=[];
  let busy=false;
  const filesize=bytes=>bytes>=1048576?(bytes/1048576).toFixed(1)+' МБ':Math.ceil(bytes/1024)+' КБ';
  function announce(message,isError=false){
    if(!feedback)return;
    feedback.textContent=message;
    feedback.classList.toggle('error',isError);
  }
  function updateFormProgress(){
    const name=String(form.elements.name?.value||'').trim();
    const contact=String(form.elements.contact?.value||'').trim();
    const message=String(form.elements.message?.value||'').trim();
    const value=[name.length>=2,contact.length>=5,message.length>=10,form.elements.consent?.checked].filter(Boolean).length;
    if(charProgress){charProgress.style.width=(value*25)+'%';charProgress.parentElement.setAttribute('aria-valuenow',String(value*25));}
    if(counter)counter.textContent=message.length+' / 2500';
  }
  function render(){
    preview.replaceChildren();
    for(const item of selected){
      const card=document.createElement('div');card.className='media-card';
      const thumb=document.createElement(item.mime.startsWith('image/')?'img':'span');
      if(thumb.tagName==='IMG'){thumb.src=item.url;thumb.alt='Предпросмотр '+item.name;}else{thumb.className='video-thumb';thumb.textContent='▶';}
      const info=document.createElement('span');info.className='media-info';
      const strong=document.createElement('strong');strong.textContent=item.name;
      const small=document.createElement('small');small.textContent=filesize(item.blob.size);
      info.append(strong,small);
      const remove=document.createElement('button');remove.type='button';remove.className='remove-media';remove.textContent='×';remove.setAttribute('aria-label','Удалить '+item.name);
      remove.addEventListener('click',()=>{
        const index=selected.indexOf(item);
        if(index>=0){selected.splice(index,1);URL.revokeObjectURL(item.url);render();}
      });
      card.append(thumb,info,remove);preview.appendChild(card);
    }
    const bytes=selected.reduce((sum,item)=>sum+item.blob.size,0);
    meter.textContent=selected.length+' из '+MAX_FILES+' файлов · '+filesize(bytes)+' из 2,9 МБ';
    announce(selected.length?'Вложения будут отправлены специалисту вместе с заявкой.':'Фото и короткие видео можно прикрепить здесь. Для больших файлов продолжите общение со специалистом после подачи заявки.');
  }
  async function normalizeImage(file){
    if(file.size<=650000)return {blob:file,mime:file.type,name:file.name};
    const url=URL.createObjectURL(file);
    try{
      const image=new Image();image.decoding='async';image.src=url;
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});
      const ratio=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('Не удалось обработать фотографию.');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.81));
      if(!blob)throw Error('Не удалось сжать фотографию.');
      return {blob,mime:'image/jpeg',name:file.name.replace(/\.[^.]+$/, '')+'.jpg'};
    }finally{URL.revokeObjectURL(url);}
  }
  async function addFiles(files){
    if(busy)return;
    busy=true;
    try{
      for(const file of files){
        if(selected.length>=MAX_FILES){announce('Можно добавить максимум 3 файла.',true);break;}
        let mime=String(file.type||'').toLowerCase();
        if(!mime){const ext=file.name.split('.').pop().toLowerCase();mime={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime'}[ext]||'';}
        if(!types.has(mime)){announce('Поддерживаются JPG, PNG, WebP, MP4, WebM и MOV.',true);continue;}
        if(mime.startsWith('video/')&&file.size>MAX_FILE){announce('Видео слишком большое для этой формы. Вы можете подать заявку без него и передать файл отдельно.',true);continue;}
        let entry;
        try{entry=mime.startsWith('image/')?await normalizeImage(file):{blob:file,mime,name:file.name};}
        catch{announce('Не удалось обработать '+file.name+'. Попробуйте другое изображение.',true);continue;}
        const sum=selected.reduce((total,x)=>total+x.blob.size,0)+entry.blob.size;
        if(entry.blob.size>MAX_FILE||sum>MAX_TOTAL){announce('Превышен лимит 2,9 МБ на вложения. Удалите часть файлов или передайте их отдельно после подачи заявки.',true);continue;}
        selected.push({...entry,url:URL.createObjectURL(entry.blob)});
      }
      render();
    }finally{busy=false;if(fileInput)fileInput.value='';}
  }
  fileInput?.addEventListener('change',()=>addFiles([...fileInput.files]));
  dropzone?.addEventListener('dragover',event=>{event.preventDefault();dropzone.classList.add('dragover');});
  dropzone?.addEventListener('dragleave',()=>dropzone.classList.remove('dragover'));
  dropzone?.addEventListener('drop',event=>{event.preventDefault();dropzone.classList.remove('dragover');addFiles([...event.dataTransfer.files]);});
  form.addEventListener('input',updateFormProgress);
  form.addEventListener('change',updateFormProgress);
  topicButtons.forEach(button=>button.addEventListener('click',()=>{
    const input=form.elements.message;
    if(!input)return;
    const hint=button.getAttribute('data-topic-hint');
    if(input.value.trim().length)input.value=input.value.trim()+'\n'+hint;
    else input.value=hint;
    input.focus();updateFormProgress();
    button.classList.add('used');setTimeout(()=>button.classList.remove('used'),450);
  }));
  const toBase64=blob=>new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Не удалось прочитать файл.'));reader.readAsDataURL(blob);
  });
  window.ALLIAM_EXPERIENCE={
    async beforeSubmit(){
      if(busy)throw Error('Фотографии ещё обрабатываются. Попробуйте повторить отправку.');
      const files=[];
      for(const entry of selected){
        files.push({name:entry.name,mime:entry.mime,data:await toBase64(entry.blob)});
      }
      return {files};
    },
    async afterSent(result){
      for(const entry of selected)URL.revokeObjectURL(entry.url);
      selected.length=0;render();updateFormProgress();
      if(!successCard)return;
      successCard.hidden=false;
      successRef.textContent='№ '+String(result.id||'—');
      const sent=Number(result.filesSent||0),failed=Number(result.filesFailed||0);
      const notice=document.getElementById('files-delivery-result');
      if(notice)notice.textContent=failed?('Заявка успешно отправлена. Файлы: получено '+sent+', не получено '+failed+'. Сохраните недоставленные файлы для отдельной передачи специалисту.'):sent?('Все '+sent+' вложения переданы специалисту.'):'Заявка передана специалисту.';
      if(chatLink){
        const href=String(result.chatLink||'');
        const trusted=/^https:\/\/t\.me\/[A-Za-z0-9_]{5,32}\?start=[A-F0-9]{12}_[A-Za-z0-9_-]{16}$/.test(href);
        chatLink.hidden=!trusted;if(trusted)chatLink.href=href;
      }
      successCard.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});
    },
    getSummary(){return selected.length?'\nВложения: '+selected.map(x=>x.name).join(', '):'';}
  };
  document.getElementById('copy-case-id')?.addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(successRef.textContent);const button=document.getElementById('copy-case-id');button.textContent='Скопировано ✓';setTimeout(()=>button.textContent='Скопировать номер',1800);}catch{}
  });
  updateFormProgress();render();
})();
