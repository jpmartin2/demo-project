import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DemoProjectStack } from '../lib/demo-project-stack';

const app = new cdk.App();
new DemoProjectStack(app, 'DemoProjectStack', {
    env: {
        region: 'us-east-1',
    },
});