
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const allowed=new Set(["https://www.makanmana.app","https://makanmana.app","https://makanmana-landing.vercel.app"]);
Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin")||"";
  const headers={
    "content-type":"application/json; charset=utf-8",
    "cache-control":"public, max-age=60, stale-while-revalidate=300",
    "access-control-allow-origin":allowed.has(origin)?origin:"https://www.makanmana.app",
    "vary":"Origin"
  };
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(req.method!=="GET")return new Response(JSON.stringify({error:"method_not_allowed"}),{status:405,headers});
  const u=new URL(req.url),page=(u.searchParams.get("page")||"").trim();
  if(!/^[a-z0-9_-]+$/.test(page))return new Response(JSON.stringify({error:"invalid_page"}),{status:400,headers});
  const {data,error}=await db.from("site_cms_pages").select("page_key,title,content_ms,content_en,version,updated_at").eq("page_key",page).eq("published",true).maybeSingle();
  if(error)return new Response(JSON.stringify({error:"server_error"}),{status:500,headers});
  if(!data)return new Response(JSON.stringify({error:"not_found"}),{status:404,headers});
  return new Response(JSON.stringify({ok:true,page:data}),{status:200,headers});
});
