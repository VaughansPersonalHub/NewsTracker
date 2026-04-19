# People-in-the-News Monitor

A lightweight news monitoring system that watches a list of people (name + company) and emails you a daily digest of mentions from global media via the [GDELT Project](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/).

- **Frontend:** static site on GitHub Pages (plain HTML/CSS/JS — no frameworks, no build step)
- **Backend:** Google Apps Script Web App bound to a Google Sheet
- **Data store:** Google Sheet (`People`)
- **News source:** GDELT Doc 2.0 API (free, no key, CORS-enabled)
- **Daily digest:** Make.com scenario that queries GDELT and emails you via Gmail
- **Ad-hoc history:** run 1/2/3-month lookback tests for any person directly in the browser

---

## Prerequisites

- GitHub account (Pages enabled — free tier is fine)
- Google account
- Make.com account on the Core plan (~$9/mo — required for multi-step scenarios)
- A dedicated Gmail account for sending digests (e.g. `media.newswatch@gmail.com`)

---

## Setup

### Step 1 — Google Sheet

1. Create a new Google Sheet.
2. Rename `Sheet1` → `People` (exact spelling, case-sensitive).
3. Put these headers in row 1:

   | A | B | C | D | E |
   |---|---|---|---|---|
   | Name | Company | QueryString | Active | AddedDate |

4. In **C2**, paste this formula (it builds the GDELT query string from columns A and B):
   ```
   =""""&A2&""" """&B2&""""
   ```
   You can copy C2 down to future rows later, or just leave it — the Apps Script writes a fresh formula for each new row.

### Step 2 — Google Apps Script

1. In your Google Sheet: **Extensions → Apps Script**.
2. Delete the default `Code.gs` content and paste the script from [Apps Script code](#apps-script-code) below.
3. Click the save icon (💾).
4. Click **Deploy → New Deployment**.
5. Choose:
   - **Type:** Web app
   - **Execute as:** Me
   - **Who has access:** Anyone
6. Click **Deploy**. Authorize when prompted (Google will warn about an "unverified app" — this is expected for your own scripts; click Advanced → Go to [project] (unsafe) → Allow).
7. **Copy the Web App URL** — you'll need it in Step 3.

> ℹ️ If you later edit the script, use **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy** to publish changes. The Web App URL stays the same.

### Step 3 — Website

1. Clone this repo locally (or edit on github.com).
2. Open `app.js` and replace the placeholder:
   ```js
   const APPS_SCRIPT_URL = 'PASTE_YOUR_APPS_SCRIPT_URL_HERE';
   ```
   with the URL from Step 2.
3. Commit & push.
4. In the repo on github.com: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / `/ (root)` → Save**.
5. After ~30 seconds, your site is live at `https://<your-username>.github.io/<repo-name>/`.

### Step 4 — Test the website

1. Open your GitHub Pages URL.
2. Add 2–3 well-known public figures with distinctive companies (e.g. *Tim Cook / Apple*, *Lisa Su / AMD*). Common names with generic companies produce a lot of false positives.
3. Click **Test** on a row, select **3 Months**, click **Run Test**.
4. You should see a table of article results. If it's empty, try a more prominent name first to confirm GDELT is returning data, then refine your queries (see [Customising query strings](#customising-query-strings)).
5. Confirm **Add** writes a new row to your Google Sheet and **Remove** flips the `Active` column to `N` (it does not delete the row — history is preserved).

### Step 5 — Make.com daily digest

Documented in [Make.com scenario](#makecom-scenario) below. Build and activate it once the website is working end-to-end.

---

## Apps Script code

Paste this verbatim into `Code.gs` in the Apps Script editor bound to your Google Sheet.

```javascript
const SHEET_NAME = 'People';

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'list') return listPeople();
  return jsonResponse({ error: 'Unknown action' });
}

function doPost(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  let body = {};
  try {
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
  } catch (err) {
    return jsonResponse({ success: false, error: 'Invalid JSON body' });
  }
  if (action === 'add') return addPerson(body);
  if (action === 'remove') return removePerson(body);
  return jsonResponse({ error: 'Unknown action' });
}

function listPeople() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  // Skip header row; only return Active = Y.
  const rows = data.slice(1).filter(function (r) { return r[3] === 'Y'; }).map(function (r) {
    return {
      name: r[0],
      company: r[1],
      query: r[2],
      addedDate: r[4] instanceof Date ? r[4].toISOString().slice(0, 10) : r[4]
    };
  });
  return jsonResponse(rows);
}

function addPerson(body) {
  if (!body || !body.name || !body.company) {
    return jsonResponse({ success: false, error: 'Missing name or company' });
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const row = sheet.getLastRow() + 1;
  const today = new Date().toISOString().slice(0, 10);

  // Escape double-quotes inside names/companies so the formula stays valid.
  const nameEsc = String(body.name).replace(/"/g, '""');
  const companyEsc = String(body.company).replace(/"/g, '""');
  // Produces a cell formula like: ="John Smith" "Acme Logistics"
  // which evaluates to the literal string:  "John Smith" "Acme Logistics"
  const queryFormula = '=""""&"' + nameEsc + '"&""" """&"' + companyEsc + '"&""""';

  sheet.getRange(row, 1).setValue(body.name);
  sheet.getRange(row, 2).setValue(body.company);
  sheet.getRange(row, 3).setFormula(queryFormula);
  sheet.getRange(row, 4).setValue('Y');
  sheet.getRange(row, 5).setValue(today);
  return jsonResponse({ success: true });
}

function removePerson(body) {
  if (!body || !body.name || !body.company) {
    return jsonResponse({ success: false, error: 'Missing name or company' });
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const name = String(body.name).toLowerCase();
  const company = String(body.company).toLowerCase();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === name &&
        String(data[i][1]).toLowerCase() === company &&
        data[i][3] === 'Y') {
      sheet.getRange(i + 1, 4).setValue('N');
      return jsonResponse({ success: true });
    }
  }
  return jsonResponse({ success: false, error: 'Not found' });
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
```

> **Note on the `addPerson` formula:** The original spec had `="${name}" "${company}"`, which is not a valid cell formula (Sheets interprets the quoted segments as cell references, not string literals). The version above mirrors the column-C formula you put in manually and produces the literal `"John Smith" "Acme Logistics"` string that GDELT expects. Names/companies containing `"` are also escaped safely.

---

## Make.com scenario

Build this scenario manually in Make.com. The free trial plan lets you prototype, but you'll need the **Core plan (~$9/mo)** to keep multi-step scenarios running daily.

### Modules (in order)

1. **Schedule (built-in trigger)**
   - Run: Every day at **07:00** (your local timezone).

2. **Google Sheets → Search Rows**
   - Spreadsheet: your People sheet
   - Sheet: `People`
   - Filter: column **D (Active)** equals `Y`
   - Returns one bundle per active row.

3. **Tools → Set variable** (optional but tidy)
   - `yesterdayStart` = `{{formatDate(addDays(now; -1); "YYYYMMDDHHmmss")}}`
   - `todayStart` = `{{formatDate(now; "YYYYMMDDHHmmss")}}`

4. **HTTP → Make a Request** (runs once per row, in iterator-style)
   - URL: `https://api.gdeltproject.org/api/v2/doc/doc?query={{encodeURL(C)}}&mode=ArtList&maxrecords=10&startdatetime={{yesterdayStart}}&enddatetime={{todayStart}}&format=json`
   - Method: `GET`
   - Parse response: **Yes** (or add an explicit JSON → Parse JSON step)

5. **Filter between HTTP and the aggregator**
   - Condition: `length(articles) > 0`
   - Only passes through rows that actually returned mentions.

6. **Text aggregator** (Tools → Text Aggregator)
   - Source module: the iterator/HTTP step
   - Row separator: new line
   - Template (HTML):
     ```html
     <h3>{{name}} — {{company}}</h3>
     <ul>
       {{#articles}}
       <li><a href="{{url}}">{{title}}</a> — {{domain}} ({{seendate}})</li>
       {{/articles}}
     </ul>
     ```
     (Adapt field pickers to the aggregator syntax Make shows you — the idea is one HTML block per person.)

7. **Gmail → Send an Email**
   - Connection: your dedicated sending Gmail (e.g. `media.newswatch@gmail.com`)
   - To: your personal email
   - Subject: `News Digest — {{formatDate(now; "YYYY-MM-DD")}}`
   - Content type: **HTML**
   - Body: the text aggregator output from step 6

8. **(Optional) Router — zero-result days**
   - Second branch after the filter in step 5: catches runs where no rows produced articles, and either skips entirely or sends a short "No mentions today" email. Your call.

### Activate

1. Run the scenario **once manually** to confirm the email arrives and looks right.
2. Toggle the scenario **ON** (bottom left).
3. Confirm the schedule is set to daily at 07:00.

---

## Customising query strings

The **QueryString** column (C) in the sheet is fully editable. GDELT supports a few handy operators:

| Goal | Example |
|---|---|
| Default (both name and company must appear) | `"John Smith" "Acme Logistics"` |
| Add an industry keyword for disambiguation | `"John Smith" "Acme Logistics" logistics` |
| English sources only | `"John Smith" "Acme Logistics" sourcelang:english` |
| Restrict to a specific site | `"John Smith" "Acme Logistics" domain:supplychainbrain.com` |
| Broaden to either name **or** alias | `("John Smith" OR "J. Smith") "Acme Logistics"` |

After editing a QueryString cell, the Test button on the website will use the new string on the next run (the list is re-fetched from the sheet on every page load).

---

## Known limitations

- **LinkedIn is not indexed by GDELT.** LinkedIn-only mentions won't appear. Follow key people on LinkedIn natively and rely on LinkedIn's own notifications for that channel.
- **Paywalls.** GDELT surfaces article metadata (headline, URL, source, date) but the link may lead to a paywalled article.
- **Name collisions.** Common names return false positives. Mitigate by editing the QueryString to add an industry term, a location, or a specific alias.
- **Latency.** Articles usually appear in GDELT within a few hours of publication; some smaller sources lag up to 24 hours.
- **Language noise.** GDELT indexes global media. Append `sourcelang:english` to the query string if non-English results are cluttering the digest.
- **Apps Script quotas.** Free-tier UrlFetch and execution quotas are generous for this use case (a few dozen calls/day) but worth being aware of if you scale up.

---

## File map

```
/
├── index.html   ← page structure
├── style.css    ← styles (single accent colour, mobile-friendly)
├── app.js       ← frontend logic + GDELT query construction
└── README.md    ← you are here
```

No server-side code lives in this repo. All backend logic is in the Apps Script you deploy in Step 2.
