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
    <a href="{{ .ConfirmationURL }}" style="background:#FF4500;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:6px;display:inline-block">Confirm my email</a>
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
