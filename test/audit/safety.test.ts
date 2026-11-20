import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { bundle, dereference } from "../../src"
import { getValueByPath, setValueByPath } from "../../src/utils"
import {
  deepFreeze,
  expectAllRefsInternalAndResolvable,
  isPolluted,
  memResolver,
} from "./helpers"

// Block I: input immutability; Block X: prototype-pollution protection

describe("I6 input immutability", () => {
  const makeFiles = () => ({
    "r.json": {
      type: "object",
      properties: {
        a: { $ref: "x.json", description: "sib" },
        b: { $ref: "x.json" },
        c: { $ref: "#/definitions/C" },
        self: { $ref: "#" },
      },
      definitions: {
        C: { properties: { back: { $ref: "x.json#/properties/n" } } },
      },
    },
    "x.json": {
      type: "object",
      properties: {
        n: { type: "string" },
        loop: { $ref: "r.json#/properties/b" },
      },
    },
  })

  it("I6.1 bundle never writes into resolver-returned documents (deep-frozen inputs)", async () => {
    const files = deepFreeze(makeFiles())
    const snapshot = JSON.stringify(files)
    const bundled = await bundle("r.json", memResolver(files).resolver)
    expect(bundled).toBeDefined()
    expect(JSON.stringify(files)).toBe(snapshot)
  })

  it("I6.2 dereference never writes into resolver-returned documents, in every mode", async () => {
    const files = deepFreeze(makeFiles())
    const snapshot = JSON.stringify(files)
    await dereference("r.json", memResolver(files).resolver)
    await dereference("r.json", memResolver(files).resolver, {
      ignoreSibling: true,
    })
    await dereference("r.json", memResolver(files).resolver, {
      fullCrawl: true,
    })
    await dereference("r.json", memResolver(files).resolver, {
      enableCircular: true,
    })
    expect(JSON.stringify(files)).toBe(snapshot)
  })

  it("I6.3 mutating the output does not leak into the inputs", async () => {
    const files = makeFiles()
    const result: any = await dereference("r.json", memResolver(files).resolver)
    result.properties.b.properties.n.type = "mutated"
    expect(files["x.json"].properties.n.type).toBe("string")
    const bundled: any = await bundle("r.json", memResolver(files).resolver)
    bundled.definitions.x.properties.n.type = "mutated"
    expect(files["x.json"].properties.n.type).toBe("string")
  })

  it("I6.4 the options object and hooks are not mutated", async () => {
    const files = makeFiles()
    const options = deepFreeze({
      ignoreSibling: true,
      hooks: { onRef: vi.fn() },
    })
    await dereference("r.json", memResolver(files).resolver, options as any)
    await bundle("r.json", memResolver(files).resolver, options as any)
    expect(options.hooks.onRef).toHaveBeenCalled()
  })
})

describe("X7 prototype pollution", () => {
  afterEach(() => {
    delete (Object.prototype as any).polluted
    delete (Object.prototype as any).title
  })

  const pollutionRefs = {
    "r.json": {
      type: "object",
      properties: {
        a: { $ref: "#/__proto__/polluted" },
        b: { $ref: "#/constructor/prototype/polluted" },
        c: { $ref: "x.json#/__proto__/polluted" },
      },
    },
    "x.json": { title: "x" },
  }

  it("X7.1 refs through __proto__ / constructor.prototype are unresolvable and pollute nothing", async () => {
    const onError = vi.fn()
    await dereference("r.json", memResolver(pollutionRefs).resolver, {
      hooks: { onError },
    })
    expect(onError).toHaveBeenCalledTimes(3)
    expect(isPolluted("polluted")).toBe(false)
    await bundle("r.json", memResolver(pollutionRefs).resolver, {
      hooks: { onError },
    })
    expect(isPolluted("polluted")).toBe(false)
  })

  it("X7.2 external files named __proto__ / constructor and $id '__proto__' bundle safely", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: {
          a: { $ref: "__proto__.json" },
          b: { $ref: "constructor.json" },
          c: { $ref: "evil.json" },
        },
      },
      "__proto__.json": { title: "evil" },
      "constructor.json": { title: "evil2" },
      "evil.json": { $id: "__proto__", title: "evil3" },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    expect(isPolluted("title")).toBe(false)
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false)
    expectAllRefsInternalAndResolvable(bundled)
    expect(Object.hasOwn(bundled.definitions, "__proto__")).toBe(false)
  })

  it("X7.3 a JSON-parsed document with an own __proto__ key does not pollute during crawl", async () => {
    const parsed = JSON.parse(
      '{"type":"object","properties":{"a":{"$ref":"x.json"}},"__proto__":{"polluted":"yes"}}',
    )
    const doc = { "r.json": parsed, "x.json": { title: "x" } }
    await dereference("r.json", memResolver(doc).resolver)
    await bundle("r.json", memResolver(doc).resolver)
    expect(isPolluted("polluted")).toBe(false)
  })

  it("X7.4 custom rules pointing the definitions at __proto__ do not pollute", async () => {
    const doc = {
      "r.json": { type: "object", properties: { a: { $ref: "x.json" } } },
      "x.json": { polluted: "yes" },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver, {
      rules: { "/properties": { "/*": { "#": "/__proto__" } } },
    })
    expect(isPolluted("polluted")).toBe(false)
    expectAllRefsInternalAndResolvable(bundled)
  })

  // ISSUE-RB-12: RefResolver.resolvePointer() walks tokens with `key in value`, which also finds inherited members; "#/constructor" resolves to the Object function and "#/__proto__" to Object.prototype, leaking non-JSON values into the output instead of failing.
  it("X7.5 inherited members (constructor, toString, __proto__) are not valid pointer targets", async () => {
    const doc = {
      "r.json": {
        type: "object",
        properties: {
          a: { $ref: "#/constructor" },
          b: { $ref: "#/toString" },
          c: { $ref: "#/__proto__" },
        },
      },
    }
    const onError = vi.fn()
    const result: any = await dereference("r.json", memResolver(doc).resolver, {
      hooks: { onError },
    })
    expect(onError).toHaveBeenCalledTimes(3)
    expect(typeof result.properties.a).not.toBe("function")
    expect(typeof result.properties.b).not.toBe("function")
  })

  it("X7.6 setValueByPath / getValueByPath refuse unsafe keys at any depth", () => {
    const obj: any = {}
    setValueByPath(obj, ["a", "__proto__", "polluted"], "yes")
    setValueByPath(obj, ["a", "constructor", "prototype", "polluted"], "yes")
    setValueByPath(obj, ["prototype", "polluted"], "yes")
    expect(isPolluted("polluted")).toBe(false)
    expect(getValueByPath({ a: {} }, ["a", "__proto__"])).toBeUndefined()
    expect(getValueByPath({ a: {} }, ["a", "constructor"])).toBeUndefined()
    expect(getValueByPath([{ b: 1 }], ["0", "b"])).toBe(1)
    expect(getValueByPath([{ b: 1 }], ["x"])).toBeUndefined()
  })
})
