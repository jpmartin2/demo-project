// Type definitions for working with environment variables

// Environment variables supplied by lambda
export type DefaultEnvVars = {
    AWS_REGION: string;
};
// Environment variables that must be set in CDK
export type PassedEnvVars = {
    LOCATIONS_TABLE_NAME: string;
};
export function PassedEnvVars(vars: PassedEnvVars): PassedEnvVars {
    return vars;
}

const env: DefaultEnvVars & PassedEnvVars = process.env as (DefaultEnvVars & PassedEnvVars);
export default env;