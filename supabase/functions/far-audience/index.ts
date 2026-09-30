import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Cache-Control":"no-store, max-age=0"};
const BASE=300.62,SINCE="2026-09-29T22:18:59.24036Z";
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 try{
  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  if(req.method==="GET"){
   const {data,error}=await db.from("far_icecast_snapshots").select("created_at,listeners").gte("created_at",SINCE).order("created_at",{ascending:true}).limit(10000);if(error)throw error;
   let added=0,rows=data||[];for(let i=0;i<rows.length;i++){const st=new Date(rows[i].created_at).getTime(),nx=i+1<rows.length?new Date(rows[i+1].created_at).getTime():Math.min(Date.now(),st+300000);added+=Number(rows[i].listeners||0)*Math.max(0,Math.min(300000,nx-st))/3600000}
   return json({ok:true,baseline_hours:BASE,added_hours:added,lifetime_hours:BASE+added,updated_at:new Date().toISOString()});
  }
  if(req.method==="POST"){
   const b=await req.json(),allowed=new Set(["website_visit","app_open","app_install","listen_start","listen_heartbeat","listen_stop"]);if(!allowed.has(String(b.event_type||"")))return json({error:"Invalid event"},400);
   const row={event_type:String(b.event_type),device_id:String(b.device_id||"").slice(0,100),session_id:String(b.session_id||"").slice(0,100),source:b.source==="pwa"?"pwa":"website",page:String(b.page||"").slice(0,300)||null,listen_session_id:b.listen_session_id?String(b.listen_session_id).slice(0,100):null,duration_seconds:Number.isFinite(Number(b.duration_seconds))?Math.max(0,Math.round(Number(b.duration_seconds))):null};
   if(row.device_id.length<3||row.session_id.length<3)return json({error:"Invalid session"},400);const {error}=await db.from("far_audience_events").insert(row);if(error)throw error;return json({ok:true});
  }
  return json({error:"Method not allowed"},405);
 }catch(e){return json({error:e instanceof Error?e.message:"Request failed"},500)}
});