# Demo Project

This implements a very simple CRUD application using aws serverless technologies like api gateway, lambda,
dynamodb, all deployed using CDK.

## Project Structure

```
.
├─ api-lambda ─ AWS Lambda to handle the location api
│  ├─ db.ts ────────── DynamoDB client wrapper
│  ├─ env.ts ───────── Typesafe access to environment variables
│  ├─ handlers.ts ──── API method implementations
│  ├─ index.ts ─────── Root module imported by Lambda
│  ├─ nominatim.ts ─── OSM nominatim api client wrapper
│  └─ openapi.ts ───── Type definitions to aid in implementing the openapi spec in a typesafe way
│
├─ bin ─ Top level CDK application code
│  └─ demo-project.ts ─ CDK app that instantiates demo-project-stack
│
├─ lib ─ CDK stacks
│  └─ demo-project-stack.ts ─ CDK stack defining all the necessary AWS resources for the project
│
├─ openapi ─ Openapi specs (used with openapi-typescript to generate typings)
│  ├─ location-api.ts ─ openapi spec for the location api
│  └─ nominatim.json ── Simplified openapi spec for the OSM nominatim api
│
└─ test
   └─ e2e.test.ts ─ End to end tests for the project 
```

## Deploying

To deploy the application run:

```
npm ci
npm run cdk -- deploy
```

This will deploy a stack named DemoProjectStack to us-east-1.

## Running the e2e tests─

There's a simple set of end to end tests that can be run with:

```
npm run test
```

The tests dynamically query cloudformation to discover the api gateway url, and also connect to dynamodb
to be able to ensure a consistent state for each test (the db is cleared before each test). Because of this,
the tests must be run with appropriate aws credentials. These credentials are also used to invoke some of the apis
as the write apis are protected using IAM authentication.

## Productionization

Before a service like this would be deployed to production there's a number of things that would likely need to be done, for example:

- **Authentication**: Right now the write apis are protected using IAM auth. In a production setup, other modes of authentication may be desirable as well (e.g. using Cognito to authenticate users on a website).
- **Support additional query patterns**: The current api is very simple and limited. In a production setting it is likely more use cases may need to be covered, e.g. being able to query locations by country, state, etc. Querying by country, state, etc. would be very easy to add using a global secondary index on the dynamo table. Another potential use case would be querying locations within a certain raidus of somewhere - this gets a little more tricky but would still be possible to implement using some form of geohashing, e.g. https://h3geo.org/ which has javascript bindings, though this would be more work than if the database were postgres and you could just use the postgis extension. Additionally the only update method implemented is a PUT which requires updating all fields at once - depending on the use cases, it may be desirable to e.g. PATCH just the name etc.
- **Improved error handling, logging, metrics**: The current implmentation only has very basic error handling and logging. There are a number of places where a fully productionized version would likely want to make things more robust. There are also no metrics other than what's provided by default by api gateway, lambda etc., a production setup may need some amount of custom metrics.
- **Additional testing**: The current tests are a set of rudimentary end to end tests. For a production setup it would make sense to add more tests including e.g. unit tests - I just focused on the end to end tests in the time I had to ensure that the full functionality was being tested.
- **Custom domain**: In a production setup it is likely that you'd want to host the api on a custom domain instead of the auto-generated api-gateway domain.
- **CI/CD, Automation**: A production setup would need a CI/CD pipeline or something similar for managing deployments, performing automated testing, etc.
- **Configuration tuning**: There are a lot of parameters that you might want to tune for a production deployment, e.g. lambda memory etc. 
