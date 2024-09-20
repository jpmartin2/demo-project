export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {tsconfig: '<rootDir>/tsconfig.json', useESM: true}],
  },
  extensionsToTreatAsEsm: [".ts"],
};
