// Code ausführen: editor, output and menu. The programs themselves run in workers
// (js-worker.mjs: a fresh one per run; py-worker.mjs: Pyodide, kept between runs) – see guard.mjs for the lockdown.
(function(){
'use strict';
Tools.i18n({
  de:{
    run:'Ausführen',stop:'Stopp',
    stLoading:'Python wird geladen …',stRunning:'Läuft …',stDone:'Fertig · {ms} ms',stError:'Fehler · {ms} ms',
    stStopped:'Gestoppt',stTimeout:'Abgebrochen nach {s} s',stLoadFail:'Python nicht geladen',stCrash:'Start fehlgeschlagen',
    line:'Zeile {n}',truncated:'… Ausgabe gekürzt (zu lang)',trimmed:'… Anfang der Ausgabe gekürzt',
    stopped:'Programm gestoppt.',timeout:'Programm nach {s} Sekunden abgebrochen.',
    loadFail:'Python konnte nicht geladen werden. Beim ersten Mal ist eine Internetverbindung nötig (ca. 13 MB), danach geht es offline.',
    crash:'Das Programm konnte nicht gestartet werden. Seite neu laden und noch einmal versuchen.',
    copied:'Ausgabe kopiert',copyFail:'Kopieren nicht möglich',nothing:'Keine Ausgabe',
    exChoose:'Beispiel wählen …',exHello:'Hallo Welt',exLoop:'Schleifen & Listen',exInput:'Eingabe lesen',exFunc:'Funktionen: Primzahlen',exAsync:'Warten mit await',exClass:'Klassen',
    replaceConfirm:'Der Code im Editor ist nicht gespeichert. Ersetzen?',
    noScripts:'Noch keine Skripte gespeichert.',saved:'Gespeichert: {name}',updated:'Aktualisiert: {name}',saveFail:'Speichern nicht möglich – der Speicher des Browsers ist voll.',
    nameMissing:'Bitte einen Namen eingeben.',emptyCode:'Der Editor ist leer.',
    delConfirm:'„{name}“ löschen?',deleted:'Gelöscht',deleteN:'Löschen: {name}',delete:'Löschen',
    chars:'{n} Zeichen',tooBig:'Datei zu groß (höchstens 1 MB).',notText:'Das ist keine Textdatei.',opened:'Geöffnet: {name}',downloaded:'Heruntergeladen',
    eofHint:'Tipp: input() hat keine Eingabe mehr gefunden – im Menü ☰ unter „Eingabe für das Programm“ eine Zeile je Aufruf eintragen.',
    draft:'Entwurf {when}',
    'mcp.run':'Code ausgeführt','mcp.code':'Code gelesen','mcp.output':'Ausgabe gelesen',
  },
  en:{
    title:'Run Code',sub:'Run Python and JavaScript in the browser.',langLabel:'Programming language',
    codeLabel:'Program code',codePh:'Write code here …',output:'Output',copyOut:'Copy output',clearOut:'Clear output',
    outPh:'Whatever the program prints appears here.',keysLabel:'Insert characters',indent:'Indent',outdent:'Outdent',
    scripts:'Scripts',examples:'Load an example',saveName:'Save the current code as',namePh:'Name',save:'Save',
    openFile:'Open file …',download:'Download as file',stdinH:'Input for the program',
    stdinLabel:'One line per <code>input()</code> (Python) or <code>prompt()</code> (JavaScript)',
    settings:'Settings',fontSize:'Font size',fontM:'Normal',fontL:'Large',fontXl:'Very large',wrap:'Wrap long lines',
    run:'Run',stop:'Stop',
    stLoading:'Loading Python …',stRunning:'Running …',stDone:'Done · {ms} ms',stError:'Error · {ms} ms',
    stStopped:'Stopped',stTimeout:'Cancelled after {s} s',stLoadFail:'Python not loaded',stCrash:'Could not start',
    line:'line {n}',truncated:'… output cut off (too long)',trimmed:'… start of the output cut off',
    stopped:'Program stopped.',timeout:'Program cancelled after {s} seconds.',
    loadFail:'Python could not be loaded. The first time needs an internet connection (about 13 MB); after that it works offline.',
    crash:'The program could not be started. Reload the page and try again.',
    copied:'Output copied',copyFail:'Could not copy',nothing:'No output',
    exChoose:'Choose an example …',exHello:'Hello world',exLoop:'Loops & lists',exInput:'Reading input',exFunc:'Functions: prime numbers',exAsync:'Waiting with await',exClass:'Classes',
    replaceConfirm:'The code in the editor is not saved. Replace it?',
    noScripts:'No scripts saved yet.',saved:'Saved: {name}',updated:'Updated: {name}',saveFail:'Could not save – the browser storage is full.',
    nameMissing:'Please enter a name.',emptyCode:'The editor is empty.',
    delConfirm:'Delete “{name}”?',deleted:'Deleted',deleteN:'Delete: {name}',delete:'Delete',
    chars:'{n} characters',tooBig:'File too large (1 MB at most).',notText:'This is not a text file.',opened:'Opened: {name}',downloaded:'Downloaded',
    eofHint:'Tip: input() found no more input – enter one line per call in the menu ☰ under “Input for the program”.',
    draft:'Draft {when}',
    'mcp.run':'ran code','mcp.code':'read the code','mcp.output':'read the output',
  }
});
const t=Tools.t,$=Tools.$,esc=Tools.esc;
const LANGS=['python','javascript'];
const LABEL={python:'Python',javascript:'JavaScript'},EXT={python:'py',javascript:'js'},INDENT={python:'    ',javascript:'  '};
const MAX_CODE=200000,MAX_SCRIPTS=200,MAX_DOM=400000;

/* ---------- Examples (texts follow the language of the app) ---------- */
const EXAMPLES={
  python:[
    {key:'exHello',code:de=>de
      ?'name = "Welt"\nprint(f"Hallo {name}!")\n\n# Das Ergebnis der letzten Zeile erscheint hinter dem Pfeil\n6 * 7\n'
      :'name = "world"\nprint(f"Hello, {name}!")\n\n# The value of the last line is shown after the arrow\n6 * 7\n'},
    {key:'exLoop',code:de=>de
      ?'zahlen = [3, 8, 15, 4, 23]\n\nfor z in zahlen:\n    art = "gerade" if z % 2 == 0 else "ungerade"\n    print(z, "ist", art)\n\nprint("Summe:", sum(zahlen))\nprint("Quadrate:", [z * z for z in zahlen])\n'
      :'numbers = [3, 8, 15, 4, 23]\n\nfor n in numbers:\n    kind = "even" if n % 2 == 0 else "odd"\n    print(n, "is", kind)\n\nprint("Sum:", sum(numbers))\nprint("Squares:", [n * n for n in numbers])\n'},
    {key:'exInput',stdin:de=>de?'Ada\n36\n':'Ada\n36\n',code:de=>de
      ?'# input() liest eine Zeile aus dem Menü ☰ → „Eingabe für das Programm“\nname = input("Wie heißt du? ")\nalter = int(input("Wie alt bist du? "))\n\nprint(f"Hallo {name}! In 10 Jahren bist du {alter + 10}.")\n'
      :'# input() reads a line from the menu ☰ → "Input for the program"\nname = input("What is your name? ")\nage = int(input("How old are you? "))\n\nprint(f"Hello {name}! In 10 years you will be {age + 10}.")\n'},
    {key:'exFunc',code:de=>de
      ?'import math\n\ndef ist_prim(n):\n    if n < 2:\n        return False\n    for teiler in range(2, math.isqrt(n) + 1):\n        if n % teiler == 0:\n            return False\n    return True\n\nprimzahlen = [n for n in range(1, 60) if ist_prim(n)]\nprint(primzahlen)\nlen(primzahlen)\n'
      :'import math\n\ndef is_prime(n):\n    if n < 2:\n        return False\n    for divisor in range(2, math.isqrt(n) + 1):\n        if n % divisor == 0:\n            return False\n    return True\n\nprimes = [n for n in range(1, 60) if is_prime(n)]\nprint(primes)\nlen(primes)\n'},
    {key:'exClass',code:de=>de
      ?'from dataclasses import dataclass\n\n@dataclass\nclass Konto:\n    inhaber: str\n    stand: float = 0.0\n\n    def einzahlen(self, betrag):\n        self.stand += betrag\n        return self\n\nkonto = Konto("Ada").einzahlen(50).einzahlen(12.5)\nprint(konto)\n'
      :'from dataclasses import dataclass\n\n@dataclass\nclass Account:\n    owner: str\n    balance: float = 0.0\n\n    def deposit(self, amount):\n        self.balance += amount\n        return self\n\naccount = Account("Ada").deposit(50).deposit(12.5)\nprint(account)\n'},
  ],
  javascript:[
    {key:'exHello',code:de=>de
      ?'const name = "Welt";\nconsole.log(`Hallo ${name}!`);\n\n// Das Ergebnis der letzten Zeile erscheint hinter dem Pfeil\n6 * 7\n'
      :'const name = "world";\nconsole.log(`Hello, ${name}!`);\n\n// The value of the last line is shown after the arrow\n6 * 7\n'},
    {key:'exLoop',code:de=>de
      ?'const zahlen = [3, 8, 15, 4, 23];\n\nfor (const z of zahlen) {\n  console.log(z, "ist", z % 2 === 0 ? "gerade" : "ungerade");\n}\n\nconsole.log("Summe:", zahlen.reduce((a, b) => a + b, 0));\nconsole.log("Quadrate:", zahlen.map(z => z * z));\n'
      :'const numbers = [3, 8, 15, 4, 23];\n\nfor (const n of numbers) {\n  console.log(n, "is", n % 2 === 0 ? "even" : "odd");\n}\n\nconsole.log("Sum:", numbers.reduce((a, b) => a + b, 0));\nconsole.log("Squares:", numbers.map(n => n * n));\n'},
    {key:'exInput',stdin:()=>'Ada\n36\n',code:de=>de
      ?'// prompt() liest eine Zeile aus dem Menü ☰ → „Eingabe für das Programm“\nconst name = prompt("Wie heißt du?");\nconst alter = Number(prompt("Wie alt bist du?"));\n\nconsole.log(`Hallo ${name}! In 10 Jahren bist du ${alter + 10}.`);\n'
      :'// prompt() reads a line from the menu ☰ → "Input for the program"\nconst name = prompt("What is your name?");\nconst age = Number(prompt("How old are you?"));\n\nconsole.log(`Hello ${name}! In 10 years you will be ${age + 10}.`);\n'},
    {key:'exFunc',code:de=>de
      ?'function istPrim(n) {\n  if (n < 2) return false;\n  for (let teiler = 2; teiler * teiler <= n; teiler++) {\n    if (n % teiler === 0) return false;\n  }\n  return true;\n}\n\nconst primzahlen = [];\nfor (let n = 1; n < 60; n++) if (istPrim(n)) primzahlen.push(n);\nconsole.log(primzahlen);\nprimzahlen.length\n'
      :'function isPrime(n) {\n  if (n < 2) return false;\n  for (let divisor = 2; divisor * divisor <= n; divisor++) {\n    if (n % divisor === 0) return false;\n  }\n  return true;\n}\n\nconst primes = [];\nfor (let n = 1; n < 60; n++) if (isPrime(n)) primes.push(n);\nconsole.log(primes);\nprimes.length\n'},
    {key:'exAsync',code:de=>de
      ?'const warte = ms => new Promise(fertig => setTimeout(fertig, ms));\n\nfor (let i = 3; i > 0; i--) {\n  console.log(i);\n  await warte(500);\n}\nconsole.log("Los!");\n'
      :'const wait = ms => new Promise(done => setTimeout(done, ms));\n\nfor (let i = 3; i > 0; i--) {\n  console.log(i);\n  await wait(500);\n}\nconsole.log("Go!");\n'},
  ],
};
const exampleCode=(lang,i)=>EXAMPLES[lang][i].code(Tools.lang()==='de');

/* ---------- State ---------- */
// localStorage: <folder>.<what>.v1 (prefix = <meta name="tool:storage">)
const LS='code-runner.state.v1',LSC='code-runner.scripts.v1';
const state=(()=>{
  const s=Tools.load(LS,null)||{},str=v=>typeof v==='string';
  const first=!s.code;
  return {
    lang:LANGS.includes(s.lang)?s.lang:'python',
    code:Object.fromEntries(LANGS.map(l=>[l,s.code&&str(s.code[l])?s.code[l].slice(0,MAX_CODE):(first?exampleCode(l,0):'')])),
    dirty:Object.fromEntries(LANGS.map(l=>[l,!!(s.dirty&&s.dirty[l])])),
    name:Object.fromEntries(LANGS.map(l=>[l,s.name&&str(s.name[l])?s.name[l].slice(0,60):''])),
    stdin:str(s.stdin)?s.stdin.slice(0,MAX_CODE):'',
    font:['m','l','xl'].includes(s.font)?s.font:'m',
    wrap:s.wrap!==false,
  };
})();
let scripts=(Tools.load(LSC,[])||[]).filter(x=>x&&typeof x.name==='string'&&typeof x.code==='string'&&LANGS.includes(x.lang)).slice(0,MAX_SCRIPTS);
let saveTimer=0;
const persist=()=>{clearTimeout(saveTimer);saveTimer=0;return Tools.save(LS,state);};
const persistSoon=()=>{if(!saveTimer)saveTimer=setTimeout(persist,400);};
addEventListener('pagehide',()=>{if(saveTimer)persist();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&saveTimer)persist();});

const code=$('code'),out=$('out'),statusEl=$('status'),stdinEl=$('stdin');

/* ---------- Editor ---------- */
function showLang(){
  for(const b of $('langs').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.l===state.lang));
  code.value=state.code[state.lang];
  code.style.tabSize=state.lang==='python'?4:2;
  $('scriptName').value=state.name[state.lang];
  renderExamples();
}
function setLang(l){
  if(l===state.lang)return;
  state.code[state.lang]=code.value;
  state.lang=l;persist();showLang();
  Tools.diag.log('language',l);
}
// Replaces the code of a language (example, saved script, file, AI agent)
function setCode(lang,text,name){
  state.code[state.lang]=code.value;
  state.lang=lang;state.code[lang]=text;state.dirty[lang]=false;state.name[lang]=name||'';
  persist();showLang();
}
// Asks before unsaved code of that language is replaced
const mayReplace=lang=>{
  const cur=lang===state.lang?code.value:state.code[lang];
  return !state.dirty[lang]||!cur.trim()||confirm(t('replaceConfirm'));
};
code.addEventListener('input',()=>{state.code[state.lang]=code.value;state.dirty[state.lang]=true;persistSoon();});
$('langs').addEventListener('click',e=>{const b=e.target.closest('button[data-l]');if(b)setLang(b.dataset.l);});

// Typing helpers. insertText keeps the browser's undo history; setRangeText is the fallback (Firefox).
function insert(text,selStart,selEnd){
  code.focus();
  const start=code.selectionStart;
  let ok=false;
  try{ok=document.execCommand('insertText',false,text);}catch(_){ok=false;}
  if(!ok){code.setRangeText(text,code.selectionStart,code.selectionEnd,'end');code.dispatchEvent(new Event('input',{bubbles:true}));}
  if(selStart!=null)code.setSelectionRange(start+selStart,start+(selEnd==null?selStart:selEnd));
}
function lineRange(){
  const v=code.value,a=v.lastIndexOf('\n',code.selectionStart-1)+1;
  let b=code.selectionEnd;
  if(b>code.selectionStart&&v[b-1]==='\n')b--;
  const e=v.indexOf('\n',b);
  return [a,e<0?v.length:e];
}
function indentLines(outdent){
  const unit=INDENT[state.lang],s=code.selectionStart,e=code.selectionEnd;
  if(!outdent&&s===e){insert(unit);return;}
  const [a,b]=lineRange(),lines=code.value.slice(a,b).split('\n');
  let first=0,total=0;
  const changed=lines.map((l,i)=>{
    let d;
    if(outdent){const m=l.match(/^(\t| {1,4})/);d=m?-Math.min(m[0]==='\t'?1:m[0].length,unit.length):0;l=l.slice(-d);}
    else{d=l?unit.length:0;if(l)l=unit+l;}
    if(i===0)first=d;total+=d;return l;
  }).join('\n');
  code.setSelectionRange(a,b);
  insert(changed);
  if(s===e){const p=Math.max(a,s+first);code.setSelectionRange(p,p);}
  else code.setSelectionRange(Math.max(a,s+first),e+total);
}
let escaped=false;
code.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();toggleRun();return;}
  if(e.key==='Escape'){escaped=true;return;}
  if(e.key==='Tab'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
    // After Esc, Tab moves the focus as usual (keyboard users must be able to leave the editor)
    if(escaped){escaped=false;return;}
    e.preventDefault();indentLines(e.shiftKey);return;
  }
  if(e.key==='Enter'&&!e.shiftKey&&!e.altKey&&!e.isComposing&&code.selectionStart===code.selectionEnd){
    // Keep the indentation of the current line; one level deeper after ":" (Python) or an opening bracket
    const v=code.value,p=code.selectionStart,a=v.lastIndexOf('\n',p-1)+1,before=v.slice(a,p);
    let ind=before.match(/^[ \t]*/)[0];
    if(state.lang==='python'?/:\s*(#.*)?$/.test(before):/[{[(]\s*$/.test(before))ind+=INDENT[state.lang];
    if(ind){e.preventDefault();insert('\n'+ind);}
  }
  if(e.key!=='Shift')escaped=false;
});
code.addEventListener('blur',()=>{escaped=false;});
// The key bar must not take the focus (the on-screen keyboard would close)
$('keys').addEventListener('pointerdown',e=>{if(e.target.closest('button'))e.preventDefault();});
$('keys').addEventListener('click',e=>{
  const b=e.target.closest('button');
  if(!b)return;
  if(b.dataset.k){indentLines(b.dataset.k==='outdent');return;}
  const p=b.dataset.p;
  if(p.length===2){
    const sel=code.value.slice(code.selectionStart,code.selectionEnd);
    insert(p[0]+sel+p[1],1,1+sel.length);
  }else insert(p);
});

/* ---------- Output ---------- */
let outLen=0;
function append(cls,text){
  if(!text)return;
  const stick=out.scrollHeight-out.scrollTop-out.clientHeight<40;
  const last=out.lastElementChild;
  if(last&&last.className===cls&&last.firstChild)last.firstChild.appendData(text);
  else{const s=document.createElement('span');s.className=cls;s.textContent=text;out.appendChild(s);}
  outLen+=text.length;
  // Keep the page responsive: drop the oldest output beyond MAX_DOM characters
  if(outLen>MAX_DOM){
    let cut=outLen-MAX_DOM*3/4;
    while(cut>0&&out.firstElementChild){
      const f=out.firstElementChild,n=f.textContent.length;
      if(n<=cut){f.remove();cut-=n;outLen-=n;}
      else{f.firstChild.deleteData(0,cut);outLen-=cut;cut=0;}
    }
    const note=document.createElement('span');note.className='o-info';note.textContent=t('trimmed')+'\n';
    out.prepend(note);outLen+=note.textContent.length;
  }
  if(stick)out.scrollTop=out.scrollHeight;
}
// Notes and results start on their own line
const freshLine=()=>{const x=out.textContent;if(x&&!x.endsWith('\n'))append(out.lastElementChild.className,'\n');};
function clearOutput(){out.textContent='';outLen=0;}
function setStatus(text,err){statusEl.textContent=text;statusEl.classList.toggle('err',!!err);}
$('btnClear').addEventListener('click',()=>{clearOutput();if(!job)setStatus('');});
$('btnCopy').addEventListener('click',async()=>{
  const text=out.textContent;
  if(!text){Tools.toast(t('nothing'));return;}
  const ok=await Tools.copyText(text);
  Tools.toast(t(ok===false?'copyFail':'copied'));
  Tools.diag.log('copy output',{chars:text.length,ok:ok!==false});
});

/* ---------- Running ---------- */
let job=null;       // current run
let py=null;        // { worker, ready, version } – the Python worker is kept between runs
let last=null;      // last run, for AI agents (get_output) and the diagnostics
let lastStatus=null;
const newWorker=file=>new Worker(file,{type:'module'});
function showRunning(on){
  $('btnRun').classList.toggle('stop',on);
  $('runText').textContent=t(on?'stop':'run');
  $('runIcon').setAttribute('d',on?'M5 5m0 2a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z':'M7 4v16l13 -8z');
}
function status(key,vars,err){lastStatus=key?{key,vars,err}:null;setStatus(key?t(key,vars):'',err);}

/** Runs the code in the editor. Resolves with { kind: 'done' | 'stopped' | 'timeout' | 'loaderror' | 'crash', … } */
function run(opts){
  opts=opts||{};
  if(job)return Promise.reject(new Error('busy'));
  const lang=state.lang,src=code.value;
  state.code[lang]=src;persist();
  clearOutput();
  return new Promise(resolve=>{
    const j=job={lang,resolve,stdout:'',stderr:'',result:null,error:null,truncated:false,timeout:opts.timeout||0,timer:0,t0:performance.now()};
    last={language:lang,running:true,status:'running',stdout:'',stderr:'',result:null,error:null,duration_ms:null,output_truncated:false};
    showRunning(true);
    Tools.diag.log('run',{lang,chars:src.length,stdin:(opts.stdin!=null?opts.stdin:state.stdin).length});
    let w;
    try{
      if(lang==='python'){
        if(!py){py={worker:newWorker('py-worker.mjs'),ready:false,version:'',t0:performance.now()};Tools.diag.log('python: loading');}
        w=py.worker;
      }else w=newWorker('js-worker.mjs');
    }catch(e){Tools.diag.log('worker failed',e);j.worker=null;finish('crash');return;}
    j.worker=w;
    w.onmessage=e=>onMessage(j,e.data);
    w.onerror=e=>{e.preventDefault&&e.preventDefault();Tools.diag.log('worker error',{lang,message:String(e.message||'load failed').slice(0,200)});if(job===j)finish(lang==='python'&&!py.ready?'loaderror':'crash');};
    w.postMessage({type:'run',code:src,stdin:opts.stdin!=null?opts.stdin:state.stdin});
    if(lang==='python'&&!py.ready)status('stLoading');
    else{status('stRunning');startTimeout(j);}
  });
}
function startTimeout(j){
  j.t0=performance.now();
  if(j.timeout)j.timer=setTimeout(()=>{if(job===j)finish('timeout');},j.timeout);
}
function onMessage(j,m){
  if(!m)return;
  if(m.type==='ready'&&j.lang==='python'&&py&&!py.ready){
    py.ready=true;py.version=m.version||'';
    Tools.diag.log('python: ready',{version:py.version,ms:Math.round(performance.now()-py.t0)});
    if(job===j){status('stRunning');startTimeout(j);}
    return;
  }
  if(job!==j)return;
  if(m.type==='loaderror'){Tools.diag.log('python: load failed',{message:m.message});finish('loaderror');}
  else if(m.type==='out'){
    for(const p of m.parts||[]){
      const text=String(p.text);
      if(p.s==='err'){j.stderr+=text;append('o-err',text);}
      else if(p.s==='in')append('o-in',text);
      else{j.stdout+=text;append('o-out',text);}
    }
  }
  else if(m.type==='clear')clearOutput();
  else if(m.type==='truncated'){j.truncated=true;freshLine();append('o-info',t('truncated')+'\n');}
  else if(m.type==='error')showError(j,m.error);
  else if(m.type==='done'){
    j.ms=m.ms;j.ok=!!m.ok;
    if(m.error&&!j.error)showError(j,m.error);
    if(m.result!=null)j.result=String(m.result);
    finish('done');
  }
}
function showError(j,err){
  if(!err)return;
  let text=String(err.text||'Error');
  // Python tracebacks name the line themselves; JavaScript errors get it appended
  if(j.lang==='javascript'&&err.line)text+=` (${t('line',{n:err.line})})`;
  if(!j.error)j.error={message:String(err.text||'Error'),line:err.line||null};
  j.stderr+=text+'\n';
  freshLine();append('o-err',text+'\n');
  if(j.lang==='python'&&/^EOFError\b/m.test(text))append('o-info',t('eofHint')+'\n');
}
function finish(kind){
  const j=job;
  if(!j)return;
  job=null;
  clearTimeout(j.timer);
  const ms=j.ms!=null?j.ms:Math.round(performance.now()-j.t0);
  // JavaScript: every run has its own worker. Python: only a finished run leaves the interpreter usable.
  if(j.lang==='javascript'||kind!=='done'){
    if(j.worker)j.worker.terminate();
    if(j.lang==='python')py=null;
  }
  const secs=Tools.fmt(j.timeout/1000,0);
  if(kind==='done'){
    if(j.result!=null){freshLine();append('o-res','→ '+j.result+'\n');}
    status(j.ok?'stDone':'stError',{ms:Tools.fmt(ms,0)},!j.ok);
  }else{
    freshLine();
    const note={stopped:['stopped'],timeout:['timeout',{s:secs}],loaderror:['loadFail'],crash:['crash']}[kind];
    append(kind==='stopped'?'o-info':'o-err',t(note[0],note[1])+'\n');
    status({stopped:'stStopped',timeout:'stTimeout',loaderror:'stLoadFail',crash:'stCrash'}[kind],{s:secs},kind!=='stopped');
  }
  showRunning(false);
  const res={kind,language:j.lang,ok:kind==='done'&&j.ok,stdout:j.stdout,stderr:j.stderr,result:j.result,error:j.error,ms,truncated:j.truncated};
  last={language:j.lang,running:false,status:kind==='done'?(j.ok?'finished':'error'):{stopped:'stopped',timeout:'timed_out',loaderror:'not_loaded',crash:'not_started'}[kind],
    stdout:j.stdout,stderr:j.stderr,result:j.result,error:j.error,duration_ms:ms,output_truncated:j.truncated};
  Tools.diag.log('run finished',{lang:j.lang,kind,ok:res.ok,ms,out:j.stdout.length,err:j.stderr.length,truncated:j.truncated});
  j.resolve(res);
}
function toggleRun(){
  if(job){finish('stopped');return;}
  // On a phone the keyboard hides the output – close it
  if(matchMedia('(pointer:coarse)').matches)code.blur();
  run().catch(e=>Tools.diag.log('run failed',e));
}
$('btnRun').addEventListener('click',toggleRun);
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&e.target!==code&&!document.querySelector('dialog[open]')){e.preventDefault();toggleRun();}});

/* ---------- Menu: examples, saved scripts, files ---------- */
function renderExamples(){
  const sel=$('examples');
  sel.innerHTML=`<option value="">${esc(t('exChoose'))}</option>`+EXAMPLES[state.lang].map((x,i)=>`<option value="${i}">${esc(LABEL[state.lang]+': '+t(x.key))}</option>`).join('');
}
$('examples').addEventListener('change',()=>{
  const sel=$('examples'),i=sel.value;
  if(i==='')return;
  sel.value='';
  const lang=state.lang,x=EXAMPLES[lang][Number(i)];
  if(!mayReplace(lang))return;
  setCode(lang,exampleCode(lang,Number(i)));
  if(x.stdin&&!state.stdin.trim()){state.stdin=x.stdin(Tools.lang()==='de');stdinEl.value=state.stdin;persist();}
  Tools.diag.log('example',{lang,i:Number(i)});
  Tools.menu.close();
});
const ICON_TRASH='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7l16 0"/><path d="M10 11l0 6"/><path d="M14 11l0 6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/></svg>';
function renderScripts(){
  const list=scripts.slice().sort((a,b)=>(b.t||0)-(a.t||0));
  $('scripts').innerHTML=list.map(s=>{
    const when=new Date(s.t||0).toLocaleString(Tools.locale(),{dateStyle:'short',timeStyle:'short'});
    return `<li data-id="${esc(s.id)}">
      <button type="button" class="open"><span class="name">${esc(s.name)}</span><span class="meta">${esc(LABEL[s.lang])} · ${esc(when)} · ${esc(t('chars',{n:Tools.fmt(s.code.length,0)}))}</span></button>
      <button type="button" class="icon-btn" data-act="delete" aria-label="${esc(t('deleteN',{name:s.name}))}" title="${esc(t('delete'))}">${ICON_TRASH}</button>
    </li>`;}).join('')||`<li class="muted">${esc(t('noScripts'))}</li>`;
}
const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
// Saves code under a name (same name and language: replaced). Returns 'saved' | 'updated' | null (storage full)
function saveScript(name,lang,text){
  const before=scripts.slice();
  const old=scripts.find(s=>s.name===name&&s.lang===lang);
  if(old){old.code=text;old.t=Date.now();}
  else{scripts.push({id:newId(),name,lang,code:text,t:Date.now()});if(scripts.length>MAX_SCRIPTS)scripts.sort((a,b)=>(b.t||0)-(a.t||0)).length=MAX_SCRIPTS;}
  if(!Tools.save(LSC,scripts)){scripts=before;Tools.diag.log('save failed',{scripts:scripts.length});return null;}
  renderScripts();
  return old?'updated':'saved';
}
$('btnSave').addEventListener('click',()=>{
  const name=$('scriptName').value.trim().slice(0,60),lang=state.lang,text=code.value;
  if(!name){Tools.toast(t('nameMissing'));$('scriptName').focus();return;}
  if(!text.trim()){Tools.toast(t('emptyCode'));return;}
  const r=saveScript(name,lang,text.slice(0,MAX_CODE));
  if(!r){Tools.toast(t('saveFail'),4000);return;}
  state.dirty[lang]=false;state.name[lang]=name;persist();
  Tools.toast(t(r,{name}));
  Tools.diag.log('script saved',{lang,chars:text.length,scripts:scripts.length});
});
$('scriptName').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('btnSave').click();}});
$('scripts').addEventListener('click',e=>{
  const li=e.target.closest('li[data-id]');
  if(!li)return;
  const s=scripts.find(x=>x.id===li.dataset.id);
  if(!s)return;
  if(e.target.closest('[data-act="delete"]')){
    if(!confirm(t('delConfirm',{name:s.name})))return;
    scripts=scripts.filter(x=>x!==s);Tools.save(LSC,scripts);renderScripts();
    Tools.toast(t('deleted'));Tools.diag.log('script deleted',{scripts:scripts.length});
    return;
  }
  if(!mayReplace(s.lang))return;
  setCode(s.lang,s.code,s.name);
  Tools.diag.log('script opened',{lang:s.lang,chars:s.code.length});
  Tools.menu.close();
});
$('btnOpen').addEventListener('click',()=>{const i=$('fileInput');i.value='';i.click();});
$('fileInput').addEventListener('change',async()=>{
  const f=$('fileInput').files[0];
  if(!f)return;
  Tools.diag.log('file chosen',{bytes:f.size,type:f.type||'?'});
  if(f.size>1048576){Tools.toast(t('tooBig'),4000);return;}
  let text;
  try{text=await f.text();}catch(e){Tools.diag.log('file read failed',e);Tools.toast(t('notText'),4000);return;}
  if(text.includes('\u0000')){Tools.toast(t('notText'),4000);return;}
  const ext=(f.name.match(/\.([A-Za-z0-9]+)$/)||[])[1]||'';
  const lang=/^pyw?$/i.test(ext)?'python':/^[mc]?js$/i.test(ext)?'javascript':state.lang;
  if(!mayReplace(lang))return;
  setCode(lang,text.replace(/\r\n?/g,'\n').slice(0,MAX_CODE),f.name.replace(/\.[A-Za-z0-9]+$/,'').slice(0,60));
  Tools.toast(t('opened',{name:f.name}));
  Tools.menu.close();
});
$('btnDownload').addEventListener('click',()=>{
  const text=code.value;
  if(!text.trim()){Tools.toast(t('emptyCode'));return;}
  const base=(state.name[state.lang]||'script').replace(/[\\/:*?"<>|\u0000-\u001f]+/g,'_').trim()||'script';
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
  a.download=`${base}.${EXT[state.lang]}`;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),10000);
  Tools.toast(t('downloaded'));
  Tools.diag.log('download',{lang:state.lang,chars:text.length});
});

/* ---------- Menu: input and settings ---------- */
stdinEl.value=state.stdin;
stdinEl.addEventListener('input',()=>{state.stdin=stdinEl.value.slice(0,MAX_CODE);persistSoon();});
function applySettings(){
  document.body.classList.toggle('font-l',state.font==='l');
  document.body.classList.toggle('font-xl',state.font==='xl');
  document.body.classList.toggle('nowrap',!state.wrap);
  code.wrap=state.wrap?'soft':'off';
  $('font').value=state.font;$('wrap').checked=state.wrap;
}
$('font').addEventListener('change',()=>{state.font=$('font').value;persist();applySettings();});
$('wrap').addEventListener('change',()=>{state.wrap=$('wrap').checked;persist();applySettings();});

/* ---------- WebMCP: tools for AI agents (English, see AGENTS.md) ---------- */
Tools.mcp.register({
  name:'run_code',title:'Run code',label:'mcp.run',
  description:'Runs a Python (CPython standard library only, no extra packages such as numpy) or JavaScript program in the app and returns what it printed. The code replaces the code in the editor and the output is shown to the user. No network access, no files, no DOM. Print with print() or console.log(); the value of the last expression is returned as "result". input() (Python) and prompt()/readline() (JavaScript) read the lines of "stdin". Returns { language, status: "finished" | "error" | "timed_out" | "stopped", stdout, stderr, result, error: { message, line } | null, duration_ms, output_truncated }.',
  inputSchema:{type:'object',additionalProperties:false,required:['language','code'],properties:{
    language:{type:'string',enum:LANGS,description:'Programming language of the code'},
    code:{type:'string',minLength:1,maxLength:100000,description:'The complete program'},
    stdin:{type:'string',maxLength:100000,description:'Text the program can read line by line (optional)'},
    timeout_seconds:{type:'integer',minimum:1,maximum:120,description:'The program is cancelled after this many seconds (default 30). Loading Python the first time does not count.'},
  }},
  execute:async input=>{
    if(job)throw new Error('Another program is still running in the app. Wait until it has finished or ask the user to stop it.');
    const lang=input.language;
    // Unsaved code of the user is kept as a script before the agent's code replaces it
    const cur=lang===state.lang?code.value:state.code[lang];
    if(state.dirty[lang]&&cur.trim()&&cur!==input.code){
      const when=new Date().toLocaleString(Tools.locale(),{dateStyle:'short',timeStyle:'short'});
      saveScript(t('draft',{when}),lang,cur.slice(0,MAX_CODE));
    }
    setCode(lang,input.code);
    const r=await run({stdin:input.stdin||'',timeout:(input.timeout_seconds||30)*1000});
    if(r.kind==='loaderror')throw new Error('Python could not be loaded. The first use needs an internet connection (about 13 MB download from this site); after that it works offline.');
    if(r.kind==='crash')throw new Error('The program could not be started in this browser.');
    return {language:last.language,status:last.status,stdout:last.stdout,stderr:last.stderr,result:last.result,error:last.error,duration_ms:last.duration_ms,output_truncated:last.output_truncated};
  },
});
Tools.mcp.register({
  name:'get_code',title:'Get code',label:'mcp.code',readOnly:true,untrusted:true,
  description:'Reads the program that is currently in the editor of the app. Returns { language: "python" | "javascript", code, stdin } – stdin is the text the program reads with input() or prompt().',
  execute:()=>({language:state.lang,code:code.value,stdin:state.stdin}),
});
Tools.mcp.register({
  name:'get_output',title:'Get output',label:'mcp.output',readOnly:true,untrusted:true,
  description:'Reads the output of the last run in the app. Returns { has_run, running, language, status, stdout, stderr, result, error, duration_ms, output_truncated }; has_run is false if nothing was run since the app was opened. While a program is running, running is true and the output so far is returned.',
  execute:()=>{
    if(!last)return {has_run:false,running:false};
    if(job)return {has_run:true,running:true,language:job.lang,status:'running',stdout:job.stdout,stderr:job.stderr,result:null,error:job.error,duration_ms:null,output_truncated:job.truncated};
    return Object.assign({has_run:true},last);
  },
});

/* ---------- Start ---------- */
applySettings();showLang();renderScripts();showRunning(false);
Tools.onLang(()=>{renderExamples();renderScripts();showRunning(!!job);if(lastStatus)setStatus(t(lastStatus.key,lastStatus.vars),lastStatus.err);});
// Diagnostics: states and numbers only – never code, input or output
Tools.diag.info(()=>({
  language:state.lang,chars:code.value.length,stdinChars:state.stdin.length,scripts:scripts.length,
  running:job?job.lang:false,python:py?(py.ready?'ready '+py.version:'loading'):'not loaded',
  lastRun:last?{language:last.language,status:last.status,ms:last.duration_ms,out:last.stdout.length,err:last.stderr.length}:null,
  font:state.font,wrap:state.wrap,
}));
})();
