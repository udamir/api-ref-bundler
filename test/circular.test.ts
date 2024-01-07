import { bundle, dereference } from "../src"
import { resolver } from "./helpers"

import circularExtended from "./specs/circular-extended"

describe("Schema with circular $refs that extend each other", () => {
  describe("$ref to self", () => {
    it('should not dereference circular $refs with sibling content if "enableCircular" is true', async () => {
      const schema = await dereference("specs/circular-extended/circular-extended-self.yaml", resolver, { enableCircular: true })
      expect(schema).toMatchObject(circularExtended.dereferenced.selfCycled)
    });

    it("should dereference successfully and ignore circular $refs", async () => {
      const schema = await dereference("specs/circular-extended/circular-extended-self.yaml", resolver)
      expect(schema).toMatchObject(circularExtended.dereferenced.self)
    });

    it("should bundle successfully", async () => {
      const schema = await bundle("specs/circular-extended/circular-extended-self.yaml", resolver)
      expect(schema).toMatchObject(circularExtended.bundled.self)
    })
  })

  describe("$ref to ancestor", () => {
    it('should dereference successfully circular $refs if "enableCircular" is true', async () => {
      const schema: any = await dereference("specs/circular-extended/circular-extended-ancestor.yaml", resolver, { enableCircular: true })
      // Reference equality
      expect(schema.definitions.person.properties.spouse.properties)
        .toMatchObject(schema.definitions.person.properties);
      expect(schema.definitions.person.properties.pet.properties)
        .toMatchObject(schema.definitions.pet.properties);
    });

    it('should dereference successfully and ignore circular $refs', async () => {
      const schema = await dereference("specs/circular-extended/circular-extended-ancestor.yaml", resolver);
      expect(schema).toMatchObject(circularExtended.dereferenced.ancestor);
    });

    it("should bundle successfully", async () => {
      const schema = await bundle("specs/circular-extended/circular-extended-ancestor.yaml", resolver);
      expect(schema).toMatchObject(circularExtended.bundled.ancestor);
    });
  });

  describe("indirect circular $refs", () => {

    it('should dereference successfully circular $refs if "enableCircular" is true', async () => {
      const schema: any = await dereference("specs/circular-extended/circular-extended-indirect.yaml", resolver, { enableCircular: true })
      // Reference equality
      expect(schema.definitions.parent.properties.children.items.properties)
        .toMatchObject(schema.definitions.child.properties);
      expect(schema.definitions.child.properties.parents.items.properties)
        .toMatchObject(schema.definitions.parent.properties);
      expect(schema.definitions.child.properties.pet.properties)
        .toMatchObject(schema.definitions.pet.properties);
    });

    it('should dereference successfully and ignore circular $refs', async () => {
      const schema = await dereference("specs/circular-extended/circular-extended-indirect.yaml", resolver);
      expect(schema). toMatchObject(circularExtended.dereferenced.indirect);
    });

    it("should bundle successfully", async () => {

      const schema = await bundle("specs/circular-extended/circular-extended-indirect.yaml", resolver);
      expect(schema).toMatchObject(circularExtended.bundled.indirect);
    });
  });

  describe("indirect circular and ancestor $refs", () => {

    it('should dereference successfully circular $refs if "enableCircular" is true', async () => {
      const schema: any = await dereference("specs/circular-extended/circular-extended-indirect-ancestor.yaml", resolver, { enableCircular: true })
      // Reference equality
      expect(schema.definitions.parent.properties.child.properties.children.items.properties.children.items)
        .toMatchObject(schema.definitions.parent.properties.child.properties.children.items);
      expect(schema.definitions.child.properties.children.items)
        .toMatchObject(schema.definitions.child);
      expect(schema.definitions.pet.properties)
        .toMatchObject(schema.definitions.child.properties.pet.properties);
    });

    it('should dereference successfully and ignore circular $refs', async () => {
      const schema = await dereference("specs/circular-extended/circular-extended-indirect-ancestor.yaml", resolver);
      expect(schema).toMatchObject(circularExtended.dereferenced.indirectAncestor);
    });

    it("should bundle successfully", async () => {
      const schema = await bundle("specs/circular-extended/circular-extended-indirect-ancestor.yaml", resolver);
      expect(schema).toMatchObject(circularExtended.bundled.indirectAncestor);
    })
  })
})
