/* Fastline — app logic. Data lives in this browser's storage; Backup saves/restores a JSON file. */
(function(){
"use strict";

/* ---------- Language ---------- */
const LANG_KEY="fastline.lang";
let lang=(()=>{ try{ const s=localStorage.getItem(LANG_KEY); if(s==="en"||s==="el") return s; }catch(e){}
  return (navigator.language||"").toLowerCase().startsWith("el")?"el":"en"; })();
const D=()=>window.I18N[lang];
function t(k,v){ let s=D()[k]; if(s==null) s=window.I18N.en[k]; if(s==null) return k;
  if(v) for(const x in v) s=s.split("{"+x+"}").join(v[x]); return s; }
const loc=()=>D().locale;

/* ---------- Science content (language-neutral parts) ---------- */
const MS=[{h:0,ev:"strong",src:"Anton 2018"},{h:4,ev:"strong",src:"Cahill 2006"},{h:8,ev:"strong",src:"Rothman 1991"},
  {h:12,ev:"strong",src:"Anton 2018"},{h:16,ev:"moderate",src:"de Cabo & Mattson 2019"},{h:18,ev:"moderate",src:"Anton 2018"},
  {h:24,ev:"moderate",src:"Rothman 1991"},{h:36,ev:"moderate",src:"Cahill 2006"},{h:48,ev:"moderate",src:"Ho 1988"},{h:72,ev:"emerging",src:"Cheng 2014"}];
const msTitle=i=>D().milestones[i][0], msDesc=i=>D().milestones[i][1], msCaution=i=>D().milestones[i][2]||"";

const FAT_PTS=[[0,.35],[4,.40],[8,.50],[12,.60],[16,.66],[24,.75],[36,.82],[48,.86],[72,.88]];
const GLY_PTS=[[0,0],[4,.45],[12,.40],[22,.30],[34,.18],[55,.04],[72,.02]];
function interp(pts,h){ if(h<=pts[0][0])return pts[0][1]; for(let i=1;i<pts.length;i++){ if(h<=pts[i][0]){const [a,b]=pts[i-1],[c,d]=pts[i];return b+(d-b)*(h-a)/(c-a);} } return pts[pts.length-1][1]; }

/* MET values: 2011 Compendium of Physical Activities (Ainsworth et al.) */
const EXERCISES=[["walk",3.0],["walkb",4.3],["hike",6.0],["cycl",4.0],["cycm",8.0],["mtb",8.5],["mtbh",14.0],
  ["run8",8.3],["run10",9.8],["swiml",5.8],["swimf",9.8],["row",7.0],["ellip",5.0],["wtm",3.5],["wtv",6.0],
  ["hiit",8.0],["yoga",2.5],["wsurfl",3.0],["wsurfh",11.0],["tennis",7.3],["football",7.0],["dance",5.0],["garden",3.8]];
const MET=Object.fromEntries(EXERCISES);

/* ---------- State & storage ---------- */
const LS="fastline.v1";
const DEFAULT_PROFILE={age:51,sex:"m",height:178,weight:85,activity:1.375,goal:16,example:true};
let state={profile:{...DEFAULT_PROFILE},active:null,fasts:[],weights:[],lastSummaryId:null,lastBackup:null};
function load(){ try{ const s=localStorage.getItem(LS); if(!s) return; const d=JSON.parse(s);
  state={...state,...d,profile:{...DEFAULT_PROFILE,...(d.profile||{})}}; }catch(e){} }
function save(){ try{ localStorage.setItem(LS,JSON.stringify(state)); }catch(e){} }

/* ---------- Calculations ---------- */
const bmr=p=>10*p.weight+6.25*p.height-5*p.age+(p.sex==="f"?-161:5);
const tdee=p=>bmr(p)*p.activity;
const bmi=(w,h)=>w/((h/100)**2);
function bmiCat(b){ if(b<18.5)return[t("bmiUnder"),"var(--warn)"]; if(b<25)return[t("bmiHealthy"),"var(--good)"]; if(b<30)return[t("bmiOver"),"var(--warn)"]; return[t("bmiObese"),"var(--bad)"]; }
function fastModel(H,p){
  const perHour=tdee(p)/24, step=0.1, glucoseGph=0.12*Math.min(Math.max(p.weight,45),120);
  const cap=Math.min(Math.max(1.2*p.weight,70),130);
  let fat=0,gly=0;
  for(let h=0;h<H;h+=step){ const dt=Math.min(step,H-h), m=h+dt/2;
    fat+=perHour*dt*interp(FAT_PTS,m)/9; gly+=glucoseGph*dt*interp(GLY_PTS,m); }
  gly=Math.min(gly,cap);
  return {kcal:perHour*Math.max(H,0),fat,gly,glyPct:gly/cap,water:gly*3};
}
function exFatShare(met,h){ const f=interp(FAT_PTS,h); return met<5?Math.min(.9,f+.1):met<8?f:Math.max(.25,f-.2); }
function exItem(e,p){ const met=MET[e.k]; if(!met) return {kcal:0,fat:0};
  const kcal=(met-1)*p.weight*e.min/60; return {kcal,fat:kcal*exFatShare(met,e.at)/9}; }
function exTotals(list,p){ return (list||[]).reduce((a,e)=>{const r=exItem(e,p); a.kcal+=r.kcal; a.fat+=r.fat; a.min+=e.min; return a;},{kcal:0,fat:0,min:0}); }
function fastTotal(H,p,list){ const m=fastModel(H,p), x=exTotals(list,p); return {...m,kcal:m.kcal+x.kcal,fat:m.fat+x.fat,ex:x}; }
function stageAt(H){ let i=0; MS.forEach((m,k)=>{ if(H>=m.h) i=k; }); return i; }

/* ---------- Formatting ---------- */
function hm(h){ const x=Math.max(0,Math.round(h*60)); return t("hm",{h:Math.floor(x/60),m:String(x%60).padStart(2,"0")}); }
const r0=n=>Math.round(n).toLocaleString(loc());
const r1=n=>(Math.round(n*10)/10).toLocaleString(loc(),{minimumFractionDigits:1,maximumFractionDigits:1});
const fmtDate=ms=>new Date(ms).toLocaleString(loc(),{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
const fmtDay=ms=>new Date(ms).toLocaleDateString(loc(),{day:"numeric",month:"short",year:"numeric"});
function toInput(ms){ const d=new Date(ms); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,16); }
function fromInput(v){ const x=new Date(v).getTime(); return isNaN(x)?null:x; }
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const $=id=>document.getElementById(id);

/* ---------- Static text ---------- */
function applyStatic(){
  document.documentElement.lang=lang;
  document.title=t("pageTitle");
  document.querySelectorAll("[data-i18n]").forEach(n=>{ n.textContent=t(n.dataset.i18n); });
  document.querySelectorAll("[data-i18n-aria]").forEach(n=>{ n.setAttribute("aria-label",t(n.dataset.i18nAria)); });
  $("langEn").setAttribute("aria-pressed",String(lang==="en"));
  $("langEl").setAttribute("aria-pressed",String(lang==="el"));
  $("saveState").textContent=t("savedLocal");
}
function setLang(l){ lang=l; try{ localStorage.setItem(LANG_KEY,l); }catch(e){} applyStatic(); renderAll(); renderInstall(); }
$("langEn").onclick=()=>setLang("en");
$("langEl").onclick=()=>setLang("el");

/* ---------- Live fast ---------- */
const elapsedH=()=>state.active?(Date.now()-state.active.start)/3.6e6:0;

function renderControls(){
  const c=$("controls"), now=toInput(Date.now());
  const goals=[12,13,14,16,18,20,24,36,48,72], extra={16:" (16:8)",18:" (18:6)",20:" (20:4)"};
  const gOpts=g=>goals.map(x=>`<option value="${x}" ${x===g?"selected":""}>${t("goalOpt",{x})}${extra[x]||""}</option>`).join("");
  if(!state.active){
    c.innerHTML=`<div class="label">${t("startTitle")}</div>
      <div class="field"><label for="fStart">${t("startedAt")}</label><input id="fStart" type="datetime-local" value="${now}" max="${now}"></div>
      <div class="field"><label for="fGoal">${t("goal")}</label><select id="fGoal">${gOpts(state.profile.goal||16)}</select></div>
      <div class="btns"><button class="btn" id="startBtn" type="button">${t("startBtn")}</button></div>
      <div class="err" id="cErr"></div>
      <p class="small" style="opacity:.75">${t("backdateHint")}</p>`;
    $("startBtn").onclick=startFast;
  } else {
    c.innerHTML=`<div class="label">${esc(t("startedLabel",{d:fmtDate(state.active.start)}))}</div>
      <div class="field"><label for="fGoal">${t("goal")}</label><select id="fGoal">${gOpts(state.active.goal)}</select></div>
      <div class="field"><label for="fEnd">${t("endedAt")}</label><input id="fEnd" type="datetime-local" value="${now}"></div>
      <div class="field"><label for="fWeight">${t("endWeight")}</label><input id="fWeight" type="number" step="0.1" min="25" max="350" inputmode="decimal" placeholder="${r1(state.profile.weight)}"></div>
      <div class="btns"><button class="btn" id="endBtn" type="button">${t("endBtn")}</button><button class="btn ghost" id="cancelBtn" type="button">${t("discard")}</button></div>
      <div class="err" id="cErr"></div>
      ${state.active.goal>=24?`<div class="note">${t("longFastNote")}</div>`:""}`;
    $("fGoal").onchange=e=>{ state.active.goal=+e.target.value; save(); renderControls(); tick(true); };
    $("endBtn").onclick=endFast;
    const cb=$("cancelBtn");
    cb.onclick=()=>{ if(cb.dataset.armed){ state.active=null; save(); renderAll(); }
      else { cb.dataset.armed="1"; cb.textContent=t("discardConfirm"); setTimeout(()=>{ if(cb.isConnected){cb.textContent=t("discard"); delete cb.dataset.armed;} },4000); } };
  }
}
function startFast(){
  const err=$("cErr"), x=fromInput($("fStart").value);
  if(!x) return err.textContent=t("errStartMissing");
  if(x>Date.now()+60000) return err.textContent=t("errStartFuture");
  if(state.profile.age<18) return err.textContent=t("errMinor");
  const goal=+$("fGoal").value;
  state.active={start:x,goal,exercises:[]}; state.profile.goal=goal;
  save(); renderAll();
}
function endFast(){
  const err=$("cErr"), end=fromInput($("fEnd").value);
  if(!end) return err.textContent=t("errEndMissing");
  if(end<=state.active.start) return err.textContent=t("errEndBefore");
  if(end>Date.now()+60000) return err.textContent=t("errEndFuture");
  const wv=parseFloat(String($("fWeight").value).replace(",","."));
  const prevMax=state.fasts.reduce((m,f)=>Math.max(m,(f.end-f.start)/3.6e6),0);
  const f={id:"f"+state.active.start,start:state.active.start,end,goal:state.active.goal,
    weightStart:state.profile.weight,weightEnd:(wv>=25&&wv<=350)?wv:null,prevLongest:prevMax,
    exercises:(state.active.exercises||[]).filter(e=>e.at<=(end-state.active.start)/3.6e6+0.01)};
  state.fasts=state.fasts.filter(x=>x.id!==f.id).concat(f).sort((a,b)=>a.start-b.start);
  state.active=null; state.lastSummaryId=f.id;
  if(f.weightEnd){ state.profile.weight=f.weightEnd; state.profile.example=false; addWeight(f.weightEnd,end); }
  save(); renderAll();
  $("sh").scrollIntoView({behavior:"smooth",block:"start"});
}
function addWeight(kg,at){ const w={id:"w"+at,t:at,kg}; state.weights=state.weights.filter(x=>x.id!==w.id).concat(w).sort((a,b)=>a.t-b.t); }

let lastStage=-1;
function tick(force){
  const H=elapsedH(), act=!!state.active, tot=Math.floor(H*3600);
  $("clock").innerHTML=`${Math.floor(tot/3600)}<small>${t("uh")}</small> ${String(Math.floor(tot%3600/60)).padStart(2,"0")}<small>${t("um")}</small>`;
  $("clockLabel").textContent=act?t("fastingFor"):t("noFast");
  $("secs").textContent=act?t("kcalSoFar",{s:String(tot%60).padStart(2,"0"),k:r0(fastTotal(H,state.profile,state.active.exercises).kcal)}):t("startToBegin");
  const goal=act?state.active.goal:(state.profile.goal||16), pct=Math.min(100,H/goal*100);
  $("goalFill").style.width=pct+"%";
  $("goalPct").textContent=Math.floor(pct)+"%";
  $("goalLeft").textContent=act?(H>=goal?t("goalReached",{g:goal}):t("toGoal",{d:hm(goal-H),g:goal})):t("goalIs",{g:goal});
  const sn=$("stageNow");
  if(act){ const i=stageAt(H), nx=MS[i+1];
    sn.innerHTML=`<span class="label">${t("currentStage")}</span><b>${esc(msTitle(i))}</b>${nx?`<span class="small" style="opacity:.8">${esc(t("nextIn",{t:msTitle(i+1),d:hm(nx.h-H)}))}</span>`:""}`;
    if(force||i!==lastStage){ lastStage=i; renderTimeline(); renderSummary(); }
  } else sn.innerHTML="";
}

/* ---------- Timeline ---------- */
function timelineHours(){
  if(state.active) return {H:elapsedH(),label:t("tlLive",{d:hm(elapsedH())})};
  const last=state.fasts[state.fasts.length-1];
  if(last){ const H=(last.end-last.start)/3.6e6; return {H,label:t("tlLast",{d:hm(H)})}; }
  return {H:-1,label:t("tlDefault")};
}
function renderTimeline(){
  const {H,label}=timelineHours(), ol=$("timeline"), cur=H>=0?stageAt(H):-1;
  $("tlFor").textContent=label;
  ol.innerHTML=MS.map((m,i)=>{
    const cls=H<0?"ahead":i<cur?"reached":i===cur?"current":"ahead";
    let st="";
    if(H>=0){ if(i<cur) st=t("stReached"); else if(i===cur) st=state.active?t("stHere"):t("stDeepest"); else st=state.active?t("stIn",{d:hm(m.h-H)}):t("stNot"); }
    const ca=msCaution(i);
    return `<li class="ms ${cls}"><div class="hr">${t("hours",{n:m.h})}</div><div class="dot"></div><div class="body">
      <div class="sechead"><h3>${esc(msTitle(i))}</h3>${st?`<span class="state">${esc(st)}</span>`:""}</div>
      <p>${esc(msDesc(i))}</p>
      <div class="meta"><span class="chip ev-${m.ev}">${esc(D().ev[m.ev])}</span><span class="muted">${t("source")}: ${esc(m.src)}</span></div>
      ${ca?`<div class="caution">${esc(ca)}</div>`:""}</div></li>`;
  }).join("");
  requestAnimationFrame(()=>placeFill(H));
}
function placeFill(H){
  const items=[...$("timeline").querySelectorAll(".ms")], fill=$("tlFill");
  if(H<0||!items.length){ fill.style.height="0px"; return; }
  const tops=items.map(n=>n.offsetTop+12), i=stageAt(H), nx=MS[i+1];
  let y=tops[i]; if(nx){ const f=Math.min(1,(H-MS[i].h)/(nx.h-MS[i].h)); y=tops[i]+(tops[i+1]-tops[i])*f; }
  fill.style.height=Math.max(0,y-8)+"px";
}
window.addEventListener("resize",()=>placeFill(timelineHours().H));

/* ---------- Profile & BMI ---------- */
function fillProfileForm(){ const p=state.profile;
  $("pAge").value=p.age; $("pSex").value=p.sex; $("pH").value=p.height; $("pW").value=p.weight; $("pAct").value=String(p.activity);
  $("profTag").textContent=p.example?t("exampleTag"):""; }
function renderBMI(){
  const p=state.profile, b=bmi(p.weight,p.height), [cat,col]=bmiCat(b), adult=p.age>=18;
  const pos=Math.min(100,Math.max(0,(b-15)/25*100));
  const seg=(a,z,c)=>`<span style="width:${(z-a)/25*100}%;background:${c}"></span>`;
  $("bmiBox").innerHTML=`
    <div class="stats">
      <div class="stat"><span class="label">${t("bmi")}</span><span class="v">${r1(b)}</span><span class="s" style="color:${adult?col:"var(--muted)"};font-weight:700">${adult?cat:t("bmiChild")}</span></div>
      <div class="stat"><span class="label">${t("dailyEnergy")}</span><span class="v">${r0(tdee(p))}<small> kcal</small></span><span class="s">${t("resting",{k:r0(bmr(p))})}</span></div>
    </div>
    ${adult?`<div><div class="bmiscale" aria-hidden="true">${seg(15,18.5,"var(--warn)")}${seg(18.5,25,"var(--good)")}${seg(25,30,"var(--warn)")}${seg(30,40,"var(--bad)")}</div>
    <div class="bmimark" aria-hidden="true"><i style="left:${pos}%"></i></div>
    <div class="bmilabels"><span>15</span><span>${r1(18.5)}</span><span>25</span><span>30</span><span>40</span></div></div>`
    :`<p class="small caution">${t("bmiChildNote")}</p>`}
    ${p.age>=65?`<p class="small muted">${t("bmiSenior")}</p>`:""}`;
}
$("profileForm").addEventListener("submit",e=>{
  e.preventDefault(); const err=$("pErr"); err.classList.remove("ok");
  const num=id=>parseFloat(String($(id).value).replace(",","."));
  const p={age:num("pAge"),sex:$("pSex").value,height:num("pH"),weight:num("pW"),activity:+$("pAct").value};
  if(!(p.age>=10&&p.age<=110)) return err.textContent=t("errAge");
  if(!(p.height>=100&&p.height<=230)) return err.textContent=t("errHeight");
  if(!(p.weight>=25&&p.weight<=350)) return err.textContent=t("errWeight");
  const changedW=p.weight!==state.profile.weight||state.profile.example;
  state.profile={...state.profile,...p,example:false};
  if(changedW) addWeight(p.weight,Date.now());
  save(); renderAll();
  err.classList.add("ok"); err.textContent=t("saved"); setTimeout(()=>{ err.textContent=""; err.classList.remove("ok"); },2000);
});

/* ---------- Summary ---------- */
function summaryFast(){ return state.fasts.find(x=>x.id===state.lastSummaryId)||state.fasts[state.fasts.length-1]; }
function renderSummary(){
  const box=$("summary"), tag=$("sumTag"), p=state.profile;
  let f,H,live=false;
  if(state.active){ live=true; H=elapsedH(); f={goal:state.active.goal,exercises:state.active.exercises}; tag.textContent=t("liveEstimate"); }
  else { f=summaryFast();
    if(!f){ tag.textContent=""; box.innerHTML=`<div class="empty">${t("sumEmpty")}</div>`; return; }
    H=(f.end-f.start)/3.6e6; tag.textContent=fmtDate(f.end); }
  const m=fastTotal(H,p,f.exercises), i=stageAt(H), badges=[];
  if(H>=f.goal) badges.push(`<span class="badge gold">${t("badgeGoal",{g:f.goal})}</span>`);
  if(!live&&f.prevLongest!=null&&H>f.prevLongest&&state.fasts.length>1) badges.push(`<span class="badge gold">${t("badgeLongest")}</span>`);
  if(m.ex.min) badges.push(`<span class="badge gold">${t("badgeEx",{m:r0(m.ex.min)})}</span>`);
  for(let k=1;k<=i;k++) badges.push(`<span class="badge">${t("hours",{n:MS[k].h})} · ${esc(msTitle(k))}</span>`);
  const wChange=(!live&&f.weightEnd&&f.weightStart)?f.weightEnd-f.weightStart:null;
  box.innerHTML=`
    <div class="stats">
      <div class="stat"><span class="label">${t("fasted")}</span><span class="v">${hm(H)}</span><span class="s">${live?t("andCounting"):t("goalH",{g:f.goal})}</span></div>
      <div class="stat"><span class="label">${t("energyUsed")}</span><span class="v">${r0(m.kcal)}<small> kcal</small></span><span class="s">${m.ex.kcal?t("inclExKcal",{k:r0(m.ex.kcal)}):t("fromStores")}</span></div>
      <div class="stat"><span class="label">${t("fatUsed")}</span><span class="v">${r0(m.fat)}<small> g</small></span><span class="s">${m.ex.fat?t("inclExFat",{g:r0(m.ex.fat)}):t("fatKcal",{k:r0(m.fat*9)})}</span></div>
      <div class="stat"><span class="label">${t("liverGly")}</span><span class="v">${r0(m.glyPct*100)}<small> %</small></span><span class="s">${t("glyUsed",{g:r0(m.gly),w:r1(m.water/1000)})}</span></div>
    </div>
    ${wChange!=null?`<p class="small"><b>${t("scaleChange")}</b> ${wChange<=0?"−":"+"}${r1(Math.abs(wChange))} kg. ${t("scaleNote")}</p>`:""}
    <div><div class="label" style="margin-bottom:6px">${t("msReached")}</div><div class="badges">${badges.join("")||`<span class="muted small">${t("msNone")}</span>`}</div></div>`;
}

/* ---------- Exercise ---------- */
function exTarget(){
  if(state.active){ state.active.exercises=state.active.exercises||[]; return {list:state.active.exercises,H:elapsedH(),live:true}; }
  const f=summaryFast(); if(!f) return null;
  f.exercises=f.exercises||[]; return {list:f.exercises,H:(f.end-f.start)/3.6e6,live:false};
}
function renderExercise(){
  const box=$("exercise"), T=exTarget(), p=state.profile, names=D().exercises;
  if(!T){ box.innerHTML=""; return; }
  const items=T.list.map((e,idx)=>{ const r=exItem(e,p);
    return `<li><span class="what"><b>${esc(names[e.k]||e.k)}</b><br><span class="muted small">${t("exItem",{m:r0(e.min),h:Number.isInteger(e.at)?r0(e.at):r1(e.at)})}</span></span>
      <span class="btns"><span class="gain">${t("exGain",{k:r0(r.kcal),g:r0(r.fat)})}</span><button class="linkbtn" type="button" data-exdel="${idx}">${t("exRemove")}</button></span></li>`; }).join("");
  const defAt=Math.max(0,Math.floor(T.live?T.H:T.H-1));
  box.innerHTML=`<div class="exbox">
    <div class="sechead"><h3>${t("exTitle")}</h3><span class="label">${T.live?t("exLive"):t("exLast")}</span></div>
    ${items?`<ul class="exlist">${items}</ul>`:`<p class="small muted">${t("exEmpty")}</p>`}
    <form class="exform" id="exForm" novalidate>
      <div class="field"><label for="exType">${t("exType")}</label><select id="exType">${EXERCISES.map(([k])=>`<option value="${k}">${esc(names[k])}</option>`).join("")}</select></div>
      <div class="field"><label for="exMin">${t("exMin")}</label><input id="exMin" type="number" min="1" max="600" step="1" value="30" inputmode="numeric"></div>
      <div class="field"><label for="exAt">${t("exAt")}</label><input id="exAt" type="number" min="0" step="0.5" value="${defAt}" inputmode="decimal"></div>
      <button class="btn ghost" type="submit">${t("exAdd")}</button>
    </form>
    <div class="err" id="exErr"></div>
    <p class="small muted">${t("exNote")}</p></div>`;
  $("exForm").addEventListener("submit",ev=>{
    ev.preventDefault(); const err=$("exErr"), X=exTarget(); if(!X) return;
    const num=id=>parseFloat(String($(id).value).replace(",","."));
    const k=$("exType").value, min=num("exMin"), at=num("exAt");
    if(!(min>=1&&min<=600)) return err.textContent=t("errExMin");
    if(!(at>=0&&at<=X.H+0.01)) return err.textContent=t("errExAt",{h:r1(X.H)});
    X.list.push({k,min,at}); save(); renderSummary(); renderExercise(); renderHistory(); tick(false);
  });
  box.querySelectorAll("[data-exdel]").forEach(b=>b.onclick=()=>{
    const X=exTarget(); if(!X) return; X.list.splice(+b.dataset.exdel,1); save(); renderSummary(); renderExercise(); renderHistory(); tick(false); });
}

/* ---------- Projections ---------- */
function renderWhatIf(){
  const H=+$("whatIf").value, p=state.profile, m=fastModel(H,p);
  $("whatIfVal").textContent=t("hours",{n:H});
  $("whatIfStats").innerHTML=`
    <div class="stat"><span class="label">${t("energyUsed")}</span><span class="v">${r0(m.kcal)}<small> kcal</small></span></div>
    <div class="stat"><span class="label">${t("fatUsed")}</span><span class="v">${r0(m.fat)}<small> g</small></span></div>`;
  const last=state.fasts[state.fasts.length-1], lastH=last?(last.end-last.start)/3.6e6:null;
  $("whatIfReach").innerHTML=MS.slice(1).map((x,j)=>`<li class="${x.h<=H?"":"no"}"><b>${t("hours",{n:x.h})}</b><span>${x.h<=H?"":t("notReached")}${esc(msTitle(j+1))}</span></li>`).join("")
    +(lastH!=null?`<li><b>${t("vs")}</b><span>${H>lastH?t("vsLonger",{d:hm(H-lastH),g:r0(m.fat-fastModel(lastH,p).fat)}):t("vsLast",{d:hm(lastH)})}</span></li>`:"");
  $("whatIfWarn").textContent=H>48?t("warn48"):H>24?t("warn24"):"";
}
function recentRoutine(){
  const since=Date.now()-28*864e5, rec=state.fasts.filter(f=>f.end>=since);
  if(rec.length<2) return null;
  return {perWeek:rec.length/4,avgH:rec.reduce((s,f)=>s+(f.end-f.start)/3.6e6,0)/rec.length};
}
function renderRoutine(){
  const p=state.profile, days=Math.min(7,Math.max(1,+$("rDays").value||0)), cut=Math.max(0,+$("rCut").value||0), rr=recentRoutine();
  $("routineBasis").textContent=rr?t("routineRecent",{n:r1(rr.perWeek),h:r1(rr.avgH)}):t("routineDefault");
  const pts=[]; for(let w=0;w<=12;w++) pts.push(p.weight-cut*days*w/7700);
  const end=pts[12];
  $("routineText").innerHTML=t("routineText",{w:r1(end),d:r1(p.weight-end),b0:r1(bmi(p.weight,p.height)),b1:r1(bmi(end,p.height))});
  $("routineChart").innerHTML=lineChart(pts.map((v,i)=>({x:i,y:v})),{xl:i=>i===0?t("now"):t("wk",{n:i}),xticks:[0,2,4,6,8,10,12],unit:"kg"});
}
function niceStep(raw){ const p=Math.pow(10,Math.floor(Math.log10(raw||1))), n=raw/p; return (n<1.5?1:n<3?2:n<7?5:10)*p; }
function lineChart(pts,o){
  if(pts.length<2) return "";
  const W=520,Hh=200,L=46,R=14,T=14,B=28, xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
  let y0=Math.min(...ys), y1=Math.max(...ys); if(y1-y0<1){ y0-=.5; y1+=.5; }
  const pad=(y1-y0)*.12; y0-=pad; y1+=pad;
  const x0=Math.min(...xs), x1=Math.max(...xs);
  const X=x=>L+(x-x0)/(x1-x0||1)*(W-L-R), Y=y=>T+(y1-y)/(y1-y0)*(Hh-T-B);
  const step=niceStep((y1-y0)/4), ticks=[]; for(let v=Math.ceil(y0/step)*step; v<=y1; v+=step) ticks.push(v);
  const d=pts.map((p,i)=>(i?"L":"M")+X(p.x).toFixed(1)+" "+Y(p.y).toFixed(1)).join(" ");
  const area=d+` L${X(pts[pts.length-1].x).toFixed(1)} ${Hh-B} L${X(pts[0].x).toFixed(1)} ${Hh-B} Z`;
  const last=pts[pts.length-1];
  return `<svg viewBox="0 0 ${W} ${Hh}" width="100%" style="min-width:300px;display:block" role="img" aria-label="${o.unit}">
    ${ticks.map(v=>`<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L-6}" y="${Y(v)+4}" text-anchor="end">${step<1?r1(v):r0(v)}</text>`).join("")}
    ${o.xticks.map(x=>`<text x="${X(x)}" y="${Hh-8}" text-anchor="middle">${esc(o.xl(x))}</text>`).join("")}
    <path d="${area}" fill="var(--accent-soft)" opacity=".7"/>
    <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="${X(last.x)}" cy="${Y(last.y)}" r="5" fill="var(--glow)"/>
    <text x="${Math.min(X(last.x),W-R-4)}" y="${Math.max(Y(last.y)-10,T+8)}" text-anchor="end" style="fill:var(--ink);font-weight:500">${r1(last.y)} ${o.unit}</text>
  </svg>`;
}

/* ---------- History ---------- */
function streak(){
  const days=new Set(state.fasts.filter(f=>(f.end-f.start)>=12*3.6e6).map(f=>new Date(f.end).toDateString()));
  let n=0; const d=new Date(); if(!days.has(d.toDateString())) d.setDate(d.getDate()-1);
  while(days.has(d.toDateString())){ n++; d.setDate(d.getDate()-1); }
  return n;
}
function renderHistory(){
  const fs=state.fasts, p=state.profile;
  $("histTag").textContent=fs.length?t("fastsLogged",{n:fs.length}):"";
  const totH=fs.reduce((s,f)=>s+(f.end-f.start)/3.6e6,0), longest=fs.reduce((m,f)=>Math.max(m,(f.end-f.start)/3.6e6),0);
  const fat=fs.reduce((s,f)=>s+fastTotal((f.end-f.start)/3.6e6,p,f.exercises).fat,0);
  const W=state.weights, fw=W[0], lw=W[W.length-1];
  $("lifetime").innerHTML=`
    <div class="stat"><span class="label">${t("totalFasting")}</span><span class="v">${r0(totH)}<small> ${t("uh")}</small></span><span class="s">${t("nFasts",{n:fs.length})}</span></div>
    <div class="stat"><span class="label">${t("average")}</span><span class="v">${fs.length?r1(totH/fs.length):"0"}<small> ${t("uh")}</small></span><span class="s">${t("longest",{h:r1(longest)})}</span></div>
    <div class="stat"><span class="label">${t("streak")}</span><span class="v">${streak()}<small> ${t("days")}</small></span><span class="s">${t("streakNote")}</span></div>
    <div class="stat"><span class="label">${t("fatUsed")}</span><span class="v">${r1(fat/1000)}<small> kg</small></span><span class="s">${t("allFasts")}</span></div>
    <div class="stat"><span class="label">${t("weightChange")}</span><span class="v">${W.length>1?((lw.kg-fw.kg)<=0?"−":"+")+r1(Math.abs(lw.kg-fw.kg)):"–"}<small> kg</small></span><span class="s">${t("weighIns",{n:W.length})}</span></div>`;
  const wc=$("weightChart");
  if(W.length>=2){
    const t0=fw.t, span=(lw.t-t0)/864e5||1, pts=W.map(w=>({x:(w.t-t0)/864e5,y:w.kg}));
    wc.innerHTML=`<div class="label" style="margin-bottom:4px">${t("weightTrend",{b:r1(bmi(lw.kg,p.height))})}</div>`
      +lineChart(pts,{xticks:[0,span/2,span],xl:x=>new Date(t0+x*864e5).toLocaleDateString(loc(),{day:"numeric",month:"short"}),unit:"kg"});
  } else wc.innerHTML="";
  const tw=$("historyTable");
  if(!fs.length){ tw.innerHTML=`<div class="empty">${t("histEmpty")}</div>`; return; }
  tw.innerHTML=`<table><thead><tr><th>${t("thStart")}</th><th>${t("thEnd")}</th><th class="num">${t("thHours")}</th><th>${t("thStage")}</th><th class="num">${t("thEx")}</th><th class="num">${t("thFat")}</th><th class="num">${t("thWeight")}</th><th></th></tr></thead><tbody>
    ${fs.slice().reverse().map(f=>{ const H=(f.end-f.start)/3.6e6, ex=exTotals(f.exercises,p);
      return `<tr><td>${esc(fmtDate(f.start))}</td><td>${esc(fmtDate(f.end))}</td>
      <td class="num mono">${r1(H)}${H>=f.goal?` <span style="color:var(--good)" title="${t("goalReachedTitle")}">●</span>`:""}</td>
      <td>${esc(msTitle(stageAt(H)))}</td>
      <td class="num mono">${ex.min?r0(ex.min)+" "+t("um"):"–"}</td>
      <td class="num mono">${r0(fastTotal(H,p,f.exercises).fat)}</td>
      <td class="num mono">${f.weightEnd?r1(f.weightEnd):"–"}</td>
      <td><button class="linkbtn" data-del="${f.id}" type="button">${t("del")}</button></td></tr>`; }).join("")}</tbody></table>`;
  tw.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{
    if(!b.dataset.armed){ b.dataset.armed="1"; b.textContent=t("delConfirm"); setTimeout(()=>{ if(b.isConnected){ b.textContent=t("del"); delete b.dataset.armed; } },4000); return; }
    const id=b.dataset.del; state.fasts=state.fasts.filter(x=>x.id!==id);
    if(state.lastSummaryId===id) state.lastSummaryId=null;
    save(); renderAll();
  });
}

/* ---------- Backup ---------- */
function renderBackup(){
  const tag=$("backupTag");
  tag.textContent=state.lastBackup?t("lastBackup",{d:fmtDay(state.lastBackup)}):t("neverBackup");
  const due=state.fasts.length>0&&(!state.lastBackup||Date.now()-state.lastBackup>14*864e5);
  tag.style.color=due?"var(--warn)":"";
  tag.title=due?t("backupDue"):"";
}
$("exportBtn").onclick=async()=>{
  const err=$("bErr"); err.classList.remove("ok"); err.textContent="";
  const now=Date.now();
  const data={app:"fastline",version:1,exportedAt:now,data:{...state,lastBackup:now}};
  const name="fastline-backup-"+new Date(now).toISOString().slice(0,10)+".json";
  const blob=new Blob([JSON.stringify(data,null,1)],{type:"application/json"});
  let done=false;
  try{
    const file=new File([blob],name,{type:"application/json"});
    if(navigator.canShare&&navigator.canShare({files:[file]})&&/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)){
      await navigator.share({files:[file],title:name}); done=true;
    }
  }catch(e){ if(e&&e.name==="AbortError") return; }
  if(!done){
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name;
    document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1000);
  }
  state.lastBackup=now; save(); renderBackup();
  err.classList.add("ok"); err.textContent=t("exported");
};
$("importFile").addEventListener("change",e=>{
  const file=e.target.files&&e.target.files[0], err=$("bErr"), box=$("importConfirm");
  err.classList.remove("ok"); err.textContent=""; box.innerHTML="";
  if(!file) return;
  const rd=new FileReader();
  rd.onload=()=>{
    let b=null; try{ b=JSON.parse(rd.result); }catch(x){}
    e.target.value="";
    if(!b||b.app!=="fastline"||!b.data||!Array.isArray(b.data.fasts)){ err.textContent=t("importBad"); return; }
    box.innerHTML=`<div class="note" style="background:var(--glow-soft)"><p class="small" style="margin-bottom:8px">${esc(t("importAsk",{n:b.data.fasts.length,d:fmtDay(b.exportedAt||Date.now())}))}</p>
      <div class="btns"><button class="btn" type="button" id="impYes">${t("importYes")}</button><button class="btn ghost" type="button" id="impNo">${t("importNo")}</button></div></div>`;
    $("impNo").onclick=()=>{ box.innerHTML=""; };
    $("impYes").onclick=()=>{
      const d=b.data;
      state={profile:{...DEFAULT_PROFILE,...(d.profile||{})},active:d.active||null,fasts:d.fasts||[],weights:Array.isArray(d.weights)?d.weights:[],
        lastSummaryId:d.lastSummaryId||null,lastBackup:d.lastBackup||b.exportedAt||null};
      save(); box.innerHTML=""; renderAll(); err.classList.add("ok"); err.textContent=t("imported");
    };
  };
  rd.readAsText(file);
});

/* ---------- Install prompt & offline ---------- */
let deferredPrompt=null;
const standalone=()=>window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;
const isIOS=()=>/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
function renderInstall(){
  const bar=$("installBar"), btn=$("installBtn"), txt=$("installText");
  if(standalone()){ bar.hidden=true; return; }
  if(deferredPrompt){ txt.textContent=t("installAndroid"); btn.textContent=t("installBtn"); btn.hidden=false; bar.hidden=false; }
  else if(isIOS()&&location.protocol.startsWith("http")){ txt.textContent=t("installIos"); btn.hidden=true; bar.hidden=false; }
  else bar.hidden=true;
}
window.addEventListener("beforeinstallprompt",e=>{ e.preventDefault(); deferredPrompt=e; renderInstall(); });
$("installBtn").onclick=async()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); try{ await deferredPrompt.userChoice; }catch(e){} deferredPrompt=null; renderInstall(); };
window.addEventListener("appinstalled",()=>{ deferredPrompt=null; renderInstall(); });
if("serviceWorker" in navigator && location.protocol.startsWith("http")){
  window.addEventListener("load",()=>{ navigator.serviceWorker.register("sw.js").catch(()=>{}); });
}
if(navigator.storage&&navigator.storage.persist){ navigator.storage.persist().catch(()=>{}); }

/* ---------- Wire up ---------- */
$("whatIf").addEventListener("input",renderWhatIf);
$("rDays").addEventListener("input",renderRoutine);
$("rCut").addEventListener("input",renderRoutine);

function renderAll(){
  fillProfileForm(); renderBMI(); renderControls(); renderTimeline(); renderSummary(); renderExercise();
  renderWhatIf(); renderRoutine(); renderHistory(); renderBackup(); lastStage=-1; tick(false);
}
load();
const rr=recentRoutine(); if(rr) $("rDays").value=Math.min(7,Math.max(1,Math.round(rr.perWeek)));
applyStatic(); renderAll(); renderInstall();
setInterval(()=>{ if(state.active) tick(false); },1000);
document.addEventListener("visibilitychange",()=>{ if(!document.hidden){ tick(false); renderTimeline(); } });
window.addEventListener("storage",e=>{ if(e.key===LS){ load(); renderAll(); } });
})();
