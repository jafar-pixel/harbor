const URL_BASE = Deno.env.get("SUPABASE_URL") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const pinToken = () => Deno.env.get("PINTEREST_ACCESS_TOKEN") || "";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
type Source = { source_url: string; title: string; creator: string; team: string; slot: string; rights_status: string };
const teams = ["Oregon","Ohio State","Alabama","Miami","Penn State","Gallaudet","Seattle Seahawks","Philadelphia Eagles","Chicago Bears","Detroit Lions"];
function classify(value: string) {
 const v = value.toLowerCase();
 return teams.find(x => v.includes(x.toLowerCase())) || "Unassigned";
}
function safeUrl(s: unknown) {
 if(typeof s!=="string") return null;
 try { const u = new URL(s); if(u.protocol!=="https:" || u.username || u.password) return null; u.search="";u.hash="";return u.toString(); } catch { return null; }
}
const allowedSlots = new Set(["hero","wallpaper","card","story","wordmark"]);
const allowedRights = new Set(["reference","permission_pending","licensed","owned"]);
async function api(path: string, jwt: string, init: RequestInit = {}) {
 return fetch(URL_BASE + path, { ...init, headers: { "apikey": ANON, "Authorization": "Bearer " + jwt, ...(init.headers || {}) }});
}
async function userFor(jwt: string) {
 const response = await api("/auth/v1/user",jwt);
 if(!response.ok) return null;
 const body=await response.json();
 return typeof body.id==="string" ? body.id as string : null;
}
async function fetchBoardPins(boardId: string) {
 const token=pinToken();
 if(!token) return { items: [], error:"Pinterest connector is not configured: missing server-side access token" };
 if(!/^\d{5,30}$/.test(boardId)) return { items: [], error:"A board ID (not the Pinterest board URL) is required." };
 const items: Array<Record<string, unknown>>=[];
 let bookmark="";
 for(let n=0;n<5;n++){
  const url=new URL("https://api.pinterest.com/v5/boards/"+boardId+"/pins");
  url.searchParams.set("page_size","100");
  if(bookmark) url.searchParams.set("bookmark",bookmark);
  const response=await fetch(url,{headers:{"Authorization":"Bearer "+token,"Accept":"application/json"}});
  if(!response.ok) return {items,error:"Pinterest API refused access (HTTP "+response.status+"). Only boards owned by or shared with the authorized account can be collected."};
  const payload=await response.json();
  if(!Array.isArray(payload.items)) break;
  items.push(...payload.items);
  bookmark=typeof payload.bookmark==="string"?payload.bookmark:"";
  if(!bookmark) break;
 }
 return {items,error:null};
}
Deno.serve(async (request: Request) => {
 try {
  if(request.method!=="POST" && request.method!=="GET" && request.method!=="PATCH" && request.method!=="DELETE") return json({error:"Method not allowed"},405);
  const bearer=request.headers.get("authorization")||"";
  const jwt=bearer.startsWith("Bearer ")?bearer.slice(7):"";
  if(!jwt || !ANON || !URL_BASE) return json({error:"Authentication required"},401);
  const userId=await userFor(jwt);
  if(!userId) return json({error:"Invalid Supabase session"},401);
  const endpoint = new URL(request.url);
  if (request.method==="GET" && endpoint.searchParams.get("resource")==="published") {
    // Publication RLS only allows licensed and approved artwork to be read.
    const qs=new URLSearchParams({select:"id,conference,sport,team_slug,slot,storage_path,title,approved_at",licensing_confirmed:"eq.true",approved_at:"not.is.null",limit:"500",order:"approved_at.desc"});
    const response=await api("/rest/v1/sports_art_publications?"+qs,jwt);
    return json(response.ok?{items:await response.json(),source:"approved_publications"}:{error:"Published artwork lookup failed"},response.status);
  }
  if (endpoint.searchParams.get("resource") === "connectors") {
    const base="/rest/v1/sports_art_source_connectors";
    if(request.method==="GET") {
      const qs=new URLSearchParams({select:"id,name,provider,source_url,enabled,sync_interval_hours,last_sync_at,last_error,created_at",owner_id:"eq."+userId,order:"created_at.asc"});
      const res=await api(base+"?"+qs,jwt);
      return json(res.ok?{items:await res.json()}:{error:"Could not read connectors"},res.status);
    }
    const body=await request.json().catch(()=>({})) as Record<string,unknown>;
    if(request.method==="POST") {
      const provider=String(body.provider||"");
      if(!["pinterest","sportsdb","collegefootballdata","artist_feed","manual_library"].includes(provider)) return json({error:"Unsupported provider"},400);
      const source=body.source_url == null ? null : safeUrl(body.source_url);
      if(body.source_url && !source) return json({error:"Invalid HTTPS source"},400);
      const hours=Number(body.sync_interval_hours??24);
      if(!Number.isInteger(hours)||hours<1||hours>168) return json({error:"Invalid sync interval"},400);
      const row={owner_id:userId,provider,name:String(body.name||provider).slice(0,120),source_url:source,enabled:body.enabled===true,sync_interval_hours:hours};
      const res=await api(base,jwt,{method:"POST",headers:{"content-type":"application/json","prefer":"return=representation"},body:JSON.stringify(row)});
      return json(res.ok?{items:await res.json()}:{error:"Could not create connector"},res.status);
    }
    const id=String(body.id||"");
    if(!/^[0-9a-f-]{36}$/i.test(id)) return json({error:"Connector id required"},400);
    const qs=new URLSearchParams({id:"eq."+id,owner_id:"eq."+userId});
    if(request.method==="DELETE"){
      const res=await api(base+"?"+qs,jwt,{method:"DELETE"});
      return json(res.ok?{deleted:true}:{error:"Delete failed"},res.status);
    }
    const patch:Record<string,unknown>={};
    if(typeof body.enabled==="boolean") patch.enabled=body.enabled;
    if(body.sync_interval_hours!==undefined){
      const h=Number(body.sync_interval_hours);
      if(!Number.isInteger(h)||h<1||h>168) return json({error:"Invalid sync interval"},400);
      patch.sync_interval_hours=h;
    }
    if(!Object.keys(patch).length) return json({error:"Nothing to update"},400);
    const res=await api(base+"?"+qs,jwt,{method:"PATCH",headers:{"content-type":"application/json","prefer":"return=representation"},body:JSON.stringify(patch)});
    return json(res.ok?{items:await res.json()}:{error:"Update failed"},res.status);
  }
  if(request.method==="GET"){
   const qs=new URLSearchParams({select:"id,source_url,title,creator,team,slot,rights_status,created_at",user_id:"eq."+userId,limit:"1000",order:"created_at.desc"});
   const r=await api("/rest/v1/sports_fanart_sources?"+qs,jwt);
   return json(r.ok?{items:await r.json(),plugin:"jl-fanart-sources",cloud:true}:{error:"Database read failed",code:r.status},r.status);
  }
  const body=await request.json().catch(()=>({})) as Record<string,unknown>;
  let input: unknown[]=[];
  let sourceInfo="manual";
  if(body.action==="pinterest_board"){
   if(typeof body.board_id!=="string") return json({error:"board_id required"},400);
   const discovered=await fetchBoardPins(body.board_id);
   if(discovered.error) return json({error:discovered.error,imported:0},422);
   input=discovered.items.map(p=>({source_url: "https://www.pinterest.com/pin/"+String(p.id||"")+"/",title:p.title||p.description||"Pinterest pin",creator:"Verify original creator",team:classify(String(p.title||"")+" "+String(p.description||"")),slot:"hero",rights_status:"reference"}));
   sourceInfo="pinterest_api";
  } else if(body.action==="import_sources") {
   if(!Array.isArray(body.sources)) return json({error:"sources array required"},400);
   input=body.sources;
  } else return json({error:"Supported actions: import_sources, pinterest_board"},400);
  if(input.length>500) return json({error:"Maximum 500 sources per request"},413);
  const items: Source[]=[];
  for(const value of input) {
    if(!value || typeof value!=="object") continue;
    const obj=value as Record<string,unknown>;
    const link=safeUrl(obj.source_url);
    if(!link) continue;
    const title=String(obj.title||"Untitled artwork").slice(0,300);
    const slot=String(obj.slot||"hero");
    const rights=sourceInfo==="pinterest_api"?"reference":String(obj.rights_status||"reference");
    if(!allowedSlots.has(slot)||!allowedRights.has(rights)) continue;
    items.push({source_url:link,title,creator:String(obj.creator||"Unknown").slice(0,200),team:String(obj.team||classify(title)).slice(0,120),slot,rights_status:rights});
  }
  const uniq=[...new Map(items.map(i=>[i.source_url,i])).values()];
  if(!uniq.length) return json({imported:0,message:"No valid links; nothing changed"});
  const r=await api("/rest/v1/sports_fanart_sources?on_conflict=user_id,source_url",jwt,{method:"POST",headers:{"content-type":"application/json","prefer":"resolution=merge-duplicates,return=representation"},body:JSON.stringify(uniq.map(i=>({...i,user_id:userId})))});
  if(!r.ok) return json({error:"Database write failed",code:r.status},r.status);
  const rows=await r.json();
  return json({imported:rows.length,source:sourceInfo,published:0,message:"Source references synced; no images downloaded or published"});
 } catch(e) { return json({error:"Plugin request failed",detail:e instanceof Error?e.message:"Unknown error"},500); }
});