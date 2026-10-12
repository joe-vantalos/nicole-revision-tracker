# Setting up accounts

Goal: people can sign in with Google, Microsoft, or a code sent by email.
This stage is sign-in only. Progress still saves on the phone; syncing it
between devices is the next stage, built once sign-in is tested on a real iPhone.

Until `config.js` is filled in (step 2), the app has no sign-in at all and
behaves exactly as before. So the code can be published before any of this is done.

Allow about an hour. Dashboards get redesigned, so if a button has moved,
look for the same words nearby.

Throughout, replace:

- `<SITE>` with the app's address, e.g. `https://your-name.github.io/revision-tracker/`
- `<REF>` with the Supabase project reference, the random part of its URL
  (`https://<REF>.supabase.co`)

---

## 1. Create the Supabase project (free)

1. Go to <https://supabase.com>, sign up, and choose **New project**.
2. Name it `revision-tracker`. Set a database password and store it in a password manager.
3. **Region: London (eu-west-2)**, so UK users' data stays in the UK.
4. Plan: **Free**. Create it and wait a minute or two.

Free projects pause after about a week with no use. Daily use keeps it awake.
If it pauses, open the project in the dashboard and press **Restore**.

## 2. Put the project's address and public key in the app

1. In Supabase: **Project Settings → API** (also shown under **Connect**).
2. Copy **Project URL** and the **anon public** key.
3. Paste them into `config.js` in this repository:

   ```js
   window.APP_CONFIG = {
     supabaseUrl: "https://<REF>.supabase.co",
     supabaseAnonKey: "eyJ..."
   };
   ```

The anon key is designed to be public; it ships inside the app.
**Never** paste the `service_role` key anywhere in the app. That one bypasses all security.

## 3. Tell Supabase where the app lives

**Authentication → URL Configuration**

- **Site URL:** `<SITE>`
- **Redirect URLs:** add `<SITE>` and `<SITE>index.html`

Without this, Google and Microsoft sign-in will refuse to send people back to the app.

## 4. Email codes

### 4a. Send a code instead of a link

**Authentication → Emails → Templates.** In both **Magic Link** and **Confirm signup**,
replace the body with something like:

```html
<h2>Your sign-in code</h2>
<p>Enter this code in the revision app:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>It works for one hour. If you didn't ask for it, ignore this email.</p>
```

The `{{ .Token }}` part is what makes Supabase send a 6-digit code.
A link would open Safari and sign the person in there, not in the home-screen app.

### 4b. Use a real email sender (required before students use it)

Supabase's built-in sender only delivers to members of your Supabase team,
at 2 emails an hour. It is for testing only.
For everyone else, connect a free email service:

1. Sign up to **Brevo** (free tier, around 300 emails a day) or **Resend** (free tier, around 100 a day).
   Check their current limits.
2. In that service, verify a sending address or domain, and create SMTP credentials.
3. In Supabase: **Authentication → Emails → SMTP Settings → Enable custom SMTP**, then enter
   host, port, username, password and the sender address from step 2.
4. **Authentication → Rate Limits:** check the emails-per-hour limit suits your number of users.

Brevo publishes a Supabase-specific guide: <https://developers.brevo.com/docs/supabase-smtp-integration>

## 5. Google sign-in (free)

1. Go to <https://console.cloud.google.com>, create a project called `revision-tracker`.
2. **APIs & Services → OAuth consent screen** (may be called **Google Auth Platform → Branding**):
   - User type **External**.
   - App name, support email, and your contact email.
   - Authorised domains: `supabase.co` and the domain of `<SITE>` (e.g. `github.io`).
   - Scopes: the defaults (email, profile, openid) are enough.
3. **Credentials → Create credentials → OAuth client ID → Web application.**
   - **Authorised JavaScript origins:** the origin of `<SITE>`, e.g. `https://your-name.github.io`
   - **Authorised redirect URIs:** `https://<REF>.supabase.co/auth/v1/callback`
     (Supabase shows this exact address on its Google provider page.)
4. Copy the **Client ID** and **Client secret**.
5. Supabase: **Authentication → Sign In / Providers → Google** → enable, paste both, save.
6. Back in Google: **publish the app** (status **In production**).
   While it says *Testing*, only email addresses you list as test users can sign in.

## 6. Microsoft sign-in (free)

1. Go to <https://portal.azure.com> (a free personal Microsoft account works).
2. **Microsoft Entra ID → App registrations → New registration.**
   - Name: `Revision tracker`.
   - **Supported account types: "Accounts in any organizational directory and personal Microsoft accounts".**
     This lets both university/work accounts and personal Outlook/Hotmail accounts sign in.
   - Redirect URI: platform **Web**, address `https://<REF>.supabase.co/auth/v1/callback`.
3. On the app's **Overview** page, copy **Application (client) ID**.
4. **Certificates & secrets → New client secret.** Copy the **Value** column
   (not the Secret ID). It is shown once.
   Secrets expire (24 months at most). **Put a reminder in your calendar** to make a new one
   before then, or Microsoft sign-in stops working on that day.
5. Supabase: **Authentication → Sign In / Providers → Azure** → enable, paste the client ID and
   secret value. Leave **Azure Tenant URL** empty (it defaults to the "common" endpoint,
   which accepts any Microsoft account). Save.

### About "Need admin approval"

Many universities only let staff approve which outside apps students can sign in to.
A student from such a university sees **Need admin approval** from Microsoft and can't continue.
Nothing in the app can override that. The app handles it like this:

- The sign-in screen always shows a flagged note under the Microsoft button telling them to use
  a personal Google or Microsoft account, or an email code, if this happens.
- If they come back from Microsoft with that error, the app says so at the top of the sign-in
  screen and highlights the note.

Optional, may reduce how often it happens: in the Azure app registration, complete
**Branding & properties → Publisher verification**. It needs a free Microsoft Partner Network ID.
Some universities block apps from unverified publishers by default. Verification won't help
where a university requires admin approval for every app.

## 7. Test on a real iPhone (the reason for doing sign-in before sync)

Publish, then on an iPhone open `<SITE>` in Safari, **Share → Add to Home Screen**, and open the
app **from the home screen**. In **Settings → Account**, try each method:

| Method | What to check |
|---|---|
| Email code | Code arrives (check junk), typing it signs you in, sign-in survives closing and reopening the app |
| Google | You come back into the home-screen app signed in, not into Safari |
| Microsoft (personal account) | Same as Google |
| Microsoft (university account) | Either signs in, or shows the admin-approval message with the highlighted note |

Google and Microsoft can land the sign-in in Safari instead of the home-screen app on some
iOS versions. If that happens, report which iOS version; email codes remain the fallback that works.
