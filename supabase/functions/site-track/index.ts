import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
const origins=new Set(['https://www.makanmana.app','https://makanmana.app','https://makanmana-landing.vercel.app']);
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const uuid=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s);
const text=(s:unknown,n:number)=>typeof s==='string'?s.replace(/[^a-zA-Z0-9._ /-]/g,'').slice(0,n):null;
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'';const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origins.has(origin)?origin:'https://www.makanmana.app','Access-Control-Allow-Headers':'apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
 const respond=(status:number)=>new Response(JSON.stringify({ok:status===202}),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST'||!origins.has(origin))return respond(403);
 try{
 const raw=await req.text();if(raw.length>2000)return respond(413);const p=JSON.parse(raw);
 const allowed=['page_view','cta_click','form_start','step_view','upload_start','submit_success','submit_error','form_leave'];
 if(!uuid(p.id)||!uuid(p.session_id)||!allowed.includes(p.event_type)||typeof p.page!=='string'||!/^\/[a-z0-9-]*\.?[a-z]*$/i.test(p.page)||p.page.includes('admin'))return respond(400);
 const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';const data=new TextEncoder().encode(ip+':'+new Date().toISOString().slice(0,10));const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');
 const reserved=await db.rpc('site_track_reserve',{p_ip:hash});if(reserved.error)return respond(503);if(!reserved.data)return respond(429);
 const r=await db.from('site_activity_events').upsert({id:p.id,session_id:p.session_id,event_type:p.event_type,page:p.page,target:text(p.target,80),referrer_host:text(p.referrer_host,160),utm_source:text(p.utm_source,80),utm_medium:text(p.utm_medium,80),utm_campaign:text(p.utm_campaign,120),device:p.device==='mobile'?'mobile':'desktop'},{onConflict:'id',ignoreDuplicates:true});
 return respond(r.error?503:202);
 }catch{return respond(400);}
});
