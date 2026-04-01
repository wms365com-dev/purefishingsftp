const http = require("node:http");
const https = require("node:https");
const nodemailer = require("nodemailer");

const { getLocalDayRange, weekdayToIndex } = require("./time");

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const body = JSON.stringify(payload);
    const client = target.protocol === "https:" ? https : http;

    const request = client.request({
      method: "POST",
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(Buffer.concat(chunks).toString("utf8"));
          return;
        }

        reject(new Error(`Webhook request failed with status ${response.statusCode}`));
      });
    });

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

class AlertManager {
  constructor(config, database, logger = console) {
    this.config = config;
    this.database = database;
    this.logger = logger;
    this.lastDailySummaryKey = null;
    this.transporter = this.createTransporter();
  }

  createTransporter() {
    if (!this.config.alerts.smtpHost || !this.config.alerts.emailTo.length || !this.config.alerts.emailFrom) {
      return null;
    }

    return nodemailer.createTransport({
      host: this.config.alerts.smtpHost,
      port: this.config.alerts.smtpPort,
      secure: this.config.alerts.smtpSecure,
      auth: this.config.alerts.smtpUsername
        ? {
            user: this.config.alerts.smtpUsername,
            pass: this.config.alerts.smtpPassword
          }
        : undefined
    });
  }

  hasDestinations() {
    return Boolean(this.config.alerts.webhookUrl || this.transporter);
  }

  async notifyRun(result) {
    if (!this.hasDestinations()) {
      return;
    }

    if (result.status === "failed") {
      await this.sendAlert(
        "sync_failed",
        `SFTP sync failed at ${result.finishedAt}`,
        [
          "The SFTP mirror run failed.",
          `Trigger: ${result.triggerSource}`,
          `Started: ${result.startedAt}`,
          `Finished: ${result.finishedAt}`,
          `Message: ${result.message}`
        ].join("\n"),
        result
      );
      return;
    }

    if (result.downloadedFiles > 0 || result.deletedFiles > 0) {
      await this.sendAlert(
        "sync_activity",
        `SFTP sync captured ${result.downloadedFiles} downloaded and ${result.deletedFiles} deleted files`,
        [
          "The SFTP mirror found activity.",
          `Trigger: ${result.triggerSource}`,
          `New: ${result.newFiles}`,
          `Changed: ${result.changedFiles}`,
          `Deleted: ${result.deletedFiles}`,
          `Downloaded: ${result.downloadedFiles}`,
          `Snapshot: ${result.snapshotDir || "No new snapshot folder"}`
        ].join("\n"),
        result
      );
    }
  }

  async onTick(now) {
    if (!this.hasDestinations() || !this.config.alerts.dailySummaryEnabled) {
      return;
    }

    const weekdayIndex = weekdayToIndex(now.weekday);
    if (!this.config.schedule.weekdays.includes(weekdayIndex)) {
      return;
    }

    if (
      now.hour !== this.config.alerts.dailySummaryHour ||
      now.minute !== this.config.alerts.dailySummaryMinute
    ) {
      return;
    }

    const slotKey = `${now.year}-${String(now.month).padStart(2, "0")}-${String(now.day).padStart(2, "0")}T${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`;
    if (slotKey === this.lastDailySummaryKey) {
      return;
    }

    this.lastDailySummaryKey = slotKey;
    const range = getLocalDayRange(
      `${now.year}-${String(now.month).padStart(2, "0")}-${String(now.day).padStart(2, "0")}`,
      this.config.timezone
    );
    const summary = this.database.getAlertSummary(range.startIso, range.endIso);

    if (!this.config.alerts.dailySummarySendWhenEmpty && summary.totalEvents === 0 && summary.failedRuns === 0) {
      return;
    }

    const topFolders = summary.topFolders.length
      ? summary.topFolders.map((folder) => `${folder.folder_path}: ${folder.total}`).join("\n")
      : "No file activity";

    await this.sendAlert(
      "daily_summary",
      `SFTP daily summary for ${range.label}`,
      [
        `Date: ${range.label}`,
        `Runs: ${summary.totalRuns}`,
        `Failed runs: ${summary.failedRuns}`,
        `New files: ${summary.new}`,
        `Changed files: ${summary.changed}`,
        `Deleted files: ${summary.deleted}`,
        `Unchanged records: ${summary.unchanged}`,
        "Top folders:",
        topFolders
      ].join("\n"),
      {
        date: range.label,
        summary
      }
    );
  }

  async sendAlert(type, subject, text, payload) {
    const tasks = [];

    if (this.config.alerts.webhookUrl) {
      tasks.push(postJson(this.config.alerts.webhookUrl, { type, subject, text, payload }));
    }

    if (this.transporter) {
      tasks.push(this.transporter.sendMail({
        from: this.config.alerts.emailFrom,
        to: this.config.alerts.emailTo.join(", "),
        subject,
        text
      }));
    }

    const results = await Promise.allSettled(tasks);
    for (const result of results) {
      if (result.status === "rejected") {
        this.logger.error("Alert delivery failed:", result.reason);
      }
    }
  }
}

module.exports = {
  AlertManager
};

