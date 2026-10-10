/* Nicole's revision app: Today / Practice / Progress tabs + question player.
   Reads and writes the tracker's ticks (globals `done`, `store`, `KEY`, `render`, `KINDS`, `ALL`)
   so ticks made on Today and on Plan are the same ticks. Question answers live under QKEY. */
(function () {
  "use strict";
  var DATA = window.QB;
  var QKEY = "nicole-qbank-v2";
  var S = {};
  try { S = JSON.parse(localStorage.getItem(QKEY) || "{}") || {}; } catch (e) { S = {}; }
  S.a = S.a || {}; S.marked = S.marked || {}; S.pos = S.pos || {}; S.days = S.days || {};
  function save() { try { localStorage.setItem(QKEY, JSON.stringify(S)); } catch (e) {} }

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
  function L(i) { return "ABCDEFGHIJKL"[i]; }
  var MOD = {ENI:"Endocrine & Integument",GIL:"GI, Liver & Nutrition",URO:"Urogenital & Reproduction",OSPE:"OSPE",ALL:"All modules"};
  var TYPE = {sba:"Single best answer",emq:"Extended matching",fill:"Fill in the blank",sa:"Short answer"};
  function fmt(d) { var x = new Date(d + "T12:00:00"); return {d:x.getDate(), m:x.toLocaleString("en-GB",{month:"short"}), w:x.toLocaleString("en-GB",{weekday:"short"}), long:x.toLocaleString("en-GB",{weekday:"long",day:"numeric",month:"long"})}; }
  function isoOf(x) { return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0"); }
  function addDays(iso,n) { var x=new Date(iso+"T12:00:00"); x.setDate(x.getDate()+n); return isoOf(x); }
  // Always the device's local date, re-read on every use so it rolls over at midnight.
  function today() { return isoOf(new Date()); }
  function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9α-ω]+/g, ""); }

  var BLOCKS = {}, DAYOF = {};
  DATA.days.forEach(function (d) { d.blocks.forEach(function (b) { BLOCKS[b.key] = b; DAYOF[b.key] = d.date; }); });
  var FIRST = DATA.days[0].date, LAST = DATA.days[DATA.days.length-1].date;
  var ITEM = {}; ALL.forEach(function (it) { ITEM[it.id] = it; });
  var SESS = DATA.sess; // tracker id -> {due, set}
  var SET_SESS = {};    // set id -> [tracker ids in timetable order]
  Object.keys(SESS).sort(function (a, b) { return SESS[a].due < SESS[b].due ? -1 : SESS[a].due > SESS[b].due ? 1 : 0; })
    .forEach(function (id) { (SET_SESS[SESS[id].set] = SET_SESS[SESS[id].set] || []).push(id); });

  // ---------- session state (shared with the Plan tab) ----------
  function setMarked(sid) { return Object.keys(S.marked).some(function (k) { return k.indexOf(sid + "-R") === 0; }); }
  function sessState(id) {
    if (done[id]) return "done";
    var s = SESS[id]; if (!s) return "upcoming";
    var t = today();
    if (s.due < t) return "overdue";
    if (setMarked(s.set)) return "ready";
    if (s.due === t) return "today";
    return "upcoming";
  }
  window.qbSessState = sessState;
  window.qbDueLabel = function (id) { var s = SESS[id]; if (!s) return ""; var f = fmt(s.due); return f.w + " " + f.d + " " + f.m; };

  function tick(id, on) {
    if (on) done[id] = 1; else delete done[id];
    store(KEY, done); logActivity(); planDirty = true; updBadge();
  }

  // ---------- answers + marking ----------
  function A(id) { return S.a[id] || (S.a[id] = {}); }
  function answered(q) { var a = S.a[q.id]; if (!a) return false;
    if (q.type === "sba") return a.sel != null;
    if (q.type === "emq") return !!a.sel && Object.keys(a.sel).length > 0;
    if (q.type === "fill") return !!(a.text && a.text.trim());
    return !!a.text && Object.keys(a.text).some(function (k) { return a.text[k] && a.text[k].trim(); }); }
  function maxPts(q) { if (q.type === "emq") return q.items.length; if (q.type === "sa") return q.parts.reduce(function (x, p) { return x + (p.marks || 0); }, 0); if (!q.type) return q.checklist.length; return 1; }
  function fillOk(q) { var a = S.a[q.id] || {}; if (a.override) return true; var v = a.text || ""; return !!norm(v) && [q.answer].concat(q.accept || []).some(function (x) { return norm(x) === norm(v); }); }
  function selfMarked(q) { return q.type === "sa" || !q.type; }
  function grade(q) { var a = S.a[q.id] || {}, mx = maxPts(q);
    if (!answered(q) && !selfMarked(q)) return {pts:0,max:mx,state:"skip"};
    if (q.type === "sba") { var ok = a.sel === q.answer; return {pts:ok?1:0,max:1,state:ok?"ok":"no"}; }
    if (q.type === "emq") { var p = q.items.reduce(function (x, it, i) { return x + ((a.sel || {})[i] === it.answer ? 1 : 0); }, 0); return {pts:p,max:mx,state:p===mx?"ok":p>0?"part":"no"}; }
    if (q.type === "fill") { var ok2 = fillOk(q); return {pts:ok2?1:0,max:1,state:ok2?"ok":"no"}; }
    if (typeof a.score === "number") return {pts:a.score,max:mx,state:a.score===mx?"ok":a.score>0?"part":"no"};
    return {pts:0,max:mx,state:answered(q)?"self":"skip"}; }
  function blockInfo(b) { var n = b.questions.length, ans = b.questions.filter(answered).length, marked = !!S.marked[b.key];
    var pts = 0, max = 0, pending = 0;
    if (marked) b.questions.forEach(function (q) { var g = grade(q); if (g.state === "self") { pending++; return; } pts += g.pts; max += g.max; });
    return {n:n,ans:ans,marked:marked,pts:pts,max:max,pending:pending,pct:max?Math.round(100*pts/max):null}; }
  function estMin(b) { return Math.round(b.questions.reduce(function (x, q) { return x + (q.type === "sa" ? 5 : !q.type ? 6 : q.type === "emq" ? 2.5 : 1.2); }, 0)); }
  function logActivity() { var t = today(); S.days[t] = (S.days[t] || 0) + 1; save(); }

  // ---------- common bits ----------
  var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>';
  function dayFor(iso) { for (var i = 0; i < DATA.days.length; i++) if (DATA.days[i].date === iso) return DATA.days[i];
    return {date:iso,kind:iso<FIRST?"before":"after",module:null,blocks:[]}; }
  function nextSetDay(iso) { for (var i = 0; i < DATA.days.length; i++) if (DATA.days[i].date > iso && DATA.days[i].blocks.length) return DATA.days[i]; return null; }
  function dayLabel(d) {
    if (!d.blocks.length) return d.kind === "off" ? "Rest day" : d.kind === "before" ? "Before revision" : d.kind === "after" ? "After exams" : "Exam day";
    if (d.module === "OSPE") return "OSPE walk-through";
    if (d.kind === "mixed") return d.date === "2026-11-06" ? "Mixed papers" : "Full mock";
    return d.module + (d.kind === "consolidation" ? " consolidation" : d.kind === "exam" ? " rapid recall" : " first pass"); }
  function dayMod(d) { return d.kind === "mixed" ? "ALL" : (d.module || "ALL"); }

  function sessRow(id, showDue) {
    var it = ITEM[id], st = sessState(id), f = fmt(SESS[id].due);
    var note = st === "overdue" ? '<span class="q-due bad">Due ' + f.w + " " + f.d + " " + f.m + "</span>"
      : st === "ready" ? '<span class="q-due warn">Questions done · tick when revised</span>'
      : showDue ? '<span class="q-due">' + f.w + " " + f.d + " " + f.m + "</span>" : "";
    return '<label class="q-sess s-' + st + '"><input type="checkbox" data-tick="' + id + '"' + (done[id] ? " checked" : "") + '><span class="q-box">' + CHECK + '</span>' +
      '<span class="q-st"><span class="q-tt">' + esc(it.t) + '</span>' + note + '</span><span class="q-kind" style="--hue:var(--t-' + it.k + ')">' + esc(KINDS[it.k]) + '</span></label>';
  }
  function setButton(b) {
    var i = blockInfo(b), unit = b.kind === "ospe" ? "stations" : "questions", cta;
    if (i.marked) cta = '<span class="q-cta done">' + (i.pct != null ? "Review · " + i.pct + "%" : "Review") + "</span>";
    else if (i.ans) cta = '<span class="q-cta">Continue · ' + i.ans + "/" + i.n + "</span>";
    else cta = '<span class="q-cta ghost">Start</span>';
    var extra = b.kind === "set" && b.questions.length > b.core ? " · " + (b.questions.length - b.core) + " LO top-up" : "";
    return '<button class="q-setbtn mod-' + b.module + '" data-open="' + b.key + '"><span class="q-badge' + (i.marked || i.ans ? " ringed" : "") + '" style="--p:' + (i.marked ? (i.pct || 0) : Math.round(100 * i.ans / i.n)) + '"><span>' + (i.marked && i.pct != null ? i.pct + "%" : i.n) + '</span></span>' +
      '<span class="q-sb"><b>' + (b.kind === "set" ? "Questions" : esc(b.title)) + '</b><small>' + esc(b.label) + " · " + i.n + " " + unit + " · about " + estMin(b) + " min" + extra + (i.pending ? " · " + i.pending + " to self-mark" : "") + '</small></span>' + cta + "</button>";
  }

  // ---------- TODAY ----------
  var curDate = null, planDirty = false;
  function heroHtml() {
    var ticked = Object.keys(done).length, sets = 0, setsDone = 0, pts = 0, max = 0;
    Object.keys(BLOCKS).forEach(function (k) { var i = blockInfo(BLOCKS[k]); sets++; if (i.marked) { setsDone++; pts += i.pts; max += i.max; } });
    var pct = max ? Math.round(100 * pts / max) : 0, t = today(), dots = "", streak = 0;
    for (var k = 6; k >= 0; k--) { var iso = addDays(t, -k), f = fmt(iso); dots += '<span class="' + (S.days[iso] ? "on" : "") + (k === 0 ? " today" : "") + '" title="' + f.long + '">' + f.w[0] + "</span>"; }
    for (var j = 0; ; j++) { var d = addDays(t, -j); if (S.days[d]) streak++; else if (j === 0) continue; else break; }
    return '<div class="q-hero"><div><div class="q-big">' + streak + " day" + (streak === 1 ? "" : "s") + '</div><div class="q-lbl">practice streak · ' + ticked + " of " + ALL.length + " sessions ticked · " + setsDone + " of " + sets + ' question sets marked</div><div class="q-streak" aria-label="Days practised this week">' + dots + "</div></div>" +
      '<div class="q-ring" style="--p:' + pct + '"><div><b>' + (max ? pct + "%" : "–") + "</b><small>AVG SCORE</small></div></div></div>";
  }
  function weekHtml(date) {
    var x = new Date(date + "T12:00:00"), mon = addDays(date, -((x.getDay() + 6) % 7)), t = today();
    var first = [FIRST, t].sort()[0], last = [LAST, t].sort()[1], f0 = fmt(mon);
    var h = '<div class="q-weekbar"><button class="q-icon" data-wk="-7" aria-label="Previous week"' + (addDays(mon, -1) < first ? " disabled" : "") + '><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button><div class="q-wk">Week of ' + f0.d + " " + f0.m + '</div><button class="q-icon" data-wk="7" aria-label="Next week"' + (addDays(mon, 7) > last ? " disabled" : "") + '><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></button></div><div class="q-week">';
    for (var k = 0; k < 7; k++) {
      var iso = addDays(mon, k), f = fmt(iso), d = null;
      for (var i = 0; i < DATA.days.length; i++) if (DATA.days[i].date === iso) d = DATA.days[i];
      if (!d && iso !== t) { h += '<button class="q-dp" disabled><span class="w">' + f.w.toUpperCase() + '</span><span class="n">' + f.d + '</span><span class="dot none"></span></button>'; continue; }
      d = d || dayFor(iso);
      var ids = Object.keys(SESS).filter(function (id) { return SESS[id].due === iso; });
      var late = iso < t && ids.some(function (id) { return !done[id]; });
      var all = d.blocks.length && d.blocks.every(function (b) { return S.marked[b.key]; }) && ids.every(function (id) { return done[id]; });
      h += '<button class="q-dp mod-' + dayMod(d) + (iso === t ? " istoday" : "") + '" data-date="' + iso + '" aria-current="' + (iso === date) + '" aria-label="' + f.long + ": " + esc(dayLabel(d)) + '"><span class="w">' + f.w.toUpperCase() + '</span><span class="n">' + f.d + '</span><span class="dot ' + (late ? "late" : all ? "done" : d.blocks.length ? "" : "none") + '"></span></button>';
    }
    return h + "</div>";
  }
  function overdueHtml() {
    var t = today(), ids = Object.keys(SESS).filter(function (id) { return SESS[id].due < t && !done[id]; });
    if (!ids.length) return "";
    ids.sort(function (a, b) { return SESS[a].due < SESS[b].due ? -1 : 1; });
    var open = !!S.odOpen, shown = open ? ids : ids.slice(0, 5);
    return '<section class="q-group q-overdue"><div class="q-gh"><h3>Overdue</h3><span class="q-n bad">' + ids.length + '</span><span class="q-gs">Sessions from earlier days not yet ticked</span></div><div class="q-list">' +
      shown.map(function (id) { return sessRow(id, true); }).join("") + "</div>" +
      (ids.length > 5 ? '<button class="q-more" data-od>' + (open ? "Show fewer" : "Show all " + ids.length) + "</button>" : "") + "</section>";
  }
  function renderToday(date) {
    curDate = date || curDate || today();
    var d = dayFor(curDate), f = fmt(curDate), t = today();
    var h = '<header class="q-head"><div><p class="q-eyebrow">' + (curDate === t ? "Today" : curDate < t ? "Earlier" : "Coming up") + '</p><h1>' + f.long + '</h1></div><button class="q-icon" data-theme aria-label="Switch light or dark"><svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg></button></header>';
    h += heroHtml() + weekHtml(curDate);
    if (curDate === t) h += overdueHtml();
    h += '<div class="q-dayhead mod-' + dayMod(d) + '"><span class="q-chip">' + esc(dayLabel(d)) + "</span>" + (curDate !== t ? '<button class="q-btn sm" data-today>Back to today</button>' : "") + "</div>";
    var sets = d.blocks.filter(function (b) { return b.kind === "set" && b.label === "First pass"; });
    var others = d.blocks.filter(function (b) { return sets.indexOf(b) < 0; });
    if (!d.blocks.length) {
      var nx = nextSetDay(curDate);
      var msg = d.kind === "before" ? "Revision hasn't started yet." : d.kind === "after" ? "Exams are finished. Everything is still under Plan and Practice." : d.kind === "off" ? "Rest day. Nothing scheduled." : d.kind === "exam" ? "Exam day. Light recall only; yesterday's rapid-recall sets cover it." : "Nothing scheduled.";
      h += '<div class="q-empty">' + msg + (nx ? '<div><button class="q-btn sm mod-' + dayMod(nx) + '" data-date="' + nx.date + '">Next: ' + fmt(nx.date).long + " · " + esc(dayLabel(nx)) + " →</button></div>" : "") + "</div>";
    }
    if (sets.length) {
      var ns = sets.reduce(function (x, b) { return x + (SET_SESS[b.sid] || []).length; }, 0);
      var nt = sets.reduce(function (x, b) { return x + (SET_SESS[b.sid] || []).filter(function (id) { return done[id]; }).length; }, 0);
      h += '<p class="q-sum">Revise these ' + ns + " sessions (" + nt + " ticked), then answer each topic's questions and mark them.</p>";
      sets.forEach(function (b) {
        var ids = SET_SESS[b.sid] || [], dn = ids.filter(function (id) { return done[id]; }).length;
        h += '<section class="q-topic mod-' + b.module + '"><div class="q-gh"><h3>' + esc(b.title) + '</h3><span class="q-n">' + dn + "/" + ids.length + '</span></div><div class="q-list">' + ids.map(function (id) { return sessRow(id, false); }).join("") + "</div>" + setButton(b) + "</section>";
      });
    }
    if (others.length) {
      h += '<p class="q-sum">' + (sets.length ? "Also today:" : d.kind === "consolidation" ? "Consolidation day: fresh questions on topics you've already covered." : d.kind === "exam" ? "Rapid recall before the exam." : "Practice papers. Answer the whole paper, then mark it.") + "</p>";
      h += '<div class="q-cards">' + others.map(function (b) { return '<div class="q-topic mod-' + b.module + '"><div class="q-gh"><h3>' + esc(b.title) + "</h3></div>" + setButton(b) + "</div>"; }).join("") + "</div>";
    }
    $("tab-today-in").innerHTML = h;
  }

  // ---------- PRACTICE ----------
  function renderPractice() {
    var byMod = {ENI:[], GIL:[], URO:[]}, h = '<header class="q-head"><div><p class="q-eyebrow">Practice</p><h1>Every question set</h1></div></header>';
    Object.keys(DATA.sets).forEach(function (sid) { var s = DATA.sets[sid]; byMod[s.module].push([sid, s]); });
    ["GIL","URO","ENI"].forEach(function (m) {
      h += '<div class="q-mh mod-' + m + '"><h2>' + MOD[m] + '</h2><span class="q-chip">' + m + '</span></div><div class="q-cards">';
      byMod[m].forEach(function (p) { var sid = p[0], s = p[1];
        var links = s.rounds.map(function (r) { var b = BLOCKS[sid + "-R" + r[1]], i = blockInfo(b), f = fmt(r[0]);
          return '<button class="q-btn sm' + (i.marked ? " ok" : "") + '" data-open="' + b.key + '">' + ["","First pass","Consolidation","Rapid recall"][r[1]] + " · " + f.d + " " + f.m + " · " + (i.marked ? (i.pct != null ? i.pct + "%" : "marked") : i.ans + "/" + i.n) + "</button>"; }).join("");
        h += '<div class="q-tcard mod-' + m + '"><h3>' + esc(s.name) + '</h3><div class="q-lk">' + links + "</div></div>"; });
      h += "</div>";
    });
    h += '<div class="q-mh mod-ALL"><h2>Practice papers and OSPE</h2></div><div class="q-cards">';
    DATA.days.forEach(function (d) { d.blocks.forEach(function (b) { if (b.kind === "set") return; var f = fmt(d.date), i = blockInfo(b);
      h += '<div class="q-tcard mod-' + b.module + '"><h3>' + esc(b.title) + '</h3><div class="q-lk"><button class="q-btn sm' + (i.marked ? " ok" : "") + '" data-open="' + b.key + '">' + f.d + " " + f.m + " · " + b.questions.length + " " + (b.kind === "ospe" ? "stations" : "questions") + " · " + (i.marked ? (i.pct != null ? i.pct + "%" : "marked") : i.ans + "/" + i.n) + "</button></div></div>"; }); });
    $("tab-practice").innerHTML = '<div class="qwrap">' + h + "</div></div>";
  }

  // ---------- PROGRESS ----------
  function renderProgress() {
    var h = '<header class="q-head"><div><p class="q-eyebrow">Progress</p><h1>How it\'s going</h1></div></header><div class="q-mods">';
    ["GIL","URO","ENI"].forEach(function (m) {
      var ids = ALL.filter(function (it) { return it.mod === m; }), dn = ids.filter(function (it) { return done[it.id]; }).length;
      var od = ids.filter(function (it) { return sessState(it.id) === "overdue"; }).length;
      var pts = 0, max = 0, mk = 0, tot = 0;
      Object.keys(BLOCKS).forEach(function (k) { var b = BLOCKS[k]; if (b.module !== m) return; tot++; var i = blockInfo(b); if (i.marked) { mk++; pts += i.pts; max += i.max; } });
      var pct = max ? Math.round(100 * pts / max) : null;
      h += '<div class="q-mod mod-' + m + '"><div class="q-gh"><h3>' + m + '</h3><span class="q-gs">' + MOD[m] + '</span></div>' +
        '<div class="q-bar"><i style="width:' + Math.round(100 * dn / ids.length) + '%"></i></div><p>' + dn + " of " + ids.length + " sessions ticked" + (od ? ' · <span class="bad">' + od + " overdue</span>" : "") + "</p>" +
        "<p>" + mk + " of " + tot + " question sets marked" + (pct != null ? " · average <b>" + pct + "%</b>" : "") + "</p></div>";
    });
    h += "</div>";
    var weak = Object.keys(BLOCKS).map(function (k) { return [BLOCKS[k], blockInfo(BLOCKS[k])]; }).filter(function (p) { return p[1].marked && p[1].pct != null && p[1].pct < 60; })
      .sort(function (a, b) { return a[1].pct - b[1].pct; });
    h += '<div class="q-mh"><h2>Needs another pass</h2></div>';
    h += weak.length ? '<div class="q-cards">' + weak.slice(0, 10).map(function (p) { var b = p[0]; return '<div class="q-tcard mod-' + b.module + '"><h3>' + esc(b.title) + '</h3><div class="q-lk"><button class="q-btn sm" data-open="' + b.key + '">' + esc(b.label) + " · " + p[1].pct + "% · review</button></div></div>"; }).join("") + "</div>"
      : '<div class="q-empty">Sets you score under 60% on appear here, lowest first.</div>';
    h += '<div class="q-mh"><h2>How it works</h2></div><div class="q-notes"><ul>' +
      "<li><b>Today</b> lists the sessions due today with that topic's questions underneath. Tick each session when you've revised it.</li>" +
      "<li>A session turns <span class=\"warn\">amber</span> when you've marked its questions but haven't ticked it, and <span class=\"bad\">red</span> once its day has passed unticked. Red ones collect under Overdue at the top of Today.</li>" +
      "<li>Questions come one at a time. Nothing is marked until you press <b>Finish and mark</b> at the end of the set.</li>" +
      "<li>Single best answer, extended matching and fill in the blank mark themselves. For short answers and OSPE stations you mark yourself against the mark scheme.</li>" +
      "<li>Each first-pass set covers every learning outcome for its topic; extra questions needed for that are labelled LO top-up.</li>" +
      "<li>Everything saves on this phone. Use Save a backup below now and then.</li></ul></div>";
    var holder = $("q-progress-body"); holder.innerHTML = h;
  }

  // ---------- player ----------
  var P = null, R = null;
  function openBlock(key) { var b = BLOCKS[key]; if (S.marked[key]) return openResults(key); P = {key:key, i:Math.min(S.pos[key] || 0, b.questions.length - 1)}; renderPlayer(); }
  function closeOv() { $("q-ov").hidden = true; $("q-ov").innerHTML = ""; document.body.style.overflow = ""; P = null; R = null; refresh(); }
  function qInput(q) {
    var a = S.a[q.id] || {}, h = "";
    if (q.type === "sba") {
      h += '<p class="q-stem">' + esc(q.stem) + '</p><div class="q-opts" role="radiogroup">' + q.options.map(function (o, i) { return '<button class="q-opt' + (a.sel === i ? " sel" : "") + '" role="radio" aria-checked="' + (a.sel === i) + '" data-sba="' + i + '"><span class="L">' + L(i) + "</span><span>" + esc(o) + "</span><span></span></button>"; }).join("") + "</div>";
    } else if (q.type === "emq") {
      h += '<p class="q-stem">' + esc(q.stem) + '</p><ul class="q-emq">' + q.options.map(function (o) { return "<li>" + esc(o) + "</li>"; }).join("") + "</ul>";
      q.items.forEach(function (it, i) { var v = (a.sel || {})[i];
        h += '<div class="q-item"><div class="p">' + (i + 1) + ". " + esc(it.prompt) + '</div><select data-emq="' + i + '" id="emq-' + q.id + "-" + i + '" aria-label="Answer for item ' + (i + 1) + '"><option value="">Choose…</option>' + q.options.map(function (o, j) { return '<option value="' + j + '"' + (v === j ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select></div>"; });
    } else if (q.type === "fill") {
      h += '<p class="q-stem">' + esc(q.stem) + '</p><input type="text" data-fill id="fill-' + q.id + '" value="' + esc(a.text || "") + '" placeholder="Type the missing word" autocomplete="off" autocapitalize="off" spellcheck="false">';
    } else if (q.type === "sa") {
      h += '<p class="q-stem">' + esc(q.stem) + '</p><p class="q-hint">Write your answers. You mark yourself against the mark scheme at the end.</p>';
      q.parts.forEach(function (p, i) { h += '<div class="q-part"><div class="pp">' + String.fromCharCode(97 + i) + ") " + esc(p.prompt) + ' <span class="mk">[' + p.marks + ']</span></div><textarea data-sa="' + i + '" id="sa-' + q.id + "-" + i + '" aria-label="Part ' + String.fromCharCode(97 + i) + '">' + esc((a.text || {})[i] || "") + "</textarea></div>"; });
    } else {
      h += '<p class="q-stem">' + esc(q.title) + '</p><p class="q-hint">' + esc(q.module) + " station · " + (q.time_min || 5) + ' minutes</p><p class="q-task">' + esc(q.task) + '</p><textarea data-sa="0" id="sa-' + q.id + '-0" placeholder="Say it aloud, or jot the steps in order" aria-label="Your steps">' + esc((a.text || {})[0] || "") + "</textarea>";
    }
    return h;
  }
  function ovShell(mod) { var ov = $("q-ov"); ov.className = "q-ov qb mod-" + mod; ov.hidden = false; document.body.style.overflow = "hidden"; return ov; }
  function renderPlayer() {
    var b = BLOCKS[P.key], q = b.questions[P.i], n = b.questions.length, ans = b.questions.filter(answered).length, last = P.i === n - 1;
    S.pos[P.key] = P.i; save();
    var ov = ovShell(b.module);
    ov.innerHTML = '<div class="q-ovtop"><div class="in"><button class="q-icon" data-x aria-label="Save and close"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button><div class="q-pbar" aria-hidden="true"><i style="width:' + Math.round(100 * (P.i + 1) / n) + '%"></i></div><span class="q-count">' + (P.i + 1) + " / " + n + '</span><button class="q-icon" data-map aria-label="All questions"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg></button></div></div>' +
      '<div class="q-ovbody" id="q-pbody"><div class="in"><div class="q-settitle">' + esc(b.title) + " · " + esc(b.label) + '</div><div class="q-qtype"><span class="t">' + (TYPE[q.type] || "OSPE station") + "</span>" + (q.type === "sa" ? "<span>" + maxPts(q) + " marks</span>" : "") + (q.topup ? '<span class="top">LO top-up</span>' : "") + "</div>" + qInput(q) + "</div></div>" +
      '<div class="q-ovfoot"><div class="in"><button class="q-btn" data-prev' + (P.i === 0 ? " disabled" : "") + ">Back</button>" + (last ? '<button class="q-btn pri" data-finish>Finish and mark · ' + ans + "/" + n + "</button>" : '<button class="q-btn pri" data-next>Next</button>') + "</div></div>";
    $("q-pbody").scrollTop = 0;
    ov.querySelector("[data-x]").onclick = closeOv;
    ov.querySelector("[data-map]").onclick = showMap;
    ov.querySelector("[data-prev]").onclick = function () { P.i--; renderPlayer(); };
    var nx = ov.querySelector("[data-next]"), fn = ov.querySelector("[data-finish]");
    if (nx) nx.onclick = function () { P.i++; renderPlayer(); };
    if (fn) fn.onclick = confirmFinish;
    [].forEach.call(ov.querySelectorAll("[data-sba]"), function (x) { x.onclick = function () { var a = A(q), v = +x.dataset.sba; a.sel = a.sel === v ? null : v; logActivity();
      [].forEach.call(ov.querySelectorAll("[data-sba]"), function (y) { var on = a.sel === +y.dataset.sba; y.classList.toggle("sel", on); y.setAttribute("aria-checked", on); }); updFinish(); }; });
    [].forEach.call(ov.querySelectorAll("[data-emq]"), function (x) { x.onchange = function () { var a = A(q); a.sel = a.sel || {}; if (x.value === "") delete a.sel[x.dataset.emq]; else a.sel[x.dataset.emq] = +x.value; logActivity(); updFinish(); }; });
    var fi = ov.querySelector("[data-fill]");
    if (fi) { fi.oninput = function () { A(q).text = fi.value; save(); updFinish(); }; fi.onchange = logActivity; fi.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); (nx || fn).click(); } }; }
    [].forEach.call(ov.querySelectorAll("[data-sa]"), function (x) { x.oninput = function () { var a = A(q); a.text = a.text || {}; a.text[x.dataset.sa] = x.value; save(); updFinish(); }; x.onchange = logActivity; });
  }
  function updFinish() { var b = BLOCKS[P.key], f = $("q-ov").querySelector("[data-finish]"); if (f) f.textContent = "Finish and mark · " + b.questions.filter(answered).length + "/" + b.questions.length; }
  function sheet(html, mod) { var sh = $("q-sheet"); sh.className = "q-sheet qb mod-" + mod; sh.innerHTML = '<div class="q-sbox" role="dialog">' + html + "</div>"; sh.hidden = false; sh.onclick = function (e) { if (e.target === sh) sh.hidden = true; }; return sh; }
  function showMap() {
    var b = BLOCKS[P.key];
    var sh = sheet('<h3>Jump to a question</h3><p>Shaded ones have an answer saved.</p><div class="q-grid">' + b.questions.map(function (q, i) { return '<button class="' + (answered(q) ? "ans" : "") + (i === P.i ? " cur" : "") + '" data-j="' + i + '">' + (i + 1) + "</button>"; }).join("") + '</div><div class="q-row"><button class="q-btn wide" data-close>Close</button><button class="q-btn pri" data-fin>Finish and mark</button></div>', b.module);
    sh.querySelector("[data-close]").onclick = function () { sh.hidden = true; };
    sh.querySelector("[data-fin]").onclick = function () { sh.hidden = true; confirmFinish(); };
    [].forEach.call(sh.querySelectorAll("[data-j]"), function (x) { x.onclick = function () { P.i = +x.dataset.j; sh.hidden = true; renderPlayer(); }; });
  }
  function confirmFinish() {
    var b = BLOCKS[P.key], left = b.questions.filter(function (q) { return !answered(q); }).length;
    if (!left) return finish();
    var sh = sheet("<h3>" + left + " " + (left === 1 ? "question has" : "questions have") + ' no answer</h3><p>Unanswered questions score zero. Go back and answer them, or mark the set now.</p><div class="q-row"><button class="q-btn wide" data-back>Go back</button><button class="q-btn pri" data-go>Mark now</button></div>', b.module);
    sh.querySelector("[data-back]").onclick = function () { sh.hidden = true; for (var i = 0; i < b.questions.length; i++) if (!answered(b.questions[i])) { P.i = i; break; } renderPlayer(); };
    sh.querySelector("[data-go]").onclick = function () { sh.hidden = true; finish(); };
  }
  function finish() { var key = P.key; S.marked[key] = {at: Date.now()}; logActivity(); P = null; planDirty = true; openResults(key); }

  // ---------- results ----------
  function verdict(p) { if (p == null) return ["Marked", "Mark the short answers below to finish your score."]; if (p >= 85) return ["Excellent", "This topic is secure. Keep it ticking over."]; if (p >= 70) return ["Good work", "A few gaps to tidy. Review the red ones below."]; if (p >= 50) return ["Getting there", "Go through the explanations below, then retry on another day."]; return ["Worth another pass", "Re-read your notes on this one, then retry the set."]; }
  function openResults(key) { R = {key:key, filter: R && R.key === key ? R.filter : "all"}; renderResults(); }
  function reviewHtml(q, n) {
    var a = S.a[q.id] || {}, g = grade(q), h = "", cls = {ok:"ok",part:"no",no:"no",skip:"",self:"self"}[g.state];
    var tag = g.state === "ok" ? '<span class="ok-t">Correct</span>' : g.state === "part" ? '<span class="no-t">' + g.pts + "/" + g.max + "</span>" : g.state === "no" ? '<span class="no-t">Incorrect</span>' : g.state === "self" ? '<span class="self-t">Mark yourself</span>' : '<span class="sk-t">Not answered</span>';
    h += '<div class="q-qtype"><span>Q' + n + '</span><span class="t">' + (TYPE[q.type] || "OSPE station") + "</span>" + tag + (q.topup ? '<span class="top">LO top-up</span>' : "") + "</div>";
    if (q.type === "sba") {
      h += '<p class="q-stem">' + esc(q.stem) + '</p><div class="q-opts">' + q.options.map(function (o, i) { var c = i === q.answer ? "right" : a.sel === i ? "wrong" : ""; return '<div class="q-opt ' + c + '"><span class="L">' + L(i) + "</span><span>" + esc(o) + '</span><span class="mk">' + (i === q.answer && a.sel === i ? "Yours ✓" : i === q.answer ? "Answer" : a.sel === i ? "Yours" : "") + "</span></div>"; }).join("") + '</div><div class="q-exp">' + esc(q.explanation) + "</div>";
    } else if (q.type === "emq") {
      h += '<p class="q-stem">' + esc(q.stem) + "</p>";
      q.items.forEach(function (it, i) { var v = (a.sel || {})[i], ok = v === it.answer;
        h += '<div class="q-item"><div class="p">' + (i + 1) + ". " + esc(it.prompt) + '</div><div class="q-yours">' + (ok ? '<span class="ok-t">✓</span> ' + esc(q.options[it.answer]) : (v == null ? '<span class="sk-t">No answer</span>' : '<span class="no-t">✗</span> ' + esc(q.options[v])) + " · <b>Answer:</b> " + esc(q.options[it.answer])) + "</div></div>"; });
      h += '<div class="q-exp">' + esc(q.explanation) + "</div>";
    } else if (q.type === "fill") {
      var ok = fillOk(q);
      h += '<p class="q-stem">' + esc(q.stem) + '</p><div class="q-yours"><b>Yours:</b> ' + (a.text ? esc(a.text) : '<span class="sk-t">blank</span>') + (ok ? ' <span class="ok-t">✓</span>' : "") + '</div><div class="q-yours"><b>Answer:</b> ' + esc(q.answer) + (q.accept && q.accept.length ? ' <span class="q-muted">(also: ' + esc(q.accept.join(", ")) + ")</span>" : "") + "</div>" +
        (!ok && a.text ? '<div class="q-self"><button class="q-btn sm" data-override="' + q.id + '">My wording means the same</button></div>' : "") + '<div class="q-exp">' + esc(q.explanation) + "</div>";
    } else if (q.type === "sa") {
      h += '<p class="q-stem">' + esc(q.stem) + "</p>";
      q.parts.forEach(function (p, i) { var y = ((a.text || {})[i] || "").trim();
        h += '<div class="q-part"><div class="pp">' + String.fromCharCode(97 + i) + ") " + esc(p.prompt) + ' <span class="mk">[' + p.marks + ']</span></div><div class="q-yours"><b>Yours:</b> ' + (y ? esc(y) : '<span class="sk-t">blank</span>') + '</div><div class="q-exp"><b>Mark scheme</b>' + (p.note ? ' <span class="q-muted">(' + esc(p.note) + ")</span>" : "") + '<ul class="q-ms">' + p.mark_scheme.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") + "</ul></div></div>"; });
      if (q.explanation) h += '<div class="q-exp">' + esc(q.explanation) + "</div>";
      h += '<div class="q-self">Your mark: ' + Array.apply(null, {length: maxPts(q) + 1}).map(function (_, k) { return '<button data-score="' + q.id + '" data-v="' + k + '" aria-pressed="' + (a.score === k) + '">' + k + "</button>"; }).join("") + ' <span class="q-muted">/ ' + maxPts(q) + "</span></div>";
    } else {
      var y0 = ((a.text || {})[0] || "").trim();
      h += '<p class="q-stem">' + esc(q.title) + '</p><p class="q-task">' + esc(q.task) + '</p><div class="q-yours"><b>Your steps:</b> ' + (y0 ? esc(y0) : '<span class="sk-t">none written</span>') + '</div><div class="q-exp"><b>Examiner checklist</b> (tick each step you covered)<ul class="q-ticks">' +
        q.checklist.map(function (c, i) { return '<li><label><input type="checkbox" data-stick="' + q.id + '" data-i="' + i + '"' + ((a.ticks || {})[i] ? " checked" : "") + "> " + esc(c) + "</label></li>"; }).join("") + '</ul><b>Critical errors</b><ul class="q-ms">' + q.critical_errors.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + '</ul><b>Viva</b><ul class="q-ms">' + q.viva.map(function (v) { return "<li><b>" + esc(v.q) + "</b><br>" + esc(v.a) + "</li>"; }).join("") + "</ul></div>";
    }
    if (q.los && q.los.length) h += '<details class="q-los"><summary>Learning outcomes tested (' + q.los.length + ")</summary><ul>" + q.los.map(function (l) { return "<li>" + esc(DATA.lo[l] || l) + "</li>"; }).join("") + "</ul></details>";
    return '<article class="q-rq ' + cls + '">' + h + "</article>";
  }
  function renderResults() {
    var b = BLOCKS[R.key], i = blockInfo(b), gs = b.questions.map(grade);
    var c = gs.filter(function (g) { return g.state === "ok"; }).length, w = gs.filter(function (g) { return g.state === "no" || g.state === "part"; }).length, s = gs.filter(function (g) { return g.state === "skip"; }).length, self = gs.filter(function (g) { return g.state === "self"; }).length;
    var v = verdict(i.pending ? null : i.pct);
    var show = b.questions.map(function (q, k) { return [q, k, gs[k]]; }).filter(function (x) { var g = x[2];
      return R.filter === "all" || (R.filter === "wrong" && (g.state === "no" || g.state === "part" || g.state === "skip")) || (R.filter === "self" && (x[0].type === "sa" || !x[0].type)); });
    var ids = b.kind === "set" ? (SET_SESS[b.sid] || []).filter(function (id) { return !done[id]; }) : [];
    var ov = ovShell(b.module);
    ov.innerHTML = '<div class="q-ovtop"><div class="in"><button class="q-icon" data-x aria-label="Close"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button><div class="q-count" style="flex:1">' + esc(b.title) + "</div></div></div>" +
      '<div class="q-ovbody" id="q-rbody"><div class="in"><div class="q-res"><div class="q-bigring" style="--p:' + (i.pct || 0) + '"><div><b>' + (i.pct != null ? i.pct + "%" : "–") + "</b><small>" + i.pts + " / " + i.max + " marks</small></div></div><h2>" + v[0] + "</h2><p>" + v[1] + (i.pending ? " " + i.pending + " short " + (i.pending === 1 ? "answer is" : "answers are") + " waiting for your mark." : "") + "</p></div>" +
      '<div class="q-tiles"><div class="q-tile g"><b>' + c + '</b><span>Correct</span></div><div class="q-tile b"><b>' + w + '</b><span>Wrong or part</span></div><div class="q-tile s"><b>' + s + '</b><span>Unanswered</span></div><div class="q-tile"><b>' + self + "</b><span>To self-mark</span></div></div>" +
      (ids.length ? '<section class="q-topic q-nudge"><div class="q-gh"><h3>Tick the sessions you revised</h3></div><div class="q-list">' + ids.map(function (id) { return sessRow(id, true); }).join("") + "</div></section>" : "") +
      '<div class="q-filter" role="group" aria-label="Show"><button class="q-btn sm" data-f="all" aria-pressed="' + (R.filter === "all") + '">All ' + b.questions.length + '</button><button class="q-btn sm" data-f="wrong" aria-pressed="' + (R.filter === "wrong") + '">To revisit ' + (w + s) + "</button>" + (b.questions.some(function (q) { return q.type === "sa" || !q.type; }) ? '<button class="q-btn sm" data-f="self" aria-pressed="' + (R.filter === "self") + '">Short answers</button>' : "") + "</div>" +
      (show.length ? show.map(function (x) { return reviewHtml(x[0], x[1] + 1); }).join("") : '<div class="q-empty">Nothing here. Every question in this filter was right.</div>') +
      '</div></div><div class="q-ovfoot"><div class="in"><button class="q-btn" data-retry>Retry set</button><button class="q-btn pri" data-x2>Done</button></div></div>';
    function keep() { var y = $("q-rbody").scrollTop; renderResults(); $("q-rbody").scrollTop = y; }
    [].forEach.call(ov.querySelectorAll("[data-f]"), function (x) { x.onclick = function () { R.filter = x.dataset.f; renderResults(); }; });
    ov.querySelector("[data-x]").onclick = closeOv; ov.querySelector("[data-x2]").onclick = closeOv;
    var rt = ov.querySelector("[data-retry]");
    rt.onclick = function () { if (rt.dataset.c !== "1") { rt.dataset.c = "1"; rt.textContent = "Tap again to clear answers"; return; }
      b.questions.forEach(function (q) { delete S.a[q.id]; }); delete S.marked[b.key]; S.pos[b.key] = 0; save(); R = null; P = {key:b.key, i:0}; renderPlayer(); };
    [].forEach.call(ov.querySelectorAll("[data-score]"), function (x) { x.onclick = function () { A(x.dataset.score).score = +x.dataset.v; save(); keep(); }; });
    [].forEach.call(ov.querySelectorAll("[data-override]"), function (x) { x.onclick = function () { A(x.dataset.override).override = true; save(); keep(); }; });
    [].forEach.call(ov.querySelectorAll("[data-stick]"), function (x) { x.onchange = function () { var a = A(x.dataset.stick); a.ticks = a.ticks || {}; a.ticks[x.dataset.i] = x.checked; a.score = Object.keys(a.ticks).filter(function (k) { return a.ticks[k]; }).length; save(); }; });
    [].forEach.call(ov.querySelectorAll("[data-tick]"), function (x) { x.onchange = function () { tick(x.dataset.tick, x.checked); keep(); }; });
  }

  // ---------- tabs + events ----------
  var TABS = ["today", "plan", "practice", "progress"], curTab = "today";
  function updBadge() { var t = today(), n = Object.keys(SESS).filter(function (id) { return SESS[id].due < t && !done[id]; }).length, el = $("nav-od");
    el.hidden = !n; el.textContent = n > 99 ? "99+" : n; el.parentNode.setAttribute("aria-label", "Today" + (n ? ", " + n + " overdue" : "")); }
  window.qbOnTick = function () { updBadge(); logActivity(); };
  function refresh() {
    updBadge();
    if (curTab === "today") renderToday();
    else if (curTab === "practice") renderPractice();
    else if (curTab === "progress") renderProgress();
    else if (curTab === "plan" && planDirty) { planDirty = false; render(); }
  }
  function showTab(t) {
    curTab = t;
    TABS.forEach(function (k) { $("tab-" + k).hidden = k !== t; var b = document.querySelector('[data-tab="' + k + '"]'); b.setAttribute("aria-current", k === t ? "page" : "false"); });
    if (t === "plan") { planDirty = false; render(); if (typeof measureDeck === "function") measureDeck(); }
    refresh(); window.scrollTo(0, 0);
    try { sessionStorage.setItem("nicole-tab", t); } catch (e) {}
  }
  [].forEach.call(document.querySelectorAll("[data-tab]"), function (b) { b.onclick = function () { if (b.dataset.tab === curTab && curTab === "today") renderToday(today()); showTab(b.dataset.tab); }; });

  document.addEventListener("click", function (e) {
    var root = e.target.closest(".qb"); if (!root || root.id === "q-ov" || root.id === "q-sheet") return;
    var x;
    if ((x = e.target.closest("[data-open]"))) { openBlock(x.dataset.open); return; }
    if ((x = e.target.closest("[data-date]"))) { renderToday(x.dataset.date); return; }
    if ((x = e.target.closest("[data-today]"))) { renderToday(today()); return; }
    if ((x = e.target.closest("[data-wk]"))) { var tg = addDays(curDate, +x.dataset.wk), mon = addDays(tg, -((new Date(tg + "T12:00:00").getDay() + 6) % 7)), pick = null;
      for (var k = 0; k < 7 && !pick; k++) { var iso = addDays(mon, k), d = null; for (var i = 0; i < DATA.days.length; i++) if (DATA.days[i].date === iso) d = DATA.days[i]; if (d && d.blocks.length) pick = iso; }
      for (var k2 = 0; k2 < 7 && !pick; k2++) { var iso2 = addDays(mon, k2); if (dayFor(iso2).blocks || iso2 === today()) pick = iso2; }
      renderToday(pick || tg); return; }
    if ((x = e.target.closest("[data-od]"))) { S.odOpen = !S.odOpen; save(); renderToday(); return; }
    if ((x = e.target.closest("[data-theme]"))) { $("theme").click(); return; }
  });
  document.addEventListener("change", function (e) {
    var x = e.target; if (!x.matches || !x.matches("[data-tick]") || x.closest("#q-ov")) return;
    tick(x.dataset.tick, x.checked);
    var y = window.scrollY; refresh(); window.scrollTo(0, y);
  });
  document.addEventListener("keydown", function (e) {
    if (!$("q-sheet").hidden) { if (e.key === "Escape") $("q-sheet").hidden = true; return; }
    if (!P) { if (e.key === "Escape" && R) closeOv(); return; }
    var tag = (e.target.tagName || "").toLowerCase(); if (tag === "textarea" || tag === "input" || tag === "select") return;
    var b = BLOCKS[P.key];
    if (e.key === "ArrowRight" && P.i < b.questions.length - 1) { P.i++; renderPlayer(); }
    else if (e.key === "ArrowLeft" && P.i > 0) { P.i--; renderPlayer(); }
    else if (/^[1-5a-eA-E]$/.test(e.key)) { var k = /\d/.test(e.key) ? +e.key - 1 : "abcde".indexOf(e.key.toLowerCase()); var o = $("q-ov").querySelectorAll("[data-sba]")[k]; if (o) o.click(); }
    else if (e.key === "Escape") closeOv();
  });

  // date rollover: midnight, or reopening the app on another day
  var shownToday = today();
  function checkDate() { var t = today(); if (t === shownToday) return; var was = curDate === shownToday; shownToday = t; if (was) curDate = t; planDirty = true; if (!P && !R) refresh(); }
  setInterval(checkDate, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) checkDate(); });
  window.addEventListener("focus", checkDate);

  // backup: include question answers alongside ticks
  window.qbSnapshot = function () { return S; };
  window.qbRestore = function (q) { if (!q || typeof q !== "object") return 0; var n = 0;
    ["a","marked","days"].forEach(function (k) { var src = q[k] || {}; S[k] = S[k] || {}; Object.keys(src).forEach(function (id) { if (!(id in S[k])) { S[k][id] = src[id]; n++; } }); });
    save(); planDirty = true; refresh(); return n; };

  var start = "today"; try { start = sessionStorage.getItem("nicole-tab") || "today"; } catch (e) {}
  render(); // recolour Plan now that session states exist
  showTab(TABS.indexOf(start) >= 0 ? start : "today");
})();
