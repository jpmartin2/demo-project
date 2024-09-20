import {spawnSync} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {Construct} from 'constructs';
import * as cdk from 'aws-cdk-lib';

import {spec} from '../openapi/location-api';
import {PassedEnvVars} from '../api-lambda/env';
import { MethodLoggingLevel } from 'aws-cdk-lib/aws-apigateway';

export class DemoProjectStack extends cdk.Stack {
  constructor(app: Construct, id: string, props?: cdk.StackProps) {
    super(app, id, props);

    let locationsTable = new cdk.aws_dynamodb.TableV2(this, 'LocationsTable', {
      partitionKey: { name: 'id', type: cdk.aws_dynamodb.AttributeType.STRING },
      billing: cdk.aws_dynamodb.Billing.onDemand(),
    });

    // This is a bit hacky, but it ensures that running a synth always gets up to date openapi specs
    let specPath = path.join(import.meta.dirname, '../openapi/location-api.gen.json');
    fs.writeFileSync(specPath, JSON.stringify(spec({
      // These variables are only used in x-amazon-apigateway-integration, and shouldn't affect
      // the codegen that this instance is used for.
      functionArn: '',
      roleArn: '',
      region: '',
    })));
    let proc = spawnSync('npx', ['openapi-typescript', specPath, '-o', path.join(import.meta.dirname, '../openapi/location-api.gen.d.ts')]);
    if (proc.status != 0) {
      throw new Error(proc.output.toString());
    }
    proc = spawnSync('npx', ['openapi-typescript', path.join(import.meta.dirname, '../openapi/nominatim.json'), '-o', path.join(import.meta.dirname, '../openapi/nominatim.gen.d.ts')]);
    if (proc.status != 0) {
      throw new Error(proc.output.toString());
    }

    let apiLambda = new cdk.aws_lambda_nodejs.NodejsFunction(this, 'ApiLambda', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      entry: path.join(import.meta.dirname, '../api-lambda/index.ts'),
      handler: "handler",
      // PassedEnvVars is a helper to make sure the environment variables passed to the lambda
      // are consistent between what's set here and what the lambda itself is expecting.
      environment: PassedEnvVars({
        LOCATIONS_TABLE_NAME: locationsTable.tableName,
      }),
      timeout: cdk.Duration.seconds(10),
      bundling: {
        forceDockerBundling: true,
        preCompilation: true,
        minify: true,
        sourceMap: true,
      },
      currentVersionOptions: {
        // Retain because api gateway is referencing specific versions, if the old version
        // gets deleted, then there's a period where the api gateway is still using the old
        // version and fails since it's gone.
        // In a production setting you'd likely want to setup some way to prune old versions
        // so you don't have versions accruing endlessly.
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      },
    });
    locationsTable.grantReadWriteData(apiLambda);

    let gatewayInvocationRole = new cdk.aws_iam.Role(this, 'GatewayInvocationRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('apigateway.amazonaws.com'),
    });
    apiLambda.grantInvoke(gatewayInvocationRole);

    let gateway = new cdk.aws_apigateway.SpecRestApi(this, 'Gateway', {
      deploy: true,
      deployOptions: {
        stageName: 'demo',
      },
      apiDefinition: cdk.aws_apigateway.ApiDefinition.fromInline(spec({
        // Reference specific function version to ensure that the api config of the gateway
        // always matches with what the code of the lambda it's calling expects.
        functionArn: apiLambda.currentVersion.functionArn,
        roleArn: gatewayInvocationRole.roleArn,
        region: this.region,
      })),
    });
    
    // These outputs are used by the test to know how to call the api and clear out the ddb table.
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: gateway.url,
    });

    new cdk.CfnOutput(this, 'LocationsTableName', {
      value: locationsTable.tableName,
    });
  }
}
