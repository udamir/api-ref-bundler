import { describe, expect, it, vi } from "vite-plus/test"
import { bundle, dereference } from "../../src"
import { memResolver } from "./helpers"

// Block E: external references and the resolver contract (RFC 3986 reference resolution)

const tree = {
  "api/v1/root.json": {
    type: "object",
    properties: {
      a: { $ref: "./schemas/a.json" },
      b: { $ref: "../common/b.json#/definitions/B" },
      aAgain: { $ref: "schemas/../schemas/a.json" },
    },
  },
  "api/v1/schemas/a.json": {
    type: "object",
    title: "A",
    properties: {
      b: { $ref: "../../common/b.json#/definitions/B" },
      c: { $ref: "c.json" },
    },
  },
  "api/v1/schemas/c.json": { title: "C", type: "string" },
  "api/common/b.json": {
    definitions: {
      B: {
        title: "B",
        type: "integer",
        properties: { back: { $ref: "../v1/schemas/c.json" } },
      },
    },
  },
}

describe("E2 external references", () => {
  it("E2.1 a relative path is resolved against the directory of the referencing file", async () => {
    const { resolver, calls } = memResolver(tree)
    const result: any = await dereference("api/v1/root.json", resolver)
    expect(result.properties.a.title).toBe("A")
    expect(calls).toContain("api/v1/schemas/a.json")
  })

  it("E2.2 './' and '../' segments are normalised and the same file keeps one identity", async () => {
    const { resolver, calls } = memResolver(tree)
    const bundled: any = await bundle("api/v1/root.json", resolver)
    expect(bundled.properties.a.$ref).toBe(bundled.properties.aAgain.$ref)
    expect(calls.filter((c) => c === "api/v1/schemas/a.json")).toHaveLength(1)
    expect(calls).toContain("api/common/b.json")
  })

  it("E2.3 nested external -> external chains resolve against each file's own location", async () => {
    const { resolver, calls } = memResolver(tree)
    const result: any = await dereference("api/v1/root.json", resolver)
    expect(result.properties.a.properties.c).toEqual({
      title: "C",
      type: "string",
    })
    expect(result.properties.a.properties.b.properties.back.title).toBe("C")
    expect(calls).toEqual([
      "api/v1/root.json",
      "api/v1/schemas/a.json",
      "api/common/b.json",
      "api/v1/schemas/c.json",
    ])
  })

  it("E2.4 the same file referenced from two files is loaded once and bundled once", async () => {
    const { resolver, calls } = memResolver(tree)
    const bundled: any = await bundle("api/v1/root.json", resolver)
    expect(calls.filter((c) => c === "api/common/b.json")).toHaveLength(1)
    const defs = Object.values(bundled.definitions) as any[]
    expect(defs.filter((d) => d.title === "B")).toHaveLength(1)
    expect(bundled.properties.b.$ref).toBe(
      bundled.definitions.a.properties.b.$ref,
    )
  })

  it("E2.5 an external ref with an internal fragment addresses inside the other file", async () => {
    const result: any = await dereference(
      "api/v1/root.json",
      memResolver(tree).resolver,
    )
    expect(result.properties.b.title).toBe("B")
    expect(result.properties.b.type).toBe("integer")
  })

  it("E2.6 '.md' references become plain strings in both modes", async () => {
    const doc = {
      "root.json": {
        type: "object",
        properties: {
          readme: { $ref: "README.md" },
          section: { $ref: "doc.md#/section" },
          nested: { $ref: "x.json" },
        },
      },
      "x.json": { type: "object", description: { $ref: "d.md" } },
      "README.md": "# hello",
      "doc.md": "text",
      "d.md": "docs",
    }
    const result: any = await dereference(
      "root.json",
      memResolver(doc).resolver,
    )
    expect(result.properties.readme).toBe("# hello")
    expect(result.properties.section).toBe("text")
    expect(result.properties.nested.description).toBe("docs")
    const bundled: any = await bundle("root.json", memResolver(doc).resolver)
    expect(bundled.properties.readme).toBe("# hello")
    expect(bundled.properties.section).toBe("text")
    expect(bundled.definitions.x.description).toBe("docs")
  })

  // ISSUE-RB-02: relativePath() runs posix normalize() on URLs, collapsing "https://" into "https:/", so every relative $ref from an http(s) base is broken.
  it("E2.7 relative refs are resolved against an absolute http(s) base URL (RFC 3986 §5.2)", async () => {
    const doc = {
      "https://example.com/api/root.json": {
        type: "object",
        properties: {
          a: { $ref: "schemas/a.json" },
          up: { $ref: "../d.json" },
        },
      },
      "https://example.com/api/schemas/a.json": { title: "A" },
      "https://example.com/d.json": { title: "D" },
    }
    const { resolver, calls } = memResolver(doc)
    const result: any = await dereference(
      "https://example.com/api/root.json",
      resolver,
    )
    expect(calls).toContain("https://example.com/api/schemas/a.json")
    expect(result.properties.a).toEqual({ title: "A" })
    expect(result.properties.up).toEqual({ title: "D" })
  })

  // ISSUE-RB-02: validURL() requires a dotted TLD and only http(s), so localhost / intranet hosts / file: URLs are treated as relative paths and mangled.
  it("E2.7b URLs without a TLD (localhost) and file: URLs are passed through untouched", async () => {
    const doc = {
      "http://localhost:8080/root.json": {
        type: "object",
        properties: { a: { $ref: "a.json" } },
      },
      "http://localhost:8080/a.json": { title: "A" },
    }
    const { resolver, calls } = memResolver(doc)
    await dereference("http://localhost:8080/root.json", resolver)
    expect(calls).toEqual([
      "http://localhost:8080/root.json",
      "http://localhost:8080/a.json",
    ])
  })

  it("E2.8 an absolute URL ref from a file base is passed to the resolver verbatim", async () => {
    const doc = {
      "root.json": {
        type: "object",
        properties: { b: { $ref: "https://other.org/b.json#/B" } },
      },
      "https://other.org/b.json": { B: { title: "B" } },
    }
    const { resolver, calls } = memResolver(doc)
    const result: any = await dereference("root.json", resolver)
    expect(calls).toContain("https://other.org/b.json")
    expect(result.properties.b).toEqual({ title: "B" })
    const bundled: any = await bundle("root.json", memResolver(doc).resolver)
    expect(bundled.properties.b).toEqual({ $ref: "#/definitions/B" })
  })

  // ISSUE-RB-03: relativePath() replaces the last segment of the base with the ref even when the ref starts with "/", so an absolute-path reference is resolved under the base directory (RFC 3986 §5.2.2 requires it to replace the whole path).
  it("E2.9 an absolute-path reference replaces the base path", async () => {
    const doc = {
      "/root/r.json": {
        type: "object",
        properties: { a: { $ref: "/lib/x.json" } },
      },
      "/lib/x.json": { title: "abs" },
    }
    const { resolver, calls } = memResolver(doc)
    const result: any = await dereference("/root/r.json", resolver)
    expect(calls).toContain("/lib/x.json")
    expect(result.properties.a).toEqual({ title: "abs" })
  })

  it("E2.10 the resolver may return a promise or a plain value", async () => {
    const doc: Record<string, unknown> = {
      "root.json": { type: "object", properties: { a: { $ref: "x.json" } } },
      "x.json": { title: "sync" },
    }
    const syncResolver = ((p: string) => doc[p]) as any
    const result: any = await dereference("root.json", syncResolver)
    expect(result.properties.a).toEqual({ title: "sync" })
    const bundled: any = await bundle("root.json", syncResolver)
    expect(bundled.definitions.x).toEqual({ title: "sync" })
  })

  it("E2.11 nested paths handed to the resolver are normalised", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: { x: { $ref: "./sub/../x.json" } },
      },
      "x.json": { title: "x" },
    }
    const { resolver, calls } = memResolver(doc)
    await dereference("r.json", resolver)
    expect(calls).toEqual(["r.json", "x.json"])
  })

  it("E2.11b dereference normalises the base path before calling the resolver", async () => {
    const doc = {
      "r.json": { type: "object", properties: { x: { $ref: "x.json" } } },
      "x.json": { title: "x" },
    }
    const { resolver, calls } = memResolver(doc)
    const result: any = await dereference("./a/../r.json", resolver)
    expect(calls[0]).toBe("r.json")
    expect(result.properties.x).toEqual({ title: "x" })
  })

  // ISSUE-RB-17: bundle() hands the raw baseFile to the resolver (RefResolver is created before normalisation) while dereference() normalises it first; the two entry points disagree and bundle silently returns {} when the resolver only knows the normalised name.
  it("E2.11c bundle normalises the base path before calling the resolver (same as dereference)", async () => {
    const doc = {
      "r.json": { type: "object", properties: { x: { $ref: "x.json" } } },
      "x.json": { title: "x" },
    }
    const { resolver, calls } = memResolver(doc)
    const bundled: any = await bundle("./a/../r.json", resolver)
    expect(calls[0]).toBe("r.json")
    expect(bundled.definitions.x).toEqual({ title: "x" })
  })

  it("E2.12 a resolver error for a nested file is reported through onError and the ref is kept as written", async () => {
    const doc = {
      "dir/root.json": {
        type: "object",
        properties: { a: { $ref: "../missing.json#/x" } },
      },
    }
    const onError = vi.fn()
    const result: any = await dereference(
      "dir/root.json",
      memResolver(doc).resolver,
      {
        hooks: { onError },
      },
    )
    // 1.0.0: onError receives a third `detail` argument
    expect(onError).toHaveBeenCalledWith(
      "Cannot resolve: missing.json#/x",
      expect.anything(),
      expect.objectContaining({
        type: "error",
        document: "missing.json",
        tokens: ["x"],
      }),
    )
    expect(result.properties.a).toEqual({ $ref: "../missing.json#/x" })

    const onBundleError = vi.fn()
    const bundled: any = await bundle(
      "dir/root.json",
      memResolver(doc).resolver,
      {
        hooks: { onError: onBundleError },
      },
    )
    expect(onBundleError).toHaveBeenCalledWith(
      "Cannot resolve: missing.json#/x",
      expect.anything(),
      expect.objectContaining({ type: "error", document: "missing.json" }),
    )
    expect(bundled.properties.a).toEqual({ $ref: "../missing.json#/x" })
  })

  it("E2.13 an onError hook that throws rejects the returned promise", async () => {
    const doc = {
      "root.json": { type: "object", properties: { a: { $ref: "nope.json" } } },
    }
    const onError = (message: string) => {
      throw new Error(message)
    }
    await expect(
      dereference("root.json", memResolver(doc).resolver, {
        hooks: { onError },
      }),
    ).rejects.toThrow("Cannot resolve: nope.json")
    await expect(
      bundle("root.json", memResolver(doc).resolver, { hooks: { onError } }),
    ).rejects.toThrow("Cannot resolve: nope.json")
  })

  // ISSUE-RB-04: RefResolver.resolve() swallows the resolver's exception; when the base document cannot be loaded dereference() resolves to undefined and bundle() to {} without calling onError or rejecting.
  it("E2.14 a resolver error for the base document surfaces (onError or rejection)", async () => {
    const onError = vi.fn()
    let rejected = false
    await dereference("missing.json", memResolver({}).resolver, {
      hooks: { onError },
    }).catch(() => {
      rejected = true
    })
    expect(rejected || onError.mock.calls.length > 0).toBe(true)
  })

  it("E2.15 a query string in the file part is preserved for the resolver", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: { a: { $ref: "x.json?v=1#/a" } },
      },
      "x.json?v=1": { a: { title: "q" } },
    }
    const result: any = await dereference("r.json", memResolver(doc).resolver)
    expect(result.properties.a).toEqual({ title: "q" })
  })

  it("E2.16 an empty $ref ('') is a same-document reference (RFC 3986 §4.4)", async () => {
    const doc = {
      "r.json": { type: "object", properties: { a: { $ref: "" } } },
    }
    const result: any = await dereference("r.json", memResolver(doc).resolver)
    expect(result.properties.a).toEqual({ $ref: "#" })
  })

  it("E2.17 an unresolvable ref kept in the output resolves to the same location from the output document", async () => {
    const doc = {
      "dir/e.json": {
        a: { $ref: "./missing.json" },
        b: { $ref: "sub/x.json" },
        c: { $ref: "#/nope" },
      },
      "dir/sub/x.json": {
        type: "object",
        properties: { c: { $ref: "../missing.json#/y" } },
      },
    }
    for (const run of [dereference, bundle]) {
      const onError = vi.fn()
      const result: any = await run("dir/e.json", memResolver(doc).resolver, {
        hooks: { onError },
      })
      expect(onError).toHaveBeenCalledTimes(3)
      expect(result.a).toEqual({ $ref: "./missing.json" })
      expect(result.c).toEqual({ $ref: "#/nope" })
      expect(result.b.properties.c).toEqual({ $ref: "missing.json#/y" })
    }
  })
})
