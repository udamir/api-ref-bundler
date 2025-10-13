import { bundle, dereference } from "../src"
import { resolver } from "./helpers"

import asyncApiV3 from "./specs/asyncapi-v3"

describe("AsyncAPI v3 tests", () => {

  describe("AsyncAPI v3 with channel-scoped message references", () => {
    it("should bundle successfully and preserve channel-scoped message refs", async () => {
      const schema = await bundle("specs/asyncapi-v3/asyncapi-v3.yaml", resolver)
      expect(schema).toMatchObject(asyncApiV3.bundled)
      expect(schema.operations.SendText.messages[0].$ref).toBe('#/channels/SpeakChannel/messages/TextInput')
      expect(schema.operations.ReceiveAudio.messages[0].$ref).toBe('#/channels/SpeakChannel/messages/AudioOutput')
    })

    it("should dereference successfully", async () => {
      const schema: any = await dereference("specs/asyncapi-v3/asyncapi-v3.yaml", resolver)
      expect(schema).toMatchObject(asyncApiV3.dereferenced)
      expect(schema.operations.SendText.messages[0]).toHaveProperty('payload')
      expect(schema.operations.ReceiveAudio.messages[0]).toHaveProperty('payload')
    })
  })
})

