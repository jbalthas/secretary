# Google Home → Daily & Weekly Voice Readout — IFTTT Setup

Two voice triggers, both hitting the same secret-guarded webhook on the Pi:

- **Daily:** `POST https://jb.taildb91c4.ts.net/api/v1/webhooks/brief`
- **Weekly:** `POST https://jb.taildb91c4.ts.net/api/v1/webhooks/brief?range=week`

Both require header `X-Webhook-Secret: <WEBHOOK_SECRET>` (the value in the Pi's `backend/.env`). When the webhook fires, the Pi builds the agenda (tasks + calendar events), pushes it via Pushover, and — if TTS is enabled — speaks it on the Nest Mini.

Neither applet exists yet; create both.

---

## ⚠️ Reachability prerequisite (read first)

IFTTT runs in the cloud, so it can only reach the Pi over a **public** URL. A plain `https://*.ts.net` Tailscale address is reachable **only from devices on your tailnet** — IFTTT's servers are not. You must expose the webhook publicly with **Tailscale Funnel**:

```bash
# On the Pi — expose port 443 publicly (HTTPS) through the tailnet cert
sudo tailscale funnel 443 on
tailscale funnel status   # confirm https://jb.taildb91c4.ts.net is "Funnel on"
```

Verify from a device **off** your tailnet (e.g. phone on mobile data, Wi-Fi off):

```bash
curl -i -X POST "https://jb.taildb91c4.ts.net/api/v1/webhooks/brief" \
  -H "X-Webhook-Secret: <WEBHOOK_SECRET>"
# Expect: HTTP/2 200  {"status":"ok"}   (a 403 means the secret header is wrong)
```

> Open question (from project STATE.md): whether `tailscale funnel 443` reliably reaches IFTTT's outbound servers. If IFTTT reports connection errors despite the curl above working, the fallback is a router port-forward to nginx — but try Funnel first.
>
> The webhook is safe to expose publicly: it does nothing without the correct `X-Webhook-Secret` (constant-time compared), and a wrong/missing secret returns 403.

---

## Applet 1 — Daily ("what's on today")

1. Go to <https://ifttt.com/create>.
2. **If This** → search **Google Assistant** → **"Say a simple phrase."**
   - What you want to say: `what are my tasks today`
   - Optional extra phrases: `read me my day`, `what's on today`
   - What Assistant says back: `Reading your day`
   - Language: English
3. **Then That** → search **Webhooks** → **"Make a web request."**
   - **URL:** `https://jb.taildb91c4.ts.net/api/v1/webhooks/brief`
   - **Method:** `POST`
   - **Content Type:** `application/json`
   - **Additional Headers:** `X-Webhook-Secret: <WEBHOOK_SECRET>`
   - **Body:** leave empty
4. **Create action** → **Continue** → **Finish.**

## Applet 2 — Weekly ("what's on this week")

Same as above, with two changes:

2. Trigger phrase → `what are my tasks this week` (extras: `read me my week`, `what's on this week`).
3. Webhooks URL → `https://jb.taildb91c4.ts.net/api/v1/webhooks/brief?range=week`
   (everything else — POST, header, empty body — identical).

---

## Testing

1. **Backend only** (from your tailnet — no IFTTT needed):
   ```bash
   curl -X POST "https://jb.taildb91c4.ts.net/api/v1/webhooks/brief" \
     -H "X-Webhook-Secret: <WEBHOOK_SECRET>"
   curl -X POST "https://jb.taildb91c4.ts.net/api/v1/webhooks/brief?range=week" \
     -H "X-Webhook-Secret: <WEBHOOK_SECRET>"
   ```
   Each should return `{"status":"ok"}`, send a Pushover notification, and (if TTS is on) speak on the Nest Mini.
2. **End to end:** say *"Hey Google, what are my tasks today"* / *"...this week."*

## Notes

- **TTS must be enabled** for the speaker to talk — check the Settings "Speak" toggle (`GET /api/v1/settings/tts`). Pushover fires regardless; TTS is best-effort and never blocks it.
- **Daily** reads today's tasks + events, time-sorted. **Weekly** reads the next 7 days (today through today+6), grouped by weekday, skipping empty days.
- The default `POST /api/v1/webhooks/brief` (no `range`) is unchanged and still gives the daily brief, so any pre-existing daily applet keeps working.
