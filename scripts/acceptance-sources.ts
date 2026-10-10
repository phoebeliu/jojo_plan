import { Store, uid } from "../packages/core/src/store.js";
import { Service } from "../packages/core/src/service.js";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
const root = resolve("output/acceptance/sources");
mkdirSync(root, { recursive: true });
const store = new Store(root, resolve("packages/storage/migrations"));
const service = new Service(store, {
  run: async () => {
    throw Error("source reading must not call model");
  },
});
async function call(
  method: string,
  payload: any,
  projectId: string | null = null,
) {
  const r = await service.command({
    schemaVersion: 2,
    requestId: uid(),
    projectId,
    expectedRevision: null,
    method,
    payload,
  });
  if (!r.ok) throw Error(JSON.stringify(r.error));
  return r.result;
}
const proof: any = { date: new Date().toISOString(), checks: [] };
function check(name: string, ok: boolean) {
  proof.checks.push({ name, pass: ok });
  console.log((ok ? "PASS " : "FAIL ") + name);
  if (!ok) throw Error(name);
}
async function settle(id: string) {
  while (service.active.has(id)) await new Promise((r) => setTimeout(r, 200));
}
try {
  const p = await call("project.create", { name: "公共来源读取实测" });
  const w = await call(
    "work.create",
    {
      name: "IANA来源",
      kind: "document",
      goal: "说明示例域名用途",
      criteria: ["来源可追踪"],
    },
    p.id,
  );
  const job = await call(
    "material.fetch",
    {
      workId: w.id,
      url: "https://www.iana.org/help/example-domains",
      allowFetch: true,
    },
    p.id,
  );
  await settle(w.id);
  let d = store.detail(w.id);
  const material = d.artifacts.find((a: any) => a.kind === "source_material");
  check(
    "public page actually read and stored with URL",
    !!material &&
      /example/i.test(material.text) &&
      material.metadata.origin.startsWith("https://www.iana.org/"),
  );
  check(
    "real background job finishes",
    d.jobs.find((j: any) => j.id === job.operationId)?.state === "succeeded",
  );
  const n = d.artifacts.length;
  const denied = await call(
    "material.fetch",
    { workId: w.id, url: "https://127.0.0.1/private", allowFetch: true },
    p.id,
  );
  await settle(w.id);
  d = store.detail(w.id);
  check(
    "loopback URL blocked without imported data",
    d.jobs.find((j: any) => j.id === denied.operationId)?.state === "failed" &&
      d.artifacts.length === n,
  );
  proof.materialHash = material.object_hash;
  proof.origin = material.metadata.origin;
} finally {
  service.stop();
  store.close();
  writeFileSync(
    resolve(root, "sources-proof.json"),
    JSON.stringify(proof, null, 2),
  );
}
