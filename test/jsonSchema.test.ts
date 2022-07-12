import { promises as fs } from "fs"
import path from "path"

import { ApiRefBundler } from "../src"

const resolver = async (sourcePath: string) => {
  const file = await fs.readFile(path.join(__dirname, "./resources/", sourcePath))
  return JSON.parse(file.toString())      
}

const bundle = async (filename: string) => {
  const refparser = new ApiRefBundler(filename, resolver)
  return refparser.run()
}

describe("Test jsonSchema ref bundle", () => {
  it("baz.json should be bundled", async () => {
    const baz = await bundle("./xyz/baz.json")
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
    const bar = await bundle("bar.json")
    expect(bar.properties.hello).toMatchObject({ $ref: "#/definitions/World1" })
    expect(bar.properties.new).toMatchObject({ $ref: "#/definitions/foo" })
    expect(bar.definitions.World1).toMatchObject({ type: "string" })
    expect(bar.definitions["baz"]).toMatchObject({
      type: "object",
      properties: {
        hello: {
          $ref: "#/definitions/World1"
        },
        new: {
          $ref: "#/definitions/foo"
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
          $ref: "#/definitions/foo"
        },
        baz: {
          $ref: "#/definitions/baz"
        }
      }
    })
  })

  it("foo.json should be bundled", async () => {
    const foo = await bundle("foo.json")
    expect(foo.properties.new).toMatchObject({ $ref: "#" })
    expect(foo.properties.baz).toMatchObject({ $ref: "#/definitions/baz" })
    expect(foo.definitions["World"]).toMatchObject({ type: "string" })
    expect(foo.definitions["baz"]).toMatchObject({
      type: "object",
      properties: {
        hello: {
          $ref: "#/definitions/World"
        },
        new: {
          $ref: "#"
        }
      }
    })
  })
})
