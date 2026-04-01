function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(value, timezone) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(new Date(value));
}

function formatSize(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  const size = Number(value);
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function shortenChecksum(value) {
  if (!value) {
    return "-";
  }

  return `${value.slice(0, 10)}...`;
}

function renderRunRows(runs, timezone) {
  if (!runs.length) {
    return `<tr><td colspan="8" class="empty">No sync runs yet.</td></tr>`;
  }

  return runs.map((run) => `
    <tr>
      <td>${escapeHtml(run.id)}</td>
      <td>${escapeHtml(run.trigger_source)}</td>
      <td>${escapeHtml(formatDateTime(run.started_at, timezone))}</td>
      <td>${escapeHtml(run.new_files + run.changed_files)}</td>
      <td>${escapeHtml(run.deleted_files)}</td>
      <td>${escapeHtml(run.downloaded_files)}</td>
      <td><span class="pill pill-${escapeHtml(run.status)}">${escapeHtml(run.status)}</span></td>
      <td>${escapeHtml(run.message || run.snapshot_dir || "-")}</td>
    </tr>
  `).join("");
}

function renderFolderRows(folderStats) {
  if (!folderStats.length) {
    return `<tr><td colspan="4" class="empty">No folder counts available yet.</td></tr>`;
  }

  const maxTotal = Math.max(...folderStats.map((entry) => entry.total_file_count), 1);

  return folderStats.map((entry) => {
    const width = Math.max(8, Math.round((entry.total_file_count / maxTotal) * 100));
    return `
      <tr>
        <td class="path">${escapeHtml(entry.folder_path)}</td>
        <td>${escapeHtml(entry.direct_file_count)}</td>
        <td>${escapeHtml(entry.total_file_count)}</td>
        <td><div class="bar"><span style="width:${width}%"></span></div></td>
      </tr>
    `;
  }).join("");
}

function renderActivityRows(rows, timezone) {
  if (!rows.length) {
    return `<tr><td colspan="8" class="empty">No file activity matches the current filters.</td></tr>`;
  }

  return rows.map((row) => {
    const download = row.snapshot_path
      ? `<a class="link" href="/files/download?id=${encodeURIComponent(row.id)}">Download</a>`
      : `<span class="muted">No archive</span>`;

    return `
      <tr class="row-${escapeHtml(row.event_type)}">
        <td>${escapeHtml(formatDateTime(row.event_at, timezone))}</td>
        <td><span class="pill pill-${escapeHtml(row.event_type)}">${escapeHtml(row.event_type)}</span></td>
        <td>${escapeHtml(row.run_id)}</td>
        <td class="path">${escapeHtml(row.folder_path)}</td>
        <td class="path">${escapeHtml(row.file_name)}</td>
        <td>${escapeHtml(formatSize(row.size))}</td>
        <td><code>${escapeHtml(shortenChecksum(row.checksum))}</code></td>
        <td>${download}</td>
      </tr>
    `;
  }).join("");
}

function renderDashboard({ dashboard, config, serviceState, flashMessage, filters, links }) {
  const summary = dashboard.summary || {};
  const activitySummary = dashboard.activitySummary || {};
  const statusText = serviceState.running ? "Sync running" : "Idle";
  const currentRun = serviceState.currentRun || null;
  const disableNotice = config.autoSyncEnabled ? "" : `<p class="flash warn">Automatic sync is disabled.</p>`;
  const flash = flashMessage ? `<p class="flash">${escapeHtml(flashMessage)}</p>` : "";
  const retentionLabel = config.snapshotRetentionDays
    ? `${config.snapshotRetentionDays} day(s)`
    : "Disabled";
  const alertsLabel = config.alertsConfigured ? "Configured" : "Not configured";
  const liveProgress = currentRun ? `
    <div class="stats" style="margin-top:18px">
      <div class="stat"><div class="label">Phase</div><div class="value">${escapeHtml(currentRun.phase || "running")}</div></div>
      <div class="stat"><div class="label">Discovered</div><div class="value">${escapeHtml(currentRun.discoveredFiles || 0)}</div></div>
      <div class="stat"><div class="label">Downloaded</div><div class="value">${escapeHtml(currentRun.downloadedFiles || 0)}</div></div>
    </div>
    <div class="detail" style="margin-top:14px">
      <div><strong>Started:</strong> ${escapeHtml(formatDateTime(currentRun.startedAt, config.timezone))}</div>
      <div><strong>Current path:</strong> ${escapeHtml(currentRun.currentPath || "-")}</div>
      <div><strong>Live message:</strong> ${escapeHtml(currentRun.message || "-")}</div>
    </div>
  ` : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PureFishing SFTP Mirror</title>
  <style>
    :root{--bg:#f5efe2;--panel:#fffdf8;--ink:#1a2940;--muted:#66768a;--line:#ddd1bb;--accent:#0e6b50;--accent-soft:#ddf0ea;--warn:#b94d00;--warn-soft:#fde7d7;--delete:#8a1c1c;--delete-soft:#fae3e3}
    *{box-sizing:border-box}body{margin:0;font-family:Georgia,"Times New Roman",serif;background:linear-gradient(180deg,#eee3cd 0%,var(--bg) 45%,#e7f1eb 100%);color:var(--ink)}
    main{width:min(1240px,calc(100% - 24px));margin:20px auto 40px}
    .hero,.grid{display:grid;gap:18px}.hero{grid-template-columns:1.4fr .8fr;margin-bottom:18px}.grid{grid-template-columns:1fr 1fr;margin-bottom:18px}
    .panel{background:rgba(255,253,248,.94);border:1px solid rgba(221,209,187,.9);border-radius:22px;padding:22px;box-shadow:0 16px 34px rgba(26,41,64,.08)}
    .eyebrow{display:inline-block;padding:6px 10px;border-radius:999px;background:rgba(26,41,64,.06);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
    h1{margin:14px 0 10px;font-size:clamp(2rem,4vw,3.5rem);line-height:.96;letter-spacing:-.05em}h2{margin:0 0 14px;font-size:1.3rem}
    p{margin:0 0 14px}.lede{color:var(--muted);line-height:1.6;max-width:60ch}
    .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:18px}
    .stat{padding:14px;border-radius:18px;background:rgba(26,41,64,.04)}.label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}.value{font-size:1.35rem}
    .detail{display:grid;gap:10px;color:var(--muted)}.detail strong{color:var(--ink)}
    .button-row,.filter-actions{display:flex;flex-wrap:wrap;gap:10px}
    button,.button-link{border:0;border-radius:999px;background:var(--ink);color:#fff;padding:13px 18px;font-size:.95rem;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
    .button-link.secondary{background:rgba(26,41,64,.08);color:var(--ink)}
    button:disabled{opacity:.5;cursor:not-allowed}.flash{padding:12px 14px;border-radius:14px;background:var(--accent-soft);border:1px solid rgba(14,107,80,.14)}.warn{background:var(--warn-soft);border-color:rgba(185,77,0,.14)}
    form.filters{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;align-items:end}
    label{display:grid;gap:6px;font-size:14px;color:var(--muted)}
    input,select{width:100%;padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:#fff;font:inherit;color:var(--ink)}
    table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:11px 8px;border-bottom:1px solid var(--line);vertical-align:top;font-size:.93rem}th{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
    .path{word-break:break-word}.bar{height:12px;min-width:120px;background:rgba(26,41,64,.08);border-radius:999px;overflow:hidden}.bar span{display:block;height:100%;background:linear-gradient(90deg,#2d936c,#0e6b50);border-radius:inherit}
    .pill{display:inline-flex;padding:6px 10px;border-radius:999px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;background:rgba(26,41,64,.08)}
    .pill-success,.pill-running,.pill-new,.pill-changed{background:var(--accent-soft);color:var(--accent)}
    .pill-failed,.pill-deleted{background:var(--warn-soft);color:var(--warn)}
    .pill-unchanged{background:rgba(26,41,64,.08);color:var(--muted)}
    .empty{text-align:center;color:var(--muted);padding:20px 8px}.muted{color:var(--muted)}.link{color:var(--accent);text-decoration:none}
    .row-deleted{background:rgba(250,227,227,.45)}
    code{font-family:"Cascadia Code","SFMono-Regular",Consolas,monospace}
    @media (max-width:1040px){.hero,.grid{grid-template-columns:1fr}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}form.filters{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media (max-width:680px){main{width:min(100% - 14px,100%)}.panel{padding:18px}.stats,form.filters{grid-template-columns:1fr}.button-row,.filter-actions{flex-direction:column;align-items:stretch}}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="panel">
        <div class="eyebrow">PureFishing SFTP Mirror</div>
        <h1>Track every incoming file, every sync run, and every deletion.</h1>
        <p class="lede">The service mirrors only new or changed files into timestamped snapshot folders, keeps a per-file audit trail, and gives you searchable activity plus CSV exports for reporting.</p>
        <div class="stats">
          <div class="stat"><div class="label">Tracked Files</div><div class="value">${escapeHtml(summary.tracked_files || 0)}</div></div>
          <div class="stat"><div class="label">Tracked Folders</div><div class="value">${escapeHtml(summary.tracked_folders || 0)}</div></div>
          <div class="stat"><div class="label">Recent Changes</div><div class="value">${escapeHtml(summary.recent_changes || 0)}</div></div>
          <div class="stat"><div class="label">Recent Deletions</div><div class="value">${escapeHtml(summary.recent_deletions || 0)}</div></div>
          <div class="stat"><div class="label">Last Success</div><div class="value">${escapeHtml(formatDateTime(summary.last_success_at, config.timezone))}</div></div>
          <div class="stat"><div class="label">Filter Matches</div><div class="value">${escapeHtml(activitySummary.total || 0)}</div></div>
        </div>
      </div>
      <aside class="panel">
        <div class="eyebrow">Status</div>
        <h2>${escapeHtml(statusText)}</h2>
        <p class="lede">Run a sync any time, review activity below, download archived files, and export CSV reports using the same filters shown on the page.</p>
        <div class="detail">
          <div><strong>Remote root:</strong> ${escapeHtml(config.remoteRoot)}</div>
          <div><strong>SFTP host:</strong> ${escapeHtml(config.sftpHost)}:${escapeHtml(config.sftpPort)}</div>
          <div><strong>Schedule:</strong> ${escapeHtml(config.schedule)}</div>
          <div><strong>Alerts:</strong> ${escapeHtml(alertsLabel)}</div>
          <div><strong>Snapshot retention:</strong> ${escapeHtml(retentionLabel)}</div>
          <div><strong>Activity page size:</strong> ${escapeHtml(config.activityPageSize)}</div>
        </div>
        ${liveProgress}
        ${disableNotice}
        ${flash}
        <div class="button-row" style="margin-top:16px">
          <form method="post" action="/sync">
            <button type="submit"${serviceState.running ? " disabled" : ""}>Run Sync Now</button>
          </form>
          <a class="button-link secondary" href="${escapeHtml(links.runsCsv)}">Export Runs CSV</a>
        </div>
      </aside>
    </section>

    <section class="panel" style="margin-bottom:18px">
      <div class="eyebrow">Reports</div>
      <h2>File Activity Filters</h2>
      <form class="filters" method="get" action="/">
        <label>
          Search
          <input type="text" name="q" value="${escapeHtml(filters.q || "")}" placeholder="File or path">
        </label>
        <label>
          Status
          <select name="status">
            <option value="">All statuses</option>
            <option value="new"${filters.status === "new" ? " selected" : ""}>New</option>
            <option value="changed"${filters.status === "changed" ? " selected" : ""}>Changed</option>
            <option value="unchanged"${filters.status === "unchanged" ? " selected" : ""}>Unchanged</option>
            <option value="deleted"${filters.status === "deleted" ? " selected" : ""}>Deleted</option>
          </select>
        </label>
        <label>
          Folder
          <input type="text" name="folder" value="${escapeHtml(filters.folder || "")}" placeholder="/inbound/orders">
        </label>
        <label>
          Date From
          <input type="date" name="date_from" value="${escapeHtml(filters.dateFrom || "")}">
        </label>
        <label>
          Date To
          <input type="date" name="date_to" value="${escapeHtml(filters.dateTo || "")}">
        </label>
        <label>
          Run ID
          <input type="number" min="1" name="run_id" value="${escapeHtml(filters.runId || "")}" placeholder="Optional">
        </label>
        <div class="filter-actions">
          <button type="submit">Apply Filters</button>
          <a class="button-link secondary" href="/">Clear</a>
          <a class="button-link secondary" href="${escapeHtml(links.activityCsv)}">Export Activity CSV</a>
        </div>
      </form>
      <div class="stats" style="margin-top:18px">
        <div class="stat"><div class="label">New</div><div class="value">${escapeHtml(activitySummary.new || 0)}</div></div>
        <div class="stat"><div class="label">Changed</div><div class="value">${escapeHtml(activitySummary.changed || 0)}</div></div>
        <div class="stat"><div class="label">Deleted</div><div class="value">${escapeHtml(activitySummary.deleted || 0)}</div></div>
      </div>
    </section>

    <section class="grid">
      <div class="panel">
        <h2>Recent Sync Runs</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Trigger</th><th>Started</th><th>Changed</th><th>Deleted</th><th>Downloaded</th><th>Status</th><th>Message</th>
            </tr>
          </thead>
          <tbody>${renderRunRows(dashboard.recentRuns || [], config.timezone)}</tbody>
        </table>
      </div>
      <div class="panel">
        <h2>Total File Count By Folder</h2>
        <table>
          <thead>
            <tr>
              <th>Folder</th><th>Direct</th><th>Total</th><th>Visual</th>
            </tr>
          </thead>
          <tbody>${renderFolderRows(dashboard.folderStats || [])}</tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <h2>File Activity</h2>
      <table>
        <thead>
          <tr>
            <th>When</th><th>Event</th><th>Run</th><th>Folder</th><th>File</th><th>Size</th><th>Checksum</th><th>Archive</th>
          </tr>
        </thead>
        <tbody>${renderActivityRows(dashboard.fileActivity || [], config.timezone)}</tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}

module.exports = {
  renderDashboard
};
