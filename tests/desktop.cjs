/* Actual Electron integration with copied synthetic acceptance data. */
const { _electron: electron } = require("playwright");
const fs = require("fs"),
  path = require("path");
const root = path.resolve(__dirname, "..");
const out = path.join(
  root,
  process.env.JOJO_PACKAGED_APP
    ? "output/acceptance/packaged"
    : "output/acceptance/desktop",
);
fs.mkdirSync(out, { recursive: true });
const live = path.join(root, "output/acceptance/live");
const report = {
  date: new Date().toISOString(),
  scope: "Actual Electron + synthetic live-model dataset",
  checks: [],
};
const assert = (ok, msg) => {
  if (!ok) throw Error(msg);
};
let app;
(async () => {
  const data = path.join(out, "data");
  fs.rmSync(data, { recursive: true, force: true });
  fs.cpSync(live, data, { recursive: true });
  const proof = JSON.parse(fs.readFileSync(path.join(live, "acceptance.json")));
  const id = proof.workId;
  async function launch() {
    app = await electron.launch({
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
    await p.locator('[data-work-id="' + id + '"]').click();
    return p;
  }
  async function check(name, fn) {
    await fn();
    report.checks.push({ name, pass: true });
    console.log("PASS " + name);
  }
  let page = await launch();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await check(
    "Installed renderer is sandboxed, isolated, with restricted bridge",
    async () => {
      const security = await page.evaluate(() => ({
        node: typeof require,
        bridge: Object.keys(window.jojo),
        csp: document.querySelector(
          'meta[http-equiv="Content-Security-Policy"]',
        ).content,
      }));
      assert(security.node === "undefined", "Node leaked");
      assert(!security.bridge.includes("ipcRenderer"), "Raw IPC leaked");
      assert(
        security.csp.includes("connect-src 'none'"),
        "Renderer network enabled",
      );
    },
  );
  await check(
    "Live artifacts and approval restored into native app",
    async () => {
      assert(
        (await page.locator(".outcome").innerText()).includes("已审阅通过"),
        "Delivered state lost",
      );
      assert(
        (await page.locator(".artifact-grid button").count()) >= 4,
        "Artifacts missing",
      );
      await page.locator(".artifact-grid button").first().click();
      assert(
        (await page.locator(".panel-content pre").innerText()).includes(
          "持续集成",
        ),
        "Wrong artifact",
      );
      await page.getByLabel("关闭详情").click();
    },
  );
  await check(
    "Native personal controls have real persistent source records",
    async () => {
      await page.getByRole("button", { name: "✦ 按你的方式" }).click();
      await page
        .getByLabel("提议一条个人工作准则")
        .fill("合成验收偏好：先核查术语与局限");
      await page.getByRole("button", { name: "保存为待确认候选" }).click();
      await page.getByRole("button", { name: "确认准则" }).last().click();
      await page
        .locator(".panel-content")
        .getByText(/personal \/ confirmed/)
        .waitFor();
      await page.getByLabel("关闭详情").click();
    },
  );
  await check(
    "Requirements change invalidates native approval controls",
    async () => {
      await page.getByRole("button", { name: "修改要求 / 预演影响" }).click();
      const old = await page.getByLabel("新的目标").inputValue();
      await page.getByLabel("新的目标").fill(old + "\n新增故障处理说明。");
      await page
        .getByLabel("新的验收标准")
        .fill("解释持续集成与持续交付\n包括合成例子和局限\n包括故障处理");
      await page.getByRole("button", { name: "预演影响", exact: true }).click();
      await page.getByRole("button", { name: "应用变更，重新验证" }).click();
      await page.locator(".panel").waitFor({ state: "hidden" });
      await page
        .locator(".outcome")
        .getByText(/旧依据/)
        .waitFor();
      await page.getByRole("button", { name: "查看约定 →" }).click();
      assert(
        (await page
          .getByRole("button", { name: "确认当前版本满足约定" })
          .count()) === 0,
        "Old approval still available",
      );
      await page.getByLabel("关闭详情").click();
    },
  );
  await page.screenshot({ path: path.join(out, "native-workspace.png") });
  await app.close();
  app = null;
  page = await launch();
  await check(
    "Application restart preserves changed goal and personal rules",
    async () => {
      assert(
        (await page.locator(".outcome").innerText()).includes("旧依据"),
        "Changed state lost",
      );
      await page.getByRole("button", { name: "查看约定 →" }).click();
      assert(
        (await page.locator(".panel-content").innerText()).includes("故障处理"),
        "Goal lost",
      );
      await page.getByLabel("关闭详情").click();
      await page.getByRole("button", { name: "✦ 按你的方式" }).click();
      await page
        .locator(".panel-content")
        .getByText("合成验收偏好：先核查术语与局限", { exact: true })
        .waitFor();
      await page.getByLabel("关闭详情").click();
    },
  );
  await check(
    "Native modal focus and compact window remain usable",
    async () => {
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setSize(1100, 760),
      );
      await page.getByRole("button", { name: "✦ 按你的方式" }).click();
      assert(
        await page.locator("main").evaluate((e) => e.inert),
        "Background active",
      );
      await page.locator(".panel button").last().focus();
      await page.keyboard.press("Tab");
      assert(
        await page.evaluate(() => !!document.activeElement.closest(".panel")),
        "Focus escaped",
      );
      await page.keyboard.press("Escape");
      assert(
        !(await page.locator("main").evaluate((e) => e.inert)),
        "Background stayed inert",
      );
      assert(
        !(await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        )),
        "Horizontal clipping",
      );
      await page.screenshot({ path: path.join(out, "native-compact.png") });
    },
  );

  if (process.env.JOJO_DESKTOP_LIVE === "1")
    await check(
      "Packaged app itself generates and reviews a real model artifact",
      async () => {
        await page.getByLabel("允许将目标与适用准则发送给此模型").check();
        await page.getByRole("button", { name: "开始 / 重新验证 →" }).click();
        await page
          .locator(".outcome")
          .getByText(/结构检查完成/)
          .waitFor({ timeout: 240000 });
        await page
          .locator(".artifact-grid button")
          .filter({ hasText: "交付草稿" })
          .last()
          .click();
        const text = await page.locator(".panel-content pre").innerText();
        assert(
          /故障|失败/.test(text) && /持续集成|CI/.test(text),
          "New output misses synthetic task",
        );
        await page.getByLabel("关闭详情").click();
        await page.getByRole("button", { name: "查看约定 →" }).click();
        await page
          .getByRole("button", { name: "确认当前版本满足约定" })
          .click();
        await page.getByLabel("关闭详情").click();
        await page
          .locator(".outcome")
          .getByText(/已审阅通过/)
          .waitFor();
        await page.screenshot({ path: path.join(out, "native-delivered.png") });
      },
    );
  assert(!errors.length, errors.join("\n"));
  report.status = "passed";
})()
  .catch((e) => {
    report.status = "failed";
    report.error = e.message;
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close();
    fs.writeFileSync(
      path.join(out, "desktop-results.json"),
      JSON.stringify(report, null, 2),
    );
  });
