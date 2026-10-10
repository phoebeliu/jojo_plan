/* Real Electron UI and IPC; dialog result is injected with a named synthetic file. */
const { _electron } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, "output/acceptance/native-mvp");
fs.mkdirSync(out, { recursive: true });
const data = path.join(out, "data");
fs.rmSync(data, { recursive: true, force: true });
const fixture = path.join(out, "synthetic-material.md");
fs.writeFileSync(
  fixture,
  "# 合成客户材料\n唯一标记 material-utf8-42。此文件只用于测试，不含客户数据。",
);
const proof = {
  date: new Date().toISOString(),
  scope: "Native Electron / synthetic file / no model call",
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
    p.setDefaultTimeout(12000);
    await p.getByText("后台服务已连接").waitFor();
    return p;
  };
  const check = async (name, fn) => {
    await fn();
    proof.checks.push({ name, pass: true });
    console.log("PASS " + name);
  };
  let page = await launch();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await check(
    "native first-work form creates system workspace with seven related stages",
    async () => {
      await page.getByRole("button", { name: "创建第一项工作 →" }).click();
      await page.getByLabel("新项目名称").fill("合成项目 · 原生MVP");
      await page.getByRole("button", { name: "创建项目", exact: true }).click();
      await page.getByLabel("工作类型").selectOption("system");
      await page.getByLabel("工作名称", { exact: true }).fill("合成研发工作");
      await page.getByLabel("目标", { exact: true }).fill("实现合成Web API");
      await page
        .getByLabel("验收标准（每行一条，最终需要你审阅）")
        .fill("正常请求200\n异常请求400");
      await page.getByRole("button", { name: "保存交付约定" }).click();
      await page.locator(".stage-strip").waitFor();
      assert.equal(await page.locator(".stage-strip span").count(), 7);
      assert.match(await page.locator(".heading").innerText(), /需求研究/);
    },
  );
  await check(
    "native file import stores selected UTF-8 material, not arbitrary renderer paths",
    async () => {
      await app.evaluate(({ dialog }, fixture) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [fixture],
        });
      }, fixture);
      await page.getByRole("button", { name: /材料与来源/ }).click();
      await page.getByRole("button", { name: "选择本机文件" }).click();
      await page
        .locator(".panel-content")
        .getByText("material-utf8-42", { exact: false })
        .waitFor();
      assert.match(await page.locator(".panel-content").innerText(), /SHA-256/);
      await page.getByLabel("关闭详情").click();
    },
  );
  await check(
    "manual source captures origin and Markdown is safely rendered",
    async () => {
      await page.getByRole("button", { name: /材料与来源/ }).click();
      await page.getByLabel("材料名称", { exact: true }).fill("合成参考");
      await page
        .getByLabel("来源 / 原始链接")
        .fill("https://example.com/synthetic");
      await page
        .getByLabel("粘贴材料正文")
        .fill(
          "# 合成参考\n<script>window.evil=1</script>\n这只是文字，不应执行。",
        );
      await page.getByRole("button", { name: "保存来源材料" }).click();
      await page
        .locator(".panel-content")
        .getByText("https://example.com/synthetic", { exact: true })
        .waitFor();
      assert.equal(await page.evaluate(() => window.evil), undefined);
      assert.equal(await page.locator(".markdown script").count(), 0);
      await page.getByLabel("关闭详情").click();
    },
  );
  await check(
    "conversation supplement is visible without inventing agent jobs",
    async () => {
      await page.getByLabel("补充要求").fill("合成补充：先明确失败边界");
      await page.getByRole("button", { name: "保存补充" }).click();
      await page
        .locator(".timeline")
        .getByText("合成补充：先明确失败边界", { exact: true })
        .waitFor();
      assert.match(
        await page.locator(".execution").innerText(),
        /0 个智能体工作中/,
      );
      assert.match(
        await page.locator(".execution").innerText(),
        /0 个后台 Job/,
      );
    },
  );
  await page.screenshot({ path: path.join(out, "mvp-workspace.png") });
  await app.close();
  app = null;
  page = await launch();
  await check(
    "work, materials and conversation recover after native app restart",
    async () => {
      assert.match(await page.locator(".heading").innerText(), /合成研发工作/);
      await page.getByRole("button", { name: /材料与来源 · 2/ }).waitFor();
      await page
        .locator(".timeline")
        .getByText("合成补充：先明确失败边界", { exact: true })
        .waitFor();
      assert.equal(await page.locator(".stage-strip span").count(), 7);
    },
  );
  await check("MVP native renderer stays error free", async () =>
    assert.deepEqual(errors, []),
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close();
    fs.writeFileSync(
      path.join(out, "native-mvp-proof.json"),
      JSON.stringify(proof, null, 2),
    );
  });
