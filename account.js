/* Accounts: sign in with Google, Microsoft, or a code sent by email (Supabase Auth).
   Off unless config.js has a Supabase URL and anon key. Signing in does not sync progress yet;
   progress stays on the phone exactly as before.

   Why an email code and not a magic link: an iPhone home-screen app has storage separate from Safari,
   and a link in an email opens Safari, so the sign-in would land in Safari instead of the app.
   A typed code completes inside the app. Google and Microsoft sign-in leave the app for their own
   page, which can hit the same problem on iPhone, so the code stays as the dependable fallback.

   Exposes window.Account = {enabled, renderInto(el), open()} for the Settings screen in qb.js. */
(function () {
  "use strict";
  var C = window.APP_CONFIG || {};
  if (!C.supabaseUrl || !C.supabaseAnonKey) { window.Account = {enabled: false}; return; }

  var SYNC_READY = false; // flips when progress sync is built; until then the copy says so
  var LIB = "vendor/supabase-2.117.2.js"; // only loaded when accounts are switched on
  var client = null, session = null, mountEl = null, failed = false;
  var PROVIDER = {google: "Google", azure: "Microsoft", email: "email code"};

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
  function toast(msg, ms) { if (window.qbToast) window.qbToast(msg, ms); }
  function returnUrl() { return location.origin + location.pathname; }

  // ---------- coming back from Google / Microsoft ----------
  // Supabase reports a failed provider sign-in as ?error=...&error_description=... (or in the #hash).
  function readReturn() {
    var q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.replace(/^#/, ""));
    var err = q.get("error") || h.get("error"), desc = q.get("error_description") || h.get("error_description") || "";
    return err ? {error: err, desc: desc} : null;
  }
  // after Supabase has read the URL, take codes and errors out of the address bar
  function tidyUrl() { if (/[?#&](code|error|access_token)=/.test(location.href)) history.replaceState(null, "", returnUrl()); }
  // Microsoft's codes for "your organisation must approve this app" (AADSTS65001, 90094, 90095)
  function needsAdmin(r) { return /AADSTS(65001|90094|90095)|admin|approv|consent/i.test(r.desc + " " + r.error); }

  // ---------- the note about work and university Microsoft accounts ----------
  var FLAG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4h13l-2.5 4L18 12H5"/></svg>';
  function adminNote(strong) {
    return '<div class="q-flagnote' + (strong ? " hl" : "") + '" role="note">' + FLAG + "<div><b>University or work Microsoft account?</b> " +
      "Some organisations need IT admin approval before a new app can use their accounts. If you see <i>Need admin approval</i>, " +
      "come back here and sign in with a personal Google or Microsoft account, or with an email code instead.</div></div>";
  }

  // ---------- sign-in sheet ----------
  var GOOGLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.4-.2-2H12v3.9h6c-.1 1-.8 2.5-2.3 3.5v2.8h3.7c2.1-2 3.2-4.9 3.2-8.2z"/><path fill="#34A853" d="M12 23c3 0 5.6-1 7.4-2.7l-3.7-2.8c-1 .7-2.3 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2v2.9C3.8 20.6 7.6 23 12 23z"/><path fill="#FBBC05" d="M5.8 14.1c-.2-.7-.4-1.4-.4-2.1s.1-1.5.4-2.1V7H2C1.3 8.5.9 10.2.9 12s.4 3.5 1.1 5l3.8-2.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2C17.6 2.1 15 1 12 1 7.6 1 3.8 3.4 2 7l3.8 2.9C6.7 7.3 9.1 5.4 12 5.4z"/></svg>';
  var MSFT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#F25022" d="M2 2h9.5v9.5H2z"/><path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z"/><path fill="#00A4EF" d="M2 12.5h9.5V22H2z"/><path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z"/></svg>';

  function sheet(html) {
    var sh = $("q-sheet");
    sh.className = "q-sheet qb"; sh.innerHTML = '<div class="q-sbox q-acct" role="dialog" aria-label="Sign in">' + html + "</div>"; sh.hidden = false;
    sh.onclick = function (e) { if (e.target === sh) sh.hidden = true; };
    return sh;
  }

  function open(ret) {
    var admin = ret && needsAdmin(ret);
    var alert = !ret ? "" : '<div class="q-acct-err" role="alert">' + (admin
      ? "<b>Microsoft sign-in didn't finish.</b> Your organisation needs IT admin approval for this app."
      : "<b>Sign-in didn't finish.</b> " + esc(ret.desc || ret.error).slice(0, 200)) + "</div>";
    var sh = sheet('<h3>Sign in</h3><p>Use whichever suits you. ' + (SYNC_READY ? "Your progress then follows you to any device." : "Your progress stays on this phone either way.") + "</p>" + alert +
      '<div class="q-oauth"><button class="q-btn" data-oauth="google">' + GOOGLE + 'Continue with Google</button><button class="q-btn" data-oauth="azure">' + MSFT + "Continue with Microsoft</button></div>" +
      adminNote(admin) +
      '<div class="q-or"><span>or</span></div><div id="q-otp"></div><div class="q-row"><button class="q-btn wide" data-close>Not now</button></div>');
    sh.querySelector("[data-close]").onclick = function () { sh.hidden = true; };
    [].forEach.call(sh.querySelectorAll("[data-oauth]"), function (b) { b.onclick = function () { oauth(b.dataset.oauth, b); }; });
    emailStep();
  }

  function oauth(provider, btn) {
    btn.disabled = true;
    // prompt=select_account shows the account picker, so someone turned away by admin approval can pick a personal account
    var opts = {redirectTo: returnUrl(), queryParams: {prompt: "select_account"}};
    if (provider === "azure") opts.scopes = "email"; // Supabase needs the email scope from Microsoft
    client.auth.signInWithOAuth({provider: provider, options: opts}).then(function (r) {
      if (r.error) { btn.disabled = false; showErr(r.error.message); }
    });
  }

  function showErr(msg) {
    var box = $("q-otp-msg"); if (box) { box.textContent = msg; box.hidden = false; }
  }

  function emailStep(email) {
    var el = $("q-otp");
    el.innerHTML = '<label class="q-acct-l" for="q-email">Email me a code</label><input id="q-email" class="q-acct-in" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" value="' + esc(email || "") + '">' +
      '<p class="q-acct-msg" id="q-otp-msg" role="alert" hidden></p><button class="q-btn pri q-acct-go" data-send>Send code</button>';
    var inp = $("q-email"), go = el.querySelector("[data-send]");
    function send() {
      var v = inp.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return showErr("Check the email address.");
      go.disabled = true; go.textContent = "Sending…";
      client.auth.signInWithOtp({email: v, options: {shouldCreateUser: true}}).then(function (r) {
        if (r.error) { go.disabled = false; go.textContent = "Send code"; return showErr(r.error.message); }
        codeStep(v);
      });
    }
    go.onclick = send; inp.onkeydown = function (e) { if (e.key === "Enter") send(); };
  }

  function codeStep(email) {
    var el = $("q-otp");
    el.innerHTML = '<label class="q-acct-l" for="q-code">Enter the code sent to <b>' + esc(email) + '</b></label>' +
      '<input id="q-code" class="q-acct-in code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456">' +
      '<p class="q-acct-msg" id="q-otp-msg" role="alert" hidden></p><button class="q-btn pri q-acct-go" data-verify>Sign in</button>' +
      '<div class="q-acct-links"><button data-again>Use a different email</button><button data-resend disabled>Send a new code</button></div>' +
      '<p class="q-hint2">Check your junk folder if it hasn\'t arrived. The code works for an hour.</p>';
    var inp = $("q-code"), go = el.querySelector("[data-verify]"), rs = el.querySelector("[data-resend]");
    setTimeout(function () { inp.focus(); }, 50);
    setTimeout(function () { rs.disabled = false; }, 60000); // Supabase allows one code a minute
    function verify() {
      var code = inp.value.replace(/\D/g, "");
      if (code.length < 6) return showErr("The code is 6 digits.");
      go.disabled = true; go.textContent = "Checking…";
      client.auth.verifyOtp({email: email, token: code, type: "email"}).then(function (r) {
        if (r.error) { go.disabled = false; go.textContent = "Sign in"; return showErr(/expired|invalid/i.test(r.error.message) ? "That code is wrong or has expired. Check it, or send a new one." : r.error.message); }
        $("q-sheet").hidden = true;
      });
    }
    go.onclick = verify; inp.onkeydown = function (e) { if (e.key === "Enter") verify(); };
    el.querySelector("[data-again]").onclick = function () { emailStep(email); };
    rs.onclick = function () { rs.disabled = true; client.auth.signInWithOtp({email: email}).then(function (r) {
      if (r.error) showErr(r.error.message); else showErr("New code sent."); setTimeout(function () { rs.disabled = false; }, 60000); }); };
  }

  // ---------- the Account group in Settings ----------
  function providerOf(s) { var p = s.user && s.user.app_metadata && s.user.app_metadata.provider; return PROVIDER[p] || p || ""; }
  function renderInto(el) {
    mountEl = el || mountEl; if (!mountEl || !document.body.contains(mountEl)) return;
    if (!client) {
      mountEl.innerHTML = '<div class="q-srow"><span><b>Account</b><small>' + (failed ? "Sign-in needs a connection. Try again when you're online." : "Loading…") + "</small></span></div>";
      return;
    }
    if (session) {
      mountEl.innerHTML = '<div class="q-srow"><span><b>' + esc(session.user.email || "Signed in") + "</b><small>Signed in with " + esc(providerOf(session)) +
        (SYNC_READY ? "" : " · progress still saves on this phone only") + '</small></span></div><button class="q-srow q-link" data-signout><span><b>Sign out</b><small>Your progress on this phone stays</small></span></button>';
      mountEl.querySelector("[data-signout]").onclick = function () { client.auth.signOut().then(function () { toast("Signed out."); }); };
    } else {
      mountEl.innerHTML = '<button class="q-srow q-link" data-signin><span><b>Sign in or create an account</b><small>Google, Microsoft, or a code by email' +
        (SYNC_READY ? "" : ". Syncing progress between devices is coming next.") + '</small></span><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>';
      mountEl.querySelector("[data-signin]").onclick = function () { open(); };
    }
  }

  function start() {
    client = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, {
      auth: {flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, storageKey: "nicole-revision-auth"}
    });
    client.auth.onAuthStateChange(function (event, s) {
      var was = !!session; session = s;
      if (event === "SIGNED_IN" && !was) toast("Signed in as " + (s && s.user.email || "you") + ".");
      renderInto();
    });
    var ret = readReturn();
    client.auth.getSession().then(function (r) { session = r.data.session; tidyUrl(); renderInto(); if (ret) open(ret); });
  }
  var tag = document.createElement("script");
  tag.src = LIB;
  tag.onload = start;
  tag.onerror = function () { failed = true; renderInto(); }; // offline on a first launch: try again next time
  document.head.appendChild(tag);

  window.Account = {enabled: true, renderInto: renderInto, open: function (r) { if (client) open(r); }};
})();
