/* Cast demo: draws a live scene into a canvas, plays generated music (Web Audio) and streams both
   to a Chromecast / Android TV with assets/shared/cast.js. */
(function(){
'use strict';
Tools.i18n({
  de:{
    'st.idle':'Nicht verbunden','st.loading':'Cast wird geladen …','st.choosing':'Fernseher wählen …',
    'st.connecting':'Verbinde mit {tv} …','st.streaming':'Live auf {tv}','st.tv':'Fernseher',
    'st.stats':'{w}×{h} · {fps} fps · {kbps} kbit/s','music.play':'Musik an','music.pause':'Musik aus',
    'cast.start':'Auf Fernseher streamen','cast.stop':'Streaming beenden',
    'err.no-app-id':'Erst im Menü die Cast-App-ID eintragen (Einrichtung).',
    'err.unsupported':'Streamen auf Chromecast geht nur in Chrome oder Edge (Android, Computer).',
    'err.sdk-load':'Das Cast-Programm von Google ließ sich nicht laden. Online?',
    'err.session':'Der Fernseher hat die Empfänger-App nicht gestartet. App-ID und Einrichtung prüfen.',
    'err.no-answer':'Der Fernseher antwortet nicht. Empfänger-Adresse in der Developer Console prüfen.',
    'err.ice-failed':'Keine Verbindung zum Fernseher. Gleiches WLAN? Sonst im Menü die Verbindungshilfe einschalten.',
    'err.receiver':'Fehler auf dem Fernseher – Diagnose kopieren.','err.webrtc':'Streamen fehlgeschlagen – Diagnose kopieren.',
    'err.cancel':'Abgebrochen.',
    'idOk':'App-ID gespeichert.','idBad':'Die App-ID hat 8 Zeichen (0–9, A–F).','copied':'Adresse kopiert.',
    'mcp.scene':'Szene gewechselt','mcp.status':'Stream-Status gelesen','live':'LIVE','sc.wavesName':'Wellen','sc.starsName':'Sterne','sc.barsName':'Balken'
  },
  en:{
    title:'Cast Demo',sub:'Stream picture and music live to the TV.',
    view:'Picture streamed to the TV – tap for effects',scene:'Scene','sc.waves':'Waves','sc.stars':'Stars','sc.bars':'Bars',
    'tv.h':'TV & setup','tv.appId':'Cast app ID','tv.appIdPh':'e.g. 1A2B3C4D',
    'tv.appIdHint':'8 characters from the Google Cast SDK Developer Console (see setup below).',
    'tv.quality':'Picture quality','q.480':'480p – needs little Wi-Fi','q.720':'720p – default','q.1080':'1080p – needs good Wi-Fi',
    'tv.local':'Also play the music on the phone while streaming','tv.log':'Show a log on the TV (troubleshooting)',
    'tv.stun':'Use a connection helper (Google STUN server) – only if it does not work without',
    'setup.h':'Setup (once)','setup.copy':'Copy address',
    'st.idle':'Not connected','st.loading':'Loading Cast …','st.choosing':'Pick a TV …',
    'st.connecting':'Connecting to {tv} …','st.streaming':'Live on {tv}','st.tv':'TV',
    'st.stats':'{w}×{h} · {fps} fps · {kbps} kbit/s','music.play':'Music on','music.pause':'Music off',
    'cast.start':'Stream to TV','cast.stop':'Stop streaming',
    'err.no-app-id':'First enter the Cast app ID in the menu (setup).',
    'err.unsupported':'Streaming to Chromecast only works in Chrome or Edge (Android, computer).',
    'err.sdk-load':'Could not load Google\'s Cast program. Online?',
    'err.session':'The TV did not start the receiver app. Check the app ID and setup.',
    'err.no-answer':'The TV does not answer. Check the receiver address in the Developer Console.',
    'err.ice-failed':'No connection to the TV. Same Wi-Fi? Otherwise turn on the connection helper in the menu.',
    'err.receiver':'Error on the TV – copy the diagnostics.','err.webrtc':'Streaming failed – copy the diagnostics.',
    'err.cancel':'Cancelled.',
    'idOk':'App ID saved.','idBad':'The app ID has 8 characters (0–9, A–F).','copied':'Address copied.',
    'mcp.scene':'Scene switched','mcp.status':'Stream status read','live':'LIVE','sc.wavesName':'Waves','sc.starsName':'Stars','sc.barsName':'Bars'
  }
});
const t=Tools.t, $=Tools.$;
const LS='cast-demo.settings.v1';
const SCENES=['waves','stars','bars'];
const QUALITY={480:{w:854,h:480,bitrate:1500000},720:{w:1280,h:720,bitrate:4000000},1080:{w:1920,h:1080,bitrate:8000000}};
const settings=Object.assign({appId:'',quality:'720',local:false,tvLog:false,stun:false,scene:'waves'},Tools.load(LS,{}));
if(!QUALITY[settings.quality]) settings.quality='720';
if(!SCENES.includes(settings.scene)) settings.scene='waves';
const save=()=>Tools.save(LS,settings);

/* ---------- Music (generated, original: Am – F – C – G at 100 bpm) ---------- */
let ac=null, master, localOut, streamOut, analyser, delay, noise, playing=false, timer=0, nextTime=0, step=0, startTime=0;
const BPM=100, STEP=60/BPM/4;
const CHORDS=[[57,60,64],[53,57,60],[48,52,55],[55,59,62]];   // Am F C G (MIDI)
const hz=m=>440*Math.pow(2,(m-69)/12);
function audio(){
  if(ac) return ac;
  ac=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'playback'});
  master=ac.createGain(); master.gain.value=.7;
  const comp=ac.createDynamicsCompressor(); master.connect(comp);
  analyser=ac.createAnalyser(); analyser.fftSize=256; analyser.smoothingTimeConstant=.75;
  comp.connect(analyser);
  localOut=ac.createGain(); comp.connect(localOut).connect(ac.destination);
  streamOut=ac.createMediaStreamDestination(); comp.connect(streamOut);
  delay=ac.createDelay(1); delay.delayTime.value=STEP*3;
  const fb=ac.createGain(); fb.gain.value=.32; const wet=ac.createGain(); wet.gain.value=.35;
  delay.connect(fb).connect(delay); delay.connect(wet).connect(master);
  noise=ac.createBuffer(1,ac.sampleRate,ac.sampleRate);
  const d=noise.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
  Tools.diag.log('audio ready',{rate:ac.sampleRate});
  return ac;
}
function env(param,t0,peak,a,dur){
  param.setValueAtTime(0.0001,t0);
  param.exponentialRampToValueAtTime(peak,t0+a);
  param.exponentialRampToValueAtTime(0.0001,t0+dur);
}
function voice(type,freq,t0,dur,peak,cutoff,dest=master,detune=0){
  const o=ac.createOscillator(), f=ac.createBiquadFilter(), g=ac.createGain();
  o.type=type; o.frequency.value=freq; o.detune.value=detune;
  f.type='lowpass'; f.frequency.value=cutoff;
  env(g.gain,t0,peak,Math.min(.02,dur/4),dur);
  o.connect(f).connect(g).connect(dest);
  o.start(t0); o.stop(t0+dur+.05);
  return g;
}
function drum(kind,t0){
  if(kind==='kick'){
    const o=ac.createOscillator(), g=ac.createGain();
    o.frequency.setValueAtTime(150,t0); o.frequency.exponentialRampToValueAtTime(42,t0+.18);
    env(g.gain,t0,.9,.005,.32); o.connect(g).connect(master); o.start(t0); o.stop(t0+.35);
    return;
  }
  const s=ac.createBufferSource(), f=ac.createBiquadFilter(), g=ac.createGain();
  s.buffer=noise;
  if(kind==='hat'){ f.type='highpass'; f.frequency.value=7500; env(g.gain,t0,.16,.002,.05); }
  else { f.type='bandpass'; f.frequency.value=1700; f.Q.value=.8; env(g.gain,t0,.42,.003,.16); }
  s.connect(f).connect(g).connect(master); s.start(t0,Math.random()*.5); s.stop(t0+.2);
}
function schedule(n,t0){
  const s=n%16, chord=CHORDS[Math.floor(n/16)%4];
  if(s===0) chord.forEach((m,i)=>voice('sawtooth',hz(m),t0,STEP*16,.05,1100,master,i*7-7));
  if(s===0||s===6||s===8||s===14) drum('kick',t0);
  if(s===4||s===12) drum('snare',t0);
  if(s%2===0) drum('hat',t0+STEP);
  if(s===0||s===3||s===8||s===11) voice('sawtooth',hz(chord[0]-24),t0,STEP*2.2,.32,520);
  const arp=[0,1,2,1,0,2,1,2][s%8], oct=s>=8?12:0;
  const g=voice('triangle',hz(chord[arp]+12+oct),t0,STEP*1.6,.13,3200);
  if(s%4===2) g.connect(delay);
}
function tick(){
  const ahead=document.hidden?2.5:.35;
  while(nextTime<ac.currentTime+ahead){ schedule(step,nextTime); nextTime+=STEP; step++; }
}
async function musicOn(){
  audio();
  try{ await ac.resume(); }catch(e){ Tools.diag.log('audio resume failed',{error:String(e)}); }
  if(playing) return;
  playing=true; step=0; nextTime=ac.currentTime+.08; startTime=nextTime;
  tick(); timer=setInterval(tick,50);
  Tools.diag.log('music on',{audio:ac.state});
  renderButtons();
}
function musicOff(){
  if(!playing) return;
  playing=false; clearInterval(timer);
  Tools.diag.log('music off');
  renderButtons();
}
function localSound(){
  if(!localOut) return;
  const on=CastStream.state==='idle'||settings.local;
  localOut.gain.setTargetAtTime(on?1:0,ac.currentTime,.05);
}

/* ---------- Picture ---------- */
const canvas=$('view'), g2=canvas.getContext('2d',{alpha:false});
let W=canvas.width, H=canvas.height;
const bins=new Uint8Array(128);
const ripples=[];
const stars=Array.from({length:260},()=>({x:Math.random()*2-1,y:Math.random()*2-1,z:Math.random()}));
function resize(){
  const q=QUALITY[settings.quality];
  if(canvas.width!==q.w){ canvas.width=q.w; canvas.height=q.h; }
  W=canvas.width; H=canvas.height;
}
function level(a,b){ let s=0; for(let i=a;i<b;i++) s+=bins[i]; return s/(b-a)/255; }
function drawWaves(now,bass,mid,high){
  const hue=(now/80)%360;
  const grd=g2.createLinearGradient(0,0,W,H);
  grd.addColorStop(0,`hsl(${hue},70%,${12+bass*14}%)`); grd.addColorStop(1,`hsl(${(hue+70)%360},70%,8%)`);
  g2.fillStyle=grd; g2.fillRect(0,0,W,H);
  g2.lineWidth=H/120;
  for(let k=0;k<5;k++){
    g2.beginPath();
    const amp=H*(.05+.22*(k%2?mid:bass)+.03*k*high), ph=now/1000*(0.6+k*.25)+k;
    for(let x=0;x<=W;x+=W/96){
      const y=H*(.2+k*.15)+Math.sin(x/W*Math.PI*(2+k)+ph)*amp*.6;
      x?g2.lineTo(x,y):g2.moveTo(x,y);
    }
    g2.strokeStyle=`hsla(${(hue+k*40)%360},90%,65%,.85)`; g2.stroke();
  }
}
function drawStars(now,bass,mid){
  g2.fillStyle=`rgb(${4+bass*30},${6+bass*10},${18+bass*40})`; g2.fillRect(0,0,W,H);
  const speed=.004+bass*.03;
  for(const s of stars){
    s.z-=speed; if(s.z<=.02){ s.z=1; s.x=Math.random()*2-1; s.y=Math.random()*2-1; }
    const px=W/2+s.x/s.z*W*.25, py=H/2+s.y/s.z*H*.25, r=Math.max(.5,(1-s.z)*H/180*(1+mid));
    if(px<0||px>W||py<0||py>H) continue;
    g2.fillStyle=`hsla(${190+s.x*60},80%,${70+(1-s.z)*30}%,${1-s.z})`;
    g2.beginPath(); g2.arc(px,py,r,0,Math.PI*2); g2.fill();
  }
  g2.strokeStyle=`rgba(103,195,220,${.2+bass*.6})`; g2.lineWidth=H/90;
  g2.beginPath(); g2.arc(W/2,H/2,H*(.12+bass*.15),0,Math.PI*2); g2.stroke();
}
function drawBars(now){
  g2.fillStyle='#07090f'; g2.fillRect(0,0,W,H);
  const n=48, bw=W/n;
  for(let i=0;i<n;i++){
    const v=playing?bins[Math.floor(i*80/n)]/255:.08+.06*Math.sin(now/400+i/3);
    const h=v*H*.62;
    g2.fillStyle=`hsl(${(i/n*300+now/40)%360},85%,58%)`;
    g2.fillRect(i*bw+bw*.12,H*.66-h,bw*.76,h);
    g2.globalAlpha=.25; g2.fillRect(i*bw+bw*.12,H*.67,bw*.76,h*.35); g2.globalAlpha=1;
  }
}
function overlay(now){
  // Ripples from taps on the phone
  for(let i=ripples.length-1;i>=0;i--){
    const r=ripples[i], age=(now-r.t)/900;
    if(age>1){ ripples.splice(i,1); continue; }
    g2.strokeStyle=`hsla(${r.h},95%,70%,${1-age})`; g2.lineWidth=H/60*(1-age)+1;
    g2.beginPath(); g2.arc(r.x*W,r.y*H,H*(.03+age*.25),0,Math.PI*2); g2.stroke();
  }
  // Clock with tenths: compare phone and TV to read the delay
  const d=new Date();
  const clock=d.toLocaleTimeString(Tools.locale(),{hour:'2-digit',minute:'2-digit',second:'2-digit'})+'.'+Math.floor(d.getMilliseconds()/100);
  g2.font=`600 ${Math.round(H/14)}px system-ui,sans-serif`; g2.textAlign='right'; g2.textBaseline='bottom';
  g2.fillStyle='rgba(0,0,0,.45)'; g2.fillText(clock,W-H/28+2,H-H/28+2);
  g2.fillStyle='#fff'; g2.fillText(clock,W-H/28,H-H/28);
  g2.textAlign='left'; g2.font=`600 ${Math.round(H/22)}px system-ui,sans-serif`;
  g2.fillStyle='rgba(255,255,255,.85)'; g2.fillText(t('sc.'+settings.scene+'Name'),H/28,H-H/28);
  if(CastStream.state==='streaming'){
    g2.textBaseline='top'; g2.fillStyle='#ef4444';
    g2.beginPath(); g2.arc(H/28+H/50,H/28+H/40,H/50,0,Math.PI*2); g2.fill();
    g2.fillStyle='#fff'; g2.fillText(t('live'),H/28+H/22,H/28);
  }
}
let frames=0;
function frame(now){
  if(analyser&&playing) analyser.getByteFrequencyData(bins); else bins.fill(0);
  const bass=level(0,6), mid=level(6,30), high=level(30,80);
  if(settings.scene==='waves') drawWaves(now,bass,mid,high);
  else if(settings.scene==='stars') drawStars(now,bass,mid);
  else drawBars(now);
  overlay(now);
  frames++;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
canvas.addEventListener('pointerdown',e=>{
  // Map through object-fit: contain
  const r=canvas.getBoundingClientRect(), s=Math.min(r.width/W,r.height/H);
  const ox=(r.width-W*s)/2, oy=(r.height-H*s)/2;
  const x=(e.clientX-r.left-ox)/(W*s), y=(e.clientY-r.top-oy)/(H*s);
  if(x<0||x>1||y<0||y>1) return;
  ripples.push({x,y,t:performance.now(),h:Math.random()*360});
  if(ripples.length>30) ripples.shift();
});

/* ---------- Streaming ---------- */
let videoTrack=null, wake=null;
async function wakeLock(on){
  try{
    if(on&&!wake&&'wakeLock' in navigator&&document.visibilityState==='visible'){
      wake=await navigator.wakeLock.request('screen');
      wake.addEventListener('release',()=>{ wake=null; });
    } else if(!on&&wake){ await wake.release(); wake=null; }
  }catch(e){ Tools.diag.log('wake lock failed',{error:String(e&&e.name)}); }
}
document.addEventListener('visibilitychange',()=>{
  Tools.diag.log('visibility',{state:document.visibilityState});
  if(document.visibilityState==='visible'&&CastStream.state==='streaming') wakeLock(true);
});
async function castToggle(){
  if(CastStream.state!=='idle'){ Tools.diag.log('stop streaming'); CastStream.stop(); return; }
  if(!/^[0-9A-F]{8}$/.test(settings.appId)){
    Tools.toast(t('err.no-app-id'));
    Tools.menu.open&&Tools.menu.open();
    setTimeout(()=>$('appId').focus(),300);
    return;
  }
  await musicOn();   // inside the tap: browsers only start sound after a user gesture
  resize();
  if(videoTrack) videoTrack.stop();
  videoTrack=canvas.captureStream(30).getVideoTracks()[0];
  const stream=new MediaStream([videoTrack,...streamOut.stream.getAudioTracks()]);
  Tools.diag.log('start streaming',{quality:settings.quality,stun:settings.stun});
  try{
    await CastStream.start({appId:settings.appId,stream,maxBitrate:QUALITY[settings.quality].bitrate,stun:settings.stun,tvLog:settings.tvLog});
  }catch(e){
    if(e.code&&e.code!=='cancel') showError(e.code);
  }
}
let errorCode='';
function showError(code){ errorCode=code; Tools.toast(t('err.'+code)||t('err.webrtc')); render(); }
function render(){
  const st=$('status'), s=CastStream.state, x=CastStream.stats;
  const tv=CastStream.device||t('st.tv');
  let text=t('st.'+s,{tv});
  if(s==='streaming'&&x&&x.width) text+=' · '+t('st.stats',{w:x.width,h:x.height,fps:Tools.fmt(x.fps||0,0),kbps:Tools.fmt(x.kbps||0,0)});
  if(s==='idle'&&errorCode) text=t('err.'+errorCode);
  st.textContent=text;
  st.classList.toggle('live',s==='streaming');
  st.classList.toggle('err',s==='idle'&&!!errorCode);
  renderButtons();
}
function renderButtons(){
  const s=CastStream.state;
  $('castLabel').textContent=t(s==='idle'?'cast.start':'cast.stop');
  $('btnCast').classList.toggle('primary',s==='idle');
  $('musicLabel').textContent=t(playing?'music.pause':'music.play');
  $('btnMusic').setAttribute('aria-pressed',String(playing));
  for(const b of document.querySelectorAll('[data-scene]')) b.setAttribute('aria-pressed',String(b.dataset.scene===settings.scene));
}
let lastState='idle';
CastStream.onChange(state=>{
  if(state!==lastState){
    Tools.diag.log('cast state',{state});
    if(state!=='idle') errorCode='';
    if(state==='streaming') wakeLock(true);
    if(state==='idle'){ wakeLock(false); if(videoTrack){ videoTrack.stop(); videoTrack=null; } }
    lastState=state;
    localSound();
  }
  if(state==='idle'&&CastStream.info().error) errorCode=CastStream.info().error;
  render();
});

/* ---------- Controls & settings ---------- */
$('btnCast').addEventListener('click',castToggle);
$('btnMusic').addEventListener('click',()=>playing?musicOff():musicOn());
function setScene(s){ settings.scene=s; save(); renderButtons(); }
for(const b of document.querySelectorAll('[data-scene]')) b.addEventListener('click',()=>setScene(b.dataset.scene));
const idIn=$('appId'), qIn=$('quality');
idIn.value=settings.appId; qIn.value=settings.quality;
$('optLocal').checked=settings.local; $('optTvLog').checked=settings.tvLog; $('optStun').checked=settings.stun;
idIn.addEventListener('change',()=>{
  const v=idIn.value.trim().toUpperCase();
  if(v&&!/^[0-9A-F]{8}$/.test(v)){ Tools.toast(t('idBad')); return; }
  idIn.value=v; settings.appId=v; save();
  if(v) Tools.toast(t('idOk'));
  Tools.diag.log('app id',{set:!!v});
});
qIn.addEventListener('change',()=>{ settings.quality=qIn.value; save(); resize(); Tools.diag.log('quality',{q:settings.quality}); });
$('optLocal').addEventListener('change',e=>{ settings.local=e.target.checked; save(); localSound(); });
$('optTvLog').addEventListener('change',e=>{ settings.tvLog=e.target.checked; save(); CastStream.setTvLog(settings.tvLog); });
$('optStun').addEventListener('change',e=>{ settings.stun=e.target.checked; save(); });
$('receiverUrl').textContent=CastStream.RECEIVER_URL;
$('btnCopyUrl').addEventListener('click',async()=>{ if(await Tools.copyText(CastStream.RECEIVER_URL)) Tools.toast(t('copied')); });
resize();
render();
Tools.onLang(render);

Tools.diag.info(()=>({
  cast:CastStream.info(),appId:!!settings.appId,quality:settings.quality,scene:settings.scene,
  music:playing,audio:ac?ac.state:'none',localSound:settings.local,stun:settings.stun,tvLog:settings.tvLog,
  wakeLock:!!wake,frames,canvas:`${W}x${H}`,
  captureStream:'captureStream' in HTMLCanvasElement.prototype,webrtc:'RTCPeerConnection' in window
}));
// CSP problems (e.g. something the Cast SDK loads) do not reach console.error – log them for the report
document.addEventListener('securitypolicyviolation',e=>Tools.diag.log('csp',{directive:e.effectiveDirective,blocked:String(e.blockedURI).slice(0,80)}));

/* ---------- WebMCP ---------- */
Tools.mcp.register({
  name:'set_scene',title:'Switch the scene',label:'mcp.scene',
  description:'Switches the animated scene shown in the app (and on the TV while streaming): waves, stars or bars. Returns the scene now shown.',
  inputSchema:{type:'object',properties:{scene:{type:'string',enum:SCENES,description:'The scene to show.'}},required:['scene'],additionalProperties:false},
  execute:({scene})=>{ setScene(scene); return {scene}; }
});
Tools.mcp.register({
  name:'get_status',title:'Read the stream status',label:'mcp.status',readOnly:true,
  description:'Reads whether the app is streaming to a TV (state idle, loading, choosing, connecting or streaming), the TV name, the picture size, frames per second and video bitrate in kbit/s while streaming, plus scene, music on or off and picture quality.',
  inputSchema:{type:'object',properties:{},additionalProperties:false},
  execute:()=>{
    const x=CastStream.stats;
    return {state:CastStream.state,tv:CastStream.device||null,scene:settings.scene,music:playing,quality:settings.quality+'p',
      stream:x&&x.width?{width:x.width,height:x.height,fps:x.fps||0,kbps:x.kbps||0}:null,error:CastStream.info().error||null};
  }
});
})();
