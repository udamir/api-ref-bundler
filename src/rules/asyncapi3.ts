import type { DefinitionPointer, RefMapRules } from "../types"
import { schemaRefMap } from "./jsonSchema"

/**
 * AsyncAPI v3 Reference Map Rules
 * 
 * Key differences from v2:
 * - Operations are top-level (not nested in channels)
 * - Operation messages reference channel-scoped messages
 * - Root-level channels and operations are not hoisted to components
 */

type AsyncApi3Components =
  | "schemas" | "servers" | "channels" | "operations" | "messages"
  | "securitySchemes" | "serverVariables" | "parameters" | "correlationIds"
  | "replies" | "replyAddresses" | "externalDocs" | "tags"
  | "operationTraits" | "messageTraits"
  | "serverBindings" | "channelBindings" | "operationBindings" | "messageBindings"

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
  operationTraits: "/components/operationTraits",
  messageTraits: "/components/messageTraits",
  serverBindings: "/components/serverBindings",
  channelBindings: "/components/channelBindings",
  operationBindings: "/components/operationBindings",
  messageBindings: "/components/messageBindings",
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
    },
    "/security": {
      "/*": { "#": asyncApi3DefPaths.securitySchemes }
    },
    "/tags": {
      "/*": { "#": asyncApi3DefPaths.tags }
    },
    "/externalDocs": { "#": asyncApi3DefPaths.externalDocs },
    "/bindings": { "#": asyncApi3DefPaths.serverBindings }
  }
}

const channelMessageRefMap: RefMapRules = {
  "/headers": schemaRefMap(asyncApi3DefPaths.schemas),
  "/correlationId": { "#": asyncApi3DefPaths.correlationIds },
  "/payload": schemaRefMap(asyncApi3DefPaths.schemas),
  "/traits": {
    "/*": { "#": asyncApi3DefPaths.messageTraits }
  },
  "/bindings": { "#": asyncApi3DefPaths.messageBindings }
}

const rootChannelsRefMap: RefMapRules = {
  "/*": {
    "/servers": {
      "/*": { "#": asyncApi3DefPaths.servers }
    },
    "/parameters": parametersRefMap,
    "/messages": {
      "/*": channelMessageRefMap
    },
    "/tags": {
      "/*": { "#": asyncApi3DefPaths.tags }
    },
    "/externalDocs": { "#": asyncApi3DefPaths.externalDocs },
    "/bindings": { "#": asyncApi3DefPaths.channelBindings }
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
    },
    "/tags": {
      "/*": { "#": asyncApi3DefPaths.tags }
    },
    "/externalDocs": { "#": asyncApi3DefPaths.externalDocs },
    "/bindings": { "#": asyncApi3DefPaths.channelBindings }
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
      },
      "/address": { "#": asyncApi3DefPaths.replyAddresses }
    },
    "/security": {
      "/*": { "#": asyncApi3DefPaths.securitySchemes }
    },
    "/traits": {
      "/*": { "#": asyncApi3DefPaths.operationTraits }
    },
    "/tags": {
      "/*": { "#": asyncApi3DefPaths.tags }
    },
    "/externalDocs": { "#": asyncApi3DefPaths.externalDocs },
    "/bindings": { "#": asyncApi3DefPaths.operationBindings }
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
      },
      "/address": { "#": asyncApi3DefPaths.replyAddresses }
    },
    "/security": {
      "/*": { "#": asyncApi3DefPaths.securitySchemes }
    },
    "/traits": {
      "/*": { "#": asyncApi3DefPaths.operationTraits }
    },
    "/tags": {
      "/*": { "#": asyncApi3DefPaths.tags }
    },
    "/externalDocs": { "#": asyncApi3DefPaths.externalDocs },
    "/bindings": { "#": asyncApi3DefPaths.operationBindings }
  }
}

const componentMessageRefMap: RefMapRules = {
  "#": asyncApi3DefPaths.messages,
  "/headers": schemaRefMap(asyncApi3DefPaths.schemas),
  "/correlationId": { "#": asyncApi3DefPaths.correlationIds },
  "/payload": schemaRefMap(asyncApi3DefPaths.schemas),
  "/traits": {
    "/*": { "#": asyncApi3DefPaths.messageTraits }
  },
  "/bindings": { "#": asyncApi3DefPaths.messageBindings }
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
        },
        "/address": { "#": asyncApi3DefPaths.replyAddresses }
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
    },
    "/operationTraits": {
      "/*": {
        "#": asyncApi3DefPaths.operationTraits,
        "/tags": {
          "/*": { "#": asyncApi3DefPaths.tags }
        },
        "/externalDocs": { "#": asyncApi3DefPaths.externalDocs },
        "/bindings": { "#": asyncApi3DefPaths.operationBindings },
        "/security": {
          "/*": { "#": asyncApi3DefPaths.securitySchemes }
        }
      }
    },
    "/messageTraits": {
      "/*": {
        "#": asyncApi3DefPaths.messageTraits,
        "/headers": schemaRefMap(asyncApi3DefPaths.schemas),
        "/correlationId": { "#": asyncApi3DefPaths.correlationIds },
        "/tags": {
          "/*": { "#": asyncApi3DefPaths.tags }
        },
        "/externalDocs": { "#": asyncApi3DefPaths.externalDocs },
        "/bindings": { "#": asyncApi3DefPaths.messageBindings }
      }
    },
    "/serverBindings": {
      "/*": { "#": asyncApi3DefPaths.serverBindings }
    },
    "/channelBindings": {
      "/*": { "#": asyncApi3DefPaths.channelBindings }
    },
    "/operationBindings": {
      "/*": { "#": asyncApi3DefPaths.operationBindings }
    },
    "/messageBindings": {
      "/*": { "#": asyncApi3DefPaths.messageBindings }
    }
  }
}

