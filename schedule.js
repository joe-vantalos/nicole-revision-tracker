/* Nicole's revision app: the reschedule layer.

   The timetable in questions.js is fixed, generated data. This file holds *her*
   changes to it — which day a question set or a session actually lands on, and
   which days she has marked off — and projects those changes back onto the QB
   data the rest of the app reads. Every tab then shows the real plan without
   knowing that moves exist.

   Stored under its own key so a move can never corrupt her answers:

     nicole-schedule-v1   {v, moveB, moveS, off}

   moveB: block key -> date        a question set / paper / OSPE moved
   moveS: session id -> date       a session moved (its tick keeps its own id)
   off:   date -> 1                a day she marked off (streak pauses, like a rest day)

   An entry only exists while it differs from the timetable, so "put it back"
   is a delete and the file stays small.
*/
(function () {
  "use strict";
  var QB = window.QB;
  var KEY = "nicole-schedule-v1";

  // Local-date helpers, same rules as qb.js: midday anchor so DST never shifts a day.
  function isoOf(x) { return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); }
  function addDays(iso, n) { var x = new Date(iso + "T12:00:00"); x.setDate(x.getDate() + n); return isoOf(x); }
  function today() { return isoOf(new Date()); }
  function between(a, b) { return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5); }
  function fmtShort(iso) { var x = new Date(iso + "T12:00:00"); return x.toLocaleString("en-GB", {weekday: "short"}) + " " + x.getDate() + " " + x.toLocaleString("en-GB", {month: "short"}); }
  function fmtLong(iso) { return new Date(iso + "T12:00:00").toLocaleString("en-GB", {weekday: "long", day: "numeric", month: "long"}); }

  // ---------- the timetable as generated: the baseline every move is measured against ----------
  var BLOCK = {}, BASE_DAY = {}, ORDER = {}, BASE_DUE = {}, BASE_ROUNDS = {};
  var DAY = {}, DATES = [], KIND = {}, BASE_MOD = {};
  QB.days.forEach(function (d) {
    DAY[d.date] = d; DATES.push(d.date); KIND[d.date] = d.kind; BASE_MOD[d.date] = d.module;
    d.blocks.forEach(function (b, i) { BLOCK[b.key] = b; BASE_DAY[b.key] = d.date; ORDER[b.key] = i; });
  });
  Object.keys(QB.sess).forEach(function (id) { BASE_DUE[id] = QB.sess[id].due; });
  Object.keys(QB.sets).forEach(function (sid) { BASE_ROUNDS[sid] = QB.sets[sid].rounds.slice(); });
  var FIRST = DATES[0], LAST = DATES[DATES.length - 1];
  var EXAM_DAYS = DATES.filter(function (iso) { return KIND[iso] === "exam"; });
  var FIRST_EXAM = EXAM_DAYS[0] || null;

  // Each module's exam day, so nothing can be scheduled past the paper it is for.
  // A module with no exam day in the timetable (ENI) is bounded by the last planned day.
  function examOf(mod) { for (var i = 0; i < EXAM_DAYS.length; i++) if (BASE_MOD[EXAM_DAYS[i]] === mod) return EXAM_DAYS[i]; return null; }
  var EXAM = {URO: examOf("URO"), GIL: examOf("GIL"), ENI: examOf("ENI"), OSPE: examOf("OSPE")};
  function lastFor(mod) { return EXAM[mod] ? addDays(EXAM[mod], -1) : LAST; }

  // ---------- her changes ----------
  var M = {v: 1, moveB: {}, moveS: {}, off: {}};
  try {
    var raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw && typeof raw === "object") { M.moveB = raw.moveB || {}; M.moveS = raw.moveS || {}; M.off = raw.off || {}; }
  } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(M)); } catch (e) {} }
  // Drops anything that no longer means something: an id the timetable doesn't have
  // (an old backup), a date outside the plan, or a "move" back to where it started.
  function clean() {
    [["moveB", BASE_DAY], ["moveS", BASE_DUE]].forEach(function (p) {
      var m = M[p[0]], base = p[1];
      Object.keys(m).forEach(function (k) { if (!(k in base) || !DAY[m[k]] || m[k] === base[k]) delete m[k]; });
    });
    Object.keys(M.off).forEach(function (iso) { if (!DAY[iso]) delete M.off[iso]; });
  }

  // ---------- where things actually are ----------
  function dayOfBlock(k) { return M.moveB[k] || BASE_DAY[k]; }
  function dueOf(id) { return M.moveS[id] || BASE_DUE[id]; }
  var SESS_ON = {};
  // Rewrites QB in place from the baseline plus her changes. Idempotent: it always
  // rebuilds from the baseline, so it can be called after every move.
  function project() {
    DATES.forEach(function (iso) { DAY[iso].blocks = []; SESS_ON[iso] = []; });
    Object.keys(BLOCK).forEach(function (k) { DAY[dayOfBlock(k)].blocks.push(BLOCK[k]); });
    DATES.forEach(function (iso) {
      DAY[iso].blocks.sort(function (a, b) {
        return BASE_DAY[a.key] < BASE_DAY[b.key] ? -1 : BASE_DAY[a.key] > BASE_DAY[b.key] ? 1 : ORDER[a.key] - ORDER[b.key];
      });
    });
    Object.keys(QB.sess).forEach(function (id) { var iso = dueOf(id); QB.sess[id].due = iso; SESS_ON[iso].push(id); });
    Object.keys(BASE_ROUNDS).forEach(function (sid) {
      QB.sets[sid].rounds = BASE_ROUNDS[sid].map(function (r) { return [dayOfBlock(sid + "-R" + r[1]), r[1]]; })
        .sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
    });
    DATES.forEach(function (iso) {
      var d = DAY[iso], mods = {};
      d.blocks.forEach(function (b) { mods[b.module] = 1; });
      SESS_ON[iso].forEach(function (id) { var st = QB.sets[QB.sess[id].set]; if (st) mods[st.module] = 1; });
      d.mods = Object.keys(mods);
      d.movedIn = d.blocks.some(function (b) { return BASE_DAY[b.key] !== iso; }) || SESS_ON[iso].some(function (id) { return BASE_DUE[id] !== iso; });
      d.movedOut = false;
    });
    Object.keys(M.moveB).forEach(function (k) { DAY[BASE_DAY[k]].movedOut = true; });
    Object.keys(M.moveS).forEach(function (id) { DAY[BASE_DUE[id]].movedOut = true; });
  }
  clean(); project();

  // ---------- how full a day is ----------
  // Question minutes are measured (the same estimate the set buttons show). The time a
  // session takes to revise is not knowable, so SESSION_W is a fixed weight used only to
  // compare one day with another and with TYPICAL — never shown as a number of minutes.
  var SESSION_W = 12;
  function blockMin(b) { return Math.round(b.questions.reduce(function (x, q) { return x + (q.type === "sa" ? 5 : !q.type ? 6 : q.type === "emq" ? 2.5 : 1.2); }, 0)); }
  function loadOf(iso) {
    var d = DAY[iso]; if (!d) return 0;
    return d.blocks.reduce(function (x, b) { return x + blockMin(b); }, 0) + SESSION_W * (SESS_ON[iso] || []).length;
  }
  // The yardstick: a middling day of the timetable as it was written. Comparing against
  // her own plan means the bands hold however long she actually takes over a session.
  var TYPICAL = (function () {
    var byDay = {};
    Object.keys(BLOCK).forEach(function (k) { byDay[BASE_DAY[k]] = (byDay[BASE_DAY[k]] || 0) + blockMin(BLOCK[k]); });
    Object.keys(BASE_DUE).forEach(function (id) { byDay[BASE_DUE[id]] = (byDay[BASE_DUE[id]] || 0) + SESSION_W; });
    var v = DATES.map(function (iso) { return byDay[iso] || 0; }).filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; });
    return v.length ? v[Math.floor(v.length / 2)] : 240;
  })();
  var BANDS = [[0.55, "quiet", "quiet day", "quiet"], [0.9, "light", "lighter than usual", "lighter"],
    [1.2, "usual", "about usual", "usual"], [1.55, "busy", "busier than usual", "busier"], [99, "heavy", "a heavy day", "heavy"]];
  function band(iso, add) {
    var mins = loadOf(iso) + (add || 0), r = mins / TYPICAL, b = BANDS[BANDS.length - 1];
    for (var i = 0; i < BANDS.length; i++) if (r < BANDS[i][0]) { b = BANDS[i]; break; }
    if (!mins) return {mins: 0, ratio: 0, key: "free", label: "nothing on it", short: "free", pct: 0};
    return {mins: mins, ratio: r, key: b[1], label: b[2], short: b[3], pct: Math.min(100, Math.round(100 * r / 1.6))};
  }

  // ---------- days off and rest ----------
  function offByUser(iso) { return !!M.off[iso]; }
  function hasWork(iso) { return !!(DAY[iso] && (DAY[iso].blocks.length || (SESS_ON[iso] || []).length)); }
  // What the streak treats as a day that doesn't have to be worked. A timetabled rest day
  // stops being one once she has moved work onto it, so that work still counts for her.
  function isRestDay(iso) { return offByUser(iso) || (KIND[iso] === "off" && !hasWork(iso)); }
  function dayKindLabel(iso) {
    if (offByUser(iso)) return "Day off";
    if (KIND[iso] === "off") return hasWork(iso) ? "Rest day, with work moved in" : "Rest day";
    if (KIND[iso] === "exam") return BASE_MOD[iso] === "OSPE" ? "OSPE day" : BASE_MOD[iso] + " exam day";
    return null;
  }

  // ---------- what sits on a day, as movable units ----------
  // A unit is one thing she can pick up and put down: a topic (its sessions and its
  // question set, which belong together), or a paper / OSPE station set on its own.
  function modOfSet(sid) { return QB.sets[sid] ? QB.sets[sid].module : null; }
  function roundOf(key) { var m = /-R(\d)$/.exec(key); return m ? +m[1] : null; }
  function roundDate(sid, r) { var k = sid + "-R" + r; return BLOCK[k] ? dayOfBlock(k) : null; }

  // The window a unit may land in: after whatever must come before it, and before
  // whatever must come after. Nothing may be moved into the past or past its exam.
  function windowOfPart(kind, sid, round, mod) {
    var t = today(), min = t > FIRST ? t : FIRST, max = LAST, why = "";
    if (kind === "sess") {
      var r2 = roundDate(sid, 2);
      if (r2) { max = addDays(r2, -1); why = "before its consolidation day"; }
      else { max = lastFor(mod); why = "before the exam"; }
    } else if (round) {
      var prev = round > 1 ? roundDate(sid, round - 1) : null;
      var next = roundDate(sid, round + 1);
      if (prev && addDays(prev, 1) > min) { min = addDays(prev, 1); }
      if (next) { max = addDays(next, -1); why = round === 1 ? "before its consolidation day" : "before its rapid recall"; }
      else { max = lastFor(mod); why = "before the exam"; }
    } else {
      max = FIRST_EXAM ? addDays(FIRST_EXAM, -1) : LAST; why = "before exam week";
    }
    if (max > LAST) max = LAST;
    return {min: min, max: max, why: why};
  }
  function pinned(key) { return KIND[BASE_DAY[key]] === "exam"; }

  function unitsOn(iso) {
    var out = [], seen = {};
    var blocks = (DAY[iso] ? DAY[iso].blocks : []);
    var bySet = {};
    blocks.forEach(function (b) { if (b.kind === "set") (bySet[b.sid + "|" + roundOf(b.key)] = bySet[b.sid + "|" + roundOf(b.key)] || []).push(b); });
    (SESS_ON[iso] || []).forEach(function (id) { var k = QB.sess[id].set + "|1"; bySet[k] = bySet[k] || []; });
    Object.keys(bySet).forEach(function (k) {
      var sid = k.split("|")[0], round = +k.split("|")[1], mod = modOfSet(sid);
      var bs = bySet[k], ids = round === 1 ? (SESS_ON[iso] || []).filter(function (id) { return QB.sess[id].set === sid; }) : [];
      var keys = bs.map(function (b) { return b.key; });
      var mins = bs.reduce(function (x, b) { return x + blockMin(b); }, 0) + SESSION_W * ids.length;
      var ws = [];
      if (ids.length) ws.push(windowOfPart("sess", sid, 1, mod));
      keys.forEach(function () { ws.push(windowOfPart("block", sid, round, mod)); });
      var w = ws.reduce(function (a, b) { return {min: a.min > b.min ? a.min : b.min, max: a.max < b.max ? a.max : b.max, why: a.why || b.why}; });
      out.push({
        id: "T:" + sid + ":" + round, kind: "topic", sid: sid, round: round, module: mod,
        title: QB.sets[sid].name, label: ["", "First pass", "Consolidation", "Rapid recall"][round],
        sess: ids, blocks: keys, mins: mins, from: iso,
        min: w.min, max: w.max, why: w.why, pinned: keys.some(pinned),
        moved: keys.some(function (x) { return BASE_DAY[x] !== iso; }) || ids.some(function (x) { return BASE_DUE[x] !== iso; }),
        home: keys.length ? BASE_DAY[keys[0]] : (ids.length ? BASE_DUE[ids[0]] : iso)
      });
      seen[k] = 1;
    });
    blocks.forEach(function (b) {
      if (b.kind === "set") return;
      var w = windowOfPart("paper", null, null, b.module);
      out.push({
        id: "B:" + b.key, kind: b.kind, module: b.module, title: b.title, label: b.label,
        sess: [], blocks: [b.key], mins: blockMin(b), from: iso,
        min: w.min, max: w.max, why: w.why, pinned: pinned(b.key),
        moved: BASE_DAY[b.key] !== iso, home: BASE_DAY[b.key]
      });
    });
    out.sort(function (a, b) { return (a.round || 9) - (b.round || 9) || (a.title < b.title ? -1 : 1); });
    return out;
  }

  // Overdue sessions, grouped into units by topic, so catching up moves whole topics.
  function overdueUnits(done) {
    var t = today(), by = {};
    Object.keys(QB.sess).forEach(function (id) {
      if (QB.sess[id].due >= t || done[id]) return;
      (by[QB.sess[id].set] = by[QB.sess[id].set] || []).push(id);
    });
    return Object.keys(by).map(function (sid) {
      var ids = by[sid].sort(), mod = modOfSet(sid), w = windowOfPart("sess", sid, 1, mod);
      return {
        id: "O:" + sid, kind: "topic", sid: sid, round: 1, module: mod,
        title: QB.sets[sid].name, label: "Catch up", sess: ids, blocks: [],
        mins: SESSION_W * ids.length, from: QB.sess[ids[0]].due,
        min: w.min, max: w.max, why: w.why, pinned: false, moved: true, home: BASE_DUE[ids[0]]
      };
    }).sort(function (a, b) { return a.from < b.from ? -1 : 1; });
  }

  // ---------- which days to suggest ----------
  // Two ceilings: how full a day we are happy to make, and how full we will make one
  // when a deadline leaves no choice. A rest day counts as part-full before anything is
  // put on it, so a working day with room always wins and her Saturdays are only offered
  // when the alternative is a heavy day. Sooner beats later, so nothing drifts towards
  // its deadline and first pass keeps its gap before consolidation.
  var CEIL = Math.round(1.15 * TYPICAL), HARD = Math.round(1.5 * TYPICAL), REST_W = Math.round(0.4 * TYPICAL);
  var MIN_CHUNK = 3;   // sessions: don't scatter ones and twos across days
  var MAX_PARTS = 2;   // a topic may be split over two days, not five
  function modMatch(iso, mod) { return (DAY[iso].mods || []).indexOf(mod) >= 0; }
  function restish(iso) { return KIND[iso] === "off" && !hasWork(iso); }
  function candidates(u, opts) {
    var keepRest = opts && opts.rest === false;
    return DATES.filter(function (iso) {
      if (iso < u.min || iso > u.max || iso === u.from) return false;
      if (KIND[iso] === "exam") return false;   // exam days are not hers to fill
      if (offByUser(iso)) return false;         // a day she has said she can't work
      if (keepRest && restish(iso)) return false;
      return true;
    });
  }
  function fill(iso, extra) { return loadOf(iso) + ((extra || {})[iso] || 0) + (restish(iso) ? REST_W : 0); }
  // Emptier is better, the same module on the same day is better, sooner is better, and
  // the last few days before a deadline are worse — a first pass pressed up against its
  // consolidation day is no use, however empty that day looks. Earlier than planned is
  // worse too, and much worse for anything that only works once the rest is done: a
  // consolidation pass or a practice paper two weeks early tests material she hasn't
  // covered yet. She can still pick such a day herself; it is just never suggested.
  function score(iso, mins, u, extra) {
    var early = Math.max(0, between(iso, u.home));
    var firstPass = u.kind === "topic" && u.round === 1;
    return (fill(iso, extra) + mins) / TYPICAL
      - (modMatch(iso, u.module) ? 0.12 : 0)
      + 0.02 * between(today(), iso)
      + 0.06 * Math.max(0, 7 - between(iso, u.max))
      + (firstPass ? 0.03 : 0.12) * early;
  }
  function bestOf(cands, mins, u, extra) {
    var best = null, bs = 0;
    cands.forEach(function (iso) { var s = score(iso, mins, u, extra); if (best === null || s < bs) { best = iso; bs = s; } });
    return best;
  }
  // The recommendation: for each unit, which day or days its parts should go to.
  // Tightest deadline first, and every placement counts towards that day for the units
  // after it — which is what spreads a cleared day over several days instead of one.
  function plan(units, opts) {
    var extra = {}, out = {};
    // minutes already promised to a day by placements she made herself
    if (opts && opts.extra) Object.keys(opts.extra).forEach(function (k) { extra[k] = opts.extra[k]; });
    units.slice().sort(function (a, b) { return a.max === b.max ? (a.from < b.from ? -1 : 1) : (a.max < b.max ? -1 : 1); })
      .forEach(function (u) {
        var cands = candidates(u, opts), parts = [], left = u.sess.slice();
        // A first pass may be pulled a little earlier; a consolidation pass or a paper
        // may not — they only work once the first pass is behind them.
        if (!(u.kind === "topic" && u.round === 1)) cands = cands.filter(function (iso) { return iso >= u.home; });
        var bmins = u.blocks.reduce(function (x, k) { return x + blockMin(BLOCK[k]); }, 0);
        function partOn(iso) { for (var i = 0; i < parts.length; i++) if (parts[i].date === iso) return parts[i]; return null; }
        function put(iso, ids, keys) {
          var p = partOn(iso);
          if (!p) { p = {date: iso, sess: [], blocks: [], mins: 0}; parts.push(p); }
          p.sess = p.sess.concat(ids); p.blocks = p.blocks.concat(keys);
          var m = SESSION_W * ids.length + keys.reduce(function (x, k) { return x + blockMin(BLOCK[k]); }, 0);
          p.mins += m; extra[iso] = (extra[iso] || 0) + m;
        }
        [CEIL, HARD].forEach(function (ceil) {
          cands.forEach(function (iso) {
            if (!left.length) return;
            if (parts.length >= MAX_PARTS && !partOn(iso)) return;
            var n = Math.floor((ceil - fill(iso, extra)) / SESSION_W);
            if (n < 1 || (n < MIN_CHUNK && left.length > n)) return;
            // don't leave a stray session or two for a second day: either split it evenly
            // or, if the topic is small enough, let this day carry the lot
            if (n < left.length && left.length - n < MIN_CHUNK) {
              if (left.length - MIN_CHUNK >= MIN_CHUNK) n = left.length - MIN_CHUNK;
              else if (fill(iso, extra) + SESSION_W * left.length <= HARD) n = left.length;
            }
            put(iso, left.splice(0, n), []);
          });
        });
        // Nowhere inside the deadline has room: put the rest on the least full day there is.
        if (left.length) put(bestOf(cands, SESSION_W * left.length, u, extra) || u.max, left.splice(0), []);
        if (bmins) {
          // A topic's questions belong with its sessions: they go on the day the last of
          // them lands, even if that day ends up a little fuller than the ceiling, and
          // only slide to a later day if that would make it a heavy one.
          var after = parts.length ? parts[parts.length - 1].date : null;
          var home = after && (fill(after, extra) + bmins <= HARD) ? after : null;
          var ok = cands.filter(function (iso) { return !after || iso >= after; });
          [CEIL, HARD].forEach(function (ceil) {
            if (home) return;
            for (var i = 0; i < ok.length; i++) if (ceil - fill(ok[i], extra) >= bmins) { home = ok[i]; break; }
          });
          if (!home) home = after || bestOf(cands, bmins, u, extra) || u.max;
          put(home, [], u.blocks);
        }
        parts.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
        out[u.id] = parts;
      });
    return out;
  }
  // The days to offer as chips when she is placing one unit herself, best first.
  function bestDays(u, n, opts) {
    return candidates(u, opts).map(function (iso) { return [iso, score(iso, u.mins, u, null)]; })
      .sort(function (a, b) { return a[1] - b[1]; }).slice(0, n || 3).map(function (x) { return x[0]; });
  }
  // Every day she may pick for a unit, with what each one would then feel like.
  function options(u) {
    return DATES.filter(function (iso) { return iso >= u.min && iso <= u.max; }).map(function (iso) {
      return {
        date: iso, band: band(iso, u.mins), rest: restish(iso), off: offByUser(iso),
        exam: KIND[iso] === "exam", here: iso === u.from, last: iso === u.max,
        blocked: KIND[iso] === "exam" || offByUser(iso)
      };
    });
  }

  // ---------- changing things ----------
  function state() { return JSON.parse(JSON.stringify({moveB: M.moveB, moveS: M.moveS, off: M.off})); }
  function setState(s) { M.moveB = s.moveB || {}; M.moveS = s.moveS || {}; M.off = s.off || {}; clean(); save(); project(); }
  // moves: [{sess:[ids], blocks:[keys], to:iso}] — returns the state to pass to undo().
  function move(moves) {
    var before = state();
    moves.forEach(function (m) {
      if (!m.to || !DAY[m.to]) return;
      (m.blocks || []).forEach(function (k) { if (!pinned(k)) M.moveB[k] = m.to; });
      (m.sess || []).forEach(function (id) { if (id in BASE_DUE) M.moveS[id] = m.to; });
    });
    clean(); save(); project();
    return before;
  }
  function putBack(units) {
    var before = state();
    units.forEach(function (u) {
      (u.blocks || []).forEach(function (k) { delete M.moveB[k]; });
      (u.sess || []).forEach(function (id) { delete M.moveS[id]; });
    });
    clean(); save(); project();
    return before;
  }
  function setOff(iso, on) {
    var before = state();
    if (on) M.off[iso] = 1; else delete M.off[iso];
    clean(); save(); project();
    return before;
  }
  function resetAll() { var before = state(); M.moveB = {}; M.moveS = {}; M.off = {}; save(); project(); return before; }

  // ---------- what she has changed, for Settings and for the backup ----------
  function movedUnits() {
    var days = {}, out = [];
    Object.keys(M.moveB).forEach(function (k) { days[dayOfBlock(k)] = 1; });
    Object.keys(M.moveS).forEach(function (id) { days[dueOf(id)] = 1; });
    Object.keys(days).sort().forEach(function (iso) {
      unitsOn(iso).forEach(function (u) { if (u.moved) out.push(u); });
    });
    return out;
  }
  function counts() {
    var u = movedUnits();
    return {units: u.length, off: Object.keys(M.off).length, blocks: Object.keys(M.moveB).length, sess: Object.keys(M.moveS).length};
  }
  // The streak rescue: the working days just gone that she did nothing on — a funeral is
  // rarely one day — and the run they interrupted. Marking them off keeps that run, and
  // never adds a day to it. Nothing to rescue unless a run of at least two was going.
  function missedDays(daysDone) {
    var t = today(), miss = [], ran = 0, j = 1, iso;
    for (; j <= 8; j++) {
      iso = addDays(t, -j);
      if (!DAY[iso]) break;
      if (isRestDay(iso)) continue;
      if (daysDone[iso]) break;
      miss.push(iso);
    }
    if (!miss.length || miss.length > 5) return null;
    for (; j <= 30; j++) {              // j now sits on the last day she did work
      iso = addDays(t, -j);
      if (!DAY[iso]) break;
      if (isRestDay(iso)) continue;
      if (!daysDone[iso]) break;
      ran++;
    }
    miss.sort();
    return ran >= 2 ? {dates: miss, had: ran} : null;
  }

  window.QBSched = {
    SESSION_W: SESSION_W, TYPICAL: TYPICAL, FIRST: FIRST, LAST: LAST, FIRST_EXAM: FIRST_EXAM,
    dates: DATES, dayKind: function (iso) { return KIND[iso]; }, baseModule: function (iso) { return BASE_MOD[iso]; },
    baseDayOf: function (k) { return BASE_DAY[k]; }, baseDueOf: function (id) { return BASE_DUE[id]; },
    dayOfBlock: dayOfBlock, dueOf: dueOf, sessOn: function (iso) { return SESS_ON[iso] || []; },
    blockMin: blockMin, loadOf: loadOf, band: band, hasWork: hasWork,
    isRestDay: isRestDay, offByUser: offByUser, dayKindLabel: dayKindLabel,
    unitsOn: unitsOn, overdueUnits: overdueUnits, plan: plan, bestDays: bestDays, options: options,
    move: move, putBack: putBack, setOff: setOff, resetAll: resetAll, undo: setState,
    movedUnits: movedUnits, counts: counts, missedDays: missedDays, project: project,
    offDays: function () { return Object.keys(M.off).sort(); },
    pinned: pinned, fmtShort: fmtShort, fmtLong: fmtLong, addDays: addDays, today: today, between: between,
    snapshot: function () { return state(); },
    restore: function (x) {
      if (!x || typeof x !== "object") return 0;
      var n = 0;
      ["moveB", "moveS", "off"].forEach(function (k) {
        var src = x[k] || {};
        Object.keys(src).forEach(function (id) { if (!(id in M[k])) { M[k][id] = src[id]; n++; } });
      });
      clean(); save(); project(); return n;
    }
  };
})();
