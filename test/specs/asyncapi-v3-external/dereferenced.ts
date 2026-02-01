export default {
  asyncapi: '3.0.0',
  info: {
    title: 'AsyncAPI v3 External Refs Test',
    version: '1.0.0'
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
