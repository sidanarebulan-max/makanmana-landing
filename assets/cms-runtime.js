(function(){
const EP='https://omtcatriciyecudlvget.supabase.co/functions/v1/site-content';
const page=document.body.dataset.cmsPage;if(!page)return;
const lang=localStorage.getItem('mmSiteLang')==='en'?'en':'ms';
fetch(EP+'?page='+encodeURIComponent(page),{headers:{accept:'application/json'}}).then(r=>r.ok?r.json():null).then(d=>{
 if(!d?.page)return;const c=lang==='en'?d.page.content_en:d.page.content_ms;
 document.querySelectorAll('[data-cms]').forEach(el=>{const v=c?.[el.dataset.cms];if(typeof v==='string')el.textContent=v});
 document.querySelectorAll('[data-cms-href]').forEach(el=>{const v=c?.[el.dataset.cmsHref];if(typeof v==='string'&&/^https:\/\//.test(v))el.href=v});
}).catch(()=>{});
})();