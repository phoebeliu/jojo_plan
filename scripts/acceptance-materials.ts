import { Store, uid } from "../packages/core/src/store.js";
import { Service } from "../packages/core/src/service.js";
import { PiRuntime } from "../packages/core/src/runtime.js";
import { binaryHash } from "../packages/core/src/materials.js";
import { parseFiles } from "../packages/core/src/delivery.js";
import { testFiles } from "../packages/core/src/container.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { unzipSync } from "fflate";
const root = resolve("output/acceptance/materials-v03");
mkdirSync(root, { recursive: true });
const store = new Store(root, resolve("packages/storage/migrations"));
const service = new Service(
  store,
  new PiRuntime(
    root,
    "/Applications/Codex.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex",
  ),
  undefined,
  undefined,
  { ocrPath: resolve("dist/jojo-vision") },
);
const proof: any = {
  date: "2026-10-12",
  scope:
    "Public disclosure PDF, locally rendered public passport example, real local OCR and controlled Python tests",
  checks: [],
  sources: [],
};
function check(name: string, pass: boolean) {
  proof.checks.push({ name, pass });
  console.log((pass ? "PASS " : "FAIL ") + name);
  if (!pass) throw Error(name);
}
async function call(
  method: string,
  payload: any,
  pid: string | null = null,
  expectedRevision: number | null = null,
) {
  const r = await service.command({
    schemaVersion: 2,
    requestId: uid(),
    projectId: pid,
    expectedRevision,
    method,
    payload,
  });
  if (!r.ok) throw Error(JSON.stringify(r.error));
  return r.result;
}
async function settle(id: string) {
  const end = Date.now() + 300000;
  while (service.active.has(id) && Date.now() < end)
    await new Promise((r) => setTimeout(r, 200));
  if (service.active.has(id)) throw Error("timeout");
  return store.detail(id);
}
try {
  const audit = await call("project.create", { name: "审计项目 · 公开案例" });
  const w = await call(
    "work.create",
    {
      name: "IPO销售穿行 · 公开材料分析",
      kind: "document",
      goal: "根据公开问询回复第54–55页写销售穿行分析。准确说明130笔是中介机构披露的抽查而非本系统实测；抽取材料清单与勾稽规则候选，区分来源事实、建议规则和证据缺口。明确没有原始合同/发票/回单时不能报告审计合格。保留 [材料:版本ID] 和 PDF页码引用。",
      criteria: [
        "引用材料版本与页码",
        "130笔归属披露方",
        "输出勾稽规则与原始凭证缺口",
        "不冒充审计合格",
      ],
    },
    audit.id,
  );
  proof.auditWorkId = w.id;
  const pdf = readFileSync(
    "output/acceptance/public-domain-inputs/jieli-ipo.pdf",
  );
  const origin =
    "https://reportdocs.static.szse.cn/UpFiles/rasinfodisc1/202206/RAS_202206_0001810FF1028E3FC1045F490434003F.pdf";
  await call(
    "material.ingest",
    {
      workId: w.id,
      name: "杰理科技二轮IPO问询回复.pdf",
      origin,
      base64: pdf.toString("base64"),
      firstPage: 54,
      lastPage: 55,
    },
    audit.id,
  );
  let d = await settle(w.id);
  const original = d.artifacts.find(
      (a: any) => a.kind === "source_attachment",
    )!,
    extracted = d.artifacts.find((a: any) => a.kind === "source_material")!;
  check(
    "actual IPO PDF preserves selected page provenance",
    extracted?.metadata.firstPage === 54 &&
      extracted.metadata.lastPage === 55 &&
      /130/.test(extracted.text) &&
      extracted.sourceSpans.length === 2,
  );
  check(
    "original PDF export is byte-identical",
    binaryHash(
      unzipSync(Uint8Array.from(store.export(w.id).bytes))[
        "originals/" + original.id + ".pdf"
      ],
    ) === binaryHash(pdf),
  );
  proof.sources.push({
    origin,
    sha256: binaryHash(pdf),
    pages: [54, 55],
    parser: extracted.metadata.parser,
  });
  const passport = await call("project.create", {
    name: "护照校验项目 · 公开示例",
  });
  const pw = await call(
    "work.create",
    {
      name: "公开护照示例OCR",
      kind: "document",
      goal: "识别公开示例，仅测试文字与人脸区域，不判断真实持证人或鉴假准确率",
      criteria: ["明确示例", "保留原图与OCR坐标"],
    },
    passport.id,
  );
  proof.passportWorkId = pw.id;
  const image = readFileSync(
    "output/acceptance/public-domain-inputs/uk-sample-12.png",
  );
  const imageOrigin =
    "https://assets.publishing.service.gov.uk/media/69257dcf2945773cf12dcfe6/2025_BasicPassportChecks_1.0.pdf#page=12 · 本机Poppler整页渲染；不随发布包分发";
  await call(
    "material.ingest",
    {
      workId: pw.id,
      name: "公开护照示例页12.png",
      origin: imageOrigin,
      base64: image.toString("base64"),
      firstPage: 1,
      lastPage: 20,
    },
    passport.id,
  );
  const pd = await settle(pw.id),
    ocr = pd.artifacts.find((a: any) => a.kind === "source_material")!,
    img = pd.artifacts.find((a: any) => a.kind === "source_attachment")!;
  check(
    "public passport image actual local OCR detects specimen and face region",
    /specimen/i.test(ocr?.text || "") &&
      ocr.metadata.faces >= 1 &&
      ocr.metadata.authentication === "not_assessed",
  );
  check(
    "OCR source locators and confidence are retained",
    ocr.sourceSpans.length > 0 &&
      ocr.sourceSpans.every(
        (s: any) =>
          s.confidence >= 0 &&
          s.confidence <= 1 &&
          JSON.parse(s.locator_json).box,
      ),
  );
  check(
    "image original safely previews only after actual parsing",
    img.previewUrl?.startsWith("data:image/png;base64,") &&
      img.metadata.rawSha256 === binaryHash(image),
  );
  proof.sources.push({
    origin: imageOrigin,
    sha256: binaryHash(image),
    parser: ocr.metadata.parser,
    faces: ocr.metadata.faces,
    lines: ocr.sourceSpans.length,
    redistribution: false,
  });
  const files = [
    {
      path: "server.py",
      content:
        'def check_evidence(files):\n return "complete" if all(k in files for k in ("contract","invoice","receipt")) else "insufficient"\n',
    },
    {
      path: "tests/test_rules.py",
      content:
        'import unittest\nfrom server import check_evidence\nclass Rules(unittest.TestCase):\n def test_complete(self): self.assertEqual(check_evidence(["contract","invoice","receipt"]),"complete")\n def test_missing(self): self.assertEqual(check_evidence(["invoice"]),"insufficient")\n',
    },
  ];
  const parsed = parseFiles(
    "# Python测试\n```json\n" +
      JSON.stringify({ runtime: "python", files }) +
      "\n```",
  );
  const positive = await testFiles(
    root,
    parsed,
    new AbortController().signal,
    () => {},
  );
  check(
    "Python stdlib runner executes two real normal and missing-evidence tests",
    positive.passed,
  );
  proof.python = positive;
  const failFiles = [
    files[0],
    {
      path: "tests/test_fail.py",
      content:
        "import unittest\nclass Negative(unittest.TestCase):\n def test_pass(self): self.assertEqual(1,1)\n def test_fail(self): self.assertEqual(1,2)\n",
    },
  ];
  const negative = await testFiles(
    root,
    failFiles,
    new AbortController().signal,
    () => {},
  );
  check(
    "Python failing tests cannot be approved as passed",
    !negative.passed && negative.code !== 0,
  );
  proof.pythonNegative = { passed: negative.passed, code: negative.code };
  if (process.env.JOJO_MATERIALS_LIVE === "1") {
    const provider = await call("provider.save", {
      name: "公开材料真实模型验收",
      protocol: "codex-local",
      baseUrl: "",
      modelId: "",
    });
    await call(
      "work.start",
      {
        workId: w.id,
        providerId: provider.id,
        allowSend: true,
        tokenLimit: 200000,
      },
      audit.id,
      store.work(w.id).revision,
    );
    d = await settle(w.id);
    const output = d.artifacts
      .filter((a: any) => a.kind === "document")
      .at(-1)!;
    check(
      "real model uses exact parsed PDF version",
      !!output &&
        !output.metadata.isSimulation &&
        output.text.includes(extracted.id),
    );
    check(
      "real report preserves disclosure and missing-evidence boundaries",
      /130/.test(output.text) &&
        /披露|中介/.test(output.text) &&
        /缺口|不足|未取得|缺失/.test(output.text),
    );
    proof.outputVersion = output.id;
  }
} finally {
  writeFileSync(
    resolve(root, "materials-proof.json"),
    JSON.stringify(proof, null, 2),
  );
  service.stop();
  store.close();
}
