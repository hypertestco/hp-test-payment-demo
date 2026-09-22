import { HyperProbe } from '@hyperprobe/node-sdk';

console.log('process.env.NODE_ENV',process.env.HYPERPROBE_BROKER_URL);
if (process.env.NODE_ENV && process.env.GIT_COMMIT) {
  HyperProbe.start({
    serviceId: process.env.HYPERPROBE_SERVICE_ID || '',
    environment: process.env.NODE_ENV, // Your environment name (e.g. dev, staging, production). Use whatever variable contains the env value.
    brokerUrl: process.env.HYPERPROBE_BROKER_URL || '',
    commitSha: process.env.GIT_COMMIT, // CI-injected commit SHA
    distLocation: './dist',
    syncIntervalMs: 5000,
  });
}