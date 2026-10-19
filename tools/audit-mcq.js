#!/usr/bin/env node
/* Checks the single-best-answer (SBA) questions for clues that give the answer away without
   knowing the subject, the "test-wise" flaws in the NBME item-writing guide.

   Usage:  node tools/audit-mcq.js [questions.js] [--list] [--json]
     --list  print every question that breaks a rule, with the rules it breaks
     --json  print the per-question results as JSON (for scripts)
   Exits 1 when the bank as a whole fails a target, so it can gate a change.

   Per-question rules (an SBA that breaks any of them is "flagged"):
     long      the answer is more than 10% longer than the longest wrong option, or more than 25%
               longer than the average wrong option
     short     the answer is less than 75% of the average wrong option (the opposite giveaway)
     brackets  the answer has brackets and fewer than two wrong options do
     hedge     the answer has a hedge word (usually, may, typically...) and fewer than two wrong options do
     absolute  a wrong option has an absolute word (only, never, always...) and the answer has none
     above     an option is "all of the above" / "none of the above"

   Bank-level targets, measured against chance (1 in 5 for five options):
     the answer is the longest option in at most 25% of questions
     a test-wise strategy that never reads the stem scores at most 30% */
"use strict";
var fs = require("fs"), path = require("path");

var HEDGE = /\b(usually|may|can|often|typically|mainly|largely|partly|generally|mostly|predominantly|relatively|tends? to)\b/i;
var ABSOLUTE = /\b(always|never|only|all|none|completely|entirely|solely|every|exclusively)\b/i;
var ABOVE = /\b(all|none|both) of the (above|options)\b/i;
var BRACKET = /\(/;

function check(q) {
  var key = q.options[q.answer], wrong = q.options.filter(function (_, i) { return i !== q.answer; });
  var kl = key.length, wl = wrong.map(function (s) { return s.length; });
  var mean = wl.reduce(function (a, b) { return a + b; }, 0) / wl.length, max = Math.max.apply(null, wl);
  var count = function (re) { return wrong.filter(function (s) { return re.test(s); }).length; };
  var fails = [];
  if (kl > 1.10 * max || kl > 1.25 * mean) fails.push("long");
  if (kl < 0.75 * mean) fails.push("short");
  if (BRACKET.test(key) && count(BRACKET) < 2) fails.push("brackets");
  if (HEDGE.test(key) && count(HEDGE) < 2) fails.push("hedge");
  if (!ABSOLUTE.test(key) && count(ABSOLUTE) > 0) fails.push("absolute");
  if (q.options.some(function (s) { return ABOVE.test(s); })) fails.push("above");
  return {id: q.id, fails: fails, ratio: +(kl / mean).toFixed(2), longest: kl > max, shortest: kl < Math.min.apply(null, wl)};
}

// What a student who never reads the stem would pick: the longest option, preferring ones with
// brackets or hedges and avoiding ones with absolutes. Ties go to the first option.
function guess(q) {
  var best = -1, bi = 0;
  q.options.forEach(function (s, i) {
    var sc = s.length * (BRACKET.test(s) ? 1.15 : 1) * (HEDGE.test(s) ? 1.15 : 1) * (ABSOLUTE.test(s) ? 0.6 : 1);
    if (sc > best) { best = sc; bi = i; }
  });
  return bi;
}

module.exports = {check: check, guess: guess};
if (require.main !== module) return;

var args = process.argv.slice(2);
var file = args.filter(function (a) { return a.indexOf("--") !== 0; })[0] || path.join(__dirname, "..", "questions.js");
var LIST = args.indexOf("--list") >= 0, JSON_OUT = args.indexOf("--json") >= 0;

var window = {};
new Function("window", fs.readFileSync(file, "utf8"))(window);

var sba = [], emq = [];
(function walk(o) {
  if (Array.isArray(o)) return o.forEach(walk);
  if (!o || typeof o !== "object") return;
  if (o.type === "sba" && o.id) sba.push(o);
  else if (o.type === "emq" && o.id) emq.push(o);
  Object.keys(o).forEach(function (k) { walk(o[k]); });
})(window.QB);

var res = sba.map(check);
var pct = function (n, d) { return d ? (100 * n / d).toFixed(1) + "%" : "-"; };
var n = sba.length;
var flagged = res.filter(function (r) { return r.fails.length; });
var longest = res.filter(function (r) { return r.longest; }).length;
var shortest = res.filter(function (r) { return r.shortest; }).length;
var guessed = sba.filter(function (q) { return guess(q) === q.answer; }).length;
var meanRatio = res.reduce(function (a, r) { return a + r.ratio; }, 0) / n;
var byRule = {};
res.forEach(function (r) { r.fails.forEach(function (f) { byRule[f] = (byRule[f] || 0) + 1; }); });

var emqItems = 0, emqLongest = 0, emqChance = 0;
emq.forEach(function (q) {
  var L = q.options.map(function (s) { return s.length; }), max = Math.max.apply(null, L);
  q.items.forEach(function (it) { emqItems++; emqChance += 1 / q.options.length; if (L[it.answer] === max) emqLongest++; });
});

var targets = [
  ["Answer is the longest option", longest / n, 0.25],
  ["Stem-blind strategy score", guessed / n, 0.30]
];
var ok = targets.every(function (t) { return t[1] <= t[2]; });

if (JSON_OUT) {
  console.log(JSON.stringify({n: n, flagged: flagged.length, longest: longest, guessed: guessed, results: res}, null, 1));
} else {
  console.log("Single best answer questions: " + n);
  console.log("  Flagged (break at least one rule): " + flagged.length + " (" + pct(flagged.length, n) + ")");
  Object.keys(byRule).sort().forEach(function (k) { console.log("    " + k + ": " + byRule[k]); });
  console.log("  Answer is the longest option:  " + pct(longest, n) + "   (target <= 25%, chance 20%)");
  console.log("  Answer is the shortest option: " + pct(shortest, n));
  console.log("  Answer length / average wrong option length: " + meanRatio.toFixed(2) + "   (1.00 = equal)");
  console.log("  Stem-blind strategy score:     " + pct(guessed, n) + "   (target <= 30%, chance 20%)");
  console.log("Extended matching items: " + emqItems + ", answer is the longest option " + pct(emqLongest, emqItems) + " (chance " + pct(emqChance, emqItems) + ")");
  console.log(ok ? "PASS" : "FAIL");
  if (LIST) flagged.forEach(function (r) { console.log(r.id + "  " + r.fails.join(",") + "  ratio " + r.ratio); });
}
process.exit(ok ? 0 : 1);
