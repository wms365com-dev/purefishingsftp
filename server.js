const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const { AlertManager } = require("./alerting");
const { getPublicConfig, loadConfig, validateConfig } = require("./config");
const { MirrorDatabase } = require("./database");
const { renderDashboard } = require("./renderDashboard");
const { SyncScheduler } = require("./scheduler");
const { SftpMirrorService } = require("./sftpMirror");
const { getLocalDayRange } = require("./time");

const config = loadConfig();
const configErrors = validateConfig(config);

fs.mkdirSync(config.dataRoot, { recursive: true });
fs.mkdirSync(config.snapshotsRoot, { recursive: true });

const database = new MirrorDatabase(config.databasePath);
database.failRunningRuns(new Date().toISOString(), "Run interrupted before completion. The service restarted or the process exited unexpectedly.");
const alertManager = new AlertManager(config, database);
const mirrorService = new SftpMirrorService(config, database, console, { alertManager });
const scheduler = new SyncScheduler(mirrorService, config, console, {
  onTick(now) {
    void alertManager.onTick(now);
  }
});

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, statusCode, text, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, { "Content-Type": contentType });
  response.end(text);
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

function buildConfigPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Configuration Required</title>
  <style>
    body{font-family:Georgia,serif;background:#f4f1e8;color:#132238;padding:32px}
    .panel{max-width:720px;margin:0 auto;background:white;border-radius:20px;padding:28px;box-shadow:0 16px 40px rgba(19,34,56,.08)}
    code{background:#f3f4f6;padding:2px 6px;border-radius:8px}
  </style>
</head>
<body>
  <div class="panel">
    <h1>Configuration Required</h1>
    <p>The service is running, but it cannot connect to SFTP until these environment variables are set:</p>
    <ul>${configErrors.map((item) => `<li><code>${item}</code></li>`).join("")}</ul>
    <p>Once these are configured, refresh this page and the dashboard will be ready.</p>
  </div>
</body>
</html>`;
}

function parseActivityFilters(searchParams) {
  const filters = {
    q: searchParams.get("q")?.trim() || "",
    status: searchParams.get("status")?.trim() || "",
    folder: searchParams.get("folder")?.trim() || "",
    dateFrom: searchParams.get("date_from")?.trim() || "",
    dateTo: searchParams.get("date_to")?.trim() || "",
    runId: searchParams.get("run_id")?.trim() || "",
    intakeDate: searchParams.get("intake_date")?.trim() || ""
  };

  if (!["new", "changed", "unchanged", "deleted", ""].includes(filters.status)) {
    filters.status = "";
  }

  if (filters.dateFrom) {
    const range = getLocalDayRange(filters.dateFrom, config.timezone);
    if (range) {
      filters.dateFromIso = range.startIso;
    } else {
      filters.dateFrom = "";
    }
  }

  if (filters.dateTo) {
    const range = getLocalDayRange(filters.dateTo, config.timezone);
    if (range) {
      filters.dateToIso = range.endIso;
    } else {
      filters.dateTo = "";
    }
  }

  const intakeRange = filters.intakeDate
    ? getLocalDayRange(filters.intakeDate, config.timezone)
    : getLocalDayRange(new Date(), config.timezone);

  if (intakeRange) {
    filters.intakeDate = intakeRange.label;
    filters.intakeRange = intakeRange;
  } else {
    filters.intakeDate = "";
  }

  const runId = Number.parseInt(filters.runId, 10);
  if (Number.isFinite(runId) && runId > 0) {
    filters.runId = runId;
  } else {
    filters.runId = "";
  }

  return filters;
}

function buildQueryString(filters) {
  const searchParams = new URLSearchParams();

  if (filters.q) {
    searchParams.set("q", filters.q);
  }

  if (filters.status) {
    searchParams.set("status", filters.status);
  }

  if (filters.folder) {
    searchParams.set("folder", filters.folder);
  }

  if (filters.dateFrom) {
    searchParams.set("date_from", filters.dateFrom);
  }

  if (filters.dateTo) {
    searchParams.set("date_to", filters.dateTo);
  }

  if (filters.runId) {
    searchParams.set("run_id", String(filters.runId));
  }

  if (filters.intakeDate) {
    searchParams.set("intake_date", filters.intakeDate);
  }

  return searchParams.toString();
}

function csvEscape(value) {
  const stringValue = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(stringValue)
    ? `"${stringValue.replace(/"/g, "\"\"")}"`
    : stringValue;
}

function rowsToCsv(headers, rows) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }

  return `${lines.join("\n")}\n`;
}

function buildDashboardHtml(requestUrl) {
  const flashMessage = requestUrl.searchParams.get("message");
  const filters = parseActivityFilters(requestUrl.searchParams);
  const dashboard = database.getDashboardData(filters, {
    activityLimit: config.activityPageSize,
    folderLimit: 50,
    runLimit: 25,
    dailyIntakeRange: filters.intakeRange,
    dailyIntakeLimit: 20
  });
  const queryString = buildQueryString(filters);

  return renderDashboard({
    dashboard,
    config: getPublicConfig(config),
    serviceState: mirrorService.getState(),
    flashMessage,
    filters,
    intake: {
      date: filters.intakeDate,
      label: filters.intakeRange ? filters.intakeRange.label : "",
      totalAdded: (dashboard.dailyFolderIntake || []).reduce((sum, item) => sum + item.added_count, 0)
    },
    links: {
      activityCsv: `/reports/files.csv${queryString ? `?${queryString}` : ""}`,
      runsCsv: "/reports/runs.csv"
    }
  });
}

async function serveDownload(response, searchParams) {
  const id = Number.parseInt(searchParams.get("id"), 10);
  if (!Number.isFinite(id) || id <= 0) {
    sendText(response, 400, "A valid file event id is required.");
    return;
  }

  const event = database.getFileEventById(id);
  if (!event || !event.snapshot_path) {
    sendText(response, 404, "Archived file not found.");
    return;
  }

  const resolvedPath = path.resolve(event.snapshot_path);
  const snapshotsRoot = path.resolve(config.snapshotsRoot);
  if (!(resolvedPath === snapshotsRoot || resolvedPath.startsWith(`${snapshotsRoot}${path.sep}`))) {
    sendText(response, 403, "Download path is outside the snapshot root.");
    return;
  }

  try {
    await fsp.access(resolvedPath, fs.constants.R_OK);
  } catch (error) {
    sendText(response, 404, "Archived file is no longer available.");
    return;
  }

  response.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(event.file_name || path.basename(resolvedPath))}`
  });

  fs.createReadStream(resolvedPath).pipe(response);
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && requestUrl.pathname === "/health") {
    return sendJson(response, configErrors.length ? 503 : 200, {
      ok: configErrors.length === 0,
      missingConfig: configErrors,
      running: mirrorService.getState().running,
      alertsConfigured: getPublicConfig(config).alertsConfigured,
      snapshotRetentionDays: config.snapshotRetentionDays
    });
  }

  if (request.method === "GET" && requestUrl.pathname === "/") {
    if (configErrors.length) {
      return sendHtml(response, 503, buildConfigPage());
    }

    return sendHtml(response, 200, buildDashboardHtml(requestUrl));
  }

  if (request.method === "GET" && requestUrl.pathname === "/reports/files.csv") {
    const filters = parseActivityFilters(requestUrl.searchParams);
    const rows = database.getFileEventsForCsv(filters, 10000).map((row) => ({
      event_at: row.event_at,
      event_type: row.event_type,
      run_id: row.run_id,
      folder_path: row.folder_path,
      file_name: row.file_name,
      remote_path: row.remote_path,
      size: row.size,
      mtime: row.mtime,
      checksum: row.checksum,
      snapshot_path: row.snapshot_path,
      message: row.message
    }));

    return sendText(
      response,
      200,
      rowsToCsv(
        ["event_at", "event_type", "run_id", "folder_path", "file_name", "remote_path", "size", "mtime", "checksum", "snapshot_path", "message"],
        rows
      ),
      "text/csv; charset=utf-8"
    );
  }

  if (request.method === "GET" && requestUrl.pathname === "/reports/runs.csv") {
    const rows = database.getRunRowsForCsv(1000).map((row) => ({
      id: row.id,
      trigger_source: row.trigger_source,
      started_at: row.started_at,
      finished_at: row.finished_at,
      status: row.status,
      discovered_files: row.discovered_files,
      new_files: row.new_files,
      changed_files: row.changed_files,
      deleted_files: row.deleted_files,
      downloaded_files: row.downloaded_files,
      snapshot_dir: row.snapshot_dir,
      message: row.message
    }));

    return sendText(
      response,
      200,
      rowsToCsv(
        ["id", "trigger_source", "started_at", "finished_at", "status", "discovered_files", "new_files", "changed_files", "deleted_files", "downloaded_files", "snapshot_dir", "message"],
        rows
      ),
      "text/csv; charset=utf-8"
    );
  }

  if (request.method === "GET" && requestUrl.pathname === "/files/download") {
    return void serveDownload(response, requestUrl.searchParams);
  }

  if (request.method === "POST" && requestUrl.pathname === "/sync") {
    request.resume();

    if (configErrors.length) {
      return redirect(response, `/?message=${encodeURIComponent("Sync cannot start until required SFTP environment variables are configured.")}`);
    }

    const started = mirrorService.startBackgroundSync("manual");
    const message = started ? "Manual sync started." : "A sync is already running.";
    return redirect(response, `/?message=${encodeURIComponent(message)}`);
  }

  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
});

server.listen(config.port, () => {
  console.log(`PureFishing SFTP Mirror listening on port ${config.port}`);
  if (configErrors.length) {
    console.log(`Scheduler not started. Missing configuration: ${configErrors.join(", ")}`);
  } else {
    scheduler.start();
  }
});

function shutdown() {
  scheduler.stop();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
