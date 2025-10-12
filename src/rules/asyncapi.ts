import { DefinitionPointer, RefMapRules } from "../types"
import { schemaRefMap } from "./jsonSchema"

type AsyncApiComponents =
  | "schemas"
  | "servers"
  | "serverVariables"
  | "channels"
  | "messages"
  | "securitySchemes"
  | "parameters"
  | "correlationIds"
  | "operationTraits"
  | "messageTraits"
  | "serverBindings"
  | "channelBindings"
  | "operationBindings"
  | "messageBindings"

const asyncApiDefPaths: Record<AsyncApiComponents, DefinitionPointer> = {
  schemas: "/components/schemas",
  servers: "/components/servers",
  serverVariables: "/components/serverVariables",
  channels: "/components/channels",
  messages: "/components/messages",
  securitySchemes: "/components/securitySchemes",
  parameters: "/components/parameters",
  correlationIds: "/components/correlationIds",
  operationTraits: "/components/operationTraits",
  messageTraits: "/components/messageTraits",
  serverBindings: "/components/serverBindings",
  channelBindings: "/components/channelBindings",
  operationBindings: "/components/operationBindings",
  messageBindings: "/components/messageBindings",
} as const

const parametersRefMap: RefMapRules = {
  "/*": {
    "#": asyncApiDefPaths.parameters,
    "/schema": schemaRefMap(asyncApiDefPaths.schemas),
  },
}

const serversRefMap: RefMapRules = {
  "/*": {
    "#": asyncApiDefPaths.servers,
    "/variables": {
      "/*": { "#": asyncApiDefPaths.serverVariables },
    },
    "/bindings": { "#": asyncApiDefPaths.serverBindings },
  },
}

const operationTraitsRefMap: RefMapRules = {
  "/*": {
    "#": asyncApiDefPaths.operationTraits,
    "/bindings": { "#": asyncApiDefPaths.operationBindings },
  },
}

const messageTraitsRefMap: RefMapRules = {
  "/*": {
    "#": asyncApiDefPaths.messageTraits,
    "/headers": schemaRefMap(asyncApiDefPaths.schemas),
    "/correlationId": { "#": asyncApiDefPaths.correlationIds },
    "/bindings": { "#": asyncApiDefPaths.messageBindings },
  },
}

const messageObjectRefMap: RefMapRules = {
  "/headers": schemaRefMap(asyncApiDefPaths.schemas),
  "/correlationId": { "#": asyncApiDefPaths.correlationIds },
  "/traits": messageTraitsRefMap,
  "/payload": schemaRefMap(asyncApiDefPaths.schemas),
  "/bindings": { "#": asyncApiDefPaths.messageBindings },
}

const messageRefMap: RefMapRules = {
  "#": asyncApiDefPaths.messages,
  ...messageObjectRefMap,
}

const createOperationMessageRefMap = (registerInComponents: boolean): RefMapRules => {
  const base = registerInComponents ? messageRefMap : messageObjectRefMap
  return {
    ...base,
    "/oneOf": {
      "/*": registerInComponents ? messageRefMap : messageObjectRefMap,
    },
  }
}

const createOperationRefMap = (registerInComponents: boolean): RefMapRules => ({
  "/traits": operationTraitsRefMap,
  "/message": createOperationMessageRefMap(registerInComponents),
  "/bindings": { "#": asyncApiDefPaths.operationBindings },
})

const createChannelsRefMap = (operationRefMap: RefMapRules): RefMapRules => ({
  "/*": {
    "#": asyncApiDefPaths.channels,
    "/bindings": { "#": asyncApiDefPaths.channelBindings },
    "/subscribe": operationRefMap,
    "/publish": operationRefMap,
    "/parameters": parametersRefMap,
  },
})

const createAsyncApiRefMap = (operationRefMap: RefMapRules): RefMapRules => {
  const channelsRefMap = createChannelsRefMap(operationRefMap)

  return {
    "/servers": serversRefMap,
    "/channels": channelsRefMap,
    "/components": {
      "/schemas": {
        "/*": () => schemaRefMap(asyncApiDefPaths.schemas),
      },
      "/servers": serversRefMap,
      "/serverVariables": {
        "/*": { "#": asyncApiDefPaths.serverVariables },
      },
      "/channels": channelsRefMap,
      "/messages": {
        "/*": messageRefMap,
      },
      "/parameters": parametersRefMap,
      "/correlationIds": {
        "/*": { "#": asyncApiDefPaths.correlationIds },
      },
      "/operationTraits": operationTraitsRefMap,
      "/messageTraits": messageTraitsRefMap,
      "/securitySchemes": {
        "/*": { "#": asyncApiDefPaths.securitySchemes },
      },
      "/serverBindings": {
        "/*": { "#": asyncApiDefPaths.serverBindings },
      },
      "/channelBindings": {
        "/*": { "#": asyncApiDefPaths.channelBindings },
      },
      "/operationBindings": {
        "/*": { "#": asyncApiDefPaths.operationBindings },
      },
      "/messageBindings": {
        "/*": { "#": asyncApiDefPaths.messageBindings },
      },
    },
  }
}

export const asyncApi2RefMap = createAsyncApiRefMap(createOperationRefMap(true))
export const asyncApi3RefMap = createAsyncApiRefMap(createOperationRefMap(false))
