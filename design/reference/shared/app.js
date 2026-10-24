/* LinkSink design mockup engine. Shared by the three directions; each page sets window.LINKSINK_CONFIG.
   Everything here is plain DOM + CSS: every move maps to Svelte's transition:fly / animate:flip / CSS. */
(function () {
  'use strict';
  const DATA = window.LINKSINK_DATA;
  const cfg = Object.assign({ dir: 'a', name: 'Ledger', rows: 'ledger', detail: 'panel', shell: 'sidebar', groupByDay: false }, window.LINKSINK_CONFIG || {});
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NOW = new Date('2026-10-24T08:00:00Z');
  const MEDIA = ['Video', 'Article', 'Post', 'Repo', 'Podcast', 'Image', 'PDF', 'Page'];
  const STATUS = ['to read', 'in progress', 'done'];
  const PRIORITY = ['low', 'medium', 'high'];
  const PROJ = Object.fromEntries(DATA.projects.map((p) => [p.id, p]));

  // ---------- icons (inline SVG, 16px, 1.5 stroke) ----------
  const I = (name, size) => {
    const d = {
      search: '<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/>',
      plus: '<path d="M8 3v10M3 8h10"/>',
      x: '<path d="m4 4 8 8M12 4l-8 8"/>',
      check: '<path d="m3.5 8.5 3 3 6-7"/>',
      chev: '<path d="m4 6 4 4 4-4"/>',
      back: '<path d="M10 3 5 8l5 5"/>',
      menu: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/>',
      ext: '<path d="M6.5 3.5H3.5v9h9V9.5M9 3h4v4M13 3 7.5 8.5"/>',
      copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>',
      more: '<circle cx="3.5" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="12.5" cy="8" r="1"/>',
      archive: '<rect x="2.5" y="3" width="11" height="3"/><path d="M3.5 6v7h9V6M6.5 9h3"/>',
      trash: '<path d="M3 4.5h10M6.5 4.5v-2h3v2M4.5 4.5l.7 9h5.6l.7-9"/>',
      tag: '<path d="M2.5 2.5h5l6 6-5 5-6-6z"/><circle cx="5.5" cy="5.5" r="1"/>',
      folder: '<path d="M2.5 4.5a1 1 0 0 1 1-1h3l1.5 1.5h4.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z"/>',
      flag: '<path d="M4 14V2.5h8l-2 3 2 3H4"/>',
      circle: '<circle cx="8" cy="8" r="5"/>',
      inbox: '<path d="M2.5 9h3l1 2h3l1-2h3M2.5 9v3.5h11V9M4.5 3h7l2 6h-11z"/>',
      link: '<path d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-1 1M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l1-1"/>',
      clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/>',
      sun: '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/>',
      moon: '<path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z"/>',
      phone: '<rect x="4.5" y="1.5" width="7" height="13" rx="1.5"/><path d="M7 12.5h2"/>',
      monitor: '<rect x="1.5" y="2.5" width="13" height="9" rx="1"/><path d="M5.5 14h5M8 11.5V14"/>',
      cmd: '<path d="M5 3.5A1.5 1.5 0 1 0 3.5 5H5zm0 0h6m0 0A1.5 1.5 0 1 1 12.5 5H11zM5 11A1.5 1.5 0 1 1 3.5 11H5zm0 0h6m0 0a1.5 1.5 0 1 0 1.5 1.5V11zM5 5v6m6-6v6"/>',
      filter: '<path d="M2.5 3.5h11l-4.5 5v4l-2 1v-5z"/>',
      undo: '<path d="M3 6.5h6.5a3 3 0 0 1 0 6H8M3 6.5 5.5 4M3 6.5 5.5 9"/>',
      settings: '<circle cx="8" cy="8" r="2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>',
      play: '<path d="M5 3.5v9l7-4.5z"/>',
      square: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/>',
      checksq: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="m5 8 2 2 4-4"/>',
      doc: '<path d="M4 1.5h5l3 3v10H4z"/><path d="M9 1.5v3h3"/>',
      cloud: '<path d="M4.5 12.5a3 3 0 0 1-.3-6 4 4 0 0 1 7.6 1 2.5 2.5 0 0 1 .2 5z"/>',
    }[name] || '';
    const s = size || 16;
    return `<svg class="i i-${name}" width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  };
  const MARK = `<svg class="mark" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M3 7.5h16v3.5a8 8 0 0 1-16 0z" fill="var(--mark, currentColor)"/><rect x="9.75" y="1" width="2.5" height="5" rx="1.25" fill="var(--mark, currentColor)"/></svg>`;

  // ---------- state ----------
  const S = {
    links: JSON.parse(JSON.stringify(DATA.links)), incoming: JSON.parse(JSON.stringify(DATA.incoming)), nextIn: 0, nextId: 5000,
    view: 'home', q: '', f: { source: [], media: [], tags: [], projects: [], status: [], priority: [] }, tagMode: 'any', includeArchived: false,
    open: null, select: false, selected: new Set(), picker: null, pop: null, palette: false, paletteQ: '', menu: false, toast: null,
    emptyDemo: false, focus: -1, highlight: null, filtersSheet: false,
  };
  let toastTimer = null;

  // ---------- data helpers ----------
  const norm = (u) => { try { const x = new URL(u.trim()); x.hash = ''; for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$)/.test(k)) x.searchParams.delete(k); let h = x.host.replace(/^www\./, ''); let p = x.pathname.replace(/\/$/, ''); return h + p + (x.searchParams.toString() ? '?' + x.searchParams.toString() : ''); } catch { return u.trim(); } };
  const day0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MOL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const daysAgo = (iso) => Math.round((day0(NOW) - day0(new Date(iso))) / 864e5);
  const when = (iso) => { if (!iso) return '—'; const n = daysAgo(iso); const d = new Date(iso); if (n <= 0) return 'Today'; if (n === 1) return 'Yesterday'; if (n < 7) return WD[d.getDay()].slice(0, 3); return `${d.getDate()} ${MO[d.getMonth()]}`; };
  const dayLabel = (iso) => { const n = daysAgo(iso); const d = new Date(iso); if (n <= 0) return 'Today'; if (n === 1) return 'Yesterday'; if (n < 7) return WD[d.getDay()]; return `${WD[d.getDay()]} ${d.getDate()} ${MOL[d.getMonth()]}`; };
  const hhmm = (iso) => { const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const longDate = (iso) => { if (!iso) return '—'; const d = new Date(iso); return `${d.getDate()} ${MO[d.getMonth()]} ${d.getFullYear()}, ${hhmm(iso)}`; };
  const host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return u; } };
  const sourceFor = (domain) => { const known = S.links.find((l) => l.domain === domain) || DATA.incoming.find((l) => l.domain === domain); if (known) return known.source; const h = domain.replace(/^www\./, '').split('.'); const n = h.length > 2 ? h[h.length - 2] : h[0]; return n.charAt(0).toUpperCase() + n.slice(1); };
  const isUnsorted = (l) => !l.tags.length && !l.projects.length;
  const pid = () => (S.view.startsWith('project:') ? S.view.slice(8) : null);
  const viewTitle = () => S.view === 'home' ? 'Links' : S.view === 'unsorted' ? 'Unsorted' : S.view === 'archive' ? 'Archive' : (PROJ[pid()] || {}).name || 'Project';
  const hasFilters = () => Object.values(S.f).some((a) => a.length) || !!S.q;

  function baseList() {
    let L = S.links.filter((l) => (S.view === 'archive' ? l.archived : (!l.archived || (S.includeArchived && S.q))));
    if (S.view === 'unsorted') L = L.filter(isUnsorted);
    if (pid()) L = L.filter((l) => l.projects.includes(pid()));
    return L;
  }
  function visible() {
    let L = baseList();
    const f = S.f;
    if (f.source.length) L = L.filter((l) => f.source.includes(l.source));
    if (f.media.length) L = L.filter((l) => f.media.includes(l.media));
    if (f.projects.length) L = L.filter((l) => l.projects.some((p) => f.projects.includes(p)));
    if (f.status.length) L = L.filter((l) => f.status.includes(l.status || 'none'));
    if (f.priority.length) L = L.filter((l) => f.priority.includes(l.priority || 'none'));
    if (f.tags.length) L = L.filter((l) => (S.tagMode === 'all' ? f.tags.every((t) => l.tags.includes(t)) : f.tags.some((t) => l.tags.includes(t))));
    if (S.q) { const q = S.q.toLowerCase(); L = L.filter((l) => [l.title, l.url, l.description, l.notes, l.tags.join(' '), l.projects.map((p) => PROJ[p] && PROJ[p].name).join(' ')].join(' ').toLowerCase().includes(q)); }
    if (S.emptyDemo) L = [];
    return L.sort((a, b) => b.saved.localeCompare(a.saved));
  }
  function facet(key) {
    const L = baseList(); const m = new Map();
    for (const l of L) {
      const vals = key === 'tags' ? l.tags : key === 'projects' ? l.projects : key === 'status' ? [l.status || 'none'] : key === 'priority' ? [l.priority || 'none'] : [l[key]];
      for (const v of vals) m.set(v, (m.get(v) || 0) + 1);
    }
    let arr = [...m.entries()].map(([v, n]) => ({ v, n }));
    if (key === 'media') arr.sort((a, b) => MEDIA.indexOf(a.v) - MEDIA.indexOf(b.v));
    else if (key === 'status') arr.sort((a, b) => ['none', ...STATUS].indexOf(a.v) - ['none', ...STATUS].indexOf(b.v));
    else if (key === 'priority') arr.sort((a, b) => ['none', ...PRIORITY].indexOf(a.v) - ['none', ...PRIORITY].indexOf(b.v));
    else arr.sort((a, b) => b.n - a.n || String(a.v).localeCompare(String(b.v)));
    return arr;
  }
  const allTags = () => { const m = new Map(); for (const l of S.links) for (const t of l.tags) m.set(t, (m.get(t) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); };
  const label = (key, v) => v === 'none' ? (key === 'status' ? 'No status' : 'No priority') : key === 'projects' ? (PROJ[v] || {}).name || v : key === 'status' || key === 'priority' ? v.charAt(0).toUpperCase() + v.slice(1) : v;
  const counts = () => S.emptyDemo ? { all: 0, unsorted: 0, archived: 0, project: () => 0 } : ({ all: S.links.filter((l) => !l.archived).length, unsorted: S.links.filter((l) => !l.archived && isUnsorted(l)).length, archived: S.links.filter((l) => l.archived).length, project: (id) => S.links.filter((l) => !l.archived && l.projects.includes(id)).length });

  // ---------- rendering ----------
  const app = $('#app');
  const narrow = () => app.clientWidth < 760;
  const mid = () => app.clientWidth < 1100;
  const favicon = (l, size) => l.icon ? `<img class="fav" src="${esc(l.icon)}" alt="" width="${size || 16}" height="${size || 16}" loading="lazy">` : `<span class="fav fav-none" style="width:${size || 16}px;height:${size || 16}px" aria-hidden="true">${(l.source || '?').charAt(0)}</span>`;
  const projDots = (l) => l.projects.map((p) => PROJ[p] ? `<i class="dot" style="--c:${PROJ[p].colour}" title="${esc(PROJ[p].name)}"></i>` : '').join('');
  const projChips = (l) => l.projects.map((p) => PROJ[p] ? `<span class="pchip"><i class="dot" style="--c:${PROJ[p].colour}"></i>${esc(PROJ[p].name)}</span>` : '').join('');
  const statusPill = (l) => l.status ? `<span class="pill s-${l.status.replace(' ', '-')}">${esc(label('status', l.status))}</span>` : '';
  const prio = (l) => l.priority && l.priority !== 'low' ? `<span class="prio p-${l.priority}">${I('flag', 12)}${label('priority', l.priority)}</span>` : '';
  const tagsText = (l, max) => l.tags.slice(0, max || 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('') + (l.tags.length > (max || 3) ? `<span class="tag more">+${l.tags.length - (max || 3)}</span>` : '');
  const thumb = (l, w, h) => l.image ? `<img class="thumb" src="${esc(l.image.src)}" alt="" width="${w}" height="${h}" loading="lazy">` : `<span class="thumb thumb-none" style="width:${w}px;height:${h}px">${favicon(l, Math.round(h / 2.5))}</span>`;

  function row(l) {
    const sel = S.selected.has(l.id); const open = S.open === l.id;
    const cls = ['row', l.pending ? 'pending' : '', sel ? 'selected' : '', open ? 'open' : '', S.highlight === l.id ? 'hl' : '', 'm-' + l.media.toLowerCase()].filter(Boolean).join(' ');
    const check = S.select ? `<button class="chk" data-act="toggle-sel" data-id="${l.id}" aria-label="${sel ? 'Deselect' : 'Select'}">${I(sel ? 'checksq' : 'square')}</button>` : '';
    const pend = l.pending ? `<span class="fetching">${l.pending === 'details' ? 'Filling in details' : 'Saved · fetching the page'}</span>` : '';
    let inner;
    if (cfg.rows === 'ledger') {
      inner = `${check}<span class="c-fav">${favicon(l, 16)}</span>
        <span class="c-title"><span class="t">${esc(l.title)}</span>${pend}<span class="sub"><span class="sub-dots">${projDots(l)}</span>${esc(l.source)} · ${esc(l.media)}${l.author ? ' · ' + esc(l.author) : ''}${l.tags.length ? `<span class="sub-tags"> · ${l.tags.slice(0, 3).map(esc).join(', ')}</span>` : ''}</span></span>
        <span class="c-tags">${tagsText(l, 3)}</span>
        <span class="c-proj">${projDots(l)}</span>
        <span class="c-status">${statusPill(l)}${prio(l)}</span>
        <span class="c-time num" title="${esc(longDate(l.saved))}">${cfg.groupByDay ? hhmm(l.saved) : when(l.saved)}</span>`;
    } else if (cfg.rows === 'cover') {
      inner = `${check}<span class="c-media">${thumb(l, 48, 48)}</span>
        <span class="c-title"><span class="t">${esc(l.title)}</span>${pend}<span class="sub"><span class="sub-dots">${projDots(l)}</span>${favicon(l, 12)}${esc(l.source)} · ${esc(l.media)}${l.tags.length ? ' · ' : ''}${tagsText(l, 3)}</span></span>
        <span class="c-proj">${projChips(l)}</span>
        <span class="c-status">${statusPill(l)}${prio(l)}</span>
        <span class="c-time num">${when(l.saved)}</span>`;
    } else {
      const video = l.media === 'Video';
      inner = `${check}<span class="c-media ${video ? 'is-video' : ''}">${thumb(l, 112, 63)}${video ? `<span class="play">${I('play', 12)}</span>` : ''}</span>
        <span class="c-title"><span class="t">${esc(l.title)}</span>${pend}<span class="sub"><span class="sub-dots">${projDots(l)}</span>${esc(l.author || l.site || l.source)} · ${esc(l.media)} · ${when(l.saved)}</span><span class="line3">${tagsText(l, 4)}${projChips(l)}</span></span>
        <span class="c-status">${statusPill(l)}${prio(l)}</span>`;
    }
    return `<article class="${cls}" data-id="${l.id}" tabindex="0" role="button" aria-label="${esc(l.title)}">${inner}<button class="kebab" data-act="row-menu" data-id="${l.id}" aria-label="More">${I('more')}</button></article>`;
  }
  function emptyState() {
    const base = baseList().length;
    if (S.view === 'home' && (S.emptyDemo || !S.links.some((l) => !l.archived))) return `<div class="empty first"><p class="big">Nothing here yet.</p><p>Paste a link into the box above, or press Ctrl+V anywhere on this page. On your phone, share a page to LinkSink.</p></div>`;
    if (hasFilters() && base) return `<div class="empty"><p class="big">No links match.</p><p>${S.q ? `Nothing holds “${esc(S.q)}”` : 'Nothing has every value you picked'}${S.view === 'archive' || S.includeArchived ? '' : ', outside the archive'}.</p><button class="btn" data-act="clear-filters">Clear the filters</button>${!S.includeArchived && S.q ? `<button class="btn ghost" data-act="include-archived">Search the archive too</button>` : ''}</div>`;
    if (S.view === 'unsorted') return `<div class="empty"><p class="big">Nothing waiting.</p><p>Every link has a tag or a project. New links land here until you file them.</p></div>`;
    if (S.view === 'archive') return `<div class="empty"><p class="big">The archive is empty.</p><p>Archive a link when you are done with it; it keeps everything and leaves the main list.</p></div>`;
    if (pid()) return `<div class="empty"><p class="big">No links in ${esc(viewTitle())} yet.</p><p>Open a link and add it to this project, or select several and add them at once.</p></div>`;
    return `<div class="empty"><p class="big">Nothing here.</p></div>`;
  }
  function list() {
    const L = visible();
    if (!L.length) return emptyState();
    if (!cfg.groupByDay) return L.map(row).join('');
    const groups = []; for (const l of L) { const k = dayLabel(l.saved); const g = groups[groups.length - 1]; if (g && g.k === k) g.items.push(l); else groups.push({ k, items: [l] }); }
    return groups.map((g) => `<section class="day"><h2 class="day-h"><span>${esc(g.k)}</span><span class="n num">${g.items.length}</span></h2>${g.items.map(row).join('')}</section>`).join('');
  }
  function filterChip(key, name) {
    const v = S.f[key]; const on = v.length > 0;
    const text = on ? (v.length === 1 ? label(key, v[0]) : `${name} · ${v.length}`) : name;
    return `<button class="chip ${on ? 'on' : ''}" data-filter="${key}" aria-expanded="${S.pop && S.pop.key === key}">${esc(text)}${I('chev', 12)}</button>`;
  }
  function toolbar() {
    const total = visible().length;
    return `<div class="toolbar">
      <label class="search">${I('search')}<input type="search" data-k="q" placeholder="Search" value="${esc(S.q)}" aria-label="Search links"></label>
      <div class="filters">${filterChip('source', 'Source')}${filterChip('media', 'Media')}${filterChip('tags', 'Tags')}${filterChip('projects', 'Projects')}${filterChip('status', 'Status')}${filterChip('priority', 'Priority')}
        ${hasFilters() ? `<button class="chip clear" data-act="clear-filters">Clear${I('x', 12)}</button>` : ''}</div>
      <button class="chip filters-btn" data-act="filters-sheet">${I('filter')}Filters${Object.values(S.f).reduce((a, b) => a + b.length, 0) ? ` · ${Object.values(S.f).reduce((a, b) => a + b.length, 0)}` : ''}</button>
      <span class="count num">${total} ${total === 1 ? 'link' : 'links'}</span>
    </div>`;
  }
  function titleRow() {
    const c = counts(); const t = viewTitle(); let sub;
    if (S.view === 'home') sub = `${c.all} links · ${c.unsorted ? `${c.unsorted} waiting in Unsorted` : 'nothing waiting in Unsorted'}`;
    else if (S.view === 'unsorted') sub = c.unsorted ? `${c.unsorted} ${c.unsorted === 1 ? 'link has' : 'links have'} no tag and no project yet` : 'Every link is filed';
    else if (S.view === 'archive') sub = `${c.archived} archived · kept with everything on them`;
    else sub = `${esc((PROJ[pid()] || {}).description || '')}`;
    return `<div class="title-row"><div class="title-text">${pid() ? `<i class="dot big" style="--c:${PROJ[pid()].colour}"></i>` : ''}<h1>${esc(t)}</h1><p class="sub">${sub}</p></div>
      <div class="actions">${S.select ? '' : `<button class="btn ghost" data-act="select-on">Select</button>`}<button class="btn primary" data-act="focus-paste">${I('plus')}Add link</button></div></div>`;
  }
  function paste() {
    return `<form class="paste" data-act="paste-form"><span class="paste-icon">${I('link')}</span><input type="url" data-k="paste" placeholder="Paste a link to save it — or press n, or Ctrl+V anywhere" aria-label="Paste a link"><button class="btn primary" type="submit">Save</button></form>`;
  }
  function side() {
    const c = counts();
    const nav = (id, text, icon, count) => `<a href="#${id}" class="nav-item ${S.view === id ? 'on' : ''}" data-nav="${id}">${I(icon)}<span>${text}</span>${count ? `<span class="n num">${count}</span>` : ''}</a>`;
    return `<div class="brand">${MARK}<span class="brand-name">LinkSink</span></div>
      <nav class="nav" aria-label="Views">${nav('home', 'Links', 'link')}${nav('unsorted', 'Unsorted', 'inbox', c.unsorted)}${nav('archive', 'Archive', 'archive')}</nav>
      <div class="group-label">Projects</div>
      <nav class="nav projects" aria-label="Projects">${DATA.projects.map((p) => `<a href="#project:${p.id}" class="nav-item ${S.view === 'project:' + p.id ? 'on' : ''}" data-nav="project:${p.id}"><i class="dot" style="--c:${p.colour}"></i><span>${esc(p.name)}</span><span class="n num muted">${c.project(p.id)}</span></a>`).join('')}
        <a href="#new-project" class="nav-item muted" data-act="noop">${I('plus')}<span>New project</span></a></nav>
      <div class="side-foot"><a class="nav-item" href="#settings" data-act="noop">${I('settings')}<span>Settings</span></a><div class="sync">${I('cloud')}<span>Synced · 2 devices</span></div></div>`;
  }
  function topbar() {
    if (cfg.shell === 'topbar') {
      return `<div class="brand">${MARK}<span class="brand-name">LinkSink</span></div>
        <nav class="top-nav" aria-label="Views"><a href="#home" data-nav="home" class="${S.view === 'home' ? 'on' : ''}">Links</a><a href="#unsorted" data-nav="unsorted" class="${S.view === 'unsorted' ? 'on' : ''}">Unsorted${counts().unsorted ? ` <span class="n num">${counts().unsorted}</span>` : ''}</a><a href="#archive" data-nav="archive" class="${S.view === 'archive' ? 'on' : ''}">Archive</a>
          <button class="top-link ${pid() ? 'on' : ''}" data-act="projects-menu">Projects${I('chev', 12)}</button></nav>
        <div class="top-right"><button class="top-search" data-act="focus-search">${I('search')}<span>Search</span><kbd>/</kbd></button><button class="icon-btn" data-act="palette" aria-label="Command palette">${I('cmd')}</button><span class="avatar" aria-label="Account">R</span></div>
        <button class="icon-btn only-narrow" data-act="focus-search" aria-label="Search">${I('search')}</button><button class="icon-btn only-narrow" data-act="menu" aria-label="Menu">${I('menu')}</button>`;
    }
    return `<button class="icon-btn" data-act="menu" aria-label="Menu">${I('menu')}</button><div class="top-title">${MARK}<span>${esc(viewTitle())}</span></div><button class="icon-btn" data-act="focus-search" aria-label="Search">${I('search')}</button>`;
  }
  function menuSheet() {
    if (!S.menu) return '';
    return `<div class="scrim" data-act="close"></div><div class="sheet menu-sheet" role="dialog" aria-label="Menu"><div class="sheet-head"><div class="brand">${MARK}<span class="brand-name">LinkSink</span></div><button class="icon-btn" data-act="close" aria-label="Close">${I('x')}</button></div>${side()}</div>`;
  }
  // ----- detail -----
  const seg = (name, opts, cur, extra) => `<div class="seg" role="group" aria-label="${name}">${[['none', 'None'], ...opts.map((o) => [o, o.charAt(0).toUpperCase() + o.slice(1)])].map(([v, t]) => `<button class="${(cur || 'none') === v ? 'on' : ''}" data-act="set-${name}" data-v="${v}" ${extra || ''}>${t}</button>`).join('')}</div>`;
  function detail() {
    const l = S.links.find((x) => x.id === S.open); if (!l) return '';
    const kv = (k, v) => `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`;
    const auto = (field, value) => `<span class="auto">${l.pending ? 'Fetching' : 'Automatic'}</span>`;
    return `<div class="detail-head">
        <button class="icon-btn back only-narrow" data-act="close-detail" aria-label="Back">${I('back')}</button>
        <span class="site">${favicon(l, 16)}<span>${esc(l.site || l.source)}</span></span>
        <div class="head-actions"><a class="btn ghost" href="${esc(l.url)}" target="_blank" rel="noopener">${I('ext')}Open</a><button class="icon-btn" data-act="copy" data-id="${l.id}" aria-label="Copy link">${I('copy')}</button><button class="icon-btn" data-act="row-menu" data-id="${l.id}" aria-label="More">${I('more')}</button><button class="icon-btn close not-narrow" data-act="close-detail" aria-label="Close">${I('x')}</button></div>
      </div>
      <div class="detail-body">
        ${l.image ? `<img class="preview" src="${esc(l.image.src)}" alt="" width="${l.image.w}" height="${l.image.h}">` : ''}
        <div class="field title"><label for="f-title">Title</label><input id="f-title" data-field="title" value="${esc(l.title)}">${l.titleAuto === false && !l.pending && l.fetchStatus && l.fetchStatus !== 200 ? '<span class="hint">The site did not give a title; this is its address.</span>' : ''}</div>
        <a class="url" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url)}</a>
        <div class="field-row">
          <div class="field"><label>Source ${auto()}</label><div class="select-wrap"><select data-field="source">${[...new Set([l.source, ...S.links.map((x) => x.source)])].sort().map((s) => `<option ${s === l.source ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>${I('chev', 12)}</div></div>
          <div class="field"><label>Media ${auto()}</label><div class="select-wrap"><select data-field="media">${MEDIA.map((m) => `<option ${m === l.media ? 'selected' : ''}>${m}</option>`).join('')}</select>${I('chev', 12)}</div></div>
        </div>
        <div class="field"><label>Tags</label><div class="chips">${l.tags.map((t) => `<span class="tag lg">${esc(t)}<button data-act="rm-tag" data-v="${esc(t)}" aria-label="Remove ${esc(t)}">${I('x', 10)}</button></span>`).join('')}<button class="chip add" data-act="organise" data-tab="tags">${I('plus', 12)}Add tag</button></div></div>
        <div class="field"><label>Projects</label><div class="chips">${l.projects.map((p) => PROJ[p] ? `<span class="pchip lg"><i class="dot" style="--c:${PROJ[p].colour}"></i>${esc(PROJ[p].name)}<button data-act="rm-proj" data-v="${p}" aria-label="Remove">${I('x', 10)}</button></span>` : '').join('')}<button class="chip add" data-act="organise" data-tab="projects">${I('plus', 12)}Add to project</button></div></div>
        <div class="field-row">
          <div class="field"><label>Status</label>${seg('status', STATUS, l.status)}</div>
          <div class="field"><label>Priority</label>${seg('priority', PRIORITY, l.priority)}</div>
        </div>
        <div class="field"><label>Description ${l.description && !l.descEdited ? '<span class="auto">From the page</span>' : ''}</label><textarea data-field="description" rows="3" placeholder="${l.pending ? 'Fetching the page’s summary' : 'The page gave no summary. Write one if you like.'}">${esc(l.description)}</textarea></div>
        <div class="field"><label>Notes</label><textarea data-field="notes" rows="3" placeholder="Your own thoughts">${esc(l.notes)}</textarea></div>
        <div class="meta">
          ${kv('Saved', `${longDate(l.saved)} · ${l.origin === 'share' ? 'shared from the phone' : 'pasted'}`)}${kv('Edited', l.edited ? longDate(l.edited) : '—')}${kv('Last opened', l.opened ? longDate(l.opened) : '—')}
          ${kv('Site', esc(l.site || '—'))}${kv(l.media === 'Video' ? 'Channel' : 'Author', esc(l.author || '—'))}${kv('Published', l.published ? esc(l.published.slice(0, 10)) : '—')}${kv('Length', l.duration || '—')}
          ${kv('Details fetched', l.fetched ? longDate(l.fetched) : l.pending ? 'Fetching' : 'The site refused; saved with its address')}
        </div>
        <div class="detail-foot"><button class="btn ghost" data-act="organise" data-tab="tags">${I('tag')}Organise</button><button class="btn ghost" data-act="${l.archived ? 'unarchive' : 'archive'}" data-id="${l.id}">${I('archive')}${l.archived ? 'Restore' : 'Archive'}</button><button class="btn text negative" data-act="delete" data-id="${l.id}">${I('trash')}Delete</button></div>
      </div>`;
  }
  // ----- organiser -----
  function picker() {
    const p = S.picker; if (!p) return '';
    const targets = p.bulk ? S.links.filter((l) => S.selected.has(l.id)) : [S.links.find((l) => l.id === S.open)].filter(Boolean);
    if (!targets.length) return '';
    const has = (fn) => { const n = targets.filter(fn).length; return n === targets.length ? 'all' : n ? 'some' : 'none'; };
    const q = (p.q || '').toLowerCase();
    const tags = allTags().filter(([t]) => !q || t.includes(q));
    const canCreate = q && !tags.some(([t]) => t === q);
    const title = p.bulk ? `Organise ${targets.length} links` : `Organise`;
    const common = (f) => { const v = targets[0][f]; return targets.every((t) => t[f] === v) ? v : 'mixed'; };
    return `<div class="picker-head"><strong>${title}</strong>${p.bulk ? '' : `<span class="muted ellipsis">${esc(targets[0].title)}</span>`}<button class="icon-btn" data-act="close-picker" aria-label="Done">${I('x')}</button></div>
      <div class="picker-body">
        <section><h3>Tags</h3><label class="search sm">${I('search', 14)}<input data-k="picker-q" placeholder="Find or create a tag" value="${esc(p.q || '')}"></label>
          <div class="opt-list">${canCreate ? `<button class="opt create" data-act="pk-tag" data-v="${esc(q)}">${I('plus', 14)}Create “${esc(q)}”</button>` : ''}${tags.slice(0, 12).map(([t, n]) => { const st = has((l) => l.tags.includes(t)); return `<button class="opt ${st}" data-act="pk-tag" data-v="${esc(t)}" aria-pressed="${st === 'all'}"><span class="box">${st === 'all' ? I('check', 12) : st === 'some' ? '<i class="dash"></i>' : ''}</span><span>${esc(t)}</span><span class="n num muted">${n}</span></button>`; }).join('')}</div></section>
        <section><h3>Projects</h3><div class="opt-list">${DATA.projects.map((pr) => { const st = has((l) => l.projects.includes(pr.id)); return `<button class="opt ${st}" data-act="pk-proj" data-v="${pr.id}" aria-pressed="${st === 'all'}"><span class="box">${st === 'all' ? I('check', 12) : st === 'some' ? '<i class="dash"></i>' : ''}</span><i class="dot" style="--c:${pr.colour}"></i><span>${esc(pr.name)}</span></button>`; }).join('')}</div></section>
        <section><h3>Status</h3>${seg('status', STATUS, common('status') === 'mixed' ? null : common('status'), 'data-bulk="1"')}</section>
        <section><h3>Priority</h3>${seg('priority', PRIORITY, common('priority') === 'mixed' ? null : common('priority'), 'data-bulk="1"')}</section>
      </div>
      <div class="picker-foot"><span class="muted">${p.bulk ? 'Applies to every selected link' : 'Changes save as you make them'}</span><button class="btn primary" data-act="close-picker">Done</button></div>`;
  }
  function popover() {
    const p = S.pop; if (!p) return '';
    if (p.kind === 'filter') {
      const key = p.key; const vals = facet(key); const sel = S.f[key];
      return `<div class="pop-head"><strong>${label('x', key === 'tags' ? 'Tags' : key.charAt(0).toUpperCase() + key.slice(1))}</strong>${key === 'tags' ? `<div class="seg sm"><button class="${S.tagMode === 'any' ? 'on' : ''}" data-act="tag-mode" data-v="any">Any</button><button class="${S.tagMode === 'all' ? 'on' : ''}" data-act="tag-mode" data-v="all">All</button></div>` : ''}${sel.length ? `<button class="text-btn" data-act="clear-one" data-key="${key}">Clear</button>` : ''}</div>
        <div class="opt-list">${vals.map(({ v, n }) => `<button class="opt ${sel.includes(v) ? 'all' : 'none'}" data-act="toggle-filter" data-key="${key}" data-v="${esc(v)}" aria-pressed="${sel.includes(v)}"><span class="box">${sel.includes(v) ? I('check', 12) : ''}</span>${key === 'projects' && PROJ[v] ? `<i class="dot" style="--c:${PROJ[v].colour}"></i>` : ''}<span>${esc(label(key, v))}</span><span class="n num muted">${n}</span></button>`).join('') || '<p class="muted pad">Nothing to filter by here.</p>'}</div>`;
    }
    if (p.kind === 'row-menu') {
      const l = S.links.find((x) => x.id === p.id); if (!l) return '';
      return `<div class="opt-list menu">${[['open-detail', 'ext', 'Edit'], ['organise-row', 'tag', 'Tags and projects'], ['copy', 'copy', 'Copy link'], [l.archived ? 'unarchive' : 'archive', 'archive', l.archived ? 'Restore from archive' : 'Archive'], ['delete', 'trash', 'Delete']].map(([a, ic, t]) => `<button class="opt ${a === 'delete' ? 'negative' : ''}" data-act="${a}" data-id="${l.id}">${I(ic, 14)}<span>${t}</span></button>`).join('')}</div>`;
    }
    if (p.kind === 'projects') {
      const c = counts();
      return `<div class="opt-list menu">${DATA.projects.map((pr) => `<a class="opt" href="#project:${pr.id}" data-nav="project:${pr.id}"><i class="dot" style="--c:${pr.colour}"></i><span>${esc(pr.name)}</span><span class="n num muted">${c.project(pr.id)}</span></a>`).join('')}</div>`;
    }
    return '';
  }
  function filtersSheet() {
    if (!S.filtersSheet) return '';
    const sec = (key, name) => { const vals = facet(key); const sel = S.f[key]; return `<section><h3>${name}${key === 'tags' ? `<span class="seg sm"><button class="${S.tagMode === 'any' ? 'on' : ''}" data-act="tag-mode" data-v="any">Any</button><button class="${S.tagMode === 'all' ? 'on' : ''}" data-act="tag-mode" data-v="all">All</button></span>` : ''}</h3><div class="chips">${vals.map(({ v, n }) => `<button class="chip ${sel.includes(v) ? 'on' : ''}" data-act="toggle-filter" data-key="${key}" data-v="${esc(v)}">${key === 'projects' && PROJ[v] ? `<i class="dot" style="--c:${PROJ[v].colour}"></i>` : ''}${esc(label(key, v))}<span class="n num">${n}</span></button>`).join('')}</div></section>`; };
    return `<div class="scrim" data-act="close"></div><div class="sheet filters-sheet" role="dialog" aria-label="Filters"><div class="sheet-head"><strong>Filters</strong>${hasFilters() ? `<button class="text-btn" data-act="clear-filters">Clear all</button>` : ''}<button class="icon-btn" data-act="close" aria-label="Done">${I('x')}</button></div><div class="sheet-body">${sec('source', 'Source')}${sec('media', 'Media')}${sec('tags', 'Tags')}${sec('projects', 'Projects')}${sec('status', 'Status')}${sec('priority', 'Priority')}</div><div class="sheet-foot"><button class="btn primary wide" data-act="close">Show ${visible().length} links</button></div></div>`;
  }
  function bulkbar() {
    if (!S.select) return '';
    const n = S.selected.size;
    return `<div class="bulkbar"><span class="num"><strong>${n}</strong> selected</span><button class="btn ghost" data-act="select-all">${n === visible().length ? 'None' : 'All'}</button><span class="grow"></span>
      <button class="btn" data-act="bulk-organise" ${n ? '' : 'disabled'}>${I('tag')}Organise</button><button class="btn" data-act="bulk-archive" ${n ? '' : 'disabled'}>${I('archive')}Archive</button><button class="btn negative" data-act="bulk-delete" ${n ? '' : 'disabled'}>${I('trash')}Delete</button><button class="btn ghost" data-act="select-off">Done</button></div>`;
  }
  function toast() {
    const t = S.toast; if (!t) return '';
    return `<div class="toast" role="status">${t.icon ? I(t.icon) : ''}<span>${esc(t.text)}</span>${t.undo ? `<button class="text-btn" data-act="undo">Undo</button>` : ''}${t.show ? `<button class="text-btn" data-act="open-detail" data-id="${t.show}">Show</button>` : ''}</div>`;
  }
  function palette() {
    if (!S.palette) return '';
    const q = S.paletteQ.toLowerCase().trim(); const items = [];
    const add = (group, text, act, extra) => items.push({ group, text, act, extra });
    if (!q || 'add link paste'.includes(q)) add('Actions', 'Add a link', 'focus-paste');
    if (!q || 'select links'.includes(q)) add('Actions', 'Select links', 'select-on');
    if (q) add('Search', `Search for “${S.paletteQ}”`, 'palette-search', { q: S.paletteQ });
    for (const [id, t] of [['home', 'Links'], ['unsorted', 'Unsorted'], ['archive', 'Archive']]) if (!q || t.toLowerCase().includes(q)) add('Go to', t, 'nav', { nav: id });
    for (const p of DATA.projects) if (!q || p.name.toLowerCase().includes(q)) add('Projects', p.name, 'nav', { nav: 'project:' + p.id, colour: p.colour });
    for (const [t] of allTags()) if (q && t.includes(q)) add('Tags', `Tagged ${t}`, 'palette-filter', { key: 'tags', v: t });
    for (const { v } of facet('source')) if (q && String(v).toLowerCase().includes(q)) add('Sources', `From ${v}`, 'palette-filter', { key: 'source', v });
    for (const l of S.links) if (q && l.title.toLowerCase().includes(q)) { add('Links', l.title, 'open-detail', { id: l.id, icon: l.icon }); if (items.filter((i) => i.group === 'Links').length >= 5) break; }
    const sel = Math.min(S.paletteIdx || 0, Math.max(0, items.length - 1)); S.paletteIdx = sel;
    let lastGroup = null;
    return `<div class="scrim" data-act="close"></div><div class="palette" role="dialog" aria-label="Command palette"><label class="pal-input">${I('search')}<input data-k="palette" placeholder="Type a command, a project, a tag or a title" value="${esc(S.paletteQ)}" autocomplete="off"></label>
      <div class="pal-list">${items.map((it, i) => { const g = it.group !== lastGroup ? `<div class="pal-group">${it.group}</div>` : ''; lastGroup = it.group; return g + `<button class="pal-item ${i === sel ? 'on' : ''}" data-pal="${i}" data-act="${it.act}" ${it.extra ? Object.entries(it.extra).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ') : ''}>${it.extra && it.extra.colour ? `<i class="dot" style="--c:${it.extra.colour}"></i>` : it.extra && it.extra.icon ? `<img class="fav" src="${esc(it.extra.icon)}" alt="" width="14" height="14">` : ''}<span>${esc(it.text)}</span>${i === sel ? '<kbd>↵</kbd>' : ''}</button>`; }).join('') || '<p class="muted pad">No match.</p>'}</div>
      <div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> choose</span><span><kbd>esc</kbd> close</span></div></div>`;
  }

  // ---------- render ----------
  let prevRects = null, crossfade = false;
  function snapshot() { prevRects = new Map(); for (const el of $$('.row[data-id]', app)) prevRects.set(el.dataset.id, el.getBoundingClientRect()); }
  function flip() {
    if (!prevRects) return;
    const rows = $$('.row[data-id]', app);
    if (reduced()) { prevRects = null; return; }
    for (const el of rows) {
      const p = prevRects.get(el.dataset.id); const n = el.getBoundingClientRect();
      if (!p) { if (!crossfade) el.classList.add('enter'); continue; }
      const dy = p.top - n.top;
      if (Math.abs(dy) > 1 && Math.abs(dy) < 2000) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
    prevRects = null;
  }
  function render(opts) {
    opts = opts || {};
    const active = document.activeElement; const k = active && active.dataset ? active.dataset.k : null; const selStart = active && active.selectionStart;
    const main = $('.main', app); const st = main ? main.scrollTop : 0; const det = $('.detail-body', app); const dst = det ? det.scrollTop : 0;
    snapshot();
    const open = S.open != null && S.links.some((l) => l.id === S.open);
    app.dataset.open = open; app.dataset.select = S.select; app.dataset.view = S.view;
    app.innerHTML = `
      <aside class="side">${side()}</aside>
      <header class="topbar">${topbar()}</header>
      <main class="main" tabindex="-1">${titleRow()}${paste()}${toolbar()}<div class="list ${crossfade ? 'xfade' : ''}">${list()}</div>${bulkbar()}</main>
      ${open ? `<section class="detail" role="${cfg.detail === 'panel' && !narrow() ? 'region' : 'dialog'}" aria-label="Link details">${detail()}</section>${cfg.detail !== 'panel' || narrow() ? '<div class="scrim detail-scrim" data-act="close-detail"></div>' : ''}` : ''}
      ${S.picker ? `<div class="scrim ${narrow() ? '' : 'clear'}" data-act="close-picker"></div><div class="picker ${narrow() ? 'sheet' : 'pop'}" role="dialog" aria-label="Organise">${picker()}</div>` : ''}
      ${S.pop ? `<div class="scrim clear" data-act="close"></div><div class="pop ${S.pop.kind}" role="dialog">${popover()}</div>` : ''}
      ${filtersSheet()}${menuSheet()}${palette()}${toast()}`;
    const m2 = $('.main', app); if (m2) m2.scrollTop = st; const d2 = $('.detail-body', app); if (d2) d2.scrollTop = dst;
    if (k) { const el = $(`[data-k="${k}"]`, app); if (el) { el.focus({ preventScroll: true }); try { if (selStart != null) el.setSelectionRange(selStart, selStart); } catch {} } }
    if (opts.focus) { const el = $(opts.focus, app); if (el) el.focus(); }
    placePop(); placePicker(); flip(); crossfade = false;
  }
  // A re-render replaces every element, so an anchor is remembered as a selector and its index, not as a node.
  const anchorRef = (a) => { if (!a) return null; const sel = a.dataset.filter ? `[data-filter="${a.dataset.filter}"]` : `[data-act="${a.dataset.act}"]`; return { sel, idx: $$(sel, app).indexOf(a) }; };
  const findAnchor = (ref) => { if (!ref) return null; const el = $$(ref.sel, app)[ref.idx]; if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? el : null; };
  function placePop() {
    const el = $('.pop', app); if (!el || !S.pop) return;
    const anchor = findAnchor(S.pop.anchor) || (S.pop.key ? $(`[data-filter="${S.pop.key}"]`, app) : null);
    const ar = anchor ? anchor.getBoundingClientRect() : null; const base = app.getBoundingClientRect();
    if (!ar) { el.style.left = Math.max(12, (app.clientWidth - el.offsetWidth) / 2) + 'px'; el.style.top = '25%'; return; }
    const w = el.offsetWidth; let left = ar.left - base.left; if (left + w > app.clientWidth - 12) left = Math.max(12, app.clientWidth - w - 12);
    if (S.pop.align === 'right') left = Math.max(12, ar.right - base.left - w);
    el.style.left = left + 'px'; el.style.top = (ar.bottom - base.top + 6) + 'px';
  }
  function placePicker() {
    const el = $('.picker.pop', app); if (!el || !S.picker) return;
    const anchor = findAnchor(S.picker.anchor) || $('.detail [data-act="organise"]', app) || $('[data-act="bulk-organise"]', app);
    const base = app.getBoundingClientRect(); const w = el.offsetWidth, h = el.offsetHeight;
    if (!anchor) { el.style.left = (app.clientWidth - w) / 2 + 'px'; el.style.top = '80px'; return; }
    const ar = anchor.getBoundingClientRect(); let left = ar.left - base.left; let top = ar.bottom - base.top + 6;
    if (left + w > app.clientWidth - 12) left = Math.max(12, app.clientWidth - w - 12);
    if (top + h > app.clientHeight - 12) top = Math.max(12, ar.top - base.top - h - 6);
    if (top + h > app.clientHeight - 12) top = Math.max(12, app.clientHeight - h - 12);
    el.style.left = left + 'px'; el.style.top = top + 'px';
  }

  // ---------- actions ----------
  function setToast(t) { S.toast = t; clearTimeout(toastTimer); toastTimer = setTimeout(() => { S.toast = null; render(); }, t.ms || 4500); }
  function animateOut(el, cls, cb) { if (!el || reduced()) return cb(); el.classList.add(cls); let done = false; const fin = () => { if (!done) { done = true; cb(); } }; el.addEventListener('animationend', fin, { once: true }); setTimeout(fin, 320); }
  function archiveLinks(ids, archived) {
    const els = ids.map((id) => $(`.row[data-id="${id}"]`, app)).filter(Boolean);
    const go = () => { for (const id of ids) { const l = S.links.find((x) => x.id === id); if (l) l.archived = archived; } if (ids.includes(S.open) && (archived ? S.view !== 'archive' : S.view === 'archive')) S.open = null; S.selected.clear(); if (S.select && !S.links.some((l) => S.selected.has(l.id))) S.select = false; setToast({ icon: 'archive', text: ids.length === 1 ? `${archived ? 'Archived' : 'Restored'} “${trunc(S.links.find((x) => x.id === ids[0]).title)}”` : `${archived ? 'Archived' : 'Restored'} ${ids.length} links`, undo: () => { for (const id of ids) { const l = S.links.find((x) => x.id === id); if (l) l.archived = !archived; } } }); render(); };
    if (els.length === 1) animateOut(els[0], 'leave', go); else go();
  }
  function deleteLinks(ids) {
    const els = ids.map((id) => $(`.row[data-id="${id}"]`, app)).filter(Boolean);
    const go = () => { const removed = S.links.filter((l) => ids.includes(l.id)); S.links = S.links.filter((l) => !ids.includes(l.id)); if (ids.includes(S.open)) S.open = null; S.selected.clear(); if (S.select && !S.selected.size && ids.length > 1) S.select = false; setToast({ icon: 'trash', text: ids.length === 1 ? `Deleted “${trunc(removed[0].title)}”` : `Deleted ${ids.length} links`, undo: () => { S.links.push(...removed); } }); render(); };
    if (els.length === 1) animateOut(els[0], 'leave', go); else go();
  }
  const trunc = (s) => s.length > 42 ? s.slice(0, 40).trim() + '…' : s;
  function addUrl(raw, demo) {
    let url = (raw || '').trim(); if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try { new URL(url); } catch { setToast({ text: 'That is not a link.' }); render(); return; }
    const n = norm(url);
    const dup = S.links.find((l) => norm(l.url) === n);
    if (dup) { S.highlight = dup.id; setToast({ icon: 'link', text: `Already saved ${when(dup.saved).toLowerCase()}: “${trunc(dup.title)}”`, show: dup.id }); if (dup.archived && S.view !== 'archive') S.view = 'archive'; render(); const el = $(`.row[data-id="${dup.id}"]`, app); if (el) el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); setTimeout(() => { S.highlight = null; render(); }, 1800); return; }
    const known = S.incoming.find((l) => norm(l.url) === n);
    const domain = host(url);
    const link = { id: S.nextId++, url, domain, title: url.replace(/^https?:\/\//, ''), titleAuto: false, source: sourceFor(domain), media: 'Page', tags: [], projects: [], status: null, priority: null, description: '', notes: '', archived: false, saved: new Date(NOW.getTime() + (Date.now() % 60000)).toISOString(), edited: null, opened: null, origin: 'paste', site: null, author: null, published: null, duration: null, image: null, icon: null, fetched: null, fetchStatus: null, pending: true };
    S.links.unshift(link);
    if (S.view !== 'home' && S.view !== 'unsorted') S.view = 'home';
    S.emptyDemo = false; S.q = ''; for (const k in S.f) S.f[k] = [];
    render();
    const m = $('.main', app); if (m) m.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
    setTimeout(() => { if (known) { Object.assign(link, { icon: known.icon, title: known.title, titleAuto: true, site: known.site, author: known.author }); } link.pending = 'details'; render(); }, 650);
    setTimeout(() => { if (known) Object.assign(link, { source: known.source, media: known.media, description: known.description, image: known.image, fetched: new Date().toISOString(), fetchStatus: 200, published: known.published }); else Object.assign(link, { fetchStatus: 0 }); link.pending = false; render(); }, 1500);
  }
  function simulatePaste() { const l = S.incoming[S.nextIn % S.incoming.length]; S.nextIn++; addUrl(l.url, true); }
  function openDetail(id) { S.open = id; S.pop = null; S.palette = false; render(); const l = S.links.find((x) => x.id === id); if (l && !l.opened) l.opened = new Date(NOW).toISOString(); }
  function closeDetail() { const el = $('.detail', app); const sc = $('.detail-scrim', app); if (sc) sc.classList.add('out'); animateOut(el, 'out', () => { S.open = null; S.picker = null; render(); }); }
  function closePicker() { const el = $('.picker', app); animateOut(el, 'out', () => { S.picker = null; render(); }); }
  function closeAll() { const sheet = $('.sheet', app) || $('.pop', app) || $('.palette', app); if (sheet) { animateOut(sheet, 'out', () => { S.pop = null; S.menu = false; S.filtersSheet = false; S.palette = false; render(); }); } else { S.pop = null; S.menu = false; S.filtersSheet = false; S.palette = false; render(); } }
  function toggle(arr, v) { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }
  function targets() { return S.picker && S.picker.bulk ? S.links.filter((l) => S.selected.has(l.id)) : [S.links.find((l) => l.id === S.open)].filter(Boolean); }
  function touch(l) { l.edited = new Date(NOW.getTime() + 60000).toISOString(); }

  app.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act], [data-nav], [data-filter], .row');
    if (!a) return;
    if (a.dataset.nav) { e.preventDefault(); S.view = a.dataset.nav; S.menu = false; S.pop = null; S.palette = false; S.emptyDemo = false; if (S.view === 'archive' || S.view === 'unsorted') { for (const k in S.f) S.f[k] = []; } S.focus = -1; crossfade = true; render(); const m = $('.main', app); if (m) m.scrollTop = 0; return; }
    if (a.dataset.filter) { S.pop = S.pop && S.pop.key === a.dataset.filter ? null : { kind: 'filter', key: a.dataset.filter, anchor: anchorRef(a) }; render(); return; }
    const act = a.dataset.act; const id = a.dataset.id ? +a.dataset.id : null; const v = a.dataset.v;
    if (!act && a.classList.contains('row')) { if (e.target.closest('button, a')) return; if (S.select) { const i = +a.dataset.id; if (S.selected.has(i)) S.selected.delete(i); else S.selected.add(i); render(); } else openDetail(+a.dataset.id); return; }
    if (a.tagName === 'A' && act !== 'noop') {} else if (a.tagName === 'A') e.preventDefault();
    switch (act) {
      case 'noop': e.preventDefault(); setToast({ text: 'Not part of this mockup.' }); render(); break;
      case 'close': closeAll(); break;
      case 'menu': S.menu = true; render(); break;
      case 'projects-menu': S.pop = { kind: 'projects', anchor: anchorRef(a) }; render(); break;
      case 'focus-paste': S.palette = false; S.menu = false; render(); { const m = $('.main', app); if (m) m.scrollTop = 0; } $('[data-k="paste"]', app).focus(); break;
      case 'focus-search': S.menu = false; render(); { const s = $('[data-k="q"]', app); if (s) s.focus(); } break;
      case 'palette': S.palette = !S.palette; S.paletteQ = ''; S.paletteIdx = 0; render({ focus: '[data-k="palette"]' }); break;
      case 'palette-search': S.q = a.dataset.q; S.palette = false; render(); break;
      case 'palette-filter': for (const k in S.f) S.f[k] = []; S.f[a.dataset.key] = [a.dataset.v]; S.view = 'home'; S.palette = false; crossfade = true; render(); break;
      case 'nav': S.view = a.dataset.nav; S.palette = false; crossfade = true; render(); break;
      case 'simulate': simulatePaste(); break;
      case 'select-on': S.select = true; S.open = null; render(); break;
      case 'select-off': S.select = false; S.selected.clear(); render(); break;
      case 'select-all': { const vis = visible(); if (S.selected.size === vis.length) S.selected.clear(); else vis.forEach((l) => S.selected.add(l.id)); render(); break; }
      case 'toggle-sel': if (S.selected.has(id)) S.selected.delete(id); else S.selected.add(id); render(); break;
      case 'clear-filters': for (const k in S.f) S.f[k] = []; S.q = ''; S.emptyDemo = false; S.includeArchived = false; crossfade = true; render(); break;
      case 'include-archived': S.includeArchived = true; crossfade = true; render(); break;
      case 'clear-one': S.f[a.dataset.key] = []; crossfade = true; render(); break;
      case 'toggle-filter': toggle(S.f[a.dataset.key], a.dataset.v); crossfade = true; render(); break;
      case 'tag-mode': S.tagMode = v; crossfade = true; render(); break;
      case 'filters-sheet': S.filtersSheet = true; render(); break;
      case 'row-menu': S.pop = { kind: 'row-menu', id, anchor: anchorRef(a), align: 'right' }; render(); break;
      case 'open-detail': openDetail(id); break;
      case 'close-detail': closeDetail(); break;
      case 'copy': { const l = S.links.find((x) => x.id === id); S.pop = null; try { navigator.clipboard && navigator.clipboard.writeText(l.url); } catch {} setToast({ icon: 'copy', text: 'Link copied' }); render(); break; }
      case 'archive': S.pop = null; archiveLinks([id], true); break;
      case 'unarchive': S.pop = null; archiveLinks([id], false); break;
      case 'delete': S.pop = null; deleteLinks([id]); break;
      case 'bulk-archive': archiveLinks([...S.selected], true); break;
      case 'bulk-delete': deleteLinks([...S.selected]); break;
      case 'undo': if (S.toast && S.toast.undo) S.toast.undo(); S.toast = null; render(); break;
      case 'organise': S.picker = { bulk: false, anchor: anchorRef(a), q: '' }; render({ focus: narrow() ? null : '[data-k="picker-q"]' }); break;
      case 'organise-row': S.pop = null; S.open = id; S.picker = { bulk: false, anchor: null, q: '' }; render(); break;
      case 'bulk-organise': S.picker = { bulk: true, anchor: anchorRef(a), q: '' }; render(); break;
      case 'close-picker': closePicker(); break;
      case 'pk-tag': { const T = targets(); const all = T.every((l) => l.tags.includes(v)); for (const l of T) { if (all) l.tags = l.tags.filter((t) => t !== v); else if (!l.tags.includes(v)) l.tags.push(v); touch(l); } S.picker.q = ''; render({ focus: '[data-k="picker-q"]' }); break; }
      case 'pk-proj': { const T = targets(); const all = T.every((l) => l.projects.includes(v)); for (const l of T) { if (all) l.projects = l.projects.filter((t) => t !== v); else if (!l.projects.includes(v)) l.projects.push(v); touch(l); } render(); break; }
      case 'set-status': { const T = a.dataset.bulk ? targets() : [S.links.find((l) => l.id === S.open)]; for (const l of T) { if (l) { l.status = v === 'none' ? null : v; touch(l); } } render(); break; }
      case 'set-priority': { const T = a.dataset.bulk ? targets() : [S.links.find((l) => l.id === S.open)]; for (const l of T) { if (l) { l.priority = v === 'none' ? null : v; touch(l); } } render(); break; }
      case 'rm-tag': { const l = S.links.find((x) => x.id === S.open); l.tags = l.tags.filter((t) => t !== v); touch(l); render(); break; }
      case 'rm-proj': { const l = S.links.find((x) => x.id === S.open); l.projects = l.projects.filter((t) => t !== v); touch(l); render(); break; }
    }
  });
  app.addEventListener('submit', (e) => { const f = e.target.closest('[data-act="paste-form"]'); if (!f) return; e.preventDefault(); const inp = $('[data-k="paste"]', f); addUrl(inp.value); inp.value = ''; });
  app.addEventListener('input', (e) => {
    const t = e.target; const k = t.dataset.k;
    if (k === 'q') { S.q = t.value; crossfade = true; render(); return; }
    if (k === 'picker-q') { S.picker.q = t.value; render(); return; }
    if (k === 'palette') { S.paletteQ = t.value; S.paletteIdx = 0; render(); return; }
    if (t.dataset.field) { const l = S.links.find((x) => x.id === S.open); if (!l) return; l[t.dataset.field] = t.value; if (t.dataset.field === 'title') l.titleAuto = false; if (t.dataset.field === 'description') l.descEdited = true; touch(l); if (t.tagName === 'SELECT') render(); else { const r = $(`.row[data-id="${l.id}"] .t`, app); if (r && t.dataset.field === 'title') r.textContent = l.title; } }
  });
  app.addEventListener('change', (e) => { if (e.target.dataset.field && e.target.tagName !== 'SELECT') render(); });
  app.addEventListener('keydown', (e) => {
    if (S.palette && e.target.dataset.k === 'palette') {
      const items = $$('.pal-item', app);
      if (e.key === 'ArrowDown') { e.preventDefault(); S.paletteIdx = Math.min(items.length - 1, (S.paletteIdx || 0) + 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); S.paletteIdx = Math.max(0, (S.paletteIdx || 0) - 1); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); const it = $('.pal-item.on', app); if (it) it.click(); }
      return;
    }
    if (e.target.dataset.k === 'picker-q' && e.key === 'Enter') { e.preventDefault(); const first = $('.picker .opt', app); if (first) first.click(); return; }
    if (e.key === 'Enter' && e.target.classList.contains('row')) { e.preventDefault(); e.target.click(); }
  });
  document.addEventListener('keydown', (e) => {
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); S.palette = !S.palette; S.paletteQ = ''; S.paletteIdx = 0; render({ focus: '[data-k="palette"]' }); return; }
    if (e.key === 'Escape') { if (S.palette || S.pop || S.menu || S.filtersSheet) closeAll(); else if (S.picker) closePicker(); else if (S.open != null) closeDetail(); else if (S.select) { S.select = false; S.selected.clear(); render(); } else if (inField) e.target.blur(); return; }
    if (inField) return;
    if (e.key === '/') { e.preventDefault(); const s = $('[data-k="q"]', app); if (s) s.focus(); }
    else if (e.key === 'n') { e.preventDefault(); const p = $('[data-k="paste"]', app); if (p) { p.focus(); p.scrollIntoView({ block: 'center' }); } }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'j' || e.key === 'k') { const rows = $$('.row', app); if (!rows.length) return; e.preventDefault(); const cur = rows.indexOf(document.activeElement); const next = e.key === 'ArrowDown' || e.key === 'j' ? Math.min(rows.length - 1, cur + 1) : Math.max(0, cur - 1); rows[next].focus(); rows[next].scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'e' && document.activeElement.classList.contains('row')) { archiveLinks([+document.activeElement.dataset.id], S.view !== 'archive'); }
  });
  document.addEventListener('paste', (e) => {
    if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    const text = (e.clipboardData || window.clipboardData).getData('text'); if (/^https?:\/\/\S+$/i.test((text || '').trim())) { e.preventDefault(); addUrl(text); }
  });
  app.addEventListener('focusin', (e) => { const r = e.target.closest('.row'); if (r) S.focus = +r.dataset.id; });
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (['home', 'unsorted', 'archive'].includes(h) || h.startsWith('project:')) { S.view = h; render(); } });

  // ---------- demo bar ----------
  const demo = window.LINKSINK_DEMO = {
    screen(name) {
      S.select = false; S.selected.clear(); S.picker = null; S.pop = null; S.palette = false; S.menu = false; S.filtersSheet = false; S.emptyDemo = false; S.open = null; S.q = ''; for (const k in S.f) S.f[k] = [];
      const first = () => visible()[0];
      switch (name) {
        case 'home': S.view = 'home'; render(); break;
        case 'paste': S.view = 'home'; render(); setTimeout(simulatePaste, 350); break;
        case 'detail': S.view = 'home'; render(); openDetail((S.links.find((l) => l.id === 1003) || first()).id); break;
        case 'organise': S.view = 'home'; render(); openDetail((S.links.find((l) => l.id === 1003) || first()).id); setTimeout(() => { S.picker = { bulk: false, anchor: anchorRef($('.detail-foot [data-act="organise"]', app)), q: '' }; render(); }, 420); break;
        case 'bulk': S.view = 'unsorted'; S.select = true; render(); visible().slice(0, 3).forEach((l) => S.selected.add(l.id)); render(); break;
        case 'unsorted': S.view = 'unsorted'; render(); break;
        case 'archive': S.view = 'archive'; render(); break;
        case 'empty': S.view = 'unsorted'; render(); S.emptyDemo = true; render(); break;
        case 'empty-first': S.view = 'home'; S.emptyDemo = true; render(); break;
        case 'palette': S.view = 'home'; S.palette = true; S.paletteQ = ''; render({ focus: '[data-k="palette"]' }); break;
        case 'filters': S.view = 'home'; S.f.media = ['Video', 'Article']; S.f.projects = ['stack']; render(); break;
      }
      const m = $('.main', app); if (m) m.scrollTop = 0;
    },
    simulate: simulatePaste, state: S, render,
  };
  function mountDemoBar() {
    const bar = $('#demo'); if (!bar) return;
    const params = new URLSearchParams(location.search);
    const html = document.documentElement;
    const setTheme = (t) => { html.dataset.theme = t; $$('[data-theme-btn]', bar).forEach((b) => b.classList.toggle('on', b.dataset.themeBtn === t)); };
    const setView = (v) => { $('#stage').dataset.view = v; $$('[data-view-btn]', bar).forEach((b) => b.classList.toggle('on', b.dataset.viewBtn === v)); scale(); setTimeout(() => render(), 20); };
    const scale = () => { const st = $('#stage'); const v = st.dataset.view; const fr = $('.frame', st); if (!fr) return; if (v === 'desktop') { const s = Math.min(1, (innerWidth - 32) / 1440); fr.style.setProperty('--s', s); } else fr.style.removeProperty('--s'); };
    bar.innerHTML = `<div class="demo-left"><a class="demo-back" href="index.html">${I('back', 14)}All directions</a><span class="demo-name">${esc(cfg.letter || '')} · ${esc(cfg.name)}</span></div>
      <div class="demo-mid"><label class="demo-screens">Screen <select data-screen>${[['home', 'Home'], ['paste', 'The paste moment'], ['detail', 'A link opened'], ['organise', 'The organiser'], ['bulk', 'Bulk select'], ['filters', 'Filters on'], ['unsorted', 'Unsorted inbox'], ['archive', 'Archive'], ['empty', 'Empty inbox'], ['empty-first', 'First run (empty)'], ['palette', 'Command palette (Ctrl/Cmd+K)']].map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label><button class="demo-btn" data-sim>${I('link', 14)}Paste a link</button></div>
      <div class="demo-right"><div class="demo-seg"><button data-view-btn="auto" title="Fill the window">Auto</button><button data-view-btn="phone" title="390 px">${I('phone', 14)}Phone</button><button data-view-btn="desktop" title="1440 px">${I('monitor', 14)}Desktop</button></div><div class="demo-seg"><button data-theme-btn="light">${I('sun', 14)}Light</button><button data-theme-btn="dark">${I('moon', 14)}Dark</button></div></div>`;
    bar.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.themeBtn) setTheme(b.dataset.themeBtn); if (b.dataset.viewBtn) setView(b.dataset.viewBtn); if ('sim' in b.dataset) simulatePaste(); });
    $('[data-screen]', bar).addEventListener('change', (e) => demo.screen(e.target.value));
    const theme = params.get('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); setTheme(theme);
    const view = params.get('view') || 'auto'; setView(view);
    addEventListener('resize', () => { scale(); render(); });
    if (params.get('screen')) { $('[data-screen]', bar).value = params.get('screen'); setTimeout(() => demo.screen(params.get('screen')), 200); }
  }
  render(); mountDemoBar();
  if (location.hash && /^#(home|unsorted|archive|project:)/.test(location.hash)) { S.view = location.hash.slice(1); render(); }
})();
