import { defineConfig } from 'smocky';

export default defineConfig({
  port: 3000,
  baseUrl: 'https://jsonplaceholder.typicode.com',
  endpointsDir: './endpoints',
  helpersDir: './helpers',
  globalHeaders: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': '*',
    'Access-Control-Allow-Headers': '*',
  },
  record: {
    enabled: false,
  },
  db: {
    dir: './db',
    persist: false,
    autoId: 'uuid',
  },
  openapi: {
    spec: './examples/openapi.json',
    check: {
      timeout: 5000,
      sampleData: './examples/openapi-samples.json',
      skipPaths: [],
      failOnMismatch: false,
    },
  },
});
