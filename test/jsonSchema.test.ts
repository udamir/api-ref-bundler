import { promises as fs } from "fs"
import path from "path"

import { ApiRefBundler } from "../src"

const resolver = async (sourcePath: string) => {
  const file = await fs.readFile(path.join(__dirname, "./resources/", sourcePath))
  return JSON.parse(file.toString())      
}

const bundle = async (filename: string) => {
  const refparser = new ApiRefBundler(filename, resolver, {
    definitionsBasePath: "/definitions"
  })
  return refparser.run()
}

describe("Test jsonSchema ref bundle", () => {
  it("baz.json should be bundled", async () => {
    const baz = await bundle("./xyz/baz.json")
    expect(baz.properties.new).toMatchObject({ $ref: "#/definitions/New" })
    expect(baz.definitions.New).toMatchObject({ $ref: "#/definitions/foo.json" })
    expect(baz.definitions["foo.json"]).toMatchObject({
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
    const bar = await bundle("bar.json")
    expect(bar.properties.hello).toMatchObject({ $ref: "#/definitions/World1" })
    expect(bar.properties.new).toMatchObject({ $ref: "#/definitions/foo.json" })
    expect(bar.definitions.World1).toMatchObject({ type: "string" })
    expect(bar.definitions["baz.json"]).toMatchObject({
      type: "object",
      properties: {
        hello: {
          $ref: "#/definitions/World1"
        },
        new: {
          $ref: "#/definitions/foo.json"
        }
      }
    })
    expect(bar.definitions["foo.json"]).toMatchObject({
      type: "object",
      properties: {
        hello: {
          type: "string"
        },
        new: {
          $ref: "#/definitions/foo.json"
        },
        baz: {
          $ref: "#/definitions/baz.json"
        }
      }
    })
  })

  it("foo.json should be bundled", async () => {
    const foo = await bundle("foo.json")
    expect(foo.properties.new).toMatchObject({ $ref: "#" })
    expect(foo.properties.baz).toMatchObject({ $ref: "#/definitions/baz.json" })
    expect(foo.definitions["baz.json-World"]).toMatchObject({ type: "string" })
    expect(foo.definitions["baz.json"]).toMatchObject({
      type: "object",
      properties: {
        hello: {
          $ref: "#/definitions/baz.json-World"
        },
        new: {
          $ref: "#/definitions/baz.json"
        }
      }
    })
  })
})
