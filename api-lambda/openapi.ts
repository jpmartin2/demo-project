import * as gen from '../openapi/location-api.gen'; // generated from the spec defined in ../lib/openapi.ts

// Typings that make it easy to take generated definitions from openapi-typescript and use them to
// implement handler methods for a lambda.

type Content = {content: {"application/json": any}};
type RequestBody<r> = r extends {requestBody: Content} ? r["requestBody"]["content"]["application/json"] : never;
type Response<r, code extends keyof any> = r extends {responses: Record<code, any>} ? (r["responses"][code] extends {content: any} ? {statusCode: code, body: r["responses"][code]["content"]["application/json"]} : {statusCode: code}) : never;
type Params<r> = {
    path: r extends {parameters: {path: any}} ? r["parameters"]["path"] : {},
    query: r extends {parameters: {query?: any}} ? r["parameters"]["query"] : {},
};
type ResponseCodes<r> = r extends {responses: any} ? keyof r["responses"] : never;
type Responses<r> = {
  [code in ResponseCodes<r>]: Response<r, code>;
}[ResponseCodes<r>];
type MethodsForPath<path extends keyof gen.paths> = Omit<gen.paths[path], 'parameters'>;

// This type will conveniently enforce that all path/method combinations from the openapi spec are
// implemented with the correct types.
export type Handlers = {
  [path in keyof gen.paths]: {
    [method in keyof MethodsForPath<path>]: (
      params: Params<MethodsForPath<path>[method]>, 
      body: RequestBody<MethodsForPath<path>[method]>
    ) => Promise<Responses<MethodsForPath<path>[method]>>;
  }
};
// A type-erased version of the handler method signature
// individual handlers are cast to this type by the top level
// handler that needs to dynamically dispatch to the correct method handler.
export type UnsafeHandler = (params: {path: object, query: object}, body: any) => Promise<{statusCode: number, body: any}>;
// Convenient re-exports of types from the generated schema
export type LocationInput = gen.components["schemas"]["locationInput"];
export type LocationOutput = gen.components["schemas"]["locationOutput"];
export type Coordinates = gen.components["schemas"]["coordinates"];
export type Id = gen.components["schemas"]["id"];