export default async function handler(req,res){
  if(req.method!=='GET'||req.query.key!=='mm_upload_test_20261003_q7k4p2') return res.status(404).json({ok:false});
  const EP='https://omtcatriciyecudlvget.supabase.co/functions/v1/merchant-intake-v3';
  const KEY='sb_publishable_USNHq1Yh2pnAJxlCTo1G9Q_Wibdj_yf';
  const baseHeaders={apikey:KEY,Origin:'https://www.makanmana.app'};
  try{
    const c=await fetch(EP,{method:'POST',headers:{...baseHeaders,'Content-Type':'application/json'},body:JSON.stringify({action:'create_draft'})});
    const cj=await c.json().catch(()=>({}));
    if(!c.ok||!cj.ok)return res.status(200).json({ok:false,stage:'create_draft',status:c.status,body:cj});
    const pdf=new Blob([Buffer.from('%PDF-1.4\n% MakanMana upload self-test\n%%EOF\n')],{type:'application/pdf'});
    const ef=new FormData();
    ef.set('action','upload');ef.set('draftId',cj.draftId);ef.set('draftToken',cj.draftToken);ef.set('role','evidence');ef.set('evidenceType','registration_document');ef.set('file',pdf,'makanmana-test-ssm.pdf');
    const e=await fetch(EP,{method:'POST',headers:baseHeaders,body:ef});
    const ej=await e.json().catch(()=>({}));
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2YQAAAAASUVORK5CYII=','base64');
    const mf=new FormData();
    mf.set('action','upload');mf.set('draftId',cj.draftId);mf.set('draftToken',cj.draftToken);mf.set('role','menu');mf.set('file',new Blob([png],{type:'image/png'}),'makanmana-test-menu.png');
    const m=await fetch(EP,{method:'POST',headers:baseHeaders,body:mf});
    const mj=await m.json().catch(()=>({}));
    return res.status(200).json({ok:e.ok&&m.ok,create:{status:c.status,ok:cj.ok},evidence:{status:e.status,body:ej},menu:{status:m.status,body:mj}});
  }catch(error){return res.status(200).json({ok:false,stage:'exception',error:String(error&&error.message||error)})}
}