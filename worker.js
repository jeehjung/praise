const DEFAULTS = ["사람1","사람2","사람3"];
export default {
 async fetch(req, env) {
  const u=new URL(req.url), cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type"};
  if(req.method==="OPTIONS") return new Response(null,{headers:cors});
  const out=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"Content-Type":"application/json; charset=utf-8",...cors}});
  try {
   await init(env.DB);
   if(u.pathname==="/api/state"&&req.method==="GET"){
    const week=validWeek(u.searchParams.get("week"))||isoWeek(new Date());
    const p=await env.DB.prepare("SELECT id,name FROM people ORDER BY id").all();
    const c=await env.DB.prepare("SELECT recipient_id,COUNT(*) count FROM stickers WHERE week_key=? GROUP BY recipient_id").bind(week).all();
    const r=await env.DB.prepare("SELECT s.id,s.week_key,s.created_at,p.name recipient,s.giver_name FROM stickers s JOIN people p ON p.id=s.recipient_id WHERE s.week_key=? ORDER BY s.created_at DESC LIMIT 300").bind(week).all();
    const counts=Object.fromEntries(c.results.map(x=>[x.recipient_id,x.count]));
    return out({week,people:p.results.map(x=>({...x,stickers:counts[x.id]||0})),recent:r.results});
   }
   if(u.pathname==="/api/people"&&req.method==="POST"){
    const {name}=await req.json(), n=clean(name); if(!n)return out({error:"이름은 1~30자로 입력해 주세요."},400);
    if(await env.DB.prepare("SELECT id FROM people WHERE name=? COLLATE NOCASE").bind(n).first())return out({error:"이미 등록된 이름입니다."},409);
    await env.DB.prepare("INSERT INTO people(name,created_at) VALUES(?,?)").bind(n,new Date().toISOString()).run(); return out({ok:true},201);
   }
   if(u.pathname==="/api/stickers"&&req.method==="POST"){
    const b=await req.json(),id=Number(b.recipientId),giver=clean(b.giverName),week=validWeek(b.week)||isoWeek(new Date());
    if(!Number.isInteger(id)||id<1)return out({error:"칭찬받는 사람을 선택해 주세요."},400);
    if(!giver)return out({error:"칭찬하는 사람 이름을 입력해 주세요."},400);
    if(!await env.DB.prepare("SELECT id FROM people WHERE id=?").bind(id).first())return out({error:"대상을 찾을 수 없습니다."},404);
    if(await env.DB.prepare("SELECT id FROM stickers WHERE week_key=? AND recipient_id=? AND giver_name=? COLLATE NOCASE").bind(week,id,giver).first())return out({error:"이번 주에는 이 대상에게 이미 스티커를 줬습니다."},409);
    await env.DB.prepare("INSERT INTO stickers(recipient_id,giver_name,week_key,created_at) VALUES(?,?,?,?)").bind(id,giver,week,new Date().toISOString()).run(); return out({ok:true},201);
   }
   if(u.pathname==="/"||u.pathname==="/index.html")return new Response(HTML,{headers:{"Content-Type":"text/html; charset=utf-8"}});
   return out({error:"Not found"},404);
  } catch(e){return out({error:"서버 오류",detail:String(e.message||e)},500)}
 }
};
async function init(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS people(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE COLLATE NOCASE,created_at TEXT NOT NULL)").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS stickers(id INTEGER PRIMARY KEY AUTOINCREMENT,recipient_id INTEGER NOT NULL,giver_name TEXT NOT NULL,week_key TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(recipient_id) REFERENCES people(id),UNIQUE(week_key,recipient_id,giver_name COLLATE NOCASE))").run();
 const x=await db.prepare("SELECT COUNT(*) n FROM people").first();
 if(!x.n)for(const n of DEFAULTS)await db.prepare("INSERT OR IGNORE INTO people(name,created_at) VALUES(?,?)").bind(n,new Date().toISOString()).run();
}
function clean(v){if(typeof v!=="string")return"";const s=v.trim().replace(/\s+/g," ");return s.length<=30?s:""}
function validWeek(s){return typeof s==="string"&&/^\d{4}-W\d{2}$/.test(s)?s:null}
function isoWeek(date){const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));const y=new Date(Date.UTC(d.getUTCFullYear(),0,1));return d.getUTCFullYear()+"-W"+String(Math.ceil((((d-y)/86400000)+1)/7)).padStart(2,"0")}
const HTML=String.raw`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>칭찬 스티커</title><style>
*{box-sizing:border-box}body{margin:0;background:#fffaf5;color:#292524;font:16px system-ui,"Noto Sans KR",sans-serif}header{text-align:center;padding:26px 12px;background:#ffedd5}h1{margin:0}main{max-width:850px;margin:auto;padding:16px}section{background:white;border:1px solid #f1e5d8;border-radius:16px;padding:16px;margin:0 0 14px}.row{display:flex;gap:8px;align-items:end;flex-wrap:wrap}.field{flex:1;min-width:180px}label{display:block;font-weight:700;font-size:14px;margin-bottom:6px}input,button{font:inherit;border:1px solid #d6d3d1;border-radius:10px;padding:10px}input{width:100%}button{cursor:pointer;font-weight:700}.primary{background:#ea580c;color:white;border-color:#ea580c}.soft{background:#fff7ed;color:#9a3412}.muted{color:#78716c;font-size:13px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}.person{border:1px solid #fed7aa;border-radius:14px;padding:14px;background:#fffdf9}.person h3{margin:0 0 8px}.count{font-size:32px;color:#c2410c;font-weight:800;margin:8px 0 14px}.give{width:100%}table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;padding:9px 5px;border-bottom:1px solid #eee}#notice{display:none;padding:10px;background:#fef3c7;border-radius:10px;margin-bottom:12px}#notice.show{display:block}.empty{padding:15px;text-align:center;color:#78716c}@media(max-width:480px){.row button{width:100%}}</style>
<header><h1>🌟 칭찬 스티커</h1><p>작은 칭찬을 모아 서로의 성장을 응원해요!</p></header><main><div id="notice"></div>
<section><h3>칭찬하는 사람</h3><div class="row"><div class="field"><label for="giver">내 이름</label><input id="giver" maxlength="30" placeholder="예: 홍길동"></div><button id="save" class="soft">이름 저장</button></div><p class="muted">이름은 이 브라우저에 저장됩니다. 다른 기기에서는 다시 입력해 주세요.</p></section>
<section class="row" style="justify-content:space-between"><div><h3>주간 칭찬 현황</h3><span class="muted">월요일~일요일 기준</span></div><div><label for="week">조회할 주</label><input id="week" type="week"></div></section>
<section><h3>칭찬 스티커 주기</h3><div id="people" class="cards"><div class="empty">불러오는 중…</div></div></section>
<section><h3>칭찬받는 사람 추가</h3><form id="add" class="row"><div class="field"><label for="newname">이름</label><input id="newname" maxlength="30" required placeholder="예: 사람4"></div><button class="primary">대상 추가</button></form></section>
<section><h3>이번 주 칭찬 기록</h3><div id="records" class="empty">불러오는 중…</div></section><p class="muted" style="text-align:center">기록은 공용 서버에 저장되어 누구나 확인할 수 있습니다.</p></main>
<script>
const $=x=>document.getElementById(x);let state=null;$('giver').value=localStorage.getItem('praiseGiverName')||'';
function weekNow(){const d=new Date(),day=(d.getDay()+6)%7;d.setDate(d.getDate()-day+3);const f=new Date(d.getFullYear(),0,4);return d.getFullYear()+'-W'+String(1+Math.round(((d-f)/86400000-3+((f.getDay()+6)%7))/7)).padStart(2,'0')}
$('week').value=weekNow();function note(s){$('notice').textContent=s;$('notice').className='show';setTimeout(()=>$('notice').className='',4000)}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function api(path,opt){const r=await fetch(path,opt),d=await r.json();if(!r.ok)throw Error(d.error||'요청 실패');return d}
async function load(){try{state=await api('/api/state?week='+encodeURIComponent($('week').value||weekNow()));render()}catch(e){note('불러오기 실패: '+e.message)}}
function render(){if(!state)return;const giver=$('giver').value.trim();$('people').innerHTML=state.people.map(p=>'<article class="person"><h3>'+esc(p.name)+'</h3><span class="muted">이번 주 받은 칭찬</span><div class="count">'+p.stickers+'개</div><button class="primary give" data-id="'+p.id+'" '+(!giver?'disabled':'')+'>🌟 칭찬 스티커 주기</button></article>').join('')||'<div class="empty">등록된 사람이 없습니다.</div>';
document.querySelectorAll('.give').forEach(b=>b.onclick=async()=>{const name=$('giver').value.trim();if(!name||!localStorage.getItem('praiseGiverName'))return note('이름을 입력하고 먼저 이름 저장을 눌러 주세요.');b.disabled=true;try{await api('/api/stickers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recipientId:+b.dataset.id,giverName:name,week:$('week').value||weekNow()})});note('칭찬 스티커를 전달했습니다!');await load()}catch(e){note(e.message);b.disabled=false}});
$('records').innerHTML=state.recent.length?'<table><thead><tr><th>받은 사람</th><th>준 사람</th><th>시간</th></tr></thead><tbody>'+state.recent.map(r=>'<tr><td>'+esc(r.recipient)+'</td><td>'+esc(r.giver_name)+'</td><td>'+new Date(r.created_at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})+'</td></tr>').join('')+'</tbody></table>':'<div class="empty">이 주에는 아직 기록이 없습니다.</div>'}
$('save').onclick=()=>{const n=$('giver').value.trim();if(!n)return note('이름을 입력해 주세요.');localStorage.setItem('praiseGiverName',n);note('이름을 저장했습니다.');render()};$('giver').oninput=render;$('week').onchange=load;
$('add').onsubmit=async e=>{e.preventDefault();try{await api('/api/people',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('newname').value.trim()})});$('newname').value='';note('대상을 추가했습니다.');await load()}catch(e){note(e.message)}};load();
</script></html>`;