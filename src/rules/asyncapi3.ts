import { DefinitionPointer, RefMapRules } from "../types"
import { schemaRefMap } from "./jsonSchema"

/**
 * AsyncAPI v3 Reference Map Rules
 * 
 * Key differences from v2:
 * - Operations are top-level (not nested in channels)
 * - Operation messages reference channel-scoped messages
 * - Root-level channels and operations are not hoisted to components
 */

type AsyncApi3Components = "schemas" | "servers" | "channels" | "operations" | "messages" | "securitySchemes" | "serverVariables" | "parameters" | "correlationIds" | "replies" | "replyAddresses" | "externalDocs" | "tags"

const asyncApi3DefPaths: Record<AsyncApi3Components, DefinitionPointer> = {
  schemas: "/components/schemas",
  servers: "/components/servers",
  channels: "/components/channels",
  operations: "/components/operations",
  messages: "/components/messages",
  securitySchemes: "/components/securitySchemes",
  serverVariables: "/components/serverVariables",
  parameters: "/components/parameters",
  correlationIds: "/components/correlationIds",
  replies: "/components/replies",
  replyAddresses: "/components/replyAddresses",
  externalDocs: "/components/externalDocs",
  tags: "/components/tags",
} as const

const parametersRefMap: RefMapRules = {
  "/*": {
    "#": asyncApi3DefPaths.parameters,
    "/schema": schemaRefMap(asyncApi3DefPaths.schemas)
  }
}

const serversRefMap: RefMapRules = {
  "/*": {
    "#": asyncApi3DefPaths.servers,
    "/variables": {
      "/*": { "#": asyncApi3DefPaths.serverVariables }
    }
  }
}

const channelMessageRefMap: RefMapRules = {
  "/headers": schemaRefMap(asyncApi3DefPaths.schemas),
  "/correlationId": { "#": asyncApi3DefPaths.correlationIds },
  "/payload": schemaRefMap(asyncApi3DefPaths.schemas),
}

const rootChannelsRefMap: RefMapRules = {
  "/*": {
    "/servers": {
      "/*": { "#": asyncApi3DefPaths.servers }
    },
    "/parameters": parametersRefMap,
    "/messages": {
      "/*": channelMessageRefMap
    }
  }
}

const componentChannelsRefMap: RefMapRules = {
  "/*": {
    "#": asyncApi3DefPaths.channels,
    "/servers": {
      "/*": { "#": asyncApi3DefPaths.servers }
    },
    "/parameters": parametersRefMap,
    "/messages": {
      "/*": channelMessageRefMap
    }
  }
}

const rootOperationsRefMap: RefMapRules = {
  "/*": {
    "/channel": {},
    "/messages": {
      "/*": {}
    },
    "/reply": {
      "/channel": {},
      "/messages": {
        "/*": {}
      }
    }
  }
}

const componentOperationsRefMap: RefMapRules = {
  "/*": {
    "#": asyncApi3DefPaths.operations,
    "/channel": {
      "#": asyncApi3DefPaths.channels
    },
    "/messages": {
      "/*": {}
    },
    "/reply": {
      "/channel": {
        "#": asyncApi3DefPaths.channels
      },
      "/messages": {
        "/*": {}
      }
    }
  }
}

const componentMessageRefMap: RefMapRules = {
  "#": asyncApi3DefPaths.messages,
  "/headers": schemaRefMap(asyncApi3DefPaths.schemas),
  "/correlationId": { "#": asyncApi3DefPaths.correlationIds },
  "/payload": schemaRefMap(asyncApi3DefPaths.schemas),
}

export const asyncApi3RefMap: RefMapRules = {
  "/servers": serversRefMap,
  "/channels": rootChannelsRefMap,
  "/operations": rootOperationsRefMap,
  "/components": {
    "/schemas": {
      "/*": () => schemaRefMap(asyncApi3DefPaths.schemas)
    },
    "/servers": serversRefMap,
    "/channels": componentChannelsRefMap,
    "/operations": componentOperationsRefMap,
    "/messages": {
      "/*": componentMessageRefMap
    },
    "/securitySchemes": {
      "/*": { "#": asyncApi3DefPaths.securitySchemes }
    },
    "/parameters": parametersRefMap,
    "/correlationIds": {
      "/*": { "#": asyncApi3DefPaths.correlationIds }
    },
    "/replies": {
      "/*": {
        "#": asyncApi3DefPaths.replies,
        "/channel": {
          "#": asyncApi3DefPaths.channels
        },
        "/messages": {
          "/*": {}
        }
      }
    },
    "/replyAddresses": {
      "/*": { "#": asyncApi3DefPaths.replyAddresses }
    },
    "/externalDocs": {
      "/*": { "#": asyncApi3DefPaths.externalDocs }
    },
    "/tags": {
      "/*": { "#": asyncApi3DefPaths.tags }
    },
    "/serverVariables": {
      "/*": { "#": asyncApi3DefPaths.serverVariables }
    }
  }
}

