import { describe, expect, it, vi } from "vite-plus/test"
import { bundle, dereference } from "../../src"
import { collectRefs, memResolver, resolveInternal } from "./helpers"

// Block Z: robustness (missing files, odd inputs, loops, size)

describe("Z8 robustness", () => {
  // 1.0.0 contract change (RB-01/04): a base document that cannot be loaded rejects with a typed RefResolveError instead of resolving to undefined / {}.
  it("Z8.1 a missing base file rejects with a typed error and does not hang", async () => {
    await expect(
      dereference("missing.json", memResolver({}).resolver),
    ).rejects.toMatchObject({
      detail: { type: "error", document: "missing.json" },
    })
    await expect(
      bundle("missing.json", memResolver({}).resolver),
    ).rejects.toMatchObject({
      detail: { type: "error", document: "missing.json" },
    })
  })

  it("Z8.2 a resolver that throws synchronously for a nested file is reported through onError", async () => {
    const resolver = ((p: string) => {
      if (p === "r.json") {
        return { type: "object", properties: { a: { $ref: "boom.json" } } }
      }
      throw new Error("sync boom")
    }) as any
    const onError = vi.fn()
    const result: any = await dereference("r.json", resolver, {
      hooks: { onError },
    })
    // 1.0.0: onError receives a third `detail` argument
    expect(onError).toHaveBeenCalledWith(
      "Cannot resolve: boom.json",
      expect.anything(),
      expect.objectContaining({ type: "error", document: "boom.json" }),
    )
    expect(result.properties.a).toEqual({ $ref: "boom.json" })
  })

  it("Z8.3 a resolver returning undefined / invalid JSON values for a nested file is reported", async () => {
    const doc: Record<string, unknown> = {
      "r.json": {
        type: "object",
        properties: { a: { $ref: "u.json" }, b: { $ref: "n.json#/x" } },
      },
      "u.json": undefined,
      "n.json": null,
    }
    const onError = vi.fn()
    await dereference("r.json", memResolver(doc).resolver, {
      hooks: { onError },
    })
    expect(onError).toHaveBeenCalledTimes(2)
  })

  it("Z8.4 non-object base documents are returned as they are by dereference", async () => {
    expect(
      await dereference("r.md", memResolver({ "r.md": "hello" }).resolver),
    ).toBe("hello")
    expect(
      await dereference("r.json", memResolver({ "r.json": 5 }).resolver),
    ).toBe(5)
    expect(
      await dereference("r.json", memResolver({ "r.json": null }).resolver),
    ).toBeNull()
    expect(
      await dereference(
        "r.json",
        memResolver({ "r.json": [{ $ref: "x.json" }], "x.json": { t: 1 } })
          .resolver,
      ),
    ).toEqual([{ t: 1 }])
  })

  // ISSUE-RB-07: the final mergeValues(result, rootDefs) treats the array root as an object and returns {"0": ...}.
  it("Z8.5 bundle keeps an array root document an array", async () => {
    const doc = { "r.json": [{ $ref: "x.json" }], "x.json": { t: 1 } }
    const bundled = await bundle("r.json", memResolver(doc).resolver)
    expect(Array.isArray(bundled)).toBe(true)
  })

  it("Z8.6 a pure ref loop across files terminates in both modes", async () => {
    const doc = { "a.json": { $ref: "b.json" }, "b.json": { $ref: "a.json" } }
    const result = await dereference("a.json", memResolver(doc).resolver)
    expect(result).toEqual({ $ref: "#" })
    const bundled = await bundle("a.json", memResolver(doc).resolver)
    expect(bundled).toEqual({ $ref: "#" })
  })

  it("Z8.7 an internal pure ref loop terminates and bundle leaves it untouched", async () => {
    const doc = {
      "a.json": {
        type: "object",
        properties: { x: { $ref: "#/definitions/A" } },
        definitions: {
          A: { $ref: "#/definitions/B" },
          B: { $ref: "#/definitions/A" },
        },
      },
    }
    const bundled = await bundle("a.json", memResolver(doc).resolver)
    expect(bundled).toEqual(doc["a.json"])
    const result: any = await dereference("a.json", memResolver(doc).resolver)
    expect(result.properties.x.$ref).toBeDefined()
  })

  // ISSUE-RB-19: an unresolvable loop (A -> B -> A with nothing else) is silently turned into a $ref that points at itself; no onError/onCycle signal distinguishes it from a legitimate cycle.
  it("Z8.8 an unresolvable pure ref loop is reported", async () => {
    const doc = {
      "a.json": {
        type: "object",
        properties: { x: { $ref: "#/definitions/A" } },
        definitions: {
          A: { $ref: "#/definitions/B" },
          B: { $ref: "#/definitions/A" },
        },
      },
    }
    const onError = vi.fn()
    const result: any = await dereference("a.json", memResolver(doc).resolver, {
      hooks: { onError },
    })
    const target = resolveInternal(result, result.properties.x.$ref) as any
    expect(
      onError.mock.calls.length > 0 || target !== result.properties.x,
    ).toBe(true)
  })

  it("Z8.9 deep nesting (depth 1000) completes without recursion errors", async () => {
    const deep: any = { type: "object" }
    let cursor = deep
    for (let i = 0; i < 1000; i++) {
      cursor.properties = { n: { type: "object" } }
      cursor = cursor.properties.n
    }
    cursor.properties = { leaf: { $ref: "x.json" } }
    const files = { "r.json": deep, "x.json": { title: "leaf" } }
    const result: any = await dereference("r.json", memResolver(files).resolver)
    let node = result
    for (let i = 0; i < 1000; i++) {
      node = node.properties.n
    }
    expect(node.properties.leaf).toEqual({ title: "leaf" })
    const bundled: any = await bundle("r.json", memResolver(files).resolver)
    expect(bundled.definitions.x).toEqual({ title: "leaf" })
  })

  it("Z8.10 a long external chain loads every file exactly once", async () => {
    const files: Record<string, unknown> = {}
    const N = 300
    for (let i = 0; i < N; i++) {
      files[`f${i}.json`] = {
        type: "object",
        properties:
          i < N - 1
            ? { next: { $ref: `f${i + 1}.json` } }
            : { leaf: { type: "string" } },
      }
    }
    const { resolver, calls } = memResolver(files)
    const bundled: any = await bundle("f0.json", resolver)
    expect(calls).toHaveLength(N)
    expect(new Set(calls).size).toBe(N)
    expect(Object.keys(bundled.definitions)).toHaveLength(N - 1)
    const { resolver: resolver2, calls: calls2 } = memResolver(files)
    await dereference("f0.json", resolver2)
    expect(calls2).toHaveLength(N)
  })

  it("Z8.11 a wide object (20 000 properties) completes", async () => {
    const properties: Record<string, unknown> = {}
    for (let i = 0; i < 20000; i++) {
      properties[`p${i}`] =
        i % 100 === 0 ? { $ref: "x.json" } : { type: "string" }
    }
    const files = {
      "r.json": { type: "object", properties },
      "x.json": { title: "x" },
    }
    const result: any = await dereference("r.json", memResolver(files).resolver)
    expect(Object.keys(result.properties)).toHaveLength(20000)
    expect(result.properties.p100).toEqual({ title: "x" })
    const bundled: any = await bundle("r.json", memResolver(files).resolver)
    expect(bundled.properties.p100).toEqual({ $ref: "#/definitions/x" })
  })

  it("Z8.12 odd $ref strings do not throw", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: {
          twoHashes: { $ref: "x.json#/a#b" },
          onlyHashes: { $ref: "##" },
          spaces: { $ref: "  " },
          unicode: { $ref: "#/definitions/ü" },
        },
        definitions: { ü: { title: "u" } },
      },
      "x.json": { a: { "#b": 1 } },
    }
    const onError = vi.fn()
    const result: any = await dereference("r.json", memResolver(doc).resolver, {
      hooks: { onError },
    })
    expect(result.properties.unicode).toEqual({ title: "u" })
    const bundled = await bundle("r.json", memResolver(doc).resolver, {
      hooks: { onError },
    })
    expect(bundled).toBeDefined()
  })

  it("Z8.13 many mutually recursive definitions dereference with resolvable refs", async () => {
    const definitions: Record<string, unknown> = {}
    const C = 200
    for (let i = 0; i < C; i++) {
      definitions[`N${i}`] = {
        type: "object",
        properties: {
          next: { $ref: `#/definitions/N${(i + 1) % C}` },
          self: { $ref: `#/definitions/N${i}` },
        },
      }
    }
    const doc = {
      "r.json": {
        type: "object",
        properties: { start: { $ref: "#/definitions/N0" } },
        definitions,
      },
    }
    const result = await dereference("r.json", memResolver(doc).resolver)
    for (const { ref } of collectRefs(result)) {
      expect(resolveInternal(result, ref as string)).not.toBeUndefined()
    }
    const cyclic: any = await dereference("r.json", memResolver(doc).resolver, {
      enableCircular: true,
    })
    expect(collectRefs(cyclic)).toEqual([])
    expect(cyclic.properties.start.properties.self).toBe(
      cyclic.properties.start,
    )
  })

  // ISSUE-RB-28: an input object that already contains JavaScript cycles (an already dereferenced schema, a pre-built object returned by the resolver) is cloned without cycle detection, so both dereference and bundle loop forever, even without any $ref. Skipped instead of it.fails because the call never returns.
  it.skip("Z8.14 an input object with JavaScript cycles terminates", async () => {
    const doc: any = {
      type: "object",
      properties: {},
      definitions: { s: { type: "string" } },
    }
    doc.properties.self = doc
    doc.properties.name = { $ref: "#/definitions/s" }
    const dereferenced: any = await dereference("r.json", () => doc, {
      enableCircular: true,
    })
    expect(dereferenced.properties.self).toBe(dereferenced)
    expect(dereferenced.properties.name).toEqual({ type: "string" })
    const bundled: any = await bundle("r.json", () => doc)
    expect(() => JSON.stringify(bundled)).not.toThrow()
  })
})
