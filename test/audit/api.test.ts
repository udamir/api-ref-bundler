import { describe, expect, it, vi } from "vite-plus/test"
import {
  bundle,
  bundleSync,
  createBundler,
  dereference,
  dereferenceSync,
  RefResolveError,
} from "../../src"
import { expectAllRefsInternalAndResolvable, memResolver } from "./helpers"

// Block A: additive 1.0.0 API (createBundler, sync variants, siblingStrategy, definitions, typed errors)

const files = {
  "r.json": {
    type: "object",
    properties: {
      a: { $ref: "x.json", description: "sib" },
      b: { $ref: "x.json#/properties/n" },
      c: { $ref: "y.json", enum: [3] },
    },
  },
  "x.json": { type: "object", properties: { n: { type: "string" } } },
  "y.json": { type: "integer", enum: [1, 2] },
}

describe("A11 additive API", () => {
  it("A11.1 createBundler builds the graph once and emits both outputs from it", async () => {
    const { resolver, calls } = memResolver(files)
    const bundler = await createBundler("r.json", resolver)
    const bundled: any = bundler.bundle()
    const dereferenced: any = bundler.dereference()
    expect(calls).toEqual(["r.json", "x.json", "y.json"])
    expect(bundled).toEqual(await bundle("r.json", memResolver(files).resolver))
    expect(dereferenced).toEqual(
      await dereference("r.json", memResolver(files).resolver),
    )
    expect(bundler.errors).toEqual([])
    expect(bundler.graph.targets.size).toBeGreaterThan(0)
    expect(bundler.sourceMap.get("#/definitions/x")).toEqual({
      document: "x.json",
      tokens: [],
    })
    expect(bundler.sourceMap.get("#/definitions/y")).toEqual({
      document: "y.json",
      tokens: [],
    })
  })

  it("A11.2 bundleSync / dereferenceSync work over a pre-loaded document map", async () => {
    const documents = new Map(Object.entries(files))
    expect(bundleSync("r.json", documents)).toEqual(
      await bundle("r.json", memResolver(files).resolver),
    )
    expect(dereferenceSync("./a/../r.json", documents)).toEqual(
      await dereference("r.json", memResolver(files).resolver),
    )
    const onError = vi.fn()
    const bundled: any = bundleSync(
      "r.json",
      new Map([
        [
          "r.json",
          { type: "object", properties: { a: { $ref: "nope.json" } } },
        ],
      ]),
      { hooks: { onError } },
    )
    expect(onError).toHaveBeenCalledTimes(1)
    expect(bundled.properties.a).toEqual({ $ref: "nope.json" })
    expect(() => bundleSync("missing.json", documents)).toThrow(RefResolveError)
  })

  it("A11.3 siblingStrategy controls how $ref siblings are combined", async () => {
    const { resolver } = memResolver(files)
    const allOf: any = await dereference("r.json", resolver, {
      siblingStrategy: "allOf",
    })
    expect(allOf.properties.c).toEqual({
      allOf: [{ type: "integer", enum: [1, 2] }, { enum: [3] }],
    })
    const override: any = await dereference(
      "r.json",
      memResolver(files).resolver,
      {
        siblingStrategy: "override",
      },
    )
    expect(override.properties.a.description).toBe("sib")
    expect(override.properties.c).toEqual({ type: "integer", enum: [1, 2] })
    const ignore: any = await dereference(
      "r.json",
      memResolver(files).resolver,
      {
        siblingStrategy: "ignore",
      },
    )
    expect(ignore.properties.a.description).toBeUndefined()
    const merge: any = await dereference("r.json", memResolver(files).resolver)
    expect(merge.properties.c.enum).toEqual([1, 2, 3])

    const bundledAllOf: any = await bundle(
      "r.json",
      memResolver(files).resolver,
      {
        siblingStrategy: "allOf",
      },
    )
    expect(bundledAllOf.properties.c).toEqual({
      allOf: [{ $ref: "#/definitions/y" }, { enum: [3] }],
    })
    expectAllRefsInternalAndResolvable(bundledAllOf)
    const bundledIgnore: any = await bundle(
      "r.json",
      memResolver(files).resolver,
      {
        siblingStrategy: "ignore",
      },
    )
    expect(bundledIgnore.properties.a).toEqual({ $ref: "#/definitions/x" })
  })

  it("A11.4 definitions.container and definitions.naming control the layout", async () => {
    const bundled: any = await bundle("r.json", memResolver(files).resolver, {
      definitions: {
        container: "/$defs",
        naming: ({ document }) => `Ext_${document.replace(".json", "")}`,
      },
    })
    expect(bundled.definitions).toBeUndefined()
    expect(Object.keys(bundled.$defs).sort()).toEqual(["Ext_x", "Ext_y"])
    expect(bundled.properties.a.$ref).toBe("#/$defs/Ext_x")
    expect(bundled.properties.b.$ref).toBe("#/$defs/Ext_x/properties/n")
    expectAllRefsInternalAndResolvable(bundled)
  })

  it("A11.5 onError receives a typed detail and base failures reject with RefResolveError", async () => {
    const onError = vi.fn()
    await dereference(
      "r.json",
      memResolver({ "r.json": { a: { $ref: "x.json#/nope" } }, "x.json": {} })
        .resolver,
      {
        hooks: { onError },
      },
    )
    expect(onError.mock.calls[0][2]).toEqual({
      type: "missing",
      ref: "x.json#/nope",
      document: "x.json",
      tokens: ["nope"],
    })
    await expect(
      dereference("r.json#/missing", memResolver(files).resolver),
    ).rejects.toMatchObject({
      name: "RefResolveError",
      detail: { type: "missing", document: "r.json", tokens: ["missing"] },
    })
  })

  it("A11.6 parallelCrawl loads a wave of documents concurrently and keeps the output", async () => {
    const wide: Record<string, unknown> = {
      "r.json": {
        type: "object",
        properties: Object.fromEntries(
          Array.from({ length: 20 }, (_, i) => [
            `p${i}`,
            { $ref: `f${i}.json` },
          ]),
        ),
      },
    }
    for (let i = 0; i < 20; i++) {
      wide[`f${i}.json`] = { title: `f${i}` }
    }
    let active = 0
    let peak = 0
    const resolver = async (p: string) => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 2))
      active--
      return wide[p] as object
    }
    const parallel = await bundle("r.json", resolver, { parallelCrawl: true })
    expect(peak).toBeGreaterThan(1)
    expect(parallel).toEqual(await bundle("r.json", memResolver(wide).resolver))
  })
})
