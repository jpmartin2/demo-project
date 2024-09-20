import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import {randomUUID} from 'crypto';
import {IDb, LocationNotFoundException} from './db';
import {INominatim, LocationLookupException} from './nominatim';
import * as openapi from './openapi';

const maxLocationsRegex = RegExp('^[1-9][0-9]*$');

const Ok = 200;
const NoContent = 204;
const BadRequest = 400;
const NotFound = 404;
const InternalServerError = 500;

const InternalServerErrorResponse = {
    statusCode: InternalServerError,
    body: JSON.stringify({message: "Internal Server Error"}),
    isBase64Encoded: false,
};

export class Handlers {
    // The openapi.Handlers type here conveniently enforces that all path/method combinations from
    // the openapi spec are implemented here, and provides the correct types for the parameters,
    // body and return.
    readonly handlers: openapi.Handlers;

    constructor(db: IDb, nominatim: INominatim) {
        this.handlers = {
            "/locations": {
                get: async(params) => {
                    // Extra validation here because api gateway doesn't validate
                    // parameters beyond that required ones are present.
                    let maxLocationsStr = params.query?.maxLocations;
                    let maxLocations = undefined;
                    if (maxLocationsStr != null) {
                        if (!maxLocationsStr.match(maxLocationsRegex)) {
                            return {
                            statusCode: BadRequest,
                            body: {
                                message: "Request validation failed",
                            },
                            };
                        }
                        maxLocations = Number.parseInt(maxLocationsStr);
                    }
                    let [locations, continuationToken] = await db.getLocations(params.query?.continuationToken, maxLocations);
                    return {
                        statusCode: Ok,
                        body: {locations, continuationToken},
                    };
                },
                post: async(params, body) => {
                    try {
                        return {
                            statusCode: Ok,
                            body: await db.createLocation({
                            id: randomUUID().toString(),
                            ...await nominatim.lookupLocation(body),
                            ...body
                            }),
                        };
                    } catch(e: any) {
                        if (e instanceof LocationLookupException) {
                            return {statusCode: BadRequest, body: {message: e.message}};
                        }
                        throw e;
                    }
                },
                },
                "/locations/{id}": {
                delete: async(params) => {
                    try {
                        await db.deleteLocation(params.path.id);
                        return {statusCode: NoContent};
                    } catch(e: any) {
                        if (e instanceof LocationNotFoundException) {
                            return {statusCode: NotFound, body: {message: e.message}};
                        } else if (e instanceof LocationLookupException) {
                            return {statusCode: BadRequest, body: {message: e.message}};
                        }
                        throw e;
                    }
                },
                get: async(params) => {
                    try {
                        return {
                            statusCode: Ok,
                            body: await db.getLocation(params.path.id),
                        };
                    } catch(e: any) {
                        if (e instanceof LocationNotFoundException) {
                            return {statusCode: NotFound, body: {message: e.message}};
                        }
                        throw e;
                    }
                },
                put: async(params, body) => {
                    try {
                        return {
                            statusCode: Ok,
                            body: await db.putLocation({
                            id: params.path.id,
                            ...await nominatim.lookupLocation(body),
                            ...body
                            }),
                        };
                    } catch(e: any) {
                        if (e instanceof LocationNotFoundException) {
                            return {statusCode: NotFound, body: {message: e.message}};
                        } else if (e instanceof LocationLookupException) {
                            return {statusCode: BadRequest, body: {message: e.message}};
                        }
                        throw e;
                    }
                },
            },
        }
    };

    async dispatch(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
        const body = event.body ? JSON.parse(event.body) : undefined;
        const params = {
            path: event.pathParameters ?? {},
            query: event.queryStringParameters ?? {},
        }
        const path = event.resource;
        const method = event.httpMethod.toLowerCase();
      
        if (!(path in this.handlers)) {
            console.error(`unhandled method ${method} ${path}`);
            return InternalServerErrorResponse;
        }
        const methods = this.handlers[path as keyof openapi.Handlers];
        if (!(method in methods)) {
            console.error(`unhandled method ${method} ${path}`);
            return InternalServerErrorResponse;
        }
      
        const handler = methods[method as keyof typeof methods]!;
        // UnsafeHandler is a type-erased version of the handler signature;
        // this should be safe since apigateway is doing request validation.
        try {
            const res = await (handler as openapi.UnsafeHandler)(params, body);
        
            return {
                statusCode: res.statusCode,
                body: JSON.stringify(res.body),
                isBase64Encoded: false,
            };
        } catch (e: any) {
            console.error(e);
            return InternalServerErrorResponse;
        }
    }
}