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

function formatTimeOnly(value, timezone) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDateLabel(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    return String(value || "-");
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00Z`));
}

function shortenFolderPath(folderPath) {
  const segments = String(folderPath || "")
    .split("/")
    .filter(Boolean);

  if (segments.length <= 2) {
    return folderPath || "/";
  }

  return `${segments.slice(-2).join("/")}`;
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

function formatQuantity(value, fallback = "") {
  if (value === null || value === undefined || value === "") {
    return fallback || "-";
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback || String(value);
  }

  if (Number.isInteger(numeric)) {
    return String(numeric);
  }

  return numeric.toFixed(2).replace(/\.?0+$/, "");
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

function renderHiddenFilterInputs(filters, options = {}) {
  const entries = [
    ["q", filters.q],
    ["status", filters.status],
    ["folder", filters.folder],
    ["date_from", filters.dateFrom],
    ["date_to", filters.dateTo],
    ["run_id", filters.runId],
    options.includeIntakeDate ? ["intake_date", filters.intakeDate] : null,
    options.includeAsnDate ? ["asn_date", filters.asnDate] : null,
    options.includeTrendDate ? ["trend_date", filters.trendDate] : null,
    options.includeTrendDays ? ["trend_days", filters.trendDays] : null
  ];

  return entries
    .filter(Boolean)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join("");
}

function renderDailyIntakeRows(rows) {
  if (!rows.length) {
    return `<div class="intake-empty">No new files were added on the selected day.</div>`;
  }

  const maxAdded = Math.max(...rows.map((entry) => Number(entry.added_count) || 0), 1);

  return rows.map((entry, index) => {
    const addedCount = Number(entry.added_count) || 0;
    const addedBytes = Number(entry.added_bytes) || 0;
    const width = Math.max(10, Math.round((addedCount / maxAdded) * 100));

    return `
      <article class="intake-row">
        <div class="intake-rank">${escapeHtml(index + 1)}</div>
        <div class="intake-main">
          <div class="intake-topline">
            <strong>${escapeHtml(entry.folder_path)}</strong>
            <span class="mobile-chip">${escapeHtml(addedCount)} new</span>
          </div>
          <div class="intake-strip" aria-hidden="true"><span style="width:${width}%"></span></div>
          <div class="intake-foot">
            <span>${escapeHtml(formatSize(addedBytes))} added</span>
            <span>${escapeHtml(addedCount)} files for the day</span>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function renderAsnHourlyRows(report, timezone) {
  if (!report || !report.rows || !report.rows.length) {
    return `<tr><td colspan="6" class="empty">No ASN activity has been logged yet.</td></tr>`;
  }

  const maxAdded = Math.max(...report.rows.map((row) => Number(row.added_count) || 0), 1);

  return report.rows.map((row) => {
    const addedCount = Number(row.added_count) || 0;
    const width = addedCount > 0
      ? Math.max(10, Math.round((addedCount / maxAdded) * 100))
      : 0;

    return `
      <tr class="${row.is_peak ? "asn-row-peak" : ""}">
        <td>${escapeHtml(row.hour_label)}</td>
        <td>${escapeHtml(addedCount)}</td>
        <td>${escapeHtml(formatSize(row.added_bytes))}</td>
        <td>${escapeHtml(formatTimeOnly(row.first_event_at, timezone))}</td>
        <td>${escapeHtml(formatTimeOnly(row.last_event_at, timezone))}</td>
        <td><div class="bar asn-bar"><span style="width:${width}%"></span></div></td>
      </tr>
    `;
  }).join("");
}

function renderAsnHourlyCards(report, timezone) {
  if (!report || !report.rows || !report.rows.length) {
    return `<div class="mobile-empty">No ASN activity has been logged yet.</div>`;
  }

  const activeRows = report.rows.filter((row) => Number(row.added_count) > 0);
  if (!activeRows.length) {
    return `<div class="mobile-empty">No ASN confirmations were added on the selected day.</div>`;
  }

  const maxAdded = Math.max(...activeRows.map((row) => Number(row.added_count) || 0), 1);

  return activeRows.map((row) => {
    const addedCount = Number(row.added_count) || 0;
    const width = Math.max(10, Math.round((addedCount / maxAdded) * 100));

    return `
      <article class="mobile-card ${row.is_peak ? "asn-card-peak" : ""}">
        <div class="mobile-card-head">
          <div>
            <span class="mobile-card-kicker">ASN hour</span>
            <strong class="mobile-card-title">${escapeHtml(row.hour_label)}</strong>
          </div>
          <span class="mobile-chip">${escapeHtml(addedCount)} files</span>
        </div>
        <div class="mobile-card-stats">
          <div class="mobile-stat"><span>Added Size</span><strong>${escapeHtml(formatSize(row.added_bytes))}</strong></div>
          <div class="mobile-stat"><span>Peak</span><strong>${row.is_peak ? "Yes" : "No"}</strong></div>
        </div>
        <div class="bar asn-bar"><span style="width:${width}%"></span></div>
        <div class="mobile-card-note">
          <div><strong>First arrival:</strong> ${escapeHtml(formatTimeOnly(row.first_event_at, timezone))}</div>
          <div><strong>Last arrival:</strong> ${escapeHtml(formatTimeOnly(row.last_event_at, timezone))}</div>
        </div>
      </article>
    `;
  }).join("");
}

function renderDailyTrendCards(report) {
  if (!report || !report.days || !report.days.length) {
    return `<div class="mobile-empty">No daily folder chart data yet.</div>`;
  }

  const maxDayTotal = Math.max(...report.days.map((day) => Number(day.totalAdded) || 0), 1);

  return report.days.map((day) => {
    const totalWidth = day.totalAdded > 0
      ? Math.max(10, Math.round((day.totalAdded / maxDayTotal) * 100))
      : 0;
    const dayMax = Math.max(...day.items.map((item) => Number(item.added_count) || 0), 1);
    const rows = day.items.length
      ? day.items.map((item) => {
        const width = Math.max(10, Math.round((item.added_count / dayMax) * 100));
        return `
          <div class="trend-bar-row">
            <div class="trend-bar-head">
              <span class="trend-folder-label" title="${escapeHtml(item.folder_path)}">${escapeHtml(shortenFolderPath(item.folder_path))}</span>
              <span class="mobile-chip">${escapeHtml(item.added_count)} new</span>
            </div>
            <div class="trend-track"><span style="width:${width}%"></span></div>
          </div>
        `;
      }).join("")
      : `<div class="trend-empty">No new files were added on this day.</div>`;

    return `
      <article class="trend-day-card">
        <div class="trend-day-head">
          <div>
            <span class="mobile-card-kicker">Day</span>
            <strong class="mobile-card-title">${escapeHtml(formatDateLabel(day.label))}</strong>
          </div>
          <span class="mobile-chip">${escapeHtml(day.totalAdded)} files</span>
        </div>
        <div class="trend-day-meta">${escapeHtml(day.activeFolders)} folder(s) active - ${escapeHtml(formatSize(day.totalBytes))}</div>
        <div class="bar trend-total-bar"><span style="width:${totalWidth}%"></span></div>
        <div class="trend-rows">${rows}</div>
      </article>
    `;
  }).join("");
}

function renderXmlItemRows(items) {
  if (!items.length) {
    return `<tr><td colspan="4" class="empty">No line items were extracted from this XML.</td></tr>`;
  }

  return items.map((item) => `
    <tr>
      <td>${escapeHtml(item.line_number)}</td>
      <td class="path">${escapeHtml(item.item_code || "-")}</td>
      <td class="path">${escapeHtml(item.description || "-")}</td>
      <td>${escapeHtml(formatQuantity(item.quantity_value, item.quantity_text))}${item.uom ? ` ${escapeHtml(item.uom)}` : ""}</td>
    </tr>
  `).join("");
}

function renderXmlDocumentCards(documents, timezone) {
  if (!documents.length) {
    return `<div class="mobile-empty">No XML records have been indexed for this folder yet.</div>`;
  }

  return documents.map((document, index) => `
    <details class="xml-doc"${index === 0 ? " open" : ""}>
      <summary class="xml-doc-summary">
        <div class="xml-doc-grid">
          <span class="xml-doc-cell"><strong>${escapeHtml(document.order_date || formatDateTime(document.parsed_at, timezone))}</strong><small>Order date</small></span>
          <span class="xml-doc-cell"><strong>${escapeHtml(document.customer_name || "-")}</strong><small>Customer</small></span>
          <span class="xml-doc-cell"><strong>${escapeHtml(document.ship_to || "-")}</strong><small>Ship to</small></span>
          <span class="xml-doc-cell"><strong>${escapeHtml(document.item_count || 0)}</strong><small>Items</small></span>
          <span class="xml-doc-cell"><strong>${escapeHtml(formatQuantity(document.total_qty))}</strong><small>Qty</small></span>
        </div>
      </summary>
      <div class="xml-doc-body">
        <div class="detail-list xml-doc-meta">
          <div><strong>Record key</strong><span>${escapeHtml(document.record_key || document.file_name)}</span></div>
          <div><strong>Document type</strong><span>${escapeHtml(document.document_type || "XML")}</span></div>
          <div><strong>Order number</strong><span>${escapeHtml(document.order_number || "-")}</span></div>
          <div><strong>Item preview</strong><span>${escapeHtml(document.item_preview || "-")}</span></div>
          <div><strong>Source file</strong><span>${escapeHtml(document.file_name)}</span></div>
          <div><strong>Indexed</strong><span>${escapeHtml(formatDateTime(document.parsed_at, timezone))}</span></div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Line</th><th>Item</th><th>Description</th><th>Qty</th>
              </tr>
            </thead>
            <tbody>${renderXmlItemRows(document.items || [])}</tbody>
          </table>
        </div>
        <div class="button-row" style="margin-top:0.85rem">
          ${document.file_event_id ? `<a class="button-link secondary" href="/files/download?id=${encodeURIComponent(document.file_event_id)}">Download XML</a>` : ""}
        </div>
      </div>
    </details>
  `).join("");
}

function renderXmlFolderTabs(folderTabs, timezone) {
  if (!folderTabs.length) {
    return `<div class="mobile-empty">XML indexing is ready. Once XML files are downloaded, each folder will appear here as its own tab.</div>`;
  }

  const tabs = folderTabs.map((folder, index) => `
    <button
      type="button"
      class="folder-tab-button${index === 0 ? " active" : ""}"
      data-folder-tab-button
      data-target="${escapeHtml(folder.tab_id)}"
    >
      <span class="folder-tab-label" title="${escapeHtml(folder.folder_path)}">${escapeHtml(shortenFolderPath(folder.folder_path))}</span>
      <strong>${escapeHtml(folder.total_documents)}</strong>
    </button>
  `).join("");

  const panels = folderTabs.map((folder, index) => `
    <section
      class="folder-tab-panel${index === 0 ? " active" : ""}"
      id="${escapeHtml(folder.tab_id)}"
      data-folder-tab-panel
    >
      <div class="summary-grid" style="margin-top:0">
        <div class="summary-card"><span>Folder</span><strong>${escapeHtml(folder.folder_path)}</strong></div>
        <div class="summary-card"><span>Documents</span><strong>${escapeHtml(folder.total_documents)}</strong></div>
        <div class="summary-card"><span>Items</span><strong>${escapeHtml(folder.total_items || 0)}</strong></div>
        <div class="summary-card"><span>Total Qty</span><strong>${escapeHtml(formatQuantity(folder.total_qty))}</strong></div>
        <div class="summary-card"><span>Last Indexed</span><strong>${escapeHtml(formatDateTime(folder.last_parsed_at, timezone))}</strong></div>
      </div>
      <div class="xml-doc-list">${renderXmlDocumentCards(folder.documents || [], timezone)}</div>
    </section>
  `).join("");

  return `
    <div class="folder-tab-strip">${tabs}</div>
    <div class="folder-tab-panels">${panels}</div>
  `;
}

function renderDashboard({ dashboard, config, serviceState, flashMessage, filters, intake = {}, asn = {}, trend = {}, links }) {
  const summary = dashboard.summary || {};
  const activitySummary = dashboard.activitySummary || {};
  const dailyFolderIntake = dashboard.dailyFolderIntake || [];
  const asnHourlyReport = dashboard.asnHourlyReport || null;
  const dailyFolderTrend = dashboard.dailyFolderTrend || null;
  const xmlFolderTabs = dashboard.xmlFolderTabs || [];
  const statusText = serviceState.running ? "Sync running" : "Idle";
  const currentRun = serviceState.currentRun || null;
  const disableNotice = config.autoSyncEnabled ? "" : `<p class="flash warn">Automatic sync is disabled.</p>`;
  const flash = flashMessage ? `<p class="flash">${escapeHtml(flashMessage)}</p>` : "";
  const queuedNotice = serviceState.queuedTriggerSource
    ? `<p class="flash">A ${escapeHtml(serviceState.queuedTriggerSource)} sync is queued and will start as soon as the current run finishes.</p>`
    : "";
  const retentionLabel = config.snapshotRetentionDays
    ? `${config.snapshotRetentionDays} day(s)`
    : "Disabled";
  const alertsLabel = config.alertsConfigured ? "Configured" : "Not configured";
  const connectPolicyLabel = `${Math.round((Number(config.sftpReadyTimeoutMs) || 0) / 1000)}s timeout, ${Number(config.sftpConnectRetries) || 0} retr${Number(config.sftpConnectRetries) === 1 ? "y" : "ies"}`;
  const intakeTotalBytes = dailyFolderIntake.reduce((sum, entry) => sum + (Number(entry.added_bytes) || 0), 0);
  const intakeLeader = dailyFolderIntake[0] || null;
  const intakeDateLabel = intake.label || intake.date || "";
  const asnSummary = asn.summary || asnHourlyReport?.summary || null;
  const asnDateLabel = asn.label || asn.date || "";
  const trendSummary = trend.summary || dailyFolderTrend?.summary || null;
  const trendDateLabel = trend.date || "";
  const xmlDocumentCount = xmlFolderTabs.reduce((sum, folder) => sum + (Number(folder.total_documents) || 0), 0);

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

  const folderTabScript = `
  <script>
    (function () {
      var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-folder-tab-button]'));
      var panels = Array.prototype.slice.call(document.querySelectorAll('[data-folder-tab-panel]'));
      if (!buttons.length || !panels.length) {
        return;
      }

      function activateTab(targetId) {
        buttons.forEach(function (button) {
          button.classList.toggle('active', button.getAttribute('data-target') === targetId);
        });
        panels.forEach(function (panel) {
          panel.classList.toggle('active', panel.id === targetId);
        });
      }

      buttons.forEach(function (button) {
        button.addEventListener('click', function () {
          activateTab(button.getAttribute('data-target'));
        });
      });
    }());
  </script>`;

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

    details.card {
      padding: 0;
      overflow: hidden;
    }

    .accordion-summary {
      list-style: none;
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: center;
      padding: 1rem 1.05rem;
      cursor: pointer;
    }

    .accordion-summary::-webkit-details-marker {
      display: none;
    }

    .accordion-summary-main {
      display: grid;
      gap: 0.2rem;
    }

    .accordion-summary .eyebrow {
      margin: 0;
    }

    .accordion-summary h2 {
      font-size: 1.1rem;
    }

    .accordion-summary-meta {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.45rem 0.8rem;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: var(--panel-2);
      color: var(--muted);
      font-size: 0.82rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      white-space: nowrap;
    }

    .accordion-summary-meta::after {
      content: "+";
      font-size: 1rem;
      color: var(--brand);
    }

    details[open] > .accordion-summary .accordion-summary-meta::after {
      content: "-";
    }

    .accordion-body {
      padding: 0 1.05rem 1rem;
      border-top: 1px solid var(--line);
    }

    .folder-tab-strip {
      display: flex;
      gap: 0.55rem;
      flex-wrap: wrap;
      margin-top: 1rem;
    }

    .folder-tab-button {
      min-height: auto;
      padding: 0.8rem 0.95rem;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: var(--panel-2);
      color: var(--text);
      display: grid;
      gap: 0.15rem;
      text-align: left;
      min-width: 120px;
    }

    .folder-tab-button.active {
      background: linear-gradient(135deg, rgba(23, 104, 255, 0.12), rgba(76, 192, 255, 0.12));
      border-color: rgba(23, 104, 255, 0.18);
    }

    .folder-tab-label {
      font-size: 0.78rem;
      color: var(--muted);
      line-height: 1.25;
      word-break: break-word;
    }

    .folder-tab-panels {
      margin-top: 1rem;
    }

    .folder-tab-panel {
      display: none;
    }

    .folder-tab-panel.active {
      display: block;
    }

    .xml-doc-list {
      display: grid;
      gap: 0.8rem;
      margin-top: 1rem;
    }

    .xml-doc {
      border: 1px solid var(--line);
      border-radius: 16px;
      background: linear-gradient(180deg, #ffffff, #f8fbff);
      overflow: hidden;
    }

    .xml-doc-summary {
      list-style: none;
      cursor: pointer;
      padding: 0.85rem 0.95rem;
    }

    .xml-doc-summary::-webkit-details-marker {
      display: none;
    }

    .xml-doc-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 0.65rem;
    }

    .xml-doc-cell {
      display: grid;
      gap: 0.18rem;
      min-width: 0;
    }

    .xml-doc-cell strong,
    .xml-doc-cell small {
      word-break: break-word;
      line-height: 1.25;
    }

    .xml-doc-cell small {
      color: var(--muted);
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .xml-doc-body {
      padding: 0 0.95rem 0.95rem;
      border-top: 1px solid var(--line);
    }

    .xml-doc-meta {
      margin-top: 0.85rem;
    }

    .intake-header {
      display: grid;
      gap: 0.9rem;
      grid-template-columns: 1.1fr 0.9fr;
      align-items: end;
    }

    .intake-controls {
      display: grid;
      gap: 0.7rem;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: end;
    }

    .intake-summary {
      margin-top: 1rem;
    }

    .intake-leader {
      margin-top: 0.9rem;
      padding: 0.9rem 1rem;
      border-radius: 16px;
      border: 1px solid rgba(23, 104, 255, 0.12);
      background:
        linear-gradient(135deg, rgba(23, 104, 255, 0.08), rgba(31, 157, 104, 0.08)),
        var(--panel-2);
      line-height: 1.45;
    }

    .intake-list {
      display: grid;
      gap: 0.8rem;
      margin-top: 1rem;
    }

    .intake-row {
      display: grid;
      gap: 0.85rem;
      grid-template-columns: 60px minmax(0, 1fr);
      align-items: center;
      padding: 0.9rem;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: linear-gradient(180deg, #ffffff, #f8fafc);
    }

    .intake-rank {
      display: grid;
      place-items: center;
      width: 60px;
      height: 60px;
      border-radius: 18px;
      border: 1px solid rgba(23, 104, 255, 0.14);
      background: radial-gradient(circle at top, rgba(23, 104, 255, 0.18), rgba(23, 104, 255, 0.06));
      color: var(--brand);
      font-size: 1.15rem;
      font-weight: 700;
    }

    .intake-main {
      display: grid;
      gap: 0.6rem;
      min-width: 0;
    }

    .intake-topline {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      align-items: flex-start;
    }

    .intake-topline strong {
      font-size: 1rem;
      line-height: 1.25;
      word-break: break-word;
    }

    .intake-strip {
      position: relative;
      height: 18px;
      border-radius: 999px;
      overflow: hidden;
      background:
        repeating-linear-gradient(
          90deg,
          rgba(23, 104, 255, 0.08) 0,
          rgba(23, 104, 255, 0.08) 18px,
          rgba(23, 104, 255, 0.04) 18px,
          rgba(23, 104, 255, 0.04) 24px
        );
    }

    .intake-strip span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #1768ff, #4cc0ff 52%, #1f9d68);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
    }

    .intake-foot {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      color: var(--muted);
      font-size: 0.9rem;
      line-height: 1.35;
    }

    .intake-empty {
      padding: 1rem;
      border-radius: 16px;
      border: 1px dashed var(--line);
      background: var(--panel-2);
      color: var(--muted);
      text-align: center;
    }

    .asn-report-head {
      display: grid;
      gap: 0.9rem;
      grid-template-columns: 1.1fr 0.9fr;
      align-items: end;
    }

    .asn-note {
      margin-top: 0.9rem;
      padding: 0.9rem 1rem;
      border-radius: 16px;
      border: 1px solid rgba(31, 157, 104, 0.14);
      background: linear-gradient(135deg, rgba(31, 157, 104, 0.08), rgba(76, 192, 255, 0.08));
      line-height: 1.45;
    }

    .asn-row-peak {
      background: rgba(31, 157, 104, 0.08);
    }

    .asn-bar {
      min-width: 150px;
      background: rgba(31, 157, 104, 0.08);
    }

    .asn-bar span {
      background: linear-gradient(90deg, #1f9d68, #4cc0ff);
    }

    .asn-card-peak {
      border-color: rgba(31, 157, 104, 0.22);
      background: linear-gradient(180deg, rgba(31, 157, 104, 0.08), #ffffff);
    }

    .trend-head {
      display: grid;
      gap: 0.9rem;
      grid-template-columns: 1.1fr 0.9fr;
      align-items: end;
    }

    .trend-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.9rem;
      margin-top: 1rem;
    }

    .trend-day-card {
      display: grid;
      gap: 0.7rem;
      padding: 0.95rem;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: linear-gradient(180deg, #ffffff, #f8fbff);
    }

    .trend-day-head {
      display: flex;
      justify-content: space-between;
      gap: 0.7rem;
      align-items: flex-start;
    }

    .trend-day-meta {
      color: var(--muted);
      font-size: 0.9rem;
      line-height: 1.35;
    }

    .trend-total-bar {
      background: rgba(76, 192, 255, 0.12);
    }

    .trend-total-bar span {
      background: linear-gradient(90deg, #1768ff, #4cc0ff);
    }

    .trend-rows {
      display: grid;
      gap: 0.65rem;
    }

    .trend-bar-row {
      display: grid;
      gap: 0.35rem;
    }

    .trend-bar-head {
      display: flex;
      justify-content: space-between;
      gap: 0.7rem;
      align-items: center;
    }

    .trend-folder-label {
      min-width: 0;
      font-weight: 700;
      line-height: 1.25;
      word-break: break-word;
    }

    .trend-track {
      height: 12px;
      border-radius: 999px;
      overflow: hidden;
      background: rgba(23, 104, 255, 0.08);
    }

    .trend-track span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #1f9d68, #4cc0ff);
    }

    .trend-empty {
      padding: 0.7rem 0.8rem;
      border-radius: 14px;
      border: 1px dashed var(--line);
      color: var(--muted);
      background: var(--panel-2);
      text-align: center;
    }

    @media (max-width: 1040px) {
      .hero, .section-grid { grid-template-columns: 1fr; }
      .summary-grid, .status-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      form.filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .xml-doc-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .intake-header { grid-template-columns: 1fr; }
      .asn-report-head { grid-template-columns: 1fr; }
      .trend-head { grid-template-columns: 1fr; }
      .trend-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
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

      .accordion-summary {
        flex-direction: column;
        align-items: flex-start;
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

      .folder-tab-strip {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .folder-tab-button {
        min-width: 0;
      }

      .xml-doc-grid {
        grid-template-columns: 1fr;
      }

      .intake-controls {
        grid-template-columns: 1fr;
      }

      .intake-row {
        grid-template-columns: 1fr;
        padding: 0.8rem;
      }

      .intake-rank {
        width: 48px;
        height: 48px;
        border-radius: 14px;
        font-size: 1rem;
      }

      .intake-topline, .intake-foot {
        flex-direction: column;
      }

      .trend-grid {
        grid-template-columns: 1fr;
      }

      .trend-day-head, .trend-bar-head {
        flex-direction: column;
        align-items: flex-start;
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
          <div><strong>Connect policy</strong><span>${escapeHtml(connectPolicyLabel)}</span></div>
          <div><strong>Schedule</strong><span>${escapeHtml(config.schedule)}</span></div>
          <div><strong>Alerts</strong><span>${escapeHtml(alertsLabel)}</span></div>
          <div><strong>Snapshot retention</strong><span>${escapeHtml(retentionLabel)}</span></div>
          <div><strong>Activity page size</strong><span>${escapeHtml(config.activityPageSize)}</span></div>
        </div>
        ${liveProgress}
        ${disableNotice}
        ${flash}
        ${queuedNotice}
        <div class="button-row" style="margin-top:1rem">
          <form method="post" action="/sync">
            <button type="submit"${serviceState.running ? " disabled" : ""}>Run Sync Now</button>
          </form>
          <a class="button-link secondary" href="${escapeHtml(links.runsCsv)}">Export Runs CSV</a>
        </div>
      </aside>
    </section>

    <details class="card accordion" open>
      <summary class="accordion-summary">
        <div class="accordion-summary-main">
          <div class="eyebrow">XML Records</div>
          <h2>Folder Tabs And Parsed Documents</h2>
        </div>
        <span class="accordion-summary-meta">${escapeHtml(xmlDocumentCount)} docs</span>
      </summary>
      <div class="accordion-body">
        <p class="meta">Each folder gets its own tab, and each XML record can expand to show key fields and line items.</p>
        ${renderXmlFolderTabs(xmlFolderTabs, config.timezone)}
      </div>
    </details>

    <details class="card accordion filters-card">
      <summary class="accordion-summary">
        <div class="accordion-summary-main">
          <div class="eyebrow">Reports</div>
          <h2>File Activity Filters</h2>
        </div>
        <span class="accordion-summary-meta">Filter</span>
      </summary>
      <div class="accordion-body">
        <p class="meta">Filter the audit trail and export only the slice you need.</p>
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
      </div>
    </details>

    <details class="card accordion">
      <summary class="accordion-summary">
        <div class="accordion-summary-main">
          <div class="eyebrow">Daily Intake</div>
          <h2>New Files By Folder</h2>
        </div>
        <span class="accordion-summary-meta">${escapeHtml(intake.totalAdded || 0)} new</span>
      </summary>
      <div class="accordion-body">
        <div class="intake-header">
          <div class="form-copy">
            <p class="meta">A per-day intake board that shows which folders grew, how many fresh files landed there, and how much data was added.</p>
          </div>
          <form class="intake-controls" method="get" action="/">
            ${renderHiddenFilterInputs(filters, { includeAsnDate: true, includeTrendDate: true, includeTrendDays: true })}
            <label>
              Selected Day
              <input type="date" name="intake_date" value="${escapeHtml(intake.date || "")}">
            </label>
            <button type="submit">Show Day</button>
          </form>
        </div>
        <div class="summary-grid intake-summary">
          <div class="summary-card"><span>Selected Day</span><strong>${escapeHtml(intakeDateLabel || "Today")}</strong></div>
          <div class="summary-card"><span>New Files</span><strong>${escapeHtml(intake.totalAdded || 0)}</strong></div>
          <div class="summary-card"><span>Active Folders</span><strong>${escapeHtml(dailyFolderIntake.length)}</strong></div>
          <div class="summary-card"><span>Added Size</span><strong>${escapeHtml(formatSize(intakeTotalBytes))}</strong></div>
        </div>
        <div class="intake-leader">
          ${intakeLeader
            ? `Top folder for ${escapeHtml(intakeDateLabel || intake.date || "the selected day")}: <strong>${escapeHtml(intakeLeader.folder_path)}</strong> with <strong>${escapeHtml(intakeLeader.added_count)} new files</strong> and <strong>${escapeHtml(formatSize(intakeLeader.added_bytes))}</strong> added.`
            : `No new files were logged for ${escapeHtml(intakeDateLabel || intake.date || "the selected day")}.`}
        </div>
        <div class="intake-list">${renderDailyIntakeRows(dailyFolderIntake)}</div>
      </div>
    </details>

    <details class="card accordion">
      <summary class="accordion-summary">
        <div class="accordion-summary-main">
          <div class="eyebrow">Daily Chart</div>
          <h2>Files Added By Day And Folder</h2>
        </div>
        <span class="accordion-summary-meta">${escapeHtml(trendSummary?.totalAdded || 0)} total</span>
      </summary>
      <div class="accordion-body">
        <div class="trend-head">
          <div class="form-copy">
            <p class="meta">A rolling bar-chart view that shows how many new files each folder received on each day in the selected window.</p>
          </div>
          <form class="intake-controls" method="get" action="/">
            ${renderHiddenFilterInputs(filters, { includeIntakeDate: true, includeAsnDate: true })}
            <label>
              End Day
              <input type="date" name="trend_date" value="${escapeHtml(trend.date || "")}">
            </label>
            <label>
              Window
              <select name="trend_days">
                <option value="7"${Number(trend.days) === 7 ? " selected" : ""}>Last 7 days</option>
                <option value="14"${Number(trend.days) === 14 ? " selected" : ""}>Last 14 days</option>
                <option value="30"${Number(trend.days) === 30 ? " selected" : ""}>Last 30 days</option>
              </select>
            </label>
            <button type="submit">Show Chart</button>
          </form>
        </div>
        <div class="summary-grid intake-summary">
          <div class="summary-card"><span>End Day</span><strong>${escapeHtml(trendDateLabel || "Today")}</strong></div>
          <div class="summary-card"><span>Days Shown</span><strong>${escapeHtml(trendSummary?.daysTracked || trend.days || 0)}</strong></div>
          <div class="summary-card"><span>Total New Files</span><strong>${escapeHtml(trendSummary?.totalAdded || 0)}</strong></div>
          <div class="summary-card"><span>Folders Active</span><strong>${escapeHtml(trendSummary?.activeFolders || 0)}</strong></div>
          <div class="summary-card"><span>Peak Day</span><strong>${escapeHtml(trendSummary?.peakDayLabel ? `${formatDateLabel(trendSummary.peakDayLabel)} (${trendSummary.peakDayCount})` : "No activity")}</strong></div>
          <div class="summary-card"><span>Added Size</span><strong>${escapeHtml(formatSize(trendSummary?.totalBytes || 0))}</strong></div>
        </div>
        <div class="trend-grid">${renderDailyTrendCards(dailyFolderTrend)}</div>
      </div>
    </details>

    <details class="card accordion">
      <summary class="accordion-summary">
        <div class="accordion-summary-main">
          <div class="eyebrow">ASN Hourly</div>
          <h2>ASN Confirmations By Hour</h2>
        </div>
        <span class="accordion-summary-meta">${escapeHtml(asnSummary?.totalAdded || 0)} files</span>
      </summary>
      <div class="accordion-body">
        <div class="asn-report-head">
          <div class="form-copy">
            <p class="meta">Track how many new ASN confirmation files landed in ${escapeHtml(config.asnReportFolder)} each hour of the selected day.</p>
          </div>
          <form class="intake-controls" method="get" action="/">
            ${renderHiddenFilterInputs(filters, { includeIntakeDate: true, includeTrendDate: true, includeTrendDays: true })}
            <label>
              ASN Day
              <input type="date" name="asn_date" value="${escapeHtml(asn.date || "")}">
            </label>
            <button type="submit">Show ASN Day</button>
            <a class="button-link secondary" href="${escapeHtml(links.asnHourlyCsv)}">Export ASN CSV</a>
          </form>
        </div>
        <div class="summary-grid intake-summary">
          <div class="summary-card"><span>ASN Day</span><strong>${escapeHtml(asnDateLabel || "Today")}</strong></div>
          <div class="summary-card"><span>ASN Files Added</span><strong>${escapeHtml(asnSummary?.totalAdded || 0)}</strong></div>
          <div class="summary-card"><span>Active Hours</span><strong>${escapeHtml(asnSummary?.activeHours || 0)}</strong></div>
          <div class="summary-card"><span>Peak Hour</span><strong>${escapeHtml(asnSummary?.peakHourLabel ? `${asnSummary.peakHourLabel} (${asnSummary.peakCount})` : "No activity")}</strong></div>
          <div class="summary-card"><span>Added Size</span><strong>${escapeHtml(formatSize(asnSummary?.totalBytes || 0))}</strong></div>
        </div>
        <div class="asn-note">
          ${asnSummary?.peakHourLabel
            ? `Busiest ASN hour on ${escapeHtml(asnDateLabel || asn.date || "the selected day")}: <strong>${escapeHtml(asnSummary.peakHourLabel)}</strong> with <strong>${escapeHtml(asnSummary.peakCount)} file(s)</strong> added.`
            : `No ASN confirmation files were added in ${escapeHtml(config.asnReportFolder)} on ${escapeHtml(asnDateLabel || asn.date || "the selected day")}.`}
        </div>
        <section class="desktop-only">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hour</th><th>Added Files</th><th>Added Size</th><th>First Arrival</th><th>Last Arrival</th><th>Visual</th>
                </tr>
              </thead>
              <tbody>${renderAsnHourlyRows(asnHourlyReport, config.timezone)}</tbody>
            </table>
          </div>
        </section>
        <section class="mobile-only">
          <div class="mobile-card-list">${renderAsnHourlyCards(asnHourlyReport, config.timezone)}</div>
        </section>
      </div>
    </details>

    <details class="card accordion">
      <summary class="accordion-summary">
        <div class="accordion-summary-main">
          <div class="eyebrow">Folder Counts</div>
          <h2>Total File Count By Folder</h2>
        </div>
        <span class="accordion-summary-meta">${escapeHtml((dashboard.folderStats || []).length)} folders</span>
      </summary>
      <div class="accordion-body">
        <section class="desktop-only">
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
        <section class="mobile-only">
          <div class="mobile-card-list">${renderFolderCards(dashboard.folderStats || [])}</div>
        </section>
      </div>
    </details>

    <details class="card accordion">
      <summary class="accordion-summary">
        <div class="accordion-summary-main">
          <div class="eyebrow">Activity</div>
          <h2>File Activity</h2>
        </div>
        <span class="accordion-summary-meta">${escapeHtml(activitySummary.total || 0)} rows</span>
      </summary>
      <div class="accordion-body">
        <section class="desktop-only">
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
        <section class="mobile-only">
          <div class="mobile-card-list">${renderActivityCards(dashboard.fileActivity || [], config.timezone)}</div>
        </section>
      </div>
    </details>

    <details class="card accordion">
      <summary class="accordion-summary">
        <div class="accordion-summary-main">
          <div class="eyebrow">Sync Runs</div>
          <h2>Recent Sync Runs</h2>
        </div>
        <span class="accordion-summary-meta">${escapeHtml((dashboard.recentRuns || []).length)} runs</span>
      </summary>
      <div class="accordion-body">
        <section class="desktop-only">
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
        <section class="mobile-only">
          <div class="mobile-card-list">${renderRunCards(dashboard.recentRuns || [], config.timezone)}</div>
        </section>
      </div>
    </details>
  </main>
${autoRefreshScript}
${folderTabScript}
</body>
</html>`;
}

module.exports = {
  renderDashboard
};
