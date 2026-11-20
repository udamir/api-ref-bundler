import { describe, expect, it, vi } from "vite-plus/test"
import { bundle } from "../../src"
import {
  expectAllRefsInternalAndResolvable,
  memResolver,
  resolveInternal,
  roundTrip,
} from "./helpers"

// Block B: bundling mechanics (naming, collisions, siblings, idempotence)

describe("B3 bundling", () => {
  it("B3.1 an external file becomes a definition named after the file (extension stripped)", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: {
          a: { $ref: "schemas/Pet.yaml" },
          b: { $ref: "schemas/Owner.yml" },
          c: { $ref: "schemas/Tag.json" },
        },
      },
      "schemas/Pet.yaml": { title: "Pet" },
      "schemas/Owner.yml": { title: "Owner" },
      "schemas/Tag.json": { title: "Tag" },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    expect(Object.keys(bundled.definitions).sort()).toEqual([
      "Owner",
      "Pet",
      "Tag",
    ])
    expect(bundled.properties.a).toEqual({ $ref: "#/definitions/Pet" })
  })

  it("B3.2 $id / id of the external schema is preferred as the definition name", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: { a: { $ref: "x.json" }, b: { $ref: "y.json" } },
      },
      "x.json": { $id: "ErrorSchema", type: "object" },
      "y.json": { id: "LegacyId", type: "object" },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    expect(bundled.properties.a).toEqual({ $ref: "#/definitions/ErrorSchema" })
    expect(bundled.properties.b).toEqual({ $ref: "#/definitions/LegacyId" })
  })

  it("B3.3 a sub-pointer ref is named after the last pointer segment", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: {
          a: { $ref: "lib.json#/components/schemas/Thing" },
          b: { $ref: "lib.json#/components/schemas/Other" },
        },
      },
      "lib.json": {
        components: {
          schemas: {
            Thing: {
              title: "Thing",
              properties: { o: { $ref: "#/components/schemas/Other" } },
            },
            Other: { title: "Other" },
          },
        },
      },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    expect(bundled.properties.a).toEqual({ $ref: "#/definitions/Thing" })
    expect(bundled.definitions.Thing.properties.o).toEqual({
      $ref: "#/definitions/Other",
    })
    expect(bundled.definitions.Other).toEqual({ title: "Other" })
  })

  it("B3.4 same basename in two directories is renamed deterministically", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: {
          a: { $ref: "v1/Pet.json" },
          b: { $ref: "v2/Pet.json" },
          c: { $ref: "v1/Pet.json" },
        },
      },
      "v1/Pet.json": { title: "Pet v1" },
      "v2/Pet.json": { title: "Pet v2" },
    }
    const first: any = await bundle("r.json", memResolver(doc).resolver)
    const second: any = await bundle("r.json", memResolver(doc).resolver)
    expect(first).toEqual(second)
    expect(first.properties.a.$ref).toBe(first.properties.c.$ref)
    expect(first.properties.a.$ref).not.toBe(first.properties.b.$ref)
    expect(first.definitions.Pet).toEqual({ title: "Pet v1" })
    expect(first.definitions.Pet1).toEqual({ title: "Pet v2" })
  })

  it("B3.5 a collision with an existing root definition renames the newcomer and leaves the local one untouched", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: { a: { $ref: "Pet.json" } },
        definitions: { Pet: { title: "local" }, Pet1: { title: "local1" } },
      },
      "Pet.json": { title: "ext" },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    expect(bundled.definitions.Pet).toEqual({ title: "local" })
    expect(bundled.definitions.Pet1).toEqual({ title: "local1" })
    expect(bundled.definitions.Pet2).toEqual({ title: "ext" })
    expect(bundled.properties.a).toEqual({ $ref: "#/definitions/Pet2" })
  })

  it("B3.6 a root definition that is a pure alias to the external ref is reused", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: { a: { $ref: "Pet.json" } },
        definitions: { MyPet: { $ref: "Pet.json" } },
      },
      "Pet.json": { title: "ext" },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    expect(bundled.definitions).toEqual({ MyPet: { title: "ext" } })
    expect(bundled.properties.a).toEqual({ $ref: "#/definitions/MyPet" })
  })

  it("B3.7 sibling properties are preserved next to the rewritten $ref", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: { a: { $ref: "x.json", description: "sib", title: "T" } },
      },
      "x.json": { type: "string", title: "X" },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    expect(bundled.properties.a).toEqual({
      $ref: "#/definitions/x",
      description: "sib",
      title: "T",
    })
    expect(bundled.definitions.x).toEqual({ type: "string", title: "X" })
  })

  // ISSUE-RB-09: BundleOptions.ignoreSibling is documented as "ignore $ref sibling content" but bundle() only consults it on the inline (rule-less) path; hoisted refs always keep their siblings.
  it("B3.8 ignoreSibling drops sibling content next to the rewritten $ref", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: { a: { $ref: "x.json", description: "sib" } },
      },
      "x.json": { type: "string" },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver, {
      ignoreSibling: true,
    })
    expect(bundled.properties.a).toEqual({ $ref: "#/definitions/x" })
  })

  it("B3.9 the same external schema reached by two paths yields one definition", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: {
          a: { $ref: "x.json" },
          b: { $ref: "./x.json" },
          sub: { $ref: "x.json#/properties/n" },
        },
      },
      "x.json": { type: "object", properties: { n: { type: "string" } } },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    expect(Object.keys(bundled.definitions)).toEqual(["x"])
    expect(bundled.properties.a.$ref).toBe(bundled.properties.b.$ref)
    expect(bundled.properties.sub).toEqual({
      $ref: "#/definitions/x/properties/n",
    })
  })

  // ISSUE-RB-08: definition placement depends on traversal order; when a sub-pointer ref is met before the whole-file ref both are hoisted separately and the content is duplicated.
  it("B3.10 a sub-pointer ref met before the whole-file ref still yields one definition", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: {
          sub: { $ref: "x.json#/properties/n" },
          a: { $ref: "x.json" },
        },
      },
      "x.json": { type: "object", properties: { n: { type: "string" } } },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    expect(Object.keys(bundled.definitions)).toEqual(["x"])
    expect(bundled.properties.sub).toEqual({
      $ref: "#/definitions/x/properties/n",
    })
  })

  it("B3.11 'definitions' of an external file are hoisted with renaming and its internal refs rewritten", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: {
          a: { $ref: "a.json" },
          b: { $ref: "b.json" },
          c: { $ref: "a.json#/definitions/Inner" },
        },
        definitions: { Inner: { title: "root Inner" } },
      },
      "a.json": {
        type: "object",
        properties: { i: { $ref: "#/definitions/Inner" } },
        definitions: { Inner: { title: "a Inner" } },
      },
      "b.json": {
        type: "object",
        properties: { i: { $ref: "#/definitions/Inner" } },
        definitions: { Inner: { title: "b Inner" } },
      },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    expect(bundled.definitions.Inner).toEqual({ title: "root Inner" })
    // 1.0.0 contract change (RB-06): the hoisted copy keeps its own `definitions`, internal refs are rewritten through the plan
    expect(bundled.definitions.a.definitions).toEqual({
      Inner: { title: "a Inner" },
    })
    expect(bundled.properties.c).toEqual({
      $ref: "#/definitions/a/definitions/Inner",
    })
    expect(bundled.properties.c.$ref).toBe(
      bundled.definitions.a.properties.i.$ref,
    )
    expect(bundled.definitions.a.properties.i.$ref).not.toBe(
      bundled.definitions.b.properties.i.$ref,
    )
    expectAllRefsInternalAndResolvable(bundled)
  })

  // ISSUE-RB-06: bundle() strips `$defs` from the hoisted copy (`const { $defs, definitions, ...jsonSchema }`) but the "/(definitions|defs)/" branch does not match "/$defs", so inner "#/$defs/X" refs are rewritten to "#/definitions/<name>/$defs/X", which no longer exists.
  it("B3.12 '$defs' of an external file are hoisted and its '#/$defs/...' refs stay resolvable", async () => {
    const doc = {
      "r.json": { type: "object", properties: { a: { $ref: "a.json" } } },
      "a.json": {
        type: "object",
        properties: { j: { $ref: "#/$defs/Deep" } },
        $defs: { Deep: { title: "a Deep" } },
      },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    expectAllRefsInternalAndResolvable(bundled)
  })

  it("B3.13 bundle(bundle(x)) is a fixed point", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: {
          a: { $ref: "a.json" },
          b: { $ref: "b.json#/definitions/B", description: "sib" },
        },
      },
      "a.json": {
        type: "object",
        properties: {
          i: { $ref: "#/definitions/Inner" },
          b: { $ref: "b.json#/definitions/B" },
        },
        definitions: { Inner: { title: "a Inner" } },
      },
      "b.json": {
        definitions: {
          B: { title: "B", properties: { a: { $ref: "a.json" } } },
        },
      },
    }
    const once: any = await bundle("r.json", memResolver(doc).resolver)
    const twice: any = await bundle(
      "bundled.json",
      memResolver({ "bundled.json": roundTrip(once) }).resolver,
    )
    expect(twice).toEqual(once)
  })

  it("B3.14 a multi-file document bundles into a self-contained document", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: { a: { $ref: "a.json" }, l: { $ref: "lib.json#/L" } },
      },
      "a.json": {
        type: "object",
        properties: { l: { $ref: "lib.json#/L" }, s: { $ref: "#" } },
      },
      "lib.json": { L: { type: "array", items: { $ref: "a.json" } } },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    expectAllRefsInternalAndResolvable(bundled)
    expect(roundTrip(bundled)).toEqual(bundled)
  })

  // ISSUE-RB-05: a primitive external target goes through `const { $defs, definitions, ...jsonSchema } = resolved`, which turns 5 into {} before it is hoisted.
  it("B3.15 an external target that is a primitive keeps its value", async () => {
    const doc = {
      "r.json": { type: "object", properties: { n: { $ref: "num.json" } } },
      "num.json": 5,
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    const target = bundled.properties.n.$ref
      ? bundled.definitions[bundled.properties.n.$ref.split("/").pop()]
      : bundled.properties.n
    expect(target).toBe(5)
  })

  // ISSUE-RB-07: the rest-spread in bundle() and mergeValues() both convert arrays into plain objects ({"0": ...}).
  it("B3.16 an external target that is an array stays an array", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: { a: { $ref: "arr.json" }, b: { $ref: "arr.json#/0" } },
      },
      "arr.json": [{ title: "first" }],
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    expect(Array.isArray(bundled.definitions.arr)).toBe(true)
  })

  it("B3.17 a chain of refs across files becomes a chain of internal refs", async () => {
    const doc = {
      "r.json": { type: "object", properties: { a: { $ref: "x.json" } } },
      "x.json": { $ref: "y.json" },
      "y.json": { $ref: "z.json#/Z" },
      "z.json": { Z: { title: "Z" } },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    expectAllRefsInternalAndResolvable(bundled)
    let node = bundled.properties.a
    const hops: string[] = []
    while (node.$ref) {
      hops.push(node.$ref)
      node = bundled.definitions[node.$ref.replace("#/definitions/", "")]
    }
    expect(node).toEqual({ title: "Z" })
    expect(hops.length).toBeGreaterThanOrEqual(1)
  })

  it("B3.18 a document of unknown type inlines externals and reuses the first inlined location", async () => {
    const doc = {
      "r.json": { foo: { $ref: "x.json" }, bar: { $ref: "x.json" } },
      "x.json": { hello: "world", nested: { $ref: "y.json" } },
      "y.json": { z: 1 },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    expect(bundled.foo).toEqual({ hello: "world", nested: { z: 1 } })
    expect(bundled.bar).toEqual({ $ref: "#/foo" })
    expectAllRefsInternalAndResolvable(bundled)
  })

  it("B3.19 refs inside arrays (allOf, tuple items) are rewritten", async () => {
    const doc = {
      "r.json": {
        type: "object",
        allOf: [{ $ref: "x.json" }, { $ref: "y.json" }],
        properties: { l: { type: "array", items: [{ $ref: "x.json" }] } },
      },
      "x.json": { title: "x" },
      "y.json": { title: "y" },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    expect(bundled.allOf).toEqual([
      { $ref: "#/definitions/x" },
      { $ref: "#/definitions/y" },
    ])
    expect(bundled.properties.l.items).toEqual([{ $ref: "#/definitions/x" }])
  })

  it("B3.20 an external file referencing back into the root file gets internal refs", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: { a: { $ref: "x.json" } },
        definitions: { R: { title: "root R" } },
      },
      "x.json": {
        type: "object",
        properties: {
          back: { $ref: "r.json#/definitions/R" },
          backRoot: { $ref: "./r.json" },
        },
      },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    expect(bundled.definitions.x.properties.back).toEqual({
      $ref: "#/definitions/R",
    })
    expect(bundled.definitions.x.properties.backRoot).toEqual({ $ref: "#" })
    expect(bundled.definitions.R).toEqual({ title: "root R" })
  })

  // ISSUE-RB-21: JSON Schema documents are always bundled into "definitions"; a 2019-09/2020-12 document (declared $schema or existing $defs) should receive its definitions in "$defs", and documents identified only by $schema/$defs are not detected as JSON Schema at all.
  it("B3.21 a draft 2020-12 document receives bundled definitions in $defs", async () => {
    const doc = {
      "r.json": {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: { a: { $ref: "x.json" } },
        $defs: { Local: { type: "string" } },
      },
      "x.json": { type: "integer" },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    expect(bundled.definitions).toBeUndefined()
    expect(bundled.properties.a.$ref).toMatch(/^#\/\$defs\//)
  })

  it("B3.22 hooks receive normalised refs, crawl/exit callbacks and error context", async () => {
    const doc = {
      "dir/r.json": {
        type: "object",
        properties: { a: { $ref: "x.json" }, bad: { $ref: "../nope.json" } },
      },
      "dir/x.json": { type: "string" },
    }
    const onRef = vi.fn()
    const onCrawl = vi.fn()
    const onExit = vi.fn()
    const onError = vi.fn()
    await bundle("dir/r.json", memResolver(doc).resolver, {
      hooks: { onRef, onCrawl, onExit, onError },
    })
    expect(onRef.mock.calls.map((c) => c[0])).toEqual([
      "dir/x.json",
      "nope.json",
    ])
    expect(onCrawl).toHaveBeenCalled()
    expect(onExit).toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
    const ctx = onError.mock.calls[0][1]
    expect(ctx.path).toEqual(["properties", "bad"])
  })

  it("B3.23 custom rules override the definition location", async () => {
    const doc = {
      "r.json": { type: "object", properties: { a: { $ref: "x.json" } } },
      "x.json": { type: "string" },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver, {
      rules: { "/properties": { "/*": { "#": "/schemas" } } },
    })
    expect(bundled.schemas.x).toEqual({ type: "string" })
    expect(bundled.properties.a).toEqual({ $ref: "#/schemas/x" })
    expect(bundled.definitions).toBeUndefined()
  })

  it("B3.24 a root $ref into its own sibling definitions is kept without a cycle error", async () => {
    const doc = {
      "r.json": {
        $ref: "#/definitions/X",
        description: "root",
        definitions: { X: { type: "string" } },
      },
    }
    const onError = vi.fn()
    const bundled = await bundle("r.json", memResolver(doc).resolver, {
      hooks: { onError },
    })
    expect(onError).not.toHaveBeenCalled()
    expect(bundled).toEqual(doc["r.json"])
  })

  it("B3.25 an external ref behind an internal alias is placed at the alias location, whatever the key order", async () => {
    const files = { "b.json": { type: "string" } }
    const root: any = await bundle(
      "r.json",
      memResolver({
        ...files,
        "r.json": { $ref: "#/defs/X", defs: { X: { $ref: "b.json" } } },
      }).resolver,
    )
    expect(root).toEqual({ $ref: "#/defs/X", defs: { X: { type: "string" } } })

    for (const doc of [
      { a: { $ref: "#/defs/X" }, defs: { X: { $ref: "b.json" } } },
      { defs: { X: { $ref: "b.json" } }, a: { $ref: "#/defs/X" } },
    ]) {
      const bundled: any = await bundle(
        "r.json",
        memResolver({ ...files, "r.json": doc }).resolver,
      )
      expect(bundled.a).toEqual({ $ref: "#/defs/X" })
      expect(bundled.defs.X).toEqual({ type: "string" })
    }
  })

  it("B3.26 bundle reports unresolvable refs of the entry document", async () => {
    const doc = {
      "r.json": {
        definitions: { x: { $ref: "#/definitions/nope" } },
        properties: { a: { $ref: "#/definitions/x" } },
      },
    }
    const onError = vi.fn()
    const bundled: any = await bundle("r.json", memResolver(doc).resolver, {
      hooks: { onError },
    })
    expect(onError).toHaveBeenCalledWith(
      "Cannot resolve: r.json#/definitions/nope",
      expect.anything(),
      expect.objectContaining({ type: "missing" }),
    )
    expect(bundled.definitions.x).toEqual({ $ref: "#/definitions/nope" })
  })

  it("B3.27 a hoisted schema drops its $id so its rewritten pointers resolve against the bundle root", async () => {
    const doc = {
      "r.json": {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        properties: { a: { $ref: "a.json" } },
      },
      "a.json": {
        $id: "http://x.test/a.json",
        $defs: { bar: { type: "string" } },
        properties: { b: { $ref: "#/$defs/bar" } },
      },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    const slot = bundled.properties.a.$ref
    const hoisted: any = resolveInternal(bundled, slot)
    expect(hoisted.$id).toBeUndefined()
    expect(hoisted.properties.b.$ref).toBe(`${slot}/$defs/bar`)
    expectAllRefsInternalAndResolvable(bundled)
  })

  it("B3.28 a draft-04 id is dropped from hoisted schemas, a property named id is kept", async () => {
    const doc = {
      "r.json": {
        $schema: "http://json-schema.org/draft-04/schema#",
        properties: { a: { $ref: "a.json" } },
      },
      "a.json": {
        id: "http://x.test/a.json",
        properties: { id: { type: "integer" } },
      },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    const hoisted: any = resolveInternal(bundled, bundled.properties.a.$ref)
    expect(hoisted).toEqual({ properties: { id: { type: "integer" } } })
  })

  it("B3.29 a hoisted document whose root is a $ref with an $id drops that $id; an $id written next to the entry's $ref is kept", async () => {
    const doc = {
      "r.json": {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        properties: {
          a: { $ref: "http://l/different-id.json" },
          b: { $ref: "x.json", $id: "keep" },
        },
      },
      "http://l/different-id.json": {
        $id: "http://l/real-id.json",
        $ref: "#/$defs/bar",
        $defs: { bar: { type: "string" } },
      },
      "x.json": { $id: "http://l/x.json", type: "string" },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    const a: any = resolveInternal(bundled, bundled.properties.a.$ref)
    expect(a.$id).toBeUndefined()
    expect(resolveInternal(bundled, a.$ref)).toEqual({ type: "string" })
    expect(bundled.properties.b.$id).toBe("keep")
    expect(resolveInternal(bundled, bundled.properties.b.$ref)).toEqual({
      type: "string",
    })
  })

  it("B3.30 a recursive external schema referenced with siblings bundles into a JSON-serializable document", async () => {
    const doc = {
      "list.json": {
        definitions: {
          linkedList: {
            type: "object",
            properties: {
              head: {
                description: "The head of the list",
                $ref: "node.json#/definitions/node",
              },
            },
          },
        },
      },
      "node.json": {
        definitions: {
          node: {
            type: "object",
            properties: {
              data: { type: "integer" },
              next: { $ref: "#/definitions/node" },
            },
          },
        },
      },
    }
    const bundled: any = await bundle("list.json", memResolver(doc).resolver)
    expect(() => JSON.stringify(bundled)).not.toThrow()
    expect(bundled.definitions.linkedList.properties.head.description).toBe(
      "The head of the list",
    )
    expectAllRefsInternalAndResolvable(bundled)
    const node: any = resolveInternal(
      bundled,
      bundled.definitions.linkedList.properties.head.$ref,
    )
    expect(resolveInternal(bundled, node.properties.next.$ref)).toBe(node)
  })
})
