import assert from 'node:assert/strict';
import test from 'node:test';

const guardModule = await import('../packages/browser-consumer-adapter/src/usage-guard.mjs').catch(error => {
  throw new Error(`usage guard module must load: ${error.message}`);
});

const {
  ConsumerUsageGuard,
  assertNoConsumerChallenge,
  isConsumerBlockError,
} = guardModule;

test('consumer usage guard serializes calls and spaces request starts', async () => {
  let now = 1_000;
  const starts = [];
  const guard = new ConsumerUsageGuard({
    minIntervalMs: 2_000,
    jitterMs: 0,
    maxRequests: 100,
    windowMs: 60_000,
    now: () => now,
    sleep: async milliseconds => { now += milliseconds; },
    random: () => 0,
  });

  await Promise.all([
    guard.run(async () => { starts.push(now); return 'first'; }),
    guard.run(async () => { starts.push(now); return 'second'; }),
  ]);

  assert.deepEqual(starts, [1_000, 3_000]);
});

test('consumer usage guard enforces a rolling request budget', async () => {
  let now = 5_000;
  const starts = [];
  const guard = new ConsumerUsageGuard({
    minIntervalMs: 0,
    jitterMs: 0,
    maxRequests: 2,
    windowMs: 10_000,
    now: () => now,
    sleep: async milliseconds => { now += milliseconds; },
    random: () => 0,
  });

  await guard.run(async () => { starts.push(now); });
  await guard.run(async () => { starts.push(now); });
  await guard.run(async () => { starts.push(now); });

  assert.deepEqual(starts, [5_000, 5_000, 15_000]);
});

test('diagnostic calls share the queue without consuming request pacing', async () => {
  let now = 8_000;
  const starts = [];
  const guard = new ConsumerUsageGuard({
    minIntervalMs: 1_000,
    jitterMs: 0,
    maxRequests: 100,
    windowMs: 60_000,
    now: () => now,
    sleep: async milliseconds => { now += milliseconds; },
    random: () => 0,
  });

  await guard.run(async () => { starts.push(['query', now]); });
  await guard.run(async () => { starts.push(['diagnostic', now]); }, { metered: false });
  await guard.run(async () => { starts.push(['query', now]); });

  assert.deepEqual(starts, [
    ['query', 8_000],
    ['diagnostic', 8_000],
    ['query', 9_000],
  ]);
});

test('consumer usage guard opens a cooldown after a verification or throttle signal', async () => {
  let now = 20_000;
  let calls = 0;
  const guard = new ConsumerUsageGuard({
    minIntervalMs: 0,
    jitterMs: 0,
    maxRequests: 100,
    windowMs: 60_000,
    cooldownBaseMs: 30_000,
    cooldownMaxMs: 120_000,
    now: () => now,
    sleep: async milliseconds => { now += milliseconds; },
    random: () => 0,
  });

  await assert.rejects(
    guard.run(async () => { calls += 1; throw new Error('Verify you are human'); }),
    /verify you are human/i,
  );
  await assert.rejects(
    guard.run(async () => { calls += 1; }),
    /paused until/i,
  );
  assert.equal(calls, 1);

  now += 30_000;
  await guard.run(async () => { calls += 1; });
  assert.equal(calls, 2);
});

test('consumer block classification is narrow and challenge pages stop before submission', async () => {
  assert.equal(isConsumerBlockError(new Error('Too many requests. Try later.')), true);
  assert.equal(isConsumerBlockError(new Error('ordinary selector changed')), false);

  const page = {
    locator(selector) {
      assert.equal(selector, 'body');
      return { innerText: async () => 'Please complete the security check to continue.' };
    },
  };
  await assert.rejects(assertNoConsumerChallenge(page, 'Example'), /security check/i);
});

test('all browser consumer adapters use the shared usage guard', async () => {
  const { readFile } = await import('node:fs/promises');
  const paths = [
    '../packages/browser-consumer-adapter/src/adapter.mjs',
    '../packages/claude-consumer-adapter/src/adapter.mjs',
    '../packages/zai-consumer-adapter/src/adapter.mjs',
  ];

  for (const relativePath of paths) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    assert.match(source, /usage-guard\.mjs/);
    assert.match(source, /usageGuard\.run/);
    assert.match(source, /assertNoConsumerChallenge/);
  }
});
