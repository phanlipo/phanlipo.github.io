/* Toolbox – apps with several tools (calculators, sensors): an overview of tiles, and per tool a tab bar on top.
   Markup and look: base.css ("Apps with several tools"), rule: UI-KONZEPT.md "Werkzeugkasten".
     #overview            the overview; tiles are buttons with data-open="<name>"
     #tabbar              the bar shown inside a tool: a button with data-overview ("‹ Übersicht") and
                          tabs (role="tab", data-tab="<name>", aria-controls="<id of the tool's panel>")
   The phone's back key returns from a tool to the overview (one history entry for "in a tool"). The app keeps the
   state ({ view: 'overview' | 'tool', tab }) in its own storage, so the last tool opens again after a reload.

     const box = Toolbox.init({
       state: { view, tab },                  // saved state (missing or unknown values are fine)
       onChange: state => …,                  // save it
       onSelect: (name, { gesture, same }) => …,  // a tool is shown (gesture: the user tapped; same: tapped again)
       onOverview: () => …,                   // back on the overview (stop what runs)
     });
     box.open(name)       show a tool (from anywhere, e.g. a WebMCP tool)
     box.overview()       back to the overview
     box.current()        name of the tool shown, or null on the overview */
(function (root) {
  'use strict';

  function init(opt = {}) {
    const overviewEl = document.getElementById('overview');
    const bar = document.getElementById('tabbar');
    const tabs = [...bar.querySelectorAll('[role="tab"][data-tab]')];
    const names = tabs.map(t => t.dataset.tab);
    const panel = name => document.getElementById(tabs[names.indexOf(name)].getAttribute('aria-controls'));
    const tablist = bar.querySelector('[role="tablist"]') || bar;
    const state = { view: 'overview', tab: names[0] };
    if (opt.state && names.includes(opt.state.tab)) state.tab = opt.state.tab;
    if (opt.state && opt.state.view === 'tool') state.view = 'tool';
    const changed = () => { if (opt.onChange) opt.onChange({ view: state.view, tab: state.tab }); };
    const KEY = 'toolbox';
    const inTool = () => !!(history.state && history.state[KEY]);

    function select(name, { focus = false, gesture = false } = {}) {
      if (!names.includes(name)) name = names[0];
      const same = state.view === 'tool' && state.tab === name && !panel(name).hidden;
      for (const t of tabs) {
        const sel = t.dataset.tab === name;
        t.setAttribute('aria-selected', String(sel));
        t.tabIndex = sel ? 0 : -1;
        panel(t.dataset.tab).hidden = !sel;
      }
      const act = tabs[names.indexOf(name)];
      if (focus) act.focus();
      // keep the open tab visible in the bar that scrolls sideways
      tablist.scrollLeft = act.offsetLeft - (tablist.clientWidth - act.offsetWidth) / 2;
      state.tab = name; changed();
      if (opt.onSelect) opt.onSelect(name, { gesture, same });
    }

    function show(view) {
      state.view = view;
      overviewEl.hidden = view !== 'overview';
      bar.hidden = view === 'overview';
      if (view === 'overview') {
        for (const n of names) panel(n).hidden = true;
        if (opt.onOverview) opt.onOverview();
      }
      changed();
    }

    function open(name, gesture = false) {
      if (state.view === 'overview') {
        if (!inTool()) history.pushState(Object.assign({}, history.state, { [KEY]: true }), '');
        show('tool');
        window.scrollTo(0, 0);
      }
      select(name, { gesture });
    }

    function overview() {
      if (state.view === 'overview') return;
      if (inTool()) history.back(); else { show('overview'); window.scrollTo(0, 0); }
    }

    document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => open(b.dataset.open, true)));
    bar.querySelectorAll('[data-overview]').forEach(b => b.addEventListener('click', overview));
    tablist.addEventListener('click', e => {
      const t = e.target.closest('[role="tab"][data-tab]');
      if (t) select(t.dataset.tab, { gesture: true });
    });
    tablist.addEventListener('keydown', e => {
      const i = names.indexOf(state.tab);
      const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (k) { e.preventDefault(); select(names[(i + k + names.length) % names.length], { focus: true, gesture: true }); }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); select(names[e.key === 'Home' ? 0 : names.length - 1], { focus: true, gesture: true }); }
    });
    window.addEventListener('popstate', () => {
      if (inTool()) { if (state.view !== 'tool') { show('tool'); select(state.tab); } }
      else if (state.view !== 'overview') { show('overview'); window.scrollTo(0, 0); }
    });

    if (state.view === 'tool') {
      // Reopen the last tool; "back" then leads to the overview
      if (!inTool()) history.pushState(Object.assign({}, history.state, { [KEY]: true }), '');
      show('tool');
      select(state.tab);
    } else {
      // e.g. after deleting all data the page reloads in a tool entry – make it the overview entry
      if (inTool()) history.replaceState(Object.assign({}, history.state, { [KEY]: false }), '');
      show('overview');
    }

    return { open, overview, current: () => state.view === 'tool' ? state.tab : null, names: () => names.slice() };
  }

  root.Toolbox = { init };
})(window);
