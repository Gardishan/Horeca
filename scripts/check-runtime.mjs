import process from "node:process";

const supportedMajor = 22;
const currentMajor = Number(process.versions.node.split(".", 1)[0]);

if (currentMajor !== supportedMajor) {
  console.error(
    `Unsupported Node.js ${process.version}. HoReCa KZ is verified on Node.js ${supportedMajor}.x; use .nvmrc or .node-version.`,
  );
  process.exitCode = 1;
} else {
  console.log(`Runtime gate passed: Node.js ${process.version}.`);
}
