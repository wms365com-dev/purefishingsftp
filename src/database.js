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
        folder_path TEXT NOT NULL,
        size INTEGER NOT NULL,
        mtime INTEGER NOT NULL,
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
        downloaded_files INTEGER NOT NULL DEFAULT 0,
        snapshot_dir TEXT,
        message TEXT
      );
    `);
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
        downloaded_files = ?,
        snapshot_dir = ?,
        message = ?
      WHERE id = ?
    `);

    this.selectKnownFilesStmt = this.db.prepare(`
      SELECT
        remote_path,
        folder_path,
        size,
        mtime,
        first_seen_at,
        last_seen_at,
        last_synced_at,
        last_snapshot_path
      FROM known_files
    `);

    this.upsertKnownFileStmt = this.db.prepare(`
      INSERT INTO known_files (
        remote_path,
        folder_path,
        size,
        mtime,
        first_seen_at,
        last_seen_at,
        last_synced_at,
        last_snapshot_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(remote_path) DO UPDATE SET
        folder_path = excluded.folder_path,
        size = excluded.size,
        mtime = excluded.mtime,
        last_seen_at = excluded.last_seen_at,
        last_synced_at = excluded.last_synced_at,
        last_snapshot_path = excluded.last_snapshot_path
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

    this.dashboardSummaryStmt = this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM known_files) AS tracked_files,
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
        ) AS last_run_at
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

  applySuccessfulScan(scanResult, finishedAt) {
    this.db.exec("BEGIN");

    try {
      for (const file of scanResult.files) {
        const syncedAt = file.downloaded ? finishedAt : file.previousLastSyncedAt || null;
        const snapshotPath = file.downloaded ? file.snapshotPath : file.previousSnapshotPath || null;

        this.upsertKnownFileStmt.run(
          file.remotePath,
          file.folderPath,
          file.size,
          file.mtime,
          file.firstSeenAt,
          finishedAt,
          syncedAt,
          snapshotPath
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

  getDashboardData(limit = 50) {
    const summary = this.dashboardSummaryStmt.get();
    const recentRuns = this.recentRunsStmt.all(limit);
    const folderStats = this.folderStatsStmt.all(limit);
    return { summary, recentRuns, folderStats };
  }
}

module.exports = {
  MirrorDatabase
};

