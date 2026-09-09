const BLOCK_SIGNAL = /\b(?:too many requests|rate limit(?:ed|ing)?|unusual (?:traffic|activity)|verify (?:that )?you are human|complete (?:the )?(?:security|verification) check|captcha|access denied|temporarily blocked|account (?:is )?(?:restricted|suspended))\b/i;

const DEFAULTS = Object.freeze({
  minIntervalMs: 20_000,
  jitterMs: 5_000,
  maxRequests: 30,
  windowMs: 60 * 60 * 1_000,
  cooldownBaseMs: 5 * 60 * 1_000,
  cooldownMaxMs: 60 * 60 * 1_000,
});

function integerSetting(value, fallback, { minimum = 0 } = {}) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

function settingsFromEnvironment(environment = process.env) {
  return {
    minIntervalMs: integerSetting(environment.OMNI_CONSUMER_MIN_INTERVAL_MS, DEFAULTS.minIntervalMs),
    jitterMs: integerSetting(environment.OMNI_CONSUMER_JITTER_MS, DEFAULTS.jitterMs),
    maxRequests: integerSetting(environment.OMNI_CONSUMER_MAX_REQUESTS, DEFAULTS.maxRequests, { minimum: 1 }),
    windowMs: integerSetting(environment.OMNI_CONSUMER_WINDOW_MS, DEFAULTS.windowMs, { minimum: 1 }),
    cooldownBaseMs: integerSetting(environment.OMNI_CONSUMER_COOLDOWN_BASE_MS, DEFAULTS.cooldownBaseMs, { minimum: 1 }),
    cooldownMaxMs: integerSetting(environment.OMNI_CONSUMER_COOLDOWN_MAX_MS, DEFAULTS.cooldownMaxMs, { minimum: 1 }),
  };
}

export function isConsumerBlockError(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return BLOCK_SIGNAL.test(message);
}

export async function assertNoConsumerChallenge(page, displayName) {
  const bodyText = await page.locator('body').innerText({ timeout: 2_000 }).catch(() => '');
  const signal = bodyText.match(BLOCK_SIGNAL)?.[0];
  if (!signal) return;
  throw new Error(
    `${displayName} presented a blocking notice (${signal}). ` +
    'Consumer automation has stopped; complete any required verification manually before trying again.',
  );
}

export class ConsumerUsageGuard {
  constructor({
    ...overrides
  } = {}) {
    const settings = { ...DEFAULTS, ...overrides };
    this.minIntervalMs = settings.minIntervalMs;
    this.jitterMs = settings.jitterMs;
    this.maxRequests = settings.maxRequests;
    this.windowMs = settings.windowMs;
    this.cooldownBaseMs = settings.cooldownBaseMs;
    this.cooldownMaxMs = Math.max(settings.cooldownBaseMs, settings.cooldownMaxMs);
    this.now = settings.now || Date.now;
    this.sleep = settings.sleep || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    this.random = settings.random || Math.random;
    this.queue = Promise.resolve();
    this.requestStarts = [];
    this.lastStart = null;
    this.cooldownUntil = 0;
    this.blockCount = 0;
  }

  run(task, { metered = true } = {}) {
    const queued = this.queue.then(() => this.execute(task, { metered }));
    this.queue = queued.then(() => undefined, () => undefined);
    return queued;
  }

  async execute(task, { metered = true } = {}) {
    let current = this.now();
    if (metered && current < this.cooldownUntil) {
      throw new Error(
        `Consumer browser requests are paused until ${new Date(this.cooldownUntil).toISOString()} ` +
        'after a rate-limit or verification signal.',
      );
    }

    if (metered) {
      this.prune(current);
      const spacingDelay = this.lastStart === null
        ? 0
        : Math.max(0, this.lastStart + this.minIntervalMs + Math.floor(this.random() * (this.jitterMs + 1)) - current);
      const budgetDelay = this.requestStarts.length < this.maxRequests
        ? 0
        : Math.max(0, this.requestStarts[0] + this.windowMs - current);
      const delay = Math.max(spacingDelay, budgetDelay);
      if (delay > 0) await this.sleep(delay);

      current = this.now();
      this.prune(current);
      this.requestStarts.push(current);
      this.lastStart = current;
    }

    try {
      const value = await task();
      if (metered) this.blockCount = 0;
      return value;
    } catch (error) {
      if (isConsumerBlockError(error)) {
        const duration = Math.min(
          this.cooldownMaxMs,
          this.cooldownBaseMs * (2 ** this.blockCount),
        );
        this.blockCount += 1;
        this.cooldownUntil = this.now() + duration;
      }
      throw error;
    }
  }

  prune(current) {
    const cutoff = current - this.windowMs;
    this.requestStarts = this.requestStarts.filter(timestamp => timestamp > cutoff);
  }
}

export function createConsumerUsageGuard(environment = process.env) {
  return new ConsumerUsageGuard(settingsFromEnvironment(environment));
}

export { DEFAULTS as CONSUMER_USAGE_DEFAULTS, settingsFromEnvironment };
