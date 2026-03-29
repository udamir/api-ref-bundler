import { describe, it, expect, afterEach } from 'vitest'
import { setValueByPath, getValueByPath } from "../src/utils"

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
      expect(Object.prototype.hasOwnProperty("polluted")).toBe(false)
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
})
