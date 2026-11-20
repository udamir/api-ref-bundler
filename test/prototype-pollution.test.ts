import { afterEach, describe, expect, it } from "vite-plus/test"
import { bundle, dereference } from "../src"
import { getValueByPath, mergeValues, setValueByPath } from "../src/utils"

describe("Prototype pollution prevention", () => {
  afterEach(() => {
    // Clean up in case a test fails and pollution occurs
    delete (Object.prototype as any).polluted
  })

  describe("setValueByPath", () => {
    it("should not pollute Object.prototype via __proto__", () => {
      const obj = {}
      setValueByPath(obj, ["__proto__", "polluted"], "yes")
      expect(({} as any).polluted).toBeUndefined()
      expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false)
    })

    it("should not pollute via constructor", () => {
      const obj = {}
      setValueByPath(obj, ["constructor", "polluted"], "yes")
      expect(({} as any).polluted).toBeUndefined()
    })

    it("should not pollute via prototype", () => {
      const obj = {}
      setValueByPath(obj, ["prototype", "polluted"], "yes")
      expect(({} as any).polluted).toBeUndefined()
    })

    it("should still work for normal paths", () => {
      const obj: any = {}
      setValueByPath(obj, ["a", "b"], "value")
      expect(obj.a.b).toBe("value")
    })
  })

  describe("getValueByPath", () => {
    it("should return undefined for __proto__ path", () => {
      const obj = { a: 1 }
      expect(getValueByPath(obj, ["__proto__", "toString"])).toBeUndefined()
    })

    it("should return undefined for constructor path", () => {
      const obj = { a: 1 }
      expect(getValueByPath(obj, ["constructor", "name"])).toBeUndefined()
    })

    it("should still work for normal paths", () => {
      const obj = { a: { b: "value" } }
      expect(getValueByPath(obj, ["a", "b"])).toBe("value")
    })
  })

  // reported for 0.5.1: a non-string segment is coerced to "__proto__" by the property access,
  // after the string-only safety check
  describe("non-string path segments", () => {
    it("setValueByPath ignores a segment that coerces to an unsafe key", () => {
      for (const path of [
        [["__proto__"], "polluted"],
        [["__proto__"], ["__proto__"], "polluted"],
        [["constructor"], ["prototype"], "polluted"],
      ]) {
        try {
          setValueByPath({}, path as any, "yes")
        } catch {}
        expect(({} as any).polluted).toBeUndefined()
        expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false)
      }
    })

    it("getValueByPath does not return Object.prototype for an array segment", () => {
      expect(getValueByPath({}, [["__proto__"]] as any)).toBeUndefined()
    })

    it("setValueByPath replaces a null intermediate instead of throwing", () => {
      const obj: any = { a: null }
      setValueByPath(obj, ["a", "b"], 1)
      expect(obj.a).toEqual({ b: 1 })
    })
  })

  describe("JSON-parsed __proto__ keys stay data", () => {
    it("mergeValues keeps a __proto__ key as an own property", () => {
      const merged: any = mergeValues(
        { a: 1 },
        JSON.parse('{"__proto__":{"x":1}}'),
      )
      expect(Object.getPrototypeOf(merged)).toBe(Object.prototype)
      expect(Object.hasOwn(merged, "__proto__")).toBe(true)
      expect(merged.x).toBeUndefined()
    })

    it("a $ref under or next to a __proto__ key does not replace the output's prototype", async () => {
      const doc = JSON.parse(
        '{"wrap":{"__proto__":{"$ref":"#/b","description":"s"}},"sib":{"$ref":"#/b","__proto__":{"x":1}},"b":{"x":1}}',
      )
      for (const run of [dereference, bundle]) {
        const out: any = await run("r.json", () => structuredClone(doc))
        for (const key of ["wrap", "sib"]) {
          expect(Object.getPrototypeOf(out[key])).toBe(Object.prototype)
          expect(Object.hasOwn(out[key], "__proto__")).toBe(true)
        }
        expect(out.wrap.x).toBeUndefined()
        expect(({} as any).x).toBeUndefined()
      }
    })
  })
})
