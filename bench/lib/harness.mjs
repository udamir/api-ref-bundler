// Timing harness. One case = one function run repeatedly on one fixture.
// Methodology (also described in README.md):
//   * warm-up >= 20 iterations, then >= 7 timed runs; median and min are reported (min is robust to interference
//     from other processes on a shared machine, median shows the typical run).
//   * budget rule for very slow cases: if a single iteration exceeds SLOW_MS the warm-up is shortened to
//     max(3, ceil(3000 / iteration)) iterations (JIT tiering happens inside the first iteration for workloads of
//     10^5 nodes), above VERY_SLOW_MS only 3 timed runs are taken, above HUGE_MS a single run. Such cells are
//     flagged with `truncated` in the JSON and a dagger in the tables.
//   * heap delta: with --expose-gc, one extra run after timing: gc(); h0; keep = fn(); gc(); h1 -> h1 - h0 while
//     the result is still referenced. Meaningful for clone/transform (size of the produced structure), roughly 0
//     for a traversal.
import { performance } from "node:perf_hooks"

export const WARMUP = 20
export const RUNS = 7
export const SLOW_MS = 500
export const VERY_SLOW_MS = 5_000
export const HUGE_MS = 30_000

const isThenable = (x) => x && typeof x.then === "function"

const timeOnce = async (fn, setup) => {
  const arg = setup ? setup() : undefined
  const t0 = performance.now()
  const r = fn(arg)
  if (isThenable(r)) await r
  return performance.now() - t0
}

export const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * @param fn        function under test; receives the value returned by `setup` (if any)
 * @param opts.setup  untimed per-iteration preparation (e.g. a fresh copy for in-place transforms)
 * @param opts.heap   measure heap delta (default true when gc is exposed)
 */
export const measure = async (fn, opts = {}) => {
  const { setup, heap = typeof globalThis.gc === "function" && process.env.BENCH_QUICK !== "1", warmup = WARMUP, runs = RUNS } = opts
  const first = await timeOnce(fn, setup)
  let w = warmup
  let n = runs
  let truncated = false
  if (first > SLOW_MS) {
    w = Math.max(3, Math.ceil(3000 / first))
    truncated = true
  }
  if (first > VERY_SLOW_MS) n = 3
  // BENCH_QUICK=1: validation mode, one iteration per case (never used for reported numbers)
  const quick = process.env.BENCH_QUICK === "1"
  const samples = []
  if (first > HUGE_MS || (quick && first > SLOW_MS)) {
    // a single iteration above 30 s is the measurement; nothing else is affordable
    n = 0
    w = 0
    samples.push(first)
  } else if (quick) {
    w = 1
    n = 1
  }
  for (let i = 1; i < w; i++) await timeOnce(fn, setup)
  for (let i = 0; i < n; i++) samples.push(await timeOnce(fn, setup))
  const result = {
    median: median(samples),
    min: Math.min(...samples),
    max: Math.max(...samples),
    mean: samples.reduce((a, b) => a + b, 0) / samples.length,
    runs: samples.length,
    warmup: w,
    firstIteration: first,
    truncated,
    samples: samples.map((x) => +x.toFixed(3)),
  }
  if (heap) {
    const arg = setup ? setup() : undefined
    globalThis.gc()
    const h0 = process.memoryUsage().heapUsed
    let keep = fn(arg)
    if (isThenable(keep)) keep = await keep
    globalThis.gc()
    const h1 = process.memoryUsage().heapUsed
    result.heapDelta = h1 - h0
    // keep the result alive until after the measurement
    if (keep === Symbol.for("never")) console.log(keep)
  }
  return result
}

export const fmtMs = (ms) => (ms === undefined || ms === null ? "" : ms.toFixed(1))

/** Runs a list of cases sequentially and collects results; errors are recorded, not thrown. */
export const runCases = async (cases, log = console.log) => {
  const out = []
  for (const c of cases) {
    const row = { case: c.case, fixture: c.fixture, library: c.library, note: c.note, cycles: c.cycles }
    try {
      if (c.check) { await c.check() }
      const m = await measure(c.fn, { setup: c.setup })
      Object.assign(row, m, { status: "ok" })
      log(`  ${c.case} | ${c.fixture} | ${c.library}: median ${fmtMs(m.median)} ms, min ${fmtMs(m.min)} ms${m.truncated ? " (truncated)" : ""}`)
    } catch (e) {
      row.status = "error"
      row.error = `${e.name}: ${String(e.message).split("\n")[0]}`
      log(`  ${c.case} | ${c.fixture} | ${c.library}: ERROR ${row.error}`)
    }
    out.push(row)
  }
  return out
}
