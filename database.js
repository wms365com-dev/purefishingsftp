const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

function getLocalHourOfDay(isoValue, timezone) {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hourCycle: "h23"
  }).format(new Date(isoValue)));
}

function getLocalDateLabel(isoValue, timezone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    })
      .formatToParts(new Date(isoValue))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatHourWindowLabel(hour) {
  const startDisplay = hour % 12 || 12;
  const endDisplay = hour % 12 || 12;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${startDisplay}:00 ${suffix} - ${endDisplay}:59 ${suffix}`;
}

function classifyOpsStage(folderPath) {
  const normalized = String(folderPath || "").replace(/\\/g, "/").toLowerCase();

  if (normalized.includes("/orders")) {
    return "orders";
  }

  if (normalized.includes("/asn")) {
    return "asn";
  }

  if (normalized.includes("/receipt")) {
    return "receipt";
  }

  if (normalized.includes("/returns")) {
    return "returns";
  }

  if (normalized.includes("/997")) {
    return "997";
  }

  return "other";
}

function buildDocumentKey(row) {
  const rawValue = row.order_number || row.record_key || String(row.file_name || "").replace(/\.[^.]+$/, "") || row.remote_path;
  return String(rawValue || "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function formatStageLabel(stage) {
  const labels = {
    orders: "Orders",
    asn: "ASN",
    receipt: "Receipt",
    returns: "Returns",
    "997": "997",
    other: "Other"
  };

  return labels[stage] || "Other";
}

class MirrorDatabase {
  constructor(databasePath) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.initialize();
    this.prepareStatements();
  }

  initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS known_files (
        remote_path TEXT PRIMARY KEY,
        file_name TEXT NOT NULL DEFAULT '',
        folder_path TEXT NOT NULL,
        size INTEGER NOT NULL,
        mtime INTEGER NOT NULL,
        checksum TEXT,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        last_synced_at TEXT,
        last_snapshot_path TEXT
      );

      CREATE TABLE IF NOT EXISTS folder_stats (
        folder_path TEXT PRIMARY KEY,
        direct_file_count INTEGER NOT NULL,
        total_file_count INTEGER NOT NULL,
        last_seen_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger_source TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL,
        discovered_files INTEGER NOT NULL DEFAULT 0,
        new_files INTEGER NOT NULL DEFAULT 0,
        changed_files INTEGER NOT NULL DEFAULT 0,
        deleted_files INTEGER NOT NULL DEFAULT 0,
        downloaded_files INTEGER NOT NULL DEFAULT 0,
        snapshot_dir TEXT,
        message TEXT
      );

      CREATE TABLE IF NOT EXISTS file_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL,
        event_at TEXT NOT NULL,
        event_type TEXT NOT NULL,
        remote_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        folder_path TEXT NOT NULL,
        size INTEGER,
        mtime INTEGER,
        checksum TEXT,
        snapshot_path TEXT,
        message TEXT,
        FOREIGN KEY (run_id) REFERENCES sync_runs(id)
      );

      CREATE TABLE IF NOT EXISTS xml_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_event_id INTEGER,
        run_id INTEGER NOT NULL,
        folder_path TEXT NOT NULL,
        remote_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        snapshot_path TEXT NOT NULL UNIQUE,
        document_type TEXT,
        record_key TEXT,
        order_number TEXT,
        order_date TEXT,
        ship_to TEXT,
        customer_name TEXT,
        item_count INTEGER NOT NULL DEFAULT 0,
        total_qty REAL NOT NULL DEFAULT 0,
        item_preview TEXT,
        parse_status TEXT NOT NULL,
        parse_message TEXT,
        parsed_at TEXT NOT NULL,
        FOREIGN KEY (file_event_id) REFERENCES file_events(id),
        FOREIGN KEY (run_id) REFERENCES sync_runs(id)
      );

      CREATE TABLE IF NOT EXISTS xml_document_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        line_number INTEGER NOT NULL DEFAULT 0,
        item_code TEXT,
        description TEXT,
        quantity_value REAL,
        quantity_text TEXT,
        uom TEXT,
        FOREIGN KEY (document_id) REFERENCES xml_documents(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_file_events_event_at ON file_events(event_at DESC);
      CREATE INDEX IF NOT EXISTS idx_file_events_event_type ON file_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_file_events_folder_path ON file_events(folder_path);
      CREATE INDEX IF NOT EXISTS idx_file_events_remote_path ON file_events(remote_path);
      CREATE INDEX IF NOT EXISTS idx_file_events_run_id ON file_events(run_id);
      CREATE INDEX IF NOT EXISTS idx_xml_documents_folder_path ON xml_documents(folder_path);
      CREATE INDEX IF NOT EXISTS idx_xml_documents_parsed_at ON xml_documents(parsed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_xml_documents_parse_status ON xml_documents(parse_status);
      CREATE INDEX IF NOT EXISTS idx_xml_document_items_document_id ON xml_document_items(document_id);
    `);

    this.ensureColumn("known_files", "file_name", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("known_files", "checksum", "TEXT");
    this.ensureColumn("sync_runs", "deleted_files", "INTEGER NOT NULL DEFAULT 0");
  }

  ensureColumn(tableName, columnName, definition) {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all();
    if (!columns.some((column) => column.name === columnName)) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  }

  prepareStatements() {
    this.insertRunStmt = this.db.prepare(`
      INSERT INTO sync_runs (
        trigger_source,
        started_at,
        status
      ) VALUES (?, ?, ?)
    `);

    this.finishRunStmt = this.db.prepare(`
      UPDATE sync_runs
      SET
        finished_at = ?,
        status = ?,
        discovered_files = ?,
        new_files = ?,
        changed_files = ?,
        deleted_files = ?,
        downloaded_files = ?,
        snapshot_dir = ?,
        message = ?
      WHERE id = ?
    `);

    this.updateRunProgressStmt = this.db.prepare(`
      UPDATE sync_runs
      SET
        status = 'running',
        discovered_files = ?,
        new_files = ?,
        changed_files = ?,
        deleted_files = ?,
        downloaded_files = ?,
        message = ?
      WHERE id = ?
    `);

    this.failRunningRunsStmt = this.db.prepare(`
      UPDATE sync_runs
      SET
        finished_at = ?,
        status = 'failed',
        message = ?
      WHERE status = 'running'
    `);

    this.selectKnownFilesStmt = this.db.prepare(`
      SELECT
        remote_path,
        file_name,
        folder_path,
        size,
        mtime,
        checksum,
        first_seen_at,
        last_seen_at,
        last_synced_at,
        last_snapshot_path
      FROM known_files
    `);

    this.upsertKnownFileStmt = this.db.prepare(`
      INSERT INTO known_files (
        remote_path,
        file_name,
        folder_path,
        size,
        mtime,
        checksum,
        first_seen_at,
        last_seen_at,
        last_synced_at,
        last_snapshot_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(remote_path) DO UPDATE SET
        file_name = excluded.file_name,
        folder_path = excluded.folder_path,
        size = excluded.size,
        mtime = excluded.mtime,
        checksum = excluded.checksum,
        last_seen_at = excluded.last_seen_at,
        last_synced_at = excluded.last_synced_at,
        last_snapshot_path = excluded.last_snapshot_path
    `);

    this.deleteKnownFileStmt = this.db.prepare(`
      DELETE FROM known_files
      WHERE remote_path = ?
    `);

    this.clearFolderStatsStmt = this.db.prepare("DELETE FROM folder_stats");

    this.insertFolderStatStmt = this.db.prepare(`
      INSERT INTO folder_stats (
        folder_path,
        direct_file_count,
        total_file_count,
        last_seen_at
      ) VALUES (?, ?, ?, ?)
    `);

    this.insertFileEventStmt = this.db.prepare(`
      INSERT INTO file_events (
        run_id,
        event_at,
        event_type,
        remote_path,
        file_name,
        folder_path,
        size,
        mtime,
        checksum,
        snapshot_path,
        message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.dashboardSummaryStmt = this.db.prepare(`
      SELECT
        COALESCE((SELECT MAX(total_file_count) FROM folder_stats), 0) AS tracked_files,
        (SELECT COUNT(*) FROM folder_stats) AS tracked_folders,
        (
          SELECT finished_at
          FROM sync_runs
          WHERE status = 'success'
          ORDER BY id DESC
          LIMIT 1
        ) AS last_success_at,
        (
          SELECT started_at
          FROM sync_runs
          ORDER BY id DESC
          LIMIT 1
        ) AS last_run_at,
        (
          SELECT COUNT(*)
          FROM file_events
          WHERE event_at >= ? AND event_type IN ('new', 'changed')
        ) AS recent_changes,
        (
          SELECT COUNT(*)
          FROM file_events
          WHERE event_at >= ? AND event_type = 'deleted'
        ) AS recent_deletions
    `);

    this.recentRunsStmt = this.db.prepare(`
      SELECT
        id,
        trigger_source,
        started_at,
        finished_at,
        status,
        discovered_files,
        new_files,
        changed_files,
        deleted_files,
        downloaded_files,
        snapshot_dir,
        message
      FROM sync_runs
      ORDER BY id DESC
      LIMIT ?
    `);

    this.folderStatsStmt = this.db.prepare(`
      SELECT
        folder_path,
        direct_file_count,
        total_file_count,
        last_seen_at
      FROM folder_stats
      ORDER BY total_file_count DESC, folder_path ASC
      LIMIT ?
    `);

    this.trackedFileEstimateStmt = this.db.prepare(`
      SELECT
        COALESCE((SELECT MAX(total_file_count) FROM folder_stats), 0) AS tracked_files
    `);

    this.dailyFolderIntakeStmt = this.db.prepare(`
      SELECT
        folder_path,
        COUNT(*) AS added_count,
        COALESCE(SUM(size), 0) AS added_bytes
      FROM file_events
      WHERE
        event_type = 'new' AND
        event_at >= ? AND
        event_at < ?
      GROUP BY folder_path
      ORDER BY added_count DESC, folder_path ASC
      LIMIT ?
    `);

    this.folderDayNewEventsStmt = this.db.prepare(`
      SELECT
        event_at,
        folder_path,
        file_name,
        remote_path,
        size
      FROM file_events
      WHERE
        event_type = 'new' AND
        folder_path = ? AND
        event_at >= ? AND
        event_at < ?
      ORDER BY event_at ASC, id ASC
    `);

    this.dailyTrendEventsStmt = this.db.prepare(`
      SELECT
        event_at,
        folder_path,
        size
      FROM file_events
      WHERE
        event_type = 'new' AND
        event_at >= ? AND
        event_at < ?
      ORDER BY event_at ASC, id ASC
    `);

    this.opsFlowEventsStmt = this.db.prepare(`
      SELECT
        event_at,
        folder_path,
        file_name,
        remote_path,
        size
      FROM file_events
      WHERE
        event_type = 'new' AND
        event_at >= ? AND
        event_at < ?
      ORDER BY event_at ASC, id ASC
    `);

    this.opsXmlDocumentsInRangeStmt = this.db.prepare(`
      SELECT
        parsed_at,
        folder_path,
        remote_path,
        file_name,
        document_type,
        record_key,
        order_number,
        order_date,
        ship_to,
        customer_name,
        item_count,
        total_qty
      FROM xml_documents
      WHERE
        parse_status = 'success' AND
        parsed_at >= ? AND
        parsed_at < ?
      ORDER BY parsed_at ASC, id ASC
    `);

    this.opsXmlDocumentsThroughStmt = this.db.prepare(`
      SELECT
        parsed_at,
        folder_path,
        remote_path,
        file_name,
        document_type,
        record_key,
        order_number,
        order_date,
        ship_to,
        customer_name,
        item_count,
        total_qty
      FROM xml_documents
      WHERE
        parse_status = 'success' AND
        parsed_at < ?
      ORDER BY parsed_at ASC, id ASC
    `);

    this.fileEventIdBySnapshotPathStmt = this.db.prepare(`
      SELECT id
      FROM file_events
      WHERE snapshot_path = ?
      ORDER BY id DESC
      LIMIT 1
    `);

    this.upsertXmlDocumentStmt = this.db.prepare(`
      INSERT INTO xml_documents (
        file_event_id,
        run_id,
        folder_path,
        remote_path,
        file_name,
        snapshot_path,
        document_type,
        record_key,
        order_number,
        order_date,
        ship_to,
        customer_name,
        item_count,
        total_qty,
        item_preview,
        parse_status,
        parse_message,
        parsed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(snapshot_path) DO UPDATE SET
        file_event_id = excluded.file_event_id,
        run_id = excluded.run_id,
        folder_path = excluded.folder_path,
        remote_path = excluded.remote_path,
        file_name = excluded.file_name,
        document_type = excluded.document_type,
        record_key = excluded.record_key,
        order_number = excluded.order_number,
        order_date = excluded.order_date,
        ship_to = excluded.ship_to,
        customer_name = excluded.customer_name,
        item_count = excluded.item_count,
        total_qty = excluded.total_qty,
        item_preview = excluded.item_preview,
        parse_status = excluded.parse_status,
        parse_message = excluded.parse_message,
        parsed_at = excluded.parsed_at
      RETURNING id
    `);

    this.deleteXmlDocumentItemsStmt = this.db.prepare(`
      DELETE FROM xml_document_items
      WHERE document_id = ?
    `);

    this.insertXmlDocumentItemStmt = this.db.prepare(`
      INSERT INTO xml_document_items (
        document_id,
        line_number,
        item_code,
        description,
        quantity_value,
        quantity_text,
        uom
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.xmlFolderTabsStmt = this.db.prepare(`
      SELECT
        folder_path,
        COUNT(*) AS total_documents,
        MAX(parsed_at) AS last_parsed_at,
        COALESCE(SUM(item_count), 0) AS total_items,
        COALESCE(SUM(total_qty), 0) AS total_qty
      FROM xml_documents
      WHERE parse_status = 'success'
      GROUP BY folder_path
      ORDER BY last_parsed_at DESC, folder_path ASC
      LIMIT ?
    `);

    this.xmlDocumentsByFolderStmt = this.db.prepare(`
      SELECT
        id,
        file_event_id,
        run_id,
        folder_path,
        remote_path,
        file_name,
        snapshot_path,
        document_type,
        record_key,
        order_number,
        order_date,
        ship_to,
        customer_name,
        item_count,
        total_qty,
        item_preview,
        parse_status,
        parse_message,
        parsed_at
      FROM xml_documents
      WHERE folder_path = ?
      ORDER BY parsed_at DESC, id DESC
      LIMIT ?
    `);

    this.xmlDocumentItemsStmt = this.db.prepare(`
      SELECT
        id,
        document_id,
        line_number,
        item_code,
        description,
        quantity_value,
        quantity_text,
        uom
      FROM xml_document_items
      WHERE document_id = ?
      ORDER BY line_number ASC, id ASC
    `);

    this.fileEventByIdStmt = this.db.prepare(`
      SELECT
        id,
        run_id,
        event_at,
        event_type,
        remote_path,
        file_name,
        folder_path,
        size,
        mtime,
        checksum,
        snapshot_path,
        message
      FROM file_events
      WHERE id = ?
    `);
  }

  createRun(triggerSource, startedAt) {
    const result = this.insertRunStmt.run(triggerSource, startedAt, "running");
    return Number(result.lastInsertRowid);
  }

  finishRun(runId, details) {
    this.finishRunStmt.run(
      details.finishedAt,
      details.status,
      details.discoveredFiles,
      details.newFiles,
      details.changedFiles,
      details.deletedFiles,
      details.downloadedFiles,
      details.snapshotDir,
      details.message,
      runId
    );
  }

  updateRunProgress(runId, details) {
    this.updateRunProgressStmt.run(
      details.discoveredFiles,
      details.newFiles,
      details.changedFiles,
      details.deletedFiles,
      details.downloadedFiles,
      details.message,
      runId
    );
  }

  failRunningRuns(finishedAt, message) {
    this.failRunningRunsStmt.run(finishedAt, message);
  }

  getKnownFilesMap() {
    const rows = this.selectKnownFilesStmt.all();
    return new Map(rows.map((row) => [row.remote_path, row]));
  }

  applySuccessfulScan(runId, scanResult, deletedFiles, finishedAt) {
    this.db.exec("BEGIN");

    try {
      const activePaths = new Set(scanResult.files.map((file) => file.remotePath));
      const existingPaths = this.selectKnownFilesStmt.all().map((row) => row.remote_path);

      for (const remotePath of existingPaths) {
        if (!activePaths.has(remotePath)) {
          this.deleteKnownFileStmt.run(remotePath);
        }
      }

      for (const file of scanResult.files) {
        const syncedAt = file.downloaded ? finishedAt : file.previousLastSyncedAt || null;
        const snapshotPath = file.eventSnapshotPath || null;

        this.upsertKnownFileStmt.run(
          file.remotePath,
          file.fileName,
          file.folderPath,
          file.size,
          file.mtime,
          file.checksum || null,
          file.firstSeenAt,
          finishedAt,
          syncedAt,
          snapshotPath
        );

        this.insertFileEventStmt.run(
          runId,
          finishedAt,
          file.eventType,
          file.remotePath,
          file.fileName,
          file.folderPath,
          file.size,
          file.mtime,
          file.checksum || null,
          snapshotPath,
          file.eventMessage || null
        );
      }

      for (const file of deletedFiles) {
        this.insertFileEventStmt.run(
          runId,
          finishedAt,
          "deleted",
          file.remotePath,
          file.fileName,
          file.folderPath,
          file.size,
          file.mtime,
          file.checksum || null,
          file.snapshotPath || null,
          "File no longer present on the source SFTP."
        );
      }

      this.clearFolderStatsStmt.run();
      for (const stat of scanResult.folderStats) {
        this.insertFolderStatStmt.run(
          stat.folderPath,
          stat.directFileCount,
          stat.totalFileCount,
          finishedAt
        );
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getDashboardData(filters = {}, options = {}) {
    const limit = options.activityLimit || 50;
    const summaryWindowStart = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();

    return {
      summary: this.dashboardSummaryStmt.get(summaryWindowStart, summaryWindowStart),
      recentRuns: this.recentRunsStmt.all(options.runLimit || 20),
      folderStats: this.folderStatsStmt.all(options.folderLimit || 50),
      dailyFolderIntake: options.dailyIntakeRange
        ? this.getDailyFolderIntake(options.dailyIntakeRange.startIso, options.dailyIntakeRange.endIso, options.dailyIntakeLimit || 20)
        : [],
      xmlFolderTabs: this.getXmlFolderTabs(options.xmlFolderLimit || 8, options.xmlDocumentLimit || 15),
      asnHourlyReport: options.asnHourlyRange && options.asnReportFolder && options.timezone
        ? this.getHourlyFolderIntake(options.asnReportFolder, options.asnHourlyRange.startIso, options.asnHourlyRange.endIso, options.timezone)
        : null,
      dailyFolderTrend: options.dailyTrendRange && options.timezone
        ? this.getDailyFolderTrend(options.dailyTrendRange.startIso, options.dailyTrendRange.endIso, options.dailyTrendRange.dayLabels || [], options.timezone)
        : null,
      activitySummary: this.getFileEventSummary(filters),
      fileActivity: this.listFileEvents(filters, limit)
    };
  }

  getDesktopOpsData(options = {}) {
    const timezone = options.timezone || "America/New_York";
    const dayRange = options.dayRange;
    const compareRange = options.compareRange || null;

    if (!dayRange) {
      return null;
    }

    const currentLocalDayLabel = getLocalDateLabel(new Date().toISOString(), timezone);
    const isToday = dayRange.label === currentLocalDayLabel;
    const referenceIso = isToday ? new Date().toISOString() : dayRange.endIso;
    const dayEvents = this.opsFlowEventsStmt.all(dayRange.startIso, dayRange.endIso);
    const compareEvents = compareRange
      ? this.opsFlowEventsStmt.all(compareRange.startIso, compareRange.endIso)
      : [];
    const dayDocuments = this.opsXmlDocumentsInRangeStmt.all(dayRange.startIso, dayRange.endIso);
    const timelineDocuments = this.opsXmlDocumentsThroughStmt.all(dayRange.endIso);
    const latestRun = this.recentRunsStmt.all(1)[0] || null;
    const folderStats = this.folderStatsStmt.all(options.folderLimit || 12);

    const flow = this.buildHourlyStageFlow(dayEvents, timezone);
    const compareFlow = this.buildHourlyStageFlow(compareEvents, timezone);
    const stageTotals = this.summarizeStageTotals(flow.rows);
    const compareStageTotals = this.summarizeStageTotals(compareFlow.rows);
    const funnel = this.buildFunnel(stageTotals);
    const cumulative = this.buildCumulativePace(flow.rows, compareFlow.rows);
    const folderLoad = this.buildFolderLoad(dayEvents);
    const customerLoad = this.buildCustomerLoad(dayDocuments);
    const timeline = this.buildOrderTimeline(timelineDocuments);
    const backlog = this.buildBacklog(timeline, referenceIso);
    const hourNow = isToday ? getLocalHourOfDay(new Date().toISOString(), timezone) : null;
    const currentHourRow = hourNow === null ? null : flow.rows[hourNow];
    const peakHour = flow.summary.peakHourLabel
      ? flow.rows.find((row) => row.hour_label === flow.summary.peakHourLabel) || null
      : null;
    const syncHealth = {
      latestRun,
      trackedFiles: this.getTrackedFileEstimate(),
      trackedFolders: folderStats.length,
      currentRunStatus: latestRun?.status || "idle"
    };

    return {
      dateLabel: dayRange.label,
      compareDateLabel: compareRange?.label || "",
      isToday,
      flow,
      compareFlow,
      stageTotals,
      compareStageTotals,
      funnel,
      cumulative,
      folderLoad,
      customerLoad,
      backlog,
      syncHealth,
      kpis: {
        totalNewFiles: flow.summary.totalFiles,
        orders: stageTotals.orders?.count || 0,
        asn: stageTotals.asn?.count || 0,
        receipt: stageTotals.receipt?.count || 0,
        returns: stageTotals.returns?.count || 0,
        activeFolders: flow.summary.activeFolders,
        openBacklog: backlog.summary.awaitingAsn + backlog.summary.awaitingReceipt,
        oldestAgeHours: backlog.summary.oldestAgeHours,
        currentHourFiles: currentHourRow?.total || 0,
        currentHourLabel: currentHourRow?.hour_label || "",
        peakHourFiles: peakHour?.total || 0,
        peakHourLabel: peakHour?.hour_label || "",
        compareOrdersDelta: (stageTotals.orders?.count || 0) - (compareStageTotals.orders?.count || 0),
        compareAsnDelta: (stageTotals.asn?.count || 0) - (compareStageTotals.asn?.count || 0),
        compareReceiptDelta: (stageTotals.receipt?.count || 0) - (compareStageTotals.receipt?.count || 0)
      }
    };
  }

  listFileEvents(filters = {}, limit = 50) {
    const { whereSql, params } = this.buildFileEventFilters(filters);
    const statement = this.db.prepare(`
      SELECT
        id,
        run_id,
        event_at,
        event_type,
        remote_path,
        file_name,
        folder_path,
        size,
        mtime,
        checksum,
        snapshot_path,
        message
      FROM file_events
      ${whereSql}
      ORDER BY event_at DESC, id DESC
      LIMIT ?
    `);

    return statement.all(...params, limit);
  }

  getFileEventSummary(filters = {}) {
    const { whereSql, params } = this.buildFileEventFilters(filters);
    const rows = this.db.prepare(`
      SELECT
        event_type,
        COUNT(*) AS total
      FROM file_events
      ${whereSql}
      GROUP BY event_type
    `).all(...params);

    const summary = {
      total: 0,
      new: 0,
      changed: 0,
      unchanged: 0,
      deleted: 0
    };

    for (const row of rows) {
      summary.total += row.total;
      if (summary[row.event_type] !== undefined) {
        summary[row.event_type] = row.total;
      }
    }

    return summary;
  }

  getFileEventsForCsv(filters = {}, limit = 10000) {
    return this.listFileEvents(filters, limit);
  }

  getRunRowsForCsv(limit = 1000) {
    return this.recentRunsStmt.all(limit);
  }

  getFileEventById(id) {
    return this.fileEventByIdStmt.get(id);
  }

  getFileEventIdBySnapshotPath(snapshotPath) {
    return this.fileEventIdBySnapshotPathStmt.get(snapshotPath)?.id || null;
  }

  upsertXmlDocument(document) {
    this.db.exec("BEGIN");

    try {
      const row = this.upsertXmlDocumentStmt.get(
        document.fileEventId,
        document.runId,
        document.folderPath,
        document.remotePath,
        document.fileName,
        document.snapshotPath,
        document.documentType,
        document.recordKey,
        document.orderNumber,
        document.orderDate,
        document.shipTo,
        document.customerName,
        document.itemCount,
        document.totalQty,
        document.itemPreview,
        document.parseStatus,
        document.parseMessage,
        document.parsedAt
      );

      const documentId = row.id;
      this.deleteXmlDocumentItemsStmt.run(documentId);

      for (const item of document.items || []) {
        this.insertXmlDocumentItemStmt.run(
          documentId,
          item.lineNumber,
          item.itemCode || null,
          item.description || null,
          item.quantityValue,
          item.quantityText || null,
          item.uom || null
        );
      }

      this.db.exec("COMMIT");
      return documentId;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getTrackedFileEstimate() {
    const row = this.trackedFileEstimateStmt.get();
    return row?.tracked_files || 0;
  }

  getDailyFolderIntake(startIso, endIso, limit = 20) {
    return this.dailyFolderIntakeStmt.all(startIso, endIso, limit);
  }

  getHourlyFolderIntake(folderPath, startIso, endIso, timezone) {
    const rows = this.folderDayNewEventsStmt.all(folderPath, startIso, endIso);
    const hourlyRows = Array.from({ length: 24 }, (_, hour) => ({
      hour24: hour,
      hour_label: formatHourWindowLabel(hour),
      added_count: 0,
      added_bytes: 0,
      first_event_at: null,
      last_event_at: null,
      is_peak: false
    }));

    for (const row of rows) {
      const hour = getLocalHourOfDay(row.event_at, timezone);
      const bucket = hourlyRows[hour];
      bucket.added_count += 1;
      bucket.added_bytes += Number(row.size || 0);
      bucket.first_event_at = bucket.first_event_at || row.event_at;
      bucket.last_event_at = row.event_at;
    }

    const totalAdded = hourlyRows.reduce((sum, row) => sum + row.added_count, 0);
    const totalBytes = hourlyRows.reduce((sum, row) => sum + row.added_bytes, 0);
    const activeHours = hourlyRows.filter((row) => row.added_count > 0).length;
    const peakCount = Math.max(...hourlyRows.map((row) => row.added_count), 0);
    const peakHour = peakCount > 0
      ? hourlyRows.find((row) => row.added_count === peakCount)
      : null;

    for (const row of hourlyRows) {
      row.is_peak = peakCount > 0 && row.added_count === peakCount;
    }

    return {
      folderPath,
      rows: hourlyRows,
      summary: {
        totalAdded,
        totalBytes,
        activeHours,
        peakCount,
        peakHourLabel: peakHour ? peakHour.hour_label : ""
      }
    };
  }

  getDailyFolderTrend(startIso, endIso, dayLabels, timezone) {
    const rows = this.dailyTrendEventsStmt.all(startIso, endIso);
    const dayBuckets = new Map(
      dayLabels.map((label) => [
        label,
        {
          label,
          totalAdded: 0,
          totalBytes: 0,
          items: [],
          folderMap: new Map()
        }
      ])
    );
    const distinctFolders = new Set();

    for (const row of rows) {
      const dayLabel = getLocalDateLabel(row.event_at, timezone);
      const bucket = dayBuckets.get(dayLabel);
      if (!bucket) {
        continue;
      }

      const folderPath = row.folder_path;
      const addedBytes = Number(row.size || 0);
      const existing = bucket.folderMap.get(folderPath) || {
        folder_path: folderPath,
        added_count: 0,
        added_bytes: 0
      };

      existing.added_count += 1;
      existing.added_bytes += addedBytes;
      bucket.folderMap.set(folderPath, existing);
      bucket.totalAdded += 1;
      bucket.totalBytes += addedBytes;
      distinctFolders.add(folderPath);
    }

    const days = dayLabels.map((label) => {
      const bucket = dayBuckets.get(label) || {
        label,
        totalAdded: 0,
        totalBytes: 0,
        items: [],
        folderMap: new Map()
      };
      const items = Array.from(bucket.folderMap.values())
        .sort((left, right) => right.added_count - left.added_count || left.folder_path.localeCompare(right.folder_path));

      return {
        label,
        totalAdded: bucket.totalAdded,
        totalBytes: bucket.totalBytes,
        activeFolders: items.length,
        items
      };
    });

    const peakDay = days.reduce((best, day) => {
      if (!best || day.totalAdded > best.totalAdded) {
        return day;
      }
      return best;
    }, null);

    return {
      days,
      summary: {
        daysTracked: dayLabels.length,
        totalAdded: days.reduce((sum, day) => sum + day.totalAdded, 0),
        totalBytes: days.reduce((sum, day) => sum + day.totalBytes, 0),
        activeFolders: distinctFolders.size,
        peakDayLabel: peakDay?.label || "",
        peakDayCount: peakDay?.totalAdded || 0
      }
    };
  }

  buildHourlyStageFlow(events, timezone) {
    const rows = Array.from({ length: 24 }, (_, hour) => ({
      hour24: hour,
      hour_label: formatHourWindowLabel(hour),
      total: 0,
      total_bytes: 0,
      byStage: {
        orders: 0,
        asn: 0,
        receipt: 0,
        returns: 0,
        "997": 0,
        other: 0
      }
    }));
    const activeFolders = new Set();

    for (const event of events) {
      const hour = getLocalHourOfDay(event.event_at, timezone);
      const stage = classifyOpsStage(event.folder_path);
      const bucket = rows[hour];
      bucket.total += 1;
      bucket.total_bytes += Number(event.size || 0);
      bucket.byStage[stage] += 1;
      activeFolders.add(event.folder_path);
    }

    const peakTotal = Math.max(...rows.map((row) => row.total), 0);
    const peakHour = peakTotal > 0 ? rows.find((row) => row.total === peakTotal) : null;

    return {
      rows,
      summary: {
        totalFiles: events.length,
        activeFolders: activeFolders.size,
        peakHourLabel: peakHour?.hour_label || "",
        peakHourCount: peakHour?.total || 0
      }
    };
  }

  summarizeStageTotals(rows) {
    const totals = {
      orders: { stage: "orders", label: "Orders", count: 0 },
      asn: { stage: "asn", label: "ASN", count: 0 },
      receipt: { stage: "receipt", label: "Receipt", count: 0 },
      returns: { stage: "returns", label: "Returns", count: 0 },
      "997": { stage: "997", label: "997", count: 0 },
      other: { stage: "other", label: "Other", count: 0 }
    };

    for (const row of rows) {
      for (const [stage, count] of Object.entries(row.byStage)) {
        totals[stage].count += count;
      }
    }

    return totals;
  }

  buildFunnel(stageTotals) {
    const stages = ["orders", "asn", "receipt", "returns"];
    const maxCount = Math.max(...stages.map((stage) => stageTotals[stage]?.count || 0), 1);

    return stages.map((stage) => {
      const count = stageTotals[stage]?.count || 0;
      return {
        stage,
        label: formatStageLabel(stage),
        count,
        widthPercent: Math.max(18, Math.round((count / maxCount) * 100))
      };
    });
  }

  buildCumulativePace(dayRows, compareRows) {
    const stageKeys = ["orders", "asn"];
    const result = {
      hours: dayRows.map((row) => row.hour24),
      labels: dayRows.map((row) => row.hour_label),
      today: {},
      compare: {},
      totals: {}
    };

    for (const stage of stageKeys) {
      result.today[stage] = [];
      result.compare[stage] = [];
      result.totals[stage] = {
        today: 0,
        compare: 0
      };

      let dayRunning = 0;
      let compareRunning = 0;

      for (let index = 0; index < dayRows.length; index += 1) {
        dayRunning += dayRows[index].byStage[stage] || 0;
        compareRunning += (compareRows[index]?.byStage?.[stage]) || 0;
        result.today[stage].push(dayRunning);
        result.compare[stage].push(compareRunning);
      }

      result.totals[stage].today = dayRunning;
      result.totals[stage].compare = compareRunning;
    }

    return result;
  }

  buildFolderLoad(events) {
    const folders = new Map();

    for (const event of events) {
      const existing = folders.get(event.folder_path) || {
        folder_path: event.folder_path,
        stage: classifyOpsStage(event.folder_path),
        added_count: 0,
        added_bytes: 0,
        last_event_at: event.event_at
      };

      existing.added_count += 1;
      existing.added_bytes += Number(event.size || 0);
      existing.last_event_at = event.event_at;
      folders.set(event.folder_path, existing);
    }

    return Array.from(folders.values())
      .sort((left, right) => right.added_count - left.added_count || left.folder_path.localeCompare(right.folder_path))
      .slice(0, 12);
  }

  buildCustomerLoad(documents) {
    const customers = new Map();

    for (const document of documents) {
      if (classifyOpsStage(document.folder_path) !== "orders") {
        continue;
      }

      const customerName = document.customer_name || "Unknown customer";
      const existing = customers.get(customerName) || {
        customer_name: customerName,
        order_count: 0,
        total_qty: 0,
        total_items: 0,
        ship_to_count: 0,
        shipTos: new Set(),
        last_parsed_at: document.parsed_at
      };

      existing.order_count += 1;
      existing.total_qty += Number(document.total_qty || 0);
      existing.total_items += Number(document.item_count || 0);
      if (document.ship_to) {
        existing.shipTos.add(document.ship_to);
      }
      existing.ship_to_count = existing.shipTos.size;
      existing.last_parsed_at = document.parsed_at;
      customers.set(customerName, existing);
    }

    return Array.from(customers.values())
      .map((customer) => ({
        customer_name: customer.customer_name,
        order_count: customer.order_count,
        total_qty: customer.total_qty,
        total_items: customer.total_items,
        ship_to_count: customer.ship_to_count,
        last_parsed_at: customer.last_parsed_at
      }))
      .sort((left, right) => right.order_count - left.order_count || right.total_qty - left.total_qty || left.customer_name.localeCompare(right.customer_name))
      .slice(0, 10);
  }

  buildOrderTimeline(documents) {
    const timeline = new Map();

    for (const document of documents) {
      const stage = classifyOpsStage(document.folder_path);
      if (!["orders", "asn", "receipt", "returns"].includes(stage)) {
        continue;
      }

      const documentKey = buildDocumentKey(document);
      if (!documentKey) {
        continue;
      }

      const existing = timeline.get(documentKey) || {
        document_key: documentKey,
        display_key: document.order_number || document.record_key || document.file_name || document.remote_path,
        customer_name: document.customer_name || "",
        ship_to: document.ship_to || "",
        order_date: document.order_date || "",
        item_count: Number(document.item_count || 0),
        total_qty: Number(document.total_qty || 0),
        orders_at: null,
        asn_at: null,
        receipt_at: null,
        returns_at: null
      };

      if (!existing.customer_name && document.customer_name) {
        existing.customer_name = document.customer_name;
      }

      if (!existing.ship_to && document.ship_to) {
        existing.ship_to = document.ship_to;
      }

      if (!existing.order_date && document.order_date) {
        existing.order_date = document.order_date;
      }

      if (stage === "orders") {
        existing.orders_at = existing.orders_at || document.parsed_at;
        existing.item_count = Math.max(existing.item_count, Number(document.item_count || 0));
        existing.total_qty = Math.max(existing.total_qty, Number(document.total_qty || 0));
      } else if (stage === "asn") {
        existing.asn_at = existing.asn_at || document.parsed_at;
      } else if (stage === "receipt") {
        existing.receipt_at = existing.receipt_at || document.parsed_at;
      } else if (stage === "returns") {
        existing.returns_at = existing.returns_at || document.parsed_at;
      }

      timeline.set(documentKey, existing);
    }

    return Array.from(timeline.values());
  }

  buildBacklog(timeline, referenceIso) {
    const referenceMs = new Date(referenceIso).getTime();
    const awaitingAsn = [];
    const awaitingReceipt = [];

    for (const entry of timeline) {
      if (entry.orders_at && !entry.asn_at) {
        awaitingAsn.push(this.createBacklogEntry(entry, "Awaiting ASN", entry.orders_at, referenceMs));
      } else if (entry.asn_at && !entry.receipt_at) {
        awaitingReceipt.push(this.createBacklogEntry(entry, "Awaiting Receipt", entry.asn_at, referenceMs));
      }
    }

    const combined = [...awaitingAsn, ...awaitingReceipt]
      .sort((left, right) => right.ageHours - left.ageHours || left.display_key.localeCompare(right.display_key));
    const oldestAgeHours = combined[0]?.ageHours || 0;

    return {
      summary: {
        awaitingAsn: awaitingAsn.length,
        awaitingReceipt: awaitingReceipt.length,
        oldestAgeHours,
        ageBuckets: this.buildAgeBuckets(combined)
      },
      exceptions: combined.slice(0, 12)
    };
  }

  createBacklogEntry(entry, statusLabel, startedAt, referenceMs) {
    const ageHours = Math.max(0, (referenceMs - new Date(startedAt).getTime()) / (60 * 60 * 1000));

    return {
      display_key: entry.display_key,
      customer_name: entry.customer_name || "Unknown customer",
      ship_to: entry.ship_to || "",
      order_date: entry.order_date || "",
      status_label: statusLabel,
      started_at: startedAt,
      ageHours,
      item_count: entry.item_count,
      total_qty: entry.total_qty
    };
  }

  buildAgeBuckets(entries) {
    const buckets = [
      { label: "0-1 hr", minimum: 0, maximum: 1, count: 0 },
      { label: "1-2 hr", minimum: 1, maximum: 2, count: 0 },
      { label: "2-4 hr", minimum: 2, maximum: 4, count: 0 },
      { label: "4+ hr", minimum: 4, maximum: Number.POSITIVE_INFINITY, count: 0 }
    ];

    for (const entry of entries) {
      const bucket = buckets.find((item) => entry.ageHours >= item.minimum && entry.ageHours < item.maximum);
      if (bucket) {
        bucket.count += 1;
      }
    }

    return buckets;
  }

  getXmlFolderTabs(folderLimit = 8, documentLimit = 15) {
    const folders = this.xmlFolderTabsStmt.all(folderLimit);
    return folders.map((folder, index) => ({
      ...folder,
      tab_id: `folder-tab-${index + 1}`,
      documents: this.xmlDocumentsByFolderStmt.all(folder.folder_path, documentLimit).map((document) => ({
        ...document,
        items: this.xmlDocumentItemsStmt.all(document.id)
      }))
    }));
  }

  getAlertSummary(startIso, endIso) {
    const counts = this.db.prepare(`
      SELECT
        event_type,
        COUNT(*) AS total
      FROM file_events
      WHERE event_at >= ? AND event_at < ?
      GROUP BY event_type
    `).all(startIso, endIso);

    const topFolders = this.db.prepare(`
      SELECT
        folder_path,
        COUNT(*) AS total
      FROM file_events
      WHERE event_at >= ? AND event_at < ? AND event_type IN ('new', 'changed', 'deleted')
      GROUP BY folder_path
      ORDER BY total DESC, folder_path ASC
      LIMIT 5
    `).all(startIso, endIso);

    const runs = this.db.prepare(`
      SELECT
        COUNT(*) AS total_runs,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_runs
      FROM sync_runs
      WHERE started_at >= ? AND started_at < ?
    `).get(startIso, endIso);

    const summary = {
      totalEvents: 0,
      new: 0,
      changed: 0,
      unchanged: 0,
      deleted: 0,
      totalRuns: runs.total_runs || 0,
      failedRuns: runs.failed_runs || 0,
      topFolders
    };

    for (const row of counts) {
      summary.totalEvents += row.total;
      if (summary[row.event_type] !== undefined) {
        summary[row.event_type] = row.total;
      }
    }

    return summary;
  }

  buildFileEventFilters(filters = {}) {
    const conditions = [];
    const params = [];

    if (filters.q) {
      conditions.push("(remote_path LIKE ? OR file_name LIKE ?)");
      params.push(`%${filters.q}%`, `%${filters.q}%`);
    }

    if (filters.status) {
      conditions.push("event_type = ?");
      params.push(filters.status);
    }

    if (filters.folder) {
      conditions.push("folder_path LIKE ?");
      params.push(`%${filters.folder}%`);
    }

    if (filters.runId) {
      conditions.push("run_id = ?");
      params.push(filters.runId);
    }

    if (filters.dateFromIso) {
      conditions.push("event_at >= ?");
      params.push(filters.dateFromIso);
    }

    if (filters.dateToIso) {
      conditions.push("event_at < ?");
      params.push(filters.dateToIso);
    }

    return {
      whereSql: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
      params
    };
  }
}

module.exports = {
  MirrorDatabase
};
