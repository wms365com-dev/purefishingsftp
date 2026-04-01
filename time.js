function getZonedParts(timezone, date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday: values.weekday,
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
}

function weekdayToIndex(weekday) {
  const lookup = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };

  return lookup[weekday];
}

function getTimeZoneOffsetMs(date, timezone) {
  const zoned = getZonedParts(timezone, date);
  const asUtc = Date.UTC(
    zoned.year,
    zoned.month - 1,
    zoned.day,
    zoned.hour,
    zoned.minute,
    zoned.second
  );

  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(parts, timezone) {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour || 0,
    parts.minute || 0,
    parts.second || 0
  );

  const offset = getTimeZoneOffsetMs(new Date(utcGuess), timezone);
  return new Date(utcGuess - offset);
}

function addUtcDays(year, month, day, offsetDays) {
  const shifted = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
}

function parseDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    return null;
  }

  const [year, month, day] = String(value).split("-").map((item) => Number(item));
  if (!year || !month || !day) {
    return null;
  }

  return { year, month, day };
}

function getLocalDayRange(dateValue, timezone) {
  const parts = typeof dateValue === "string"
    ? parseDateOnly(dateValue)
    : getZonedParts(timezone, dateValue);

  if (!parts) {
    return null;
  }

  const nextParts = addUtcDays(parts.year, parts.month, parts.day, 1);
  const start = zonedDateTimeToUtc({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: 0,
    minute: 0,
    second: 0
  }, timezone);
  const end = zonedDateTimeToUtc({
    year: nextParts.year,
    month: nextParts.month,
    day: nextParts.day,
    hour: 0,
    minute: 0,
    second: 0
  }, timezone);

  return {
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    label: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
  };
}

module.exports = {
  getLocalDayRange,
  getZonedParts,
  parseDateOnly,
  weekdayToIndex,
  zonedDateTimeToUtc
};

