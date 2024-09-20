import {
    DynamoDBClient, AttributeValue,
    GetItemCommand, ScanCommand, PutItemCommand, DeleteItemCommand, 
    ConditionalCheckFailedException,
} from '@aws-sdk/client-dynamodb';
import * as openapi from './openapi';

export class LocationNotFoundException extends Error {
    constructor(id: string) {
        super(`location '${id}' not found`);
    }
}

export namespace LocationOutput {
    export function toAttributes(location: openapi.LocationOutput): Record<string, AttributeValue> {
        return {
            id: {S: location.id},
            state: {S: location.state},
            country: {S: location.country},
            name: {S: location.name},
            city: {S: location.city},
            latitude: {N: location.latitude.toString()},
            longitude: {N: location.longitude.toString()},
        }
    }
  
    export function fromAttributes(attrs: Record<string, AttributeValue>): openapi.LocationOutput {
        return {
            id: attrs.id.S!,
            name: attrs.name.S!,
            country: attrs.country.S!,
            state: attrs.state.S!,
            city: attrs.city.S!,
            latitude: Number.parseFloat(attrs.latitude.N!),
            longitude: Number.parseFloat(attrs.longitude.N!),
        }
    }
}

export interface IDb {
    createLocation(location: openapi.LocationOutput): Promise<openapi.LocationOutput>;
    deleteLocation(id: string): Promise<void>;
    getLocation(id: string): Promise<openapi.LocationOutput>;
    getLocations(first?: string, limit?: number): Promise<[(openapi.LocationOutput)[], string | undefined]>;
    putLocation(location: openapi.LocationOutput): Promise<openapi.LocationOutput>;
}

export class Db implements IDb {
    readonly client: DynamoDBClient;
    readonly tableName: string;

    constructor(client: DynamoDBClient, tableName: string) {
        this.client = client;
        this.tableName = tableName;
    }

    async createLocation(location: openapi.LocationOutput): Promise<openapi.LocationOutput> {
        await this.client.send(new PutItemCommand({
            TableName: this.tableName,
            Item: LocationOutput.toAttributes(location),
            ConditionExpression: 'attribute_not_exists(id)',
        }));
        return location;
    }
    
    async deleteLocation(id: string): Promise<void> {
        try {
            await this.client.send(new DeleteItemCommand({
                TableName: this.tableName,
                Key: {id: {S: id}},
                ConditionExpression: 'attribute_exists(id)',
            }));
        } catch(e) {
            if (e instanceof ConditionalCheckFailedException) {
                throw new LocationNotFoundException(id);
            } else {
                throw e;
            }
        }
    }
    
    async getLocation(id: string): Promise<openapi.LocationOutput> {
        let res = await this.client.send(new GetItemCommand({
            TableName: this.tableName,
            Key: {id: {S: id}},
        }));
        if (!res.Item) {
            throw new LocationNotFoundException(id);
        }
        return LocationOutput.fromAttributes(res.Item!);
    }
    
    async getLocations(first?: string, limit?: number): Promise<[(openapi.LocationOutput)[], string | undefined]> {
        let res = await this.client.send(new ScanCommand({
            TableName: this.tableName,
            ExclusiveStartKey: first == undefined ? undefined : {id: {S: first}},
            Limit: limit,
        }));
        return [res.Items?.map(item => LocationOutput.fromAttributes(item)) ?? [], res.LastEvaluatedKey?.id.S];
    }
    
    async putLocation(location: openapi.LocationOutput): Promise<openapi.LocationOutput> {
        try {
            await this.client.send(new PutItemCommand({
                TableName: this.tableName,
                Item: LocationOutput.toAttributes(location),
                ConditionExpression: 'attribute_exists(id)',
            }));
            return location;
        } catch(e) {
            if (e instanceof ConditionalCheckFailedException) {
                throw new LocationNotFoundException(location.id);
            } else {
                throw e;
            }
        }
    }
}