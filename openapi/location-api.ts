import {OpenAPIObject, SchemaObject, ResponseObject} from "openapi3-ts/oas30";

export interface SpecOpts {
  functionArn: string;
  roleArn: string;
  region: string;
}

// Openapi spec for the api defined as a function here instead of a plain yaml/json file
// so that we can dynamically inject the lambda integration settings (e.g. including the lambda arn)
// during cdk synth.
export function spec(opts: SpecOpts): OpenAPIObject {
  let locationInput: SchemaObject = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
      },
      city: {
        type: 'string',
      },
      state: {
        type: 'string',
      },
      country: {
        type: 'string',
      },
    },
  };
  let coordinates: SchemaObject = {
    type: 'object',
    required: ['latitude', 'longitude'],
    properties: {
      latitude: {
        type: 'number',
        minimum: -90,
        maximum: 90,
      },
      longitude: {
        type: 'number',
        minimum: -180,
        maximum: 180,
      },
    },
  };

  let integration = {
    type: 'aws_proxy',
    credentials: opts.roleArn,
    passthroughBehavior: 'when_no_match',
    httpMethod: 'POST',
    uri: `arn:aws:apigateway:${opts.region}:lambda:path/2015-03-31/functions/${opts.functionArn}/invocations`,
  };

  let errorResponses: {[satusCode: string]: ResponseObject} = {
    '400': {
      description: 'Bad Request',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
              },
            },
          },
        },
      },
    },
    '500': {
      description: 'Bad Request',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
              },
            },
          },
        },
      },
    },
  };
  let notFoundResponses: {[satusCode: string]: ResponseObject} = {
    '404': {
      description: 'Not Found',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
              },
            },
          },
        },
      },
    },
  }

  return {
    openapi: "3.0.3",
    info: {
      title: 'api',
      description: 'api',
      version: '1.0.0',
    },
    paths: {
      "/locations": {
        get: {
          parameters: [
            {
              in: 'query',
              name: 'continuationToken',
              schema: {
                type: 'string',
              },
            },
            {
              in: 'query',
              name: 'maxLocations',
              schema: {
                // Ideally the type here would be integer. However, it seems that
                // api gateway will ignore that and pass it through as a string
                // either way. With it set to string here, at least the type in the
                // generated typescript .d.ts file will be correct. Api gateway also
                // unfortunately doesn't do validation of the pattern here either so
                // this must also be enforced in the handler itself.
                type: 'string',
                pattern: '^[1-9][0-9]+$'
              },
            },
          ],
          responses: {
            '200': {
              description: 'retrieved locations',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      locations: {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/locationOutput'},
                      },
                      continuationToken: {
                        type: 'string',
                      },
                    },
                  },
                },
              },
            },
            ...errorResponses,
          },
          'x-amazon-apigateway-integration': integration,
        },
        post: {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {'$ref': '#/components/schemas/locationInput'},
              },
            },
          },
          responses: {
            '200': {
              description: 'the location has been successfully created',
              content: {
                'application/json': {
                  schema: {'$ref': '#/components/schemas/locationOutput'},
                },
              },
            },
            ...errorResponses,
          },
          'x-amazon-apigateway-integration': integration,
          'x-amazon-apigateway-auth': {type: 'AWS_IAM'},
        },
      },
      "/locations/{id}": {
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        get: {
          responses: {
            '200': {
              description: 'the location has been successfully updated',
              content: {
                'application/json': {
                  schema: {'$ref': '#/components/schemas/locationOutput'},
                },
              },
            },
            ...errorResponses,
            ...notFoundResponses,
          },
          'x-amazon-apigateway-integration': integration,
        },
        put: {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {$ref: '#/components/schemas/locationInput'},
              },
            },
          },
          responses: {
            '200': {
              description: 'the location has been successfully updated',
              content: {
                'application/json': {
                  schema: {'$ref': '#/components/schemas/locationOutput'},
                },
              },
            },
            ...errorResponses,
            ...notFoundResponses,
          },
          'x-amazon-apigateway-integration': integration,
          'x-amazon-apigateway-auth': {type: 'AWS_IAM'},
        },
        delete: {
          responses: {
            '204': {
              description: 'the location was successfully deleted'
            },
            ...errorResponses,
            ...notFoundResponses,
          },
          'x-amazon-apigateway-integration': integration,
        },
      },
    },
    'x-amazon-apigateway-request-validators': {
      basic: {
        validateRequestBody: true,
        validateRequestParameters: true,
      },
    },
    'x-amazon-apigateway-request-validator': 'basic',
    components: {
      schemas: {
        id: {
          required: ['id'],
          properties: {
            id: {
              type: 'string',
            },
          },
        },
        locationInput: {
          ...locationInput,
          required: Object.keys(locationInput.properties!),
        },
        coordinates,
        locationOutput: {
          allOf: [
            {'$ref': '#/components/schemas/locationInput'},
            {'$ref': '#/components/schemas/coordinates'},
            {'$ref': '#/components/schemas/id'},
          ],
        },
      },
    },
  };
}
