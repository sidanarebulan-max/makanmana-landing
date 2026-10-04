
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const db=createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {auth:{persistSession:false,autoRefreshToken:false}}
);
const encoder=new TextEncoder();
async function sha(v:string){
  const h=await crypto.subtle.digest("SHA-256",encoder.encode(v));
  return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
}
function obj(v:unknown):Record<string,unknown>{return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};}
function text(v:unknown,max=500){return typeof v==="string"?v.trim().slice(0,max):"";}
async function authorize(req:Request){
  const raw=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!raw)return null;
  const tokenHash=await sha(raw);
  const {data,error}=await db.from("landing_control_clients").select("client_key,scopes").eq("token_sha256",tokenHash).eq("enabled",true).maybeSingle();
  if(error||!data)return null;
  return data;
}
async function runtimeToken(){
  const {data,error}=await db.rpc("landing_runtime_secret",{p_name:"landing_control_token"});
  if(error||typeof data!=="string"||!data)return null;
  return data;
}
async function forwardPendingEmails(limit=10){
  const token=await runtimeToken();
  if(!token)return {forwarded:0,failed:0,error:"sync_secret_missing"};
  const {data:rows,error}=await db.from("merchant_email_outbox")
    .select("*").eq("status","pending").lte("available_at",new Date().toISOString())
    .order("created_at",{ascending:true}).limit(Math.max(1,Math.min(limit,25)));
  if(error)throw error;
  let forwarded=0,failed=0;
  for(const row of rows||[]){
    await db.from("merchant_email_outbox").update({status:"processing",attempts:Number(row.attempts||0)+1,updated_at:new Date().toISOString()})
      .eq("id",row.id).eq("status","pending");
    try{
      const response=await fetch("https://makanmana-control-center.vercel.app/api/email/landing-event",{
        method:"POST",
        headers:{authorization:"Bearer "+token,"content-type":"application/json"},
        body:JSON.stringify({
          event_key:row.event_key,
          trigger_event:row.trigger_event,
          recipient_email:row.recipient_email,
          language:row.preferred_language==="en"?"en":"bm",
          variables:row.variables
        }),
        signal:AbortSignal.timeout(12000)
      });
      if(!response.ok)throw new Error("control_center_"+response.status);
      await db.from("merchant_email_outbox").update({status:"forwarded",forwarded_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()}).eq("id",row.id);
      forwarded++;
    }catch(e){
      failed++;
      const message=e instanceof Error?e.message:"forward_failed";
      await db.from("merchant_email_outbox").update({
        status:Number(row.attempts||0)+1>=5?"failed":"pending",
        available_at:new Date(Date.now()+Math.min(3600000,60000*Math.pow(2,Number(row.attempts||0)))).toISOString(),
        last_error:message.slice(0,500),updated_at:new Date().toISOString()
      }).eq("id",row.id);
    }
  }
  return {forwarded,failed};
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const client=await authorize(req);
  if(!client)return json({error:"unauthorized"},401);
  let body:Record<string,unknown>;
  try{body=obj(await req.json());}catch{return json({error:"invalid_json"},400);}
  const action=text(body.action,80);
  try{
    if(action==="health"){
      return json({ok:true,client:client.client_key});
    }
    if(action==="cms.list"){
      const {data,error}=await db.from("site_cms_pages").select("*").order("page_key");
      if(error)throw error;
      return json({ok:true,pages:data||[]});
    }
    if(action==="cms.save"){
      const pageKey=text(body.page_key,80),title=text(body.title,160),reason=text(body.reason,500);
      const contentMs=obj(body.content_ms),contentEn=obj(body.content_en);
      const {data,error}=await db.rpc("landing_save_cms_page",{
        p_page_key:pageKey,p_title:title,p_content_ms:contentMs,p_content_en:contentEn,
        p_changed_by:text(body.actor,160)||String(client.client_key),p_reason:reason
      });
      if(error)throw error;
      return json({ok:true,page:data});
    }
    if(action==="merchant.list"){
      const {data,error}=await db.from("merchant_registrations")
        .select("id,reference_code,status,owner_name,contact_name,contact_email,contact_phone,legal_name,registration_number,display_name,branch_name,city,state,primary_category,preferred_language,evidence_deferred,created_at,updated_at")
        .order("created_at",{ascending:false}).limit(250);
      if(error)throw error;
      return json({ok:true,registrations:data||[]});
    }
    if(action==="merchant.detail"){
      const id=text(body.registration_id,64);
      const [reg,menu,review,branches]=await Promise.all([
        db.from("merchant_registrations").select("*").eq("id",id).single(),
        db.from("merchant_intake_menu_proposals").select("menu_items").eq("registration_id",id).maybeSingle(),
        db.from("merchant_admin_reviews").select("*").eq("entity_type","registration").eq("entity_id",id).maybeSingle(),
        db.from("merchant_branches").select("id,brand_id,restaurant_id,branch_name,status").eq("source_registration_id",id)
      ]);
      if(reg.error)throw reg.error;
      return json({ok:true,registration:reg.data,menu:menu.data?.menu_items||[],review:review.data||null,branches:branches.data||[]});
    }
    if(action==="merchant.approve"){
      const id=text(body.registration_id,64),reason=text(body.reason,1000);
      if(reason.length<8)return json({error:"reason_required"},400);
      const {data:reg,error:regError}=await db.from("merchant_registrations")
        .select("id,contact_email,contact_name,owner_name,display_name,branch_name,reference_code,preferred_language,status")
        .eq("id",id).single();
      if(regError)throw regError;
      const redirectTo="https://www.makanmana.app/merchant/activate";
      const {data:link,error:linkError}=await db.auth.admin.generateLink({
        type:"magiclink",
        email:String(reg.contact_email),
        options:{redirectTo}
      });
      if(linkError||!link?.user?.id||!link?.properties?.action_link)throw linkError||new Error("activation_link_failed");
      const generatedUrl=new URL(link.properties.action_link);
      const tokenHash=generatedUrl.searchParams.get("token");
      const tokenType=generatedUrl.searchParams.get("type")||"magiclink";
      if(!tokenHash)throw new Error("activation_token_missing");
      const activationUrl="https://www.makanmana.app/merchant/activate?token_hash="+encodeURIComponent(tokenHash)+"&type="+encodeURIComponent(tokenType);
      const {data:approved,error:approveError}=await db.rpc("landing_approve_merchant_registration",{
        p_registration_id:id,p_auth_user_id:link.user.id,
        p_actor:text(body.actor,160)||String(client.client_key),p_reason:reason
      });
      if(approveError)throw approveError;
      const eventKey="merchant-owner-approved:"+id;
      const language=reg.preferred_language==="en"?"en":"ms";
      const variables={
        merchant_name:reg.contact_name||reg.owner_name,
        user_name:reg.contact_name||reg.owner_name,
        restaurant_name:reg.display_name,
        reference_id:reg.reference_code,
        email:reg.contact_email,
        action_url:activationUrl
      };
      const {error:outboxError}=await db.from("merchant_email_outbox").upsert({
        event_key:eventKey,trigger_event:"merchant.owner.approved",recipient_email:String(reg.contact_email).toLowerCase(),
        preferred_language:language,variables,status:"pending",available_at:new Date().toISOString(),last_error:null
      },{onConflict:"event_key"});
      if(outboxError)throw outboxError;
      const delivery=await forwardPendingEmails(10);
      return json({ok:true,approval:approved,email_delivery:delivery});
    }
    if(action==="email.flush"){
      return json({ok:true,...await forwardPendingEmails(Number(body.limit)||10)});
    }
    return json({error:"unknown_action"},400);
  }catch(e){
    console.error("landing-control",e instanceof Error?e.message:String(e));
    return json({error:"server_error",message:e instanceof Error?e.message:"unknown"},500);
  }
});
