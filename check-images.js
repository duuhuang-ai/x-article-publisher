// node check-images.js — 零依赖，验证副本、封面、顺序、失败和原文保留。
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { prepareArticle } = require('./prepare-article.js');
const { buildPayload } = require('./payload.js');

(async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64');
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/cover' }); return res.end(); }
    if (req.url === '/missing') { res.writeHead(404); return res.end(); }
    if (req.url === '/html') { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end('<html>denied</html>'); }
    if (req.url === '/large') { res.writeHead(200, { 'Content-Length': 17 * 1024 * 1024 }); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); res.end(png);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const root = path.join(__dirname, 'work');
    await fs.mkdir(root, { recursive: true });
    const dir = await fs.mkdtemp(path.join(root, '2026-10-05-image-check-'));
    await fs.writeFile(path.join(dir, 'local.png'), png);
    const source = path.join(dir, '文件名标题.md');
    const markdown = `---\ncover: ${base}/redirect\n---\n前文\n\n![A](${base}/a?size=1)\n\n中间\n\n![B](${base}/b)\n\n![重复 A](${base}/a?size=1)\n\n![本地](local.png)\n\n\`![代码](${base}/missing)\`\n\n\`\`\`md\n![代码](${base}/missing)\n\`\`\`\n`;
    await fs.writeFile(source, markdown);
    assert.throws(() => buildPayload(source), /prepare-article/);
    const copy = await prepareArticle(source);
    assert.equal(await fs.readFile(source, 'utf8'), markdown);
    const payload = buildPayload(copy);
    assert.equal(payload.title, '文件名标题');
    assert.deepEqual(payload.images.map(image => image.alt), ['A', 'B', '重复 A', '本地', 'cover']);
    assert.equal(payload.images.filter(image => image.coverOnly).length, 1);
    assert.equal(requests.filter(url => url === '/a?size=1').length, 1);
    assert(!requests.includes('/missing'));
    const again = await prepareArticle(source);
    assert.notEqual(copy, again);
    assert.equal(await fs.readFile(copy, 'utf8'), await fs.readFile(again, 'utf8'));
    for (const [route, error] of [['missing', /HTTP 404/], ['html', /受支持图片/], ['large', /16 MiB/]]) {
      await fs.writeFile(source, `# 标题\n\n![坏图](${base}/${route})\n`);
      await assert.rejects(prepareArticle(source), error);
    }
    await fs.writeFile(source, '# 标题\n\n![本地](absent.png)\n');
    assert.throws(() => buildPayload(source), /图片加载失败/);
    await fs.writeFile(source, `# 标题\n\n![首图](${base}/a)\n\n![正文](${base}/b)\n\n![首图再次出现](${base}/a)\n`);
    const implicit = buildPayload(await prepareArticle(source));
    assert.deepEqual(implicit.images.map(image => image.coverOnly), [true, false, false]);
    const failedDirs = await fs.readdir(root);
    for (const name of failedDirs.filter(name => name.startsWith('2026-10-05-文件名标题-'))) {
      const files = await fs.readdir(path.join(root, name));
      // 失败目录没有 article.md；成功目录包含完整副本。
      assert(files.includes('article.md') || !files.includes('article.pending.md'));
    }
    console.log('PASS: 副本不覆盖、原文保留、标题、独立/默认封面、图片顺序、去重、代码示例、重定向与失败阻断');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
