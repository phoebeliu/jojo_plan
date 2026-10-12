const { _electron } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, "output/acceptance/native-materials-v03");
fs.mkdirSync(out, { recursive: true });
const data = path.join(out, "data");
fs.rmSync(data, { recursive: true, force: true });
const proof = {
  date: "2026-10-12",
  scope:
    "Actual packaged desktop; named public fixtures injected as native chooser selection; no model call",
  checks: [],
};
let app;
(async () => {
  const launch = async () => {
    app = await _electron.launch({
      executablePath:
        process.env.JOJO_PACKAGED_APP ||
        path.join(
          root,
          "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
        ),
      args: process.env.JOJO_PACKAGED_APP ? [] : [root],
      env: { ...process.env, JOJO_DATA_DIR: data },
      timeout: 60000,
    });
    const p = await app.firstWindow();
    p.setDefaultTimeout(15000);
    await p.getByText("后台服务已连接").waitFor();
    return p;
  };
  let page = await launch();
  const check = async (name, f) => {
    await f();
    proof.checks.push({ name, pass: true });
    console.log("PASS " + name);
  };
  await check(
    "Python is selectable and stored in real work contract",
    async () => {
      await page.getByRole("button", { name: "创建第一项工作 →" }).click();
      await page.getByLabel("新项目名称").fill("审计项目 · 原生材料验收");
      await page.getByRole("button", { name: "创建项目", exact: true }).click();
      await page.getByLabel("工作类型").selectOption("system");
      await page.getByLabel("执行栈").selectOption("python");
      await page
        .getByLabel("工作名称", { exact: true })
        .fill("销售穿行公开材料");
      await page
        .getByLabel("目标", { exact: true })
        .fill("研究公开披露，不冒充审计认证");
      await page
        .getByLabel("验收标准（每行一条，最终需要你审阅）")
        .fill("保留材料来源");
      await page.getByRole("button", { name: "保存交付约定" }).click();
      await page.locator(".stage-strip").waitFor();
      const snap = await page.evaluate(async () =>
        window.jojo.command({
          schemaVersion: 2,
          requestId: crypto.randomUUID(),
          projectId: null,
          expectedRevision: null,
          method: "app.snapshot",
          payload: {},
        }),
      );
      assert.equal(snap.result.details[0].contract.metadata.runtime, "python");
    },
  );
  await check(
    "packaged PDF reader imports selected pages and exposes provenance",
    async () => {
      const file = path.join(
        root,
        "output/acceptance/public-domain-inputs/jieli-ipo.pdf",
      );
      await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [file],
        });
      }, file);
      await page.getByRole("button", { name: /材料与来源/ }).click();
      await page.getByLabel("PDF起始页").fill("54");
      await page.getByLabel("PDF结束页").fill("55");
      await page
        .getByLabel("来源 / 原始链接")
        .fill("https://reportdocs.static.szse.cn/ · 本机公开案例");
      await page.getByRole("button", { name: "选择本机文件" }).click();
      await page.getByLabel("关闭详情").click();
      await page
        .locator(".timeline")
        .getByText(/材料解析完成：jieli-ipo.pdf/)
        .waitFor({ timeout: 60000 });
      await page
        .locator(".artifact-grid button")
        .filter({ hasText: "jieli-ipo.pdf · 解析" })
        .click();
      assert.match(
        await page.locator(".panel-content").innerText(),
        /PDF第55页/,
      );
      assert.match(await page.locator(".panel-content").innerText(), /130/);
      await page.getByText("查看来源定位与置信度", { exact: true }).click();
      assert.match(
        await page.locator(".panel-content table").innerText(),
        /page.*54/,
      );
      await page.screenshot({ path: path.join(out, "pdf-provenance.png") });
      await page.getByLabel("关闭详情").click();
    },
  );
  await check(
    "packaged native Vision helper produces OCR and safe local image preview",
    async () => {
      const file = path.join(
        root,
        "output/acceptance/public-domain-inputs/uk-sample-12.png",
      );
      await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [file],
        });
      }, file);
      await page.getByRole("button", { name: /材料与来源/ }).click();
      await page.getByRole("button", { name: "选择本机文件" }).click();
      await page.getByLabel("关闭详情").click();
      await page
        .locator(".timeline")
        .getByText(/材料解析完成：uk-sample-12.png/)
        .waitFor({ timeout: 60000 });
      await page
        .locator(".artifact-grid button")
        .filter({ hasText: "uk-sample-12.png · 解析" })
        .click();
      assert.match(
        await page.locator(".panel-content").innerText(),
        /SPECIMEN/i,
      );
      assert.match(
        await page.locator(".panel-content").innerText(),
        /不是护照真伪认证/,
      );
      await page.getByLabel("关闭详情").click();
      await page
        .locator(".artifact-grid button")
        .filter({ hasText: "uk-sample-12.png" })
        .first()
        .click();
      await page.locator(".source-image").waitFor();
      assert.ok(
        await page
          .locator(".source-image")
          .evaluate((e) => e.complete && e.naturalWidth > 0),
      );
      await page.getByLabel("关闭详情").click();
    },
  );
  await app.close();
  app = null;
  page = await launch();
  await check(
    "original files and derived OCR/PDF versions survive app restart",
    async () => {
      const r = await page.evaluate(async () =>
        window.jojo.command({
          schemaVersion: 2,
          requestId: crypto.randomUUID(),
          projectId: null,
          expectedRevision: null,
          method: "app.snapshot",
          payload: {},
        }),
      );
      const d = r.result.details[0];
      assert.equal(
        d.artifacts.filter((a) => a.kind === "source_attachment").length,
        2,
      );
      assert.equal(
        d.artifacts.filter((a) => a.kind === "source_material").length,
        2,
      );
      assert.equal(d.contract.metadata.runtime, "python");
      assert.equal(d.jobs.filter((j) => j.state === "succeeded").length, 2);
    },
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close();
    fs.writeFileSync(
      path.join(out, "desktop-materials-proof.json"),
      JSON.stringify(proof, null, 2),
    );
  });
