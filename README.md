# Contact Page Automation

Node.js + Express dashboard that reads website URLs from a Google Sheet, opens **10 sites at a time** with Playwright, finds each site's **Contact Us / Get a Quote** page, fills the form with your static details, submits it, and writes **Success** or **Failed (with reason)** back to the sheet. It repeats until every row is done.

| Part | Tech |
|---|---|
| Backend | Node.js + Express.js |
| Browser automation | Playwright with installed Microsoft Edge |
| Input / output | Google Sheets API |
| AI assistance (optional) | Claude API (`ENABLE_CLAUDE=true`) |
| Batch processing | Simple Node.js batch loop (`src/services/batchService.js`) |
| Queue (deferred) | BullMQ + Redis — not used yet |

## 1. Google Sheet

Create a tab named `Leads` (or set `GOOGLE_SHEETS_TAB`):

| A: URL | B: Status | C: Reason | D: Processed At |
|---|---|---|---|

Put website URLs from row 2 down. Leave **Status** blank (or `Pending`) for rows to process. Rows with any other status are skipped, so you can safely re-run. To retry a failed row, clear its Status cell.

## 2. Google service account

1. Google Cloud Console → create a project → enable **Google Sheets API**.
2. Create a **service account**, then add a JSON key and download it.
3. Save it as `credentials/service-account.json` (never commit it; `.gitignore` already excludes it).
4. Share your spreadsheet with the service account's e-mail address as **Editor**.

## 3. Configure and run

```bash
npm install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
# edit .env: spreadsheet id + your contact details (CONTACT_*)
npm test
npm start
```

The app launches the Microsoft Edge browser installed on your computer. It does not use Playwright's downloaded Chromium, so `npx playwright install chromium` is not required.

Open http://127.0.0.1:3000 and click **Run until all done**.

## 4. How a run works

1. Read the next 10 pending rows from the sheet.
2. Open all 10 sites in parallel (one isolated browser context per site).
3. For each site: open the home page, rank its links (`Contact Us`, `Get a Quote`, `Enquiry`...), try the best candidates, then common paths (`/contact-us`, `/get-a-quote`...), and finally the home page itself.
4. Fill the detected form from `CONTACT_*`, then click submit.
5. **Success** only when a confirmation is detected (thank-you page or confirmation text that was not there before). Anything else is **Failed** with a reason.
6. Write the 10 results to the sheet, then repeat until no pending rows are left.

Typical Failed reasons: `No Contact Us / Get a Quote page found`, `Contact page found but no usable form detected`, `CAPTCHA on the form (cannot be solved automatically)`, `Required field not supported: ...`, `No confirmation detected after submit`, `Domain not found (DNS error)`, `Timed out after 90s`, `Homepage returned HTTP 403 (site may block automation)`.

A screenshot of each failed site is saved in `screenshots/`. Logs are in `logs/automation.log`.

## 5. API

| Method | Path | What it does |
|---|---|---|
| GET | `/api/health` | health + whether a run is active |
| GET | `/api/status` | counters and the 100 most recent results |
| POST | `/api/runs` | run until all rows are done (background) |
| POST | `/api/runs/stop` | stop after the current batch |
| POST | `/api/batches` | run exactly one batch and wait |

Only one run can be active at a time (409 otherwise). The server listens on `127.0.0.1` only; add authentication before exposing it anywhere else.

## 6. Safety switches (all in `.env`)

- `ENABLE_FORM_SUBMISSION=false` fills forms but does **not** submit; rows become `Review required`. Use this to test on a few sites first.
- `ALLOWED_DOMAINS=a.com,b.com` restricts navigation to those domains and their subdomains.
- CAPTCHAs are detected and reported, never bypassed. Hidden fields (honeypots) are never filled.
- Only use this on sites you are allowed to contact, with a message that is relevant to them. Mass unsolicited form submission can break site terms and anti-spam laws.

## 7. Limits you should know about

- Forms built without a `<form>` element (some single-page apps) are not detected.
- Multi-step forms and file-upload fields are reported as failures.
- Sites behind bot protection (Cloudflare challenges, 403) will fail with that reason.
- Unusual required fields are failed instead of guessed. Set `ENABLE_CLAUDE=true` to let Claude map unrecognised field labels (only field names/labels are sent, never your details).

## Structure

```
src/
  config/      env.js, googleSheets.js
  routes/      automationRoutes.js
  controllers/ automationController.js
  services/    sheetsService, batchService, websiteService, contactPageService,
               fieldMappingService, claudeService (optional), resultService
  browser/     browserManager, contactPageFinder, formDetector, formFiller, submissionVerifier
  utils/       logger, statusHandler, urlPolicy
  app.js  server.js
public/        dashboard UI
tests/         sheets.test.js, batch.test.js, browser.test.js
```
