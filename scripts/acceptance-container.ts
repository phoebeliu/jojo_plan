import { testFiles } from "../packages/core/src/container.js";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
const root = resolve("output/acceptance/container-boundaries");
mkdirSync(root, { recursive: true });
const files = [
  { path: "package.json", content: '{"type":"module"}' },
  {
    path: "test/isolation.test.mjs",
    content: `import {test} from 'node:test'; import assert from 'node:assert/strict'; import {writeFileSync,existsSync} from 'node:fs'; import http from 'node:http';
test('non-root and no Docker/host mounts',()=>{assert.equal(process.getuid(),1000);assert.equal(existsSync('/var/run/docker.sock'),false);assert.equal(existsSync('/Users'),false)});
test('workspace writes are rejected',()=>{assert.throws(()=>writeFileSync('/workspace/new.txt','x'),/EROFS|EACCES/)});
test('outbound network is rejected',async()=>{await assert.rejects(new Promise((resolve,reject)=>{const r=http.get('http://1.1.1.1/',{signal:AbortSignal.timeout(1500)},resolve);r.on('error',reject)}),/unreachable|ENETUNREACH|EHOSTUNREACH|abort/i)});`,
  },
];
const result = await testFiles(
  root,
  files,
  new AbortController().signal,
  () => {},
);
console.log(result.log);
writeFileSync(
  resolve(root, "container-proof.json"),
  JSON.stringify(
    { date: new Date().toISOString(), synthetic: true, ...result },
    null,
    2,
  ),
);
if (!result.passed) process.exitCode = 1;
