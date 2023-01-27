import { resolver } from "./helpers"

import { bundle } from "../src/bundle"

describe("Complex bundle test", () => {
  
  describe("Test jsonSchema ref bundle", () => {
    it("baz.json should be bundled", async () => {
      const baz = await bundle("specs/circular-schema/xyz/baz.json", resolver)
      expect(baz.properties.new).toMatchObject({ $ref: "#/definitions/New" })
      expect(baz.definitions.New).toMatchObject({ $ref: "#/definitions/foo" })
      expect(baz.definitions["foo"]).toMatchObject({
        type: "object",
        properties: {
          hello: {
            type: "string"
          },
          new: {
            $ref: "#/definitions/New"
          },
          baz: {
            $ref: "#"
          }
        }
      })
    })
  
    it("bar.json should be bundled", async () => {
      const bar = await bundle("specs/circular-schema/bar.json", resolver)
      expect(bar.properties.hello).toMatchObject({ $ref: "#/definitions/World1" })
      expect(bar.properties.new).toMatchObject({ $ref: "#/definitions/New", title: "bar" })
      expect(bar.definitions.World1).toMatchObject({ type: "string" })
      expect(bar.definitions.baz).toMatchObject({
        type: "object",
        title: "baz",
        properties: {
          hello: {
            $ref: "#/definitions/World1"
          },
          new: {
            $ref: "#/definitions/New"
          }
        }
      })
      expect(bar.definitions["foo"]).toMatchObject({
        type: "object",
        properties: {
          hello: {
            type: "string"
          },
          new: {
            $ref: "#/definitions/New"
          },
          baz: {
            $ref: "#/definitions/baz"
          }
        }
      })
    })
  
    it("foo.json should be bundled", async () => {
      const foo = await bundle("specs/circular-schema/foo.json", resolver)
      expect(foo.properties.new).toMatchObject({ $ref: "#/definitions/New" })
      expect(foo.properties.baz).toMatchObject({ $ref: "#/definitions/baz" })
      expect(foo.definitions["World"]).toMatchObject({ type: "string" })
      expect(foo.definitions["New"]).toMatchObject({ $ref: "#", description: 'sibling description' })
      expect(foo.definitions["baz"]).toMatchObject({
        type: "object",
        properties: {
          hello: {
            $ref: "#/definitions/World"
          },
          new: {
            $ref: "#/definitions/New"
          }
        }
      })
    })
  
    it("test.json should be bundled with md file", async () => {
      const foo = await bundle("specs/circular-schema/test.json", resolver)
      expect(foo.properties.readme).toEqual("bundle all external refs in signle document")
    })
  })

})
