/* Toolbar fit – a .toolbar with "Mehr" (.toolbar-more) that uses the room it has (UI-KONZEPT.md, "Werkzeugleiste"
   and "Große Bildschirme"). On a phone the bar shows the app's most used tools and "Mehr"; on a wider screen as many
   tools move into the bar as get ≥ 64 px each (the width at which base.css shows the words), and when all of them
   fit, "Mehr" disappears.

   Markup (as before): the app renders its most used tools into the bar, then the "Mehr" button as the last item
   (aria-controls = id of the .toolbar-more, aria-expanded), and the other tools into the .toolbar-more, in the order
   of their use. Tools are buttons with data-tool; event handling stays in the app (delegate on bar and more).

     const fit = ToolbarFit.init({ bar, more, min: 4 });
       min    tools that always stay in the bar (the phone layout the app chose; default: those the app
              rendered into the bar)
       order  optional list of data-tool values: the order of the tools in the bar on a wide screen
              (e.g. Rückgängig next to Wiederholen), tools not in it keep their place after the listed ones
     fit.update()   after every render of bar/more (a ResizeObserver calls it on every size change)

   Which tools move into the bar is fixed by the order of use (bar first, then "Mehr"), never by the wide order. */
(function (root) {
  'use strict';
  const ITEM = 64;  // px per item with its word (base.css: container queries of .toolbar)

  function init(opt) {
    const { bar, more } = opt;
    const order = opt.order || [];
    const moreBtn = () => bar.querySelector(`[aria-controls="${more.id}"]`);
    let rendered = 0;                           // tools the app put into the bar itself (last render)
    const pos = b => { const i = order.indexOf(b.dataset.tool); return i < 0 ? order.length : i; };

    function update() {
      const btn = moreBtn();
      if (!btn) return;                         // nothing behind "Mehr" in this state
      // Tools by use: data-use keeps it across moves (set on the first update after a render)
      const tools = [...bar.querySelectorAll(':scope > [data-tool]'), ...more.querySelectorAll(':scope > [data-tool]')];
      if (tools.some(b => b.dataset.use == null)) {
        tools.forEach((b, i) => { b.dataset.use = i; });
        rendered = tools.filter(b => b.parentNode === bar).length;
      }
      tools.sort((a, b) => a.dataset.use - b.dataset.use);
      const min = Math.min(opt.min ?? rendered, tools.length);
      const gap = parseFloat(getComputedStyle(bar).columnGap) || 0;
      const room = Math.floor((bar.clientWidth + gap) / (ITEM + gap));
      const all = room >= tools.length;
      const n = all ? tools.length : Math.max(min, room - 1);
      const inBar = tools.slice(0, n).sort((a, b) => pos(a) - pos(b) || a.dataset.use - b.dataset.use);
      // Only touch the DOM when the split changes (keeps the focus and avoids layout work while resizing)
      const now = [...bar.querySelectorAll(':scope > [data-tool]')];
      if (now.length !== inBar.length || now.some((b, i) => b !== inBar[i])) {
        for (const b of inBar) bar.insertBefore(b, btn);
        for (const b of tools.slice(n)) more.appendChild(b);
      }
      btn.hidden = all;
      if (all && !more.hidden) { more.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    }

    if ('ResizeObserver' in root) new ResizeObserver(update).observe(bar);
    else root.addEventListener('resize', update);
    update();
    return { update };
  }

  root.ToolbarFit = { init };
})(window);
