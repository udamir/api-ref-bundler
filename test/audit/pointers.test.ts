import { describe, expect, it, vi } from "vite-plus/test"
import { bundle, dereference } from "../../src"
import { buildPointer, parsePointer } from "../../src/utils"
import { memResolver } from "./helpers"

// Block P: JSON pointer handling (RFC 6901 / RFC 3986 fragment identifiers)

const files = {
  "root.json": {
    type: "object",
    properties: {
      slash: { $ref: "#/definitions/a~1b" },
      tilde: { $ref: "#/definitions/c~0d" },
      tildeOne: { $ref: "#/definitions/e~01f" },
      encoded: { $ref: "#/definitions/%7Bid%7D" },
      space: { $ref: "#/definitions/sp%20ace" },
      index: { $ref: "#/definitions/arr/1" },
      number: { $ref: "#/definitions/num" },
      text: { $ref: "#/definitions/text" },
    },
    definitions: {
      "a/b": { type: "string", title: "slash" },
      "c~d": { type: "string", title: "tilde" },
      "e~1f": { type: "string", title: "literal tilde-one" },
      "{id}": { type: "string", title: "braces" },
      "sp ace": { type: "string", title: "space" },
      arr: [{ title: "zero" }, { title: "one" }],
      num: 42,
      text: "plain",
    },
  },
}

describe("P1 pointer handling", () => {
  it("P1.1 ~1 in a reference token decodes to '/'", async () => {
    const result: any = await dereference(
      "root.json",
      memResolver(files).resolver,
    )
    expect(result.properties.slash).toEqual({ type: "string", title: "slash" })
  })

  it("P1.2 ~0 in a reference token decodes to '~'", async () => {
    const result: any = await dereference(
      "root.json",
      memResolver(files).resolver,
    )
    expect(result.properties.tilde).toEqual({ type: "string", title: "tilde" })
  })

  it("P1.3 ~01 decodes to the literal '~1' (~1 is unescaped before ~0)", async () => {
    const result: any = await dereference(
      "root.json",
      memResolver(files).resolver,
    )
    expect(result.properties.tildeOne).toEqual({
      type: "string",
      title: "literal tilde-one",
    })
  })

  it("P1.4 percent-encoded tokens (%7B, %20) are decoded", async () => {
    const result: any = await dereference(
      "root.json",
      memResolver(files).resolver,
    )
    expect(result.properties.encoded.title).toBe("braces")
    expect(result.properties.space.title).toBe("space")
  })

  it("P1.5 a fragment without a leading '/' is not a valid pointer and is reported", async () => {
    const doc = {
      "root.json": {
        type: "object",
        properties: { a: { $ref: "#definitions/x" } },
        definitions: { x: { type: "string" } },
      },
    }
    const onError = vi.fn()
    const result: any = await dereference(
      "root.json",
      memResolver(doc).resolver,
      {
        hooks: { onError },
      },
    )
    expect(onError).toHaveBeenCalledTimes(1)
    expect(result.properties.a.$ref).toBeDefined()
  })

  it("P1.6 '#', no fragment and 'file#' all address the whole document", async () => {
    const doc = {
      "root.json": {
        type: "object",
        properties: {
          self: { $ref: "#" },
          ext: { $ref: "other.json" },
          extHash: { $ref: "other.json#" },
        },
      },
      "other.json": { type: "string", title: "other" },
    }
    const result: any = await dereference(
      "root.json",
      memResolver(doc).resolver,
    )
    expect(result.properties.self).toEqual({ $ref: "#" })
    expect(result.properties.ext).toEqual({ type: "string", title: "other" })
    expect(result.properties.extHash).toEqual({
      type: "string",
      title: "other",
    })

    const bundled: any = await bundle("root.json", memResolver(doc).resolver)
    expect(bundled.properties.ext.$ref).toBe(bundled.properties.extHash.$ref)
    expect(bundled.properties.self).toEqual({ $ref: "#" })
  })

  // ISSUE-RB-15: parseRef maps the pointer "/" to "" (whole document); RFC 6901 §5 says "/" addresses the member named "".
  it("P1.7 '#/' addresses the member with the empty key", async () => {
    const doc = {
      "root.json": {
        type: "object",
        properties: { a: { $ref: "#/" } },
        "": { title: "empty key" },
      },
    }
    const result: any = await dereference(
      "root.json",
      memResolver(doc).resolver,
    )
    expect(result.properties.a).toEqual({ title: "empty key" })
  })

  it("P1.8 a reference to an array index resolves to that element", async () => {
    const result: any = await dereference(
      "root.json",
      memResolver(files).resolver,
    )
    expect(result.properties.index).toEqual({ title: "one" })
    const bundled: any = await bundle("root.json", memResolver(files).resolver)
    expect(bundled.properties.index).toEqual({ $ref: "#/definitions/arr/1" })
  })

  it("P1.9 out-of-range, negative and non-numeric array indexes are errors", async () => {
    const doc = {
      "root.json": {
        type: "object",
        properties: {
          big: { $ref: "#/definitions/arr/5" },
          neg: { $ref: "#/definitions/arr/-1" },
          nan: { $ref: "#/definitions/arr/x" },
        },
        definitions: { arr: [{ title: "zero" }] },
      },
    }
    const onError = vi.fn()
    await dereference("root.json", memResolver(doc).resolver, {
      hooks: { onError },
    })
    expect(onError).toHaveBeenCalledTimes(3)
  })

  // ISSUE-RB-18: array index tokens are converted with unary plus, so "01" is accepted as 1; RFC 6901 §4 only allows 0 | [1-9][0-9]*.
  it("P1.10 an array index with a leading zero is rejected", async () => {
    const doc = {
      "root.json": {
        type: "object",
        properties: { a: { $ref: "#/definitions/arr/01" } },
        definitions: { arr: [{ title: "zero" }, { title: "one" }] },
      },
    }
    const onError = vi.fn()
    await dereference("root.json", memResolver(doc).resolver, {
      hooks: { onError },
    })
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it("P1.11 references to primitive values (number, string) resolve on dereference", async () => {
    const result: any = await dereference(
      "root.json",
      memResolver(files).resolver,
    )
    expect(result.properties.number).toBe(42)
    expect(result.properties.text).toBe("plain")
  })

  // ISSUE-RB-01: bundle/dereference test `!resolvedPointer.value`, so falsy JSON values (0, "", false, null) are reported as unresolvable.
  it("P1.12 references to falsy primitives (0, '', false, null) resolve", async () => {
    const doc = {
      "root.json": {
        type: "object",
        properties: {
          zero: { $ref: "#/definitions/zero" },
          empty: { $ref: "#/definitions/empty" },
          no: { $ref: "#/definitions/no" },
          nil: { $ref: "#/definitions/nil" },
        },
        definitions: { zero: 0, empty: "", no: false, nil: null },
      },
    }
    const onError = vi.fn()
    const result: any = await dereference(
      "root.json",
      memResolver(doc).resolver,
      {
        hooks: { onError },
      },
    )
    expect(onError).not.toHaveBeenCalled()
    expect(result.properties.zero).toBe(0)
    expect(result.properties.empty).toBe("")
    expect(result.properties.no).toBe(false)
    expect(result.properties.nil).toBeNull()
  })

  it("P1.13 bundle keeps internal references verbatim (only normalises '#/' and '')", async () => {
    const bundled: any = await bundle("root.json", memResolver(files).resolver)
    expect(bundled.properties.slash).toEqual({ $ref: "#/definitions/a~1b" })
    expect(bundled.properties.tilde).toEqual({ $ref: "#/definitions/c~0d" })
    expect(bundled.properties.encoded).toEqual({
      $ref: "#/definitions/%7Bid%7D",
    })
    expect(bundled.properties.number).toEqual({ $ref: "#/definitions/num" })
  })

  // ISSUE-RB-16: parsePointer unescapes "~1"/"~0" before percent-decoding; RFC 6901 §6 requires percent-decoding first, so "%7E1" must mean "~1" -> "/".
  it("P1.14 percent-decoding happens before '~' unescaping (RFC 6901 §6)", async () => {
    const doc = {
      "root.json": {
        type: "object",
        properties: { a: { $ref: "#/definitions/a%7E1b" } },
        definitions: {
          "a~1b": { title: "literal tilde-one" },
          "a/b": { title: "slash" },
        },
      },
    }
    const result: any = await dereference(
      "root.json",
      memResolver(doc).resolver,
    )
    expect(result.properties.a).toEqual({ title: "slash" })
  })

  it("P1.15 buildPointer/parsePointer round-trip every special key", () => {
    for (const key of [
      "a/b",
      "a~b",
      "a~1b",
      "~0",
      "%7B",
      "a b",
      "ü",
      "#",
      "?",
      "",
    ]) {
      expect(parsePointer(buildPointer([key]))).toEqual([key])
    }
    expect(buildPointer(["a/b", "c~d"])).toBe("/a~1b/c~0d")
    expect(buildPointer([])).toBe("")
    expect(parsePointer("")).toEqual([])
  })

  it("P1.16 a pointer may traverse through an intermediate $ref in the target file", async () => {
    const doc = {
      "root.json": {
        type: "object",
        properties: { a: { $ref: "x.json#/alias/properties/n" } },
      },
      "x.json": {
        alias: { $ref: "#/real" },
        real: { properties: { n: { title: "N" } } },
      },
    }
    const result: any = await dereference(
      "root.json",
      memResolver(doc).resolver,
    )
    expect(result.properties.a).toEqual({ title: "N" })
    const bundled: any = await bundle("root.json", memResolver(doc).resolver)
    expect(bundled.definitions.n).toEqual({ title: "N" })
    expect(bundled.properties.a).toEqual({ $ref: "#/definitions/n" })
  })

  it("P1.17 a pointer with an invalid escape (~ not followed by 0 or 1) is reported as invalid", async () => {
    const doc = {
      "r.json": {
        a: { "~t": "T", "x~": "X", "~1": "S" },
        r: { $ref: "#/a/~t" },
        s: { $ref: "#/a/x~" },
        ok: { $ref: "#/a/~01" },
      },
    }
    const types: string[] = []
    const result: any = await dereference("r.json", memResolver(doc).resolver, {
      hooks: { onError: (_m, _c, detail) => types.push(String(detail?.type)) },
    })
    expect(types).toEqual(["invalid-pointer", "invalid-pointer"])
    expect(result.r).toEqual({ $ref: "#/a/~t" })
    expect(result.ok).toBe("S")
  })

  it("P1.18 percent-decoding is applied once (%2520 addresses the key '%20')", async () => {
    const doc = {
      "r.json": {
        defs: { "%20": { title: "encoded once" }, " ": { title: "space" } },
        a: { $ref: "#/defs/%2520" },
      },
    }
    const result: any = await dereference("r.json", memResolver(doc).resolver)
    expect(result.a).toEqual({ title: "encoded once" })
  })

  it("P1.19 a raw '%' (malformed percent-encoding) is an invalid pointer", async () => {
    const doc = {
      "r.json": {
        definitions: { "rate%": { type: "number" } },
        a: { $ref: "#/definitions/rate%" },
        b: { $ref: "#/definitions/rate%25" },
      },
    }
    const types: string[] = []
    const result: any = await dereference("r.json", memResolver(doc).resolver, {
      hooks: { onError: (_m, _c, detail) => types.push(String(detail?.type)) },
    })
    expect(types).toEqual(["invalid-pointer"])
    expect(result.a).toEqual({ $ref: "#/definitions/rate%" })
    expect(result.b).toEqual({ type: "number" })
  })
})
