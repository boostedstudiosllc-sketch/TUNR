# TUNR email setup (Supabase)

## 1. Turn off "Confirm email"
Supabase → **Authentication → Sign In / Providers → Email** → turn **Confirm email** off → Save.
TUNR now confirms emails itself after sign-up (see `supabase/migrations/041_email_confirmation.sql`).

## 2. Paste this into the Magic Link template
Supabase → **Authentication → Emails → Templates → Magic Link**.
TUNR only uses this email to confirm addresses. The same template is used for the
welcome email and the day-3 reminder; `confirm_reminder` and `delete_on` are filled in by TUNR.

**Subject**

```
Confirm your TUNR email
```

**Message body** (switch the editor to *Source* / HTML)

```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;line-height:1.55">
  <h2 style="margin:0 0 12px">{{ if .Data.confirm_reminder }}Reminder: confirm your TUNR email{{ else }}Welcome to TUNR — confirm your email{{ end }}</h2>

  {{ if .Data.confirm_reminder }}
  <p>You signed up for TUNR a few days ago but haven't confirmed your email yet.
  <b>If it isn't confirmed by {{ .Data.delete_on }}, your account will be permanently deleted.</b></p>
  {{ else }}
  <p>Thanks for joining TUNR{{ if .Data.username }}, @{{ .Data.username }}{{ end }}. Tap the button below to confirm this is your email.
  Until you do, you can browse meets and RSVP, but chatting, posting meets and linkups stay locked.</p>
  {{ end }}

  <p style="margin:24px 0">
    <a href="{{ .ConfirmationURL }}" style="background:#0080F0;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:6px;display:inline-block">Confirm my email</a>
  </p>

  <p><b>What happens if you don't:</b> accounts whose email isn't confirmed within 7 days of signing up are
  deleted automatically{{ if .Data.delete_on }} — for this account, on {{ .Data.delete_on }}{{ end }}. You can always sign up again.</p>

  <p style="font-size:12px;color:#666;border-top:1px solid #e5e5e5;padding-top:12px;margin-top:24px">
  <b>Why we do this.</b> An email address that's never confirmed may have been mistyped, or used by someone
  it doesn't belong to. Removing unconfirmed accounts after 7 days protects the real owner of the address,
  keeps TUNR's community made up of real members, and means we don't keep personal information we can't
  connect to the person it belongs to. This is described in section 4 of our Terms of Service and in our
  Privacy Policy.<br><br>
  Didn't sign up for TUNR? Ignore this email — the account will be removed automatically and nothing else
  will be sent. TUNR is operated by Boosted Studios Production LLC · boostedstudiosllc@gmail.com
  </p>
</div>
```

## 2b. Paste this into the Reset Password template
Supabase → **Authentication → Emails → Templates → Reset Password**.
Branded with the TUNR logo and plain explanations, so it doesn't look like a phishing email.
(The link expires after Supabase's "Email OTP Expiration", 1 hour by default.)

**Subject**

```
Reset your TUNR password
```

**Message body** (switch the editor to *Source* / HTML)

```html
<div style="background:#f4f4f5;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;color:#1a1a1a;line-height:1.55">
  <div style="background:#0A0A0A;padding:20px 24px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle"><img src="https://tunr-gules.vercel.app/icon-192.png" width="44" height="44" alt="TUNR" style="display:block;border-radius:10px"></td>
      <td style="vertical-align:middle;padding-left:12px">
        <div style="font-size:26px;font-weight:900;letter-spacing:-0.5px;color:#ffffff">TUN<span style="color:#0080F0">R</span></div>
        <div style="font-size:11px;color:#9a9a9a;letter-spacing:1.5px">CAR MEETS · ATLANTA</div>
      </td>
    </tr></table>
  </div>

  <div style="padding:24px">
    <h2 style="margin:0 0 12px;font-size:20px">Reset your TUNR password</h2>
    <p>Hi{{ if .Data.username }} @{{ .Data.username }}{{ end }},</p>
    <p>We got a request to reset the password for the TUNR account that uses <b>{{ .Email }}</b>.
    If that was you, tap the button below and choose a new password.</p>

    <p style="margin:24px 0">
      <a href="{{ .ConfirmationURL }}" style="background:#0080F0;color:#ffffff;text-decoration:none;font-weight:bold;padding:13px 24px;border-radius:6px;display:inline-block">Choose a new password</a>
    </p>

    <p style="font-size:13px;color:#444">This link works once and expires in 1 hour. Your new password needs at least
    8 characters and 3 of these 4: an uppercase letter, a lowercase letter, a number and a symbol. It can't be one
    of your last 24 passwords.</p>

    <p style="font-size:13px;color:#444"><b>Didn't ask for this?</b> You can ignore this email. Your password stays the
    same, and nobody can change it without this link. If you keep getting these emails, someone may be typing your
    address by mistake. Reply to this email and we'll look into it.</p>

    <div style="font-size:12px;color:#555;background:#f4f4f5;border-radius:8px;padding:12px 14px;margin-top:18px">
      <b>How to know this email is really from TUNR</b><br>
      • The button opens <b>tunr-gules.vercel.app</b>, TUNR's own site.<br>
      • We'll never ask for your password, a code or payment details by email, text or DM.<br>
      • We only send this email when someone asks to reset a password on the TUNR sign-in screen.
    </div>
  </div>

  <div style="font-size:11.5px;color:#888;border-top:1px solid #eee;padding:14px 24px">
    TUNR is made by Boosted Studios Production LLC in Atlanta, GA · boostedstudiosllc@gmail.com<br>
    You're getting this because a password reset was requested for {{ .Email }} on TUNR.
  </div>
</div>
</div>
```

## 3. Use your own email sender (needed for volume)
Supabase's built-in sender only sends a few emails per hour for the whole project, so
confirmation emails will queue up and go out slowly (TUNR retries every morning and never
deletes an account it couldn't email). To remove the limit for free with Gmail:

1. On the Google account that will send (e.g. boostedstudiosllc@gmail.com): turn on
   **2-Step Verification**, then create an **App password** (Google Account → Security →
   App passwords). Copy the 16-character password.
2. Supabase → **Project Settings → Authentication → SMTP Settings** → enable custom SMTP:
   - Sender email: the Gmail address · Sender name: `TUNR`
   - Host: `smtp.gmail.com` · Port: `465`
   - Username: the Gmail address · Password: the app password
3. Supabase → **Authentication → Rate Limits** → raise "emails per hour" (Gmail allows about
   500 a day).

Later, with your own domain (e.g. tunr.app), switch to a sender like Resend for better delivery.

## 4. Site URL
Supabase → **Authentication → URL Configuration** → **Site URL** must be your live site
(e.g. `https://tunr-gules.vercel.app`), so the confirm link opens TUNR.

## 5. Password policy (Supabase dashboard)
TUNR's own server enforces the full policy (src/lib/passwordRules.js): 8+ characters, 3 of the 4 kinds,
none of the last 24 passwords, 10 wrong tries locks the account for 30 minutes, and no expiration.
Also set Supabase's own floor so its sign-up can't be used to skip the length rule:
Supabase → **Authentication → Sign In / Providers → Email** → **Minimum password length: 8** → Save.
(Leave "Password requirements" on "No required characters": Supabase can't express "3 of 4", so TUNR checks it.)
