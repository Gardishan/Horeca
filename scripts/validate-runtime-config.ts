import { validateRuntimeConfiguration } from "../lib/runtime-config";

const configuration = validateRuntimeConfiguration(process.env);
console.log(
  JSON.stringify(
    {
      ok: true,
      appEnvironment: configuration.appEnvironment,
      appOrigin: configuration.appOrigin,
      deploymentVersion: configuration.deploymentVersion,
      rateLimitMode: configuration.rateLimitMode,
    },
    null,
    2,
  ),
);
