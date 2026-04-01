const path = require("node:path");

function parseNumber(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function parsePrivateKey() {
  if (process.env.SFTP_PRIVATE_KEY_BASE64) {
    return Buffer.from(process.env.SFTP_PRIVATE_KEY_BASE64, "base64").toString("utf8");
  }

  if (process.env.SFTP_PRIVATE_KEY) {
    return process.env.SFTP_PRIVATE_KEY.replace(/\\n/g, "\n");
  }

  return null;
}

function normalizeRemoteRoot(remoteRoot) {
  if (!remoteRoot || remoteRoot === ".") {
    return "/";
  }

  let normalized = remoteRoot.replace(/\\/g, "/");
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  normalized = normalized.replace(/\/+$/, "");
  return normalized || "/";
}

function loadConfig() {
  const dataRoot = path.resolve(process.env.DATA_ROOT || path.join(process.cwd(), "data"));

  return {
    port: parseNumber(process.env.PORT, 3000),
    dataRoot,
    databasePath: path.join(dataRoot, "mirror.db"),
    snapshotsRoot: path.join(dataRoot, "snapshots"),
    timezone: process.env.APP_TIMEZONE || "America/New_York",
    autoSyncEnabled: parseBoolean(process.env.AUTO_SYNC_ENABLED, true),
    schedule: {
      startHour: parseNumber(process.env.SYNC_START_HOUR, 8),
      endHour: parseNumber(process.env.SYNC_END_HOUR, 17),
      minute: parseNumber(process.env.SYNC_MINUTE, 55)
    },
    sftp: {
      host: process.env.SFTP_HOST || "",
      port: parseNumber(process.env.SFTP_PORT, 22),
      username: process.env.SFTP_USERNAME || "",
      password: process.env.SFTP_PASSWORD || "",
      privateKey: parsePrivateKey(),
      passphrase: process.env.SFTP_PASSPHRASE || "",
      remoteRoot: normalizeRemoteRoot(process.env.REMOTE_ROOT || "/")
    }
  };
}

function validateConfig(config) {
  const missing = [];

  if (!config.sftp.host) {
    missing.push("SFTP_HOST");
  }

  if (!config.sftp.username) {
    missing.push("SFTP_USERNAME");
  }

  if (!config.sftp.password && !config.sftp.privateKey) {
    missing.push("SFTP_PASSWORD or SFTP_PRIVATE_KEY");
  }

  return missing;
}

function getPublicConfig(config) {
  return {
    remoteRoot: config.sftp.remoteRoot,
    timezone: config.timezone,
    schedule: `${String(config.schedule.minute).padStart(2, "0")} past hour ${config.schedule.startHour}:00-${config.schedule.endHour}:59`,
    autoSyncEnabled: config.autoSyncEnabled,
    sftpHost: config.sftp.host,
    sftpPort: config.sftp.port,
    authMode: config.sftp.privateKey ? "private key" : "password"
  };
}

module.exports = {
  getPublicConfig,
  loadConfig,
  validateConfig
};

