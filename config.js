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

function parseList(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseWeekdays(value) {
  const aliases = new Map([
    ["0", 0],
    ["sun", 0],
    ["sunday", 0],
    ["1", 1],
    ["mon", 1],
    ["monday", 1],
    ["2", 2],
    ["tue", 2],
    ["tues", 2],
    ["tuesday", 2],
    ["3", 3],
    ["wed", 3],
    ["wednesday", 3],
    ["4", 4],
    ["thu", 4],
    ["thur", 4],
    ["thurs", 4],
    ["thursday", 4],
    ["5", 5],
    ["fri", 5],
    ["friday", 5],
    ["6", 6],
    ["sat", 6],
    ["saturday", 6]
  ]);

  const source = value || "MON,TUE,WED,THU,FRI";
  const parsed = source
    .split(",")
    .map((item) => aliases.get(String(item).trim().toLowerCase()))
    .filter((item) => item !== undefined);

  return parsed.length ? Array.from(new Set(parsed)).sort((left, right) => left - right) : [1, 2, 3, 4, 5];
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

function formatTime(hour, minute) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatWeekdays(weekdays) {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return weekdays.map((day) => labels[day]).join(", ");
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
    activityPageSize: Math.min(Math.max(parseNumber(process.env.ACTIVITY_PAGE_SIZE, 50), 10), 250),
    snapshotRetentionDays: Math.max(parseNumber(process.env.SNAPSHOT_RETENTION_DAYS, 0), 0),
    schedule: {
      startHour: parseNumber(process.env.SYNC_START_HOUR, 8),
      endHour: parseNumber(process.env.SYNC_END_HOUR, 16),
      minute: parseNumber(process.env.SYNC_MINUTE, 55),
      weekdays: parseWeekdays(process.env.SYNC_WEEKDAYS)
    },
    alerts: {
      webhookUrl: process.env.ALERT_WEBHOOK_URL || "",
      emailTo: parseList(process.env.ALERT_EMAIL_TO),
      emailFrom: process.env.ALERT_EMAIL_FROM || "",
      smtpHost: process.env.SMTP_HOST || "",
      smtpPort: parseNumber(process.env.SMTP_PORT, 587),
      smtpSecure: parseBoolean(process.env.SMTP_SECURE, false),
      smtpUsername: process.env.SMTP_USERNAME || "",
      smtpPassword: process.env.SMTP_PASSWORD || "",
      dailySummaryEnabled: parseBoolean(process.env.DAILY_SUMMARY_ENABLED, true),
      dailySummaryHour: parseNumber(process.env.DAILY_SUMMARY_HOUR, 17),
      dailySummaryMinute: parseNumber(process.env.DAILY_SUMMARY_MINUTE, 5),
      dailySummarySendWhenEmpty: parseBoolean(process.env.DAILY_SUMMARY_SEND_WHEN_EMPTY, false)
    },
    sftp: {
      host: process.env.SFTP_HOST || "",
      port: parseNumber(process.env.SFTP_PORT, 22),
      readyTimeoutMs: Math.max(parseNumber(process.env.SFTP_READY_TIMEOUT_MS, 20000), 5000),
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
  const emailAlertsConfigured = Boolean(
    config.alerts.emailTo.length &&
    config.alerts.emailFrom &&
    config.alerts.smtpHost
  );
  const alertsConfigured = Boolean(config.alerts.webhookUrl || emailAlertsConfigured);

  return {
    remoteRoot: config.sftp.remoteRoot,
    timezone: config.timezone,
    schedule: `Runs ${formatWeekdays(config.schedule.weekdays)} at :${String(config.schedule.minute).padStart(2, "0")} from ${formatTime(config.schedule.startHour, config.schedule.minute)} through ${formatTime(config.schedule.endHour, config.schedule.minute)}`,
    autoSyncEnabled: config.autoSyncEnabled,
    activityPageSize: config.activityPageSize,
    snapshotRetentionDays: config.snapshotRetentionDays,
    alertsConfigured,
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
