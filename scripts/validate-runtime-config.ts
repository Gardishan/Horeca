import { validateRuntimeConfiguration } from "../lib/runtime-config";

const configuration = validateRuntimeConfiguration(process.env);
console.log(
  JSON.stringify(
    {
      ok: true,
      appEnvironment: configuration.appEnvironment,
      appOrigin: configuration.appOrigin,
      deploymentVersion: configuration.deploymentVersion,
      malwareScanMode: configuration.malwareScanMode,
      rateLimitMode: configuration.rateLimitMode,
      storageMode: configuration.storageMode,
    },
    null,
    2,
  ),
);
