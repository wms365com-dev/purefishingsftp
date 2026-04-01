const { getZonedParts, weekdayToIndex } = require("./time");

function getMatchingSlot(now, schedule) {
  const currentWeekday = weekdayToIndex(now.weekday);
  if (currentWeekday === undefined) {
    return null;
  }

  return schedule.slots.find((slot) => {
    if (slot.hour !== now.hour || slot.minute !== now.minute) {
      return false;
    }

    const targetWeekday = (currentWeekday + (slot.targetWeekdayOffset || 0) + 7) % 7;
    return schedule.weekdays.includes(targetWeekday);
  }) || null;
}

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

    const slot = getMatchingSlot(now, this.config.schedule);
    if (!slot) {
      return;
    }

    const slotKey = `${now.year}-${String(now.month).padStart(2, "0")}-${String(now.day).padStart(2, "0")}T${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}|${slot.key}`;
    if (slotKey === this.lastSlotKey) {
      return;
    }

    this.lastSlotKey = slotKey;
    const started = this.service.startBackgroundSync("schedule");
    if (!started) {
      const queued = typeof this.service.queueBackgroundSync === "function"
        ? this.service.queueBackgroundSync("schedule")
        : false;

      if (queued) {
        this.logger.log("Queued scheduled sync because another sync is already running.");
      } else {
        this.logger.log("Skipped scheduled sync because another sync is already running.");
      }
    }
  }
}

module.exports = {
  SyncScheduler
};
