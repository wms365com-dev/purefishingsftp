# PureFishing SFTP Mirror

This service connects to an SFTP server, scans the configured remote root, and only downloads files that are new or have changed since the last successful sync. Downloaded files are stored in timestamped snapshot folders while preserving the SFTP folder structure beneath the configured remote root.

It also includes:

- A built-in scheduler that can run Monday through Friday just before each top-of-hour pull window, or on a fixed minute schedule if you prefer the older behavior.
- A dashboard showing recent sync runs, total file counts by folder, and searchable file activity.
- Per-file audit history for new, changed, unchanged, and deleted files.
- CSV exports for file activity and sync runs.
- Optional webhook and SMTP email alerts for failures, activity, and daily summaries.
- SHA-256 checksums for archived files.
- Optional snapshot retention cleanup.

## Railway setup

1. Create a Railway service from this project.
2. Attach a persistent volume and set `DATA_ROOT=/data`.
3. Add the environment variables below.
4. Set the healthcheck path to `/health`.
5. Deploy.

## Environment variables

Required:

- `SFTP_HOST`
- `SFTP_USERNAME`
- One of:
  - `SFTP_PASSWORD`
  - `SFTP_PRIVATE_KEY`
  - `SFTP_PRIVATE_KEY_BASE64`

Recommended for your current schedule:

```env
DATA_ROOT=/data
SFTP_HOST=sftp.purefishing.com
SFTP_PORT=22
SFTP_USERNAME=BlueDog
SFTP_PASSWORD=your-password-here
REMOTE_ROOT=/
APP_TIMEZONE=America/New_York
ASN_REPORT_FOLDER=/BlueDog/ASN/Production
AUTO_SYNC_ENABLED=true
SYNC_TARGET_START_HOUR=8
SYNC_TARGET_END_HOUR=17
SYNC_LEAD_MINUTES=1
SYNC_WEEKDAYS=MON,TUE,WED,THU,FRI
```

Optional general settings:

- `PORT=3000`
- `DATA_ROOT=./data`
- `REMOTE_ROOT=/`
- `SFTP_PORT=22`
- `SFTP_PASSPHRASE=`
- `APP_TIMEZONE=America/New_York`
- `ASN_REPORT_FOLDER=/BlueDog/ASN/Production`
- `AUTO_SYNC_ENABLED=true`
- `SYNC_TARGET_START_HOUR=8`
- `SYNC_TARGET_END_HOUR=17`
- `SYNC_LEAD_MINUTES=1`
- `SYNC_WEEKDAYS=MON,TUE,WED,THU,FRI`
- Legacy fixed-minute schedule:
- `SYNC_START_HOUR=8`
- `SYNC_END_HOUR=16`
- `SYNC_MINUTE=55`
- `ACTIVITY_PAGE_SIZE=50`
- `SNAPSHOT_RETENTION_DAYS=0`

Optional alert settings:

- `ALERT_WEBHOOK_URL=`
- `ALERT_EMAIL_TO=ops@example.com,team@example.com`
- `ALERT_EMAIL_FROM=mirror@example.com`
- `SMTP_HOST=`
- `SMTP_PORT=587`
- `SMTP_SECURE=false`
- `SMTP_USERNAME=`
- `SMTP_PASSWORD=`
- `DAILY_SUMMARY_ENABLED=true`
- `DAILY_SUMMARY_HOUR=17`
- `DAILY_SUMMARY_MINUTE=5`
- `DAILY_SUMMARY_SEND_WHEN_EMPTY=false`

## Dashboard and reports

The dashboard includes:

- `Run Sync Now` manual trigger.
- Recent sync runs with changed, deleted, and downloaded counts.
- Total file counts by folder.
- A daily folder bar chart that shows new files by day and by folder over the last 7, 14, or 30 days.
- A dedicated ASN hourly report for `/BlueDog/ASN/Production` by default, with per-hour file counts and CSV export.
- Search filters for file/path, status, folder, run id, and date range.
- Direct download links for archived files when a snapshot exists.
- `Export Activity CSV` for filtered file history.
- `Export Runs CSV` for sync run summaries.

## Storage layout

Successful syncs create snapshot folders under:

```text
DATA_ROOT/
  mirror.db
  snapshots/
    2026/
      03/
        31/
          205500/
            ...
```

Only new or changed files are written into each timestamped snapshot folder. If a run finds no new or changed files, it records the scan and file history in SQLite but does not create a new snapshot directory.

## Backup and restore

To preserve history and archived files, back up both:

- `DATA_ROOT/mirror.db`
- `DATA_ROOT/snapshots/`

If you ever need to restore, place both back into the same `DATA_ROOT` location before starting the app.

## Private key formats

You can provide either:

- `SFTP_PRIVATE_KEY` with newline characters escaped as `\n`
- `SFTP_PRIVATE_KEY_BASE64` containing the full PEM file contents encoded in base64

## Local run

```bash
npm install
npm start
```

Then open `http://localhost:3000`.

## Notes

- For top-of-hour capture windows, set `SYNC_TARGET_START_HOUR`, `SYNC_TARGET_END_HOUR`, and `SYNC_LEAD_MINUTES`. Example: `8`, `17`, and `1` runs at `7:59`, `8:59`, ..., `16:59` to capture the `8:00 AM` through `5:00 PM` hourly boundary.
- If a scheduled slot happens while a sync is still running, the service now queues one follow-up scheduled sync to start immediately after the current run completes.
- If you prefer the older fixed-minute pattern, omit the `SYNC_TARGET_*` variables and use `SYNC_START_HOUR`, `SYNC_END_HOUR`, and `SYNC_MINUTE`.
- Remote deletions are logged into the audit trail and removed from the current tracked set.
- Retention cleanup is disabled by default until you set `SNAPSHOT_RETENTION_DAYS`.
- Alert delivery is optional; if no webhook or SMTP settings are configured, the app still syncs and logs normally.
