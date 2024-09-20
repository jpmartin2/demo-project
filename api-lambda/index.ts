import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {Handlers} from './handlers';
import {Db} from './db';
import {Nominatim} from './nominatim';
import env from './env';

const ddb = new DynamoDBClient({region: env.AWS_REGION});
const db = new Db(ddb, env.LOCATIONS_TABLE_NAME);
const nominatim = new Nominatim();
const handlers = new Handlers(db, nominatim);

// Common api handler for all api routes. Delegates to specific implementations from the above map.
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    return handlers.dispatch(event);
};
