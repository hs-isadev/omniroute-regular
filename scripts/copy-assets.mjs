import { cp, mkdir } from "node:fs/promises";

await mkdir("apps/dashboard/dist", { recursive: true });
await cp("apps/dashboard/public", "apps/dashboard/dist", { recursive: true });
await cp("packages/vault/src/dpapi-helper.ps1", "packages/vault/dist/dpapi-helper.ps1");
await mkdir("installers/windows/dist", { recursive: true });
await cp("installers/windows/service-task.ps1", "installers/windows/dist/service-task.ps1");
await cp("installers/windows/daemon-hidden.vbs", "installers/windows/dist/daemon-hidden.vbs");
await mkdir("packages/integrations/claude-desktop/dist", { recursive: true });
await cp(
  "packages/integrations/claude-desktop/manifest.json",
  "packages/integrations/claude-desktop/dist/manifest.json",
);
