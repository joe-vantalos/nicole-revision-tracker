# Nicole's Revision Tracker — phone app

A PWA: a web app she installs to her home screen. It opens full screen with no
address bar, works with no signal, and keeps her progress on her phone.

## What's here

    index.html              the app (the original tracker plus the app plumbing)
    manifest.webmanifest    name, icon and colours the phone reads when installing
    sw.js                   service worker — makes it load instantly and work offline
    icons/                  home screen icons (icons/src/ holds the SVG originals)

## How it stores progress

Ticks and flags go into `localStorage` on her phone, under these keys:

    nicole-revision-v1          ticked items
    nicole-revision-flags-v1    flagged items
    nicole-revision-open        which weeks are expanded
    nicole-revision-theme       light/dark choice

There is no server and no account. This is why it is instant — a tick is a
local write, never a network call. The trade-off is that progress lives on
that one phone, which is what the in-app backup is for.

## Deploying (GitHub Pages)

Any static host over HTTPS works. HTTPS is required — a service worker will
not register without it, so on plain HTTP you lose the offline support and
the ability to install it properly.

What goes up is the *contents* of this folder, with `index.html` at the root
of the published site. Nothing needs building.

1. Go to <https://github.com/new>. Name it `revision-tracker`. Set it to
   **Public** — GitHub Pages only serves public repos on a free account.
   Leave every "Initialize this repository with…" box unticked. Create it.
2. On the empty repo page, click the **uploading an existing file** link.
3. Open this folder in Finder, press Cmd+A to select everything inside it,
   and drag it onto the drop zone in the browser. The `icons` folder must
   ride along with the rest — check it is listed before committing.
   (`icons/src/` is optional; it only holds the SVG originals.)
4. Click **Commit changes**.
5. Go to **Settings → Pages**. Under "Build and deployment", set Source to
   **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
   If an **Enforce HTTPS** checkbox appears lower down, tick it.
6. Wait a minute or two, then open
   `https://<your-username>.github.io/revision-tracker/`.
   A 404 in the first minute is normal — refresh.
7. On her iPhone, open that URL in Safari, then Share → Add to Home Screen.

### Keep the URL fixed

Browser storage is tied to the origin, so the address is load-bearing.
Renaming the repo, moving to a custom domain, or publishing from a different
folder changes the URL, and the app then opens to an empty tally — her ticks
are still sitting under the old address, unreachable from the new one.

If you ever have to move it: export a backup from the old URL first, then
restore it at the new one.

## Updating it later

Edit `index.html` (the `DATA` array near the top of the `<script>` holds every
session) and re-upload. Her phone picks the change up on the launch after
next: the service worker serves the cached copy instantly, fetches the new one
in the background, and shows a "Reload" pill when it lands.

If you change `sw.js` itself, bump `VERSION` at the top of it, otherwise the
old caches stick around.

## Fonts

The two fonts load from Google Fonts and are then cached by the service
worker, so only the very first launch needs them. If it ever fails, it falls
back to the phone's own rounded system font, which looks close.

To remove the dependency completely: download the Baloo 2 and Nunito `.woff2`
files, drop them in a `fonts/` folder, replace the `<link>` to
fonts.googleapis.com in `index.html` with local `@font-face` rules, and add
the files to `PRECACHE` in `sw.js`.

## If she already has progress in the old file

Progress saved while opening `Nicole's Revision Tracker.html` straight from
disk is stored against a different origin and will not carry over on its own.
To move it: open the old file in a desktop browser, open the developer
console, and run

    copy(JSON.stringify({app:"nicole-revision",v:1,saved:new Date().toISOString(),
      done:JSON.parse(localStorage.getItem("nicole-revision-v1")||"{}"),
      flags:JSON.parse(localStorage.getItem("nicole-revision-flags-v1")||"{}"),
      open:{}}))

Paste the result into a file named `backup.json`, then use "Restore from a
backup" in the app. Restoring only ever adds, so it cannot wipe anything.
