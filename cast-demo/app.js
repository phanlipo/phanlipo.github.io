/* Cast demo: an animated scene with generated music, shown on a Chromecast / Android TV with the phone's own
   screen casting. tv.js prepares the picture (full screen, landscape, screen stays on). */
(function(){
'use strict';
Tools.i18n({
  de:{
    'music.play':'Musik an','music.pause':'Musik aus',
    'st.android':'Tipp: Erst die Bildschirmübertragung starten, dann Vollbild.',
    'st.ios':'Tipp: Mit Apple TV über die Bildschirmsynchronisierung, dann Vollbild.',
    'st.desktop':'Tipp: In Chrome über ⋮ → Streamen den Tab übertragen, dann Vollbild.',
    'tv.noLandscape':'Querformat ließ sich nicht festlegen – Handy bitte drehen.',
    'mcp.scene':'Szene gewechselt','mcp.status':'Zustand gelesen',
    'sc.wavesName':'Wellen','sc.starsName':'Sterne','sc.barsName':'Balken'
  },
  en:{
    title:'Cast Demo',sub:'Show picture and music on the TV.',
    view:'Picture for the TV – tap for effects',bar:'Controls',scene:'Scene','sc.waves':'Waves','sc.stars':'Stars','sc.bars':'Bars',
    'music.play':'Music on','music.pause':'Music off','tv.show':'Show on TV','tv.exit':'Exit full screen',
    'set.h':'Settings','set.music':'Start the music automatically in full screen','set.clock':'Show a clock in the picture (to read the delay)',
    'dlg.h':'Show on TV','dlg.step1':'1. Cast the screen','dlg.open':'Open casting in the settings',
    'dlg.fail':'Could not be opened directly – please use the quick settings or the Google Home app.',
    'dlg.step2':'2. Start full screen','dlg.step2text':'Picture in landscape without bars, the screen stays on. Exit with the back gesture or “Exit full screen”.',
    'dlg.go':'Start full screen','dlg.close':'Close',
    'st.android':'Tip: first start the screen casting, then full screen.',
    'st.ios':'Tip: with an Apple TV via Screen Mirroring, then full screen.',
    'st.desktop':'Tip: in Chrome cast the tab via ⋮ → Cast, then full screen.',
    'tv.noLandscape':'Could not lock landscape – please turn the phone.',
    'mcp.scene':'Scene switched','mcp.status':'State read',
    'sc.wavesName':'Waves','sc.starsName':'Stars','sc.barsName':'Bars'
  }
});
const t=Tools.t, $=Tools.$;
const LS='cast-demo.settings.v1';
const SCENES=['waves','stars','bars'];
const settings=Object.assign({scene:'waves',autoMusic:true,clock:true},Tools.load(LS,{}));
if(!SCENES.includes(settings.scene)) settings.scene='waves';
const save=()=>Tools.save(LS,settings);

/* ---------- Music (generated, original: Am – F – C – G at 100 bpm) ---------- */
let ac=null, master, analyser, delay, noise, playing=false, timer=0, nextTime=0, step=0, startTime=0;
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
  comp.connect(ac.destination);
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

/* ---------- Picture ---------- */
const canvas=$('view'), g2=canvas.getContext('2d',{alpha:false});
let W=canvas.width, H=canvas.height;
const bins=new Uint8Array(128);
const ripples=[];
const stars=Array.from({length:260},()=>({x:Math.random()*2-1,y:Math.random()*2-1,z:Math.random()}));
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
  if(settings.clock){
    const d=new Date();
    const clock=d.toLocaleTimeString(Tools.locale(),{hour:'2-digit',minute:'2-digit',second:'2-digit'})+'.'+Math.floor(d.getMilliseconds()/100);
    g2.font=`600 ${Math.round(H/14)}px system-ui,sans-serif`; g2.textAlign='right'; g2.textBaseline='bottom';
    g2.fillStyle='rgba(0,0,0,.45)'; g2.fillText(clock,W-H/28+2,H-H/28+2);
    g2.fillStyle='#fff'; g2.fillText(clock,W-H/28,H-H/28);
  }
  g2.textAlign='left'; g2.font=`600 ${Math.round(H/22)}px system-ui,sans-serif`;
  g2.fillStyle='rgba(255,255,255,.85)'; g2.fillText(t('sc.'+settings.scene+'Name'),H/28,H-H/28);
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


/* ---------- TV mode ---------- */
const screenEl=$('screen'), dlg=$('tvDlg'), platform=TvMode.platform();
let barTimer=0;
function showBar(){
  screenEl.classList.remove('bar-hidden');
  clearTimeout(barTimer);
  barTimer=setTimeout(()=>{ if(!screenEl.contains(document.activeElement)||document.activeElement===canvas) screenEl.classList.add('bar-hidden'); },3000);
}
canvas.addEventListener('click',()=>{ if(TvMode.active()) showBar(); });
$('tvBar').addEventListener('focusin',showBar);
$('tvBar').addEventListener('pointerdown',showBar);
TvMode.onChange(on=>{
  screenEl.classList.toggle('tv',on);
  if(on) showBar(); else { clearTimeout(barTimer); screenEl.classList.remove('bar-hidden'); }
});
for(const el of dlg.querySelectorAll('[data-platform]')) el.hidden=el.dataset.platform!==platform;
$('btnTv').addEventListener('click',()=>{ $('castFail').hidden=true; Tools.diag.log('tv dialog',{platform}); dlg.showModal(); });
$('btnTvClose').addEventListener('click',()=>dlg.close());
dlg.addEventListener('click',e=>{ if(e.target===dlg) dlg.close(); });
$('castLink').addEventListener('click',()=>{
  $('castFail').hidden=true;
  TvMode.watchLaunch(opened=>{ $('castFail').hidden=opened; });
});
$('btnTvGo').addEventListener('click',async()=>{
  dlg.close();
  if(settings.autoMusic) musicOn();   // still inside the tap: browsers start sound only after a gesture
  const r=await TvMode.enter(screenEl);
  if(!r.landscape&&platform!=='desktop'&&matchMedia('(orientation: portrait)').matches) Tools.toast(t('tv.noLandscape'));
});
$('btnTvExit').addEventListener('click',()=>TvMode.exit());

/* ---------- Controls & settings ---------- */
function renderButtons(){
  for(const b of document.querySelectorAll('[data-music]')){
    (b.querySelector('span')||b).textContent=t(playing?'music.pause':'music.play');
    b.setAttribute('aria-pressed',String(playing));
  }
  for(const b of document.querySelectorAll('[data-scene]')) b.setAttribute('aria-pressed',String(b.dataset.scene===settings.scene));
}
function render(){ $('status').textContent=t('st.'+platform); renderButtons(); }
for(const b of document.querySelectorAll('[data-music]')) b.addEventListener('click',()=>playing?musicOff():musicOn());
function setScene(s){ settings.scene=s; save(); renderButtons(); }
for(const b of document.querySelectorAll('[data-scene]')) b.addEventListener('click',()=>setScene(b.dataset.scene));
$('optAutoMusic').checked=settings.autoMusic; $('optClock').checked=settings.clock;
$('optAutoMusic').addEventListener('change',e=>{ settings.autoMusic=e.target.checked; save(); });
$('optClock').addEventListener('change',e=>{ settings.clock=e.target.checked; save(); });
render();
Tools.onLang(render);

Tools.diag.info(()=>({tv:TvMode.info(),scene:settings.scene,music:playing,audio:ac?ac.state:'none',autoMusic:settings.autoMusic,clock:settings.clock,frames,
  screen:`${screen.width}x${screen.height}`,orientation:screen.orientation?screen.orientation.type:'?'}));

/* ---------- WebMCP ---------- */
Tools.mcp.register({
  name:'set_scene',title:'Switch the scene',label:'mcp.scene',
  description:'Switches the animated scene shown in the app (and on the TV while the phone casts its screen): waves, stars or bars. Returns the scene now shown.',
  inputSchema:{type:'object',properties:{scene:{type:'string',enum:SCENES,description:'The scene to show.'}},required:['scene'],additionalProperties:false},
  execute:({scene})=>{ setScene(scene); return {scene}; }
});
Tools.mcp.register({
  name:'get_status',title:'Read the state',label:'mcp.status',readOnly:true,
  description:'Reads the scene shown, whether the music plays, whether the app is in TV mode (full screen for screen casting) and whether the picture is locked to landscape.',
  inputSchema:{type:'object',properties:{},additionalProperties:false},
  execute:()=>{ const i=TvMode.info(); return {scene:settings.scene,music:playing,tv_mode:i.active,landscape:i.landscape}; }
});
})();
