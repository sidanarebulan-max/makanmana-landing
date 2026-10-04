
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://www.makanmana.app",
  "https://makanmana.app",
  "https://makanmana-landing.vercel.app"
]);
const MEDIA_BUCKET="merchant-intake-media";
const EVIDENCE_BUCKET="merchant-intake-evidence";
const MAX_IMAGE=5*1024*1024, MAX_EVIDENCE=8*1024*1024;
const fixedMedia=new Set(["storefront","food","menu","logo","interior"]);
const evidenceTypes=new Set(["registration_document","utility_bill","authorization_letter"]);
const days=["isnin","selasa","rabu","khamis","jumaat","sabtu","ahad"];
const CONSENT_VERSION="merchant-intake-consent-v3-pdpa";
const PRIVACY_VERSION="privacy-2026-09-30";
const TERMS_VERSION="merchant-terms-2026-09-30";

function cors(origin:string|null){
  const allowed=origin && ALLOWED_ORIGINS.has(origin)?origin:"https://www.makanmana.app";
  return {
    "Access-Control-Allow-Origin":allowed,
    "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Vary":"Origin"
  };
}
function json(origin:string|null,status:number,body:unknown){
  return new Response(JSON.stringify(body),{status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8"}});
}
const t=(v:unknown,max=300)=>typeof v==="string"?v.trim().slice(0,max):"";
const arr=(v:unknown,max=20)=>Array.isArray(v)?[...new Set(v.map(x=>t(x,80)).filter(Boolean))].slice(0,max):[];
const phone=(v:string)=>/^\+?[0-9][0-9\s-]{7,18}$/.test(v);
const email=(v:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<=250;
const httpsUrl=(v:string)=>{if(!v)return true;try{const u=new URL(v);return u.protocol==="https:"&&!u.username&&!u.password;}catch{return false;}};
function mapsUrl(v:string){
  if(!v)return true;
  try{
    const u=new URL(v),h=u.hostname.toLowerCase();
    const gh=/^(?:www\.|maps\.)?google\.(?:com|com\.my)$/.test(h);
    const sh=h==="maps.app.goo.gl"||h==="goo.gl";
    return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&(gh||sh)&&(!gh||u.pathname.startsWith("/maps")||h.startsWith("maps."))&&(h!=="goo.gl"||u.pathname.startsWith("/maps/"));
  }catch{return false;}
}
function validHours(v:any){
  if(!v||typeof v!=="object")return false;
  const tm=/^([01]\d|2[0-3]):[0-5]\d$/;
  return days.every(d=>{
    const x=v[d];
    return x&&typeof x.closed==="boolean"&&tm.test(String(x.open||""))&&tm.test(String(x.close||""))&&(x.closed||x.open!==x.close);
  });
}
function cleanMenu(input:any){
  if(!Array.isArray(input)||input.length>30)throw new Error("invalid_menu_items");
  const ids=new Set<string>(),images=new Set<string>();
  return input.map((x:any,i:number)=>{
    const id=t(x?.id,60),section=t(x?.section,20),category=t(x?.category,80),name=t(x?.name,120),description=t(x?.description,400),imageKey=t(x?.imageKey,600);
    const price=Number(x?.price),available=Boolean(x?.available);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||ids.has(id))throw new Error("invalid_menu_items");
    ids.add(id);
    if(!["makanan","minuman"].includes(section)||category.length<2||name.length<2||!Number.isFinite(price)||price<0||price>100000||Math.abs(price*100-Math.round(price*100))>1e-6)throw new Error("invalid_menu_items");
    if(imageKey){if(images.has(imageKey))throw new Error("invalid_menu_items");images.add(imageKey);}
    return {id,section,category,name,description,price,currency:"MYR",available,imageKey,sortOrder:i};
  });
}
async function sha(v:string){
  const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));
  return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function token(){
  const b=new Uint8Array(32);crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
}
async function magic(file:File,evidence=false){
  const h=new Uint8Array(await file.slice(0,16).arrayBuffer());
  if(evidence&&h.length>=4&&h[0]===0x25&&h[1]===0x50&&h[2]===0x44&&h[3]===0x46)return{mime:"application/pdf",ext:"pdf"};
  if(h.length>=3&&h[0]===0xff&&h[1]===0xd8&&h[2]===0xff)return{mime:"image/jpeg",ext:"jpg"};
  if(h.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>h[i]===n))return{mime:"image/png",ext:"png"};
  if(h.length>=12&&String.fromCharCode(...h.slice(0,4))==="RIFF"&&String.fromCharCode(...h.slice(8,12))==="WEBP")return{mime:"image/webp",ext:"webp"};
  return null;
}
function refCode(){
  const d=new Date(),rnd=crypto.randomUUID().replaceAll("-","").slice(0,6).toUpperCase();
  return `MM-${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,"0")}${String(d.getUTCDate()).padStart(2,"0")}-${rnd}`;
}
function uuid(v:string){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}
async function getDraft(db:any,id:string,rawToken:string){
  if(!uuid(id)||rawToken.length<20)return null;
  const {data}=await db.from("merchant_intake_drafts").select("*").eq("id",id).maybeSingle();
  if(!data||data.status!=="draft"||new Date(data.expires_at).getTime()<=Date.now())return null;
  return (await sha(rawToken))===data.token_hash?data:null;
}

async function forwardEmailEvent(db:any,eventKey:string){
  try{
    const {data:secret,error:secretError}=await db.rpc("landing_runtime_secret",{p_name:"landing_control_token"});
    if(secretError||typeof secret!=="string"||!secret)return false;
    const {data:row,error}=await db.from("merchant_email_outbox").select("*").eq("event_key",eventKey).maybeSingle();
    if(error||!row||row.status==="forwarded")return row?.status==="forwarded";
    await db.from("merchant_email_outbox").update({status:"processing",attempts:Number(row.attempts||0)+1,updated_at:new Date().toISOString()}).eq("id",row.id);
    const response=await fetch("https://makanmana-control-center.vercel.app/api/email/landing-event",{
      method:"POST",
      headers:{authorization:"Bearer "+secret,"content-type":"application/json"},
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
    return true;
  }catch(e){
    const message=e instanceof Error?e.message:"forward_failed";
    await db.from("merchant_email_outbox").update({status:"pending",last_error:message.slice(0,500),available_at:new Date(Date.now()+60000).toISOString(),updated_at:new Date().toISOString()}).eq("event_key",eventKey);
    return false;
  }
}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
  if(req.method!=="POST")return json(origin,405,{ok:false,error:"method_not_allowed"});
  if(origin&&!ALLOWED_ORIGINS.has(origin))return json(origin,403,{ok:false,error:"origin_not_allowed"});

  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return json(origin,503,{ok:false,error:"server_config_missing"});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const contentType=req.headers.get("content-type")||"";
  try{
    if(contentType.includes("application/json")){
      const body=await req.json();
      const action=t(body?.action,40);
      if(action==="create_draft"){
        const ip=req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||req.headers.get("cf-connecting-ip")||"unknown";
        const ipHash=await sha(ip),oneHourAgo=new Date(Date.now()-3600000).toISOString();
        const {count}=await db.from("merchant_intake_attempts").select("id",{count:"exact",head:true}).eq("ip_hash",ipHash).gte("created_at",oneHourAgo);
        if((count||0)>=5)return json(origin,429,{ok:false,error:"too_many_attempts"});
        await db.from("merchant_intake_attempts").insert({ip_hash:ipHash});
        const raw=token(),hash=await sha(raw);
        const {data,error}=await db.from("merchant_intake_drafts").insert({token_hash:hash,ip_hash:ipHash}).select("id,expires_at").single();
        if(error||!data)throw new Error("draft_create_failed");
        return json(origin,200,{ok:true,draftId:data.id,draftToken:raw,expiresAt:data.expires_at});
      }

      if(action==="refresh_consent"){
        const ip=req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||req.headers.get("cf-connecting-ip")||"unknown";
        const ipHash=await sha(ip),oneHourAgo=new Date(Date.now()-3600000).toISOString();
        const {count}=await db.from("merchant_consent_refresh_attempts").select("id",{count:"exact",head:true}).eq("ip_hash",ipHash).gte("created_at",oneHourAgo);
        if((count||0)>=5)return json(origin,429,{ok:false,error:"too_many_attempts"});
        await db.from("merchant_consent_refresh_attempts").insert({ip_hash:ipHash});

        const referenceCode=t(body?.referenceCode,80);
        const verifyEmail=t(body?.email,250).toLowerCase();
        const last4=t(body?.phoneLast4,4).replace(/\D/g,"");
        if(!referenceCode||!email(verifyEmail)||!/^[0-9]{4}$/.test(last4))
          return json(origin,422,{ok:false,error:"verification_failed"});

        const {data:reg}=await db.from("merchant_registrations")
          .select("id,contact_email,contact_phone,consent_record_status")
          .eq("reference_code",referenceCode).maybeSingle();

        const storedLast4=String(reg?.contact_phone||"").replace(/\D/g,"").slice(-4);
        if(!reg||String(reg.contact_email||"").toLowerCase()!==verifyEmail||storedLast4!==last4)
          return json(origin,422,{ok:false,error:"verification_failed"});

        if(reg.consent_record_status==="complete")
          return json(origin,200,{ok:true,status:"already_complete",reference:referenceCode});

        if(body?.processingConsent!==true||body?.privacyNoticeAccepted!==true||body?.termsAccepted!==true||body?.accuracyConfirmed!==true||typeof body?.marketingOptIn!=="boolean")
          return json(origin,422,{ok:false,error:"consent_required"});

        const recordedAt=new Date().toISOString();
        const evidenceRef="merchant-registration:"+referenceCode+":consent-refresh";
        const {error:upd}=await db.from("merchant_registrations").update({
          processing_consent:true,
          privacy_notice_accepted:true,
          merchant_terms_accepted:true,
          marketing_opt_in:Boolean(body.marketingOptIn),
          accuracy_confirmed:true,
          consent_version:CONSENT_VERSION,
          privacy_version:PRIVACY_VERSION,
          terms_version:TERMS_VERSION,
          consent_recorded_at:recordedAt,
          consent_evidence_reference:evidenceRef,
          consent_record_status:"complete",
          updated_at:recordedAt
        }).eq("id",reg.id);
        if(upd)throw new Error("consent_refresh_failed");

        await db.from("merchant_workflow_events").insert({
          registration_id:reg.id,
          event_type:"consent.refreshed",
          old_state:"legacy_partial",
          new_state:"complete",
          reason:"Merchant re-confirmed current processing, privacy, merchant terms and accuracy consent.",
          metadata:{
            consent_version:CONSENT_VERSION,
            privacy_version:PRIVACY_VERSION,
            terms_version:TERMS_VERSION,
            consent_recorded_at:recordedAt,
            marketing_opt_in:Boolean(body.marketingOptIn)
          }
        });

        return json(origin,200,{ok:true,status:"consent_complete",reference:referenceCode});
      }

      if(action==="finalize"){
        const draftId=t(body?.draftId,60),draftToken=t(body?.draftToken,200),draft=await getDraft(db,draftId,draftToken);
        if(!draft)return json(origin,401,{ok:false,error:"draft_invalid_or_expired"});
        if(t(body?.company_fax,200))return json(origin,200,{ok:true,reference:"received"});
        const p=body?.payload||{},errs:string[]=[];
        const ownerName=t(p.ownerName,160),representativeRole=t(p.representativeRole,40),contactName=t(p.contactName,160),contactPhone=t(p.contactPhone,40),contactEmail=t(p.contactEmail,250).toLowerCase();
        const legalName=t(p.legalName,240),registrationNumber=t(p.registrationNumber,100),evidenceType=t(p.evidenceType,50),evidenceDeferred=p.evidenceDeferred===true;
        const officialName=t(p.officialName,240),displayName=t(p.displayName,240),branchName=t(p.branchName,160);
        const addressLine1=t(p.addressLine1,300),addressLine2=t(p.addressLine2,300),state=t(p.state,100),district=t(p.district,100),city=t(p.city,100),locality=t(p.locality,120),postcode=t(p.postcode,10);
        const googleMapsUrl=t(p.googleMapsUrl,1500),businessPhone=t(p.phone,40),whatsapp=t(p.whatsapp,40);
        const website=t(p.website,500),instagram=t(p.instagram,500),facebook=t(p.facebook,500),tiktok=t(p.tiktok,500),primaryCategory=t(p.primaryCategory,100),shortDescription=t(p.shortDescription,1000),specialHours=t(p.specialHours,500);
        const lat=p.latitude===null||p.latitude===""||p.latitude===undefined?null:Number(p.latitude),lng=p.longitude===null||p.longitude===""||p.longitude===undefined?null:Number(p.longitude);
        const priceRange=t(p.priceRange,20)||"unknown";
        if(ownerName.length<2)errs.push("ownerName");
        if(!["owner","authorized_representative"].includes(representativeRole))errs.push("representativeRole");
        if(contactName.length<2)errs.push("contactName");
        if(!phone(contactPhone))errs.push("contactPhone");
        if(!email(contactEmail))errs.push("contactEmail");
        if(officialName.length<2||displayName.length<2)errs.push("shopName");
        if(!addressLine1||!state||!district||!city||!/^\d{5}$/.test(postcode))errs.push("address");
        if(googleMapsUrl&&!mapsUrl(googleMapsUrl))errs.push("googleMapsUrl");
        if((lat===null)!==(lng===null)||(lat!==null&&(!Number.isFinite(lat)||Math.abs(lat)>90))||(lng!==null&&(!Number.isFinite(lng)||Math.abs(lng)>180)))errs.push("coordinates");
        if(!googleMapsUrl&&lat===null)errs.push("location");
        if(!phone(businessPhone))errs.push("phone");
        if(![website,instagram,facebook,tiktok].every(httpsUrl))errs.push("socialUrl");
        if(!primaryCategory||shortDescription.length<20)errs.push("profile");
        if(!["budget","moderate","premium","unknown"].includes(priceRange))errs.push("priceRange");
        if(!validHours(p.openingHours))errs.push("openingHours");
        if(!evidenceTypes.has(evidenceType))errs.push("evidenceType");
        if(evidenceType==="registration_document"&&!registrationNumber)errs.push("registrationNumber");
        if(representativeRole==="authorized_representative"&&evidenceType!=="authorization_letter")errs.push("authorizationLetter");
        if(p.consent!==true||p.privacyNoticeAccepted!==true||p.termsAccepted!==true||p.accuracy!==true||typeof p.marketingOptIn!=="boolean")errs.push("consent");
        let menuItems:any[]=[];
        try{menuItems=cleanMenu(p.menuItems||[]);}catch{errs.push("menuItems");}
        if(errs.length)return json(origin,422,{ok:false,error:"validation_failed",fields:errs});

        const {data:files}=await db.from("merchant_intake_draft_files").select("role,menu_item_id,storage_key,evidence_type").eq("draft_id",draftId);
        const roles=new Set((files||[]).map((f:any)=>f.role));
        for(const r of ["storefront","food","menu"])if(!roles.has(r))errs.push(r); if(!evidenceDeferred&&!roles.has("evidence"))errs.push("evidence");
        const ev=(files||[]).find((f:any)=>f.role==="evidence");
        if(ev&&ev.evidence_type!==evidenceType)errs.push("evidenceType");
        const byItem=new Map((files||[]).filter((f:any)=>f.role==="menu-item").map((f:any)=>[String(f.menu_item_id),String(f.storage_key)]));
        for(const item of menuItems){
          if(item.imageKey&&byItem.get(item.id)!==item.imageKey)errs.push("menuImage");
        }
        if(errs.length)return json(origin,422,{ok:false,error:"files_required_or_invalid",fields:[...new Set(errs)]});

        const cleanPayload={
          ownerName,representativeRole,contactName,contactPhone,contactEmail,legalName,registrationNumber,evidenceType,evidenceDeferred,
          officialName,displayName,branchName,addressLine1,addressLine2,state,district,city,locality,postcode,
          googleMapsUrl,latitude:lat,longitude:lng,phone:businessPhone,whatsapp,website,instagram,facebook,tiktok,
          primaryCategory,cuisineTags:arr(p.cuisineTags),foodTags:arr(p.foodTags),signatureDishes:arr(p.signatureDishes),
          priceRange,serviceModes:arr(p.serviceModes),amenities:arr(p.amenities),shortDescription,
          openingHours:p.openingHours,specialHours,
          processingConsent:true,privacyNoticeAccepted:true,termsAccepted:true,marketingOptIn:Boolean(p.marketingOptIn),accuracyConfirmed:true,
          consentVersion:CONSENT_VERSION,privacyNoticeVersion:PRIVACY_VERSION,termsVersion:TERMS_VERSION,consentRecordedAt:new Date().toISOString(),
          preferredLanguage:t(p.preferredLanguage,5)==="en"?"en":"ms",
          sourcePage:t(p.sourcePage,500)||"/daftar-kedai.html"
        };
        const reference=refCode();
        const {data,error}=await db.rpc("finalize_merchant_intake_v3",{p_draft_id:draftId,p_reference_code:reference,p_payload:cleanPayload,p_menu_items:menuItems});
        if(error)throw new Error("finalize_failed");
        const preferredLanguage=cleanPayload.preferredLanguage==="en"?"en":"ms";
        await db.from("merchant_registrations").update({preferred_language:preferredLanguage}).eq("id",data);
        const eventKey="merchant-registration-received:"+String(data);
        const {error:emailQueueError}=await db.from("merchant_email_outbox").upsert({
          event_key:eventKey,
          trigger_event:"merchant.registration.created",
          recipient_email:contactEmail,
          preferred_language:preferredLanguage,
          variables:{
            user_name:contactName||ownerName,
            merchant_name:contactName||ownerName,
            restaurant_name:displayName,
            reference_id:reference,
            email:contactEmail
          },
          status:"pending",
          available_at:new Date().toISOString(),
          last_error:null
        },{onConflict:"event_key"});
        if(emailQueueError)console.error("merchant-email-queue",emailQueueError.message);
        else await forwardEmailEvent(db,eventKey);
        return json(origin,200,{ok:true,submissionId:data,reference,status:"submitted"});
      }
      return json(origin,400,{ok:false,error:"unknown_action"});
    }

    if(contentType.includes("multipart/form-data")){
      const form=await req.formData(),action=t(form.get("action"),40);
      if(action!=="upload")return json(origin,400,{ok:false,error:"unknown_action"});
      const draftId=t(form.get("draftId"),60),draftToken=t(form.get("draftToken"),200),draft=await getDraft(db,draftId,draftToken);
      if(!draft)return json(origin,401,{ok:false,error:"draft_invalid_or_expired"});
      const role=t(form.get("role"),30),file=form.get("file");
      if(!(file instanceof File)||file.size===0)return json(origin,422,{ok:false,error:"file_required"});
      const isEvidence=role==="evidence";
      const isMenu=role==="menu-item";
      if(!isEvidence&&!isMenu&&!fixedMedia.has(role))return json(origin,422,{ok:false,error:"invalid_role"});
      const limit=isEvidence?MAX_EVIDENCE:MAX_IMAGE;
      if(file.size>limit)return json(origin,413,{ok:false,error:"file_too_large"});
      const kind=await magic(file,isEvidence);
      if(!kind)return json(origin,422,{ok:false,error:isEvidence?"invalid_evidence":"invalid_image"});
      let menuItemId:string|null=null,evidenceType:string|null=null;
      if(isMenu){
        menuItemId=t(form.get("menuItemId"),60);
        if(!uuid(menuItemId))return json(origin,422,{ok:false,error:"invalid_menu_item_id"});
        const {count}=await db.from("merchant_intake_draft_files").select("id",{count:"exact",head:true}).eq("draft_id",draftId).eq("role","menu-item");
        const {data:existing}=await db.from("merchant_intake_draft_files").select("id,storage_key").eq("draft_id",draftId).eq("role","menu-item").eq("menu_item_id",menuItemId).maybeSingle();
        if(!existing&&(count||0)>=30)return json(origin,422,{ok:false,error:"menu_image_limit"});
        if(existing){await db.storage.from(MEDIA_BUCKET).remove([existing.storage_key]);await db.from("merchant_intake_draft_files").delete().eq("id",existing.id);}
      }else{
        if(isEvidence){
          evidenceType=t(form.get("evidenceType"),50);
          if(!evidenceTypes.has(evidenceType))return json(origin,422,{ok:false,error:"invalid_evidence_type"});
        }
        const {data:existing}=await db.from("merchant_intake_draft_files").select("id,storage_key").eq("draft_id",draftId).eq("role",role).maybeSingle();
        if(existing){
          await db.storage.from(isEvidence?EVIDENCE_BUCKET:MEDIA_BUCKET).remove([existing.storage_key]);
          await db.from("merchant_intake_draft_files").delete().eq("id",existing.id);
        }
      }
      const bucket=isEvidence?EVIDENCE_BUCKET:MEDIA_BUCKET;
      const folder=isEvidence?evidenceType!:role;
      const path=isMenu?`${draftId}/menu-item/${menuItemId}/${crypto.randomUUID()}.${kind.ext}`:`${draftId}/${folder}/${crypto.randomUUID()}.${kind.ext}`;
      const {error:up}=await db.storage.from(bucket).upload(path,file,{contentType:kind.mime,upsert:false});
      if(up)throw new Error("upload_failed");
      const {error:meta}=await db.from("merchant_intake_draft_files").insert({draft_id:draftId,role,menu_item_id:menuItemId,evidence_type:evidenceType,storage_key:path,mime_type:kind.mime,size_bytes:file.size});
      if(meta){await db.storage.from(bucket).remove([path]);throw new Error("upload_metadata_failed");}
      return json(origin,200,{ok:true,key:path,role,menuItemId});
    }
    return json(origin,415,{ok:false,error:"unsupported_content_type"});
  }catch(_e){
    return json(origin,500,{ok:false,error:"server_error"});
  }
});
