const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

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

      CREATE INDEX IF NOT EXISTS idx_file_events_event_at ON file_events(event_at DESC);
      CREATE INDEX IF NOT EXISTS idx_file_events_event_type ON file_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_file_events_folder_path ON file_events(folder_path);
      CREATE INDEX IF NOT EXISTS idx_file_events_remote_path ON file_events(remote_path);
      CREATE INDEX IF NOT EXISTS idx_file_events_run_id ON file_events(run_id);
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
      activitySummary: this.getFileEventSummary(filters),
      fileActivity: this.listFileEvents(filters, limit)
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

