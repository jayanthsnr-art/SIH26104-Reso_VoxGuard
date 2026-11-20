const API_BASE=(window.VOXGUARD_API_BASE||"http://127.0.0.1:8000").replace(/\/$/,""),API=API_BASE+"/api/predict",HEALTH=API_BASE+"/api/health",DEMO_FALLBACK=true; // set VOXGUARD_API_BASE to the deployed API origin; disable fallback for real analysis
const MODEL_RATE=16000,MODEL_SAMPLES=64600,MODEL_SECONDS=MODEL_SAMPLES/MODEL_RATE;
const $=id=>document.getElementById(id), C=339.3;
let blob=null,fname="",peaks=[],rec=null,timer=null,history=[];
try{history=JSON.parse(localStorage.getItem("rg_hist")||"[]")}catch(e){}

function toast(m){const t=$("toast");t.textContent=m;t.style.display="block";setTimeout(()=>t.style.display="none",3200)}
function setConn(ok){const c=$("conn");c.className="pill"+(ok?" ok":"");c.textContent=ok?"Backend connected":"Preview mode: backend offline"}
async function ping(){try{const res=await fetch(HEALTH);if(!res.ok)throw new Error("Health endpoint unavailable");const h=await res.json();setConn(true);const info=document.querySelector("#conn");info.title="VOXGUARD API "+(h.api_version||"")+" · model "+(h.model_loaded?"loaded":"status unknown")}catch(e){setConn(false)}}

function draw(color){
  const c=$("wave"),x=c.getContext("2d"),W=c.width=c.clientWidth*2,H=c.height=192;
  x.clearRect(0,0,W,H);x.fillStyle=getComputedStyle(document.documentElement).getPropertyValue(wv).trim();
  peaks.forEach((p,i)=>{const h=Math.max(6,p*H*.95),w=W/peaks.length;x.fillRect(i*w+2,(H-h)/2,w-4,h)});
}
async function setAudio(b,name){
  blob=b;fname=name;$("aud").src=URL.createObjectURL(b);$("player").classList.add("show");$("go").disabled=false;
  $("res").className="panel res";$("verdict").textContent="Ready to analyze";$("pct").textContent="0";utlVals=[];$("utl").getContext("2d").clearRect(0,0,9999,9999);$("fg").style.strokeDashoffset=C;$("sim").style.display="none";
  peaks=[];try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)(),buf=await ctx.decodeAudioData(await b.arrayBuffer());ctx.close();
    const d=buf.getChannelData(0),n=80,s=Math.floor(d.length/n);
    for(let i=0;i<n;i++){let m=0;for(let j=0;j<s;j+=40)m=Math.max(m,Math.abs(d[i*s+j]||0));peaks.push(m)}
  }catch(e){peaks=Array.from({length:80},()=>.1)}
  wv="--accent";draw();
}
$("drop").onclick=()=>$("file").click();
$("drop").onkeydown=e=>{if(e.key==="Enter")$("file").click()};
$("file").onchange=e=>{const f=e.target.files[0];if(f)setAudio(f,f.name)};
$("drop").ondragover=e=>{e.preventDefault();$("drop").classList.add("over")};
$("drop").ondragleave=()=>$("drop").classList.remove("over");
$("drop").ondrop=e=>{e.preventDefault();$("drop").classList.remove("over");const f=e.dataTransfer.files[0];if(f)setAudio(f,f.name)};

$("rec").onclick=async()=>{
  if(rec&&rec.state==="recording"){rec.stop();return}
  try{
    const st=await navigator.mediaDevices.getUserMedia({audio:true}),ch=[];rec=new MediaRecorder(st);
    rec.ondataavailable=e=>ch.push(e.data);
    rec.onstop=()=>{st.getTracks().forEach(t=>t.stop());clearInterval(timer);$("rec").classList.remove("on");$("recTxt").textContent="Record voice";setAudio(new Blob(ch,{type:rec.mimeType}),"recording.webm")};
    rec.start();let s=0;$("rec").classList.add("on");$("recTxt").textContent="Stop recording (0s)";
    timer=setInterval(()=>{s++;$("recTxt").textContent="Stop recording ("+s+"s)"},1000);
  }catch(e){toast("Microphone not available. Upload a file instead.")}
};

function busy(on){$("go").disabled=on;$("go").textContent=on?"Analyzing…":"Analyze voice";$("player").classList.toggle("scan",on)}
async function predict(b,name,wait){
  try{const res=await fetch(API,{method:"POST",headers:{"Content-Type":"audio/wav"},body:b});const r=await res.json();if(!res.ok){if(r.label==="INSUFFICIENT AUDIO")return{r,sim:false};throw new Error(r.error||r.reason||"Prediction request failed")}setConn(true);return{r,sim:false}}
  catch(e){setConn(false);if(!DEMO_FALLBACK)throw e;await new Promise(k=>setTimeout(k,wait));simR=Math.max(2,Math.min(98,simR+(Math.random()-.4)*12));const rk=Math.round(simR);return{r:{label:rk>50?"Cloned":"Real",confidence:rk>50?rk:100-rk,risk:rk},sim:true}}
}
$("go").onclick=async()=>{
  if(!blob)return;busy(true);
  try{
    const pcm=await toPCM(blob,$("phone").checked),W=MODEL_SAMPLES,H=32000,n=Math.min(40,pcm.length<=W?1:Math.ceil((pcm.length-W)/H)+1),vals=[];let sim=false;
    for(let i=0;i<n;i++){const w=new Float32Array(W),start=i*H;w.set(pcm.subarray(start,start+W));const o=await predict(wav(w),"window.wav",150);if(o.r.label==="INSUFFICIENT AUDIO")throw new Error(o.r.reason||"Audio quality was insufficient");vals.push(riskOf(o.r));if(o.sim)sim=true}
    if(!vals.length)throw new Error("No complete audio windows");
    let R=vals[0],pk=R;for(const v of vals.slice(1)){R=ALPHA*v+(1-ALPHA)*R;pk=Math.max(pk,R)}
    utlVals=vals;drawUtl(vals);show({risk:pk},sim,pk);
    if(pcm.length>=W+40*H)toast("Analyzed the first 80 seconds of this recording.");
  }catch(e){toast("Could not analyze: "+(e.message||"backend unavailable or audio could not be decoded"))}
  busy(false);
};
const T={
en:{safe:"Safe",sus:"Suspicious",dan:"Danger",aT_sus:"Be careful. This voice looks unusual.",aT_dan:"Possible voice impersonation.",aB:"This voice may be AI-generated. Do not share OTP, passwords or money. Hang up and call back on a number you know.",sf:"No strong sign of cloning. Still verify any request for money or personal data.",start:"Start call monitor",stop:"Stop call monitor"},
};
let lastBand="",curBand="",wv="--accent";
// Risk bands: 0-30 safe, 31-60 suspicious, 61-100 danger
let demoPolicyOverride=null;
function band(s){if(demoPolicyOverride)return demoPolicyOverride==="safe"?"safe":demoPolicyOverride==="suspicious"?"sus":"dan";return s>thr?"dan":s>thr/2?"sus":"safe"}
function riskOf(r){if(typeof r.risk==="number")return Math.max(0,Math.min(100,r.risk));if(Number.isFinite(+r.confidence))return Math.max(0,Math.min(100,/clon|fake|spoof/i.test(r.label)?+r.confidence:100-(+r.confidence)));if(r.class_index===0||/potential spoof/i.test(r.label))return 75;if(r.class_index===1||/bona fide/i.test(r.label))return 15;return 0}
function paint(){if(!curBand)return;const L=T.en;$("verdict").textContent=L[curBand];$("aT").textContent=L["aT_"+curBand]||"";$("aB").textContent=L.aB+(curBand==="sus"?" "+CH.en:"");$("sf").textContent=L.sf}
function speak(){try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(T.en.aB);u.lang="en-IN";speaking=segMute=true;u.onend=u.onerror=()=>{speaking=false;muteUntil=Date.now()+4500};speechSynthesis.speak(u)}catch(e){}}
function drawTrend(){
  const c=$("trend"),x=c.getContext("2d"),W=c.width=c.clientWidth*2,H=c.height=220,g=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim(),Y=v=>H-v/100*H;
  x.clearRect(0,0,W,H);
  [[0,thr/2,"--ok"],[thr/2,thr,"--warn"],[thr,100,"--bad"]].forEach(([a,b,k])=>{x.globalAlpha=.14;x.fillStyle=g(k);x.fillRect(0,Y(b),W,Y(a)-Y(b))});
  x.globalAlpha=1;if(!trend.length)return;
  x.strokeStyle=g("--text");x.lineWidth=4;x.beginPath();
  trend.forEach((v,i)=>{const px=trend.length===1?W/2:i*W/(trend.length-1);i?x.lineTo(px,Y(v)):x.moveTo(px,Y(v))});x.stroke();
}
function show(r,sim,score){
  const s=Math.round(score!==undefined?score:riskOf(r)),b=band(s);curBand=b;
  $("res").className="panel res "+(b==="dan"?"bad":b==="sus"?"sus":"good");
  $("fg").style.strokeDashoffset=C*(1-s/100);
  const z=performance.now();(function f(t){const k=Math.min(1,(t-z)/800);$("pct").textContent=Math.round(s*k);if(k<1)requestAnimationFrame(f)})(z);
  $("sim").textContent=sim?"Simulated result (demo call or backend offline)":"Experimental class mapped to a display indicator; not a calibrated probability.";$("sim").style.display="block";
  paint();pol(b);if(b==="dan"&&lastBand!=="dan"){speak();if(navigator.vibrate)navigator.vibrate(300)}lastBand=b;
  wv=b==="dan"?"--bad":b==="sus"?"--warn":"--ok";draw();
  history.unshift({n:fname,bad:b==="dan",c:s,sim,t:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})});history=history.slice(0,5);
  try{localStorage.setItem("rg_hist",JSON.stringify(history))}catch(e){}
  renderHist();
}
function renderHist(){
  const u=$("hist");u.innerHTML="";
  if(!history.length){u.innerHTML="<li>No checks yet. Add a clip to start.</li>";return}
  history.forEach(h=>{const l=document.createElement("li"),a=document.createElement("span"),b=document.createElement("span");
    a.textContent=h.n+" at "+h.t;b.className="tag "+(h.bad?"bad":"good");b.textContent="Risk "+h.c+" of 100"+(h.sim?" (simulated)":"");l.append(a,b);u.append(l)});
}
// Live call monitor: records 5-second segments from the microphone and checks each one
let isLive=false,stream=null,actx=null,seg=0,flagged=0,t0=0,tick=null,raf=null,score=0,peak=0,sum=0,trend=[],speaking=false,segMute=false,simR=30,thr=60,demo=null,disp=null,sr=null,utlVals=[],chain=[],logQ=Promise.resolve(),proc=null,ring=new Float32Array(MODEL_SAMPLES),filled=0,inflight=false,muteUntil=0,hopT=null,sessionTimer=null,sessionStage="ready";
function setSessionState(state,hint){
  sessionStage=state;const label={ready:"Ready",ringing:"Ringing",answered:"Answered · Analyzing",ended:"Ended"}[state];
  const pill=$("sessionState");pill.dataset.state=state;pill.innerHTML="<i></i>"+label;
  $("callSession").dataset.state=state;
  $("sessionHint").textContent=hint;
  document.querySelectorAll(".session-steps [data-step]").forEach(el=>{el.classList.toggle("current",el.dataset.step===state);el.classList.toggle("done",["ringing","answered","ended"].indexOf(el.dataset.step)<["ready","ringing","answered","ended"].indexOf(state))});
  $("sessionStart").disabled=state==="ringing"||state==="answered";
  $("sessionEnd").disabled=state!=="ringing"&&state!=="answered";
  $("callWave").classList.toggle("active",state==="answered");
}
function endSession(){clearTimeout(sessionTimer);sessionTimer=null;setSessionState("ended","Call ended. The score shown is from the simulated session.");$("callStat").textContent="Demo call ended."}
function demoScenario(){
  const key=$("demoCase").value,greenCeiling=Math.max(5,Math.floor(thr/2)-3),amberCeiling=Math.max(greenCeiling+5,thr-3);
  if(key==="safe")return{label:"Safe caller",risk:[.18,.3,.42,.55,.68,.72,.64,.58,.5,.62].map(x=>Math.round(greenCeiling*x))};
  if(key==="spoof")return{label:"Potential spoof",risk:[thr+4,thr+10,thr+17,thr+24,thr+30,thr+34,thr+37,thr+39,thr+40,thr+41].map(x=>Math.min(96,x))};
  const amberStart=greenCeiling+2,amberSpan=Math.max(4,amberCeiling-amberStart);
  return{label:"Suspicious voice",risk:[.12,.24,.4,.58,.76,.9,1,.92,.96,.9].map(x=>Math.round(greenCeiling*.72+(amberStart+amberSpan*x-greenCeiling*.72)*Math.min(1,x*1.25)))};
}
$("sessionStart").onclick=()=>{
  demoPolicyOverride=$("demoCase").value;
  clearTimeout(sessionTimer);if(isLive)stopLive();if(demo)stopDemo();
  seg=0;flagged=0;score=0;peak=0;sum=0;trend=[];lastBand="";$ ("chips").innerHTML="";drawTrend();chain=[];logQ=Promise.resolve();$("evN").textContent="No entries yet";fname="simulated-in-app-call";$("callTime").textContent="00:00";
  $("res").className="panel res";$("pct").textContent="0";$("fg").style.strokeDashoffset=C;$("verdict").textContent="Waiting for answer";$("sim").style.display="block";
  setSessionState("ringing","Calling demo contact… analysis starts automatically when answered.");$("callStat").textContent="Ringing…";
  const mode=$("sens").value,modeName=mode==="70"?"Low":mode==="60"?"Normal":"High",scenario=demoScenario(),curve=scenario.risk;
  sessionTimer=setTimeout(()=>{if(sessionStage!=="ringing")return;setSessionState("answered","Demo call answered. Showing the simulated “"+scenario.label+"” case at "+modeName+" sensitivity.");$("callStat").textContent="Simulating: "+scenario.label;let i=0;demo=setInterval(()=>{if(sessionStage!=="answered"||i>=curve.length){clearInterval(demo);demo=null;if(sessionStage==="answered")endSession();return}const v=curve[i];applySeg({label:v>50?"Cloned":"Real",confidence:v>50?v:100-v,risk:v},4+i,true);i++},900)},1300);
};
$("sessionEnd").onclick=()=>endSession();
function tab(u){if(u&&isLive)stopLive();if(u&&demo)stopDemo();$("pU").hidden=!u;$("pL").hidden=u;$("tU").classList.toggle("on",u);$("tL").classList.toggle("on",!u)}
$("tU").onclick=()=>tab(true);$("tL").onclick=()=>tab(false);
async function startLive(){
  demoPolicyOverride=null;
  if(demo)stopDemo();
  try{
    if($("src").value==="tab"){const d=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true}),a=d.getAudioTracks();disp=d;if(!a.length){d.getTracks().forEach(t=>t.stop());disp=null;return toast("No tab audio shared. Tick Share tab audio in the picker.")}stream=new MediaStream(a)}
    else stream=await navigator.mediaDevices.getUserMedia({audio:true});
  }catch(e){return toast("Audio not available. Allow access or use Upload recording.")}
  isLive=true;seg=0;flagged=0;score=0;peak=0;sum=0;trend=[];lastBand="";drawTrend();chain=[];logQ=Promise.resolve();$("evN").textContent="No entries yet";t0=Date.now();$("chips").innerHTML="";$("liveBtn").textContent=T.en.stop;$("liveBtn").classList.add("on");$("callStat").textContent="Listening…";
  actx=new (window.AudioContext||window.webkitAudioContext)();const an=actx.createAnalyser(),buf=new Uint8Array(an.fftSize);actx.createMediaStreamSource(stream).connect(an);
  (function lv(){if(!isLive)return;an.getByteTimeDomainData(buf);let s=0;for(const v of buf)s+=(v-128)*(v-128);$("lvl").style.width=Math.min(100,Math.sqrt(s/buf.length)*4)+"%";raf=requestAnimationFrame(lv)})();
  tick=setInterval(()=>{const s=Math.floor((Date.now()-t0)/1000);$("callTime").textContent=String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0")},1000);
  startWin();if($("src").value==="mic")startSR();
}
// 4-second windows with a 1-second hop, 16 kHz mono, sent as WAV
function startWin(){
  filled=0;ring.fill(0);inflight=false;
  const ratio=actx.sampleRate/16000,src=actx.createMediaStreamSource(stream),z=actx.createGain();
  proc=actx.createScriptProcessor(4096,1,1);z.gain.value=0;
  proc.onaudioprocess=e=>{
    const d=e.inputBuffer.getChannelData(0),n=Math.floor(d.length/ratio),o=new Float32Array(n);
    for(let i=0;i<n;i++){const a=Math.floor(i*ratio),b=Math.min(d.length,Math.floor((i+1)*ratio));let s=0;for(let j=a;j<b;j++)s+=d[j];o[i]=s/Math.max(1,b-a)}
    const count=Math.min(n,MODEL_SAMPLES);ring.copyWithin(0,count);ring.set(o.subarray(n-count),MODEL_SAMPLES-count);filled=Math.min(MODEL_SAMPLES,filled+count);
  };
  src.connect(proc);proc.connect(z);z.connect(actx.destination);
  hopT=setInterval(()=>{if(!isLive||inflight||filled<MODEL_SAMPLES||speaking||Date.now()<muteUntil)return;inflight=true;sendWin(wav(ring.slice()),Math.round((Date.now()-t0)/1000))},1000);
}
const ALPHA=0.3,WARM=10; // R(t)=ALPHA*p+(1-ALPHA)*R(t-1); verdict after WARM seconds of audio
function applySeg(r,at,sim){
  const rk=riskOf(r);seg++;const secs=Math.max(0,at);if(rk>thr)flagged++;
  score=seg===1?rk:ALPHA*rk+(1-ALPHA)*score;peak=Math.max(peak,score);sum+=score;trend.push(score);
  if(rk>thr/2){const c=document.createElement("span");c.className="chip"+(rk>thr?" bad":" sus");c.textContent=at+"s: "+Math.round(rk);$("chips").append(c)}
  $("callStat").textContent="Windows: "+seg+", flagged: "+flagged+(sim?" (simulated)":"");
  logQ=logQ.then(()=>logEv(rk,score,band(score)));drawTrend();
  if(secs<WARM){
    $("res").className="panel res";$("verdict").textContent="Analyzing "+secs+" of "+WARM+" s";$("fg").style.strokeDashoffset=C*(1-secs/WARM);$("pct").textContent="…";
    document.querySelectorAll("#pol span").forEach(s=>s.classList.remove("on"));$("polTxt").textContent="Collecting evidence before a verdict…";
  }else show(r,sim,score);
}
async function sendWin(b,at){
  fname="call-"+at+"s.wav";
  try{const o=await predict(b,fname,200);if(isLive)applySeg(o.r,at,o.sim)}
  catch(e){toast("Cannot reach the backend. Is app.py running?")}
  inflight=false;
}
function stopLive(){
  isLive=false;clearInterval(tick);cancelAnimationFrame(raf);
  clearInterval(hopT);if(proc){proc.onaudioprocess=null;try{proc.disconnect()}catch(e){}proc=null}if(stream)stream.getTracks().forEach(t=>t.stop());if(actx)actx.close();if(disp){disp.getTracks().forEach(t=>t.stop());disp=null}stopSR();
  $("lvl").style.width="0";$("liveBtn").textContent=T.en.start;$("liveBtn").classList.remove("on");$("callStat").textContent=seg?"Call ended. Peak risk "+Math.round(peak)+", average "+Math.round(sum/seg):"Stopped";
}
$("liveBtn").onclick=()=>isLive?stopLive():startLive();
// Extra features: demo call, scam words, alerts, report, sensitivity, large text
const CH={en:"Ask a question only the real person would know."};
const MSG={en:"I may be on a scam call (AI voice detected). Please call me now."};
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
const KW=/otp|password|bank|transfer|urgent|gift card|upi|police|arrest|கடவுச்சொல்|பணம்|அவசரம்|வங்கி|ओटीपी|पासवर्ड|पैसे|बैंक|अरेस्ट|तुरंत/gi;
$("sens").onchange=e=>{thr=+e.target.value;drawTrend()};
$("wa").onclick=()=>window.open("https://wa.me/?text="+encodeURIComponent(MSG.en),"_blank");
function stopDemo(){clearInterval(demo);demo=null;if(sessionStage==="ringing"||sessionStage==="answered")endSession();$("demoBtn").textContent="Run demo call"}
$("demoBtn").onclick=()=>{if(sessionStage==="ringing"||sessionStage==="answered")$("sessionEnd").click();else $("sessionStart").click()};
function startSR(){
  if(!SR)return;
  try{
    sr=new SR();sr.continuous=true;sr.interimResults=true;sr.lang="en-IN";
    const box=$("tr");box.hidden=false;box.textContent="Listening for scam words (experimental, Chrome only)…";
    sr.onresult=e=>{const t=Array.from(e.results).map(r=>r[0].transcript).join(" ").slice(-300);box.innerHTML=t.replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])).replace(KW,m=>"<mark>"+m+"</mark>")};
    sr.onend=()=>{if(isLive&&sr)try{sr.start()}catch(e){}};sr.onerror=()=>{};sr.start();
  }catch(e){sr=null}
}
function stopSR(){if(sr){sr.onend=null;try{sr.stop()}catch(e){}sr=null}}
$("rep").onclick=()=>{
  if(!seg)return toast("No call to report yet. Run a live call or the demo first.");
  const c=document.createElement("canvas");c.width=900;c.height=520;const x=c.getContext("2d"),g=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  x.fillStyle=g("--bg");x.fillRect(0,0,900,520);x.fillStyle=g("--text");x.font="700 34px sans-serif";x.fillText("Reso VoxGuard call report",40,60);
  x.font="22px sans-serif";x.fillStyle=g("--muted");
  x.fillText("Segments checked: "+seg+"   Flagged: "+flagged,40,110);
  x.fillText("Peak risk: "+Math.round(peak)+"   Average risk: "+Math.round(sum/seg)+"   "+new Date().toLocaleString(),40,145);
  const t=$("trend");if(t.width&&t.height)x.drawImage(t,40,180,820,300);
  const a=document.createElement("a");a.download="voxguard-report.png";a.href=c.toDataURL("image/png");a.click();
};
// Helpers: WAV encoding, phone-quality resampling, upload timeline, evidence chain, policy engine
function wav(s){const n=s.length,b=new ArrayBuffer(44+n*2),v=new DataView(b),w=(o,t)=>{for(let i=0;i<t.length;i++)v.setUint8(o+i,t.charCodeAt(i))};
  w(0,"RIFF");v.setUint32(4,36+n*2,true);w(8,"WAVE");w(12,"fmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,"data");v.setUint32(40,n*2,true);
  for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.max(-1,Math.min(1,s[i]))*32767,true);return new Blob([b],{type:"audio/wav"})}
async function toPCM(b,phone){
  const ctx=new (window.AudioContext||window.webkitAudioContext)();let buf;try{buf=await ctx.decodeAudioData(await b.arrayBuffer())}finally{await ctx.close()}
  const rate=phone?8000:16000,off=new OfflineAudioContext(1,Math.ceil(buf.duration*rate),rate),src=off.createBufferSource();src.buffer=buf;src.connect(off.destination);src.start();
  return (await off.startRendering()).getChannelData(0).slice();
}
function drawUtl(v){const c=$("utl"),x=c.getContext("2d"),W=c.width=c.clientWidth*2,H=c.height=120,g=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim(),w=W/v.length;x.clearRect(0,0,W,H);
  v.forEach((r,i)=>{const b=band(r);x.fillStyle=g(b==="dan"?"--bad":b==="sus"?"--warn":"--ok");const h=Math.max(4,r/100*H);x.fillRect(i*w+2,H-h,w-4,h)})}
async function sha(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("")}
async function logEv(rk,sc,b){
  try{const e={n:chain.length+1,t:new Date().toISOString(),risk:Math.round(rk),smoothed:Math.round(sc),band:b,prev:chain.length?chain[chain.length-1].hash:"0".repeat(64)};
  e.hash=await sha(JSON.stringify(e));chain.push(e);$("evN").textContent=chain.length+" entries, last hash "+e.hash.slice(0,12)}
  catch(err){$("evN").textContent="Evidence log needs https or localhost"}
}
$("evV").onclick=async()=>{let ok=true,p="0".repeat(64);for(const e of chain){const {hash,...r}=e;if(r.prev!==p||await sha(JSON.stringify(r))!==hash){ok=false;break}p=hash}toast(chain.length?(ok?"Chain verified: "+chain.length+" entries intact.":"Chain broken: an entry was changed."):"No entries yet.")};
$("evE").onclick=()=>{if(!chain.length)return toast("No entries yet.");const a=document.createElement("a");a.download="voxguard-evidence.json";a.href="data:application/json,"+encodeURIComponent(JSON.stringify(chain,null,1));a.click()};
const POL={safe:["allow","ALLOW: call continues normally."],sus:["mfa","STEP-UP MFA: extra verification requested (simulated)."],dan:["freeze","FREEZE: high-risk actions blocked, call not dropped (simulated)."]};
function pol(b){const changed=lastBand&&lastBand!==b;document.querySelectorAll("#pol span").forEach(s=>s.classList.toggle("on",s.dataset.p===POL[b][0]));$("polTxt").textContent=POL[b][1];if(changed){const p=$("pol");p.classList.remove("policy-change");void p.offsetWidth;p.classList.add("policy-change");setTimeout(()=>p.classList.remove("policy-change"),850);if(b!=="safe")toast(POL[b][1])}}
$("theme").onclick=()=>{const h=document.documentElement,light=h.dataset.theme!=="light";h.dataset.theme=light?"light":"dark";$("themeIcon").innerHTML=light?'<path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/>':'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>';$ ("theme").setAttribute("aria-label",light?"Switch to dark theme":"Switch to light theme");if(peaks.length)draw();drawTrend();if(utlVals.length)drawUtl(utlVals)};
renderHist();ping();
if("serviceWorker" in navigator && location.protocol!=="file:")navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
let installEvent=null;
const installButton=$("installApp"),installMessage=$("installMessage"),iosDevice=/iphone|ipad|ipod/i.test(navigator.userAgent)&&!window.MSStream;
function isInstalled(){return window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true}
function closeInstallPrompt(){$("installPrompt").hidden=true;$("sessionStart").focus()}
function updateInstallMessage(){
  if(isInstalled()){installButton.textContent="App is installed";installButton.disabled=true;installMessage.textContent="Reso VoxGuard is already on your home screen.";return}
  installMessage.textContent=iosDevice?"On iPhone or iPad: tap Share in Safari, then choose Add to Home Screen.":"Tap Install app, or choose Install app / Add to Home Screen from your browser menu.";
}
$("installPrompt").addEventListener("keydown",e=>{if(e.key!=="Tab")return;const controls=Array.from($("installPrompt").querySelectorAll("button:not([disabled])")),first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}});
$("installClose").onclick=closeInstallPrompt;
$("installContinue").onclick=closeInstallPrompt;
window.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("installPrompt").hidden)closeInstallPrompt()});
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installEvent=e;installMessage.textContent="Ready to install. Tap Install app to add VoxGuard to your phone."});
installButton.onclick=async()=>{
  if(isInstalled()){updateInstallMessage();return}
  if(!installEvent){updateInstallMessage();return}
  const promptEvent=installEvent;installEvent=null;await promptEvent.prompt();const {outcome}=await promptEvent.userChoice;
  if(outcome==="accepted")closeInstallPrompt();else installMessage.textContent="Installation was cancelled. You can try again from your browser menu.";
};
window.addEventListener("appinstalled",()=>{installEvent=null;updateInstallMessage();closeInstallPrompt()});
updateInstallMessage();
window.addEventListener("load",()=>setTimeout(()=>{$("installPrompt").hidden=false;$("installApp").focus()},1100),{once:true});



window.addEventListener("load",()=>setTimeout(()=>$("splash").classList.add("dismissed"),750),{once:true});
