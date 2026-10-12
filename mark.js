/* Lenient marking for fill-in-the-blank answers.
   window.QBMark.match(response, candidates) -> {ok, exact, target}
     ok     the response counts as correct
     exact  it matched a candidate once spelling variants are folded (false = accepted as a near miss)
     target the candidate it matched, to show the correct spelling

   Steps, from strictest to most lenient:
   1. Fold differences that never change meaning: case, spaces, hyphens, apostrophes, British/US
      spelling, simple plurals, Greek letters, number words, thousand separators, and filler words
      such as "the", "cells", "gland".
   2. Allow typos by edit distance (Damerau-Levenshtein), scaled to word length: none up to 4 letters,
      1 up to 8, 2 beyond. The first letter must match and numbers must match exactly.
   3. Vetoes that beat step 2: the response is a different real term from the question bank, the
      response is closer to an opposite term (hypo/hyper, blast/clast, -ase/-ose ...), or it adds a
      negation (an-, non-, "not"). */
(function () {
  "use strict";

  var GREEK = {"α":"alpha","β":"beta","γ":"gamma","δ":"delta","ε":"epsilon","θ":"theta","κ":"kappa","λ":"lambda","μ":"mu","σ":"sigma","τ":"tau","ω":"omega"};
  var NUMWORD = {zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,
    sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,hundred:100,thousand:1000};
  // words that add nothing to an answer when the expected answer leaves them out (or vice versa)
  var FILLER = {};
  ("the a an of cell cells gland glands muscle muscles nerve nerves duct ducts layer layers phase stage region tissue tissues " +
   "hormone hormones enzyme enzymes receptor receptors fibre fibres fiber fibers level levels concentration concentrations")
    .split(" ").forEach(function (w) { FILLER[w] = 1; });
  var NEGATE = {not:1, no:1, non:1, never:1, without:1};
  // pairs of word parts that flip the meaning; a response nearer the swapped form is wrong
  var CONTRAST = [["hypo","hyper"],["inter","intra"],["endo","ecto"],["endo","exo"],["ecto","meso"],["endo","meso"],["ab","ad"],["ante","anti"],
    ["pre","post"],["blast","clast"],["blast","cyte"],["clast","cyte"],["ase","ose"],["ol","one"],["itis","osis"],["emia","uria"],["trophy","plasia"],
    ["ileum","ilium"],["ileo","ilio"],["ana","cata"],["brady","tachy"],["poly","oligo"],["ostomy","otomy"],["ectomy","otomy"],["ectomy","ostomy"],
    ["philic","phobic"],["genic","lytic"],["agonist","antagonist"],["sympathetic","parasympathetic"],["in","ex"],["supra","infra"],["mesial","distal"]];
  var NEG_PREFIX = ["an","a","non","un","dis","de","in","im","nor"];
  // real terms that are one or two letters from common answers but absent from the bank's own text
  var SOUNDALIKE = "inulin ilium ileum prostrate peroneal dysphasia aphasia aphagia palpitation tropic mucous callous vesicle " +
    "cortisone meiosis creatine creatinine perfusion profusion humeral humerus osteoblast osteoclast efferent afferent abduction adduction";

  // ---------- normalising ----------
  function stem(w) {
    if (/^\d/.test(w) || w.length < 4) return w;
    if (/ies$/.test(w)) return w.slice(0, -3) + "y";
    if (/(ss|x|ch|sh)es$/.test(w)) return w.slice(0, -2);
    if (/ae$/.test(w)) return w.slice(0, -1);
    if (/s$/.test(w) && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function fold(w) {
    if (/^\d/.test(w)) return w;
    return w.replace(/ae/g, "e").replace(/oe/g, "e").replace(/sulph/g, "sulf")
      .replace(/is(e|ed|es|ing|ation|ations)$/, "iz$1").replace(/ys(e|ed|es|ing)$/, "yz$1")
      .replace(/our$/, "or").replace(/([^aeiou])re$/, "$1er");
  }
  function words(s, folded) {
    s = String(s == null ? "" : s).toLowerCase().replace(/[αβγδεθκλμστω]/g, function (c) { return " " + GREEK[c] + " "; })
      .replace(/['’`]/g, "").replace(/(\d)[, ](?=\d{3}(?!\d))/g, "$1");
    return (s.match(/\d+(?:\.\d+)?|[a-z]+/g) || []).map(function (w) {
      if (NUMWORD.hasOwnProperty(w)) return String(NUMWORD[w]);
      if (/^\d/.test(w)) return String(parseFloat(w));
      return folded ? fold(stem(w)) : stem(w);
    });
  }
  function tokens(s) { return words(s, true); }
  // each word as {f: spelling-folded, raw: unfolded}; folding is only for equality, since it can distort a typo
  function pairs(s) { var f = words(s, true), raw = words(s, false); return f.map(function (w, i) { return {f: w, raw: raw[i]}; }); }
  function isNum(w) { return /^\d/.test(w); }

  // ---------- distance ----------
  function dl(a, b) { // optimal string alignment distance (Damerau-Levenshtein with adjacent swaps)
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) { d[i] = [i]; }
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) {
      var c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[m][n];
  }
  function allowance(len) { return len <= 4 ? 0 : len <= 8 ? 1 : 2; }

  // ---------- the bank's own vocabulary: a response that is one of these words is a real term, not a typo ----------
  var LEX = null;
  function lexicon() {
    if (LEX) return LEX;
    LEX = {};
    tokens(SOUNDALIKE).forEach(function (w) { LEX[w] = 1; });
    var stack = [window.QB, window.DATA];
    while (stack.length) {
      var v = stack.pop();
      if (typeof v === "string") tokens(v).forEach(function (w) { if (w.length >= 4 && !isNum(w)) LEX[w] = 1; });
      else if (v && typeof v === "object") for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) stack.push(v[k]);
    }
    return LEX;
  }

  // does a sit nearer an opposite form of b than b itself?
  function flips(a, b) {
    var base = dl(a, b);
    for (var i = 0; i < CONTRAST.length; i++) for (var s = 0; s < 2; s++) {
      var x = CONTRAST[i][s], y = CONTRAST[i][1 - s], at = b.indexOf(x);
      while (at >= 0) {
        var alt = b.slice(0, at) + y + b.slice(at + x.length);
        var da = dl(a, alt);
        if (alt !== b && (da < base || (da === base && lexicon()[alt]))) return true;
        at = b.indexOf(x, at + 1);
      }
    }
    for (var p = 0; p < NEG_PREFIX.length; p++) {
      var q = NEG_PREFIX[p];
      if (a === q + b || b === q + a) return true;
    }
    return false;
  }

  // a near miss on one word: a typed, b expected (both as written and spelling-folded)
  function near(a, b) { return !isNum(a) && !isNum(b) && a[0] === b[0] && dl(a, b) <= allowance(b.length) && !flips(a, b); }
  function close(a, b) {
    if (a.f === b.f) return true;
    if (lexicon()[a.f]) return false;
    return near(a.raw, b.raw) || near(a.f, b.f);
  }

  // compare one response with one candidate answer
  function compare(rp, cp) {
    var inR = {}, inC = {};
    rp.forEach(function (w) { inR[w.f] = 1; }); cp.forEach(function (w) { inC[w.f] = 1; });
    rp = rp.filter(function (w) { return !(FILLER[w.f] && !inC[w.f]); });
    cp = cp.filter(function (w) { return !(FILLER[w.f] && !inR[w.f]); });
    if (!rp.length || !cp.length) return null;
    var r = rp.map(function (w) { return w.f; }), c = cp.map(function (w) { return w.f; });
    if (r.join("") === c.join("")) return {exact: true};

    if (r.length === c.length) { // word by word, any order
      var used = [], exact = true, ok = cp.every(function (w) {
        for (var i = 0; i < rp.length; i++) if (!used[i] && rp[i].f === w.f) { used[i] = 1; return true; }
        for (var j = 0; j < rp.length; j++) if (!used[j] && close(rp[j], w)) { used[j] = 1; exact = false; return true; }
        return false;
      });
      if (ok) return {exact: exact};
    }

    // spacing differs ("glucuronosyl transferase"): compare the run-together words, numbers excluded
    if (r.some(isNum) || c.some(isNum)) return null;
    var b = c.join(""), lex = lexicon();
    if (r.some(function (w) { return lex[w] && b.indexOf(w) < 0; })) return null;
    var raw = function (p) { return p.map(function (w) { return w.raw; }).join(""); };
    return near(raw(rp), raw(cp)) || near(r.join(""), b) ? {exact: false} : null;
  }

  // "zymogen (proenzyme)" also accepts plain "zymogen"
  function candidates(list) {
    var out = [];
    list.forEach(function (s) { if (s == null) return; s = String(s); out.push(s);
      var bare = s.replace(/\s+\([^)]*\)/g, "").trim(); if (bare && bare !== s) out.push(bare); });
    return out;
  }

  function match(response, list) {
    var r = pairs(response);
    if (!r.length) return {ok: false};
    var cands = candidates(list), best = null;
    for (var i = 0; i < cands.length; i++) {
      var c = pairs(cands[i]);
      if (r.some(function (w) { return NEGATE[w.f]; }) && !c.some(function (w) { return NEGATE[w.f]; })) continue;
      var m = compare(r, c);
      if (m && m.exact) return {ok: true, exact: true, target: cands[i]};
      if (m && !best) best = {ok: true, exact: false, target: cands[i]};
    }
    return best || {ok: false};
  }

  window.QBMark = {match: match, tokens: tokens, dl: dl};
})();
