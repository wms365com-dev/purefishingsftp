const { getZonedParts, weekdayToIndex } = require("./time");

class SyncScheduler {
  constructor(service, config, logger = console, hooks = {}) {
    this.service = service;
    this.config = config;
    this.logger = logger;
    this.hooks = hooks;
    this.intervalHandle = null;
    this.lastSlotKey = null;
  }

  start() {
    if (!this.config.autoSyncEnabled) {
      this.logger.log("Automatic sync is disabled.");
      return;
    }

    this.tick();
    this.intervalHandle = setInterval(() => this.tick(), 15_000);
    this.logger.log("Automatic sync scheduler started.");
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  tick() {
    const now = getZonedParts(this.config.timezone);

    if (typeof this.hooks.onTick === "function") {
      this.hooks.onTick(now);
    }

    const weekdayIndex = weekdayToIndex(now.weekday);
    const isScheduledMinute = now.minute === this.config.schedule.minute;
    const isScheduledHour =
      now.hour >= this.config.schedule.startHour &&
      now.hour <= this.config.schedule.endHour;
    const isScheduledWeekday = this.config.schedule.weekdays.includes(weekdayIndex);

    if (!isScheduledMinute || !isScheduledHour || !isScheduledWeekday) {
      return;
    }

    const slotKey = `${now.year}-${String(now.month).padStart(2, "0")}-${String(now.day).padStart(2, "0")}T${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`;
    if (slotKey === this.lastSlotKey) {
      return;
    }

    this.lastSlotKey = slotKey;
    const started = this.service.startBackgroundSync("schedule");
    if (!started) {
      this.logger.log("Skipped scheduled sync because another sync is already running.");
    }
  }
}

module.exports = {
  SyncScheduler
};
