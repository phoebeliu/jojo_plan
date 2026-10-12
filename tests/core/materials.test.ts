import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Store, uid } from "../../packages/core/src/store.js";
import { Service } from "../../packages/core/src/service.js";
import {
  binaryHash,
  decodeMaterial,
  parseMaterial,
} from "../../packages/core/src/materials.js";
import { parseFiles } from "../../packages/core/src/delivery.js";
import { unzipSync } from "fflate";
export function pdfFixture() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...["PAGE ONE SYNTHETIC", "PAGE TWO SYNTHETIC"].map((text) => {
      const stream = `BT /F1 12 Tf 20 350 Td (${text}) Tj ET`;
      return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    }),
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const offset = Buffer.byteLength(body);
  body +=
    "xref\n0 8\n0000000000 65535 f \n" +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`;
  return Buffer.from(body);
}
function req(method: string, payload: any, pid: string | null = null) {
  return {
    schemaVersion: 2,
    requestId: uid(),
    projectId: pid,
    expectedRevision: null,
    method,
    payload,
  };
}
const unused = {
  run: async () => {
    throw Error("must not call model");
  },
};
async function settled(service: Service, id: string) {
  const end = Date.now() + 5000;
  while (service.active.has(id) && Date.now() < end)
    await new Promise((r) => setTimeout(r, 10));
  assert.equal(service.active.has(id), false);
}
test("PDF selected pages have exact source locators; invalid binary and range fail", async () => {
  const data = decodeMaterial(pdfFixture().toString("base64"));
  const parsed = await parseMaterial(
    data,
    "/private/tmp",
    new AbortController().signal,
    undefined,
    2,
    2,
  );
  assert.match(parsed.text, /PDF第2页/);
  assert.match(parsed.text, /PAGE TWO/);
  assert.doesNotMatch(parsed.text, /PAGE ONE/);
  assert.deepEqual(parsed.spans[0].locator, { page: 2 });
  assert.equal(parsed.metadata.ocrApplied, false);
  assert.throws(() => decodeMaterial("garbage"));
  assert.throws(() => decodeMaterial(Buffer.from("HTML").toString("base64")));
  await assert.rejects(
    parseMaterial(
      data,
      "/private/tmp",
      new AbortController().signal,
      undefined,
      3,
      3,
    ),
    /页码/,
  );
});
test("trusted import preserves original bytes, derived link, scope, export and backup recovery", async () => {
  const root = mkdtempSync(join(tmpdir(), "jojo-binary-test-"));
  let store = new Store(root, resolve("packages/storage/migrations"));
  let service = new Service(store, unused);
  try {
    const p = store.createProject("合成PDF");
    const w = store.createWork(p.id, {
      name: "doc",
      kind: "document",
      goal: "test",
      criteria: ["source"],
    });
    const input = pdfFixture();
    const request = req(
      "material.ingest",
      {
        workId: w.id,
        name: "fixture.pdf",
        origin: "synthetic-unit",
        base64: input.toString("base64"),
        firstPage: 2,
        lastPage: 2,
      },
      p.id,
    );
    const first = await service.command(request);
    assert.equal(first.ok, true);
    await settled(service, w.id);
    assert.deepEqual(await service.command(request), first);
    const d = store.detail(w.id),
      original = d.artifacts.find((a: any) => a.kind === "source_attachment")!,
      derived = d.artifacts.find((a: any) => a.kind === "source_material")!;
    assert.equal(original.metadata.rawSha256, binaryHash(input));
    assert.equal(derived.metadata.originalVersionId, original.id);
    assert.match(derived.text, /PAGE TWO/);
    assert.equal(derived.sourceSpans.length, 1);
    assert.equal(store.all("SELECT * FROM artifact_link").length, 1);
    assert.ok(!JSON.stringify(d).includes(input.toString("base64")));
    const zip = unzipSync(Uint8Array.from(store.export(w.id).bytes));
    assert.deepEqual(
      Buffer.from(zip["originals/" + original.id + ".pdf"]),
      input,
    );
    const backup = store.backup();
    store.restore(backup.id);
    assert.equal(store.detail(w.id).artifacts.length, 3);
    assert.equal(
      store.all(
        "SELECT request_id FROM request_dedup WHERE method='app.snapshot'",
      ).length,
      0,
    );
    const denied = await service.command(
      { ...request, requestId: uid() },
      "agent",
    );
    assert.equal(denied.error?.code, "PERMISSION_REQUIRED");
    const other = store.createProject("other");
    const scope = await service.command({
      ...request,
      requestId: uid(),
      projectId: other.id,
    });
    assert.equal(scope.error?.code, "SCOPE_DENIED");
  } finally {
    service.stop();
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test("failed PDF parsing preserves raw file without manufacturing extracted evidence", async () => {
  const root = mkdtempSync(join(tmpdir(), "jojo-bad-pdf-"));
  const s = new Store(root, resolve("packages/storage/migrations")),
    service = new Service(s, unused);
  try {
    const p = s.createProject("bad"),
      w = s.createWork(p.id, {
        name: "bad",
        kind: "document",
        goal: "test",
        criteria: ["test"],
      });
    const r = await service.command(
      req(
        "material.ingest",
        {
          workId: w.id,
          name: "bad.pdf",
          origin: "synthetic",
          base64: Buffer.from("%PDF-1.4\nnot a real pdf").toString("base64"),
          firstPage: 1,
          lastPage: 2,
        },
        p.id,
      ),
    );
    assert.equal(r.ok, true);
    await settled(service, w.id);
    const d = s.detail(w.id);
    assert.equal(
      d.artifacts.filter((a: any) => a.kind === "source_attachment").length,
      1,
    );
    assert.equal(
      d.artifacts.filter((a: any) => a.kind === "source_material").length,
      0,
    );
    assert.equal(d.jobs.at(-1)?.state, "failed");
  } finally {
    service.stop();
    s.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test("Python source contract rejects mixed Node entry and escaping paths", () => {
  const files = [
    { path: "server.py", content: "def app(): pass" },
    { path: "tests/test_app.py", content: "import unittest" },
  ];
  const text = (files: any[]) =>
    "```json\n" + JSON.stringify({ runtime: "python", files }) + "\n```";
  assert.equal(parseFiles(text(files)).length, 2);
  assert.throws(() =>
    parseFiles(text([...files, { path: "package.json", content: "{}" }])),
  );
  assert.throws(() =>
    parseFiles(text([...files, { path: "../escape.py", content: "x" }])),
  );
});
