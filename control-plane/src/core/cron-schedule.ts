type CronFieldSpec = {
  min: number;
  max: number;
  normalizeValue?: (value: number) => number;
};

type FieldMatchResult = {
  valid: boolean;
  matched: boolean;
  wildcard: boolean;
};

const MINUTE_FIELD: CronFieldSpec = { min: 0, max: 59 };
const HOUR_FIELD: CronFieldSpec = { min: 0, max: 23 };
const DAY_OF_MONTH_FIELD: CronFieldSpec = { min: 1, max: 31 };
const MONTH_FIELD: CronFieldSpec = { min: 1, max: 12 };
const DAY_OF_WEEK_FIELD: CronFieldSpec = {
  min: 0,
  max: 7,
  normalizeValue: (value) => (value === 7 ? 0 : value)
};

function normalizeCronValue(value: number, spec: CronFieldSpec) {
  return spec.normalizeValue ? spec.normalizeValue(value) : value;
}

function parseNumberToken(token: string, spec: CronFieldSpec) {
  if (!/^\d+$/.test(token)) {
    return null;
  }

  const value = normalizeCronValue(Number.parseInt(token, 10), spec);
  if (!Number.isInteger(value) || value < spec.min || value > normalizeCronValue(spec.max, spec)) {
    return null;
  }

  return value;
}

function parseRangeToken(token: string, spec: CronFieldSpec) {
  if (token === "*") {
    return {
      start: spec.min,
      end: normalizeCronValue(spec.max, spec),
      wildcard: true
    };
  }

  const parts = token.split("-");
  if (parts.length === 1) {
    const value = parseNumberToken(parts[0], spec);
    if (value === null) {
      return null;
    }

    return {
      start: value,
      end: value,
      wildcard: false
    };
  }

  if (parts.length !== 2) {
    return null;
  }

  const start = parseNumberToken(parts[0], spec);
  const end = parseNumberToken(parts[1], spec);
  if (start === null || end === null || end < start) {
    return null;
  }

  return {
    start,
    end,
    wildcard: false
  };
}

function matchesCronField(expression: string, value: number, spec: CronFieldSpec): FieldMatchResult {
  const normalizedValue = normalizeCronValue(value, spec);
  const trimmed = expression.trim();
  if (!trimmed) {
    return {
      valid: false,
      matched: false,
      wildcard: false
    };
  }

  const segments = trimmed.split(",");
  let sawWildcard = false;

  for (const rawSegment of segments) {
    const segment = rawSegment.trim();
    if (!segment) {
      return {
        valid: false,
        matched: false,
        wildcard: false
      };
    }

    const [baseToken, stepToken] = segment.split("/");
    if (segment.split("/").length > 2) {
      return {
        valid: false,
        matched: false,
        wildcard: false
      };
    }

    const range = parseRangeToken(baseToken, spec);
    if (!range) {
      return {
        valid: false,
        matched: false,
        wildcard: false
      };
    }

    if (range.wildcard) {
      sawWildcard = true;
    }

    const step = stepToken ? Number.parseInt(stepToken, 10) : 1;
    if (!Number.isInteger(step) || step <= 0) {
      return {
        valid: false,
        matched: false,
        wildcard: false
      };
    }

    if (normalizedValue < range.start || normalizedValue > range.end) {
      continue;
    }

    if ((normalizedValue - range.start) % step === 0) {
      return {
        valid: true,
        matched: true,
        wildcard: sawWildcard
      };
    }
  }

  return {
    valid: true,
    matched: false,
    wildcard: sawWildcard
  };
}

export function matchesScheduledTick(cronExpression: string | null | undefined, scheduledTime: Date) {
  const normalizedCron = typeof cronExpression === "string" ? cronExpression.trim() : "";
  if (!normalizedCron) {
    return false;
  }

  if (!(scheduledTime instanceof Date) || Number.isNaN(scheduledTime.getTime())) {
    return false;
  }

  const fields = normalizedCron.split(/\s+/);
  if (fields.length !== 5) {
    return false;
  }

  const minute = matchesCronField(fields[0], scheduledTime.getUTCMinutes(), MINUTE_FIELD);
  const hour = matchesCronField(fields[1], scheduledTime.getUTCHours(), HOUR_FIELD);
  const dayOfMonth = matchesCronField(fields[2], scheduledTime.getUTCDate(), DAY_OF_MONTH_FIELD);
  const month = matchesCronField(fields[3], scheduledTime.getUTCMonth() + 1, MONTH_FIELD);
  const dayOfWeek = matchesCronField(fields[4], scheduledTime.getUTCDay(), DAY_OF_WEEK_FIELD);

  if (!minute.valid || !hour.valid || !dayOfMonth.valid || !month.valid || !dayOfWeek.valid) {
    return false;
  }

  const dayMatch =
    dayOfMonth.wildcard && dayOfWeek.wildcard
      ? true
      : dayOfMonth.wildcard
        ? dayOfWeek.matched
        : dayOfWeek.wildcard
          ? dayOfMonth.matched
          : dayOfMonth.matched || dayOfWeek.matched;

  return minute.matched && hour.matched && month.matched && dayMatch;
}
