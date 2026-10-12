import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
const docker = existsSync(
  "/Applications/Docker.app/Contents/Resources/bin/docker",
)
  ? "/Applications/Docker.app/Contents/Resources/bin/docker"
  : "docker";
export function dockerCommand(
  args: string[],
  signal?: AbortSignal,
  onEvent: (e: any) => void = () => {},
  timeout = 120000,
): Promise<{ code: number; log: string }> {
  return new Promise((resolve) => {
    const child = spawn(docker, args, { stdio: ["ignore", "pipe", "pipe"] });
    onEvent({ type: "container.process", pid: child.pid, command: args[0] });
    let log = "",
      finished = false;
    const stop = () => {
      child.kill("SIGTERM");
      const t = setTimeout(() => child.kill("SIGKILL"), 2000);
      t.unref();
    };
    const timer = setTimeout(stop, timeout);
    const finish = (code: number) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      resolve({ code, log });
    };
    signal?.addEventListener("abort", stop, { once: true });
    if (signal?.aborted) stop();
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (b: Buffer) => {
        if (log.length < 60000) {
          const text = b.toString().slice(0, 60000 - log.length);
          log += text;
          onEvent({ type: "container.output", text });
        }
      });
    child.once("error", (e) => {
      log += e.message;
      finish(-1);
    });
    child.once("close", (code) => finish(code ?? -1));
  });
}
export async function environment(runtime = "node") {
  const imageName =
    runtime === "python" ? "python:3.13-alpine" : "node:24-alpine";
  const info = await dockerCommand(
    ["info", "--format", "{{.ServerVersion}}"],
    undefined,
    undefined,
    10000,
  );
  const image =
    info.code === 0
      ? await dockerCommand(
          ["image", "inspect", imageName, "--format", "{{.Id}}"],
          undefined,
          undefined,
          10000,
        )
      : null;
  return {
    dockerReady: info.code === 0,
    version: info.code === 0 ? info.log.trim() : null,
    imageReady: image?.code === 0,
    message:
      info.code === 0 ? "Docker已连接" : "请启动Docker Desktop并完成初始化",
    image: image?.code === 0 ? image.log.trim() : null,
  };
}
export async function testFiles(
  root: string,
  files: { path: string; content: string }[],
  signal: AbortSignal,
  event: (e: any) => void,
) {
  const runtime = files.some((f) => f.path === "server.py") ? "python" : "node";
  const imageName =
    runtime === "python" ? "python:3.13-alpine" : "node:24-alpine";
  const command =
    runtime === "python"
      ? ["python", "-m", "unittest", "discover", "-s", "tests", "-v"]
      : ["node", "--test", "--test-reporter=tap"];
  const name = "jojo-test-" + randomUUID(),
    dir = join(root, "sandboxes", name);
  mkdirSync(dir, { recursive: true, mode: 0o755 });
  for (const f of files) {
    const file = join(dir, f.path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, f.content, { mode: 0o644 });
  }
  const info = await environment(runtime);
  if (!info.dockerReady)
    return { passed: false, code: -1, log: info.message, image: null };
  if (!info.imageReady) {
    const pull = await dockerCommand(
      ["pull", imageName],
      signal,
      event,
      180000,
    );
    if (pull.code !== 0 || signal.aborted)
      return { passed: false, code: pull.code, log: pull.log, image: null };
  }
  const image = await dockerCommand(
    ["image", "inspect", imageName, "--format", "{{.Id}}"],
    signal,
  );
  if (image.code !== 0 || !/^sha256:[a-f0-9]{64}$/.test(image.log.trim()))
    return { passed: false, code: -1, log: "无法确认镜像ID", image: null };
  const base = await dockerCommand(
    ["image", "inspect", imageName, "--format", "{{index .RepoDigests 0}}"],
    signal,
  );
  if (
    base.code !== 0 ||
    !new RegExp(
      `^${runtime === "python" ? "python" : "node"}@sha256:[a-f0-9]{64}$`,
    ).test(base.log.trim())
  )
    return { passed: false, code: -1, log: "基础镜像摘要不可用", image: null };
  const stop = () => {
    void dockerCommand(["rm", "-f", name], undefined, undefined, 10000);
  };
  signal.addEventListener("abort", stop, { once: true });
  try {
    writeFileSync(
      join(dir, "Dockerfile"),
      `FROM ${base.log.trim()}\nWORKDIR /workspace\nCOPY --chown=1000:1000 . /workspace\nUSER 1000:1000\nCMD ${JSON.stringify(command)}\n`,
    );
    const built = await dockerCommand(
      [
        "build",
        "--network",
        "none",
        "--pull=false",
        "--progress",
        "plain",
        "--tag",
        name,
        dir,
      ],
      signal,
      event,
      90000,
    );
    if (built.code !== 0 || signal.aborted)
      return { passed: false, ...built, image: image.log.trim() };
    const r = await dockerCommand(
      [
        "run",
        "--rm",
        "--name",
        name,
        "--network",
        "none",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--memory",
        "256m",
        "--cpus",
        "1",
        "--pids-limit",
        "64",
        "--user",
        "1000:1000",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=32m",
        "--workdir",
        "/workspace",
        name,
        ...command,
      ],
      signal,
      event,
      60000,
    );
    const counts = (
      runtime === "python" ? /Ran (\d+) tests?/ : /# tests (\d+)/
    ).exec(r.log);
    return {
      passed:
        r.code === 0 &&
        !signal.aborted &&
        !!counts &&
        Number(counts[1]) >= 2 &&
        (runtime === "python"
          ? /\nOK\s*$/.test(r.log) &&
            !/skipped|expected failure|unexpected success/i.test(r.log)
          : /# fail 0/.test(r.log) &&
            !/# (?:skipped|todo|cancelled) [1-9]/.test(r.log)),
      ...r,
      image: image.log.trim(),
      baseDigest: base.log.trim(),
      runtime,
    };
  } finally {
    signal.removeEventListener("abort", stop);
    await dockerCommand(["rm", "-f", name], undefined, undefined, 10000);
    await dockerCommand(["image", "rm", name], undefined, undefined, 10000);
  }
}
