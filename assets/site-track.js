(()=>{
 if(navigator.doNotTrack==='1'||navigator.globalPrivacyControl||location.pathname.includes('admin'))return;
 const endpoint='https://omtcatriciyecudlvget.supabase.co/functions/v1/site-track';
 let session,attribution={};const now=Date.now();
 try{const saved=JSON.parse(sessionStorage.getItem('mm-visit')||'null');session=saved&&now-saved.last<30*60000?saved.id:crypto.randomUUID();attribution=saved?.id===session?saved.attribution||{}:{};
 const u=new URL(location.href);for(const k of ['utm_source','utm_medium','utm_campaign'])if(u.searchParams.get(k))attribution[k]=u.searchParams.get(k).slice(0,120);
 if(document.referrer){const ref=new URL(document.referrer);if(ref.hostname!==location.hostname)attribution.referrer_host=ref.hostname;}
 sessionStorage.setItem('mm-visit',JSON.stringify({id:session,last:now,attribution}));}catch{session=crypto.randomUUID();}
 const page=location.pathname==='/'?'/':location.pathname.replace(/\/$/,'');let started=false,success=false,leaving=false;const sentSteps=new Set();
 function send(event_type,options={}){if(event_type==='submit_success')success=true;if(event_type==='step_view'){if(sentSteps.has(options.target))return;sentSteps.add(options.target);}
 const body=JSON.stringify({id:crypto.randomUUID(),session_id:session,event_type,page,device:matchMedia('(max-width:760px)').matches?'mobile':'desktop',...attribution,target:options.target||null});
 if(options.beacon&&navigator.sendBeacon){navigator.sendBeacon(endpoint,new Blob([body],{type:'application/json'}));return;}
 fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
 }
 window.MMTrack={send};send('page_view');
 document.addEventListener('click',e=>{const a=e.target.closest('a,button');if(!a)return;let target=a.id||a.getAttribute('href')?.split('?')[0]?.split('#')[0]||a.closest('form')?.id||'button';try{if(target.startsWith('http'))target=new URL(target).hostname;}catch{}send('cta_click',{target:target.slice(0,80)});});
 document.addEventListener('input',e=>{if(!started&&e.target.closest('form')){started=true;send('form_start',{target:e.target.closest('form').id||'form'});}});
 if(page==='/daftar-kedai.html')send('step_view',{target:'step_1'});
 window.addEventListener('pagehide',()=>{if(started&&!success&&!leaving){leaving=true;send('form_leave',{beacon:true});}});
})();
