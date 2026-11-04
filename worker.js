const MENU=[
 {id:"pastelito",es:"Pastelito de pollo",en:"Chicken pastelito",price:3.5},
 {id:"empanada",es:"Empanada de res",en:"Beef empanada",price:3.75},
 {id:"cafe",es:"Café con leche",en:"Café con leche",price:2.75},
 {id:"bizcocho",es:"Bizcocho dominicano (porción)",en:"Dominican cake slice",price:4.5},
 {id:"tres",es:"Tres leches",en:"Tres leches",price:5},
 {id:"morir",es:"Morir soñando",en:"Morir soñando (OJ + milk)",price:4},
];
const SHOP="Panadería La Esquina";
const sys=(cart,pts)=>`You are the ordering assistant for ${SHOP}, a small Dominican bakery & café in Chicago. Reply in the language of the customer's LATEST message (Spanish or English), warm and brief (max 2 sentences), like a friendly counter person.
MENU (id: name $price): ${MENU.map(m=>`${m.id}: ${m.en}/${m.es} $${m.price}`).join("; ")}.
Hours 7am-7pm daily. Pickup only, ~15 min. Loyalty: 1 point per $1, 50 points = free café con leche.
Current cart: ${JSON.stringify(cart)}. Customer loyalty points: ${pts}.
You MUST answer with ONLY a JSON object, no prose outside it:
{"reply":"text to customer","actions":[...]}
Allowed actions: {"type":"add","id":"<menu id>","qty":N} | {"type":"remove","id":"<menu id>"} | {"type":"checkout","name":"<customer name>"} | {"type":"points"}.
When the customer confirms (yes/confirm/sí/dale/listo) and a name is known, emit the checkout action IN THAT SAME RESPONSE and tell them the order is placed — do not ask again. If no name yet, ask for it. Never invent items not on the menu.`;

async function llm(env,messages){
  if(env.META_API_KEY){ // Meta Model API (OpenAI-compatible) — used when the key is set
    const r=await fetch(env.META_BASE+"/chat/completions",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+env.META_API_KEY},body:JSON.stringify({model:env.META_MODEL,messages,temperature:0.3})});
    const j=await r.json(); return {text:j.choices?.[0]?.message?.content||"",provider:"meta-api:"+env.META_MODEL};
  }
  const r=await env.AI.run(env.CF_MODEL,{messages,temperature:0.3,max_tokens:400});
  const t=typeof r.response==="string"?r.response:JSON.stringify(r.response);
  return {text:t,provider:"workers-ai:"+env.CF_MODEL};
}
function parse(t){try{const m=t.match(/\{[\s\S]*\}/);return JSON.parse(m[0]);}catch{return{reply:t,actions:[]};}}
const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{"content-type":"application/json","x-robots-tag":"noindex"}});

export class Store{
  constructor(state){this.sql=state.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,phone TEXT,cart TEXT,history TEXT)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,phone TEXT,name TEXT,items TEXT,total REAL,status TEXT,ts TEXT)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS loyalty(phone TEXT PRIMARY KEY,points INTEGER)");}
  pts(p){const r=[...this.sql.exec("SELECT points FROM loyalty WHERE phone=?",p)];return r[0]?.points||0;}
  async fetch(req){
    const u=new URL(req.url),b=req.method==="POST"?await req.json():{};
    if(u.pathname==="/get"){const r=[...this.sql.exec("SELECT * FROM sessions WHERE id=?",b.sid)][0];
      return J({cart:r?JSON.parse(r.cart):[],history:r?JSON.parse(r.history):[],points:this.pts(b.phone)});}
    if(u.pathname==="/apply"){ // apply model actions
      let cart=b.cart,out={order:null,points:this.pts(b.phone)};
      for(const a of b.actions||[]){const m=MENU.find(x=>x.id===a.id);
        if(a.type==="add"&&m){const c=cart.find(x=>x.id===m.id);const q=Math.max(1,Math.min(50,+a.qty||1));c?c.qty+=q:cart.push({id:m.id,name:m.en,price:m.price,qty:q});}
        if(a.type==="remove")cart=cart.filter(x=>x.id!==a.id);
        if(a.type==="checkout"&&cart.length){const total=+cart.reduce((s,x)=>s+x.price*x.qty,0).toFixed(2);
          this.sql.exec("INSERT INTO orders(phone,name,items,total,status,ts) VALUES(?,?,?,?,?,?)",b.phone,a.name||"Guest",JSON.stringify(cart),total,"new",new Date().toISOString());
          const id=[...this.sql.exec("SELECT last_insert_rowid() id")][0].id;
          const p=this.pts(b.phone)+Math.floor(total);
          this.sql.exec("INSERT INTO loyalty(phone,points) VALUES(?,?) ON CONFLICT(phone) DO UPDATE SET points=?",b.phone,p,p);
          out.order={id,total,items:cart,name:a.name||"Guest"};out.points=p;cart=[];}}
      this.sql.exec("INSERT INTO sessions(id,phone,cart,history) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET cart=excluded.cart,history=excluded.history",b.sid,b.phone,JSON.stringify(cart),JSON.stringify(b.history.slice(-12)));
      return J({...out,cart});}
    if(u.pathname==="/owner"){
      if(b.set){this.sql.exec("UPDATE orders SET status=? WHERE id=?",b.set.status,b.set.id);}
      return J({orders:[...this.sql.exec("SELECT * FROM orders ORDER BY id DESC LIMIT 50")].map(o=>({...o,items:JSON.parse(o.items)})),
        loyalty:[...this.sql.exec("SELECT * FROM loyalty ORDER BY points DESC LIMIT 50")]});}
    return J({error:"nf"},404);
  }
}
export default{async fetch(req,env){
  const u=new URL(req.url),st=env.STORE.get(env.STORE.idFromName("demo"));
  const call=(p,b)=>st.fetch("https://do"+p,{method:"POST",body:JSON.stringify(b)}).then(r=>r.json());
  if(u.pathname==="/robots.txt")return new Response("User-agent: *\nDisallow: /\n");
  if(u.pathname==="/api/health")return J({ok:true,provider:env.META_API_KEY?"meta-api":"workers-ai",model:env.META_API_KEY?env.META_MODEL:env.CF_MODEL});
  if(u.pathname==="/api/menu")return J({shop:SHOP,menu:MENU});
  if(u.pathname==="/api/chat"&&req.method==="POST"){
    const {sid,phone,message}=await req.json();
    if(!sid||!phone||!message||message.length>800)return J({error:"bad request"},400);
    const s=await call("/get",{sid,phone});
    const msgs=[{role:"system",content:sys(s.cart,s.points)},...s.history,{role:"user",content:message}];
    const {text,provider}=await llm(env,msgs);const p=parse(text);
    const reply=String(p.reply||"").slice(0,1000)||"Perdón, ¿me repites? / Sorry, could you repeat that?";
    const r=await call("/apply",{sid,phone,cart:s.cart,actions:Array.isArray(p.actions)?p.actions:[],history:[...s.history,{role:"user",content:message},{role:"assistant",content:JSON.stringify({reply,actions:p.actions||[]})}]});
    return J({reply,actions:p.actions||[],cart:r.cart,order:r.order,points:r.points,provider});
  }
  if(u.pathname==="/api/owner"&&req.method==="POST"){const b=await req.json();
    if(b.pin!==env.OWNER_PIN)return J({error:"bad pin"},401);return J(await call("/owner",b));}
  const res=await env.ASSETS.fetch(req);const h=new Headers(res.headers);h.set("x-robots-tag","noindex");
  return new Response(res.body,{status:res.status,headers:h});
}};
