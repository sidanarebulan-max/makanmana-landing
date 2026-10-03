import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
const origins=new Set(['https://www.makanmana.app','https://makanmana.app','https://makanmana-landing.vercel.app']);
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const encoder=new TextEncoder();
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const sha=async(s:string)=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(s)));
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
async function hashPassword(password:string,salt:string,iterations:number){const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations,hash:'SHA-256'},key,256));}
function equal(a:string,b:string){let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;}
function checked<T>(r:{data:T,error:unknown}){if(r.error)throw r.error;return r.data;}
async function all(table:string,filter?:[string,string]){const rows:any[]=[];for(let start=0;;start+=500){let q=db.from(table).select('*').order(({merchant_intake_menu_proposals:'registration_id',merchant_control_center_sync:'registration_id',merchant_admin_reviews:'entity_id'} as Record<string,string>)[table]||'id').range(start,start+499);if(filter)q=q.eq(...filter);const part=checked(await q)||[];rows.push(...part);if(part.length<500)break;}return rows;}
async function sourceData(){const [registrations,waitlist,reviews,media,evidence,menus,sync]=await Promise.all([all('merchant_registrations'),all('merchant_waitlist'),all('merchant_admin_reviews'),all('merchant_media'),all('merchant_evidence'),all('merchant_intake_menu_proposals'),all('merchant_control_center_sync')]);return {registrations,waitlist,reviews,media,evidence,menus,sync};}
const required:Record<string,string>={owner_name:'Nama pemilik',contact_name:'Nama untuk dihubungi',contact_phone:'Telefon wakil',contact_email:'E-mel wakil',official_name:'Nama rasmi kedai',display_name:'Nama paparan',address_line1:'Alamat',state:'Negeri',district:'Daerah',city:'Bandar',postcode:'Poskod',business_phone:'Telefon kedai',primary_category:'Kategori',short_description:'Penerangan kedai'};
function gaps(r:any,media:any[],evidence:any[],menus:any[]){const out=Object.entries(required).filter(([k])=>!String(r[k]??'').trim()).map(([,v])=>v);
 if(!r.google_maps_url&&(r.latitude==null||r.longitude==null))out.push('Google Maps atau koordinat');
 for(const role of ['storefront','food','menu'])if(!media.some(x=>x.registration_id===r.id&&x.role===role))out.push(({storefront:'Gambar hadapan kedai',food:'Gambar makanan',menu:'Gambar menu berharga'} as any)[role]);
 if(!evidence.some(x=>x.registration_id===r.id))out.push('Dokumen bukti');
 if(!r.opening_hours||Object.keys(r.opening_hours).length<7)out.push('Waktu operasi 7 hari');
 if(!r.accuracy_confirmed)out.push('Pengesahan ketepatan');
 if(r.processing_consent!==true)out.push('Rekod persetujuan pemprosesan');
 if(r.privacy_notice_accepted!==true)out.push('Rekod penerimaan notis privasi');
 if(r.merchant_terms_accepted!==true)out.push('Rekod penerimaan terma merchant');
 return out;
}
function safeUrl(value:string){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'';const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origins.has(origin)?origin:'https://www.makanmana.app','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
 const response=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(origin&&!origins.has(origin))return response({error:'origin_not_allowed'},403);
 if(req.method!=='POST')return response({error:'method_not_allowed'},405);
 try{
 if(Number(req.headers.get('content-length')||0)>16000)return response({error:'payload_too_large'},413);
 const raw=await req.text();if(raw.length>16000)return response({error:'payload_too_large'},413);const p=JSON.parse(raw);
 if(p.action==='login'){
  if(typeof p.password!=='string'||p.password.length>200)return response({error:'invalid_login'},401);
  const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||req.headers.get('cf-connecting-ip')||'unknown';const ipHash=await sha(ip+':merchant-admin');
  const since=new Date(Date.now()-15*60000).toISOString();const attempt=await db.from('merchant_admin_login_attempts').select('id',{count:'exact',head:true}).eq('ip_hash',ipHash).gte('created_at',since);if(attempt.error)throw attempt.error;if((attempt.count||0)>=8)return response({error:'too_many_attempts'},429);
  checked(await db.from('merchant_admin_login_attempts').insert({ip_hash:ipHash}));
  const c=checked(await db.from('merchant_admin_credentials').select('*').eq('id',1).single());
  const hash=await hashPassword(p.password,c.salt,c.iterations);if(!equal(hash,c.password_hash))return response({error:'invalid_login'},401);
  const token=random(),expiry=new Date(Date.now()+8*3600000).toISOString();checked(await db.from('merchant_admin_sessions').insert({token_hash:await sha(token),expires_at:expiry}));
  await db.from('merchant_admin_sessions').delete().lt('expires_at',new Date().toISOString());await db.from('merchant_admin_login_attempts').delete().lt('created_at',new Date(Date.now()-86400000).toISOString());
  checked(await db.from('merchant_admin_login_attempts').delete().eq('ip_hash',ipHash));return response({ok:true,token,expires_at:expiry});
 }
 const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');if(!/^[a-f0-9]{64}$/.test(token))return response({error:'unauthorized'},401);
 const tokenHash=await sha(token);const session=checked(await db.from('merchant_admin_sessions').select('expires_at').eq('token_hash',tokenHash).maybeSingle());if(!session||new Date(session.expires_at).getTime()<=Date.now())return response({error:'unauthorized'},401);
 if(p.action==='logout'){checked(await db.from('merchant_admin_sessions').delete().eq('token_hash',tokenHash));return response({ok:true});}
 if(p.action==='change_password'){
  if(typeof p.password!=='string'||p.password.length<16||p.password.length>200)return response({error:'password_too_short'},400);
  const salt=random();checked(await db.from('merchant_admin_credentials').update({salt,password_hash:await hashPassword(p.password,salt,210000),iterations:210000,updated_at:new Date().toISOString()}).eq('id',1));
  checked(await db.from('merchant_admin_sessions').delete().neq('token_hash',''));return response({ok:true});
 }
 if(p.action==='dashboard'){
  const d=await sourceData();const registrations=d.registrations.map(r=>({...r,missing:gaps(r,d.media,d.evidence,d.menus),media_count:d.media.filter(x=>x.registration_id===r.id).length,menu_count:(d.menus.find(x=>x.registration_id===r.id)?.menu_items||[]).length,review:d.reviews.find(x=>x.entity_type==='registration'&&x.entity_id===r.id)||null,sync:d.sync.find(x=>x.registration_id===r.id)||null})).sort((a,b)=>b.created_at.localeCompare(a.created_at));
  const [analytics,ios,cities,contacts,drafts]=await Promise.all([db.rpc('merchant_admin_analytics',{p_days:Number(p.days)||30}),all('ios_waitlist'),all('city_requests'),all('contact_submissions'),db.from('merchant_intake_drafts').select('id,status,created_at,expires_at,registration_id').order('created_at',{ascending:false}).limit(100)]);
  return response({ok:true,registrations,waitlist:d.waitlist.map(r=>({...r,review:d.reviews.find(x=>x.entity_type==='waitlist'&&x.entity_id===r.id)||null})).sort((a,b)=>b.created_at.localeCompare(a.created_at)),analytics:checked(analytics),ios,cities,contacts,drafts:checked(drafts),refreshed_at:new Date().toISOString()});
 }
 if(p.action==='activity'){
  const days=[7,30,90].includes(Number(p.days))?Number(p.days):30;
  const offset=Math.max(0,Math.min(1000000,Math.floor(Number(p.offset)||0)));
  const cutoff=p.cutoff&&Number.isFinite(Date.parse(p.cutoff))?new Date(p.cutoff).toISOString():new Date().toISOString();
  const since=new Date(new Date(cutoff).getTime()-days*86400000).toISOString();
  const result=await db.from('site_activity_events').select('id,event_type,page,target,device,referrer_host,utm_source,utm_campaign,created_at',{count:'exact'}).gte('created_at',since).lte('created_at',cutoff).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+49);
  if(result.error)throw result.error;return response({ok:true,events:result.data,total:result.count,cutoff});
 }
 if(p.action==='detail'){
  if(!['registration','waitlist'].includes(p.type)||!/^[-a-f0-9]{36}$/.test(p.id))return response({error:'invalid_entity'},400);
  const row=checked(await db.from(p.type==='registration'?'merchant_registrations':'merchant_waitlist').select('*').eq('id',p.id).single());
  const events=checked(await db.from('merchant_admin_review_events').select('*').eq('entity_type',p.type).eq('entity_id',p.id).order('created_at',{ascending:false}).limit(100));
  if(p.type==='waitlist')return response({ok:true,row,events});
  const [media,evidence,menuImages,menu,workflow]=await Promise.all([all('merchant_media',['registration_id',p.id]),all('merchant_evidence',['registration_id',p.id]),all('merchant_menu_media',['registration_id',p.id]),db.from('merchant_intake_menu_proposals').select('*').eq('registration_id',p.id).maybeSingle(),db.from('merchant_workflow_events').select('*').eq('registration_id',p.id).order('created_at',{ascending:false}).limit(100)]);
  async function signed(rows:any[],bucket:string){return await Promise.all(rows.map(async r=>{const s=await db.storage.from(bucket).createSignedUrl(r.storage_key,600);return {...r,url:s.error?null:safeUrl(s.data.signedUrl),file_error:!!s.error};}));}
  return response({ok:true,row,events,media:await signed(media,'merchant-intake-media'),evidence:await signed(evidence,'merchant-intake-evidence'),menu_images:await signed(menuImages,'merchant-intake-media'),menu:checked(menu)?.menu_items||[],workflow:checked(workflow)});
 }
 if(p.action==='save_review'){
  if(!['registration','waitlist'].includes(p.type)||!['new','reviewing','needs_info','contacted','ready','hold'].includes(p.status)||typeof p.notes!=='string'||p.notes.length>10000||!Number.isInteger(p.version))return response({error:'invalid_review'},400);
  if(p.status==='ready'){
   if(p.type!=='registration')return response({error:'full_registration_required'},400);
   const d=await sourceData();const r=d.registrations.find(x=>x.id===p.id);if(!r)return response({error:'not_found'},404);const missing=gaps(r,d.media,d.evidence,d.menus);if(missing.length)return response({error:'missing_information',missing},400);
  }
  const saved=await db.rpc('merchant_admin_save_review',{p_type:p.type,p_id:p.id,p_status:p.status,p_notes:p.notes,p_follow_up:p.follow_up_at||null,p_version:p.version});
  if(saved.error){if(saved.error.message.includes('review_conflict'))return response({error:'review_conflict'},409);throw saved.error;}return response({ok:true,review:saved.data});
 }
 return response({error:'unknown_action'},400);
 }catch(e){console.error('merchant-admin',e instanceof Error?e.message:JSON.stringify(e));return response({error:'server_error'},500);}
});
