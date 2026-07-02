import { HyperProbe } from '@hyperprobe/node-sdk';

if (process.env.NODE_ENV && process.env.GIT_COMMIT) {
  HyperProbe.start({
    serviceId: '11932e68-7b9a-42c1-a2cc-e972e5585093',
    environment: process.env.NODE_ENV, // Your environment name (e.g. dev, staging, production). Use whatever variable contains the env value.
    brokerUrl: 'https://logger.app.hyperprobe.co',
    commitSha: process.env.GIT_COMMIT, // CI-injected commit SHA
    distLocation: './dist',
    syncIntervalMs: 5000
  });
}