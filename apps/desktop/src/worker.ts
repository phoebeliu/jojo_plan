import { Store } from "../../../packages/core/src/store.js";
import { Service } from "../../../packages/core/src/service.js";
import { PiRuntime } from "../../../packages/core/src/runtime.js";
const [root, migrations, codex] = process.argv.slice(2);
const parent = (process as any).parentPort;
const keys = new Map<string, string>();
const store = new Store(root, migrations);
const service = new Service(
  store,
  new PiRuntime(root, codex || undefined),
  (id) => keys.get(id),
  (e) => parent.postMessage(e),
);
parent.on("message", async ({ data }: any) => {
  if (data.keys) {
    keys.clear();
    for (const [k, v] of Object.entries(data.keys)) keys.set(k, v as string);
    return;
  }
  if (data.stop) {
    service.stop();
    return;
  }
  if (data.callId) {
    const response = await service.command(data.request);
    parent.postMessage({ callId: data.callId, response });
  }
});
parent.postMessage({ ready: true });

process.on("SIGTERM", () => {
  service.stop();
  setTimeout(() => process.exit(0), 2200).unref();
});
