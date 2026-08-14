import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const build = readFileSync("android/app/build.gradle.kts", "utf8");
const activity = readFileSync(
  "android/app/src/main/java/kz/horeca/app/MainActivity.java",
  "utf8",
);
const manifest = readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
const networkSecurity = readFileSync(
  "android/app/src/main/res/xml/network_security_config.xml",
  "utf8",
);
const qualityWorkflow = readFileSync(".github/workflows/quality.yml", "utf8");

describe("Android WebView wrapper", () => {
  it("keeps the package identity and release URL build-configurable", () => {
    expect(build).toContain('applicationId = "kz.horeca.app"');
    expect(build).toContain('providers.gradleProperty("webAppUrl")');
    expect(build).toContain('buildConfigField("String", "WEB_APP_URL"');
  });

  it("keeps file access closed and external navigation outside the WebView", () => {
    expect(activity).toContain("settings.setJavaScriptEnabled(true)");
    expect(activity).toContain("settings.setAllowFileAccess(false)");
    expect(activity).toContain("settings.setAllowContentAccess(false)");
    expect(activity).toContain("isTrustedAppUri(uri)");
    expect(activity).toContain('"mailto".equals(scheme)');
    expect(activity).toContain('"tel".equals(scheme)');
    expect(activity).not.toContain("addJavascriptInterface");
  });

  it("allows cleartext only for the local emulator and builds a CI debug artifact", () => {
    expect(manifest).not.toContain('android:usesCleartextTraffic="true"');
    expect(networkSecurity).toContain('<base-config cleartextTrafficPermitted="false"');
    expect(networkSecurity).toContain(">10.0.2.2</domain>");
    expect(qualityWorkflow).toContain("gradle :app:assembleDebug");
    expect(qualityWorkflow).toContain("android/app/build/outputs/apk/debug/app-debug.apk");
  });
});
