
(function(){
const SUPABASE_URL='https://omtcatriciyecudlvget.supabase.co';
const KEY='sb_publishable_USNHq1Yh2pnAJxlCTo1G9Q_Wibdj_yf';
const OWNER_API=SUPABASE_URL+'/functions/v1/merchant-owner';
const sb=window.supabase.createClient(SUPABASE_URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const mode=document.body.dataset.merchantPage||'';
let lang=localStorage.getItem('mmMerchantLang')||'ms';
const copy={
ms:{loginTitle:'Log masuk Merchant',loginIntro:'Gunakan e-mel dan kata laluan MakanMana Merchant anda.',email:'E-mel',password:'Kata laluan',login:'Log Masuk',forgot:'Lupa kata laluan?',resetSent:'Pautan reset telah dihantar ke e-mel anda.',activateTitle:'Aktifkan Akaun Merchant',activateIntro:'Tetapkan kata laluan anda untuk mula mengurus kedai dan semua cawangan.',newPassword:'Kata laluan baharu',confirmPassword:'Sahkan kata laluan',activate:'Aktifkan Akaun',center:'Merchant Center',allBranches:'Semua Cawangan',branches:'Cawangan',menu:'Menu & Ketersediaan',logout:'Log keluar',price:'Harga',item:'Menu',status:'Status',active:'Aktif',save:'Disimpan',noStore:'Tiada kedai diluluskan untuk akaun ini lagi.',loading:'Memuatkan...',account:'Akaun',welcome:'Selamat datang',resetPassword:'Hantar pautan reset'},
en:{loginTitle:'Merchant Login',loginIntro:'Use your MakanMana Merchant email and password.',email:'Email',password:'Password',login:'Sign In',forgot:'Forgot password?',resetSent:'A reset link has been sent to your email.',activateTitle:'Activate Merchant Account',activateIntro:'Set your password to start managing your store and every branch.',newPassword:'New password',confirmPassword:'Confirm password',activate:'Activate Account',center:'Merchant Center',allBranches:'All Branches',branches:'Branches',menu:'Menu & Availability',logout:'Sign out',price:'Price',item:'Item',status:'Status',active:'Active',save:'Saved',noStore:'No approved stores are linked to this account yet.',loading:'Loading...',account:'Account',welcome:'Welcome',resetPassword:'Send reset link'}
};
function t(k){return copy[lang]?.[k]||copy.ms[k]||k}
function applyText(){document.documentElement.lang=lang==='en'?'en':'ms';document.querySelectorAll('[data-i18n]').forEach(el=>{const k=el.dataset.i18n;if(copy[lang]?.[k])el.textContent=copy[lang][k]});document.querySelectorAll('[data-lang-select]').forEach(el=>el.value=lang)}
function setLang(v){lang=v==='en'?'en':'ms';localStorage.setItem('mmMerchantLang',lang);applyText();if(mode==='center')renderCenter(window.__MM_STATE||null)}
function showError(message){const el=document.querySelector('[data-error]');if(el){el.textContent=message;el.classList.add('show')}}
async function session(){const {data}=await sb.auth.getSession();return data.session}
async function owner(action,payload={}){const s=await session();if(!s)throw new Error('unauthorized');const r=await fetch(OWNER_API,{method:'POST',headers:{apikey:KEY,authorization:'Bearer '+s.access_token,'content-type':'application/json'},body:JSON.stringify({action,...payload})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw new Error(d.error||'request_failed');return d}
document.querySelectorAll('[data-lang-select]').forEach(el=>el.addEventListener('change',e=>{setLang(e.target.value);if(mode==='center')owner('set_language',{language:lang}).catch(()=>{})}));
applyText();

if(mode==='login'){
 const form=document.querySelector('#merchantLoginForm'),reset=document.querySelector('#merchantReset');
 session().then(s=>{if(s)location.replace('/merchant/center')});
 form?.addEventListener('submit',async e=>{e.preventDefault();showError('');const email=form.email.value.trim(),password=form.password.value;const {error}=await sb.auth.signInWithPassword({email,password});if(error)return showError(error.message);location.replace('/merchant/center')});
 reset?.addEventListener('click',async()=>{const email=form.email.value.trim();if(!email)return showError(lang==='en'?'Enter your email first.':'Masukkan e-mel dahulu.');const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/merchant/activate?mode=recovery'});if(error)return showError(error.message);const ok=document.querySelector('[data-ok]');ok.textContent=t('resetSent');ok.hidden=false});
}
if(mode==='activate'){
 (async()=>{const qs=new URLSearchParams(location.search);const code=qs.get('code');if(code){await sb.auth.exchangeCodeForSession(code).catch(()=>{})}const s=await session();if(!s){showError(lang==='en'?'This activation link is invalid or expired. Request a new link from Merchant Login.':'Pautan aktivasi tidak sah atau telah tamat. Minta pautan baharu melalui Log Masuk Merchant.');document.querySelector('#activateForm button').disabled=true}})();
 document.querySelector('#activateForm')?.addEventListener('submit',async e=>{e.preventDefault();showError('');const p=e.currentTarget.password.value,c=e.currentTarget.confirm.value;if(p.length<8)return showError(lang==='en'?'Password must contain at least 8 characters.':'Kata laluan mesti sekurang-kurangnya 8 aksara.');if(p!==c)return showError(lang==='en'?'Passwords do not match.':'Kata laluan tidak sepadan.');const {error}=await sb.auth.updateUser({password:p});if(error)return showError(error.message);try{await owner('set_language',{language:lang})}catch{}location.replace('/merchant/center')});
}
if(mode==='center'){
 document.querySelector('[data-logout]')?.addEventListener('click',async()=>{await sb.auth.signOut();location.replace('/merchant/login')});
 (async()=>{if(!await session())return location.replace('/merchant/login');try{const state=await owner('state');window.__MM_STATE=state;lang=state.account?.preferred_language==='en'?'en':'ms';localStorage.setItem('mmMerchantLang',lang);applyText();renderCenter(state)}catch(e){showError(e.message);if(e.message==='unauthorized')location.replace('/merchant/login')}})();
}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function renderCenter(s){
 if(!s)return;const brands=s.brands||[],branches=s.branches||[],items=s.menu_items||[],av=s.availability||[];
 const account=document.querySelector('[data-account-name]');if(account)account.textContent=s.account?.display_name||s.account?.email||'Merchant';
 const brand=brands[0];const title=document.querySelector('[data-brand-name]');if(title)title.textContent=brand?.brand_name||t('center');
 const select=document.querySelector('#branchFilter');if(select){const old=select.value;select.innerHTML='<option value="all">'+t('allBranches')+'</option>'+branches.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.branch_name||b.restaurants?.display_name||'Branch')+'</option>').join('');if([...select.options].some(o=>o.value===old))select.value=old}
 const bc=document.querySelector('[data-branch-count]');if(bc)bc.textContent=String(branches.length);
 const ic=document.querySelector('[data-item-count]');if(ic)ic.textContent=String(items.length);
 const branchBox=document.querySelector('#branchCards');branchBox.innerHTML=branches.length?branches.map(b=>'<article class="mm-branch"><span class="mm-status">'+esc(b.status)+'</span><h3>'+esc(b.branch_name||b.restaurants?.display_name||'Branch')+'</h3><p>'+esc([b.restaurants?.address_line1,b.restaurants?.city,b.restaurants?.state].filter(Boolean).join(', '))+'</p></article>').join(''):'<div class="mm-empty">'+t('noStore')+'</div>';
 const byKey=new Map(av.map(x=>[x.branch_id+':'+x.menu_item_id,x]));
 const head=branches.map(b=>'<th class="mm-check">'+esc(b.branch_name||b.restaurants?.display_name||'Branch')+'</th>').join('');
 const rows=items.map(item=>'<tr><td><strong>'+esc(item.name)+'</strong><br><small>'+esc(item.category)+'</small></td><td>RM '+Number(item.default_price||0).toFixed(2)+'</td>'+branches.map(b=>{const x=byKey.get(b.id+':'+item.id);const enabled=x?x.enabled:item.default_available;const price=x?.price_override??'';return '<td class="mm-check"><label><input type="checkbox" data-toggle data-branch="'+esc(b.id)+'" data-item="'+esc(item.id)+'" '+(enabled?'checked':'')+'></label><br><input class="mm-price" type="number" min="0" step=".01" placeholder="'+Number(item.default_price||0).toFixed(2)+'" value="'+esc(price)+'" data-price data-branch="'+esc(b.id)+'" data-item="'+esc(item.id)+'"><div class="mm-save" data-saved="'+esc(b.id+':'+item.id)+'"></div></td>'}).join('')+'</tr>').join('');
 document.querySelector('#menuHead').innerHTML='<tr><th>'+t('item')+'</th><th>'+t('price')+'</th>'+head+'</tr>';
 document.querySelector('#menuBody').innerHTML=rows||'<tr><td colspan="'+(2+branches.length)+'">'+t('noStore')+'</td></tr>';
}
async function persistCell(branch,item){
 const check=document.querySelector('[data-toggle][data-branch="'+CSS.escape(branch)+'"][data-item="'+CSS.escape(item)+'"]');
 const price=document.querySelector('[data-price][data-branch="'+CSS.escape(branch)+'"][data-item="'+CSS.escape(item)+'"]');
 const saved=document.querySelector('[data-saved="'+CSS.escape(branch+':'+item)+'"]');
 try{await owner('menu.toggle',{branch_id:branch,menu_item_id:item,enabled:!!check?.checked,price_override:price?.value===''?null:Number(price.value)});if(saved){saved.textContent=t('save');setTimeout(()=>saved.textContent='',1200)}}catch(e){showError(e.message)}
}
document.addEventListener('change',e=>{const el=e.target;if(el?.matches?.('[data-toggle],[data-price]'))persistCell(el.dataset.branch,el.dataset.item)});
})();
