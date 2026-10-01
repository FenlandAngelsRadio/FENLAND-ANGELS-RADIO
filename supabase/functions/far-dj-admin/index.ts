import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sshConfigured, serverBridge } from "../_shared/server-bridge.ts";
const cors={"Access-Control-Allow-Origin":"https://fenlandangelsradio.co.uk","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"Use POST."},405);
 try{
  const auth=req.headers.get("Authorization");if(!auth)return reply({error:"Sign in to FAR Admin."},401);
  const url=Deno.env.get("SUPABASE_URL")!;
  const caller=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:loginError}=await caller.auth.getUser();
  if(loginError||!user)return reply({error:"Your sign-in has expired."},401);
  const admin=createClient(url,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const {data:me,error}=await admin.from("far_admins").select("role").eq("user_id",user.id).single();
  if(error||!me||!["owner","deputy_manager"].includes(String(me.role).toLowerCase()))return reply({error:"Management access required."},403);
  const body=await req.json(),action=body.action;
  if(!["list","create","lock","enable","reset_password","take_live","return_automation","delete"].includes(action))return reply({error:"Choose a valid DJ control."},400);
  const base=Deno.env.get("FAR_LIVE_ADMIN_URL"),token=Deno.env.get("FAR_LIVE_ADMIN_TOKEN");
  if((!base||!token)&&!sshConfigured())return reply({error:"FAR Live server bridge is not configured."},503);
  const parsed=base?new URL(base):null;if(parsed&&(parsed.protocol!=="https:"||parsed.username||parsed.password||parsed.search||parsed.hash))throw new Error("Invalid bridge");
  async function live(path:string,method="POST",payload?:unknown){
   if(sshConfigured()){const result=await serverBridge("djs",method,path,payload);if(result.status!==200)throw new Error(result.data.error||"DJ action not confirmed.");return result.data;}
   const response=await fetch(base!.replace(/\/$/,"")+path,{method,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(120000),redirect:"error"});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||"DJ gateway could not confirm the action.");
   return result;
  }
  if(action==="list"){
   const result=await live("/djs","GET");if(!Array.isArray(result.djs))throw new Error("DJ service returned an incomplete list.");
   return reply({djs:result.djs.map((dj:any)=>({id:dj.id,display_name:dj.display_name,show_name:dj.show_name,stream_username:dj.stream_username,mount_name:dj.mount_name,stream_url:dj.stream_url,enabled:dj.enabled,connection_allowed:dj.connection_allowed,connected:dj.connected,on_air:dj.on_air})),server:result.server,port:result.port,programme_url:result.programme_url});
  }
  if(action==="create"){
   const name=String(body.display_name||"").trim().slice(0,80);if(!name)return reply({error:"Enter the DJ name."},400);
   const id=crypto.randomUUID(),suffix=id.slice(0,8),slug=name.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,24)||"dj";
   const result=await live("/djs","POST",{id,display_name:name,show_name:String(body.show_name||"").trim().slice(0,100),stream_username:"dj_"+slug+"_"+suffix,mount_name:"/dj-"+suffix});
   if(!result.password||!result.dj||!result.server||!result.port)throw new Error("DJ connection details were not confirmed. Refresh before creating another account.");
   return reply(result);
  }
  if(action==="return_automation"){await live("/return-automation");return reply({ok:true});}
  const id=body.id;if(typeof id!=="string"||!/^[-a-zA-Z0-9_]{1,64}$/.test(id))return reply({error:"Choose a DJ."},400);
  const path="/djs/"+encodeURIComponent(id);
  if(action==="lock"||action==="enable")return reply(await live(path+"/enabled","POST",{enabled:action==="enable"}));
  if(action==="reset_password")return reply(await live(path+"/password"));
  if(action==="take_live")return reply(await live(path+"/take-live"));
  if(action==="delete")return reply(await live(path,"DELETE"));
 }catch(error){return reply({error:error instanceof Error?error.message:"DJ service unavailable. Refresh before trying again."},503);}
});
