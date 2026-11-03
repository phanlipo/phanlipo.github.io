/* Treasure hunt – puzzle types. Exposes window.HuntPuzzles.
   A new type is one entry in TYPES (plus its texts in I18N):
     icon        emoji for lists and the editor
     sensor      'mic' | 'gps' | null – shown in the editor ("needs the microphone")
     defaults()  new puzzle of this type (without "type")
     clean(p, h) puzzle from an imported/edited object (h: helpers str, num, int, list, image, MAX_TEXT)
     edit(p, F)  editor fields as HTML (F: field helpers below, paths start with "puzzle.")
     play(p, c)  shows the puzzle in c.box and calls c.done(true | false) once. Helpers in c:
                 c.say(text) speaker button, c.img(src), c.mic(), c.geo(), c.distance(a, b), c.cleanup(fn),
                 c.fallback(text) button that lets a parent count the task as solved (sensor missing/unreliable),
                 c.sound(name), c.log(msg, data)
   Sensors are unreliable (no permission, iPhone, quiet microphone, GPS jumps): every sensor task offers the
   fallback, and the parent area can always count a task as solved. */
window.HuntPuzzles = (function () {
  'use strict';
  const t = (k, v) => Tools.t(k, v), esc = Tools.esc;

  const I18N = {
    de: {
      'pz.quiz': 'Quiz (4 Antworten)', 'pz.riddle': 'Denkrätsel (Antwort eintippen)', 'pz.task': 'Aufgabe (Eltern bestätigen)',
      'pz.loud': 'Brüllen (Mikrofon)', 'pz.clap': 'Klatschen (Mikrofon)', 'pz.run': 'Rennen (GPS)',
      'pz.question': 'Frage', 'pz.answer': 'Antwort {n}', 'pz.correct': 'Richtige Antwort', 'pz.image': 'Bild',
      'pz.answers': 'Richtige Antworten (mehrere mit | trennen)', 'pz.hint': 'Tipp (nach 2 falschen Versuchen)',
      'pz.variant': 'Art der Aufgabe', 'pz.v.team': 'Teamaufgabe', 'pz.v.search': 'Suchaufgabe', 'pz.v.picture': 'Bilderaufgabe',
      'pz.v.move': 'Bewegung', 'pz.v.think': 'Denkaufgabe', 'pz.task.text': 'Aufgabe', 'pz.seconds': 'Zeit in Sekunden (0 = ohne)',
      'pz.loud.seconds': 'Wie lange brüllen (Sekunden)', 'pz.level': 'Wie laut', 'pz.lv.quiet': 'normal', 'pz.lv.medium': 'laut', 'pz.lv.loud': 'sehr laut',
      'pz.claps': 'Wie oft klatschen', 'pz.meters': 'Strecke in Metern', 'pz.run.seconds': 'Zeit in Sekunden',
      'pz.bonus': 'Kampf-Bonus, wenn gelöst', 'pz.needsMic': 'Braucht das Mikrofon – sonst bestätigen die Eltern.',
      'pz.needsGps': 'Braucht GPS im Freien – sonst bestätigen die Eltern.',
      'pz.check': 'Prüfen', 'pz.typeHere': 'Eure Antwort', 'pz.wrong': 'Noch nicht richtig – nochmal!', 'pz.giveUp': 'Aufgeben',
      'pz.done': 'Geschafft!', 'pz.notDone': 'Nicht geschafft', 'pz.timeLeft': 'Noch {n} s', 'pz.timeUp': 'Zeit um!',
      'pz.start': 'Start!', 'pz.startMic': 'Mikrofon starten', 'pz.listening': 'Ich höre zu …',
      'pz.claps.count': '{n} von {m}', 'pz.run.wait': 'Warte auf GPS …', 'pz.run.left': 'Noch {n} m!', 'pz.run.badGps': 'GPS zu ungenau.',
      'pz.noMic': 'Das Mikrofon geht hier nicht.', 'pz.noGps': 'GPS geht hier nicht.',
      'pz.fallback': 'Eltern: als geschafft werten', 'pz.hintIs': 'Tipp: {h}',
      'pz.def.loud': 'Brüllt so laut wie ein Löwe!', 'pz.def.clap': 'Klatscht 5-mal in die Hände!', 'pz.def.run': 'Rennt 30 Meter weit, so schnell ihr könnt!',
      'pz.levelLabel': 'Lautstärke', 'pz.progress': 'Fortschritt',
    },
    en: {
      'pz.quiz': 'Quiz (4 answers)', 'pz.riddle': 'Riddle (type the answer)', 'pz.task': 'Task (parents confirm)',
      'pz.loud': 'Roar (microphone)', 'pz.clap': 'Clap (microphone)', 'pz.run': 'Run (GPS)',
      'pz.question': 'Question', 'pz.answer': 'Answer {n}', 'pz.correct': 'Correct answer', 'pz.image': 'Picture',
      'pz.answers': 'Correct answers (separate several with |)', 'pz.hint': 'Hint (after 2 wrong tries)',
      'pz.variant': 'Kind of task', 'pz.v.team': 'Team task', 'pz.v.search': 'Search task', 'pz.v.picture': 'Picture task',
      'pz.v.move': 'Movement', 'pz.v.think': 'Thinking task', 'pz.task.text': 'Task', 'pz.seconds': 'Time in seconds (0 = none)',
      'pz.loud.seconds': 'How long to roar (seconds)', 'pz.level': 'How loud', 'pz.lv.quiet': 'normal', 'pz.lv.medium': 'loud', 'pz.lv.loud': 'very loud',
      'pz.claps': 'How many claps', 'pz.meters': 'Distance in metres', 'pz.run.seconds': 'Time in seconds',
      'pz.bonus': 'Battle bonus when solved', 'pz.needsMic': 'Needs the microphone – otherwise the parents confirm.',
      'pz.needsGps': 'Needs GPS outdoors – otherwise the parents confirm.',
      'pz.check': 'Check', 'pz.typeHere': 'Your answer', 'pz.wrong': 'Not quite – try again!', 'pz.giveUp': 'Give up',
      'pz.done': 'Done!', 'pz.notDone': 'Not done', 'pz.timeLeft': '{n} s left', 'pz.timeUp': 'Time is up!',
      'pz.start': 'Start!', 'pz.startMic': 'Start microphone', 'pz.listening': 'Listening …',
      'pz.claps.count': '{n} of {m}', 'pz.run.wait': 'Waiting for GPS …', 'pz.run.left': '{n} m to go!', 'pz.run.badGps': 'GPS not accurate enough.',
      'pz.noMic': 'The microphone does not work here.', 'pz.noGps': 'GPS does not work here.',
      'pz.fallback': 'Parents: count as done', 'pz.hintIs': 'Hint: {h}',
      'pz.def.loud': 'Roar as loud as a lion!', 'pz.def.clap': 'Clap your hands 5 times!', 'pz.def.run': 'Run 30 metres as fast as you can!',
      'pz.levelLabel': 'Loudness', 'pz.progress': 'Progress',
    },
  };

  /* ---------- Editor fields (also used by the page for its own forms) ----------
     data-f = path in the edited object, data-t = num | int | list | bool (default: text) */
  let seq = 0;
  const get = (o, path) => path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
  const fid = () => 'thf' + (++seq);
  const F = {
    get,
    text(o, path, label, attrs) {
      const id = fid(), v = get(o, path);
      return `<div class="fld"><label for="${id}">${esc(label)}</label><input type="text" id="${id}" data-f="${path}" value="${esc(v == null ? '' : v)}" ${attrs || ''}></div>`;
    },
    area(o, path, label, attrs) {
      const id = fid();
      return `<div class="fld"><label for="${id}">${esc(label)}</label><textarea id="${id}" data-f="${path}" rows="3" ${attrs || ''}>${esc(get(o, path) || '')}</textarea></div>`;
    },
    num(o, path, label, min, max, isInt) {
      const id = fid(), v = get(o, path);
      return `<div class="fld"><label for="${id}">${esc(label)}</label><input type="text" inputmode="${isInt ? 'numeric' : 'decimal'}" id="${id}" data-f="${path}" data-t="${isInt ? 'int' : 'num'}" data-min="${min}" data-max="${max}" value="${v == null ? '' : esc(String(v))}"></div>`;
    },
    list(o, path, label, listId) {
      const id = fid(), v = get(o, path) || [];
      return `<div class="fld"><label for="${id}">${esc(label)}</label><input type="text" id="${id}" data-f="${path}" data-t="list" value="${esc(v.join(', '))}" autocapitalize="off" ${listId ? `list="${listId}"` : ''}></div>`;
    },
    check(o, path, label) {
      const id = fid();
      return `<label class="chk" for="${id}"><input type="checkbox" id="${id}" data-f="${path}" data-t="bool" ${get(o, path) ? 'checked' : ''}><span>${esc(label)}</span></label>`;
    },
    select(o, path, label, options, attrs) {
      const id = fid(), v = String(get(o, path) == null ? '' : get(o, path));
      return `<div class="fld"><label for="${id}">${esc(label)}</label><select id="${id}" data-f="${path}" ${attrs || ''}>${options.map(([val, lab]) =>
        `<option value="${esc(val)}"${String(val) === v ? ' selected' : ''}>${esc(lab)}</option>`).join('')}</select></div>`;
    },
    img(o, path, label) {
      const v = get(o, path), id = fid();
      return `<div class="fld"><span class="lbl" id="${id}">${esc(label)}</span><div class="img-field">${v ? `<img src="${esc(v)}" alt="">` : ''}
        <button type="button" class="btn small" data-img="${path}" aria-describedby="${id}">${esc(t(v ? 'ed.imgChange' : 'ed.imgAdd'))}</button>
        ${v ? `<button type="button" class="btn small danger" data-img-del="${path}" aria-describedby="${id}">${esc(t('ed.imgDel'))}</button>` : ''}</div></div>`;
    },
  };

  /* ---------- Microphone: level in dBFS ---------- */
  async function openMic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no api');
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
    } catch (e) { ctx.close().catch(() => {}); throw e; }
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    const src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
    an.fftSize = 1024; src.connect(an);
    const buf = new Float32Array(an.fftSize);
    return {
      db() { an.getFloatTimeDomainData(buf); let s = 0; for (const x of buf) s += x * x; return 20 * Math.log10(Math.sqrt(s / buf.length) + 1e-9); },
      close() { stream.getTracks().forEach(tr => tr.stop()); ctx.close().catch(() => {}); },
    };
  }
  const LEVELS = { quiet: -38, medium: -28, loud: -18 };
  const meter = (label) => `<div class="meter" role="meter" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>`;
  const setMeter = (el, v) => { v = Math.max(0, Math.min(1, v)); el.firstElementChild.style.width = (v * 100).toFixed(1) + '%'; el.setAttribute('aria-valuenow', String(Math.round(v * 100))); };

  // Shared: a start button (sensors need a tap, iPhone), then the measurement; errors lead to the fallback
  function sensorTask(p, c, text, startLabel, run) {
    c.box.innerHTML = `${c.say(text)}<div class="pz-sensor"><button type="button" class="btn primary huge" data-pz="start">${esc(startLabel)}</button></div>`;
    c.box.querySelector('[data-pz="start"]').addEventListener('click', async e => {
      e.currentTarget.disabled = true;
      try { await run(c.box.querySelector('.pz-sensor')); }
      catch (err) {
        c.log('sensor task failed', { type: p.type, error: err && (err.name || err.message) });
        c.box.querySelector('.pz-sensor').innerHTML = `<p class="pz-msg err">${esc(t(p.type === 'run' ? 'pz.noGps' : 'pz.noMic'))}</p>`;
      }
    });
    c.fallback();
  }

  const TYPES = {
    quiz: {
      icon: '❓', sensor: null,
      defaults: () => ({ question: '', image: '', answers: ['', '', '', ''], correct: 0, bonus: 3 }),
      clean: (p, h) => {
        const answers = (Array.isArray(p.answers) ? p.answers : []).slice(0, 4).map(a => h.str(a, 200));
        while (answers.length < 4) answers.push('');
        return { type: 'quiz', question: h.str(p.question, h.MAX_TEXT), image: h.image(p.image), answers, correct: h.int(p.correct, 0, 0, 3), bonus: h.int(p.bonus, 3, 0, 99) };
      },
      edit: (p, F) => F.area(p, 'puzzle.question', t('pz.question')) + F.img(p, 'puzzle.image', t('pz.image'))
        + [0, 1, 2, 3].map(i => F.text(p, `puzzle.answers.${i}`, t('pz.answer', { n: i + 1 }))).join('')
        + F.select(p, 'puzzle.correct', t('pz.correct'), [0, 1, 2, 3].map(i => [String(i), t('pz.answer', { n: i + 1 })]), 'data-t="int"'),
      play(p, c) {
        const shapes = ['▲', '●', '■', '◆'];
        const answers = p.answers.map((a, i) => [a, i]).filter(([a]) => a.trim());
        const speech = p.question + '. ' + answers.map(([a]) => a).join('? ') + '?';
        c.box.innerHTML = `${c.say(p.question, speech)}${p.image ? c.img(p.image) : ''}
          <div class="answers">${answers.map(([a, i]) => `<button type="button" class="ans ans-${i}" data-i="${i}"><span class="shape" aria-hidden="true">${shapes[i]}</span><span>${esc(a)}</span></button>`).join('')}</div>`;
        let over = false;
        c.box.querySelector('.answers').addEventListener('click', e => {
          const b = e.target.closest('.ans');
          if (!b || over) return;
          over = true;
          const ok = Number(b.dataset.i) === p.correct;
          b.classList.add(ok ? 'right' : 'wrong');
          if (!ok) { const r = c.box.querySelector(`.ans[data-i="${p.correct}"]`); if (r) r.classList.add('right'); }
          c.sound(ok ? 'win' : 'lose');
          setTimeout(() => c.done(ok), 1100);
        });
      },
    },

    riddle: {
      icon: '🧠', sensor: null,
      defaults: () => ({ question: '', image: '', answers: '', hint: '', bonus: 3 }),
      clean: (p, h) => ({ type: 'riddle', question: h.str(p.question, h.MAX_TEXT), image: h.image(p.image), answers: h.str(p.answers, 300), hint: h.str(p.hint, 500), bonus: h.int(p.bonus, 3, 0, 99) }),
      edit: (p, F) => F.area(p, 'puzzle.question', t('pz.question')) + F.img(p, 'puzzle.image', t('pz.image'))
        + F.text(p, 'puzzle.answers', t('pz.answers')) + F.text(p, 'puzzle.hint', t('pz.hint')),
      play(p, c) {
        const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
        const ok = p.answers.split('|').map(norm).filter(Boolean);
        c.box.innerHTML = `${c.say(p.question)}${p.image ? c.img(p.image) : ''}
          <form class="pz-riddle"><label class="sr-only" for="pzAnswer">${esc(t('pz.typeHere'))}</label>
          <input type="text" id="pzAnswer" autocomplete="off" autocapitalize="off" placeholder="${esc(t('pz.typeHere'))}">
          <button class="btn primary huge" type="submit">${esc(t('pz.check'))}</button></form>
          <p class="pz-msg" role="status"></p>
          <div class="row center"><button type="button" class="btn" data-pz="give">${esc(t('pz.giveUp'))}</button></div>`;
        let wrong = 0, over = false;
        const msg = c.box.querySelector('.pz-msg'), input = c.box.querySelector('input');
        c.box.querySelector('form').addEventListener('submit', e => {
          e.preventDefault();
          if (over || !input.value.trim()) return;
          if (ok.includes(norm(input.value))) { over = true; c.sound('win'); msg.textContent = '🎉'; setTimeout(() => c.done(true), 600); return; }
          wrong++; c.sound('lose');
          msg.textContent = t('pz.wrong') + (wrong >= 2 && p.hint ? ' ' + t('pz.hintIs', { h: p.hint }) : '');
          input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake');
        });
        c.box.querySelector('[data-pz="give"]').addEventListener('click', () => { if (!over) { over = true; c.done(false); } });
      },
    },

    task: {
      icon: '⭐', sensor: null,
      variants: { team: '🤝', search: '🔍', picture: '🖼️', move: '🤸', think: '💡' },
      defaults: () => ({ variant: 'team', task: '', image: '', seconds: 0, bonus: 3 }),
      clean: (p, h) => ({ type: 'task', variant: ['team', 'search', 'picture', 'move', 'think'].includes(p.variant) ? p.variant : 'team',
        task: h.str(p.task, h.MAX_TEXT), image: h.image(p.image), seconds: h.int(p.seconds, 0, 0, 3600), bonus: h.int(p.bonus, 3, 0, 99) }),
      edit: (p, F) => F.select(p, 'puzzle.variant', t('pz.variant'), Object.keys(TYPES.task.variants).map(v => [v, TYPES.task.variants[v] + ' ' + t('pz.v.' + v)]))
        + F.area(p, 'puzzle.task', t('pz.task.text')) + F.img(p, 'puzzle.image', t('pz.image'))
        + F.num(p, 'puzzle.seconds', t('pz.seconds'), 0, 3600, true),
      play(p, c) {
        c.box.innerHTML = `<div class="pz-icon" aria-hidden="true">${TYPES.task.variants[p.variant] || '⭐'}</div>${c.say(p.task)}${p.image ? c.img(p.image) : ''}
          ${p.seconds ? `<p class="pz-timer" role="timer" aria-live="off">${esc(t('pz.timeLeft', { n: p.seconds }))}</p>` : ''}
          <div class="pz-buttons"><button type="button" class="btn primary huge" data-pz="ok">✓ ${esc(t('pz.done'))}</button>
          <button type="button" class="btn" data-pz="no">${esc(t('pz.notDone'))}</button></div>`;
        let over = false;
        if (p.seconds) {
          const el = c.box.querySelector('.pz-timer'), end = Date.now() + p.seconds * 1000;
          const iv = setInterval(() => {
            const left = Math.ceil((end - Date.now()) / 1000);
            if (left > 0) { el.textContent = t('pz.timeLeft', { n: left }); return; }
            clearInterval(iv); el.textContent = t('pz.timeUp'); el.classList.add('up'); c.sound('alarm');
          }, 250);
          c.cleanup(() => clearInterval(iv));
        }
        const end = ok => { if (!over) { over = true; if (ok) c.sound('win'); c.done(ok); } };
        c.box.querySelector('[data-pz="ok"]').addEventListener('click', () => end(true));
        c.box.querySelector('[data-pz="no"]').addEventListener('click', () => end(false));
      },
    },

    loud: {
      icon: '📣', sensor: 'mic',
      defaults: () => ({ task: t('pz.def.loud'), seconds: 2, level: 'medium', bonus: 3 }),
      clean: (p, h) => ({ type: 'loud', task: h.str(p.task, h.MAX_TEXT), seconds: h.num(p.seconds, 2, 0.5, 20), level: LEVELS[p.level] ? p.level : 'medium', bonus: h.int(p.bonus, 3, 0, 99) }),
      edit: (p, F) => F.area(p, 'puzzle.task', t('pz.task.text')) + F.num(p, 'puzzle.seconds', t('pz.loud.seconds'), 0.5, 20)
        + F.select(p, 'puzzle.level', t('pz.level'), Object.keys(LEVELS).map(k => [k, t('pz.lv.' + k)])),
      play(p, c) {
        sensorTask(p, c, p.task, '🎤 ' + t('pz.startMic'), async area => {
          const mic = await c.mic();
          area.innerHTML = `<p class="pz-msg">${esc(t('pz.listening'))}</p>${meter(t('pz.levelLabel'))}<div class="progress">${meter(t('pz.progress'))}</div>`;
          const [lvl, prog] = area.querySelectorAll('.meter');
          const need = LEVELS[p.level];
          let acc = 0, last = performance.now(), raf = 0, over = false;
          const loop = now => {
            const dt = Math.min(0.2, (now - last) / 1000); last = now;
            const db = mic.db();
            setMeter(lvl, (db + 60) / 60);
            lvl.classList.toggle('hot', db >= need);
            if (db >= need) acc += dt;
            setMeter(prog, acc / p.seconds);
            if (acc >= p.seconds && !over) { over = true; mic.close(); c.sound('win'); setTimeout(() => c.done(true), 400); return; }
            raf = requestAnimationFrame(loop);
          };
          raf = requestAnimationFrame(loop);
          c.cleanup(() => { cancelAnimationFrame(raf); mic.close(); });
        });
      },
    },

    clap: {
      icon: '👏', sensor: 'mic',
      defaults: () => ({ task: t('pz.def.clap'), count: 5, bonus: 3 }),
      clean: (p, h) => ({ type: 'clap', task: h.str(p.task, h.MAX_TEXT), count: h.int(p.count, 5, 1, 50), bonus: h.int(p.bonus, 3, 0, 99) }),
      edit: (p, F) => F.area(p, 'puzzle.task', t('pz.task.text')) + F.num(p, 'puzzle.count', t('pz.claps'), 1, 50, true),
      play(p, c) {
        sensorTask(p, c, p.task, '🎤 ' + t('pz.startMic'), async area => {
          const mic = await c.mic();
          area.innerHTML = `<p class="pz-count" aria-live="polite">${esc(t('pz.claps.count', { n: 0, m: p.count }))}</p>${meter(t('pz.levelLabel'))}`;
          const out = area.querySelector('.pz-count'), lvl = area.querySelector('.meter');
          // A clap: a short jump well above the background noise, at most one every 180 ms
          let base = -50, n = 0, lastClap = 0, raf = 0, over = false;
          const loop = now => {
            const db = mic.db();
            setMeter(lvl, (db + 60) / 60);
            if (db > base + 18 && db > -32 && now - lastClap > 180) {
              lastClap = now; n++;
              out.textContent = t('pz.claps.count', { n, m: p.count });
              c.sound('hit');
              if (n >= p.count && !over) { over = true; mic.close(); setTimeout(() => c.done(true), 500); return; }
            }
            base = db < base ? db : base * 0.98 + db * 0.02;
            raf = requestAnimationFrame(loop);
          };
          raf = requestAnimationFrame(loop);
          c.cleanup(() => { cancelAnimationFrame(raf); mic.close(); });
        });
      },
    },

    run: {
      icon: '🏃', sensor: 'gps',
      defaults: () => ({ task: t('pz.def.run'), meters: 30, seconds: 60, bonus: 3 }),
      clean: (p, h) => ({ type: 'run', task: h.str(p.task, h.MAX_TEXT), meters: h.int(p.meters, 30, 10, 2000), seconds: h.int(p.seconds, 60, 5, 3600), bonus: h.int(p.bonus, 3, 0, 99) }),
      edit: (p, F) => F.area(p, 'puzzle.task', t('pz.task.text')) + F.num(p, 'puzzle.meters', t('pz.meters'), 10, 2000, true)
        + F.num(p, 'puzzle.seconds', t('pz.run.seconds'), 5, 3600, true),
      play(p, c) {
        sensorTask(p, c, p.task, '🏁 ' + t('pz.start'), async area => {
          const geo = c.geo();
          if (!geo.supported()) throw new Error('no gps');
          area.innerHTML = `<p class="pz-count" aria-live="polite">${esc(t('pz.run.wait'))}</p><p class="pz-timer"></p><div class="progress">${meter(t('pz.progress'))}</div>`;
          const out = area.querySelector('.pz-count'), timer = area.querySelector('.pz-timer'), prog = area.querySelector('.meter');
          let start = null, best = 0, end = 0, over = false;
          const step = () => {
            if (over) return;
            const pos = geo.pos();
            if (!start) {
              // Start only with a reasonably good fix, otherwise jumps would count as running
              if (pos && pos.acc <= 35 && Date.now() - pos.t < 5000) { start = pos; end = Date.now() + p.seconds * 1000; }
              else { out.textContent = pos ? t('pz.run.badGps') : t('pz.run.wait'); return; }
            }
            if (pos && pos.acc <= 40) best = Math.max(best, c.distance(start, pos));
            const left = Math.max(0, Math.ceil(p.meters - best));
            out.textContent = left ? t('pz.run.left', { n: left }) : '🎉';
            setMeter(prog, best / p.meters);
            const secs = Math.ceil((end - Date.now()) / 1000);
            timer.textContent = secs > 0 ? t('pz.timeLeft', { n: secs }) : t('pz.timeUp');
            if (!left) { over = true; c.sound('win'); setTimeout(() => c.done(true), 500); }
            else if (secs <= 0) { over = true; c.sound('lose'); setTimeout(() => c.done(false), 900); }
          };
          const iv = setInterval(step, 500);
          c.cleanup(() => clearInterval(iv));
          step();
        });
      },
    },
  };

  // Battle bonus field for every type (only used when the scene is a battle)
  const bonusField = (p, F) => F.num(p, 'puzzle.bonus', t('pz.bonus'), 0, 99, true);

  return { TYPES, I18N, F, bonusField, openMic, LEVELS };
})();
