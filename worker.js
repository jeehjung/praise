const ALLOWED_ORIGINS=new Set(["https://jeehjung.github.io"]),SESSION_DAYS=30,PBKDF2_ITERATIONS=100000;
export default {async fetch(req,env){
 const url=new URL(req.url),origin=req.headers.get("Origin")||"",cors={"Access-Control-Allow-Methods":"GET,POST,DELETE,OPTIONS","Access-Control-Allow-Headers":"Content-Type,Authorization","Vary":"Origin"};
 if(ALLOWED_ORIGINS.has(origin))cors["Access-Control-Allow-Origin"]=origin;
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...cors}});
 try{await init(env.DB);
 if(url.pathname==="/api/auth/register"&&req.method==="POST"){
  const b=await req.json(),username=cleanUsername(b.username),displayName=clean(b.displayName),password=typeof b.password==="string"?b.password:"";
  if(!username)return json({error:"아이디는 영문 소문자·숫자·밑줄로 4~20자 입력해 주세요."},400);
  if(!displayName)return json({error:"이름은 1~30자로 입력해 주세요."},400);
  if(password.length<8||password.length>128)return json({error:"비밀번호는 8~128자로 입력해 주세요."},400);
  if(await env.DB.prepare("SELECT id FROM users WHERE username=?").bind(username).first())return json({error:"이미 사용 중인 아이디입니다."},409);
  let person=await env.DB.prepare("SELECT id,is_active FROM people WHERE name=? COLLATE NOCASE").bind(displayName).first();
  if(person&&await env.DB.prepare("SELECT id FROM users WHERE person_id=?").bind(person.id).first())return json({error:"이미 계정에 연결된 이름입니다. 다른 이름을 사용해 주세요."},409);
  if(person&&!person.is_active)await env.DB.prepare("UPDATE people SET is_active=1 WHERE id=?").bind(person.id).run();
  if(!person){const p=await env.DB.prepare("INSERT INTO people(name,created_at) VALUES(?,?)").bind(displayName,new Date().toISOString()).run();person={id:p.meta.last_row_id};}
  const salt=randomHex(16),passwordHash=await hashPassword(password,salt);
  await env.DB.prepare("INSERT INTO users(username,display_name,password_hash,password_salt,person_id,created_at) VALUES(?,?,?,?,?,?)").bind(username,displayName,passwordHash,salt,person.id,new Date().toISOString()).run();
  const u=await env.DB.prepare("SELECT id,username,display_name FROM users WHERE username=?").bind(username).first();return json(await issueSession(env.DB,u),201);
 }
 if(url.pathname==="/api/auth/login"&&req.method==="POST"){
  const b=await req.json(),username=cleanUsername(b.username),password=typeof b.password==="string"?b.password:"";
  const u=await env.DB.prepare("SELECT id,username,display_name,password_hash,password_salt FROM users WHERE username=?").bind(username).first();
  if(!u||!constantTimeEqual(await hashPassword(password,u.password_salt),u.password_hash))return json({error:"아이디 또는 비밀번호를 확인해 주세요."},401);
  return json(await issueSession(env.DB,u));
 }
 if(url.pathname==="/api/auth/me"&&req.method==="GET"){const u=await authenticate(req,env.DB);return u?json({user:u}):json({error:"로그인이 필요합니다."},401)}
 if(url.pathname==="/api/auth/logout"&&req.method==="POST"){const t=bearer(req);if(t)await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(t)).run();return json({ok:true})}
 if(url.pathname==="/api/state"&&req.method==="GET"){
  const user=await authenticate(req,env.DB);if(!user)return json({error:"로그인이 필요합니다."},401);
  const week=validWeek(url.searchParams.get("week"))||isoWeek(new Date());
  const p=await env.DB.prepare("SELECT p.id,p.name,COUNT(s.id) total_stickers,SUM(CASE WHEN s.week_key=? THEN 1 ELSE 0 END) week_stickers,SUM(CASE WHEN substr(s.created_at,1,7)=? THEN 1 ELSE 0 END) month_stickers FROM people p LEFT JOIN stickers s ON s.recipient_id=p.id WHERE p.is_active=1 GROUP BY p.id,p.name ORDER BY p.name COLLATE NOCASE").bind(week,new Date().toISOString().slice(0,7)).all(),r=await env.DB.prepare("SELECT s.id,s.week_key,s.created_at,p.name recipient,s.giver_name FROM stickers s JOIN people p ON p.id=s.recipient_id WHERE s.week_key=? ORDER BY s.created_at DESC LIMIT 300").bind(week).all();
  return json({week,user,people:p.results.map(x=>({...x,stickers:x.week_stickers||0})),recent:r.results});
 }
 if(url.pathname==="/api/people"&&req.method==="POST"){
  if(!await authenticate(req,env.DB))return json({error:"로그인이 필요합니다."},401);
  const b=await req.json(),n=clean(b.name);if(!n)return json({error:"이름은 1~30자로 입력해 주세요."},400);
  const existing=await env.DB.prepare("SELECT id,is_active FROM people WHERE name=? COLLATE NOCASE").bind(n).first();
  if(existing){if(existing.is_active)return json({error:"이미 등록된 이름입니다."},409);await env.DB.prepare("UPDATE people SET is_active=1 WHERE id=?").bind(existing.id).run();return json({ok:true,reactivated:true},200);}
  await env.DB.prepare("INSERT INTO people(name,created_at,is_active) VALUES(?,?,1)").bind(n,new Date().toISOString()).run();return json({ok:true},201);
 }
 if(url.pathname.startsWith("/api/people/")&&req.method==="DELETE"){
  if(!await authenticate(req,env.DB))return json({error:"로그인이 필요합니다."},401);
  const id=Number(url.pathname.split("/").pop());if(!Number.isInteger(id)||id<1)return json({error:"잘못된 회원 번호입니다."},400);
  const person=await env.DB.prepare("SELECT id,is_active FROM people WHERE id=?").bind(id).first();if(!person||!person.is_active)return json({error:"회원을 찾을 수 없습니다."},404);
  await env.DB.prepare("UPDATE people SET is_active=0 WHERE id=?").bind(id).run();return json({ok:true},200);
 }
 if(url.pathname==="/api/stickers"&&req.method==="POST"){
  const user=await authenticate(req,env.DB);if(!user)return json({error:"로그인이 필요합니다."},401);
  const b=await req.json(),id=Number(b.recipientId),week=validWeek(b.week)||isoWeek(new Date());
  if(!Number.isInteger(id)||id<1)return json({error:"칭찬받는 사람을 선택해 주세요."},400);
  if(!await env.DB.prepare("SELECT id FROM people WHERE id=? AND is_active=1").bind(id).first())return json({error:"대상을 찾을 수 없습니다."},404);
  if(await env.DB.prepare("SELECT id FROM stickers WHERE week_key=? AND recipient_id=? AND giver_name=? COLLATE NOCASE").bind(week,id,user.display_name).first())return json({error:"이번 주에는 이 친구에게 이미 스티커를 줬어요."},409);
  await env.DB.prepare("INSERT INTO stickers(recipient_id,giver_name,week_key,created_at) VALUES(?,?,?,?)").bind(id,user.display_name,week,new Date().toISOString()).run();return json({ok:true},201);
 }
 return json({error:"Not found"},404);
 }catch(e){return json({error:"서버 오류",detail:String(e.message||e)},500)}
}};
async function init(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS people(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE COLLATE NOCASE,created_at TEXT NOT NULL)").run();
 try{await db.prepare("ALTER TABLE people ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1").run()}catch(e){if(!String(e.message||e).toLowerCase().includes("duplicate column"))throw e;}
 await db.prepare("CREATE TABLE IF NOT EXISTS stickers(id INTEGER PRIMARY KEY AUTOINCREMENT,recipient_id INTEGER NOT NULL,giver_name TEXT NOT NULL,week_key TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(recipient_id) REFERENCES people(id),UNIQUE(week_key,recipient_id,giver_name COLLATE NOCASE))").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,person_id INTEGER NOT NULL UNIQUE,created_at TEXT NOT NULL,FOREIGN KEY(person_id) REFERENCES people(id))").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS sessions(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,token_hash TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id))").run();
 await db.prepare("UPDATE people SET is_active=0 WHERE name IN ('사람1','사람2','사람3') AND NOT EXISTS(SELECT 1 FROM stickers WHERE stickers.recipient_id=people.id) AND NOT EXISTS(SELECT 1 FROM users WHERE users.person_id=people.id)").run();
}
async function authenticate(req,db){const t=bearer(req);if(!t)return null;const u=await db.prepare("SELECT u.id,u.username,u.display_name,u.person_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(await sha256(t),new Date().toISOString()).first();return u||null}
async function issueSession(db,u){const token=randomHex(32),now=new Date(),expires=new Date(now.getTime()+SESSION_DAYS*86400000).toISOString();await db.prepare("INSERT INTO sessions(user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?)").bind(u.id,await sha256(token),expires,now.toISOString()).run();return{token,expiresAt:expires,user:{id:u.id,username:u.username,display_name:u.display_name}}}
function bearer(r){const v=r.headers.get("Authorization")||"";return v.startsWith("Bearer ")?v.slice(7):""}
function clean(v){if(typeof v!=="string")return"";const s=v.trim().replace(/\s+/g," ");return s.length<=30?s:""}
function cleanUsername(v){return typeof v==="string"&&/^[a-z0-9_]{4,20}$/.test(v.toLowerCase())?v.toLowerCase():""}
function randomHex(n){const b=new Uint8Array(n);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,"0")).join("")}
async function hashPassword(p,s){const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(p),"PBKDF2",false,["deriveBits"]),salt=Uint8Array.from(s.match(/../g),x=>parseInt(x,16)),bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:PBKDF2_ITERATIONS,hash:"SHA-256"},k,256);return Array.from(new Uint8Array(bits),x=>x.toString(16).padStart(2,"0")).join("")}
async function sha256(v){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("")}
function constantTimeEqual(a,b){if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0}
function validWeek(v){return typeof v==="string"&&/^\d{4}-W\d{2}$/.test(v)?v:null}
function isoWeek(date){const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));const y=new Date(Date.UTC(d.getUTCFullYear(),0,1));return d.getUTCFullYear()+"-W"+String(Math.ceil((((d-y)/86400000)+1)/7)).padStart(2,"0")}
