# People-in-the-News Monitor

A lightweight news monitoring system that watches a list of people (name + company) and emails a daily digest of mentions from global media via the [GDELT Project](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/).

- **Frontend:** static site on GitHub Pages (plain HTML/CSS/JS — no frameworks, no build step)
- **Backend:** Google Apps Script Web App bound to a Google Sheet
- **Data store:** Google Sheet (`People`)
- **News source:** GDELT Doc 2.0 API (free, no key required)
- **GDELT proxy:** Cloudflare Worker (`newstracker-gdelt-proxy.vaughan-grant.workers.dev`)
- **Daily digest:** Apps Script time-driven trigger — no Make.com or external automation required
- **Ad-hoc history:** run 1/2/3-month lookback tests for any person directly in the browser

---

## How it works

```
Google Sheet (People)
        ↓  read by
Apps Script sendDailyDigest()   ← time-driven trigger (daily)
        ↓  queries via
Cloudflare Worker (GDELT proxy)
        ↓  returns articles
Apps Script builds HTML email
        ↓  sends to
news.tracker.asia@gmail.com
vaughan.grant@savills.com.my
john.talbot@lca.asia
```

The website (GitHub Pages) is a management UI only — it does not run the digest. It lets you add/remove people and run manual historical tests against GDELT via the same Cloudflare Worker.

---

## Prerequisites

- GitHub account (Pages enabled — free tier)
- Google account
- Cloudflare account (free tier — for the Worker proxy)
- No Make.com or other paid automation tools required

---

## Setup

### Step 1 — Google Sheet

1. Create a new Google Sheet.
2. Rename `Sheet1` → `People` (exact spelling, case-sensitive).
3. Add these headers in row 1:

   | A | B | C | D | E |
   |---|---|---|---|---|
   | Name | Company | QueryString | Active | AddedDate |

4. In **C2**, paste this formula (builds the GDELT query string from columns A and B):
   ```
   =""""&A2&""" """&B2&""""
   ```
   This produces the literal string `"John Smith" "Acme Logistics"` that GDELT expects. Copy down for future rows, or leave it — the Apps Script writes a fresh formula for each new row it adds.

---

### Step 2 — Cloudflare Worker (GDELT proxy)

GDELT's API has per-IP rate limits. Because Apps Script shares outbound IPs across thousands of scripts, direct calls from Apps Script get rate-limited. The Cloudflare Worker sits in between and handles retries.

1. Create a free [Cloudflare](https://cloudflare.com) account.
2. Go to **Workers & Pages → Create Worker**.
3. Paste the Worker code (see [Cloudflare Worker code](#cloudflare-worker-code) below).
4. Deploy. Note the Worker URL — you'll need it in Step 3.

---

### Step 3 — Google Apps Script

1. In your Google Sheet: **Extensions → Apps Script**.
2. Delete the default `Code.gs` content and paste the full script from [Apps Script code](#apps-script-code) below.
3. At the top of the script, update these two constants to match your setup:
   ```javascript
   const WORKER_URL = 'https://your-worker.your-subdomain.workers.dev';
   const DIGEST_TO  = 'your@email.com';
   ```
4. Click **Save** (💾).
5. Click **Deploy → New Deployment**:
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy**. Authorize when prompted (click Advanced → Go to project (unsafe) → Allow — expected for your own scripts).
7. Copy the **Web App URL** — needed in Step 4.

#### Set up the daily trigger

1. In the Apps Script editor, click the **clock icon** (Triggers) in the left sidebar.
2. Click **+ Add Trigger** (bottom right).
3. Configure:
   - Function: `sendDailyDigest`
   - Deployment: Head
   - Event source: Time-driven
   - Type: Day timer
   - Time: choose your preferred window (e.g. 7am–8am)
4. Click **Save**.

The trigger runs `sendDailyDigest()` once per day automatically. No external scheduler needed.

---

### Step 4 — Website

1. Clone this repo locally (or edit on github.com).
2. Open `app.js` and confirm/update these two constants:
   ```javascript
   const APPS_SCRIPT_URL = 'your-web-app-url-from-step-3';
   const WORKER_URL      = 'https://your-worker.your-subdomain.workers.dev';
   ```
3. Commit and push.
4. In the repo: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / `/ (root)` → Save**.
5. Site goes live at `https://<your-username>.github.io/<repo-name>/` within ~30 seconds.

---

### Step 5 — Test

1. Open your GitHub Pages URL.
2. Add 2–3 well-known people with distinctive companies (e.g. *Tim Cook / Apple*) to verify the pipeline before adding your real list.
3. Click **Test** on a row → select **3 Months** → click **Run Test**.
4. Confirm articles appear. If empty, try a prominent name first to verify GDELT is returning data, then refine your queries (see [Customising query strings](#customising-query-strings)).
5. Confirm **Add** writes a new row to your Google Sheet with Active = Y.
6. Confirm **Remove** flips Active to N (rows are never deleted — history is preserved).
7. In Apps Script: run `sendDailyDigest()` **manually once** (select the function in the toolbar → click Run) to confirm the email arrives and looks correct before relying on the trigger.

---

## Digest email

The daily digest is sent from the Google account that owns the Apps Script. It includes:

- One section per person on the watch list
- Each section lists articles found in the last 24 hours: headline (linked), source domain, date/time UTC, language tag
- Languages covered: **English, Chinese, and Malay** (GDELT indexes global media — this filter keeps results relevant for the Asia focus)
- If no articles are found for a person in that 24-hour window, their section shows "No mentions in the last 24 hours"
- Up to **25 articles per person** per digest
- GDELT is queried via the Cloudflare Worker, which retries internally on rate-limit errors and allows up to 2 attempts with a 45-second gap before giving up on a person

**Current recipients:**
- news.tracker.asia@gmail.com
- vaughan.grant@savills.com.my
- john.talbot@lca.asia

To add or remove recipients, edit the `DIGEST_TO` constant in `Code.gs` — comma-separated email addresses.

---

## Customising query strings

The **QueryString** column (C) in the sheet is fully editable after a person is added. GDELT supports these operators:

| Goal | Example |
|---|---|
| Default — name and company both present | `"John Smith" "Acme Logistics"` |
| Add industry keyword to reduce false positives | `"John Smith" "Acme Logistics" logistics` |
| English sources only | `"John Smith" "Acme Logistics" sourcelang:english` |
| Restrict to a specific publication | `"John Smith" "Acme Logistics" domain:supplychainbrain.com` |
| Allow name alias | `("John Smith" OR "J. Smith") "Acme Logistics"` |

After editing a QueryString cell directly in the sheet, both the daily digest and the website Test button will use the updated string automatically.

---

## Known limitations

- **LinkedIn is not indexed by GDELT.** LinkedIn-only mentions will not appear. Use LinkedIn's native notifications for that channel.
- **Paywalls.** GDELT surfaces article metadata (headline, URL, source, date) but the linked article may be behind a paywall.
- **Name collisions.** Common names produce false positives. Mitigate by editing the QueryString to add an industry term, location, or specific alias.
- **GDELT latency.** Articles usually appear within a few hours of publication; some smaller sources lag up to 24 hours.
- **Non-English names.** GDELT uses English transliterations for names originally in non-Latin scripts. If results seem sparse, check the GDELT Summary tool to confirm the correct spelling variant.
- **Apps Script quotas.** Free-tier Gmail sending is capped at 100 emails/day and execution time at 6 minutes/run. Both are well within limits for this use case at up to 100 people.

---

## Apps Script code

Full contents of `Code.gs`. See the repo — the script is deployed as a Web App and also runs the daily digest via a time-driven trigger.

Key constants at the top of the file:

```javascript
const WORKER_URL         = 'https://newstracker-gdelt-proxy.vaughan-grant.workers.dev';
const DIGEST_TO          = 'news.tracker.asia@gmail.com, vaughan.grant@savills.com.my, john.talbot@lca.asia';
const DIGEST_MAX_PER_PERSON = 25;
```

---

## Cloudflare Worker code

The Worker accepts these query parameters and proxies them to GDELT:

| Parameter | Description |
|---|---|
| `query` | GDELT query string e.g. `"John Smith" "Acme Logistics"` |
| `start` | Start datetime — format `YYYYMMDD000000` |
| `end` | End datetime — format `YYYYMMDD000000` |
| `max` | Max results (default 50) |

It returns the raw GDELT JSON response, adding retry logic for 429 rate-limit responses.

---

## File map

```
/
├── index.html   ← page structure
├── style.css    ← styles (LCA.asia brand palette, mobile-friendly)
├── app.js       ← frontend logic + GDELT query construction
└── README.md    ← you are here
```

No Make.com, Zapier, or other paid automation tools are used. All scheduling and email delivery runs inside Google Apps Script on the free tier.
