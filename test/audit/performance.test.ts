import { describe, expect, it } from "vite-plus/test"
import { bundle, dereference } from "../../src"
import { measure, memResolver } from "./helpers"

// Block Q: performance smoke tests. Thresholds are ~10x the numbers measured on a laptop;
// they guard against quadratic regressions, not micro-timings.

const LIMIT_MS = 4000

describe("Q10 performance", () => {
  it("Q10.1 10 000 refs to one target (internal and external)", async () => {
    const internalProps: Record<string, unknown> = {}
    const externalProps: Record<string, unknown> = {}
    for (let i = 0; i < 10000; i++) {
      internalProps[`p${i}`] = { $ref: "#/definitions/T" }
      externalProps[`p${i}`] = { $ref: "t.json" }
    }
    const internal = {
      "r.json": {
        type: "object",
        properties: internalProps,
        definitions: { T: { type: "string" } },
      },
    }
    const external = {
      "r.json": { type: "object", properties: externalProps },
      "t.json": { type: "string" },
    }
    const { resolver, calls } = memResolver(external)
    const timings = [
      await measure(() => bundle("r.json", memResolver(internal).resolver)),
      await measure(() =>
        dereference("r.json", memResolver(internal).resolver),
      ),
      await measure(() => bundle("r.json", resolver)),
      await measure(() =>
        dereference("r.json", memResolver(external).resolver),
      ),
    ]
    expect(calls).toHaveLength(2)
    for (const { ms } of timings) {
      expect(ms).toBeLessThan(LIMIT_MS)
    }
  }, 30000)

  it("Q10.2 a 300-file external chain", async () => {
    const files: Record<string, unknown> = {}
    for (let i = 0; i < 300; i++) {
      files[`f${i}.json`] = {
        type: "object",
        properties:
          i < 299
            ? { next: { $ref: `f${i + 1}.json` } }
            : { leaf: { type: "string" } },
      }
    }
    expect(
      (await measure(() => bundle("f0.json", memResolver(files).resolver))).ms,
    ).toBeLessThan(LIMIT_MS)
    expect(
      (await measure(() => dereference("f0.json", memResolver(files).resolver)))
        .ms,
    ).toBeLessThan(LIMIT_MS)
  }, 30000)

  it("Q10.3 depth-1000 nesting with a ref at every level", async () => {
    const deep: any = { type: "object" }
    let cursor = deep
    for (let i = 0; i < 1000; i++) {
      cursor.properties = {
        n: { type: "object" },
        r: { $ref: "#/definitions/T" },
      }
      cursor = cursor.properties.n
    }
    deep.definitions = { T: { type: "string" } }
    const files = { "r.json": deep }
    expect(
      (await measure(() => bundle("r.json", memResolver(files).resolver))).ms,
    ).toBeLessThan(LIMIT_MS)
    expect(
      (await measure(() => dereference("r.json", memResolver(files).resolver)))
        .ms,
    ).toBeLessThan(LIMIT_MS)
  }, 30000)

  it("Q10.4 a 20 000-property object", async () => {
    const properties: Record<string, unknown> = {}
    for (let i = 0; i < 20000; i++) {
      properties[`p${i}`] = { type: "string", description: `d${i}` }
    }
    const files = { "r.json": { type: "object", properties } }
    expect(
      (await measure(() => bundle("r.json", memResolver(files).resolver))).ms,
    ).toBeLessThan(LIMIT_MS)
    expect(
      (await measure(() => dereference("r.json", memResolver(files).resolver)))
        .ms,
    ).toBeLessThan(LIMIT_MS)
  }, 30000)

  it("Q10.5 500 mutually recursive definitions, all modes", async () => {
    const definitions: Record<string, unknown> = {}
    const C = 500
    for (let i = 0; i < C; i++) {
      definitions[`N${i}`] = {
        type: "object",
        properties: {
          next: { $ref: `#/definitions/N${(i + 1) % C}` },
          self: { $ref: `#/definitions/N${i}` },
          prev: { $ref: `#/definitions/N${(i + C - 1) % C}` },
        },
      }
    }
    const files = {
      "r.json": {
        type: "object",
        properties: { start: { $ref: "#/definitions/N0" } },
        definitions,
      },
    }
    expect(
      (await measure(() => bundle("r.json", memResolver(files).resolver))).ms,
    ).toBeLessThan(LIMIT_MS)
    expect(
      (await measure(() => dereference("r.json", memResolver(files).resolver)))
        .ms,
    ).toBeLessThan(LIMIT_MS)
    expect(
      (
        await measure(() =>
          dereference("r.json", memResolver(files).resolver, {
            enableCircular: true,
          }),
        )
      ).ms,
    ).toBeLessThan(LIMIT_MS)
  }, 30000)

  it("Q10.6 1 000 distinct external sub-pointer refs (definition lookup scaling)", async () => {
    const properties: Record<string, unknown> = {}
    const defs: Record<string, unknown> = {}
    for (let i = 0; i < 1000; i++) {
      properties[`p${i}`] = { $ref: `lib.json#/defs/T${i}` }
      defs[`T${i}`] = { type: "string" }
    }
    const files = {
      "r.json": { type: "object", properties },
      "lib.json": { defs },
    }
    expect(
      (await measure(() => bundle("r.json", memResolver(files).resolver))).ms,
    ).toBeLessThan(LIMIT_MS)
  }, 30000)
})
