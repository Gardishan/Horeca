import {
  RuntimeConfigurationError,
  validateRuntimeConfiguration,
} from "@/lib/runtime-config";

type RuntimeLogger = Pick<Console, "error" | "info">;
type TerminateProcess = (code: number) => never;

export function startNodeRuntime(
  environment: NodeJS.ProcessEnv = process.env,
  logger: RuntimeLogger = console,
  terminate: TerminateProcess = (code) => process.exit(code),
) {
  try {
    const configuration = validateRuntimeConfiguration(environment);
    logger.info(
      JSON.stringify({
        event: "runtime_configuration_validated",
        appEnvironment: configuration.appEnvironment,
        deploymentVersion: configuration.deploymentVersion,
        rateLimitMode: configuration.rateLimitMode,
      }),
    );
  } catch (error) {
    logger.error(
      JSON.stringify({
        event: "runtime_configuration_invalid",
        issues:
          error instanceof RuntimeConfigurationError
            ? error.issues
            : ["unexpected runtime validation failure"],
      }),
    );
    terminate(1);
  }
}
