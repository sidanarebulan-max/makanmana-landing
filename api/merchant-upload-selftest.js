export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'method_not_allowed'});
  if(req.query.key!=='mm-upload-test-20261003-x9K4') return res.status(404).end();
  const EP='https://omtcatriciyecudlvget.supabase.co/functions/v1/merchant-intake-v3';
  const KEY='sb_publishable_USNHq1Yh2pnAJxlCTo1G9Q_Wibdj_yf';
  const headers={apikey:KEY,'Content-Type':'application/json',Origin:'https://www.makanmana.app'};
  const out={steps:[]};
  async function jpost(body){
    const r=await fetch(EP,{method:'POST',headers,body:JSON.stringify(body)});
    const t=await r.text(); let d={}; try{d=JSON.parse(t)}catch{d={raw:t}};
    out.steps.push({kind:'json',status:r.status,body:d});
    if(!r.ok||!d.ok) throw new Error('json_step_failed');
    return d;
  }
  async function up(id,token,role,blob,name,extra={}){
    const fd=new FormData();
    fd.set('action','upload');fd.set('draftId',id);fd.set('draftToken',token);fd.set('role',role);
    fd.set('file',blob,name);
    for(const [k,v] of Object.entries(extra)) fd.set(k,String(v));
    const r=await fetch(EP,{method:'POST',headers:{apikey:KEY,Origin:'https://www.makanmana.app'},body:fd});
    const t=await r.text(); let d={}; try{d=JSON.parse(t)}catch{d={raw:t}};
    out.steps.push({kind:'upload',role,name,status:r.status,body:d});
    if(!r.ok||!d.ok) throw new Error('upload_failed_'+role);
    return d;
  }
  try{
    const draft=await jpost({action:'create_draft'});
    out.draftId=draft.draftId;
    const pdf=new Blob([new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31,0x2e,0x34,0x0a,0x25,0xe2,0xe3,0xcf,0xd3,0x0a])],{type:'application/pdf'});
    const pngBytes=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZrV0AAAAASUVORK5CYII=','base64'));
    const png=new Blob([pngBytes],{type:'image/png'});
    await up(draft.draftId,draft.draftToken,'evidence',pdf,'ssm-test.pdf',{evidenceType:'registration_document'});
    await up(draft.draftId,draft.draftToken,'evidence',png,'ssm-test.png',{evidenceType:'registration_document'});
    await up(draft.draftId,draft.draftToken,'storefront',png,'storefront-test.png');
    await up(draft.draftId,draft.draftToken,'food',png,'food-test.png');
    await up(draft.draftId,draft.draftToken,'menu',png,'menu-test.png');
    const mid='22222222-2222-4222-8222-222222222222';
    await up(draft.draftId,draft.draftToken,'menu-item',png,'menu-item-test.png',{menuItemId:mid});
    out.ok=true;
    out.summary={pdfEvidence:true,imageEvidence:true,storefront:true,food:true,menu:true,menuItem:true};
    return res.status(200).json(out);
  }catch(e){
    out.ok=false; out.error=String(e?.message||e);
    return res.status(500).json(out);
  }
}