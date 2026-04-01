const crypto = require("node:crypto");
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const path = require("node:path");
const pathPosix = require("node:path/posix");
const SftpClient = require("ssh2-sftp-client");

function toIsoString(date = new Date()) {
  return date.toISOString();
}

function formatSnapshotPathParts(date = new Date()) {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const time = [
    String(date.getUTCHours()).padStart(2, "0"),
    String(date.getUTCMinutes()).padStart(2, "0"),
    String(date.getUTCSeconds()).padStart(2, "0")
  ].join("");

  return [year, month, day, time];
}

function normalizeRemotePath(remotePath) {
  if (!remotePath || remotePath === ".") {
    return "/";
  }

  let normalized = remotePath.replace(/\\/g, "/");
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  normalized = normalized.replace(/\/+$/, "");
  return normalized || "/";
}

function joinRemote(parent, childName) {
  if (parent === "/") {
    return normalizeRemotePath(`/${childName}`);
  }

  return normalizeRemotePath(`${parent}/${childName}`);
}

function relativeRemotePath(root, target) {
  const normalizedRoot = normalizeRemotePath(root);
  const normalizedTarget = normalizeRemotePath(target);

  if (normalizedRoot === "/") {
    return normalizedTarget.replace(/^\/+/, "");
  }

  return pathPosix.relative(normalizedRoot, normalizedTarget);
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function listDirectories(rootPath) {
  try {
    const entries = await fsPromises.readdir(rootPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function withTimeout(promise, timeoutMs, label) {
  let timeoutHandle = null;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs} ms`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

class SftpMirrorService {
  constructor(config, database, logger = console, options = {}) {
    this.config = config;
    this.database = database;
    this.logger = logger;
    this.alertManager = options.alertManager || null;
    this.runningPromise = null;
    this.runningContext = null;
    this.queuedTriggerSource = null;
  }

  getState() {
    return {
      running: Boolean(this.runningPromise),
      currentRun: this.runningContext,
      queuedTriggerSource: this.queuedTriggerSource
    };
  }

  startBackgroundSync(triggerSource) {
    if (this.runningPromise) {
      return false;
    }

    const startedAt = toIsoString();
    const estimatedTotalFiles = this.database.getTrackedFileEstimate();
    this.runningContext = {
      triggerSource,
      startedAt,
      phase: "queued",
      currentPath: "",
      discoveredFiles: 0,
      estimatedTotalFiles,
      totalFiles: 0,
      processedFiles: 0,
      newFiles: 0,
      changedFiles: 0,
      deletedFiles: 0,
      downloadedFiles: 0,
      percentComplete: 0,
      etaSeconds: null,
      lastCompletedPath: "",
      lastCompletedEvent: "",
      lastCompletedAt: null,
      queuedTriggerSource: this.queuedTriggerSource,
      message: "Queued to start..."
    };
    this.runningPromise = this.runSync(triggerSource, startedAt)
      .catch((error) => {
        this.logger.error("Sync failed:", error);
      })
      .finally(() => {
        const queuedTriggerSource = this.queuedTriggerSource;
        this.queuedTriggerSource = null;
        this.runningPromise = null;
        this.runningContext = null;

        if (queuedTriggerSource) {
          this.logger.log(`Starting queued ${queuedTriggerSource} sync after the previous run completed.`);
          this.startBackgroundSync(queuedTriggerSource);
        }
      });

    return true;
  }

  queueBackgroundSync(triggerSource) {
    if (!this.runningPromise) {
      return this.startBackgroundSync(triggerSource);
    }

    if (this.queuedTriggerSource) {
      return false;
    }

    this.queuedTriggerSource = triggerSource;
    if (this.runningContext) {
      this.runningContext = {
        ...this.runningContext,
        queuedTriggerSource: triggerSource
      };
    }

    return true;
  }

  async runSync(triggerSource, startedAt) {
    const runId = this.database.createRun(triggerSource, startedAt);
    const sftp = new SftpClient("purefishing-sftp-mirror");
    let runResult = null;
    const estimatedTotalFiles = this.database.getTrackedFileEstimate();
    const progress = {
      runId,
      triggerSource,
      startedAt,
      phase: "starting",
      currentPath: "",
      discoveredFiles: 0,
      estimatedTotalFiles,
      totalFiles: 0,
      processedFiles: 0,
      newFiles: 0,
      changedFiles: 0,
      deletedFiles: 0,
      downloadedFiles: 0,
      percentComplete: 0,
      etaSeconds: null,
      lastCompletedPath: "",
      lastCompletedEvent: "",
      lastCompletedAt: null,
      message: "Preparing sync..."
    };

    try {
      this.updateProgress(runId, progress, {
        phase: "connecting",
        message: `Connecting to ${this.config.sftp.host}:${this.config.sftp.port} with a ${Math.round(this.config.sftp.readyTimeoutMs / 1000)} second timeout...`
      });
      await withTimeout(
        sftp.connect(this.buildConnectionOptions()),
        this.config.sftp.readyTimeoutMs,
        `Connection to ${this.config.sftp.host}:${this.config.sftp.port}`
      );
      this.updateProgress(runId, progress, {
        phase: "scanning",
        currentPath: this.config.sftp.remoteRoot,
        message: `Scanning ${this.config.sftp.remoteRoot}...`
      });
      const discovered = await this.scanDirectory(sftp, this.config.sftp.remoteRoot, {
        onDirectory: (remotePath) => {
          this.updateProgress(runId, progress, {
            phase: "scanning",
            currentPath: remotePath,
            message: `Scanning ${remotePath}...`
          });
        },
        onFile: () => {
          this.updateProgress(runId, progress, {
            discoveredFiles: progress.discoveredFiles + 1,
            message: progress.currentPath
              ? `Scanning ${progress.currentPath}... ${progress.discoveredFiles + 1} file(s) discovered`
              : `Scanning... ${progress.discoveredFiles + 1} file(s) discovered`
          });
        }
      });
      const knownFiles = this.database.getKnownFilesMap();
      const discoveredPaths = new Set(discovered.files.map((file) => file.remotePath));
      const deletedFiles = [];
      const finishedAt = toIsoString();

      for (const [remotePath, existing] of knownFiles.entries()) {
        if (!discoveredPaths.has(remotePath)) {
          deletedFiles.push({
            remotePath,
            fileName: existing.file_name || pathPosix.basename(remotePath),
            folderPath: existing.folder_path,
            size: existing.size,
            mtime: existing.mtime,
            checksum: existing.checksum,
            snapshotPath: existing.last_snapshot_path
          });
        }
      }

      this.updateProgress(runId, progress, {
        phase: "comparing",
        totalFiles: discovered.files.length,
        deletedFiles: deletedFiles.length,
        message: `Scan complete. ${discovered.files.length} file(s) discovered, ${deletedFiles.length} deletion(s) detected.`
      });

      let snapshotDir = null;

      for (const file of discovered.files) {
        const existing = knownFiles.get(file.remotePath);
        file.firstSeenAt = existing ? existing.first_seen_at : startedAt;
        file.previousLastSyncedAt = existing ? existing.last_synced_at : null;
        file.previousSnapshotPath = existing ? existing.last_snapshot_path : null;
        file.checksum = existing ? existing.checksum : null;

        const changed = !existing || existing.size !== file.size || existing.mtime !== file.mtime;

        if (!existing) {
          file.eventType = "new";
          file.eventMessage = "File discovered for the first time.";
          this.updateProgress(runId, progress, {
            newFiles: progress.newFiles + 1
          });
        } else if (changed) {
          file.eventType = "changed";
          file.eventMessage = "File content or metadata changed on the source SFTP.";
          this.updateProgress(runId, progress, {
            changedFiles: progress.changedFiles + 1
          });
        } else {
          file.eventType = "unchanged";
          file.eventMessage = "File unchanged since the previous successful scan.";
        }

        if (!changed) {
          file.downloaded = false;
          file.eventSnapshotPath = existing ? existing.last_snapshot_path : null;
          this.updateProgress(runId, progress, {
            processedFiles: progress.processedFiles + 1,
            lastCompletedPath: file.remotePath,
            lastCompletedEvent: file.eventType,
            lastCompletedAt: toIsoString(),
            message: `Processed ${progress.processedFiles + 1} of ${progress.totalFiles || progress.discoveredFiles} files. Latest: ${file.remotePath}`
          });
          continue;
        }

        if (!snapshotDir) {
          snapshotDir = path.join(this.config.snapshotsRoot, ...formatSnapshotPathParts(new Date(startedAt)));
        }

        const relativePath = relativeRemotePath(this.config.sftp.remoteRoot, file.remotePath);
        const localPath = path.join(snapshotDir, ...relativePath.split("/").filter(Boolean));
        this.updateProgress(runId, progress, {
          phase: "downloading",
          currentPath: file.remotePath,
          message: `Downloading ${file.remotePath}...`
        });
        await fsPromises.mkdir(path.dirname(localPath), { recursive: true });
        await sftp.get(file.remotePath, localPath);
        file.downloaded = true;
        file.eventSnapshotPath = localPath;
        file.checksum = await hashFile(localPath);
        this.updateProgress(runId, progress, {
          processedFiles: progress.processedFiles + 1,
          downloadedFiles: progress.downloadedFiles + 1,
          lastCompletedPath: file.remotePath,
          lastCompletedEvent: file.eventType,
          lastCompletedAt: toIsoString(),
          message: `Downloaded ${progress.downloadedFiles + 1} file(s). Latest: ${file.remotePath}`
        });
      }

      this.updateProgress(runId, progress, {
        phase: "finalizing",
        message: "Writing audit history and finishing the sync..."
      });
      this.database.applySuccessfulScan(runId, discovered, deletedFiles, finishedAt);
      const retention = await this.pruneSnapshots();
      runResult = {
        runId,
        triggerSource,
        startedAt,
        finishedAt,
        status: "success",
        discoveredFiles: discovered.files.length,
        newFiles: progress.newFiles,
        changedFiles: progress.changedFiles,
        deletedFiles: deletedFiles.length,
        downloadedFiles: progress.downloadedFiles,
        snapshotDir,
        message: this.buildRunMessage(progress.downloadedFiles, deletedFiles.length, retention.prunedSnapshotFolders),
        retention
      };

      this.database.finishRun(runId, runResult);
      await this.notifyAlerts(runResult);
      return runResult;
    } catch (error) {
      const finishedAt = toIsoString();
      runResult = {
        runId,
        triggerSource,
        startedAt,
        finishedAt,
        status: "failed",
        discoveredFiles: 0,
        newFiles: 0,
        changedFiles: 0,
        deletedFiles: 0,
        downloadedFiles: 0,
        snapshotDir: null,
        message: error.message
      };

      this.database.finishRun(runId, runResult);
      await this.notifyAlerts(runResult);
      throw error;
    } finally {
      await sftp.end().catch(() => {});
    }
  }

  buildRunMessage(downloadedFiles, deletedFiles, prunedSnapshotFolders) {
    const parts = [];
    parts.push(downloadedFiles ? `Downloaded ${downloadedFiles} file(s).` : "No new or changed files found.");

    if (deletedFiles > 0) {
      parts.push(`Detected ${deletedFiles} deletion(s) on the source SFTP.`);
    }

    if (prunedSnapshotFolders > 0) {
      parts.push(`Pruned ${prunedSnapshotFolders} expired snapshot folder(s).`);
    }

    return parts.join(" ");
  }

  async notifyAlerts(runResult) {
    if (!this.alertManager) {
      return;
    }

    try {
      await this.alertManager.notifyRun(runResult);
    } catch (error) {
      this.logger.error("Alert notification failed:", error);
    }
  }

  buildConnectionOptions() {
    const options = {
      host: this.config.sftp.host,
      port: this.config.sftp.port,
      readyTimeout: this.config.sftp.readyTimeoutMs,
      username: this.config.sftp.username
    };

    if (this.config.sftp.password) {
      options.password = this.config.sftp.password;
    }

    if (this.config.sftp.privateKey) {
      options.privateKey = this.config.sftp.privateKey;
    }

    if (this.config.sftp.passphrase) {
      options.passphrase = this.config.sftp.passphrase;
    }

    return options;
  }

  async pruneSnapshots() {
    if (!this.config.snapshotRetentionDays) {
      return { prunedSnapshotFolders: 0 };
    }

    const retentionCutoff = Date.now() - (this.config.snapshotRetentionDays * 24 * 60 * 60 * 1000);
    let prunedSnapshotFolders = 0;

    for (const year of await listDirectories(this.config.snapshotsRoot)) {
      for (const month of await listDirectories(path.join(this.config.snapshotsRoot, year))) {
        for (const day of await listDirectories(path.join(this.config.snapshotsRoot, year, month))) {
          for (const time of await listDirectories(path.join(this.config.snapshotsRoot, year, month, day))) {
            if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day) || !/^\d{6}$/.test(time)) {
              continue;
            }

            const snapshotDate = Date.UTC(
              Number(year),
              Number(month) - 1,
              Number(day),
              Number(time.slice(0, 2)),
              Number(time.slice(2, 4)),
              Number(time.slice(4, 6))
            );

            if (snapshotDate >= retentionCutoff) {
              continue;
            }

            const targetPath = path.join(this.config.snapshotsRoot, year, month, day, time);
            await fsPromises.rm(targetPath, { recursive: true, force: true });
            prunedSnapshotFolders += 1;
          }
        }
      }
    }

    return { prunedSnapshotFolders };
  }

  updateProgress(runId, progress, patch) {
    Object.assign(progress, patch);
    this.deriveProgress(progress);
    progress.queuedTriggerSource = this.queuedTriggerSource;
    this.runningContext = { ...progress };
    this.database.updateRunProgress(runId, progress);
  }

  deriveProgress(progress) {
    const elapsedSeconds = Math.max(0, (Date.now() - new Date(progress.startedAt).getTime()) / 1000);
    let percentComplete = progress.percentComplete || 0;

    if (progress.phase === "queued") {
      percentComplete = 0;
    } else if (progress.phase === "starting") {
      percentComplete = 1;
    } else if (progress.phase === "connecting") {
      percentComplete = 3;
    } else if (progress.phase === "scanning") {
      if (progress.estimatedTotalFiles > 0) {
        percentComplete = Math.max(
          5,
          Math.min(45, Math.round(5 + (progress.discoveredFiles / progress.estimatedTotalFiles) * 40))
        );
      } else {
        percentComplete = progress.discoveredFiles > 0 ? 12 : 5;
      }
    } else if (progress.phase === "comparing" || progress.phase === "downloading") {
      const totalFiles = Math.max(progress.totalFiles || progress.discoveredFiles || progress.estimatedTotalFiles || 0, 1);
      percentComplete = Math.max(
        45,
        Math.min(96, Math.round(45 + (progress.processedFiles / totalFiles) * 51))
      );
    } else if (progress.phase === "finalizing") {
      percentComplete = 98;
    }

    progress.percentComplete = percentComplete;

    if (percentComplete > 0 && percentComplete < 100 && elapsedSeconds >= 5) {
      progress.etaSeconds = Math.max(0, Math.round((elapsedSeconds * (100 - percentComplete)) / percentComplete));
    } else {
      progress.etaSeconds = null;
    }
  }

  async scanDirectory(sftp, remoteDir, hooks = {}) {
    const normalizedRemoteDir = normalizeRemotePath(remoteDir);
    if (typeof hooks.onDirectory === "function") {
      hooks.onDirectory(normalizedRemoteDir);
    }

    const entries = await sftp.list(normalizedRemoteDir);
    const files = [];
    const folderStats = [];
    let directFileCount = 0;
    let totalFileCount = 0;

    for (const entry of entries) {
      const entryPath = joinRemote(normalizedRemoteDir, entry.name);

      if (entry.type === "d" || entry.type === "l") {
        try {
          const nested = await this.scanDirectory(sftp, entryPath, hooks);
          files.push(...nested.files);
          folderStats.push(...nested.folderStats);
          totalFileCount += nested.totalFileCount;
          continue;
        } catch (error) {
          if (entry.type === "d") {
            throw error;
          }
        }
      }

      if (entry.type !== "-") {
        continue;
      }

      directFileCount += 1;
      totalFileCount += 1;
      if (typeof hooks.onFile === "function") {
        hooks.onFile(entryPath);
      }
      files.push({
        remotePath: entryPath,
        fileName: entry.name,
        folderPath: normalizedRemoteDir,
        size: Number(entry.size || 0),
        mtime: Number(entry.modifyTime || 0),
        checksum: null,
        downloaded: false,
        eventSnapshotPath: null,
        eventType: "unchanged",
        eventMessage: "",
        firstSeenAt: null,
        previousLastSyncedAt: null,
        previousSnapshotPath: null
      });
    }

    folderStats.push({
      folderPath: normalizedRemoteDir,
      directFileCount,
      totalFileCount
    });

    return {
      files,
      folderStats,
      totalFileCount
    };
  }
}

module.exports = {
  SftpMirrorService
};
