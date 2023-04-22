import { bundle, dereference } from "../src"
import { resolver } from "./helpers"

import root from "./specs/root"
import parsedSchema from "./specs/no-refs/parsed"
import absoluteRoot from "./specs/absolute-root"
import substrings from "./specs/substrings"

describe("Basic tests", () => {
  
  describe("Schema with a top-level (root) $ref", () => {
    it("should dereference successfully", async () => {
      const schema = await dereference("specs/root/root.yaml", resolver);
      expect(schema).toMatchObject(root.dereferenced)
      // Reference equality
      expect(schema.properties.first).toEqual(schema.properties.last);
    })

    it("should parallel dereference successfully", async () => {
      const schema = await dereference("specs/root/root.yaml", resolver, { parallelCrawl: true });
      expect(schema).toMatchObject(root.dereferenced)
      // Reference equality
      expect(schema.properties.first).toEqual(schema.properties.last);
    })
  
    it("should bundle successfully", async () => {
      const schema = await bundle("specs/root/root.yaml", resolver)
      expect(schema).toMatchObject(root.bundled)
    })

    it("should parallel bundle successfully", async () => {
      const schema = await bundle("specs/root/root.yaml", resolver, { parallelCrawl: true })
      expect(schema).toMatchObject(root.bundled)
    })
  })
  
  describe("Schema without any $refs", () => {
    it("should dereference successfully", async () => {
      const schema = await dereference("specs/no-refs/no-refs.yaml", resolver)
      expect(schema).toMatchObject(parsedSchema);
    })
  
    it("should bundle successfully", async () => {
      const schema = await bundle("specs/no-refs/no-refs.yaml", resolver)
      expect(schema).toMatchObject(parsedSchema)
    })
  })

  describe("When executed in the context of root directory", () => {

    it("should dereference successfully", async () => {
      const schema = await dereference("specs/absolute-root/absolute-root.yaml", resolver)
  
      expect(schema).toMatchObject(absoluteRoot.dereferenced)
      expect(schema.properties.name).toEqual(schema.definitions.name)
    })
  
    it("should bundle successfully", async () => {
      const schema = await bundle("specs/absolute-root/absolute-root.yaml", resolver)
      expect(schema).toMatchObject(absoluteRoot.bundled)
    })
  })
  

  describe("$refs that are substrings of each other", () => {

    it("should dereference successfully", async () => {
      const schema = await dereference("specs/substrings/substrings.yaml", resolver)
      expect(schema).toMatchObject(substrings.dereferenced);
      // Reference equality
      expect(schema.properties.firstName).toEqual(schema.definitions.name);
      expect(schema.properties.middleName).toEqual(schema.definitions["name-with-min-length"]);
      expect(schema.properties.lastName).toEqual(schema.definitions["name-with-min-length-max-length"]);
    })
  
    it("should bundle successfully", async () => {
      const schema = await bundle("specs/substrings/substrings.yaml", resolver);
      expect(schema).toMatchObject(substrings.bundled);
    })
  
  })
  
})
