# Nicole's Revision Tracker — phone app

A PWA: a web app she installs to her home screen. It opens full screen with no
address bar, works with no signal, and keeps her progress on her phone.

## What's here

    index.html              the app (the original tracker plus the app plumbing)
    manifest.webmanifest    name, icon and colours the phone reads when installing
    qb.js                   Today / Practice / Progress tabs, question player, settings
    schedule.js             moving work to other days, days off, and the day-picking rules
    mark.js                 lenient marking for fill-in-the-blank answers
    questions.js            the question bank and timetable (generated data)
    sw.js                   service worker — makes it load instantly and work offline
    tools/audit-mcq.js      checks the multiple-choice questions for answer-giveaway clues
    icons/                  home screen icons (icons/src/ holds the SVG originals)

## How it stores progress

Ticks and flags go into `localStorage` on her phone, under these keys:

    nicole-revision-v1          ticked items
    nicole-revision-flags-v1    flagged items
    nicole-revision-open        which weeks are expanded
    nicole-revision-theme       light/dark choice
    nicole-revision-accent      colour theme (green when unset)
    nicole-revision-think       Think first setting (off when unset)
    nicole-qbank-v2             question answers, marked sets, practice streak
    nicole-schedule-v1          work moved to other days, and days marked off

A backup file carries all of it, including the moved work and days off. There is no
server and no account. This is why it is instant — a tick is a
local write, never a network call. The trade-off is that progress lives on
that one phone, which is what the in-app backup is for.

## Moving work to another day

The timetable in `questions.js` is fixed, generated data. `schedule.js` keeps her changes
to it separately and projects them onto that data before the app reads it, so every tab
shows the real plan and nothing else needs to know that moves exist. Two things can be
changed: which day a topic sits on (`moveB` for its questions, `moveS` for its sessions),
and which days she has marked off (`off`). An entry only exists while it differs from the
timetable, so putting something back is a delete.

What she moves is a **topic**: a set's sessions together with its question set. They
travel together because the questions only make sense after the revising. A big topic can
be split over two days, with the questions landing on the second.

Nothing may land where it would break the plan's own order. A first pass has to stay
before its consolidation day, consolidation before its rapid recall, and everything
before that module's exam. Exam days can't be filled at all, and the sets that sit on them
can't be moved.

### How a day is picked

Days are compared by how full they are. Question minutes are the same estimate the set
buttons show; the time a session takes to revise isn't knowable, so `SESSION_W` is a fixed
weight used only to compare one day with another. `TYPICAL` is the middling day of the
timetable *as written* — comparing against her own plan means the words (quiet, about
usual, a heavy day) hold however long she actually takes.

The planner fills the soonest day that still has room, at `CEIL` (1.15 × typical) first
and only then at `HARD` (1.5 ×), tightest deadline first, with every placement counting
towards that day for whatever is placed after it. That is what spreads a cleared day over
several days instead of dumping it on one. A timetabled rest day counts as part-full
before anything lands on it, so a working day with room always wins and her Saturdays are
only used when the alternative is a heavy day — and there is a switch in the move sheet to
keep them free. Her own picks always win over all of this.

### Days off and the streak

A day she marks off pauses the streak exactly as a timetabled rest day does: it doesn't
break the run and doesn't add a day to it. That works on a day that has already gone,
which is how a missed day is put right — Today offers it when a run of two or more has
just been interrupted. A timetabled rest day stops counting as rest once work has been
moved onto it, so the work she does there still counts.

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

## Checking the multiple-choice questions

Run `node tools/audit-mcq.js` after changing or adding questions. It checks every single
best answer question for clues that give the answer away without knowing the subject:
the right option being longer than the rest, the only one with brackets or hedge words
("usually", "may"), or the only one without words like "only" or "never". It prints
how often the right answer is the longest option (chance is 20%) and what a student who
never reads the question would score, and exits with an error if either is too high.
`--list` names each question that breaks a rule.

`tools/mcq-review.md` lists the few rewritten questions a reviewer was not fully sure of.

## Updating it later

Edit `index.html` (the `DATA` array near the top of the `<script>` holds every
session), `qb.js`, `schedule.js`, `mark.js` or `questions.js` and re-upload. Her phone
picks the change up on the launch after next: the service worker serves the cached copy
instantly, fetches the new one in the background, and shows a "Reload" pill
when it lands. Those files are always re-checked; icons and the manifest
are not.

If you change `sw.js` itself, or the icons or manifest, bump `VERSION` at the
top of `sw.js`, otherwise the old caches stick around.

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
