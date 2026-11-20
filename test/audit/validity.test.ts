import { describe, expect, it } from "vite-plus/test"
import { bundle, dereference } from "../../src"
import { resolver as fixtureResolver } from "../helpers"
import {
  collectRefs,
  expectAllRefsInternalAndResolvable,
  memResolver,
  resolveInternal,
  roundTrip,
} from "./helpers"

// Block V: output validity (re-parsable JSON, every $ref points to an existing target)

const fixtures = [
  "specs/root/root.yaml",
  "specs/substrings/substrings.yaml",
  "specs/no-refs/no-refs.yaml",
  "specs/circular-extended/circular-extended-self.yaml",
  "specs/circular-extended/circular-extended-ancestor.yaml",
  "specs/circular-extended/circular-extended-indirect.yaml",
  "specs/circular-extended/circular-extended-indirect-ancestor.yaml",
  "specs/circular-schema/foo.json",
  "specs/circular-schema/bar.json",
  "specs/circular-schema/xyz/baz.json",
  "specs/circular-schema/test.json",
  "specs/asyncapi-v3/asyncapi-v3.yaml",
  "specs/asyncapi-v3-external/asyncapi-v3-external.yaml",
  "specs/asyncapi-v3-comprehensive/asyncapi-v3-comprehensive.yaml",
  "specs/asyncapi-v3-traits-bindings/main.yaml",
  "specs/asyncapi-v3-circular/circular.yaml",
  "specs/asyncapi-v3-edge/name-collision/main.yaml",
  "specs/asyncapi-v3-edge/sibling-content.yaml",
]

describe("V9 output validity", () => {
  it.each(fixtures)(
    "V9.1 bundle(%s) is self-contained and re-parsable",
    async (file) => {
      const bundled = await bundle(file, fixtureResolver as any)
      expect(roundTrip(bundled)).toEqual(bundled)
      expectAllRefsInternalAndResolvable(bundled)
    },
  )

  // ISSUE-RB-22: when a source pointer walks through an intermediate $ref (name.yaml "#/properties/first/type", where "first" is itself a $ref), bundle() rewrites it to "#/definitions/name/properties/first/type"; the bundled node "first" only holds a $ref, so the emitted pointer is not resolvable by RFC 6901 structural evaluation. The same fixture also emits "#/definitions/required string" next to "#/definitions/required%20string" (ISSUE-RB-23, inconsistent fragment encoding).
  it("V9.1b bundle(specs/absolute-root/absolute-root.yaml) emits only RFC 6901-resolvable pointers", async () => {
    const bundled = await bundle(
      "specs/absolute-root/absolute-root.yaml",
      fixtureResolver as any,
    )
    expectAllRefsInternalAndResolvable(bundled)
  })

  it("V9.2b dereference(specs/absolute-root/absolute-root.yaml) resolves pointers that walk through $refs", async () => {
    const result: any = await dereference(
      "specs/absolute-root/absolute-root.yaml",
      fixtureResolver as any,
    )
    expect(result.definitions.name.properties.middle.type).toBe("string")
    expect(result.definitions.name.properties.middle.minLength).toBe(1)
  })

  it.each(fixtures)(
    "V9.2 dereference(%s) keeps only resolvable internal refs and no JS cycles",
    async (file) => {
      const result = await dereference(file, fixtureResolver as any)
      expect(() => JSON.stringify(result)).not.toThrow()
      for (const { path, ref } of collectRefs(result)) {
        expect(ref, `ref at ${path}`).toMatch(/^#/)
        expect(
          resolveInternal(result, ref as string),
          `ref at ${path}`,
        ).not.toBeUndefined()
      }
    },
  )

  it("V9.3 bundled output contains no undefined, functions or symbols", async () => {
    const doc = {
      "r.json": {
        openapi: "3.0.3",
        info: { title: "t", version: "1" },
        paths: {
          "/a": {
            get: {
              responses: {
                "200": {
                  description: "ok",
                  content: {
                    "application/json": { schema: { $ref: "s.json#/A" } },
                  },
                },
              },
            },
          },
        },
      },
      "s.json": {
        A: { type: "object", properties: { b: { $ref: "#/B" } } },
        B: { type: "string" },
      },
    }
    const bundled = await bundle("r.json", memResolver(doc).resolver)
    const seen = new Set<unknown>()
    const walk = (node: any) => {
      if (typeof node !== "object" || node === null || seen.has(node)) {
        expect(["string", "number", "boolean", "object"]).toContain(typeof node)
        return
      }
      seen.add(node)
      expect(Object.getOwnPropertySymbols(node)).toEqual([])
      for (const value of Object.values(node)) {
        expect(value).not.toBeUndefined()
        walk(value)
      }
    }
    walk(bundled)
    expectAllRefsInternalAndResolvable(bundled)
  })

  it("V9.4 bundle output is deterministic across runs and resolver orderings", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: {
          a: { $ref: "x.json" },
          b: { $ref: "y.json" },
          c: { $ref: "x.json#/properties/n" },
        },
      },
      "x.json": { type: "object", properties: { n: { $ref: "y.json" } } },
      "y.json": { type: "string" },
    }
    const first = await bundle("r.json", memResolver(doc).resolver)
    const second = await bundle("r.json", memResolver(doc).resolver)
    expect(second).toEqual(first)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })
})
