export default {
  asyncapi: '3.0.0',
  info: {
    title: 'AsyncAPI v3 Test Spec',
    version: '1.0.0',
    description: 'Test spec to verify v3 bundling preserves channel-scoped message refs'
  },
  servers: {
    production: {
      host: 'api.example.com',
      protocol: 'wss'
    }
  },
  components: {
    schemas: {
      TextPayload: {
        type: 'object',
        properties: {
          text: {
            type: 'string'
          }
        }
      }
    },
    messages: {
      GenericTextMessage: {
        payload: {
          type: 'object',
          properties: {
            text: {
              type: 'string'
            }
          }
        }
      }
    },
    securitySchemes: {
      apiKey: {
        type: 'httpApiKey',
        in: 'header',
        name: 'Authorization'
      }
    }
  },
  channels: {
    SpeakChannel: {
      address: '/v1/speak',
      messages: {
        TextInput: {
          payload: {
            type: 'object',
            properties: {
              text: {
                type: 'string'
              }
            }
          }
        },
        AudioOutput: {
          payload: {
            type: 'object',
            properties: {
              audio: {
                type: 'string',
                format: 'byte'
              }
            }
          }
        }
      }
    }
  },
  operations: {
    SendText: {
      action: 'send',
      channel: {
        address: '/v1/speak',
        messages: {
          TextInput: {
            payload: {
              type: 'object',
              properties: {
                text: {
                  type: 'string'
                }
              }
            }
          },
          AudioOutput: {
            payload: {
              type: 'object',
              properties: {
                audio: {
                  type: 'string',
                  format: 'byte'
                }
              }
            }
          }
        }
      },
      messages: [
        {
          payload: {
            type: 'object',
            properties: {
              text: {
                type: 'string'
              }
            }
          }
        }
      ]
    },
    ReceiveAudio: {
      action: 'receive',
      channel: {
        address: '/v1/speak',
        messages: {
          TextInput: {
            payload: {
              type: 'object',
              properties: {
                text: {
                  type: 'string'
                }
              }
            }
          },
          AudioOutput: {
            payload: {
              type: 'object',
              properties: {
                audio: {
                  type: 'string',
                  format: 'byte'
                }
              }
            }
          }
        }
      },
      messages: [
        {
          payload: {
            type: 'object',
            properties: {
              audio: {
                type: 'string',
                format: 'byte'
              }
            }
          }
        }
      ]
    }
  }
}

