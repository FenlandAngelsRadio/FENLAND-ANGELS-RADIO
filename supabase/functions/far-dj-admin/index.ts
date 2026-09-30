import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"https://fenlandangelsradio.co.uk","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"Content-Type":"application/json"}});
const slug=(s:string)=>s.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,38);
const userSlug=(s:string)=>s.toLowerCase().trim().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,32);
const secret=()=>{const a=new Uint8Array(24);crypto.getRandomValues(a);return Array.from(a,x=>x.toString(36).padStart(2,"0")).join("").slice(0,32)};
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 try{
  const auth=req.headers.get("Authorization"); if(!auth)throw new Error("Not signed in");
  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,svc=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const caller=createClient(url,anon,{global:{headers:{Authorization:auth}}}); const {data:{user}}=await caller.auth.getUser(); if(!user)throw new Error("Invalid FAR login");
  const admin=createClient(url,svc); const {data:me}=await admin.from("far_admins").select("role").eq("user_id",user.id).single(); if(!me||!["owner","deputy_manager"].includes(me.role))throw new Error("Management access required");
  const b=await req.json(),action=String(b.action||"");
  if(action==="list"){const {data,error}=await admin.from("far_djs").select("id,display_name,show_name,stream_username,mount_name,enabled,connection_allowed,on_air,connected,last_seen_at,notes,created_at").order("display_name");if(error)throw error;return json({djs:data})}
  if(action==="create"){
   const name=String(b.display_name||"").trim(),show=String(b.show_name||"").trim()||null;if(!name)throw new Error("DJ name required");
   const base=slug(name)||"dj",username="dj_"+userSlug(name),mount="/dj-"+base,password=secret();
   const {data,error}=await admin.from("far_djs").insert({display_name:name,show_name:show,stream_username:username,mount_name:mount,enabled:true,connection_allowed:true,created_by:user.id}).select("id,display_name,show_name,stream_username,mount_name").single();if(error)throw error;
   const liveUrl=Deno.env.get("FAR_LIVE_ADMIN_URL"),liveToken=Deno.env.get("FAR_LIVE_ADMIN_TOKEN");
   if(liveUrl&&liveToken){const r=await fetch(liveUrl+"/djs",{method:"POST",headers:{"Authorization":"Bearer "+liveToken,"Content-Type":"application/json"},body:JSON.stringify({...data,password})});if(!r.ok){await admin.from("far_djs").delete().eq("id",data.id);throw new Error("FAR Live server rejected DJ creation")}}
   return json({dj:data,password,server:"141.147.76.212",port:8000,format:"MP3",bitrate:320,samplerate:48000,warning:"Password is shown once. Give it to the DJ securely."});
  }
  const id=String(b.id||"");if(!id)throw new Error("DJ id required");const {data:dj}=await admin.from("far_djs").select("*").eq("id",id).single();if(!dj)throw new Error("DJ not found");
  const liveUrl=Deno.env.get("FAR_LIVE_ADMIN_URL"),liveToken=Deno.env.get("FAR_LIVE_ADMIN_TOKEN");
  async function live(path:string,method="POST",body?:any){if(!liveUrl||!liveToken)throw new Error("FAR Live server bridge is not configured");const r=await fetch(liveUrl+path,{method,headers:{"Authorization":"Bearer "+liveToken,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error("FAR Live server rejected the request");return await r.json().catch(()=>({ok:true}))}
  if(action==="lock"||action==="enable"){const enabled=action==="enable";await live("/djs/"+id+"/enabled","POST",{enabled});const {error}=await admin.from("far_djs").update({enabled,connection_allowed:enabled,updated_at:new Date().toISOString()}).eq("id",id);if(error)throw error;return json({ok:true})}
  if(action==="reset_password"){const password=secret();await live("/djs/"+id+"/password","POST",{password});return json({password,warning:"New password shown once."})}
  if(action==="take_live"){await live("/on-air","POST",{dj_id:id});await admin.from("far_djs").update({on_air:false});await admin.from("far_djs").update({on_air:true,updated_at:new Date().toISOString()}).eq("id",id);return json({ok:true})}
  if(action==="return_automation"){await live("/on-air","DELETE");await admin.from("far_djs").update({on_air:false});return json({ok:true})}
  if(action==="delete"){await live("/djs/"+id,"DELETE");const {error}=await admin.from("far_djs").delete().eq("id",id);if(error)throw error;return json({ok:true})}
  throw new Error("Unsupported action");
 }catch(e){return json({error:e instanceof Error?e.message:"Request failed"},400)}
});