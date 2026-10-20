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

  // schedule.js has already applied her moves to DATA, so everything below reads the
  // real plan. resched() rebuilds the few maps whose order depends on dates.
  var SCH = window.QBSched;
  var BLOCKS = {};
  DATA.days.forEach(function (d) { d.blocks.forEach(function (b) { BLOCKS[b.key] = b; }); });
  var FIRST = DATA.days[0].date, LAST = DATA.days[DATA.days.length-1].date;
  var ITEM = {}; ALL.forEach(function (it) { ITEM[it.id] = it; });
  var SESS = DATA.sess; // tracker id -> {due, set}
  var SET_SESS = {};    // set id -> [tracker ids in plan order]
  function resched() {
    SET_SESS = {};
    Object.keys(SESS).sort(function (a, b) { return SESS[a].due < SESS[b].due ? -1 : SESS[a].due > SESS[b].due ? 1 : (a < b ? -1 : 1); })
      .forEach(function (id) { (SET_SESS[SESS[id].set] = SET_SESS[SESS[id].set] || []).push(id); });
    planDirty = true;
  }

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
    store(KEY, done); if (on) logActivity(); planDirty = true; updBadge();
  }

  // ---------- answers + marking ----------
  // ST is the answer store of an open daily mix or mistakes session; null means the sets' own answers.
  // It is only set while that session is on screen, so set scores never read or write it.
  var ST = null;
  function AS() { return ST || S.a; }
  function A(id) { var st = AS(); return st[id] || (st[id] = {}); }
  function answered(q) { var a = AS()[q.id]; if (!a) return false;
    if (q.type === "sba") return a.sel != null;
    if (q.type === "emq") return !!a.sel && Object.keys(a.sel).length > 0;
    if (q.type === "fill") return !!(a.text && a.text.trim());
    return !!a.text && Object.keys(a.text).some(function (k) { return a.text[k] && a.text[k].trim(); }); }
  function maxPts(q) { if (q.type === "emq") return q.items.length; if (q.type === "sa") return q.parts.reduce(function (x, p) { return x + (p.marks || 0); }, 0); if (!q.type) return q.checklist.length; return 1; }
  // marking rules live in mark.js; override is the student's own call (true = right, false = wrong)
  function fillMatch(q) { var a = AS()[q.id] || {};
    if (a.override === true || a.override === false) return {ok: a.override, you: true};
    return window.QBMark.match(a.text || "", [q.answer].concat(q.accept || [])); }
  function fillOk(q) { return fillMatch(q).ok; }
  function selfMarked(q) { return q.type === "sa" || !q.type; }
  function grade(q) { var a = AS()[q.id] || {}, mx = maxPts(q);
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
  function estMin(b) { return SCH.blockMin(b); }
  function logActivity() { var t = today(); S.days[t] = (S.days[t] || 0) + 1; save(); }

  // An earlier build saved every answer under the key "[object Object]" instead of the question id,
  // so sets marked with it scored as if nothing was answered. Drop that key and reopen those sets.
  var JUNK = "[object Object]";
  function repairLostAnswers() {
    if (!(JUNK in S.a)) return 0;
    delete S.a[JUNK];
    var n = 0;
    Object.keys(S.marked).forEach(function (k) { var b = BLOCKS[k]; if (!b || b.questions.some(answered)) return;
      delete S.marked[k]; S.pos[k] = 0; b.questions.forEach(function (q) { delete S.a[q.id]; }); n++; });
    save(); return n;
  }
  var repaired = repairLostAnswers();

  // ---------- common bits ----------
  var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>';
  function dayFor(iso) { for (var i = 0; i < DATA.days.length; i++) if (DATA.days[i].date === iso) return DATA.days[i];
    return {date:iso,kind:iso<FIRST?"before":"after",module:null,blocks:[]}; }
  function nextSetDay(iso) { for (var i = 0; i < DATA.days.length; i++) { var x = DATA.days[i].date;
    if (x > iso && SCH.hasWork(x) && !SCH.offByUser(x)) return DATA.days[i]; } return null; }
  // What this day is for. Her own changes come first: a day she marked off says so, and a
  // day whose work has been moved about is described by what is actually on it now.
  function dayLabel(d) {
    var work = d.blocks.length || SCH.sessOn(d.date).length;
    if (SCH.offByUser(d.date)) return work ? "Day off · work still on it" : "Day off";
    if (!work) return d.kind === "off" ? "Rest day" : d.kind === "before" ? "Before revision" : d.kind === "after" ? "After exams"
      : d.kind === "exam" ? "Exam day" : d.movedOut ? "Cleared · nothing left on it" : "Nothing scheduled";
    var mods = d.mods || [], one = mods.length === 1 ? mods[0] + " " : "";
    if (d.kind === "off") return "Rest day · " + one + "work moved in";
    var pre = one || "Mixed ";
    if (d.movedIn || d.movedOut) {
      var labs = {};
      d.blocks.forEach(function (b) { labs[b.label] = 1; });
      if (SCH.sessOn(d.date).length) labs["First pass"] = 1;
      var ks = Object.keys(labs);
      return pre + (ks.length === 1 ? ks[0].toLowerCase() : "revision");
    }
    if (d.module === "OSPE") return "OSPE walk-through";
    if (d.kind === "mixed") return d.date === "2026-11-06" ? "Mixed papers" : "Full mock";
    return d.module + (d.kind === "consolidation" ? " consolidation" : d.kind === "exam" ? " rapid recall" : " first pass"); }
  function dayMod(d) { var m = d.mods || []; return m.length === 1 ? m[0] : m.length ? "ALL" : (d.kind === "mixed" ? "ALL" : (d.module || "ALL")); }
  // How full a day is, as a bar and as words. Minutes are never shown: the questions are
  // measured but the revising isn't, so only the comparison between days is honest.
  function loadBar(iso, add) { var b = SCH.band(iso, add || 0); return '<span class="q-ld l-' + b.key + '"><i style="width:' + b.pct + '%"></i></span>'; }
  function loadWord(iso, add) { return SCH.band(iso, add || 0).label; }
  function loadShort(iso, add) { return SCH.band(iso, add || 0).short; }
  function unitSize(u) {
    if (u.kind !== "topic") return u.kind === "ospe" ? "every station" : "the whole paper";
    var bits = [];
    if (u.sess.length) bits.push(u.sess.length + (u.sess.length === 1 ? " session" : " sessions"));
    if (u.blocks.length) bits.push("questions");
    return bits.join(" + ");
  }

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
  // Streak: consecutive days with something done. Timetabled rest days pause it: they neither add a day
  // nor break the run, even if work is done on them. Today only counts once something is done.
  function isRest(iso) { return SCH.isRestDay(iso); }
  function streakDays() {
    var t = today(), n = 0;
    for (var j = 0; j < 400; j++) { var d = addDays(t, -j);
      if (isRest(d)) continue;
      if (S.days[d]) n++; else if (j === 0) continue; else break; }
    return n;
  }
  function heroHtml() {
    var ticked = Object.keys(done).length, sets = 0, setsDone = 0, pts = 0, max = 0;
    Object.keys(BLOCKS).forEach(function (k) { var i = blockInfo(BLOCKS[k]); sets++; if (i.marked) { setsDone++; pts += i.pts; max += i.max; } });
    var pct = max ? Math.round(100 * pts / max) : 0, t = today(), dots = "", streak = 0;
    for (var k = 6; k >= 0; k--) { var iso = addDays(t, -k), f = fmt(iso), rest = isRest(iso);
      dots += '<span class="' + (rest ? "rest" : S.days[iso] ? "on" : "") + (k === 0 ? " today" : "") + '" title="' + f.long + (rest ? " · rest day" : "") + '">' + f.w[0] + "</span>"; }
    streak = streakDays();
    var restToday = isRest(t), ownOff = SCH.offByUser(t);
    return '<div class="q-hero"><div><div class="q-big">' + streak + " day" + (streak === 1 ? "" : "s") + '</div><div class="q-lbl">' + (restToday ? '<span class="q-paused">Streak paused, today is ' + (ownOff ? "a day off" : "for resting") + "</span> · " : "practice streak · ") + ticked + " of " + ALL.length + " sessions ticked · " + setsDone + " of " + sets + ' question sets marked</div><div class="q-streak" aria-label="Days practised this week">' + dots + "</div></div>" +
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
    var tops = {}; ids.forEach(function (id) { tops[SESS[id].set] = 1; });
    var nt = Object.keys(tops).length;
    return '<section class="q-group q-overdue"><div class="q-gh"><h3>Overdue</h3><span class="q-n bad">' + ids.length + '</span><span class="q-gs">Sessions from earlier days not yet ticked</span></div><div class="q-list">' +
      shown.map(function (id) { return sessRow(id, true); }).join("") + "</div>" +
      (ids.length > 5 ? '<button class="q-more" data-od>' + (open ? "Show fewer" : "Show all " + ids.length) + "</button>" : "") +
      '<div class="q-row"><button class="q-btn pri sm" data-odmove>Find days for ' + (nt === 1 ? "this topic" : "these " + nt + " topics") + '</button></div>' +
      '<p class="q-hint3">Nothing here is lost. Give them days with room and they stop being late.</p></section>';
  }
  // ---------- day overview: what this day asks for, how much is done, what to do next ----------
  var EXAM_START = (DATA.days.filter(function (d) { return d.kind === "exam"; })[0] || {}).date;
  function daysBetween(a, b) { return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5); }
  function todoRow(state, title, sub, attr) {
    var icon = state === "done" ? CHECK : state === "bad" ? "!" : "";
    return '<button class="q-todo is-' + state + '" ' + attr + '><span class="q-tick" aria-hidden="true">' + icon + '</span><span class="q-tdt"><b>' + title + "</b><small>" + sub + "</small></span>" +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>';
  }
  function dayOverviewHtml(d, iso, units) {
    var t = today(), isToday = iso === t;
    if (SCH.offByUser(iso)) {
      var left = units.filter(function (u) { return !u.pinned; });
      return '<section class="q-day q-dayoff"><div class="q-dayhd"><h2>' + (isToday ? "Today is a day off" : "A day off") + "</h2></div>" +
        '<p class="q-alldone">Nothing is expected of you. Your streak holds through it: a day off never breaks the run, and never adds a day to it.</p>' +
        (left.length ? '<div class="q-todos">' + todoRow("todo", "Still on this day: " + left.length + (left.length === 1 ? " topic" : " topics"),
          "Move them to days that suit you", 'data-moveday="' + iso + '"') + "</div>" : "") +
        '<div class="q-row"><button class="q-btn sm" data-dayoff="' + iso + '">Make it a working day again</button></div></section>';
    }
    var ids = SCH.sessOn(iso).slice();
    var ticked = ids.filter(function (id) { return done[id]; }).length;
    var order = d.blocks.filter(function (b) { return b.kind === "set" && b.label === "First pass"; });
    order = order.concat(d.blocks.filter(function (b) { return order.indexOf(b) < 0; }));
    var infos = order.map(blockInfo), marked = 0, mins = 0, pending = 0, next = null, selfNext = null;
    order.forEach(function (b, k) { var i = infos[k];
      if (i.marked) { marked++; pending += i.pending; if (i.pending && !selfNext) selfNext = b; }
      else { mins += estMin(b); if (!next) next = b; } });
    var od = isToday ? Object.keys(SESS).filter(function (id) { return SESS[id].due < t && !done[id]; }).length : 0;
    var total = ids.length + order.length;
    if (!total && !od) return "";
    var finished = ticked + marked, pct = total ? Math.round(100 * finished / total) : 100;
    var unit = function (n, one, many) { return n + " " + (n === 1 ? one : many); };

    var bnd = SCH.band(iso), hot = bnd.key === "busy" || bnd.key === "heavy";
    var movable = units.filter(function (u) { return !u.pinned; }).length;
    var loadRow = '<div class="q-dayload' + (hot ? " hot" : "") + '"><span class="q-ldt">' + (isToday ? "Today is " : "This day is ") + bnd.label + "</span>" + loadBar(iso) +
      (hot && movable ? '<button class="q-btn sm" data-moveday="' + iso + '">Lighten it</button>' : "") + "</div>";

    var rows = "";
    if (ids.length) rows += todoRow(ticked === ids.length ? "done" : "todo", "Revise " + unit(ids.length, "session", "sessions"), ticked + " of " + ids.length + " ticked", 'data-goto=".q-topic"');
    if (order.length) rows += todoRow(marked === order.length ? "done" : "todo", "Answer and mark " + unit(order.length, "question set", "question sets"),
      marked + " of " + order.length + " marked" + (mins ? " · about " + mins + " min left" : ""), next ? 'data-open="' + next.key + '"' : 'data-goto=".q-setbtn"');
    if (pending) rows += todoRow("todo", "Mark " + unit(pending, "short answer", "short answers") + " yourself", "Against the mark scheme, in the set's results", 'data-open="' + selfNext.key + '"');
    if (od) rows += todoRow("bad", "Catch up " + unit(od, "overdue session", "overdue sessions"), "From earlier days, not yet ticked", 'data-goto=".q-overdue"');

    var cta;
    if (next) { var ni = blockInfo(next);
      cta = '<button class="q-btn pri q-next" data-open="' + next.key + '">' + (ni.ans ? "Continue" : "Next up") + ": " + esc(next.title) + (ni.ans ? " · " + ni.ans + "/" + ni.n : "") + "</button>"; }
    else if (selfNext) cta = '<button class="q-btn pri q-next" data-open="' + selfNext.key + '">Mark your short answers: ' + esc(selfNext.title) + "</button>";
    else if (finished === total && total) {
      var nx = nextSetDay(iso);
      cta = '<p class="q-alldone">' + (od ? "Today's sessions and sets are done. Next: catch up the overdue sessions."
        : (isToday ? "All done for today." : "Everything for this day is done.") + (nx ? " Next: " + fmt(nx.date).long + " · " + esc(dayLabel(nx)) + "." : "")) + "</p>";
    } else cta = "";

    var exam = EXAM_START && EXAM_START >= iso ? daysBetween(iso, EXAM_START) : null;
    var countdown = exam == null ? "" : exam === 0 ? "Exam week starts today" : unit(exam, "day", "days") + " to exam week";
    return '<section class="q-day"><div class="q-dayhd"><h2>' + (isToday ? "Your day" : "This day's plan") + '</h2><span class="q-daypct">' + (total ? finished + " of " + total + " done" : "") + "</span></div>" +
      (total ? '<div class="q-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Day progress"><i style="width:' + pct + '%"></i></div>' : "") +
      loadRow + '<div class="q-todos">' + rows + "</div>" + cta + (countdown ? '<p class="q-count2">' + countdown + "</p>" : "") + "</section>";
  }

  function renderToday(date) {
    curDate = date || curDate || today();
    var d = dayFor(curDate), f = fmt(curDate), t = today(), units = SCH.unitsOn(curDate);
    var h = '<header class="q-head"><div><p class="q-eyebrow">' + (curDate === t ? "Today" : curDate < t ? "Earlier" : "Coming up") + '</p><h1>' + f.long + '</h1></div><button class="q-icon" data-settings aria-label="Settings"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg></button></header>';
    h += dayOverviewHtml(d, curDate, units) + rescueHtml() + heroHtml() + weekHtml(curDate);
    if (curDate === t) h += overdueHtml();
    h += dayHeadHtml(d, curDate, units);
    var first = units.filter(function (u) { return u.round === 1; });
    var others = units.filter(function (u) { return u.round !== 1; });
    if (!units.length) {
      var nx = nextSetDay(curDate);
      var msg = SCH.offByUser(curDate) ? "A day off. Nothing scheduled." : d.kind === "before" ? "Revision hasn't started yet." : d.kind === "after" ? "Exams are finished. Everything is still under Plan and Practice." : d.kind === "off" ? "Rest day. Nothing scheduled." : d.kind === "exam" ? "Exam day. Light recall only; yesterday's rapid-recall sets cover it." : d.movedOut ? "You moved this day's work to other days." : "Nothing scheduled.";
      h += '<div class="q-empty">' + msg + (nx ? '<div><button class="q-btn sm mod-' + dayMod(nx) + '" data-date="' + nx.date + '">Next: ' + fmt(nx.date).long + " · " + esc(dayLabel(nx)) + " →</button></div>" : "") + "</div>";
    }
    if (first.length) {
      var ns = first.reduce(function (x, u) { return x + u.sess.length; }, 0);
      var nt = first.reduce(function (x, u) { return x + u.sess.filter(function (id) { return done[id]; }).length; }, 0);
      h += '<p class="q-sum">' + (ns ? "Revise these " + ns + " sessions (" + nt + " ticked), then answer each topic's questions and mark them."
        : "Questions on topics whose sessions sit on other days.") + "</p>";
      first.forEach(function (u) { h += unitSection(u); });
    }
    if (others.length) {
      h += '<p class="q-sum">' + (first.length ? "Also on this day:" : d.kind === "consolidation" ? "Consolidation day: fresh questions on topics you've already covered." : d.kind === "exam" ? "Rapid recall before the exam." : "Practice papers. Answer the whole paper, then mark it.") + "</p>";
      h += '<div class="q-cards">' + others.map(function (u) {
        var b = u.blocks.length ? BLOCKS[u.blocks[0]] : null;
        return '<div class="q-topic mod-' + u.module + '"><div class="q-gh q-gh-t">' + modTag(u) + moveBtn(u) +
          "<h3>" + esc(u.title) + "</h3></div>" + movedNote(u) + (b ? setButton(b) : "") + "</div>";
      }).join("") + "</div>";
    }
    $("tab-today-in").innerHTML = h;
  }

  // ---------- moving work to another day ----------
  // One flow does all of it: a single topic, a whole day, or the overdue pile. Each thing
  // she can pick up is a "unit" (schedule.js builds them), the recommendation comes back
  // as one or two days per unit, and she can overrule any of it before anything moves.
  function moveBtn(u) {
    if (u.pinned) return "";
    return '<button class="q-move" data-move="' + u.id + '" data-mday="' + u.from + '" aria-label="Move ' + esc(u.title) + ' to another day">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M4 12h6M4 17h6M14 13l4 4-4 4M18 17H9"/></svg>Move</button>';
  }
  function movedNote(u) {
    if (!u.moved) return "";
    return '<p class="q-movedfrom">Moved here from ' + SCH.fmtShort(u.home) + ' · <button class="q-link2" data-putback="' + u.id + '" data-mday="' + u.from + '">put it back</button></p>';
  }
  function modTag(u) { return u.module ? '<span class="q-mtag">' + esc(u.module) + "</span>" : ""; }
  function unitSection(u) {
    var ids = u.sess, dn = ids.filter(function (id) { return done[id]; }).length;
    var b = u.blocks.length ? BLOCKS[u.blocks[0]] : null;
    var away = (SET_SESS[u.sid] || []).filter(function (id) { return SESS[id].due !== u.from; });
    var h = '<section class="q-topic mod-' + u.module + '"><div class="q-gh q-gh-t">' + modTag(u) +
      (ids.length ? '<span class="q-n">' + dn + "/" + ids.length + "</span>" : "") + moveBtn(u) +
      "<h3>" + esc(u.title) + "</h3></div>" + movedNote(u);
    if (ids.length) h += '<div class="q-list">' + ids.map(function (id) { return sessRow(id, false); }).join("") + "</div>";
    if (away.length) {
      var ds = {};
      away.forEach(function (id) { ds[SESS[id].due] = (ds[SESS[id].due] || 0) + 1; });
      h += '<p class="q-elsewhere">' + Object.keys(ds).sort().map(function (iso) {
        return ds[iso] + (ds[iso] === 1 ? " session is" : " sessions are") + ' on <button class="q-link2" data-date="' + iso + '">' + SCH.fmtShort(iso) + "</button>";
      }).join(", ") + ".</p>";
    }
    if (b) h += setButton(b);
    else { var qd = SCH.dayOfBlock(u.sid + "-R1");
      h += '<p class="q-elsewhere">Its questions are on <button class="q-link2" data-date="' + qd + '">' + SCH.fmtShort(qd) + "</button>.</p>"; }
    return h + "</section>";
  }
  function dayHeadHtml(d, iso, units) {
    var t = today(), movable = units.filter(function (u) { return !u.pinned; }).length;
    var inPlan = iso >= FIRST && iso <= LAST, offable = inPlan && d.kind !== "exam";
    return '<div class="q-dayhead mod-' + dayMod(d) + '"><span class="q-chip">' + esc(dayLabel(d)) + "</span>" +
      (iso !== t ? '<button class="q-btn sm" data-today>Back to today</button>' : "") + '<span class="q-spacer"></span>' +
      (movable ? '<button class="q-btn sm" data-moveday="' + iso + '">Move this day’s work</button>' : "") +
      (offable ? '<button class="q-btn sm' + (SCH.offByUser(iso) ? " ok" : "") + '" data-dayoff="' + iso + '">' + (SCH.offByUser(iso) ? "Working day" : "Day off") + "</button>" : "") +
      "</div>";
  }
  // The streak rescue. A working day with nothing ticked ends the run; if that day was
  // really a day off, saying so keeps the run — and never adds a day to it.
  function rescueHtml() {
    if (curDate !== today()) return "";
    var r = SCH.missedDays(S.days);
    if (!r) return "";
    var key = r.dates.join(",");
    if (S.rescueX === key) return "";
    var names = r.dates.map(function (iso) { var f = fmt(iso); return f.w + " " + f.d + " " + f.m; });
    var one = r.dates.length === 1;
    return '<section class="q-rescue"><b>Your ' + r.had + "-day run stopped at " + names[0] + "</b>" +
      "<p>Nothing was ticked on " + names.join(", ") + ", so the count started again. If " + (one ? "that was a day off" : "those were days off") +
      ", say so and the run carries on. Marking a day off keeps the run but never adds a day to it.</p>" +
      '<div class="q-row"><button class="q-btn pri sm" data-rescue="' + key + '">' + (one ? "It was a day off" : "They were days off") + "</button>" +
      '<button class="q-btn sm" data-rescuex="' + key + '">Leave it</button></div></section>';
  }
  function findUnit(id, day) {
    var us = id.indexOf("O:") === 0 ? SCH.overdueUnits(done) : SCH.unitsOn(day || curDate);
    for (var i = 0; i < us.length; i++) if (us[i].id === id) return us[i];
    return null;
  }
  function afterChange(msg, before) {
    resched(); refresh();
    toast(msg, 6000, {label: "Undo", fn: function () { SCH.undo(before); resched(); refresh(); toast("Put back."); }});
  }

  var MV = null;   // the move sheet: {units, A (unit id -> parts), day, rest, off, custom}
  function openMove(units, opts) {
    units = (units || []).filter(function (u) { return !u.pinned; });
    if (!units.length) { toast("There is nothing here that can be moved."); return; }
    opts = opts || {};
    MV = {units: units, day: opts.day || null, head: opts.head || null, base: opts.base || null,
      rest: true, off: !!opts.day && !SCH.offByUser(opts.day), custom: {}};
    replan(); renderMove();
  }
  function replan() {
    var extra = {}, auto = [];
    MV.units.forEach(function (u) {
      var c = MV.custom[u.id];
      if (c) c.forEach(function (p) { extra[p.date] = (extra[p.date] || 0) + p.mins; });
      else auto.push(u);
    });
    var A = SCH.plan(auto, {rest: MV.rest, extra: extra});
    MV.units.forEach(function (u) { if (MV.custom[u.id]) A[u.id] = MV.custom[u.id]; });
    MV.A = A;
  }
  function partWord(p) {
    var bits = [];
    if (p.sess.length) bits.push(p.sess.length + (p.sess.length === 1 ? " session" : " sessions"));
    if (p.blocks.length) bits.push("questions");
    return bits.join(" + ");
  }
  function renderMove() {
    var day = MV.day, f = day ? fmt(day) : null;
    var head = MV.head || (day ? "Move " + f.long : "Move " + MV.units[0].title);
    var after = {}, usesRest = false, stuck = 0;
    MV.units.forEach(function (u) {
      var parts = MV.A[u.id] || [];
      if (!parts.length) stuck++;
      parts.forEach(function (p) { after[p.date] = (after[p.date] || 0) + p.mins; if (SCH.dayKind(p.date) === "off") usesRest = true; });
    });
    var dates = Object.keys(after).sort();
    var rows = MV.units.map(function (u) {
      var parts = MV.A[u.id] || [];
      return '<div class="q-mv"><div class="q-mvt"><b>' + esc(u.title) + "</b><small>" + (u.label ? esc(u.label) + " · " : "") + unitSize(u) +
        " · by " + SCH.fmtShort(u.max) + " (" + u.why + ")</small></div>" +
        '<button class="q-mvto" data-pick="' + u.id + '">' +
        (parts.length ? parts.map(function (p) {
          return '<span class="p"><span class="d">' + SCH.fmtShort(p.date) + '</span><span class="n">' + partWord(p) +
            (SCH.dayKind(p.date) === "off" ? " · rest day" : "") + "</span></span>";
        }).join('<span class="plus">then</span>') : '<span class="p"><span class="d bad">No room before ' + SCH.fmtShort(u.max) + '</span><span class="n">pick a day yourself</span></span>') +
        '<span class="q-mvch">Change</span></button></div>';
    }).join("");
    var toggles = '<label class="q-row-t"><span><b>Use my rest days</b><small>' +
      (usesRest ? "A rest day is being used. Turn this off to keep them free — the work then lands closer to the exams."
        : "Rest days are being kept free.") + '</small></span><input type="checkbox" class="q-switch on-accent" data-rest' + (MV.rest ? " checked" : "") + "></label>" +
      (day ? '<label class="q-row-t"><span><b>Mark ' + f.w + " " + f.d + " " + f.m + ' as a day off</b><small>Your streak holds through it. It will not add a day to the streak.</small></span>' +
        '<input type="checkbox" class="q-switch on-accent" data-off' + (MV.off ? " checked" : "") + "></label>" : "");
    var preview = dates.length ? '<div class="q-sub">How those days end up</div><div class="q-after">' + dates.map(function (iso) {
      return '<div class="q-aft"><span class="d">' + SCH.fmtShort(iso) + "</span>" + loadBar(iso, after[iso]) + '<span class="w">' + loadShort(iso, after[iso]) + "</span></div>";
    }).join("") + "</div>" : "";
    var n = MV.units.length - stuck;
    var sh = sheet("<h3>" + esc(head) + "</h3><p>" + (day ? (MV.units.length === 1 ? "One topic" : MV.units.length + " topics") + " to re-home. "
      : "") + "Every day is checked against its deadline, and nothing is dropped on a day that is already full.</p>" +
      '<div class="q-mvlist">' + rows + "</div>" + toggles + preview +
      '<div class="q-row"><button class="q-btn wide" data-close>Cancel</button><button class="q-btn pri wide" data-go' + (n ? "" : " disabled") + ">" +
      (n ? "Move " + n + (n === 1 ? " topic" : " topics") : "Nothing to move") + "</button></div>", day ? dayMod(dayFor(day)) : MV.units[0].module);
    sh.querySelector("[data-close]").onclick = function () { sh.hidden = true; MV = null; };
    sh.querySelector("[data-go]").onclick = doMove;
    sh.querySelector("[data-rest]").onchange = function () { MV.rest = this.checked; replan(); renderMove(); };
    var off = sh.querySelector("[data-off]");
    if (off) off.onchange = function () { MV.off = this.checked; };
    [].forEach.call(sh.querySelectorAll("[data-pick]"), function (x) {
      x.onclick = function () { var u = null;
        MV.units.forEach(function (y) { if (y.id === x.dataset.pick) u = y; });
        if (u) renderPick(u); };
    });
  }
  function weekOf(iso) { return SCH.addDays(iso, -((new Date(iso + "T12:00:00").getDay() + 6) % 7)); }
  function renderPick(u) {
    var rec = SCH.bestDays(u, 3, {rest: MV.rest}), parts = SCH.plan([u], {rest: MV.rest})[u.id] || [];
    var byWeek = {}, order = [];
    SCH.options(u).forEach(function (o) {
      var mon = weekOf(o.date);
      if (!byWeek[mon]) { byWeek[mon] = []; order.push(mon); }
      byWeek[mon].push(o);
    });
    var h = "<h3>Which day?</h3><p>" + esc(u.title) + " · " + unitSize(u) + ". Needs to be done by <b>" + SCH.fmtShort(u.max) + "</b> (" + u.why + ").</p>";
    if (rec.length) h += '<div class="q-sub">Suggested</div><div class="q-chips2">' + rec.map(function (iso) {
      return '<button class="q-chipday" data-day="' + iso + '"><b>' + SCH.fmtShort(iso) + "</b><small>" + loadWord(iso, u.mins) + "</small></button>";
    }).join("") + "</div>";
    if (parts.length > 1) h += '<div class="q-row"><button class="q-btn sm" data-split>Split it: ' + parts.map(function (p) { return partWord(p) + " on " + SCH.fmtShort(p.date); }).join(", then ") + "</button></div>";
    h += '<div class="q-sub">Any day · how full it would then be</div><div class="q-days">';
    order.forEach(function (mon) {
      h += '<div class="q-dwk">' + (mon === weekOf(today()) ? "This week" : "Week of " + SCH.fmtShort(mon)) + "</div>";
      byWeek[mon].forEach(function (o) {
        var note = o.off ? "day off" : o.exam ? "exam day" : o.here ? "where it is now" : o.rest ? "rest day" : (SCH.dayKindLabel(o.date) || "");
        h += '<button class="q-dayopt" data-day="' + o.date + '"' + (o.blocked || o.here ? " disabled" : "") + '><span class="d">' + SCH.fmtShort(o.date) +
          (o.date === today() ? " · today" : "") + '</span><span class="t">' + note + "</span>" +
          (o.blocked ? '<span class="q-ld"></span><span class="w">—</span>' : loadBar(o.date, u.mins) + '<span class="w">' + loadShort(o.date, u.mins) + "</span>") + "</button>";
      });
    });
    h += '</div><div class="q-row"><button class="q-btn wide" data-back>Back</button></div>';
    var sh = sheet(h, u.module);
    sh.querySelector("[data-back]").onclick = renderMove;
    var sp = sh.querySelector("[data-split]");
    if (sp) sp.onclick = function () { delete MV.custom[u.id]; replan(); renderMove(); };
    [].forEach.call(sh.querySelectorAll("[data-day]"), function (x) {
      x.onclick = function () {
        MV.custom[u.id] = [{date: x.dataset.day, sess: u.sess, blocks: u.blocks, mins: u.mins}];
        replan(); renderMove();
      };
    });
  }
  function doMove() {
    var moves = [], n = 0;
    MV.units.forEach(function (u) {
      var parts = MV.A[u.id] || [];
      if (!parts.length) return;
      parts.forEach(function (p) { moves.push({sess: p.sess, blocks: p.blocks, to: p.date}); });
      n++;
    });
    var day = MV.day, off = day && MV.off, base = MV.base;
    var before = SCH.move(moves);
    if (base) before = base;                       // undo must also take back the day off
    if (off && !SCH.offByUser(day)) SCH.setOff(day, true);
    $("q-sheet").hidden = true; MV = null;
    resched(); refresh();
    toast("Moved " + n + (n === 1 ? " topic" : " topics") + (off ? ", and that day is marked off" : "") + ".", 7000,
      {label: "Undo", fn: function () { SCH.undo(before); resched(); refresh(); toast("Put back where it was."); }});
  }
  function putBackUnit(id, day) {
    var u = findUnit(id, day);
    if (!u) return;
    afterChange("Back on " + SCH.fmtShort(u.home) + ".", SCH.putBack([u]));
  }
  function dayOffFlow(iso) {
    if (SCH.offByUser(iso)) { afterChange("Back to a working day.", SCH.setOff(iso, false)); return; }
    var units = SCH.unitsOn(iso).filter(function (u) { return !u.pinned; }), f = fmt(iso);
    var sh = sheet("<h3>Mark " + f.long + " as a day off?</h3>" +
      "<p>Your streak holds through a day off: it will not break, and it will not add a day either. You can take it back whenever you like.</p>" +
      (units.length ? "<p><b>" + units.length + (units.length === 1 ? " topic is" : " topics are") + " still on this day.</b> Moving that work is the point of a day off — left here it only turns red.</p>" : "") +
      (units.length ? '<div class="q-row"><button class="q-btn pri wide" data-both>Mark it off and move the work</button></div>' : "") +
      '<div class="q-row"><button class="q-btn wide" data-close>Cancel</button><button class="q-btn wide' + (units.length ? "" : " pri") + '" data-just>' +
      (units.length ? "Just mark it off" : "Mark it off") + "</button></div>", dayMod(dayFor(iso)));
    sh.querySelector("[data-close]").onclick = function () { sh.hidden = true; };
    sh.querySelector("[data-just]").onclick = function () { sh.hidden = true; afterChange("Marked as a day off.", SCH.setOff(iso, true)); };
    var both = sh.querySelector("[data-both]");
    if (both) both.onclick = function () {
      var base = SCH.setOff(iso, true); resched();
      openMove(SCH.unitsOn(iso), {day: iso, base: base, head: "Where should " + f.long + "’s work go?"});
    };
  }

  // ---------- PRACTICE ----------
  // Every question set on one page: the original Practice tab. It is now "All question sets" in the
  // hub, and the whole tab again when Classic Practice list is on in Settings. head replaces its header.
  function allSetsHtml(head) {
    var byMod = {ENI:[], GIL:[], URO:[]}, h = '<header class="q-head"><div><p class="q-eyebrow">Practice</p><h1>Every question set</h1></div><button class="q-icon" data-settings aria-label="Settings"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg></button></header>';
    if (head != null) h = head;
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
    return h;
  }
  // Practice hub: one next step, then the modules as coloured paths, then papers and the full list.
  // Read-only: it shows the saved answers and marks and opens sets with openBlock(), nothing else.
  var CLASSIC = "nicole-revision-classic";
  function classicPractice() { try { return localStorage.getItem(CLASSIC) === "1"; } catch (e) { return false; } }
  function setClassicPractice(on) { try { if (on) localStorage.setItem(CLASSIC, "1"); else localStorage.removeItem(CLASSIC); } catch (e) {} }
  var GEAR = '<button class="q-icon" data-settings aria-label="Settings"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg></button>';
  var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/></svg>';
  var TICK = '<svg viewBox="0 0 24 24" aria-hidden="true" class="ck"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var BACK = '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>';
  var MORE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  var ROUND = ["", "First pass", "Consolidation", "Rapid recall"];
  var PV = {v: "hub", mod: null}; // which hub screen is showing; mod null = where she is now

  // Where each block sits in the plan now, after any moves she has made.
  function whenOf() { var w = {}; DATA.days.forEach(function (d) { d.blocks.forEach(function (b) { w[b.key] = d.date; }); }); return w; }
  function roundsOf(sid, when) { return DATA.sets[sid].rounds.map(function (r) { return BLOCKS[sid + "-R" + r[1]]; }).filter(Boolean)
    .sort(function (a, b) { return when[a.key] < when[b.key] ? -1 : when[a.key] > when[b.key] ? 1 : 0; }); }
  function topicsOf(m, when) {
    return Object.keys(DATA.sets).filter(function (sid) { return DATA.sets[sid].module === m; }).map(function (sid) { return {sid: sid, rounds: roundsOf(sid, when)}; })
      .filter(function (t) { return t.rounds.length; })
      .sort(function (a, b) { var x = when[a.rounds[0].key], y = when[b.rounds[0].key]; return x < y ? -1 : x > y ? 1 : (a.sid < b.sid ? -1 : 1); });
  }
  // The earliest set not yet marked, in plan order; first passes go before the rest of a day, as on Today.
  function whenLabel(iso) { var t = today(), f = fmt(iso); return iso === t ? "Today" : (iso < t ? "Overdue · " : "") + f.w + " " + f.d + " " + f.m; }
  function weakSets() { return Object.keys(BLOCKS).map(function (k) { return [BLOCKS[k], blockInfo(BLOCKS[k])]; })
    .filter(function (p) { return p[1].marked && p[1].pct != null && p[1].pct < 60; }).sort(function (a, b) { return a[1].pct - b[1].pct; }); }
  function subHead(title, eyebrow) {
    return '<header class="ph-sub"><button class="q-icon" data-pv="hub" aria-label="Back to Practice">' + BACK + '</button><div><p class="q-eyebrow">' + eyebrow + "</p><h1>" + title + "</h1></div></header>";
  }

  // A topic is its revision sessions (the same ticks as Today and Plan) and then its question rounds.
  // Its next step is whichever unfinished item is due first; on a tie, revising comes before questions.
  function topicState(t, when) {
    var ids = SET_SESS[t.sid] || [], ticked = ids.filter(function (id) { return done[id]; }).length;
    var mk = t.rounds.filter(function (b) { return S.marked[b.key]; }).length, nextS = null, nextR = null;
    ids.forEach(function (id) { if (!done[id] && (!nextS || SESS[id].due < nextS)) nextS = SESS[id].due; });
    t.rounds.forEach(function (b) { if (!nextR && !S.marked[b.key]) nextR = b; });
    var step = nextS && (!nextR || nextS <= when[nextR.key]) ? {kind: "tick", date: nextS} : nextR ? {kind: "round", b: nextR, date: when[nextR.key]} : null;
    return {ids: ids, ticked: ticked, mk: mk, nextR: nextR, step: step, started: ticked > 0 || mk > 0, all: ticked === ids.length && mk === t.rounds.length,
      rp: ids.length ? Math.round(100 * ticked / ids.length) : 100};
  }
  // The module whose next step is due first, so the tab opens where she is.
  function curModule() {
    var when = whenOf(), best = null, bm = "GIL";
    ["GIL","URO","ENI"].forEach(function (m) { topicsOf(m, when).forEach(function (t) { var s = topicState(t, when).step;
      if (s && (!best || s.date < best)) { best = s.date; bm = m; } }); });
    return bm;
  }
  function shortBtn(attrs, label, icon, badge) {
    return '<button class="ph-sc" ' + attrs + ' aria-label="' + label + (badge ? ", " + badge : "") + '"><span class="ph-sci">' + icon + "</span>" +
      (badge ? '<span class="ph-badge">' + (badge > 99 ? "99+" : badge) + "</span>" : "") + '<small aria-hidden="true">' + label + "</small></button>";
  }

  function hubHtml() {
    if (!PV.mod) PV.mod = curModule();
    var n = streakDays(), h = '<header class="q-head"><div><p class="q-eyebrow">Practice</p><h1>Practice</h1></div><div class="ph-hr">' +
      (n ? '<span class="ph-streak" aria-label="' + n + ' day streak"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-4-1-6 1-9.5z"/></svg>' + n + "</span>" : "") + GEAR + "</div></header>";
    h += mixCard() + '<div class="ph-short">' +
      shortBtn('data-pv="mist"', "Mistakes", '<svg viewBox="0 0 24 24" aria-hidden="true" class="bad"><path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/></svg>', mistakes().length) +
      shortBtn('data-pv="weak"', "Another pass", '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9M12 19V5M19 19v-7"/></svg>', weakSets().length) +
      shortBtn('data-pv="exam"', "Exams", '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v4a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 12v4M8 20h8"/></svg>', 0) +
      shortBtn('data-pv="all"', "All sets", '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>', 0) + "</div>";
    return h + pathHtml(PV.mod);
  }

  function pathHtml(m) {
    var when = whenOf(), ts = topicsOf(m, when), sts = ts.map(function (t) { return topicState(t, when); }), cur = -1, started = 0, wk = null;
    sts.forEach(function (s, k) { if (s.started) started++; if (s.step && (cur < 0 || s.step.date < sts[cur].step.date)) cur = k; });
    var h = '<div class="ph-stick"><div class="ph-pills" role="group" aria-label="Module">' +
      ["GIL","URO","ENI"].map(function (x) { return '<button class="ph-pill mod-' + x + '" data-pm="' + x + '" aria-pressed="' + (x === m) + '">' + x + "</button>"; }).join("") + "</div>" +
      '<div class="ph-banner mod-' + m + '"><p class="q-eyebrow">' + started + " of " + ts.length + " topics started</p><h2>" + MOD[m] + "</h2></div></div>";
    var XS = [0, -56, -84, -56, 0, 56, 84, 56];
    h += '<div class="ph-path mod-' + m + '">';
    ts.forEach(function (t, k) {
      var first = when[t.rounds[0].key], x = new Date(first + "T12:00:00"), mon = addDays(first, -((x.getDay() + 6) % 7));
      if (mon !== wk) { wk = mon; var f = fmt(mon); h += '<div class="ph-wk">Week of ' + f.d + " " + f.m + "</div>"; }
      var s = sts[k], isCur = k === cur, off = XS[k % XS.length], name = DATA.sets[t.sid].name;
      var bub = !isCur ? "" : s.step.kind === "tick" ? (s.ids.length - s.ticked) + " TO TICK" : blockInfo(s.step.b).ans ? "CONTINUE" : "START";
      var stars = t.rounds.map(function (b) { return '<i class="' + (S.marked[b.key] ? "on" : "") + '">' + STAR + "</i>"; }).join("");
      h += '<div class="ph-step' + (isCur ? " cur" : "") + '" style="--x:' + off + 'px"><span class="ph-ringo" style="--rp:' + s.rp + '" aria-hidden="true"></span>' +
        '<button class="ph-node' + (s.started ? " s-on" : "") + (isCur ? " cur" : "") + '" data-topic="' + t.sid + '" aria-label="' + esc(name) + ", " + s.ticked + " of " + s.ids.length + " sessions ticked, " + s.mk + " of " + t.rounds.length + ' rounds marked">' +
        (bub ? '<span class="ph-bub">' + bub + "</span>" : "") + (s.all ? TICK : STAR) + '</button><span class="ph-stars">' + stars + "</span>" +
        '<span class="ph-name ' + (off > 0 ? "l" : "r") + '">' + esc(name) + "</span></div>";
    });
    return h + "</div>";
  }

  function examHtml() {
    var h = subHead("Papers, mocks and OSPE", "Exam practice") + '<div class="q-cards">';
    DATA.days.forEach(function (d) { d.blocks.forEach(function (b) { if (b.kind === "set") return;
      h += '<div class="q-tcard mod-' + b.module + '"><h3>' + esc(b.title) + '</h3><p class="ph-date">' + whenLabel(d.date) + "</p>" + setButton(b) + "</div>"; }); });
    return h + "</div>";
  }
  function weakHtml() {
    var w = weakSets(), h = subHead("Needs another pass", "Fix weak spots");
    if (!w.length) return h + '<div class="q-empty">Sets you score under 60% appear here, lowest first.</div>';
    return h + '<div class="q-cards">' + w.map(function (p) { return '<div class="q-tcard mod-' + p[0].module + '"><h3>' + esc(p[0].title) + "</h3>" + setButton(p[0]) + "</div>"; }).join("") + "</div>";
  }

  // Tapping a circle: the topic's steps in order. Revise ticks the same sessions as Today and Plan;
  // each round opens its set as before; the big button does the next round.
  function openTopic(sid, keepY) {
    var when = whenOf(), s0 = DATA.sets[sid], ts = topicsOf(s0.module, when), t = null, pos = 0;
    ts.forEach(function (x, k) { if (x.sid === sid) { t = x; pos = k + 1; } });
    if (!t) return;
    var st = topicState(t, when), left = st.ids.length - st.ticked, f = fmt(when[t.rounds[0].key]);
    var od = st.ids.filter(function (id) { return !done[id] && SESS[id].due < today(); }).length;
    var h = '<p class="q-eyebrow">' + s0.module + " · Topic " + pos + " of " + ts.length + " · " + f.w + " " + f.d + " " + f.m + "</p><h3>" + esc(s0.name) + "</h3>";
    if (st.ids.length) h += '<details class="ph-stepc"' + (left ? " open" : "") + '><summary><span class="ph-sn">1</span><b>Revise</b><span class="ph-sm' + (od ? " bad" : "") + '">' +
      st.ticked + " of " + st.ids.length + " ticked" + (od ? " · " + od + " overdue" : "") + '</span></summary><div class="q-bar"><i style="width:' + st.rp + '%"></i></div><div class="q-list">' +
      st.ids.map(function (id) { return sessRow(id, true); }).join("") + "</div></details>";
    t.rounds.forEach(function (b, k) {
      h += '<div class="ph-stepc"><div class="ph-sh"><span class="ph-sn">' + (k + (st.ids.length ? 2 : 1)) + "</span><b>" + esc(b.label) + '</b><span class="ph-sm">' + whenLabel(when[b.key]) +
        (b === st.nextR ? ' <span class="ph-tag">Up next</span>' : "") + "</span></div>" + setButton(b) + "</div>"; });
    var main = "";
    if (st.nextR) { var i = blockInfo(st.nextR), lab = st.nextR.label.toLowerCase();
      main = '<button class="q-btn pri ph-go" data-open="' + st.nextR.key + '">' + (i.ans ? "Continue " + lab + " · " + i.ans + "/" + i.n : "Start " + lab) + "</button>"; }
    h += '<div class="q-row ph-foot"><button class="q-btn wide" data-close>Close</button>' + main + "</div>";
    var sh = sheet(h, s0.module), box = sh.querySelector(".q-sbox");
    if (keepY) box.scrollTop = keepY;
    sh.querySelector("[data-close]").onclick = function () { sh.hidden = true; };
    [].forEach.call(sh.querySelectorAll("[data-open]"), function (x) { x.onclick = function () { sh.hidden = true; openBlock(x.dataset.open); }; });
    sh.onchange = function (e) { var x = e.target; if (!x.matches || !x.matches("[data-tick]")) return;
      e.stopPropagation(); tick(x.dataset.tick, x.checked); refresh(); openTopic(sid, box.scrollTop); };
  }

  function renderPractice() {
    var el = $("tab-practice");
    if (classicPractice()) { el.innerHTML = '<div class="qwrap">' + allSetsHtml() + "</div></div>"; return; }
    var v = PV.v, body = v === "exam" ? examHtml() : v === "weak" ? weakHtml() : v === "mist" ? mistHtml()
      : v === "all" ? allSetsHtml(subHead("All question sets", "Practice")) : hubHtml();
    el.innerHTML = '<div class="qwrap ph">' + body + "</div>";
  }
  function showPractice(v, mod) { PV = {v: v, mod: PV.mod}; renderPractice(); window.scrollTo(0, 0); }
  function showModule(m) { var y = window.scrollY; PV = {v: "hub", mod: m}; renderPractice(); window.scrollTo(0, y); }

  // ---------- daily mix + mistakes ----------
  // A review session keeps its answers in S.rv[kind].a and its outcomes in S.mw / S.mr (last wrong /
  // last right, per question), S.seen (last day used) and S.mixLog. None of it touches S.a, S.marked
  // or S.pos, so set scores, the timetable and Progress are never changed by a review.
  var QIX = {}; Object.keys(BLOCKS).forEach(function (k) { BLOCKS[k].questions.forEach(function (q) { QIX[q.id] = {q: q, b: BLOCKS[k]}; }); });
  var AUTO = {sba: 1, emq: 1, fill: 1}; // reviews only use questions the app marks itself
  var MIX_N = 10, MIX_MISTAKES = 4, MIST_N = 15, RV = null;
  function M(k) { return S[k] || (S[k] = {}); }
  function withStore(st, fn) { var prev = ST; ST = st; try { return fn(); } finally { ST = prev; } }
  function topicOf(id) { var b = QIX[id].b; return b.sid || b.key; }
  // A mistake: wrong or part right in a marked set or a review, and not answered right in a review since.
  function mistakes() {
    var mw = S.mw || {}, mr = S.mr || {}, out = [];
    withStore(null, function () { Object.keys(QIX).forEach(function (id) { var x = QIX[id]; if (!AUTO[x.q.type]) return;
      var w = mw[id] || 0, m = S.marked[x.b.key];
      if (m) { var g = grade(x.q); if (g.state === "no" || g.state === "part") w = Math.max(w, m.at || 1); }
      if (w && !((mr[id] || 0) > w)) out.push({id: id, at: w}); }); });
    return out.sort(function (a, b) { return a.at - b.at; });
  }
  function mixPool() { var ids = []; Object.keys(S.marked).forEach(function (k) { var b = BLOCKS[k]; if (b) b.questions.forEach(function (q) { if (AUTO[q.type]) ids.push(q.id); }); }); return ids; }
  // Up to 4 waiting mistakes, oldest first; then questions from the sets tested longest ago, at most two
  // per topic and none used in the last 7 days. Those limits relax only when there aren't enough questions.
  function buildMix() {
    var t = today(), wk = addDays(t, -7), seen = S.seen || {}, pick = [], used = {}, per = {}, mis = mistakes();
    mis.forEach(function (m) { used[m.id] = 1; });
    mis.slice(0, MIX_MISTAKES).forEach(function (m) { pick.push(m.id); });
    function last(id) { var m = S.marked[QIX[id].b.key]; return Math.max(seen[id] ? new Date(seen[id] + "T12:00:00").getTime() : 0, m ? m.at || 0 : 0); }
    var ranked = mixPool().filter(function (id) { return !used[id]; }).map(function (id) { return {id: id, l: last(id), r: Math.random()}; })
      .sort(function (a, b) { return a.l - b.l || a.r - b.r; });
    [function (x) { return !(seen[x.id] > wk) && (per[topicOf(x.id)] || 0) < 2; }, function (x) { return !(seen[x.id] > wk); }, function () { return true; }]
      .forEach(function (ok) { ranked.forEach(function (x) { if (pick.length >= MIX_N || used[x.id] || !ok(x)) return;
        pick.push(x.id); used[x.id] = 1; per[topicOf(x.id)] = (per[topicOf(x.id)] || 0) + 1; }); });
    for (var i = pick.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), tmp = pick[i]; pick[i] = pick[j]; pick[j] = tmp; }
    return pick;
  }
  function rvBlock(rv) { var mix = rv.kind === "mix";
    return {key: "rv-" + rv.kind, kind: rv.kind, module: "ALL", title: mix ? "Daily mix" : "Mistakes", label: mix ? "Today's review" : "Until you get them right",
      questions: rv.ids.map(function (id) { return QIX[id] && QIX[id].q; }).filter(Boolean)}; }
  function rvLive(kind) { var rv = (S.rv || {})[kind]; return rv && (kind !== "mix" || rv.date === today()) ? rv : null; }
  function rvStats(rv) { return withStore(rv.a, function () { var b = rvBlock(rv), pts = 0, max = 0, ok = 0, ans = 0;
    b.questions.forEach(function (q) { var g = grade(q); pts += g.pts; max += g.max; if (g.state === "ok") ok++; if (answered(q)) ans++; });
    return {n: b.questions.length, ok: ok, ans: ans, pts: pts, max: max, pct: max ? Math.round(100 * pts / max) : 0}; }); }
  function startReview(kind, fresh) {
    var rv = rvLive(kind);
    if (!rv || rv.done || fresh) {
      var ids = kind === "mix" ? buildMix() : mistakes().slice(0, MIST_N).map(function (m) { return m.id; });
      if (!ids.length) { toast(kind === "mix" ? "Mark a question set first, then your daily mix can start." : "No mistakes waiting."); return; }
      rv = {kind: kind, date: today(), ids: ids, a: {}, i: 0, done: false, at: Date.now()};
      M("rv")[kind] = rv; save();
    }
    R = null; RV = null; ST = rv.a; P = {key: "rv-" + kind, blk: rvBlock(rv), rv: rv, i: Math.min(rv.i || 0, rv.ids.length - 1)}; renderPlayer();
  }
  function finishReview() {
    var rv = P.rv, b = curBlock(), now = Date.now(), t = today(), waiting = {}, cleared = 0;
    mistakes().forEach(function (m) { waiting[m.id] = 1; });
    withStore(rv.a, function () { b.questions.forEach(function (q) { var g = grade(q); M("seen")[q.id] = t;
      if (g.state === "ok") { M("mr")[q.id] = now; if (waiting[q.id]) cleared++; }
      else if (g.state === "no" || g.state === "part") M("mw")[q.id] = now; }); });
    rv.done = true; rv.cleared = cleared;
    if (rv.kind === "mix") { var st = rvStats(rv), log = M("mixLog"); (log[t] = log[t] || []).push({ok: st.ok, n: st.n, pts: st.pts, max: st.max}); }
    logActivity(); P = null; openReviewResults(rv.kind);
  }
  function openReviewResults(kind) { var rv = (S.rv || {})[kind]; if (!rv || !rv.done) return; RV = rv; renderReviewResults(); }
  function renderReviewResults() {
    var rv = RV, b = rvBlock(rv); ST = rv.a;
    var st = rvStats(rv), gs = b.questions.map(grade), wrong = b.questions.map(function (q, k) { return [q, k, gs[k]]; }).filter(function (x) { return x[2].state !== "ok"; });
    var head = st.pct === 100 ? "Perfect!" : st.pct >= 80 ? "Great work" : st.pct >= 50 ? "Good effort" : "Keep at it";
    var line = (rv.kind === "mix" ? "Daily mix done." : "Mistakes round done.") + (rv.cleared ? " " + rv.cleared + (rv.cleared === 1 ? " mistake" : " mistakes") + " cleared." : "") +
      (wrong.length ? " The ones you missed wait in Mistakes." : "");
    var ov = ovShell("ALL");
    ov.innerHTML = '<div class="q-ovtop"><div class="in"><button class="q-icon" data-x aria-label="Close"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button><div class="q-count" style="flex:1">' + esc(b.title) + "</div></div></div>" +
      '<div class="q-ovbody" id="q-rbody"><div class="in"><div class="q-res"><div class="q-bigring" style="--p:' + st.pct + '"><div><b>' + st.pct + "%</b><small>" + st.ok + " of " + st.n + " right</small></div></div><h2>" + head + "</h2><p>" + line + "</p></div>" +
      '<div class="q-tiles rv-tiles"><div class="q-tile g"><b>' + st.ok + '</b><span>Correct</span></div><div class="q-tile b"><b>' + (st.n - st.ok) + '</b><span>To look over</span></div><div class="q-tile"><b>' + (rv.cleared || 0) + "</b><span>Mistakes cleared</span></div></div>" +
      (wrong.length ? '<div class="q-mh"><h2>To look over</h2></div>' + wrong.map(function (x) { return reviewHtml(x[0], x[1] + 1); }).join("") : '<div class="q-empty">Every answer was right.</div>') +
      '</div></div><div class="q-ovfoot"><div class="in">' + (rv.kind === "mix" ? '<button class="q-btn" data-again>Another round</button>' : "") + '<button class="q-btn pri" data-x2>Done</button></div></div>';
    ov.querySelector("[data-x]").onclick = closeOv; ov.querySelector("[data-x2]").onclick = closeOv;
    var ag = ov.querySelector("[data-again]"); if (ag) ag.onclick = function () { startReview("mix", true); };
    // "My wording means the same" / "Count it wrong" re-settle that question for the mistakes list
    [].forEach.call(ov.querySelectorAll("[data-override]"), function (x) { x.onclick = function () { var id = x.dataset.override, a = A(id), now = Date.now();
      if (x.dataset.v === "") delete a.override; else a.override = x.dataset.v === "1";
      var g = grade(QIX[id].q); if (g.state === "ok") M("mr")[id] = now; else M("mw")[id] = now;
      save(); var y = $("q-rbody").scrollTop; renderReviewResults(); $("q-rbody").scrollTop = y; }; });
  }

  function mixCard() {
    var pool = mixPool().length, rv = rvLive("mix"), h = '<section class="ph-mix mod-ALL"><div class="ph-mt"><span class="ph-mey">Today’s review</span>';
    if (!pool) return h + "<b>Your daily mix starts soon</b><small>Mark your first question set and you get 10 quick questions a day, with your mistakes mixed in.</small></div></section>";
    if (rv && rv.done) { var st = rvStats(rv);
      return h + "<b>Done for today</b><small>" + st.ok + " of " + st.n + " right" + (rv.cleared ? " · " + rv.cleared + " mistakes cleared" : "") + "</small></div>" +
        '<div class="ph-mbs"><button class="ph-mb" data-rvres="mix">Answers</button><button class="ph-mb pri" data-rv="mix" data-fresh="1" aria-label="Another round">Again</button></div></section>'; }
    if (rv) { var s2 = rvStats(rv); return h + "<b>Daily mix · " + s2.n + " questions</b><small>" + s2.ans + " of " + s2.n + " answered</small></div>" +
      '<button class="ph-mb pri" data-rv="mix">Continue</button></section>'; }
    var n = Math.min(MIX_N, pool), mis = Math.min(MIX_MISTAKES, mistakes().length);
    return h + "<b>Daily mix · " + n + " questions</b><small>" + (mis ? "Includes " + mis + " of your mistakes · " : "") + "about " + Math.max(2, Math.round(n / 2)) + " min</small></div>" +
      '<button class="ph-mb pri" data-rv="mix">Start</button></section>';
  }
  function mistHtml() {
    var ms = mistakes(), rv = rvLive("mist"), h = subHead("Mistakes", "Fix weak spots");
    if (!ms.length && !(rv && !rv.done)) return h + '<div class="q-empty">No mistakes waiting. Questions you get wrong in a set or a review land here until you get them right.</div>';
    var cont = rv && !rv.done ? rvStats(rv) : null;
    h += '<p class="ph-meta ph-lead">Questions you got wrong, in sets and reviews. Get one right in a round and it leaves the list.</p>' +
      '<button class="q-btn pri ph-go ph-wide mod-ALL" data-rv="mist">' + (cont ? "Continue · " + cont.ans + "/" + cont.n : "Start · " + Math.min(MIST_N, ms.length) + " questions") + "</button>";
    h += '<div class="q-mh"><h2>' + ms.length + (ms.length === 1 ? " mistake" : " mistakes") + '</h2></div><div class="ph-mlist">';
    ms.slice(0, 40).forEach(function (m) { var x = QIX[m.id], st = x.q.type === "emq" && x.q.items.length ? x.q.items[0].prompt + (x.q.items.length > 1 ? " (+" + (x.q.items.length - 1) + " more)" : "") : x.q.stem || "";
      h += '<div class="ph-mi mod-' + x.b.module + '"><i aria-hidden="true"></i><span><b>' + esc(st.length > 90 ? st.slice(0, 88) + "…" : st) + "</b><small>" + (x.b.module === "ALL" || x.b.module === "OSPE" ? "Paper" : x.b.module) + " · " + TYPE[x.q.type] + " · " + esc(x.b.title) + "</small></span></div>"; });
    if (ms.length > 40) h += '<p class="ph-more">and ' + (ms.length - 40) + " more</p>";
    return h + "</div>";
  }

  // ---------- PROGRESS ----------
  function renderProgress() {
    var h = '<header class="q-head"><div><p class="q-eyebrow">Progress</p><h1>How it\'s going</h1></div><button class="q-icon" data-settings aria-label="Settings"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg></button></header><div class="q-mods">';
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
    var holder = $("q-progress-body"); holder.innerHTML = h;
  }

  // Everything she has changed about the timetable, in one place, each line reversible.
  function planGroupHtml(open) {
    var moved = SCH.movedUnits(), offs = SCH.offDays();
    var sub = !moved.length && !offs.length ? "Nothing moved \u2014 the timetable is as it was written"
      : [moved.length ? moved.length + (moved.length === 1 ? " topic moved" : " topics moved") : "",
         offs.length ? offs.length + (offs.length === 1 ? " day off" : " days off") : ""].filter(function (x) { return x; }).join(" · ");
    var h = '<details class="q-howto"' + (open ? " open" : "") + '><summary><span><b>Moved work and days off</b><small>' + sub +
      '</small></span><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></summary><div class="q-notes q-schlist">';
    if (!moved.length && !offs.length) h += "<p>Move a topic from the day it is on (Today \u2192 Move), or mark a day off, and it is listed here so you can see what you changed and put any of it back.</p>";
    if (offs.length) h += '<div class="q-sub">Days off</div>' + offs.map(function (iso) {
      return '<div class="q-mvrow"><span><b>' + SCH.fmtShort(iso) + "</b><small>" + (SCH.hasWork(iso) ? "still has work on it" : "clear") +
        '</small></span><button class="q-btn sm" data-sdoff="' + iso + '">Working day</button></div>'; }).join("");
    if (moved.length) h += '<div class="q-sub">Moved</div>' + moved.map(function (u) {
      return '<div class="q-mvrow"><span><b>' + esc(u.title) + "</b><small>" + unitSize(u) + " · " + SCH.fmtShort(u.home) + " \u2192 " + SCH.fmtShort(u.from) +
        '</small></span><button class="q-btn sm" data-spb="' + u.id + '" data-mday="' + u.from + '">Put back</button></div>'; }).join("");
    if (moved.length || offs.length) h += '<div class="q-row"><button class="q-btn sm" data-sreset>Put the whole timetable back</button></div>';
    return h + "</div></details>";
  }
  function howItWorksHtml() {
    return '<div class="q-notes"><ul>' +
      "<li><b>Today</b> lists the sessions due today with that topic's questions underneath. Tick each session when you've revised it.</li>" +
      "<li>A session turns <span class=\"warn\">amber</span> when you've marked its questions but haven't ticked it, and <span class=\"bad\">red</span> once its day has passed unticked. Red ones collect under Overdue at the top of Today.</li>" +
      "<li><b>Practice</b> shows each module as a path of topics in plan order, opening where you are. The ring round a circle fills as you tick that topic's sessions, the stars underneath are its question rounds, and a tick means everything is done. Tap a circle to tick its sessions (the same ticks as Today and Plan) and start its rounds. <b>All sets</b> is the full list, and <b>Classic Practice list</b> (Settings → Practice) makes that list the whole tab again.</li>" +
      "<li><b>Daily mix</b> is a short quiz each day from sets you've already marked, with up to 4 of your mistakes mixed in and the topics you were tested on longest ago first. <b>Mistakes</b> lists every question you got wrong in a set or a review; get it right in a round and it leaves the list. Neither changes your set scores, your plan or your ticks; they only count towards your streak.</li>" +
      "<li>Questions come one at a time. Nothing is marked until you press <b>Finish and mark</b> at the end of the set.</li>" +
      "<li><b>Think first</b> (Settings → Practice) hides the options on single best answer questions until you tap Show options. Answering from memory first is a better test, and the options can't hint at the answer.</li>" +
      "<li>Single best answer, extended matching and fill in the blank mark themselves. For short answers and OSPE stations you mark yourself against the mark scheme.</li>" +
      "<li>Fill in the blank forgives small typos, British or American spelling and plurals, and shows the correct spelling. It won't accept a different real term (hypo for hyper, ilium for ileum), and numbers must be exact. You can overrule it either way.</li>" +
      "<li>Your streak counts days you did something. Rest days and days you mark off pause it: they don't add a day and don't break the run.</li>" +
      "<li><b>Moving work.</b> Tap <b>Move</b> on a topic, or <b>Move this day's work</b> at the top of a day. The app suggests days that still meet the deadline and aren't already full, splitting a big topic over two days rather than dropping a mountain on one. Change any of it before you confirm, and undo it after.</li>" +
      "<li>A move can't break the plan's order: a first pass stays before its consolidation day, consolidation before rapid recall, and everything before its exam. The day list shows how full each day would end up.</li>" +
      "<li><b>Days off.</b> A day you can't work on is marked off at the top of that day. It pauses the streak and prompts you to re-home its work. It works on a day that has already gone, which is how a missed day is put right.</li>" +
      "<li>Overdue sessions have a <b>Find days for these</b> button. Nothing is ever lost by being late \u2014 it just needs a day with room.</li>" +
      "<li>Each first-pass set covers every learning outcome for its topic; extra questions needed for that are labelled LO top-up.</li>" +
      "<li>Everything saves on this phone. Save a backup now and then (Settings → Your data).</li></ul></div>";
  }

  // ---------- SETTINGS ----------
  var THEME = "nicole-revision-theme", ACCENT = "nicole-revision-accent";
  // swatch colours are fixed so each one shows its own colour whatever theme is active
  var ACCENTS = [["green","Green","#6F9163"],["blue","Blue","#5A88B0"],["pink","Pink","#C0708A"],["purple","Purple","#8A78BA"]];
  function themeMode() { try { var t = localStorage.getItem(THEME); return t === "dark" || t === "light" ? t : "system"; } catch (e) { return "system"; } }
  function accentName() { try { var a = localStorage.getItem(ACCENT); return ACCENTS.some(function (x) { return x[0] === a; }) ? a : "green"; } catch (e) { return "green"; } }
  function setTheme(mode) {
    try { if (mode === "system") localStorage.removeItem(THEME); else localStorage.setItem(THEME, mode); } catch (e) {}
    window.applyTheme();
  }
  function setAccent(name) {
    try { if (name === "green") localStorage.removeItem(ACCENT); else localStorage.setItem(ACCENT, name); } catch (e) {}
    window.applyTheme();
  }
  // Think first: hide single-best-answer options until she has an answer in mind (off when unset)
  var THINK = "nicole-revision-think";
  function thinkFirst() { try { return localStorage.getItem(THINK) === "1"; } catch (e) { return false; } }
  function setThinkFirst(on) { try { if (on) localStorage.setItem(THINK, "1"); else localStorage.removeItem(THINK); } catch (e) {} }
  var RS = null; // reset selection {ticks, answers, streak, flags, review, mods:{URO,ENI,GIL}}
  function resetCounts(sel) {
    var mods = sel.mods, c = {ticks:0, flags:0, sets:0, answers:0, days:0, reviews:0};
    if (sel.ticks) Object.keys(done).forEach(function (id) { if (mods[id.split("-")[0]]) c.ticks++; });
    if (sel.flags) Object.keys(flags).forEach(function (id) { if (mods[id.split("-")[0]]) c.flags++; });
    if (sel.answers) Object.keys(BLOCKS).forEach(function (k) { var b = BLOCKS[k]; if (!inScope(b, mods)) return;
      if (S.marked[k]) c.sets++; b.questions.forEach(function (q) { if (S.a[q.id]) c.answers++; }); });
    if (sel.streak) c.days = Object.keys(S.days).length;
    if (sel.review) { c.reviews = Object.keys(S.mw || {}).length + Object.keys(S.mr || {}).length + Object.keys(S.seen || {}).length;
      Object.keys(S.rv || {}).forEach(function (k) { if (S.rv[k]) c.reviews++; }); }
    return c;
  }
  function inScope(b, mods) { return b.module === "OSPE" || b.module === "ALL" ? mods.URO && mods.ENI && mods.GIL : !!mods[b.module]; }
  function doReset(sel) {
    var mods = sel.mods;
    if (sel.ticks) Object.keys(done).forEach(function (id) { if (mods[id.split("-")[0]]) delete done[id]; });
    if (sel.flags) Object.keys(flags).forEach(function (id) { if (mods[id.split("-")[0]]) delete flags[id]; });
    if (sel.answers) Object.keys(BLOCKS).forEach(function (k) { var b = BLOCKS[k]; if (!inScope(b, mods)) return;
      delete S.marked[k]; delete S.pos[k]; b.questions.forEach(function (q) { delete S.a[q.id]; }); });
    if (sel.streak) S.days = {};
    if (sel.review) { delete S.rv; delete S.mw; delete S.mr; delete S.seen; delete S.mixLog; }
    store(KEY, done); store(FLAG_KEY, flags); save(); planDirty = true;
  }
  function summaryLines(sel) {
    var c = resetCounts(sel), names = ["URO","ENI","GIL"].filter(function (m) { return sel.mods[m]; }), scope = names.length === 3 ? "all modules" : names.join(" and "), out = [];
    if (sel.ticks) out.push("<b>" + c.ticks + "</b> ticked " + (c.ticks === 1 ? "session" : "sessions") + " in " + scope);
    if (sel.answers) out.push("<b>" + c.sets + "</b> marked question " + (c.sets === 1 ? "set" : "sets") + (c.answers ? " and <b>" + c.answers + "</b> saved " + (c.answers === 1 ? "answer" : "answers") : "") + " in " + scope + (names.length === 3 ? ", including the mocks and OSPE" : ""));
    if (sel.flags) out.push("<b>" + c.flags + "</b> " + (c.flags === 1 ? "flag" : "flags") + " in " + scope);
    if (sel.streak) out.push("your practice streak (" + c.days + " " + (c.days === 1 ? "day" : "days") + " of history)");
    if (sel.review) out.push("your daily mix and mistakes history (" + c.reviews + " saved " + (c.reviews === 1 ? "entry" : "entries") + ")");
    return {lines:out, total:c.ticks + c.sets + c.answers + c.flags + c.days + c.reviews};
  }
  function toast(msg, ms, act) {
    var t = $("q-toast");
    if (!t) { t = document.createElement("div"); t.id = "q-toast"; t.className = "q-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.innerHTML = "";
    var sp = document.createElement("span"); sp.textContent = msg; t.appendChild(sp);
    if (act) { var b = document.createElement("button"); b.type = "button"; b.textContent = act.label;
      b.onclick = function () { t.dataset.show = "false"; act.fn(); }; t.appendChild(b); }
    t.dataset.show = "true"; clearTimeout(t._h); t._h = setTimeout(function () { t.dataset.show = "false"; }, ms || 3500); }

  function openSettings(section) {
    var ov = ovShell("ALL"), mode = themeMode(), accent = accentName();
    RS = RS || {ticks:false, answers:false, flags:false, streak:false, review:false, mods:{URO:true, ENI:true, GIL:true}};
    function tog(key, label, hint) { return '<label class="q-row-t"><span><b>' + label + "</b><small>" + hint + '</small></span><input type="checkbox" class="q-switch" data-rs="' + key + '"' + (RS[key] ? " checked" : "") + "></label>"; }
    ov.innerHTML = '<div class="q-ovtop"><div class="in"><button class="q-icon" data-x aria-label="Close settings"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button><div class="q-count" style="flex:1">Settings</div></div></div>' +
      '<div class="q-ovbody" id="q-sbody"><div class="in q-settings">' +
      '<p class="q-slabel">Appearance</p><div class="q-sgroup"><div class="q-srow"><span><b>Theme</b><small>Light, dark, or match your phone</small></span></div>' +
      '<div class="q-seg" role="radiogroup" aria-label="Theme">' + [["light","Light"],["dark","Dark"],["system","Match phone"]].map(function (o) { return '<button role="radio" aria-checked="' + (mode === o[0]) + '" data-mode="' + o[0] + '">' + o[1] + "</button>"; }).join("") + "</div>" +
      '<div class="q-srow"><span><b>Colour</b><small>' + ACCENTS.filter(function (o) { return o[0] === accent; })[0][1] + '</small></span></div>' +
      '<div class="q-swatches" role="radiogroup" aria-label="Colour">' + ACCENTS.map(function (o) { return '<button role="radio" aria-checked="' + (accent === o[0]) + '" aria-label="' + o[1] + '" data-accent="' + o[0] + '" style="--sw:' + o[2] + '"><span></span>' + o[1] + "</button>"; }).join("") + "</div></div>" +
      '<p class="q-slabel">Practice</p><div class="q-sgroup"><label class="q-row-t"><span><b>Think first</b><small>Hide the options on single best answer questions until you tap Show options, so you answer from memory</small></span><input type="checkbox" class="q-switch on-accent" data-think' + (thinkFirst() ? " checked" : "") + "></label>" +
      '<label class="q-row-t"><span><b>Classic Practice list</b><small>Show every question set on one page in the Practice tab, as it was before the hub</small></span><input type="checkbox" class="q-switch on-accent" data-classic' + (classicPractice() ? " checked" : "") + "></label></div>" +
      '<p class="q-slabel">Your plan</p><div class="q-sgroup">' + planGroupHtml(section === "plan") + "</div>" +
      '<p class="q-slabel">Help</p><div class="q-sgroup"><details class="q-howto"' + (section === "help" ? " open" : "") + '><summary><span><b>How it works</b><small>Ticking, colours, questions and marking</small></span><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></summary>' + howItWorksHtml() + "</details></div>" +
      '<p class="q-slabel">Your data</p><div class="q-sgroup"><button class="q-srow q-link" data-bk="export"><span><b>Save a backup</b><small>Ticks, flags and question answers in one file</small></span><svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg></button>' +
      '<button class="q-srow q-link" data-bk="import"><span><b>Restore from a backup</b><small>Adds anything missing; never removes progress</small></span><svg viewBox="0 0 24 24"><path d="M12 21V9M7 14l5-5 5 5M5 3h14"/></svg></button></div>' +
      '<p class="q-slabel bad">Danger zone</p><div class="q-sgroup q-danger"><div class="q-srow"><span><b>Reset progress</b><small>Choose what to clear. You confirm three times before anything is deleted.</small></span></div>' +
      '<div class="q-sub">What to clear</div>' + tog("ticks", "Session ticks", "The ticks on Today and Plan") + tog("answers", "Question answers and scores", "Answers, marks and results for question sets") + tog("flags", "Flags", "Sessions flagged for another pass") + tog("streak", "Practice streak", "The days-practised history") + tog("review", "Daily mix and mistakes", "Review history and mistakes cleared in reviews. Mistakes from marked sets come from their answers, so they stay") +
      '<div class="q-sub">Which modules</div><div class="q-chips">' + ["URO","ENI","GIL"].map(function (m) { return '<label class="q-mchip mod-' + m + '"><input type="checkbox" data-rm="' + m + '"' + (RS.mods[m] ? " checked" : "") + "><span>" + m + "</span></label>"; }).join("") + '</div><p class="q-hint2">The streak and the daily mix history cover all modules. Mocks and OSPE only reset when all three modules are selected.</p>' +
      '<button class="q-btn q-dangerbtn" data-reset-go>Reset selected…</button></div>' +
      '<p class="q-foot2">Nicole\'s revision · Everything saves on this phone only.</p></div></div>';
    ov.querySelector("[data-x]").onclick = closeOv;
    [].forEach.call(ov.querySelectorAll("[data-accent]"), function (b) { b.onclick = function () { setAccent(b.dataset.accent);
      [].forEach.call(ov.querySelectorAll("[data-accent]"), function (x) { x.setAttribute("aria-checked", x === b); });
      b.parentNode.previousElementSibling.querySelector("small").textContent = b.getAttribute("aria-label"); }; });
    ov.querySelector("[data-think]").onchange = function () { setThinkFirst(this.checked); };
    ov.querySelector("[data-classic]").onchange = function () { setClassicPractice(this.checked); PV.v = "hub"; };
    [].forEach.call(ov.querySelectorAll("[data-mode]"), function (b) { b.onclick = function () { setTheme(b.dataset.mode); [].forEach.call(ov.querySelectorAll("[data-mode]"), function (x) { x.setAttribute("aria-checked", x === b); }); }; });
    [].forEach.call(ov.querySelectorAll("[data-rs]"), function (x) { x.onchange = function () { RS[x.dataset.rs] = x.checked; updGo(); }; });
    [].forEach.call(ov.querySelectorAll("[data-rm]"), function (x) { x.onchange = function () { RS.mods[x.dataset.rm] = x.checked; updGo(); }; });
    [].forEach.call(ov.querySelectorAll("[data-sdoff]"), function (x) {
      x.onclick = function () { var b = SCH.setOff(x.dataset.sdoff, false); resched(); openSettings("plan");
        toast("Back to a working day.", 6000, {label: "Undo", fn: function () { SCH.undo(b); resched(); openSettings("plan"); }}); };
    });
    [].forEach.call(ov.querySelectorAll("[data-spb]"), function (x) {
      x.onclick = function () { var u = findUnit(x.dataset.spb, x.dataset.mday); if (!u) return;
        var b = SCH.putBack([u]); resched(); openSettings("plan");
        toast("Back on " + SCH.fmtShort(u.home) + ".", 6000, {label: "Undo", fn: function () { SCH.undo(b); resched(); openSettings("plan"); }}); };
    });
    var sres = ov.querySelector("[data-sreset]");
    if (sres) sres.onclick = function () {
      var sh = sheet("<h3>Put the whole timetable back?</h3><p>Every move is undone and every day off cleared, back to the timetable as it was written. Your ticks, answers and streak are not touched.</p>" +
        '<div class="q-row"><button class="q-btn wide" data-close>Keep my changes</button><button class="q-btn pri wide" data-yes>Put it back</button></div>', "ALL");
      sh.querySelector("[data-close]").onclick = function () { sh.hidden = true; };
      sh.querySelector("[data-yes]").onclick = function () { sh.hidden = true; var b = SCH.resetAll(); resched(); openSettings("plan");
        toast("Timetable put back.", 7000, {label: "Undo", fn: function () { SCH.undo(b); resched(); openSettings("plan"); }}); };
    };
    ov.querySelector('[data-bk="export"]').onclick = function () { $("bk-export").click(); toast("Backup saved to your downloads."); };
    ov.querySelector('[data-bk="import"]').onclick = function () { $("bk-import").click(); };
    var go = ov.querySelector("[data-reset-go]");
    function updGo() { var anyWhat = RS.ticks || RS.answers || RS.flags || RS.streak || RS.review, anyMod = RS.mods.URO || RS.mods.ENI || RS.mods.GIL || ((RS.streak || RS.review) && !RS.ticks && !RS.answers && !RS.flags);
      go.disabled = !(anyWhat && anyMod); go.textContent = go.disabled ? "Choose what to reset" : "Reset selected…"; }
    updGo();
    go.onclick = confirmStep1;
  }
  // step 1: say exactly what will go
  function confirmStep1() {
    var sm = summaryLines(RS);
    if (!sm.total) { sheet('<h3>Nothing to reset</h3><p>There is no saved progress in what you selected.</p><div class="q-row"><button class="q-btn wide" data-close>OK</button></div>', "ALL").querySelector("[data-close]").onclick = function () { $("q-sheet").hidden = true; }; return; }
    var sh = sheet('<div class="q-warnicon" aria-hidden="true">!</div><h3>Reset this progress?</h3><p>This permanently clears:</p><ul class="q-clear">' + sm.lines.map(function (l) { return "<li>" + l + "</li>"; }).join("") + '</ul><p>Everything else stays as it is.</p><div class="q-row"><button class="q-btn wide" data-close>Keep my progress</button><button class="q-btn q-dangerbtn wide" data-next>Continue</button></div>', "ALL");
    sh.querySelector("[data-close]").onclick = function () { sh.hidden = true; };
    sh.querySelector("[data-next]").onclick = confirmStep2;
  }
  // step 2: offer a backup first
  function confirmStep2() {
    var sh = sheet('<h3>Save a backup first?</h3><p>A reset can\'t be undone. A backup file lets you bring this progress back later with Restore.</p><div class="q-row"><button class="q-btn pri" data-bk>Save a backup, then continue</button></div><div class="q-row"><button class="q-btn wide" data-close>Cancel</button><button class="q-btn wide" data-skip>Continue without a backup</button></div>', "ALL");
    sh.querySelector("[data-close]").onclick = function () { sh.hidden = true; };
    sh.querySelector("[data-bk]").onclick = function () { $("bk-export").click(); confirmStep3(true); };
    sh.querySelector("[data-skip]").onclick = function () { confirmStep3(false); };
  }
  // step 3: type RESET to unlock
  function confirmStep3(backedUp) {
    var sh = sheet('<div class="q-warnicon" aria-hidden="true">!</div><h3>Last check</h3><p>' + (backedUp ? "Backup saved. " : "") + 'Type <b>RESET</b> below to permanently clear what you selected.</p><input type="text" id="q-reset-word" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="RESET" aria-label="Type RESET to confirm"><div class="q-row"><button class="q-btn wide" data-close>Cancel</button><button class="q-btn q-dangerbtn wide" data-final disabled>Reset now</button></div>', "ALL");
    var inp = sh.querySelector("#q-reset-word"), fin = sh.querySelector("[data-final]");
    inp.oninput = function () { fin.disabled = inp.value.trim().toUpperCase() !== "RESET"; };
    inp.onkeydown = function (e) { if (e.key === "Enter" && !fin.disabled) fin.click(); };
    setTimeout(function () { inp.focus(); }, 50);
    sh.querySelector("[data-close]").onclick = function () { sh.hidden = true; };
    fin.onclick = function () { var sm = summaryLines(RS); doReset(RS); sh.hidden = true; RS = null; openSettings(); toast("Reset done. " + sm.lines.length + " " + (sm.lines.length === 1 ? "item" : "items") + " cleared."); };
  }

  // ---------- player ----------
  var P = null, R = null;
  function openBlock(key) { var b = BLOCKS[key]; ST = null; if (S.marked[key]) return openResults(key); P = {key:key, i:Math.min(S.pos[key] || 0, b.questions.length - 1)}; renderPlayer(); }
  function closeOv() { $("q-ov").hidden = true; $("q-ov").innerHTML = ""; document.body.style.overflow = ""; P = null; R = null; RV = null; ST = null; refresh(); }
  function curBlock() { return P.blk || BLOCKS[P.key]; }
  function qInput(q) {
    var a = AS()[q.id] || {}, h = "";
    if (q.type === "sba" && thinkFirst() && a.sel == null && !(P.shown && P.shown[q.id])) {
      h += '<p class="q-stem">' + esc(q.stem) + '</p><div class="q-think"><b>Think of your answer first</b><small>Have an answer in your head? Then look at the options.</small><button class="q-btn sm" data-reveal>Show options</button></div>';
    } else if (q.type === "sba") {
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
    var b = curBlock(), q = b.questions[P.i], n = b.questions.length, ans = b.questions.filter(answered).length, last = P.i === n - 1;
    if (P.rv) P.rv.i = P.i; else S.pos[P.key] = P.i; save();
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
    var sh = ov.querySelector("[data-reveal]");
    if (sh) sh.onclick = function () { (P.shown = P.shown || {})[q.id] = 1; renderPlayer(); };
    [].forEach.call(ov.querySelectorAll("[data-sba]"), function (x) { x.onclick = function () { var a = A(q.id), v = +x.dataset.sba; a.sel = a.sel === v ? null : v; if (a.sel != null) logActivity(); else save();
      [].forEach.call(ov.querySelectorAll("[data-sba]"), function (y) { var on = a.sel === +y.dataset.sba; y.classList.toggle("sel", on); y.setAttribute("aria-checked", on); }); updFinish(); }; });
    [].forEach.call(ov.querySelectorAll("[data-emq]"), function (x) { x.onchange = function () { var a = A(q.id); a.sel = a.sel || {}; if (x.value === "") { delete a.sel[x.dataset.emq]; save(); } else { a.sel[x.dataset.emq] = +x.value; logActivity(); } updFinish(); }; });
    var fi = ov.querySelector("[data-fill]");
    if (fi) { fi.oninput = function () { A(q.id).text = fi.value; save(); updFinish(); }; fi.onchange = function () { if (fi.value.trim()) logActivity(); }; fi.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); (nx || fn).click(); } }; }
    [].forEach.call(ov.querySelectorAll("[data-sa]"), function (x) { x.oninput = function () { var a = A(q.id); a.text = a.text || {}; a.text[x.dataset.sa] = x.value; save(); updFinish(); }; x.onchange = function () { if (x.value.trim()) logActivity(); }; });
  }
  function updFinish() { var b = curBlock(), f = $("q-ov").querySelector("[data-finish]"); if (f) f.textContent = "Finish and mark · " + b.questions.filter(answered).length + "/" + b.questions.length; }
  function sheet(html, mod) { var sh = $("q-sheet"); sh.className = "q-sheet qb mod-" + mod; sh.innerHTML = '<div class="q-sbox" role="dialog">' + html + "</div>"; sh.hidden = false; sh.onclick = function (e) { if (e.target === sh) sh.hidden = true; }; return sh; }
  function showMap() {
    var b = curBlock();
    var sh = sheet('<h3>Jump to a question</h3><p>Shaded ones have an answer saved.</p><div class="q-grid">' + b.questions.map(function (q, i) { return '<button class="' + (answered(q) ? "ans" : "") + (i === P.i ? " cur" : "") + '" data-j="' + i + '">' + (i + 1) + "</button>"; }).join("") + '</div><div class="q-row"><button class="q-btn wide" data-close>Close</button><button class="q-btn pri" data-fin>Finish and mark</button></div>', b.module);
    sh.querySelector("[data-close]").onclick = function () { sh.hidden = true; };
    sh.querySelector("[data-fin]").onclick = function () { sh.hidden = true; confirmFinish(); };
    [].forEach.call(sh.querySelectorAll("[data-j]"), function (x) { x.onclick = function () { P.i = +x.dataset.j; sh.hidden = true; renderPlayer(); }; });
  }
  function confirmFinish() {
    var b = curBlock(), left = b.questions.filter(function (q) { return !answered(q); }).length;
    if (!left) return finish();
    var sh = sheet("<h3>" + left + " " + (left === 1 ? "question has" : "questions have") + ' no answer</h3><p>Unanswered questions score zero. Go back and answer them, or mark the set now.</p><div class="q-row"><button class="q-btn wide" data-back>Go back</button><button class="q-btn pri" data-go>Mark now</button></div>', b.module);
    sh.querySelector("[data-back]").onclick = function () { sh.hidden = true; for (var i = 0; i < b.questions.length; i++) if (!answered(b.questions[i])) { P.i = i; break; } renderPlayer(); };
    sh.querySelector("[data-go]").onclick = function () { sh.hidden = true; finish(); };
  }
  function finish() { if (P.rv) return finishReview(); var key = P.key; S.marked[key] = {at: Date.now()}; logActivity(); P = null; planDirty = true; openResults(key); }

  // ---------- results ----------
  function verdict(p) { if (p == null) return ["Marked", "Mark the short answers below to finish your score."]; if (p >= 85) return ["Excellent", "This topic is secure. Keep it ticking over."]; if (p >= 70) return ["Good work", "A few gaps to tidy. Review the red ones below."]; if (p >= 50) return ["Getting there", "Go through the explanations below, then retry on another day."]; return ["Worth another pass", "Re-read your notes on this one, then retry the set."]; }
  function openResults(key) { R = {key:key, filter: R && R.key === key ? R.filter : "all"}; renderResults(); }
  function reviewHtml(q, n) {
    var a = AS()[q.id] || {}, g = grade(q), h = "", cls = {ok:"ok",part:"no",no:"no",skip:"",self:"self"}[g.state];
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
      var fm = fillMatch(q), ok = fm.ok, ctl = "";
      if (fm.you) ctl = '<div class="q-self"><span class="q-muted">You marked this ' + (ok ? "right" : "wrong") + '.</span> <button class="q-btn sm" data-override="' + q.id + '" data-v="">Undo</button></div>';
      else if (ok && !fm.exact) ctl = '<div class="q-self"><span class="q-close">Close enough. Correct spelling: <b>' + esc(fm.target) + '</b></span> <button class="q-btn sm" data-override="' + q.id + '" data-v="0">Count it wrong</button></div>';
      else if (!ok && a.text) ctl = '<div class="q-self"><button class="q-btn sm" data-override="' + q.id + '" data-v="1">My wording means the same</button></div>';
      h += '<p class="q-stem">' + esc(q.stem) + '</p><div class="q-yours"><b>Yours:</b> ' + (a.text ? esc(a.text) : '<span class="sk-t">blank</span>') + (ok ? ' <span class="ok-t">✓</span>' : "") + '</div><div class="q-yours"><b>Answer:</b> ' + esc(q.answer) + (q.accept && q.accept.length ? ' <span class="q-muted">(also: ' + esc(q.accept.join(", ")) + ")</span>" : "") + "</div>" +
        ctl + '<div class="q-exp">' + esc(q.explanation) + "</div>";
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
    [].forEach.call(ov.querySelectorAll("[data-override]"), function (x) { x.onclick = function () { var a = A(x.dataset.override); if (x.dataset.v === "") delete a.override; else a.override = x.dataset.v === "1"; save(); keep(); }; });
    [].forEach.call(ov.querySelectorAll("[data-stick]"), function (x) { x.onchange = function () { var a = A(x.dataset.stick); a.ticks = a.ticks || {}; a.ticks[x.dataset.i] = x.checked; a.score = Object.keys(a.ticks).filter(function (k) { return a.ticks[k]; }).length; save(); keep(); }; });
    [].forEach.call(ov.querySelectorAll("[data-tick]"), function (x) { x.onchange = function () { tick(x.dataset.tick, x.checked); keep(); }; });
  }

  // ---------- tabs + events ----------
  var TABS = ["today", "plan", "practice", "progress"], curTab = "today";
  function updBadge() { var t = today(), n = Object.keys(SESS).filter(function (id) { return SESS[id].due < t && !done[id]; }).length, el = $("nav-od");
    el.hidden = !n; el.textContent = n > 99 ? "99+" : n; el.parentNode.setAttribute("aria-label", "Today" + (n ? ", " + n + " overdue" : "")); }
  window.qbOnTick = function (on) { updBadge(); if (on) logActivity(); };
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
  [].forEach.call(document.querySelectorAll("[data-tab]"), function (b) { b.onclick = function () { if (b.dataset.tab === curTab && curTab === "today") renderToday(today());
    if (b.dataset.tab === curTab && curTab === "practice") PV.v = "hub"; showTab(b.dataset.tab); }; });

  document.addEventListener("click", function (e) {
    var root = e.target.closest(".qb"); if (!root || root.id === "q-ov" || root.id === "q-sheet") return;
    var x;
    if ((x = e.target.closest("[data-open]"))) { openBlock(x.dataset.open); return; }
    if ((x = e.target.closest("[data-pv]"))) { showPractice(x.dataset.pv); return; }
    if ((x = e.target.closest("[data-pm]"))) { showModule(x.dataset.pm); return; }
    if ((x = e.target.closest("[data-topic]"))) { openTopic(x.dataset.topic); return; }
    if ((x = e.target.closest("[data-rv]"))) { startReview(x.dataset.rv, x.dataset.fresh === "1"); return; }
    if ((x = e.target.closest("[data-rvres]"))) { openReviewResults(x.dataset.rvres); return; }
    if ((x = e.target.closest("[data-date]"))) { renderToday(x.dataset.date); return; }
    if ((x = e.target.closest("[data-today]"))) { renderToday(today()); return; }
    if ((x = e.target.closest("[data-wk]"))) { var tg = addDays(curDate, +x.dataset.wk), mon = addDays(tg, -((new Date(tg + "T12:00:00").getDay() + 6) % 7)), pick = null;
      for (var k = 0; k < 7 && !pick; k++) { var iso = addDays(mon, k), d = null; for (var i = 0; i < DATA.days.length; i++) if (DATA.days[i].date === iso) d = DATA.days[i]; if (d && d.blocks.length) pick = iso; }
      for (var k2 = 0; k2 < 7 && !pick; k2++) { var iso2 = addDays(mon, k2); if (DATA.days.some(function (x) { return x.date === iso2; }) || iso2 === today()) pick = iso2; }
      renderToday(pick || tg); return; }
    if ((x = e.target.closest("[data-od]"))) { S.odOpen = !S.odOpen; save(); renderToday(); return; }
    if ((x = e.target.closest("[data-settings]"))) { openSettings(); return; }
    if ((x = e.target.closest("[data-move]"))) { var mu = findUnit(x.dataset.move, x.dataset.mday); if (mu) openMove([mu]); return; }
    if ((x = e.target.closest("[data-moveday]"))) { var md = x.dataset.moveday;
      openMove(SCH.unitsOn(md), {day: md, head: "Move " + fmt(md).long + "\u2019s work"}); return; }
    if ((x = e.target.closest("[data-odmove]"))) { openMove(SCH.overdueUnits(done), {head: "Find days for the overdue work"}); return; }
    if ((x = e.target.closest("[data-dayoff]"))) { dayOffFlow(x.dataset.dayoff); return; }
    if ((x = e.target.closest("[data-putback]"))) { putBackUnit(x.dataset.putback, x.dataset.mday); return; }
    if ((x = e.target.closest("[data-rescue]"))) {
      var ds = x.dataset.rescue.split(","), b0 = null;
      ds.forEach(function (iso) { var st = SCH.setOff(iso, true); if (!b0) b0 = st; });
      afterChange(ds.length === 1 ? "Marked as a day off \u2014 your run carries on." : ds.length + " days marked off \u2014 your run carries on.", b0);
      return; }
    if ((x = e.target.closest("[data-rescuex]"))) { S.rescueX = x.dataset.rescuex; save(); renderToday(); return; }
    if ((x = e.target.closest("[data-goto]"))) { var el = $("tab-today-in").querySelector(x.dataset.goto); if (el) el.scrollIntoView({behavior: "smooth", block: "start"}); return; }
  });
  document.addEventListener("change", function (e) {
    var x = e.target; if (!x.matches || !x.matches("[data-tick]") || x.closest("#q-ov")) return;
    tick(x.dataset.tick, x.checked);
    var y = window.scrollY; refresh(); window.scrollTo(0, y);
  });
  document.addEventListener("keydown", function (e) {
    if (!$("q-sheet").hidden) { if (e.key === "Escape") $("q-sheet").hidden = true; return; }
    if (!P) { if (e.key === "Escape" && !$("q-ov").hidden) closeOv(); return; }
    var tag = (e.target.tagName || "").toLowerCase(); if (tag === "textarea" || tag === "input" || tag === "select") return;
    var b = curBlock();
    if (e.key === "ArrowRight" && P.i < b.questions.length - 1) { P.i++; renderPlayer(); }
    else if (e.key === "ArrowLeft" && P.i > 0) { P.i--; renderPlayer(); }
    else if (/^[1-5a-eA-E]$/.test(e.key)) { var k = /\d/.test(e.key) ? +e.key - 1 : "abcde".indexOf(e.key.toLowerCase()); var o = $("q-ov").querySelectorAll("[data-sba]")[k]; if (o) o.click(); }
    else if (e.key === "Escape") closeOv();
  });

  // date rollover: midnight, or reopening the app on another day
  var shownToday = today();
  function checkDate() { var t = today(); if (t === shownToday) return; var was = curDate === shownToday; shownToday = t; if (was) curDate = t; planDirty = true; if (!P && !R && !RV) refresh(); }
  setInterval(checkDate, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) checkDate(); });
  window.addEventListener("focus", checkDate);

  // backup: include question answers alongside ticks
  window.qbSnapshot = function () { return S; };
  window.qbRestoreSched = function (x) { var n = SCH.restore(x); if (n) { resched(); refresh(); } return n; };
  window.qbRestore = function (q) { if (!q || typeof q !== "object") return 0; var n = 0;
    ["a","marked","days","mw","mr","seen","mixLog"].forEach(function (k) { var src = q[k] || {}; S[k] = S[k] || {}; Object.keys(src).forEach(function (id) { if (!(id in S[k])) { S[k][id] = src[id]; n++; } }); });
    repairLostAnswers(); save(); planDirty = true; refresh(); return n; };

  $("theme").addEventListener("click", function () { openSettings(); });
  var start = "today"; try { start = sessionStorage.getItem("nicole-tab") || "today"; } catch (e) {}
  resched();
  render(); // recolour Plan now that session states exist
  showTab(TABS.indexOf(start) >= 0 ? start : "today");
  if (repaired) setTimeout(function () { toast("A bug stopped answers saving. " + repaired + " question " + (repaired === 1 ? "set has" : "sets have") + " been reopened so you can redo " + (repaired === 1 ? "it" : "them") + ".", 9000); }, 600);
})();
