import { lookup } from "node:dns/promises";
import { request } from "node:https";
export function publicAddress(address: string) {
  const p = address.split(".").map(Number);
  return (
    p.length === 4 &&
    p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
    p[0] !== 0 &&
    p[0] !== 10 &&
    p[0] !== 127 &&
    p[0] < 224 &&
    !(p[0] === 169 && p[1] === 254) &&
    !(p[0] === 172 && p[1] >= 16 && p[1] <= 31) &&
    !(p[0] === 192 && (p[1] === 168 || p[1] === 0)) &&
    !(p[0] === 100 && p[1] >= 64 && p[1] <= 127) &&
    !(p[0] === 198 && (p[1] === 18 || p[1] === 19 || p[1] === 51)) &&
    !(p[0] === 203 && p[1] === 0 && p[2] === 113)
  );
}
export function sourceText(body: string, mime: string) {
  const plain = /html/.test(mime)
    ? body
        .replace(
          /<(script|style|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi,
          "",
        )
        .replace(/<!--[^]*?-->/g, "")
        .replace(/<\/(?:p|h[1-6]|li|div|section)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
    : body;
  return plain
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim()
    .slice(0, 60000);
}
// DNS is resolved and checked before connecting; the TLS hostname is retained.
export async function fetchSource(
  raw: string,
  signal: AbortSignal,
  redirects = 0,
): Promise<{ text: string; url: string; mime: string; truncated: boolean }> {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    redirects > 3
  )
    throw Error("仅支持不含凭据的公共HTTPS网页");
  const addresses = await lookup(url.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw Error("不能读取本机、内网或保留地址");
  const response = await new Promise<{
    body: string;
    mime: string;
    redirect?: string;
  }>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        signal,
        headers: {
          "User-Agent": "JojoPlan/0.2 SourceReader",
          Accept: "text/html,text/plain,text/markdown,application/json",
          "Accept-Encoding": "identity",
        },
        lookup: (_host, _opts: any, cb: any) =>
          _opts.all
            ? cb(null, [{ address: addresses[0].address, family: 4 }])
            : cb(null, addresses[0].address, 4),
      },
      (res) => {
        if (
          [301, 302, 303, 307, 308].includes(res.statusCode || 0) &&
          res.headers.location
        ) {
          res.resume();
          resolve({
            body: "",
            mime: "",
            redirect: new URL(res.headers.location, url).href,
          });
          return;
        }
        const mime = String(res.headers["content-type"] || "");
        if (
          res.statusCode !== 200 ||
          !/^(?:text\/|application\/json)/.test(mime)
        ) {
          res.resume();
          reject(Error("网页不可读，或不是支持的文本格式"));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (b: Buffer) => {
          size += b.length;
          if (size > 1024 * 1024) {
            req.destroy(Error("网页超过1MB，请选择正文链接或手动导入"));
          } else chunks.push(b);
        });
        res.on("error", reject);
        res.on("end", () =>
          resolve({ body: Buffer.concat(chunks).toString("utf8"), mime }),
        );
      },
    );
    req.setTimeout(15000, () => req.destroy(Error("网页读取超时")));
    req.on("error", reject);
    req.end();
  });
  if (response.redirect)
    return fetchSource(response.redirect, signal, redirects + 1);
  const text = sourceText(response.body, response.mime);
  if (text.length < 30)
    throw Error("网页未返回可用正文，可能需要登录或动态渲染");
  return {
    text,
    url: url.href,
    mime: response.mime,
    truncated: text.length === 60000,
  };
}
