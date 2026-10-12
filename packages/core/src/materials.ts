import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
export const binaryHash = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
export function decodeMaterial(base64: string) {
  const bytes = Buffer.from(base64, "base64");
  if (
    !bytes.length ||
    bytes.length > 8 * 1024 * 1024 ||
    bytes.toString("base64") !== base64
  )
    throw Error("文件为空、超过8MB或编码无效");
  const mime =
    bytes.subarray(0, 5).toString() === "%PDF-"
      ? "application/pdf"
      : bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? "image/png"
        : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          ? "image/jpeg"
          : null;
  if (!mime) throw Error("仅支持PDF、PNG和JPEG原始文件");
  return { bytes, mime, sha256: binaryHash(bytes) };
}
export async function parseMaterial(
  data: ReturnType<typeof decodeMaterial>,
  root: string,
  signal: AbortSignal,
  ocrPath?: string,
  firstPage = 1,
  lastPage = 20,
  onProcess: (pid: number | undefined) => void = () => {},
): Promise<{ text: string; parser: string; spans: any[]; metadata: any }> {
  if (data.mime === "application/pdf") {
    const pdf = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    (globalThis as any).pdfjsWorker = worker;
    const task = pdf.getDocument({
      data: new Uint8Array(data.bytes),
      useWorkerFetch: false,
      useSystemFonts: false,
      disableFontFace: true,
    });
    const abort = () => {
      void task.destroy();
    };
    signal.addEventListener("abort", abort, { once: true });
    let doc: any;
    try {
      if (signal.aborted) throw Error("解析已暂停");
      doc = await task.promise;
      if (
        doc.numPages > 500 ||
        firstPage > doc.numPages ||
        lastPage < firstPage
      )
        throw Error("页码超出范围或PDF超过500页");
      let text = "",
        truncated = false;
      const spans = [];
      for (let n = firstPage; n <= Math.min(lastPage, doc.numPages); n++) {
        if (signal.aborted) throw Error("解析已暂停");
        const page = await doc.getPage(n),
          content = await page.getTextContent();
        const body = content.items
          .map((i: any) => i.str + (i.hasEOL ? "\n" : " "))
          .join("");
        if (text.length + body.length > 200000) {
          truncated = true;
          break;
        }
        text += `\n## PDF第${n}页\n${body || "[该页无可提取文字，需OCR或人工检查]"}\n`;
        spans.push({
          locator: { page: n },
          textHash: binaryHash(Buffer.from(body)),
          confidence: null,
        });
        page.cleanup();
      }
      return {
        text,
        parser: "pdfjs-text/6.4.299",
        spans,
        metadata: {
          totalPages: doc.numPages,
          firstPage,
          lastPage: spans.at(-1)?.locator.page || firstPage,
          truncated,
          ocrApplied: false,
        },
      };
    } finally {
      signal.removeEventListener("abort", abort);
      await task.destroy();
    }
  }
  if (!ocrPath)
    throw Error("本机Vision OCR组件未安装，原图已保存，未产生识别结果");
  const dir = join(root, "incoming", randomUUID());
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(
    dir,
    data.mime === "image/png" ? "source.png" : "source.jpg",
  );
  writeFileSync(path, data.bytes, { mode: 0o600 });
  try {
    const result: any = await new Promise((resolve, reject) => {
      const child = execFile(
        ocrPath,
        [path],
        { timeout: 30000, maxBuffer: 2 * 1024 * 1024, signal },
        (error, stdout) =>
          error
            ? reject(Error("图像无法解码或OCR未完成"))
            : resolve(JSON.parse(stdout)),
      );
      onProcess(child.pid);
    });
    const text =
      `# 图像识别记录\n本机Apple Vision提取；不是护照真伪认证。\n尺寸：${result.width}×${result.height}；检测到人脸区域：${result.faces}。\n` +
      result.lines.map((l: any) => l.text).join("\n");
    return {
      text,
      parser: result.parser,
      spans: result.lines.map((l: any) => ({
        locator: { box: l.box, coordinateSystem: "normalized-bottom-left" },
        textHash: binaryHash(Buffer.from(l.text)),
        confidence: l.confidence,
      })),
      metadata: {
        width: result.width,
        height: result.height,
        faces: result.faces,
        ocrApplied: true,
        authentication: "not_assessed",
      },
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
