import { describe, expect, it, vi } from "vite-plus/test"
import { dereference } from "../../src"
import { collectRefs, memResolver, resolveInternal } from "./helpers"

// Block D: dereference (full / partial, cycles, refs to refs, siblings)

const cyclic = {
  "r.json": {
    type: "object",
    properties: {
      self: { $ref: "#" },
      node: { $ref: "#/definitions/Node" },
      ext: { $ref: "a.json" },
    },
    definitions: {
      Node: {
        type: "object",
        properties: {
          next: { $ref: "#/definitions/Node" },
          other: { $ref: "#/definitions/Other" },
        },
      },
      Other: { properties: { back: { $ref: "#/definitions/Node" } } },
    },
  },
  "a.json": { type: "object", properties: { b: { $ref: "b.json" } } },
  "b.json": { type: "object", properties: { a: { $ref: "a.json" } } },
}

describe("D4 dereference", () => {
  it("D4.1 full dereference of an acyclic document leaves no $ref", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: { a: { $ref: "x.json" }, b: { $ref: "#/definitions/B" } },
        definitions: { B: { items: { $ref: "x.json#/properties/n" } } },
      },
      "x.json": { type: "object", properties: { n: { type: "string" } } },
    }
    const result: any = await dereference("r.json", memResolver(doc).resolver)
    expect(collectRefs(result)).toEqual([])
    expect(result.properties.b.items).toEqual({ type: "string" })
    expect(result.definitions.B.items).toEqual({ type: "string" })
  })

  it("D4.2 partial dereference returns the addressed subtree, dereferenced", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: { foo: { $ref: "#/definitions/Foo" } },
        definitions: {
          Foo: { title: "Foo", properties: { b: { $ref: "x.json" } } },
        },
      },
      "x.json": { title: "X" },
    }
    const foo: any = await dereference(
      "r.json#/properties/foo",
      memResolver(doc).resolver,
    )
    expect(foo).toEqual({ title: "Foo", properties: { b: { title: "X" } } })
    const b: any = await dereference(
      "r.json#/properties/foo/properties/b",
      memResolver(doc).resolver,
    )
    expect(b).toEqual({ title: "X" })
  })

  // ISSUE-RB-04: a partial dereference of a missing pointer resolves to undefined without any error signal.
  it("D4.3 partial dereference of a missing pointer surfaces an error", async () => {
    const doc = { "r.json": { type: "object" } }
    const onError = vi.fn()
    let rejected = false
    await dereference("r.json#/nope", memResolver(doc).resolver, {
      hooks: { onError },
    }).catch(() => {
      rejected = true
    })
    expect(rejected || onError.mock.calls.length > 0).toBe(true)
  })

  it("D4.4 a self reference '#' is kept as $ref by default", async () => {
    const result: any = await dereference(
      "r.json",
      memResolver(cyclic).resolver,
    )
    expect(result.properties.self).toEqual({ $ref: "#" })
  })

  it("D4.5 kept circular $refs point to existing locations of the output", async () => {
    const result: any = await dereference(
      "r.json",
      memResolver(cyclic).resolver,
    )
    const refs = collectRefs(result)
    expect(refs.length).toBeGreaterThan(0)
    for (const { ref } of refs) {
      expect(ref).toMatch(/^#/)
      expect(resolveInternal(result, ref as string)).not.toBeUndefined()
    }
    expect(() => JSON.stringify(result)).not.toThrow()
  })

  it("D4.6 a cross-file cycle is cut with an internal $ref to the ancestor", async () => {
    const result: any = await dereference(
      "r.json",
      memResolver(cyclic).resolver,
    )
    expect(result.properties.ext.properties.b.properties.a).toEqual({
      $ref: "#/properties/ext",
    })
  })

  it("D4.7 enableCircular turns cycles into JS object cycles and leaves no $ref", async () => {
    const result: any = await dereference(
      "r.json",
      memResolver(cyclic).resolver,
      {
        enableCircular: true,
      },
    )
    expect(collectRefs(result)).toEqual([])
    expect(result.properties.self).toBe(result)
    expect(result.properties.ext.properties.b.properties.a).toBe(
      result.properties.ext,
    )
    expect(() => JSON.stringify(result)).toThrow()
  })

  // ISSUE-RB-13: with enableCircular the internal Symbol(cycleRef) marker is written onto output nodes and never removed.
  it("D4.8 enableCircular does not leave internal symbols on output nodes", async () => {
    const result: any = await dereference(
      "r.json",
      memResolver(cyclic).resolver,
      {
        enableCircular: true,
      },
    )
    const seen = new Set<unknown>()
    const walk = (node: any) => {
      if (typeof node !== "object" || node === null || seen.has(node)) {
        return
      }
      seen.add(node)
      expect(Object.getOwnPropertySymbols(node)).toEqual([])
      for (const value of Object.values(node)) {
        walk(value)
      }
    }
    walk(result)
  })

  it("D4.9 refs to refs: the nearest sibling wins and the chain is resolved", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: { a: { $ref: "#/definitions/A", description: "from a" } },
        definitions: {
          A: { $ref: "#/definitions/B", title: "A title" },
          B: { type: "string", title: "B title", description: "B desc" },
        },
      },
    }
    const result: any = await dereference("r.json", memResolver(doc).resolver)
    expect(result.properties.a).toEqual({
      type: "string",
      title: "A title",
      description: "from a",
    })
    expect(result.definitions.A).toEqual({
      type: "string",
      title: "A title",
      description: "B desc",
    })
  })

  it("D4.10 ignoreSibling drops sibling content at every hop", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: { a: { $ref: "#/definitions/A", description: "from a" } },
        definitions: {
          A: { $ref: "#/definitions/B", title: "A title" },
          B: { type: "string", title: "B title" },
        },
      },
    }
    const result: any = await dereference("r.json", memResolver(doc).resolver, {
      ignoreSibling: true,
    })
    expect(result.properties.a).toEqual({ type: "string", title: "B title" })
    expect(result.definitions.A).toEqual({ type: "string", title: "B title" })
  })

  it("D4.11 the same ref with different siblings yields independent results", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: {
          a: {
            $ref: "x.json",
            title: "A",
            properties: { extra: { type: "string" } },
          },
          b: { $ref: "x.json" },
          c: { $ref: "x.json", title: "C" },
        },
      },
      "x.json": { type: "object", properties: { n: { $ref: "y.json" } } },
      "y.json": { title: "Y" },
    }
    const result: any = await dereference("r.json", memResolver(doc).resolver)
    expect(result.properties.a.title).toBe("A")
    expect(result.properties.a.properties).toEqual({
      n: { title: "Y" },
      extra: { type: "string" },
    })
    expect(result.properties.b).toEqual({
      type: "object",
      properties: { n: { title: "Y" } },
    })
    expect(result.properties.c.title).toBe("C")
    expect(result.properties.c.properties).toEqual({ n: { title: "Y" } })
  })

  it("D4.12 the same ref without siblings resolves to equal content", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: { a: { $ref: "x.json" }, b: { $ref: "x.json" } },
      },
      "x.json": { type: "object", properties: { n: { type: "string" } } },
    }
    const result: any = await dereference("r.json", memResolver(doc).resolver)
    expect(result.properties.a).toEqual(result.properties.b)
    expect(result.properties.a).toEqual(doc["x.json"])
  })

  it("D4.13 the output never aliases resolver input objects", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: { a: { $ref: "x.json" }, b: { $ref: "x.json" } },
      },
      "x.json": { type: "object", properties: { n: { type: "string" } } },
    }
    const result: any = await dereference("r.json", memResolver(doc).resolver)
    expect(result.properties.a).not.toBe(doc["x.json"])
    expect(result.properties.a.properties).not.toBe(doc["x.json"].properties)
    result.properties.a.properties.n.type = "mutated"
    expect(doc["x.json"].properties.n.type).toBe("string")
  })

  // ISSUE-RB-14: mergeValues() concatenates arrays when merging siblings into the target, so `enum: [1,2]` + sibling `enum: [3]` becomes `[1,2,3]`; under JSON Schema 2019-09+/OpenAPI 3.1 sibling keywords apply in conjunction (allOf semantics), so the merged enum may never admit values rejected by either side.
  it("D4.14 sibling array keywords must not widen the target (enum)", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: { a: { $ref: "x.json", enum: [3] } },
      },
      "x.json": { type: "integer", enum: [1, 2] },
    }
    // 1.0.0 (RB-14): the default strategy stays "merge" (today's mergeValues); the conjunctive representation is opt-in via siblingStrategy: "allOf"
    const result: any = await dereference("r.json", memResolver(doc).resolver, {
      siblingStrategy: "allOf",
    })
    expect(result.properties.a).toEqual({
      allOf: [{ type: "integer", enum: [1, 2] }, { enum: [3] }],
    })
    const allowed: unknown[] = result.properties.a.enum ?? []
    expect(
      allowed.filter((v) => ![1, 2].includes(v as number) || v !== 3),
    ).toEqual([])
  })

  it("D4.15 fullCrawl produces the same document as the default mode", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: {
          a: { $ref: "x.json", title: "A" },
          b: { $ref: "x.json" },
          c: { $ref: "x.json" },
        },
      },
      "x.json": { type: "object", properties: { n: { $ref: "y.json" } } },
      "y.json": { title: "Y" },
    }
    const plain = await dereference("r.json", memResolver(doc).resolver)
    const full = await dereference("r.json", memResolver(doc).resolver, {
      fullCrawl: true,
    })
    expect(full).toEqual(plain)
  })

  it("D4.16 onCycle is invoked with the pointer of the ancestor node", async () => {
    const onCycle = vi.fn()
    await dereference("r.json", memResolver(cyclic).resolver, {
      hooks: { onCycle },
    })
    const pointers = onCycle.mock.calls.map((c) => c[0])
    expect(pointers).toContain("")
    expect(pointers).toContain("/properties/node")
    expect(pointers).toContain("/properties/ext")
  })

  it("D4.17 a non-string $ref is left untouched", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: {
          a: { $ref: 5 },
          b: { $ref: { x: 1 } },
          c: { $ref: null },
        },
      },
    }
    const result: any = await dereference("r.json", memResolver(doc).resolver)
    expect(result.properties).toEqual(doc["r.json"].properties)
  })

  it("D4.18 onCrawl/onExit fire for every node and onRef receives the normalised ref", async () => {
    const doc = {
      "dir/r.json": { type: "object", properties: { a: { $ref: "./x.json" } } },
      "dir/x.json": { title: "x" },
    }
    const onRef = vi.fn()
    const onCrawl = vi.fn()
    const onExit = vi.fn()
    await dereference("dir/r.json", memResolver(doc).resolver, {
      hooks: { onRef, onCrawl, onExit },
    })
    expect(onRef).toHaveBeenCalledWith("dir/x.json", expect.anything())
    expect(onCrawl.mock.calls.length).toBe(onExit.mock.calls.length)
    expect(onCrawl.mock.calls.length).toBeGreaterThanOrEqual(5)
  })

  it("D4.19 a root document that is itself a $ref is replaced by its target", async () => {
    const doc = {
      "r.json": { $ref: "x.json" },
      "x.json": {
        type: "object",
        properties: { back: { $ref: "r.json" }, self: { $ref: "#" } },
      },
    }
    const result: any = await dereference("r.json", memResolver(doc).resolver)
    expect(result.type).toBe("object")
    expect(result.properties.back).toEqual({ $ref: "#" })
    expect(result.properties.self).toEqual({ $ref: "#" })
  })

  it("D4.20 a cycle entered through a node with siblings still terminates with valid refs", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: { a: { $ref: "a.json", description: "root a" } },
      },
      "a.json": { type: "object", properties: { b: { $ref: "b.json" } } },
      "b.json": {
        type: "object",
        properties: { a: { $ref: "a.json", description: "b a" } },
      },
    }
    const result: any = await dereference("r.json", memResolver(doc).resolver)
    expect(result.properties.a.description).toBe("root a")
    for (const { ref } of collectRefs(result)) {
      expect(resolveInternal(result, ref as string)).not.toBeUndefined()
    }
  })

  // ISSUE-RB-24: with fullCrawl the cached node is re-crawled and its cycle placeholders are re-resolved against the source; combined with the sibling-aware cycle check in state.refNodes (a ref with siblings is only treated as a cycle when the previous ref node matches) the expansion never reaches a fixed point and the process runs out of memory. Skipped instead of it.fails because the call never returns.
  it("D4.21 fullCrawl terminates when a sibling ref targets a node that loops back through a pure alias of the same target", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: {
          a: { $ref: "#/definitions/X", description: "sib" },
          b: { $ref: "#/definitions/X" },
        },
        definitions: {
          X: {
            type: "object",
            properties: { loop: { $ref: "#/properties/b" } },
          },
        },
      },
    }
    const result: any = await dereference("r.json", memResolver(doc).resolver, {
      fullCrawl: true,
    })
    expect(result.properties.a.description).toBe("sib")
    for (const { ref } of collectRefs(result)) {
      expect(resolveInternal(result, ref as string)).not.toBeUndefined()
    }
  })

  it("D4.22 a root $ref into its own sibling definitions is resolved, siblings kept", async () => {
    const doc = {
      "r.json": {
        $ref: "#/definitions/X",
        description: "root",
        definitions: { X: { type: "string" } },
      },
    }
    const onError = vi.fn()
    const result: any = await dereference("r.json", memResolver(doc).resolver, {
      hooks: { onError },
    })
    expect(onError).not.toHaveBeenCalled()
    expect(result).toEqual({
      type: "string",
      description: "root",
      definitions: { X: { type: "string" } },
    })
  })

  it("D4.23 a root $ref into its siblings resolves refs inside the target and inside the siblings", async () => {
    const doc = {
      "r.json": {
        $ref: "#/definitions/X",
        definitions: {
          X: { type: "object", properties: { y: { $ref: "#/definitions/Y" } } },
          Y: { $ref: "#/definitions/Z" },
          Z: { type: "number" },
          E: { $ref: "x.json" },
        },
      },
      "x.json": { type: "boolean" },
    }
    const onCycle = vi.fn()
    const result: any = await dereference("r.json", memResolver(doc).resolver, {
      hooks: { onCycle },
    })
    expect(onCycle).not.toHaveBeenCalled()
    expect(collectRefs(result)).toEqual([])
    expect(result.properties.y).toEqual({ type: "number" })
    expect(result.definitions.Y).toEqual({ type: "number" })
    expect(result.definitions.E).toEqual({ type: "boolean" })
  })

  it("D4.24 a root $ref chain through its own siblings reaches the final target", async () => {
    const doc = {
      "r.json": {
        $ref: "#/definitions/X",
        definitions: { X: { $ref: "#/definitions/Y" }, Y: { type: "number" } },
      },
    }
    const result: any = await dereference("r.json", memResolver(doc).resolver)
    expect(result).toEqual({
      type: "number",
      definitions: { X: { type: "number" }, Y: { type: "number" } },
    })
  })

  it("D4.25 a sibling ref to the same target as its $ref is not a cycle", async () => {
    const doc = {
      "r.json": {
        a: { $ref: "#/definitions/Y", extra: { $ref: "#/definitions/Y" } },
        definitions: { Y: { type: "number" } },
      },
    }
    const onCycle = vi.fn()
    const result: any = await dereference("r.json", memResolver(doc).resolver, {
      hooks: { onCycle },
    })
    expect(onCycle).not.toHaveBeenCalled()
    expect(result.a).toEqual({ type: "number", extra: { type: "number" } })
  })

  it("D4.26 a ref back to the root through a root $ref with siblings is a cycle to the root", async () => {
    const doc = {
      "r.json": {
        $ref: "#/definitions/X",
        definitions: {
          X: { type: "object", properties: { self: { $ref: "#" } } },
        },
      },
    }
    const result: any = await dereference("r.json", memResolver(doc).resolver)
    expect(result.properties.self).toEqual({ $ref: "#" })
    expect(result.definitions.X.properties.self).toEqual({ $ref: "#" })

    const circular: any = await dereference(
      "r.json",
      memResolver(doc).resolver,
      { enableCircular: true },
    )
    expect(circular.properties.self).toBe(circular)
    expect(circular.definitions.X.properties.self).toBe(circular)
  })

  it("D4.27 a ref back to a $ref node with siblings is a cycle to that node", async () => {
    const doc = {
      "r.json": {
        a: { $ref: "#/definitions/Y", extra: { $ref: "#/a" } },
        definitions: { Y: { type: "number" } },
      },
    }
    const result: any = await dereference("r.json", memResolver(doc).resolver)
    expect(result.a).toEqual({ type: "number", extra: { $ref: "#/a" } })

    const circular: any = await dereference(
      "r.json",
      memResolver(doc).resolver,
      { enableCircular: true },
    )
    expect(circular.a.extra).toBe(circular.a)
  })

  it("D4.28 a self reference with siblings terminates and keeps the sibling content", async () => {
    const doc = {
      "r.json": {
        definitions: {
          thing: {
            $ref: "#/definitions/thing",
            title: "thing",
            description: "self",
          },
        },
        properties: { a: { $ref: "#/definitions/thing" } },
      },
    }
    for (const enableCircular of [false, true]) {
      const result: any = await dereference(
        "r.json",
        memResolver(doc).resolver,
        {
          enableCircular,
        },
      )
      expect(result.definitions.thing).toMatchObject({
        title: "thing",
        description: "self",
      })
      expect(result.properties.a).toMatchObject({
        title: "thing",
        description: "self",
      })
      for (const { ref } of collectRefs(result)) {
        expect(resolveInternal(result, ref as string)).not.toBeUndefined()
      }
    }
  })

  // ISSUE-RB-25: the cycle check matches the target only, not the sibling signature of its materialisation: inside `extended` (target + description) the reference back to the target is taken for a cycle to `extended` itself, so `self` inherits a description the target does not have.
  it.fails("D4.29 a reference back to the target from inside an extended copy is the plain target", async () => {
    const doc = {
      "r.json": {
        extended: {
          $ref: "#/$defs/target",
          description: "sibling description",
        },
        plain: { $ref: "#/$defs/target" },
        $defs: {
          target: {
            type: "object",
            properties: { self: { $ref: "#/$defs/target" } },
          },
        },
      },
    }
    const result: any = await dereference("r.json", memResolver(doc).resolver, {
      enableCircular: true,
    })
    expect(result.extended.description).toBe("sibling description")
    expect(result.plain).not.toHaveProperty("description")
    expect(result.plain.properties.self).toBe(result.plain)
    expect(result.extended.properties.self).not.toHaveProperty("description")

    const placeholders: any = await dereference(
      "r.json",
      memResolver(doc).resolver,
    )
    const self = resolveInternal(
      placeholders,
      placeholders.extended.properties.self.$ref,
    )
    expect(self).not.toHaveProperty("description")
  })

  // ISSUE-RB-26: content inlined from another document keeps its `$id`; an external schema referenced twice appears twice with the same `$id`, which validators reject as a duplicate identifier (bundle drops it since 1.0.0).
  it.fails("D4.30 dereference does not repeat the $id of an external schema inlined twice", async () => {
    const doc = {
      "r.json": {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        properties: {
          a: { $ref: "s.json" },
          b: { $ref: "s.json", description: "d" },
        },
      },
      "s.json": { $id: "http://x.test/s.json", type: "string" },
    }
    const result: any = await dereference("r.json", memResolver(doc).resolver)
    const ids = [result.properties.a.$id, result.properties.b.$id].filter(
      (id) => id !== undefined,
    )
    expect(new Set(ids).size).toBe(ids.length)
  })

  // ISSUE-RB-27: siblings that the strategy drops ("ignore", or everything but description/summary with "override") are still crawled, so their external refs are handed to the resolver: a wasted, possibly side-effecting load.
  it.fails("D4.31 siblings dropped by the strategy are not loaded", async () => {
    const doc = {
      "r.json": { a: { $ref: "b.json", extra: { $ref: "side.json" } } },
      "b.json": { type: "string" },
      "side.json": { s: 1 },
    }
    for (const siblingStrategy of ["ignore", "override"] as const) {
      const { resolver, calls } = memResolver(doc)
      const result: any = await dereference("r.json", resolver, {
        siblingStrategy,
      })
      expect(result.a).toEqual({ type: "string" })
      expect(calls).not.toContain("side.json")
    }
  })
})
