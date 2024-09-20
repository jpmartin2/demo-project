import {CloudFormationClient, DescribeStacksCommand} from "@aws-sdk/client-cloudformation";
import {DynamoDBClient, ScanCommand, BatchWriteItemCommand} from "@aws-sdk/client-dynamodb";
import {default as createClient, Middleware} from "openapi-fetch";
import {paths} from "../openapi/location-api.gen";
import {LocationOutput} from "../api-lambda/openapi";
import schema from "../openapi/location-api.gen.json";
import {expect, test, beforeEach, describe} from "@jest/globals";
import {AwsClient} from "aws4fetch";
import {fromNodeProviderChain} from "@aws-sdk/credential-providers";

// Auth middleware that does sigv4 signing using credentials from the standard provider chain
const credentialProvider = fromNodeProviderChain();
const authMiddleware: Middleware = {
    async onRequest({schemaPath, request}): Promise<Request | undefined> {
        // Only sign for requests that have auth enabled
        if (!(schema.paths as any)[schemaPath]?.[request.method.toLowerCase()]?.['x-amazon-apigateway-auth']) {
            return undefined;
        }

        let {accessKeyId, secretAccessKey, sessionToken} = await credentialProvider();
        return await new AwsClient({
            accessKeyId,
            secretAccessKey,
            sessionToken,
        }).sign(request);
    }
};

// Dynamically check cfn outputs on the stack to determine the api endpoint and ddb table name.
const cfn = new CloudFormationClient({region: 'us-east-1'});
const ddb = new DynamoDBClient({region: 'us-east-1'});
const info = cfn.send(new DescribeStacksCommand({
    StackName: 'DemoProjectStack',
})).then(res => {
    let client = createClient<paths>({ 
        baseUrl: res.Stacks![0].Outputs!.find(o => o.OutputKey! == 'ApiUrl')!.OutputValue! 
    });
    client.use(authMiddleware);
    return {
        client,
        tableName: res.Stacks![0].Outputs!.find(o => o.OutputKey! == 'LocationsTableName')!.OutputValue!,
    };
});

// Helper for cleaning up items from the table
async function deleteItems(tableName: string, ids: string[]) {
    const BATCH_SIZE = 25;
    while (ids.length > 0) {
        let res = await ddb.send(new BatchWriteItemCommand({
            RequestItems: {
                [tableName]: ids.splice(0, BATCH_SIZE).map(id => ({
                    DeleteRequest: {Key: {id: {S: id}}},
                })),
            },
        }));
        if (res.UnprocessedItems?.[tableName]) {
            // Probably should do this a little more safely, but this should be fine for the purposes of this demo.
            ids.push(...res.UnprocessedItems[tableName].map(req => req.DeleteRequest!.Key!.id.S!))
        }
    }
}

// Helper for deleting all items from a table. If there were a huge number
// of items in the table this could take a while, but it should be fine
// for the purposes of this demo.
async function truncateTable(tableName: string) {
    do {
        let res = await ddb.send(new ScanCommand({
            TableName: tableName,
        }));
        if (res.Count === 0) {
            break;
        }
        await deleteItems(tableName, res.Items!.map(item => item.id.S!));
    } while(true);
}

// Helper to create n new locations using the api
async function createLocations(n: number): Promise<LocationOutput[]> {
    let {client} = await info;
    return (await Promise.all(Array(n).fill(null).map((_, i) => client.POST("/locations", {
        body: {
            name: `Location${i}`,
            city: "New York",
            state: "NY",
            country: "US",
        }
    })))).map(res => {
        if (!res.response.ok) {
            throw new Error(`error creating locations for test: ${JSON.stringify(res.error)}`);
        }
        return res.data!;
    });
}

// These tests assume they're not running concurrently since they're interacting
// with shared state in the dynamodb table that the api uses. Thus jest should
// be run with the --runInBand or -i flag (as is done in the test script in package.json)

beforeEach(async () => {
    const {tableName} = await info;
    // Ensure each test starts with a clean table
    await truncateTable(tableName);
});

describe('GET /locations', () => {
    test('pagination works', async() => {
        let {client} = await info;
        let createdLocations = await createLocations(10);
        let getLocations = [];
        let token = undefined;

        let {response, data, error} = await client.GET("/locations", {
            params: {query: {maxLocations: "3", continuationToken: token}}
        });
        expect(response.ok).toBe(true);
        token = data!.continuationToken;
        expect(token).toBeDefined();
        expect(data!.locations!.length).toBe(3);
        getLocations.push(...data!.locations!);

        ({response, data} = await client.GET("/locations", {
            params: {query: {maxLocations: "3", continuationToken: token}}
        }));
        expect(response.ok).toBe(true);
        token = data!.continuationToken;
        expect(token).toBeDefined();
        expect(data!.locations!.length).toBe(3);
        getLocations.push(...data!.locations!);

        ({response, data} = await client.GET("/locations", {
            params: {query: {maxLocations: "3", continuationToken: token}}
        }));
        expect(response.ok).toBe(true);
        token = data!.continuationToken;
        expect(token).toBeDefined();
        expect(data!.locations!.length).toBe(3);
        getLocations.push(...data!.locations!);

        ({response, data} = await client.GET("/locations", {
            params: {query: {maxLocations: "3", continuationToken: token}}
        }));
        expect(response.ok).toBe(true);
        token = data!.continuationToken;
        expect(token).toBeUndefined();
        expect(data!.locations!.length).toBe(1);
        getLocations.push(...data!.locations!);

        createdLocations.sort((l, r) => l.id < r.id ? -1 : (l.id == r.id ? 0 : 1));
        getLocations.sort((l, r) => l.id < r.id ? -1 : (l.id == r.id ? 0 : 1));
        expect(getLocations).toStrictEqual(createdLocations);
    });
});

describe('POST /locations', () => {
    test('happy path', async() => {
        let {client} = await info;
        let locationData = {
            name: 'Foo',
            city: 'Seattle',
            state: 'WA',
            country: 'US',
        };
        let {response, data} = await client.POST("/locations", {
            body: locationData,
        });
        expect(response.ok).toBe(true);
        expect(data?.id).toMatch(new RegExp('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'));
        expect(Object.assign({}, data)).toStrictEqual({
            id: data?.id,
            ...locationData,
            // Because this data is coming from OSM, we probably don't really want
            // to be actually checking it strictly like this, but for the purposes
            // of this demo, this is good enough.
            latitude: 47.6038321,
            longitude: -122.330062,
        });
    });
});

describe('GET /locations/{id}', () => {
    test('happy path', async() => {
        let {client} = await info;
        let locations = await createLocations(3);
        for (let location of locations) {
            let {response, data} = await client.GET("/locations/{id}", {
                params: {path: {id: location.id}},
            });
            expect(response.ok).toBe(true);
            expect(data).toStrictEqual(location);
        }
    });

    test('fails for unknown id', async() => {
        let {client} = await info;
        let {response} = await client.GET("/locations/{id}", {
            params: {path: {id: 'foo'}},
        });
        expect(response.ok).toBe(false);
        expect(response.status).toBe(404);
    });
});

describe('PUT /locations/{id}', () => {
    test('happy path', async() => {
        let {client} = await info;
        let [location] = await createLocations(1);
        let updatedLocationData = {
            name: 'Foo',
            city: 'Seattle',
            state: 'WA',
            country: 'US',
        };
        let {response, data} = await client.PUT("/locations/{id}", {
            params: {path: {id: location.id}},
            body: updatedLocationData,
        });
        expect(response.ok).toBe(true);
        expect(Object.assign({}, data)).toStrictEqual({
            id: location.id,
            ...updatedLocationData,
            // Because this data is coming from OSM, we probably don't really want
            // to be actually checking it strictly like this, but for the purposes
            // of this demo, this is good enough.
            latitude: 47.6038321,
            longitude: -122.330062,
        });
    });

    test('fails for unknown id', async() => {
        let {client} = await info;
        let updatedLocationData = {
            name: 'Foo',
            city: 'Seattle',
            state: 'WA',
            country: 'US',
        };
        let {response} = await client.PUT("/locations/{id}", {
            params: {path: {id: 'foo'}},
            body: updatedLocationData,
        });
        expect(response.ok).toBe(false);
        expect(response.status).toBe(404);
    });
});

describe('DELETE /locations/{id}', () => {
    test('happy path', async() => {
        let {client} = await info;
        let locations = await createLocations(2);
        {
            let {response} = await client.DELETE("/locations/{id}", {
                params: {path: {id: locations[0].id}},
            });
            expect(response.ok).toBe(true);
        }
        {
            let {response, data} = await client.GET("/locations");
            expect(response.ok).toBe(true);
            expect(data?.continuationToken).toBeUndefined();
            expect([...data?.locations!]).toStrictEqual([locations[1]]);
        }
    });

    test('fails for unknown id', async() => {
        let {client} = await info;
        let {response} = await client.DELETE("/locations/{id}", {
            params: {path: {id: 'foo'}},
        });
        expect(response.ok).toBe(false);
        expect(response.status).toBe(404);
    });
})