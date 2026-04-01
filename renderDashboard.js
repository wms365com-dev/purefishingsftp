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

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) {
    return "Calculating...";
  }

  const total = Math.max(0, Math.round(Number(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${remainingSeconds}s`;
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

function renderRunCards(runs, timezone) {
  if (!runs.length) {
    return `<div class="mobile-empty">No sync runs yet.</div>`;
  }

  return runs.map((run) => `
    <article class="mobile-card">
      <div class="mobile-card-head">
        <div>
          <span class="mobile-card-kicker">Run ${escapeHtml(run.id)}</span>
          <strong class="mobile-card-title">${escapeHtml(run.trigger_source)} sync</strong>
        </div>
        <span class="pill pill-${escapeHtml(run.status)}">${escapeHtml(run.status)}</span>
      </div>
      <div class="mobile-card-meta">${escapeHtml(formatDateTime(run.started_at, timezone))}</div>
      <div class="mobile-card-stats">
        <div class="mobile-stat"><span>Changed</span><strong>${escapeHtml(run.new_files + run.changed_files)}</strong></div>
        <div class="mobile-stat"><span>Deleted</span><strong>${escapeHtml(run.deleted_files)}</strong></div>
        <div class="mobile-stat"><span>Downloaded</span><strong>${escapeHtml(run.downloaded_files)}</strong></div>
      </div>
      <div class="mobile-card-note">${escapeHtml(run.message || run.snapshot_dir || "-")}</div>
    </article>
  `).join("");
}

function renderFolderCards(folderStats) {
  if (!folderStats.length) {
    return `<div class="mobile-empty">No folder counts available yet.</div>`;
  }

  const maxTotal = Math.max(...folderStats.map((entry) => entry.total_file_count), 1);

  return folderStats.map((entry) => {
    const width = Math.max(8, Math.round((entry.total_file_count / maxTotal) * 100));
    return `
      <article class="mobile-card">
        <div class="mobile-card-head">
          <div>
            <span class="mobile-card-kicker">Folder</span>
            <strong class="mobile-card-title">${escapeHtml(entry.folder_path)}</strong>
          </div>
          <span class="mobile-chip">${escapeHtml(entry.total_file_count)} total</span>
        </div>
        <div class="mobile-card-stats">
          <div class="mobile-stat"><span>Direct</span><strong>${escapeHtml(entry.direct_file_count)}</strong></div>
          <div class="mobile-stat"><span>Total</span><strong>${escapeHtml(entry.total_file_count)}</strong></div>
        </div>
        <div class="bar"><span style="width:${width}%"></span></div>
      </article>
    `;
  }).join("");
}

function renderActivityCards(rows, timezone) {
  if (!rows.length) {
    return `<div class="mobile-empty">No file activity matches the current filters.</div>`;
  }

  return rows.map((row) => `
    <article class="mobile-card mobile-card-${escapeHtml(row.event_type)}">
      <div class="mobile-card-head">
        <div>
          <span class="mobile-card-kicker">${escapeHtml(formatDateTime(row.event_at, timezone))}</span>
          <strong class="mobile-card-title">${escapeHtml(row.file_name)}</strong>
        </div>
        <span class="pill pill-${escapeHtml(row.event_type)}">${escapeHtml(row.event_type)}</span>
      </div>
      <div class="mobile-card-meta">${escapeHtml(row.folder_path)}</div>
      <div class="mobile-card-stats">
        <div class="mobile-stat"><span>Run</span><strong>${escapeHtml(row.run_id)}</strong></div>
        <div class="mobile-stat"><span>Size</span><strong>${escapeHtml(formatSize(row.size))}</strong></div>
      </div>
      <div class="mobile-card-note">
        <div><strong>Checksum:</strong> <code>${escapeHtml(shortenChecksum(row.checksum))}</code></div>
        <div>${row.snapshot_path ? `<a class="link" href="/files/download?id=${encodeURIComponent(row.id)}">Download archived file</a>` : `<span class="muted">No archive</span>`}</div>
      </div>
    </article>
  `).join("");
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

  const autoRefreshScript = serviceState.running ? `
  <script>
    (function () {
      var seconds = 5;
      var counter = document.getElementById("refresh-countdown");
      function tick() {
        if (counter) {
          counter.textContent = String(seconds);
        }
        if (seconds <= 0) {
          window.location.reload();
          return;
        }
        seconds -= 1;
        window.setTimeout(tick, 1000);
      }
      tick();
    }());
  </script>` : "";

  const liveProgress = currentRun ? `
    <div class="flash" style="margin-top:16px">
      Auto-refreshing in <strong id="refresh-countdown">5</strong> seconds while this sync is running.
    </div>
    <div class="status-grid">
      <div class="status-tile"><span>Phase</span><strong>${escapeHtml(currentRun.phase || "running")}</strong></div>
      <div class="status-tile"><span>Progress</span><strong>${escapeHtml(currentRun.percentComplete || 0)}%</strong></div>
      <div class="status-tile"><span>ETA</span><strong>${escapeHtml(formatDuration(currentRun.etaSeconds))}</strong></div>
      <div class="status-tile"><span>Discovered</span><strong>${escapeHtml(currentRun.discoveredFiles || 0)}</strong></div>
      <div class="status-tile"><span>Downloaded</span><strong>${escapeHtml(currentRun.downloadedFiles || 0)}</strong></div>
      <div class="status-tile"><span>Processed</span><strong>${escapeHtml(currentRun.processedFiles || 0)}</strong></div>
    </div>
    <div class="progress-track" aria-label="Sync progress">
      <div class="progress-fill" style="width:${escapeHtml(currentRun.percentComplete || 0)}%"></div>
    </div>
    <div class="detail-list" style="margin-top:14px">
      <div><strong>Started</strong><span>${escapeHtml(formatDateTime(currentRun.startedAt, config.timezone))}</span></div>
      <div><strong>Current path</strong><span>${escapeHtml(currentRun.currentPath || "-")}</span></div>
      <div><strong>Last completed file</strong><span>${escapeHtml(currentRun.lastCompletedPath || "-")}</span></div>
      <div><strong>Last completed event</strong><span>${escapeHtml(currentRun.lastCompletedEvent || "-")}</span></div>
      <div><strong>Live message</strong><span>${escapeHtml(currentRun.message || "-")}</span></div>
    </div>
  ` : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#14304a">
  <title>PureFishing SFTP Mirror</title>
  <style>
    :root {
      --bg: #eef2f5;
      --panel: #ffffff;
      --panel-2: #f6f8fa;
      --line: #d9e1e8;
      --text: #18232f;
      --muted: #677787;
      --brand: #1768ff;
      --ok: #1f9d68;
      --warn: #d79a00;
      --bad: #cf3d3d;
      --radius: 18px;
      --radius-sm: 12px;
      --shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
    }

    * { box-sizing: border-box; }
    html { background: var(--bg); }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--text);
      font-family: "Trebuchet MS", "Segoe UI Variable", "Segoe UI", sans-serif;
      background: var(--bg);
    }

    button, input, select { font: inherit; }
    button { border: 0; cursor: pointer; }

    .app {
      width: min(1400px, calc(100vw - 1rem));
      margin: 0 auto;
      padding: 0.75rem 0 2rem;
    }

    .hero, .card {
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--panel);
      box-shadow: var(--shadow);
    }

    .hero {
      padding: 1rem 1.1rem;
      display: grid;
      gap: 1rem;
      grid-template-columns: 1.35fr 0.85fr;
    }

    .eyebrow {
      display: inline-flex;
      gap: 0.55rem;
      align-items: center;
      margin: 0 0 0.8rem;
      color: var(--brand);
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .eyebrow::before {
      content: "";
      width: 0.7rem;
      height: 0.7rem;
      border-radius: 50%;
      background: var(--brand);
    }

    h1, h2, h3 { margin: 0; }
    h1 { font-size: clamp(2rem, 4vw, 3.2rem); line-height: 0.96; letter-spacing: -0.03em; }
    h2 { font-size: 1.25rem; }
    p { margin: 0; }

    .lead, .meta, .muted { color: var(--muted); line-height: 1.55; }
    .hero-copy, .hero-side, .card-head, .detail-list, .form-copy, .stack { display: grid; gap: 0.55rem; }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.75rem;
      margin-top: 1rem;
    }

    .summary-card, .status-tile, .mobile-stat {
      padding: 0.85rem 0.9rem;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: var(--panel-2);
    }

    .summary-card span, .status-tile span, .mobile-stat span {
      display: block;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .summary-card strong, .status-tile strong, .mobile-stat strong {
      display: block;
      margin-top: 0.3rem;
      font-size: 1.05rem;
      line-height: 1.2;
      color: var(--text);
      word-break: break-word;
    }

    .status-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.75rem;
      margin-top: 1rem;
    }

    .detail-list {
      margin-top: 1rem;
      color: var(--muted);
    }

    .detail-list div {
      display: grid;
      gap: 0.1rem;
      padding: 0.4rem 0;
      border-bottom: 1px solid var(--line);
    }

    .detail-list strong {
      color: var(--text);
      font-size: 0.82rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .detail-list span {
      word-break: break-word;
      line-height: 1.4;
    }

    .progress-track {
      margin-top: 0.95rem;
      height: 14px;
      background: rgba(23, 104, 255, 0.08);
      border-radius: 999px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #1768ff, #1f9d68);
      border-radius: inherit;
      transition: width .35s ease;
    }

    .button-row, .filter-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.7rem;
    }

    button, .button-link {
      min-height: 48px;
      padding: 0.9rem 1rem;
      border-radius: 999px;
      background: var(--brand);
      color: #fff;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
    }

    .button-link.secondary {
      background: var(--panel-2);
      color: var(--text);
      border: 1px solid var(--line);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .flash {
      margin-top: 1rem;
      padding: 0.85rem 0.95rem;
      border-radius: 14px;
      border: 1px solid rgba(31, 157, 104, 0.16);
      background: rgba(31, 157, 104, 0.08);
      color: var(--text);
    }

    .warn {
      border-color: rgba(207, 61, 61, 0.16);
      background: rgba(207, 61, 61, 0.08);
    }

    .section-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-top: 1rem;
    }

    .card {
      padding: 1rem 1.05rem;
    }

    .filters-card {
      margin-top: 1rem;
    }

    form.filters {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.75rem;
      margin-top: 1rem;
    }

    label {
      display: grid;
      gap: 0.35rem;
      min-width: 0;
      color: var(--muted);
      font-size: 0.88rem;
    }

    input, select {
      width: 100%;
      padding: 0.9rem 1rem;
      border-radius: var(--radius-sm);
      border: 1px solid var(--line);
      background: var(--panel-2);
      color: var(--text);
    }

    input:focus, select:focus {
      outline: none;
      border-color: rgba(89, 183, 255, 0.9);
      box-shadow: 0 0 0 4px rgba(89, 183, 255, 0.12);
    }

    .table-wrap {
      margin-top: 0.9rem;
      overflow: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      text-align: left;
      padding: 0.75rem 0.55rem;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
      font-size: 0.92rem;
    }

    th {
      font-size: 0.76rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      white-space: nowrap;
    }

    .path { word-break: break-word; }
    .bar {
      height: 12px;
      min-width: 120px;
      background: rgba(23, 104, 255, 0.08);
      border-radius: 999px;
      overflow: hidden;
    }

    .bar span {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, #1768ff, #1f9d68);
      border-radius: inherit;
    }

    .pill, .mobile-chip {
      display: inline-flex;
      padding: 0.35rem 0.6rem;
      border-radius: 999px;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      background: var(--panel-2);
      color: var(--text);
      border: 1px solid var(--line);
      white-space: nowrap;
    }

    .pill-success, .pill-running, .pill-new, .pill-changed {
      background: rgba(31, 157, 104, 0.08);
      color: var(--ok);
      border-color: rgba(31, 157, 104, 0.16);
    }

    .pill-failed, .pill-deleted {
      background: rgba(207, 61, 61, 0.08);
      color: var(--bad);
      border-color: rgba(207, 61, 61, 0.16);
    }

    .pill-unchanged {
      color: var(--muted);
    }

    .empty, .mobile-empty {
      color: var(--muted);
      text-align: center;
      padding: 1rem;
    }

    .link {
      color: var(--brand);
      text-decoration: none;
      font-weight: 700;
    }

    .row-deleted {
      background: rgba(250, 227, 227, 0.45);
    }

    code {
      font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
    }

    .mobile-only { display: none !important; }
    .desktop-only { display: block !important; }
    .mobile-card-list {
      display: grid;
      gap: 0.75rem;
      margin-top: 0.9rem;
    }

    .mobile-card {
      display: grid;
      gap: 0.65rem;
      padding: 0.9rem;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: var(--panel);
    }

    .mobile-card-deleted {
      background: rgba(250, 227, 227, 0.45);
    }

    .mobile-card-head {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      align-items: flex-start;
    }

    .mobile-card-kicker {
      display: block;
      font-size: 0.76rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .mobile-card-title {
      display: block;
      margin-top: 0.2rem;
      font-size: 1rem;
      font-weight: 700;
      color: var(--text);
      line-height: 1.2;
      word-break: break-word;
    }

    .mobile-card-meta, .mobile-card-note {
      color: var(--muted);
      font-size: 0.9rem;
      line-height: 1.35;
      word-break: break-word;
    }

    .mobile-card-stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.55rem;
    }

    @media (max-width: 1040px) {
      .hero, .section-grid { grid-template-columns: 1fr; }
      .summary-grid, .status-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      form.filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    @media (max-width: 760px) {
      html {
        overflow: hidden;
        background: var(--bg);
      }

      body {
        --mobile-safe-top: max(5px, env(safe-area-inset-top));
        --mobile-safe-right: max(5px, env(safe-area-inset-right));
        --mobile-safe-bottom: max(5px, env(safe-area-inset-bottom));
        --mobile-safe-left: max(5px, env(safe-area-inset-left));
        min-height: 100dvh;
        width: 100%;
        overflow: hidden;
        overscroll-behavior: none;
        padding: 0;
        background: transparent;
      }

      .mobile-only { display: block !important; }
      .desktop-only { display: none !important; }

      .app {
        position: fixed;
        top: var(--mobile-safe-top);
        left: 50%;
        transform: translateX(-50%);
        width: min(414px, calc(100vw - var(--mobile-safe-left) - var(--mobile-safe-right)));
        max-width: calc(100vw - var(--mobile-safe-left) - var(--mobile-safe-right));
        height: calc(100dvh - var(--mobile-safe-top) - var(--mobile-safe-bottom));
        min-height: calc(100dvh - var(--mobile-safe-top) - var(--mobile-safe-bottom));
        max-height: calc(100dvh - var(--mobile-safe-top) - var(--mobile-safe-bottom));
        padding: 0.6rem 0 0.95rem;
        overflow-y: auto;
        overflow-x: hidden;
        isolation: isolate;
        background: #f4f6f8;
      }

      .hero {
        grid-template-columns: 1fr;
        gap: 0.85rem;
        margin: 0 0.5rem;
        padding: 0.9rem;
      }

      .hero-copy h1 {
        font-size: 1.55rem;
        letter-spacing: -0.02em;
      }

      .hero-copy .lead {
        display: none;
      }

      .hero-side {
        position: sticky;
        top: 0;
        z-index: 4;
        padding-bottom: 0.2rem;
        background: #ffffff;
        border-radius: 14px;
      }

      .summary-grid, .status-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.6rem;
      }

      .summary-card, .status-tile, .mobile-stat {
        padding: 0.75rem;
      }

      .status-tile strong, .summary-card strong {
        font-size: 0.98rem;
      }

      .button-row, .filter-actions {
        flex-direction: column;
        align-items: stretch;
      }

      .card {
        margin: 0.75rem 0.5rem 0;
        padding: 0.9rem;
      }

      form.filters {
        grid-template-columns: 1fr;
      }

      .mobile-card-stats {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  </style>
</head>
<body>
  <main class="app">
    <section class="hero">
      <div class="hero-copy stack">
        <div class="eyebrow">PureFishing SFTP Mirror</div>
        <h1>Track incoming files with a cleaner mobile ops view.</h1>
        <p class="lead">The service mirrors new or changed SFTP files into timestamped snapshots, keeps an audit trail, and gives you report exports with live run progress.</p>
        <div class="summary-grid">
          <div class="summary-card"><span>Tracked Files</span><strong>${escapeHtml(summary.tracked_files || 0)}</strong></div>
          <div class="summary-card"><span>Tracked Folders</span><strong>${escapeHtml(summary.tracked_folders || 0)}</strong></div>
          <div class="summary-card"><span>Recent Changes</span><strong>${escapeHtml(summary.recent_changes || 0)}</strong></div>
          <div class="summary-card"><span>Recent Deletions</span><strong>${escapeHtml(summary.recent_deletions || 0)}</strong></div>
          <div class="summary-card"><span>Last Success</span><strong>${escapeHtml(formatDateTime(summary.last_success_at, config.timezone))}</strong></div>
          <div class="summary-card"><span>Filter Matches</span><strong>${escapeHtml(activitySummary.total || 0)}</strong></div>
        </div>
      </div>

      <aside class="hero-side stack">
        <div class="eyebrow">Status</div>
        <h2>${escapeHtml(statusText)}</h2>
        <div class="detail-list">
          <div><strong>Remote root</strong><span>${escapeHtml(config.remoteRoot)}</span></div>
          <div><strong>SFTP host</strong><span>${escapeHtml(config.sftpHost)}:${escapeHtml(config.sftpPort)}</span></div>
          <div><strong>Schedule</strong><span>${escapeHtml(config.schedule)}</span></div>
          <div><strong>Alerts</strong><span>${escapeHtml(alertsLabel)}</span></div>
          <div><strong>Snapshot retention</strong><span>${escapeHtml(retentionLabel)}</span></div>
          <div><strong>Activity page size</strong><span>${escapeHtml(config.activityPageSize)}</span></div>
        </div>
        ${liveProgress}
        ${disableNotice}
        ${flash}
        <div class="button-row" style="margin-top:1rem">
          <form method="post" action="/sync">
            <button type="submit"${serviceState.running ? " disabled" : ""}>Run Sync Now</button>
          </form>
          <a class="button-link secondary" href="${escapeHtml(links.runsCsv)}">Export Runs CSV</a>
        </div>
      </aside>
    </section>

    <section class="card filters-card">
      <div class="eyebrow">Reports</div>
      <div class="form-copy">
        <h2>File Activity Filters</h2>
        <p class="meta">Filter the audit trail and export only the slice you need.</p>
      </div>
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
          <input type="text" name="folder" value="${escapeHtml(filters.folder || "")}" placeholder="/BlueDog/Orders">
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
      <div class="summary-grid" style="margin-top:1rem">
        <div class="summary-card"><span>New</span><strong>${escapeHtml(activitySummary.new || 0)}</strong></div>
        <div class="summary-card"><span>Changed</span><strong>${escapeHtml(activitySummary.changed || 0)}</strong></div>
        <div class="summary-card"><span>Deleted</span><strong>${escapeHtml(activitySummary.deleted || 0)}</strong></div>
      </div>
    </section>

    <section class="section-grid desktop-only">
      <section class="card">
        <div class="card-head">
          <h2>Recent Sync Runs</h2>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th><th>Trigger</th><th>Started</th><th>Changed</th><th>Deleted</th><th>Downloaded</th><th>Status</th><th>Message</th>
              </tr>
            </thead>
            <tbody>${renderRunRows(dashboard.recentRuns || [], config.timezone)}</tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Total File Count By Folder</h2>
        </div>
        <div class="table-wrap">
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
    </section>

    <section class="card mobile-only">
      <div class="card-head">
        <h2>Recent Sync Runs</h2>
      </div>
      <div class="mobile-card-list">${renderRunCards(dashboard.recentRuns || [], config.timezone)}</div>
    </section>

    <section class="card mobile-only">
      <div class="card-head">
        <h2>Total File Count By Folder</h2>
      </div>
      <div class="mobile-card-list">${renderFolderCards(dashboard.folderStats || [])}</div>
    </section>

    <section class="card desktop-only">
      <div class="card-head">
        <h2>File Activity</h2>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th><th>Event</th><th>Run</th><th>Folder</th><th>File</th><th>Size</th><th>Checksum</th><th>Archive</th>
            </tr>
          </thead>
          <tbody>${renderActivityRows(dashboard.fileActivity || [], config.timezone)}</tbody>
        </table>
      </div>
    </section>

    <section class="card mobile-only">
      <div class="card-head">
        <h2>File Activity</h2>
      </div>
      <div class="mobile-card-list">${renderActivityCards(dashboard.fileActivity || [], config.timezone)}</div>
    </section>
  </main>
${autoRefreshScript}
</body>
</html>`;
}

module.exports = {
  renderDashboard
};

