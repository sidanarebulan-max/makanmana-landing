
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const origins=new Set(["https://www.makanmana.app","https://makanmana.app","https://makanmana-landing.vercel.app"]);
function cors(origin:string){return {
  "content-type":"application/json; charset=utf-8","cache-control":"no-store",
  "access-control-allow-origin":origins.has(origin)?origin:"https://www.makanmana.app",
  "access-control-allow-headers":"authorization,apikey,content-type",
  "access-control-allow-methods":"POST,OPTIONS","vary":"Origin"
};}
function out(origin:string,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors(origin)});}
function obj(v:unknown):Record<string,unknown>{return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};}
function txt(v:unknown,max=500){return typeof v==="string"?v.trim().slice(0,max):"";}
async function identity(req:Request){
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token)return null;
  const {data,error}=await db.auth.getUser(token);
  if(error||!data.user)return null;
  const {data:account,error:accountError}=await db.from("merchant_portal_accounts").select("*").eq("auth_user_id",data.user.id).maybeSingle();
  if(accountError||!account)return null;
  return {user:data.user,account};
}
async function assertBrandAccess(accountId:string,brandId:string,roles:string[]=["owner","manager","editor"]){
  const {data}=await db.from("merchant_branch_memberships").select("role,status").eq("portal_account_id",accountId).eq("brand_id",brandId).eq("status","active").in("role",roles).limit(1).maybeSingle();
  return data;
}
Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin")||"";
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
  if(req.method!=="POST")return out(origin,{error:"method_not_allowed"},405);
  if(origin&&!origins.has(origin))return out(origin,{error:"origin_not_allowed"},403);
  const who=await identity(req);
  if(!who)return out(origin,{error:"unauthorized"},401);
  let p:Record<string,unknown>;try{p=obj(await req.json());}catch{return out(origin,{error:"invalid_json"},400);}
  const action=txt(p.action,80);
  try{
    if(action==="state"){
      if(who.account.status==="invited"){
        const now=new Date().toISOString();
        await db.from("merchant_portal_accounts").update({status:"active",activated_at:who.account.activated_at||now,last_login_at:now,updated_at:now}).eq("id",who.account.id);
        who.account.status="active";who.account.activated_at=who.account.activated_at||now;who.account.last_login_at=now;
      }else{
        await db.from("merchant_portal_accounts").update({last_login_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",who.account.id);
      }
      const {data:memberships,error:mErr}=await db.from("merchant_branch_memberships").select("id,brand_id,branch_id,role,status").eq("portal_account_id",who.account.id).eq("status","active");
      if(mErr)throw mErr;
      const brandIds=[...new Set((memberships||[]).map((x:any)=>x.brand_id))];
      const [brands,branches,menus]=await Promise.all([
        brandIds.length?db.from("merchant_brands").select("*,merchant_businesses(id,display_name,legal_name,registration_number,status)").in("id",brandIds):Promise.resolve({data:[],error:null}),
        brandIds.length?db.from("merchant_branches").select("*,restaurants(id,display_name,official_name,address_line1,address_line2,city,state,postcode,business_phone,opening_hours,publication_status)").in("brand_id",brandIds).order("created_at"):Promise.resolve({data:[],error:null}),
        brandIds.length?db.from("merchant_shared_menu_items").select("*").in("brand_id",brandIds).order("sort_order"):Promise.resolve({data:[],error:null})
      ]);
      if(brands.error||branches.error||menus.error)throw brands.error||branches.error||menus.error;
      const branchIds=(branches.data||[]).map((b:any)=>b.id);
      const availability=branchIds.length?await db.from("merchant_branch_menu_availability").select("*").in("branch_id",branchIds):{data:[],error:null};
      if(availability.error)throw availability.error;
      return out(origin,{ok:true,account:who.account,memberships:memberships||[],brands:brands.data||[],branches:branches.data||[],menu_items:menus.data||[],availability:availability.data||[]});
    }
    if(action==="set_language"){
      const language=p.language==="en"?"en":"ms";
      const {error}=await db.from("merchant_portal_accounts").update({preferred_language:language,updated_at:new Date().toISOString()}).eq("id",who.account.id);
      if(error)throw error;
      return out(origin,{ok:true,preferred_language:language});
    }
    if(action==="brand.update"){
      const brandId=txt(p.brand_id,64),access=await assertBrandAccess(who.account.id,brandId,["owner","manager"]);
      if(!access)return out(origin,{error:"forbidden"},403);
      const patch:Record<string,unknown>={updated_at:new Date().toISOString()};
      if(typeof p.description==="string")patch.description=txt(p.description,1000);
      if(typeof p.primary_category==="string")patch.primary_category=txt(p.primary_category,100);
      const {error}=await db.from("merchant_brands").update(patch).eq("id",brandId);
      if(error)throw error;
      return out(origin,{ok:true});
    }
    if(action==="menu.toggle"){
      const branchId=txt(p.branch_id,64),menuId=txt(p.menu_item_id,64);
      const {data:branch,error:bErr}=await db.from("merchant_branches").select("id,brand_id,restaurant_id").eq("id",branchId).single();
      if(bErr)throw bErr;
      const access=await assertBrandAccess(who.account.id,branch.brand_id,["owner","manager","editor"]);
      if(!access)return out(origin,{error:"forbidden"},403);
      const {data:item,error:iErr}=await db.from("merchant_shared_menu_items").select("*").eq("id",menuId).eq("brand_id",branch.brand_id).single();
      if(iErr)throw iErr;
      const enabled=p.enabled===true;
      const price=(p.price_override===null||p.price_override===""||p.price_override===undefined)?null:Number(p.price_override);
      if(price!==null&&(!Number.isFinite(price)||price<0))return out(origin,{error:"invalid_price"},400);
      const {error:aErr}=await db.from("merchant_branch_menu_availability").upsert({branch_id:branchId,menu_item_id:menuId,enabled,price_override:price,updated_at:new Date().toISOString()},{onConflict:"branch_id,menu_item_id"});
      if(aErr)throw aErr;
      const finalPrice=price??Number(item.default_price);
      const {error:rErr}=await db.from("restaurant_menu_items").update({available:enabled,price:finalPrice}).eq("restaurant_id",branch.restaurant_id).eq("source_menu_item_id",item.source_menu_item_id);
      if(rErr)throw rErr;
      return out(origin,{ok:true,enabled,price:finalPrice});
    }
    if(action==="branch.update"){
      const branchId=txt(p.branch_id,64);
      const {data:branch,error:bErr}=await db.from("merchant_branches").select("id,brand_id,restaurant_id").eq("id",branchId).single();
      if(bErr)throw bErr;
      const access=await assertBrandAccess(who.account.id,branch.brand_id,["owner","manager"]);
      if(!access)return out(origin,{error:"forbidden"},403);
      const restaurantPatch:Record<string,unknown>={updated_at:new Date().toISOString()};
      if(typeof p.business_phone==="string")restaurantPatch.business_phone=txt(p.business_phone,40);
      if(p.opening_hours&&typeof p.opening_hours==="object")restaurantPatch.opening_hours=p.opening_hours;
      const status=txt(p.status,30);
      if(status&&["active","temporarily_closed"].includes(status)){
        await db.from("merchant_branches").update({status,updated_at:new Date().toISOString()}).eq("id",branchId);
      }
      const {error:rErr}=await db.from("restaurants").update(restaurantPatch).eq("id",branch.restaurant_id);
      if(rErr)throw rErr;
      return out(origin,{ok:true});
    }
    return out(origin,{error:"unknown_action"},400);
  }catch(e){
    console.error("merchant-owner",e instanceof Error?e.message:String(e));
    return out(origin,{error:"server_error"},500);
  }
});
