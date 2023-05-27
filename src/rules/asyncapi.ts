import { schemaRefMap } from "./jsonSchema"
import { RefMapRule, RefMapRules } from "../types"

type AsyncApiComponents = "schemas" | "servers" | "serverVariables" | "channels" | "messages" | "securitySchemes" | "parameters" | "correlationIds" | "operationTraits" | "messageTraits" | "serverBindings" | "channelBindings" | "operationBindings" | "messageBindings"

const asyncApiRefRule: Record<AsyncApiComponents, RefMapRule> = {
  schemas: "#/components/schemas",
  servers: "#/components/servers",
  serverVariables: "#/components/serverVariables",
  channels: "#/components/channels",
  messages: "#/components/messages",
  securitySchemes: "#/components/securitySchemes",
  parameters: "#/components/parameters",
  correlationIds: "#/components/correlationIds",
  operationTraits: "#/components/operationTraits",
  messageTraits: "#/components/messageTraits",
  serverBindings: "#/components/serverBindings",
  channelBindings: "#/components/channelBindings",
  operationBindings: "#/components/operationBindings",
  messageBindings: "#/components/messageBindings",
} as const

const parametersRefMap: RefMapRules = {
  "/*": {
    "/": asyncApiRefRule.parameters,
    "/schema": schemaRefMap(asyncApiRefRule.schemas)
  }
}

const serversRefMap = {
  "/*": {
    "/": asyncApiRefRule.servers,
    "/variables": {
      "/*": asyncApiRefRule.serverVariables
    },
    "/bindings": asyncApiRefRule.serverBindings
  }
}

const operationTraitsRefMap: RefMapRules = {
  "/*": {
    "/": asyncApiRefRule.operationTraits,
    "/bindings": asyncApiRefRule.operationBindings
  }
}

const messageTraitsRefMap: RefMapRules = {
  "/*": {
    "/": asyncApiRefRule.messageTraits,
    "/headers": schemaRefMap(asyncApiRefRule.schemas),
    "/correlationId": asyncApiRefRule.correlationIds,
    "/bindings": asyncApiRefRule.messageBindings,
  }
}

const messageRefMap: RefMapRules = {
  "/": asyncApiRefRule.messages,
  "/headers": schemaRefMap(asyncApiRefRule.schemas),
  "/correlationId": asyncApiRefRule.correlationIds,
  "/traits": messageTraitsRefMap,
  "/payload": schemaRefMap(asyncApiRefRule.schemas),
  "/bindings": asyncApiRefRule.messageBindings,
}

const operationRefMap: RefMapRules = {
  "/traits": operationTraitsRefMap,
  "/message": {
    ...messageRefMap,
    "/oneOf": {
      "/*": messageRefMap
    }
  },
  "/bindings": asyncApiRefRule.operationBindings,
}

const channelsRefMap: RefMapRules = {
  "/*": {
    "/": asyncApiRefRule.channels,
    "/bindings": asyncApiRefRule.channelBindings,
    "/subscribe": operationRefMap,
    "/publish": operationRefMap,
    "/parameters": parametersRefMap,
  }
}

export const asyncApiRefMap: RefMapRules = {
  "/servers": serversRefMap,
  "/channels": channelsRefMap,
  "/components": {
    "/schemas": {
      "/*": () => schemaRefMap(asyncApiRefRule.schemas)
    },
    "/servers": serversRefMap,
    "/serverVariables": {
      "/*": asyncApiRefRule.serverVariables
    },
    "/channels": channelsRefMap,
    "/messages": {
      "/*": messageRefMap
    },
    "/parameters": parametersRefMap,
    "/correlationIds": {
      "/*": asyncApiRefRule.correlationIds
    },
    "/operationTraits": operationTraitsRefMap,
    "/messageTraits": messageTraitsRefMap,
    "/securitySchemes": {
      "/*": asyncApiRefRule.securitySchemes
    },
    "/serverBindings": {
      "/*": asyncApiRefRule.serverBindings
    },
    "/channelBindings": {
      "/*": asyncApiRefRule.channelBindings
    },
    "/operationBindings": {
      "/*": asyncApiRefRule.operationBindings,
    },
    "/messageBindings": {
      "/*": asyncApiRefRule.messageBindings,
    }
  }
}
