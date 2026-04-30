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
    timeStyle: "short"
  }).format(new Date(value));
}

function formatSize(value) {
  const size = Number(value || 0);
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

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function formatQuantity(value) {
  const numeric = Number(value || 0);
  if (Number.isInteger(numeric)) {
    return String(numeric);
  }

  return numeric.toFixed(2).replace(/\.?0+$/, "");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatAgeHours(value) {
  const hours = Number(value || 0);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return `${days}d ${remainingHours}h`;
  }

  if (hours >= 1) {
    return `${hours.toFixed(1).replace(/\.0$/, "")}h`;
  }

  return `${Math.round(hours * 60)}m`;
}

function formatHourTick(hour) {
  const display = hour % 12 || 12;
  const suffix = hour >= 12 ? "P" : "A";
  return `${display}${suffix}`;
}

function shortenFolderPath(folderPath) {
  const segments = String(folderPath || "")
    .split("/")
    .filter(Boolean);

  if (segments.length <= 3) {
    return folderPath || "/";
  }

  return `.../${segments.slice(-3).join("/")}`;
}

function formatDelta(value) {
  const numeric = Number(value || 0);
  if (numeric === 0) {
    return "Flat vs prior day";
  }

  return `${numeric > 0 ? "+" : ""}${formatNumber(numeric)} vs prior day`;
}

function renderNavLinks(links) {
  return `
    <nav class="mode-nav">
      <a class="active" href="${escapeHtml(links.desktop)}">Desktop Ops</a>
      <a href="${escapeHtml(links.mobile)}">Mobile</a>
      <a href="${escapeHtml(links.admin)}">Admin</a>
    </nav>
  `;
}

function renderKpiCard(title, value, note = "", tone = "") {
  return `
    <article class="kpi-card${tone ? ` kpi-${escapeHtml(tone)}` : ""}">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(note)}</small>
    </article>
  `;
}

function renderHourlyFlowChart(flow) {
  const rows = flow?.rows || [];
  if (!rows.length) {
    return `<div class="empty-state">No hourly flow data yet.</div>`;
  }

  const stages = [
    { key: "orders", label: "Orders", color: "#1f6feb" },
    { key: "asn", label: "ASN", color: "#1f9d78" },
    { key: "receipt", label: "Receipt", color: "#d18b1f" },
    { key: "returns", label: "Returns", color: "#c44536" }
  ];
  const width = 980;
  const height = 320;
  const margin = { top: 22, right: 16, bottom: 42, left: 42 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const groupWidth = plotWidth / rows.length;
  const maxValue = Math.max(...rows.flatMap((row) => stages.map((stage) => row.byStage[stage.key] || 0)), 1);
  const barGap = 3;
  const barWidth = Math.max(6, Math.min(16, (groupWidth - (barGap * (stages.length - 1))) / stages.length));
  const axisSteps = [0, 0.25, 0.5, 0.75, 1];

  const gridLines = axisSteps.map((step) => {
    const value = Math.round(maxValue * step);
    const y = margin.top + plotHeight - (step * plotHeight);
    return `
      <g>
        <line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" class="chart-grid-line" />
        <text x="${margin.left - 8}" y="${y + 4}" class="chart-axis-label chart-axis-left">${escapeHtml(value)}</text>
      </g>
    `;
  }).join("");

  const bars = rows.map((row, rowIndex) => {
    const xBase = margin.left + (rowIndex * groupWidth) + ((groupWidth - ((barWidth * stages.length) + (barGap * (stages.length - 1)))) / 2);
    const stageRects = stages.map((stage, stageIndex) => {
      const value = row.byStage[stage.key] || 0;
      const barHeight = maxValue === 0 ? 0 : (value / maxValue) * plotHeight;
      const x = xBase + (stageIndex * (barWidth + barGap));
      const y = margin.top + plotHeight - barHeight;
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(barHeight, value > 0 ? 2 : 0)}" rx="3" fill="${stage.color}">
          <title>${stage.label} at ${row.hour_label}: ${value} file(s)</title>
        </rect>
      `;
    }).join("");

    const tick = rowIndex % 2 === 0
      ? `<text x="${margin.left + (rowIndex * groupWidth) + (groupWidth / 2)}" y="${height - 12}" class="chart-axis-label chart-axis-bottom">${escapeHtml(formatHourTick(row.hour24))}</text>`
      : "";

    return `${stageRects}${tick}`;
  }).join("");

  const legend = stages.map((stage) => `
    <span class="legend-item"><i style="background:${stage.color}"></i>${escapeHtml(stage.label)}</span>
  `).join("");

  return `
    <div class="chart-legend">${legend}</div>
    <svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="Hourly order flow by stage">
      ${gridLines}
      ${bars}
    </svg>
  `;
}

function renderCumulativeChart(cumulative, compareDateLabel) {
  if (!cumulative?.hours?.length) {
    return `<div class="empty-state">No cumulative pace data yet.</div>`;
  }

  const width = 980;
  const height = 300;
  const margin = { top: 18, right: 20, bottom: 38, left: 42 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(
    ...Object.values(cumulative.today || {}).flat(),
    ...Object.values(cumulative.compare || {}).flat(),
    1
  );
  const xForIndex = (index) => margin.left + ((plotWidth / (cumulative.hours.length - 1 || 1)) * index);
  const yForValue = (value) => margin.top + plotHeight - ((Number(value || 0) / maxValue) * plotHeight);
  const series = [
    { values: cumulative.today.orders || [], label: "Orders", color: "#1f6feb", dashed: false },
    { values: cumulative.today.asn || [], label: "ASN", color: "#1f9d78", dashed: false },
    { values: cumulative.compare.orders || [], label: `Orders (${compareDateLabel || "Prior day"})`, color: "#82b4ff", dashed: true },
    { values: cumulative.compare.asn || [], label: `ASN (${compareDateLabel || "Prior day"})`, color: "#7fd4bc", dashed: true }
  ];

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((step) => {
    const value = Math.round(maxValue * step);
    const y = margin.top + plotHeight - (step * plotHeight);
    return `
      <g>
        <line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" class="chart-grid-line" />
        <text x="${margin.left - 8}" y="${y + 4}" class="chart-axis-label chart-axis-left">${escapeHtml(value)}</text>
      </g>
    `;
  }).join("");

  const paths = series.map((seriesItem) => {
    if (!seriesItem.values.length || !seriesItem.values.some((value) => value > 0)) {
      return "";
    }

    const pathData = seriesItem.values.map((value, index) => `${index === 0 ? "M" : "L"} ${xForIndex(index)} ${yForValue(value)}`).join(" ");
    return `<path d="${pathData}" fill="none" stroke="${seriesItem.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"${seriesItem.dashed ? ` stroke-dasharray="8 7"` : ""}></path>`;
  }).join("");

  const xLabels = cumulative.hours.map((hour, index) => {
    if (index % 2 !== 0) {
      return "";
    }

    return `<text x="${xForIndex(index)}" y="${height - 10}" class="chart-axis-label chart-axis-bottom">${escapeHtml(formatHourTick(hour))}</text>`;
  }).join("");

  const legend = series
    .filter((item) => item.values.some((value) => value > 0))
    .map((item) => `<span class="legend-item"><i style="background:${item.color};${item.dashed ? "border:1px dashed rgba(19,34,56,.45)" : ""}"></i>${escapeHtml(item.label)}</span>`)
    .join("");

  return `
    <div class="chart-legend">${legend}</div>
    <svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="Cumulative order and ASN pace">
      ${gridLines}
      ${paths}
      ${xLabels}
    </svg>
  `;
}

function renderFunnel(funnel) {
  if (!funnel?.length) {
    return `<div class="empty-state">No funnel data yet.</div>`;
  }

  return `
    <div class="funnel-list">
      ${funnel.map((step) => `
        <div class="funnel-step">
          <div class="funnel-label-row">
            <strong>${escapeHtml(step.label)}</strong>
            <span>${escapeHtml(formatNumber(step.count))}</span>
          </div>
          <div class="funnel-bar">
            <span style="width:${escapeHtml(step.widthPercent)}%"></span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderBacklogAging(backlog) {
  const buckets = backlog?.summary?.ageBuckets || [];
  if (!buckets.length) {
    return `<div class="empty-state">No backlog aging data yet.</div>`;
  }

  return `
    <div class="aging-grid">
      ${buckets.map((bucket) => `
        <article class="aging-card">
          <span>${escapeHtml(bucket.label)}</span>
          <strong>${escapeHtml(formatNumber(bucket.count))}</strong>
        </article>
      `).join("")}
    </div>
  `;
}

function renderExceptionsTable(backlog, timezone) {
  const rows = backlog?.exceptions || [];
  if (!rows.length) {
    return `<div class="empty-state">No open order-flow exceptions right now.</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Record</th>
            <th>Customer</th>
            <th>Ship To</th>
            <th>Age</th>
            <th>Started</th>
            <th>Qty</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td><span class="status-pill status-warn">${escapeHtml(row.status_label)}</span></td>
              <td>${escapeHtml(row.display_key)}</td>
              <td>${escapeHtml(row.customer_name)}</td>
              <td>${escapeHtml(row.ship_to || "-")}</td>
              <td>${escapeHtml(formatAgeHours(row.ageHours))}</td>
              <td>${escapeHtml(formatDateTime(row.started_at, timezone))}</td>
              <td>${escapeHtml(formatQuantity(row.total_qty || row.item_count || 0))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderCustomerTable(customers, timezone) {
  if (!customers?.length) {
    return `<div class="empty-state">No customer workload has been indexed yet for the selected day.</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Orders</th>
            <th>Total Qty</th>
            <th>Item Lines</th>
            <th>Est. Value</th>
            <th>Ship Tos</th>
            <th>Latest</th>
          </tr>
        </thead>
        <tbody>
          ${customers.map((customer) => `
            <tr>
              <td>${escapeHtml(customer.customer_name)}</td>
              <td>${escapeHtml(formatNumber(customer.order_count))}</td>
              <td>${escapeHtml(formatQuantity(customer.total_qty))}</td>
              <td>${escapeHtml(formatNumber(customer.total_items))}</td>
              <td>${escapeHtml(formatCurrency(customer.estimated_value))}</td>
              <td>${escapeHtml(formatNumber(customer.ship_to_count))}</td>
              <td>${escapeHtml(formatDateTime(customer.last_parsed_at, timezone))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPendingAsnCustomerTable(report) {
  const rows = report?.rows || [];
  if (!rows.length) {
    return `<div class="empty-state">No pending ASN customer backlog is open right now.</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Partner ID</th>
            <th>Pending Orders</th>
            <th>Pending Lines</th>
            <th>Est. Value</th>
            <th>Oldest</th>
            <th>Top Ship-To</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.customer_name)}</td>
              <td>${escapeHtml(row.customer_partner_id || "-")}</td>
              <td>${escapeHtml(formatNumber(row.pending_orders))}</td>
              <td>${escapeHtml(formatNumber(row.pending_lines))}</td>
              <td>${escapeHtml(formatCurrency(row.estimated_value))}</td>
              <td>${escapeHtml(formatAgeHours(row.oldest_age_hours))}</td>
              <td>${escapeHtml(row.top_ship_to || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderClosedAsnCustomerTable(report, timezone) {
  const rows = report?.rows || [];
  if (!rows.length) {
    return `<div class="empty-state">No orders were closed by ASN on the selected day.</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Partner ID</th>
            <th>Closed Orders</th>
            <th>Closed Lines</th>
            <th>Est. Value</th>
            <th>Latest ASN</th>
            <th>Top Ship-To</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.customer_name)}</td>
              <td>${escapeHtml(row.customer_partner_id || "-")}</td>
              <td>${escapeHtml(formatNumber(row.closed_orders))}</td>
              <td>${escapeHtml(formatNumber(row.closed_lines))}</td>
              <td>${escapeHtml(formatCurrency(row.estimated_value))}</td>
              <td>${escapeHtml(formatDateTime(row.latest_asn_at, timezone))}</td>
              <td>${escapeHtml(row.top_ship_to || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderFolderLoad(folderLoad) {
  if (!folderLoad?.length) {
    return `<div class="empty-state">No folder workload data yet for the selected day.</div>`;
  }

  const maxCount = Math.max(...folderLoad.map((row) => row.added_count), 1);
  return `
    <div class="folder-load-list">
      ${folderLoad.map((row) => `
        <article class="folder-load-row">
          <div class="folder-load-head">
            <strong title="${escapeHtml(row.folder_path)}">${escapeHtml(shortenFolderPath(row.folder_path))}</strong>
            <span>${escapeHtml(formatNumber(row.added_count))} files</span>
          </div>
          <div class="folder-load-bar">
            <span style="width:${Math.max(8, Math.round((row.added_count / maxCount) * 100))}%"></span>
          </div>
          <div class="folder-load-meta">
            <span>${escapeHtml(row.stage.toUpperCase())}</span>
            <span>${escapeHtml(formatSize(row.added_bytes))}</span>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderSyncPanel(config, serviceState, syncHealth, dayLabel, flashMessage, links) {
  const running = serviceState?.running;
  const currentRun = serviceState?.currentRun || null;
  const reindexState = serviceState?.reindex || {};
  const currentReindex = reindexState.currentRun || null;
  const lastReindex = reindexState.lastRun || null;
  const latestRun = syncHealth?.latestRun || null;
  const returnTo = `/desktop?ops_date=${encodeURIComponent(dayLabel)}`;
  const flash = flashMessage ? `<p class="flash">${escapeHtml(flashMessage)}</p>` : "";
  const liveMessage = currentRun
    ? `<div class="live-box">
        <strong>${escapeHtml(currentRun.phase || "running")}</strong>
        <span>${escapeHtml(currentRun.message || "Sync running...")}</span>
      </div>`
    : "";
  const reindexMessage = currentReindex
    ? `<div class="live-box">
        <strong>${escapeHtml(currentReindex.phase || "running")}</strong>
        <span>${escapeHtml(currentReindex.message || "Historical XML repair running...")}</span>
      </div>`
    : "";

  return `
    <aside class="hero-side">
      <div class="eyebrow">System Status</div>
      <h2>${running ? "Sync running" : (currentReindex ? "Repairing historical XML" : "System ready")}</h2>
      <div class="detail-list">
        <div><strong>Remote root</strong><span>${escapeHtml(config.remoteRoot)}</span></div>
        <div><strong>Schedule</strong><span>${escapeHtml(config.schedule)}</span></div>
        <div><strong>Latest run</strong><span>${escapeHtml(latestRun?.status || "No runs yet")}</span></div>
        <div><strong>Last success</strong><span>${escapeHtml(formatDateTime(syncHealth?.latestRun?.finished_at, config.timezone))}</span></div>
        <div><strong>XML repair</strong><span>${escapeHtml(reindexState.running ? "Running" : (lastReindex?.lastStatus || "Ready"))}</span></div>
        <div><strong>Last XML repair</strong><span>${escapeHtml(formatDateTime(lastReindex?.lastFinishedAt, config.timezone))}</span></div>
      </div>
      ${liveMessage}
      ${reindexMessage}
      ${flash}
      <div class="hero-actions">
        <form method="post" action="/sync?return_to=${escapeHtml(returnTo)}">
          <button type="submit"${running ? " disabled" : ""}>Run Sync Now</button>
        </form>
        <form method="post" action="${escapeHtml(links.reindexAction || "/reindex-xml")}">
          <button type="submit" class="secondary"${reindexState.running ? " disabled" : ""}>Repair Old XML Data</button>
        </form>
        <a class="button-link secondary" href="${escapeHtml(links.admin)}">Open Admin Workspace</a>
      </div>
      <p class="side-note">Use Admin for exports, XML review, sync logs, and detailed file activity.</p>
    </aside>
  `;
}

function renderDesktopDashboard({ ops, config, serviceState, flashMessage, links }) {
  const compareLabel = ops.compareDateLabel || "prior day";
  const currentOrPeakLabel = ops.isToday
    ? `${ops.kpis.currentHourLabel || "Current hour"} flow`
    : `${ops.kpis.peakHourLabel || "Peak hour"} flow`;
  const currentOrPeakValue = ops.isToday
    ? ops.kpis.currentHourFiles
    : ops.kpis.peakHourFiles;
  const backlogSummary = ops.backlog?.summary || { awaitingAsn: 0, awaitingReceipt: 0, oldestAgeHours: 0 };
  const pendingAsnSummary = ops.pendingAsnByCustomer?.summary || { customers: 0, pendingOrders: 0, pendingLines: 0, estimatedValue: 0 };
  const closedAsnSummary = ops.closedAsnByCustomer?.summary || { customers: 0, closedOrders: 0, closedLines: 0, estimatedValue: 0 };
  const latestRunMessage = ops.syncHealth?.latestRun?.message || "No sync message yet.";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PureFishing Ops Desktop</title>
  <style>
    :root {
      --bg: #f6f2ea;
      --panel: rgba(255,255,255,.9);
      --ink: #14263c;
      --muted: #5f6f82;
      --line: rgba(20,38,60,.12);
      --blue: #1f6feb;
      --green: #1f9d78;
      --gold: #d18b1f;
      --red: #c44536;
      --shadow: 0 22px 50px rgba(20,38,60,.08);
      --radius: 24px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      background:
        radial-gradient(circle at top left, rgba(31,111,235,.14), transparent 30%),
        radial-gradient(circle at top right, rgba(31,157,120,.12), transparent 26%),
        linear-gradient(180deg, #fbf8f2 0%, var(--bg) 100%);
      color: var(--ink);
    }
    a { color: inherit; text-decoration: none; }
    .page {
      max-width: 1500px;
      margin: 0 auto;
      padding: 28px 28px 42px;
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.7fr) minmax(320px, .85fr);
      gap: 22px;
      align-items: stretch;
    }
    .hero-main, .hero-side, .panel {
      background: var(--panel);
      border: 1px solid rgba(255,255,255,.72);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      backdrop-filter: blur(12px);
    }
    .hero-main {
      padding: 26px 28px;
      position: relative;
      overflow: hidden;
    }
    .hero-main::after {
      content: "";
      position: absolute;
      right: -90px;
      bottom: -120px;
      width: 280px;
      height: 280px;
      background: radial-gradient(circle, rgba(31,111,235,.18), transparent 70%);
      pointer-events: none;
    }
    .hero-side {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .eyebrow {
      font-size: .75rem;
      font-weight: 700;
      letter-spacing: .18em;
      text-transform: uppercase;
      color: #617487;
    }
    h1, h2, h3 {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      color: #17304c;
    }
    h1 { font-size: clamp(2.2rem, 3.2vw, 3.4rem); line-height: 1.02; margin-top: 8px; }
    h2 { font-size: 1.7rem; line-height: 1.1; }
    h3 { font-size: 1.2rem; }
    .hero-copy {
      max-width: 820px;
      color: var(--muted);
      font-size: 1.04rem;
      line-height: 1.7;
      margin: 14px 0 22px;
    }
    .mode-nav {
      display: inline-flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 18px;
    }
    .mode-nav a {
      padding: 10px 14px;
      border-radius: 999px;
      background: rgba(20,38,60,.06);
      font-size: .92rem;
      font-weight: 600;
      color: #42556b;
    }
    .mode-nav a.active {
      background: #17304c;
      color: white;
    }
    .toolbar {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
      margin-top: 18px;
    }
    .toolbar form {
      display: inline-flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
      padding: 12px 14px;
      border-radius: 18px;
      background: rgba(20,38,60,.05);
    }
    label {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      font-size: .92rem;
      color: #46596f;
    }
    input[type="date"] {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px 12px;
      background: rgba(255,255,255,.9);
      color: var(--ink);
      font: inherit;
    }
    button, .button-link {
      border: none;
      border-radius: 14px;
      padding: 11px 16px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      background: #17304c;
      color: white;
    }
    button[disabled] {
      opacity: .5;
      cursor: not-allowed;
    }
    .button-link.secondary, button.secondary {
      background: rgba(20,38,60,.08);
      color: var(--ink);
    }
    .headline-metrics {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 18px;
    }
    .headline-chip {
      padding: 11px 14px;
      border-radius: 16px;
      background: rgba(255,255,255,.68);
      border: 1px solid rgba(20,38,60,.08);
      font-size: .92rem;
      color: #3b516a;
    }
    .headline-chip strong { color: #163149; }
    .detail-list {
      display: grid;
      gap: 10px;
    }
    .detail-list div {
      display: flex;
      gap: 12px;
      justify-content: space-between;
      align-items: baseline;
      font-size: .95rem;
      color: var(--muted);
    }
    .detail-list strong {
      color: var(--ink);
      font-size: .92rem;
    }
    .hero-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .live-box, .flash {
      padding: 14px 15px;
      border-radius: 18px;
      background: rgba(31,111,235,.09);
      border: 1px solid rgba(31,111,235,.16);
      color: #244969;
      display: grid;
      gap: 4px;
    }
    .side-note {
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
      font-size: .92rem;
    }
    .kpi-grid {
      margin-top: 22px;
      display: grid;
      grid-template-columns: repeat(8, minmax(0, 1fr));
      gap: 14px;
    }
    .kpi-card {
      padding: 18px;
      border-radius: 20px;
      background: rgba(255,255,255,.76);
      border: 1px solid rgba(20,38,60,.08);
      display: grid;
      gap: 8px;
      min-height: 126px;
    }
    .kpi-card span {
      color: #61758a;
      font-size: .82rem;
      letter-spacing: .08em;
      text-transform: uppercase;
      font-weight: 700;
    }
    .kpi-card strong {
      font-size: 2rem;
      line-height: 1;
      color: #17304c;
    }
    .kpi-card small {
      color: #516679;
      font-size: .9rem;
      line-height: 1.45;
    }
    .kpi-warn { background: linear-gradient(180deg, rgba(196,69,54,.08), rgba(255,255,255,.86)); }
    .kpi-good { background: linear-gradient(180deg, rgba(31,157,120,.09), rgba(255,255,255,.86)); }
    .ops-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(0, .95fr);
      gap: 18px;
      margin-top: 22px;
    }
    .panel {
      padding: 22px 22px 20px;
    }
    .panel-head {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: start;
      margin-bottom: 16px;
    }
    .panel-head p, .panel-note {
      margin: 6px 0 0;
      color: var(--muted);
      line-height: 1.6;
      font-size: .95rem;
    }
    .chart-svg { width: 100%; height: auto; display: block; }
    .chart-grid-line {
      stroke: rgba(20,38,60,.12);
      stroke-width: 1;
      shape-rendering: crispEdges;
    }
    .chart-axis-label {
      fill: #66788b;
      font-size: 12px;
      font-family: "Segoe UI", Arial, sans-serif;
    }
    .chart-axis-left { text-anchor: end; }
    .chart-axis-bottom { text-anchor: middle; }
    .chart-legend {
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .legend-item {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      color: #556a7d;
      font-size: .9rem;
    }
    .legend-item i {
      display: inline-block;
      width: 14px;
      height: 14px;
      border-radius: 999px;
    }
    .funnel-list {
      display: grid;
      gap: 14px;
    }
    .funnel-label-row, .folder-load-head, .folder-load-meta {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
    }
    .funnel-bar, .folder-load-bar {
      height: 14px;
      background: rgba(20,38,60,.08);
      border-radius: 999px;
      overflow: hidden;
      margin-top: 8px;
    }
    .funnel-bar span, .folder-load-bar span {
      display: block;
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, #1f6feb, #1f9d78);
    }
    .aging-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }
    .aging-card {
      padding: 16px;
      border-radius: 18px;
      background: rgba(20,38,60,.05);
      border: 1px solid rgba(20,38,60,.08);
      display: grid;
      gap: 6px;
    }
    .aging-card span {
      color: #647588;
      text-transform: uppercase;
      letter-spacing: .08em;
      font-size: .8rem;
      font-weight: 700;
    }
    .aging-card strong {
      font-size: 1.9rem;
      color: #17304c;
      line-height: 1;
    }
    .status-pill {
      display: inline-flex;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: .8rem;
      font-weight: 700;
      letter-spacing: .06em;
      text-transform: uppercase;
    }
    .status-warn {
      background: rgba(196,69,54,.1);
      color: #9d3b30;
    }
    .table-wrap {
      overflow: auto;
      border: 1px solid rgba(20,38,60,.08);
      border-radius: 18px;
      background: rgba(255,255,255,.72);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 620px;
    }
    th, td {
      padding: 13px 14px;
      border-bottom: 1px solid rgba(20,38,60,.08);
      text-align: left;
      vertical-align: top;
      font-size: .93rem;
    }
    th {
      background: rgba(20,38,60,.05);
      color: #516579;
      text-transform: uppercase;
      letter-spacing: .08em;
      font-size: .76rem;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    tbody tr:last-child td { border-bottom: none; }
    .folder-load-list {
      display: grid;
      gap: 14px;
    }
    .folder-load-row {
      padding: 16px;
      border-radius: 18px;
      background: rgba(20,38,60,.05);
      border: 1px solid rgba(20,38,60,.08);
      display: grid;
      gap: 8px;
    }
    .folder-load-meta {
      color: #5b7084;
      font-size: .9rem;
    }
    .summary-strip {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .summary-callout {
      padding: 16px;
      border-radius: 18px;
      background: rgba(20,38,60,.05);
      border: 1px solid rgba(20,38,60,.08);
      display: grid;
      gap: 6px;
    }
    .summary-callout span {
      color: #66788c;
      font-size: .8rem;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .summary-callout strong {
      font-size: 1.5rem;
      color: #17304c;
    }
    .empty-state {
      padding: 28px;
      text-align: center;
      color: #687b8e;
      background: rgba(20,38,60,.04);
      border-radius: 18px;
      border: 1px dashed rgba(20,38,60,.14);
    }
    @media (max-width: 1320px) {
      .kpi-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .ops-grid { grid-template-columns: 1fr; }
      .hero { grid-template-columns: 1fr; }
    }
    @media (max-width: 900px) {
      .page { padding: 18px; }
      .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .summary-strip, .aging-grid { grid-template-columns: 1fr; }
    }

    /* Internal system theme override */
    :root {
      --bg: #f3f2f1;
      --panel: #ffffff;
      --ink: #323130;
      --muted: #605e5c;
      --line: #edebe9;
      --blue: #0f6cbd;
      --green: #107c10;
      --gold: #986f0b;
      --red: #a4262c;
      --shadow: none;
      --radius: 6px;
    }
    body {
      font-family: "Segoe UI", Arial, sans-serif;
      background: var(--bg);
      color: var(--ink);
    }
    .page {
      max-width: 1680px;
      padding: 16px 20px 28px;
    }
    .hero-main, .hero-side, .panel {
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: none;
      backdrop-filter: none;
      background: var(--panel);
    }
    .hero-main::after {
      display: none;
    }
    .hero-main {
      padding: 18px 20px;
    }
    .hero-side,
    .panel {
      padding: 18px 20px;
      gap: 12px;
    }
    .eyebrow {
      color: #605e5c;
      letter-spacing: 0.08em;
      font-size: 0.72rem;
      margin-bottom: 4px;
    }
    h1, h2, h3 {
      font-family: "Segoe UI", Arial, sans-serif;
      color: #201f1e;
      font-weight: 600;
    }
    h1 {
      font-size: 1.7rem;
      line-height: 1.2;
      margin-top: 2px;
    }
    h2 {
      font-size: 1.15rem;
    }
    h3 {
      font-size: 1rem;
    }
    .hero-copy,
    .panel-head p,
    .panel-note,
    .side-note,
    .detail-list div {
      color: var(--muted);
    }
    .hero-copy {
      max-width: none;
      margin: 8px 0 14px;
      font-size: 0.92rem;
      line-height: 1.45;
    }
    .mode-nav {
      gap: 0;
      margin-bottom: 14px;
      border-bottom: 1px solid var(--line);
    }
    .mode-nav a {
      border-radius: 0;
      background: transparent;
      color: #605e5c;
      padding: 10px 14px;
      border-bottom: 2px solid transparent;
      font-weight: 600;
    }
    .mode-nav a.active {
      background: transparent;
      color: var(--blue);
      border-bottom-color: var(--blue);
    }
    .toolbar {
      margin-top: 12px;
    }
    .toolbar form {
      background: #faf9f8;
      border: 1px solid var(--line);
      border-radius: 4px;
      padding: 8px 10px;
    }
    label {
      color: #605e5c;
      font-size: 0.85rem;
    }
    input[type="date"] {
      border-radius: 2px;
      padding: 8px 10px;
      border-color: #c8c6c4;
      background: #ffffff;
    }
    button, .button-link {
      border-radius: 2px;
      padding: 9px 14px;
      background: var(--blue);
      color: #ffffff;
      font-weight: 600;
    }
    .button-link.secondary, button.secondary {
      background: #ffffff;
      color: var(--ink);
      border: 1px solid #c8c6c4;
    }
    .headline-metrics {
      margin-top: 14px;
      gap: 8px;
    }
    .headline-chip {
      border-radius: 3px;
      background: #faf9f8;
      border: 1px solid var(--line);
      color: #605e5c;
      padding: 7px 10px;
      font-size: 0.85rem;
    }
    .headline-chip strong {
      color: #201f1e;
    }
    .detail-list {
      gap: 0;
      margin-top: 2px;
    }
    .detail-list div {
      border-bottom: 1px solid var(--line);
      padding: 8px 0;
      font-size: 0.87rem;
    }
    .live-box, .flash {
      border-radius: 4px;
      border: 1px solid #c7e0f4;
      background: #f3f9fd;
      color: #201f1e;
      padding: 10px 12px;
    }
    .kpi-grid {
      margin-top: 16px;
      gap: 10px;
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
    .kpi-card {
      min-height: 92px;
      padding: 14px;
      border-radius: 4px;
      background: #ffffff;
      border: 1px solid var(--line);
      gap: 5px;
    }
    .kpi-card span {
      font-size: 0.72rem;
      color: #605e5c;
    }
    .kpi-card strong {
      font-size: 1.45rem;
      color: #201f1e;
    }
    .kpi-card small {
      font-size: 0.82rem;
      color: #605e5c;
      line-height: 1.35;
    }
    .kpi-good {
      background: #f3fbf1;
      border-color: #dff6dd;
    }
    .kpi-warn {
      background: #fdf6f6;
      border-color: #f1d4d6;
    }
    .ops-grid {
      gap: 14px;
      margin-top: 14px;
    }
    .panel-head {
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--line);
    }
    .chart-grid-line {
      stroke: #edebe9;
    }
    .chart-axis-label {
      fill: #605e5c;
      font-size: 11px;
    }
    .legend-item {
      color: #605e5c;
      font-size: 0.84rem;
    }
    .funnel-bar, .folder-load-bar {
      height: 10px;
      background: #f3f2f1;
    }
    .funnel-bar span, .folder-load-bar span {
      background: var(--blue);
    }
    .aging-card,
    .summary-callout,
    .folder-load-row {
      border-radius: 4px;
      background: #faf9f8;
      border: 1px solid var(--line);
    }
    .aging-card strong,
    .summary-callout strong {
      color: #201f1e;
    }
    .status-pill {
      border-radius: 3px;
      letter-spacing: 0.04em;
      padding: 4px 8px;
    }
    .status-warn {
      background: #fde7e9;
      color: #a4262c;
    }
    .table-wrap {
      border: 1px solid var(--line);
      border-radius: 4px;
      background: #ffffff;
    }
    th, td {
      padding: 10px 12px;
      font-size: 0.87rem;
    }
    th {
      background: #faf9f8;
      color: #605e5c;
      font-size: 0.72rem;
    }
    tbody tr:nth-child(even) td {
      background: #fcfcfb;
    }
    .summary-strip {
      gap: 10px;
      margin-bottom: 12px;
    }
    .empty-state {
      border-radius: 4px;
      background: #faf9f8;
      border: 1px dashed #c8c6c4;
      color: #605e5c;
      padding: 18px;
    }
    @media (max-width: 1320px) {
      .kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @media (max-width: 900px) {
      .page { padding: 12px; }
      .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <div class="hero-main">
        ${renderNavLinks(links)}
        <div class="eyebrow">Operations Workspace</div>
        <h1>Order flow and ASN tracking</h1>
        <p class="hero-copy">Use this screen to review daily volume, open order backlog, ASN closure, customer workload, and sync status from one internal operations view.</p>
        <div class="toolbar">
          <form method="get" action="/desktop">
            <label>Selected Day <input type="date" name="ops_date" value="${escapeHtml(ops.dateLabel)}"></label>
            <button type="submit">Load Day</button>
          </form>
          <a class="button-link secondary" href="${escapeHtml(links.admin)}">Detailed Admin View</a>
        </div>
        <div class="headline-metrics">
          <div class="headline-chip"><strong>${escapeHtml(ops.dateLabel)}</strong> selected</div>
          <div class="headline-chip"><strong>${escapeHtml(compareLabel)}</strong> comparison day</div>
          <div class="headline-chip"><strong>${escapeHtml(formatNumber(ops.kpis.totalNewFiles))}</strong> new files across all folders</div>
          <div class="headline-chip"><strong>${escapeHtml(latestRunMessage)}</strong></div>
        </div>
        <div class="kpi-grid">
          ${renderKpiCard("Orders", formatNumber(ops.kpis.orders), formatDelta(ops.kpis.compareOrdersDelta), "good")}
          ${renderKpiCard("ASN", formatNumber(ops.kpis.asn), formatDelta(ops.kpis.compareAsnDelta), ops.kpis.asn >= ops.kpis.orders ? "good" : "")}
          ${renderKpiCard("Receipts", formatNumber(ops.kpis.receipt), formatDelta(ops.kpis.compareReceiptDelta))}
          ${renderKpiCard("Closed By ASN", formatNumber(ops.kpis.closedAsnOrders), `${formatNumber(ops.kpis.closedAsnLines)} closed lines`, ops.kpis.closedAsnOrders > 0 ? "good" : "")}
          ${renderKpiCard("Pending ASN Orders", formatNumber(ops.kpis.pendingAsnOrders), `${formatNumber(ops.kpis.pendingAsnLines)} pending lines`, ops.kpis.pendingAsnOrders > 0 ? "warn" : "good")}
          ${renderKpiCard(currentOrPeakLabel, formatNumber(currentOrPeakValue), ops.isToday ? "Current selected-hour arrivals" : "Highest hour on selected day")}
          ${renderKpiCard("Closed ASN Est. Value", formatCurrency(ops.kpis.closedAsnEstimatedValue), `${formatCurrency(config.orderLineEstimatedValue)} per line workload estimate`, ops.kpis.closedAsnEstimatedValue > 0 ? "good" : "")}
          ${renderKpiCard("Pending ASN Est. Value", formatCurrency(ops.kpis.pendingAsnEstimatedValue), `${formatCurrency(config.orderLineEstimatedValue)} per line workload estimate`, ops.kpis.pendingAsnEstimatedValue > 0 ? "warn" : "good")}
          ${renderKpiCard("Open Backlog", formatNumber(ops.kpis.openBacklog), `${formatNumber(backlogSummary.awaitingAsn)} awaiting ASN, ${formatNumber(backlogSummary.awaitingReceipt)} awaiting receipt`, ops.kpis.openBacklog > 0 ? "warn" : "good")}
          ${renderKpiCard("Oldest Waiting", formatAgeHours(ops.kpis.oldestAgeHours), "Longest unresolved order-flow age", ops.kpis.oldestAgeHours >= 4 ? "warn" : "")}
        </div>
      </div>
      ${renderSyncPanel(config, serviceState, ops.syncHealth, ops.dateLabel, flashMessage, links)}
    </section>

    <section class="ops-grid">
      <article class="panel">
        <div class="panel-head">
          <div>
            <div class="eyebrow">Hourly Flow</div>
            <h3>Orders, ASN, Receipts, and Returns by hour</h3>
            <p>Use this to see whether upstream order intake and downstream confirmations are moving together through the day.</p>
          </div>
          <div class="summary-callout">
            <span>Peak Hour</span>
            <strong>${escapeHtml(ops.flow.summary.peakHourLabel || "No activity")}</strong>
          </div>
        </div>
        ${renderHourlyFlowChart(ops.flow)}
      </article>

      <article class="panel">
        <div class="panel-head">
          <div>
            <div class="eyebrow">Stage Funnel</div>
            <h3>Daily volume by lifecycle stage</h3>
            <p>Quickly spot where flow is shrinking or backing up as documents move from Orders to ASN and Receipt.</p>
          </div>
        </div>
        ${renderFunnel(ops.funnel)}
        <div class="summary-strip" style="margin-top:18px">
          <div class="summary-callout">
            <span>Orders</span>
            <strong>${escapeHtml(formatNumber(ops.stageTotals.orders?.count || 0))}</strong>
          </div>
          <div class="summary-callout">
            <span>ASN</span>
            <strong>${escapeHtml(formatNumber(ops.stageTotals.asn?.count || 0))}</strong>
          </div>
          <div class="summary-callout">
            <span>Receipt</span>
            <strong>${escapeHtml(formatNumber(ops.stageTotals.receipt?.count || 0))}</strong>
          </div>
        </div>
      </article>
    </section>

    <section class="ops-grid">
      <article class="panel">
        <div class="panel-head">
          <div>
            <div class="eyebrow">Pace</div>
            <h3>Cumulative Orders vs ASN pace</h3>
            <p>Solid lines show the selected day. Dashed lines show the comparison day so you can see if confirmations are keeping up.</p>
          </div>
        </div>
        ${renderCumulativeChart(ops.cumulative, compareLabel)}
      </article>

      <article class="panel">
        <div class="panel-head">
          <div>
            <div class="eyebrow">Backlog Aging</div>
            <h3>How old are unresolved orders?</h3>
            <p>These buckets highlight orders still waiting on the next stage, either ASN or Receipt.</p>
          </div>
        </div>
        ${renderBacklogAging(ops.backlog)}
        <p class="panel-note">Oldest unresolved order-flow item: <strong>${escapeHtml(formatAgeHours(backlogSummary.oldestAgeHours || 0))}</strong>.</p>
      </article>
    </section>

    <section class="ops-grid">
      <article class="panel">
        <div class="panel-head">
          <div>
            <div class="eyebrow">Exceptions</div>
            <h3>Oldest open order-flow gaps</h3>
            <p>These are the records currently waiting for the next operational step and deserve the fastest attention.</p>
          </div>
        </div>
        ${renderExceptionsTable(ops.backlog, config.timezone)}
      </article>

      <article class="panel">
        <div class="panel-head">
          <div>
            <div class="eyebrow">Pending ASN</div>
            <h3>Pending ASN by customer</h3>
            <p>Orders are matched to ASN by <strong>VBELN</strong>. Estimated value uses <strong>${escapeHtml(formatCurrency(config.orderLineEstimatedValue))} per line</strong>.</p>
          </div>
        </div>
        <div class="summary-strip">
          <div class="summary-callout">
            <span>Customers</span>
            <strong>${escapeHtml(formatNumber(pendingAsnSummary.customers))}</strong>
          </div>
          <div class="summary-callout">
            <span>Pending Orders</span>
            <strong>${escapeHtml(formatNumber(pendingAsnSummary.pendingOrders))}</strong>
          </div>
          <div class="summary-callout">
            <span>Est. Value</span>
            <strong>${escapeHtml(formatCurrency(pendingAsnSummary.estimatedValue))}</strong>
          </div>
        </div>
        ${renderPendingAsnCustomerTable(ops.pendingAsnByCustomer)}
      </article>
    </section>

    <section class="ops-grid">
      <article class="panel">
        <div class="panel-head">
          <div>
            <div class="eyebrow">Closed ASN</div>
            <h3>Orders closed by ASN on the selected day</h3>
            <p>These orders have both an Order document and a matching ASN using <strong>VBELN</strong>.</p>
          </div>
        </div>
        <div class="summary-strip">
          <div class="summary-callout">
            <span>Customers</span>
            <strong>${escapeHtml(formatNumber(closedAsnSummary.customers))}</strong>
          </div>
          <div class="summary-callout">
            <span>Closed Orders</span>
            <strong>${escapeHtml(formatNumber(closedAsnSummary.closedOrders))}</strong>
          </div>
          <div class="summary-callout">
            <span>Est. Value</span>
            <strong>${escapeHtml(formatCurrency(closedAsnSummary.estimatedValue))}</strong>
          </div>
        </div>
        ${renderClosedAsnCustomerTable(ops.closedAsnByCustomer, config.timezone)}
      </article>

      <article class="panel">
        <div class="panel-head">
          <div>
            <div class="eyebrow">Customer Load</div>
            <h3>Who is driving today's order volume?</h3>
            <p>Based on parsed order XML for the selected day.</p>
          </div>
        </div>
        ${renderCustomerTable(ops.customerLoad, config.timezone)}
      </article>
    </section>

    <section class="ops-grid" style="margin-top:18px">
      <article class="panel">
        <div class="panel-head">
          <div>
            <div class="eyebrow">Folder Load</div>
            <h3>Which folders are busiest today?</h3>
            <p>Fast view of where operational traffic is landing across the SFTP structure.</p>
          </div>
        </div>
        ${renderFolderLoad(ops.folderLoad)}
      </article>

      <article class="panel">
        <div class="panel-head">
          <div>
            <div class="eyebrow">Sync Health</div>
            <h3>Technical state in brief</h3>
            <p>Keep this secondary. It supports the ops view, but it should not dominate the page.</p>
          </div>
        </div>
        <div class="summary-strip">
          <div class="summary-callout">
            <span>Latest Status</span>
            <strong>${escapeHtml(ops.syncHealth.latestRun?.status || "idle")}</strong>
          </div>
          <div class="summary-callout">
            <span>Last Started</span>
            <strong>${escapeHtml(formatDateTime(ops.syncHealth.latestRun?.started_at, config.timezone))}</strong>
          </div>
          <div class="summary-callout">
            <span>Downloaded</span>
            <strong>${escapeHtml(formatNumber(ops.syncHealth.latestRun?.downloaded_files || 0))}</strong>
          </div>
        </div>
        <p class="panel-note">${escapeHtml(latestRunMessage)}</p>
        <p class="panel-note" style="margin-top:16px"><a href="${escapeHtml(links.admin)}"><strong>Open Admin</strong></a> for file activity tables, sync history, CSV exports, and the current mobile-style interface.</p>
      </article>
    </section>
  </main>
</body>
</html>`;
}

module.exports = {
  renderDesktopDashboard
};
