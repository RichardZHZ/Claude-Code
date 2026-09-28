// 端到端测试用的假 Zotero 本地 API：返回几条固定的文献。
import { createServer } from 'node:http';
import { fakeZoteroFetch } from '../packages/core/src/testing/fake-zotero.ts';

const port = Number(process.env.PORT ?? 23199);
const handle = fakeZoteroFetch();

createServer((req, res) => {
  void handle(`http://127.0.0.1:${port}${req.url ?? '/'}`).then(async (r) => {
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(await r.text());
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`假 Zotero 已启动：http://127.0.0.1:${port}`);
});
