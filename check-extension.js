// node check-extension.js — detects lost images, unsafe fetches and wrong cover/order.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const shared = require('./shared.js');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64');
const requests = [];
let granted = true;
let localFailure = '';
const context = {
  window: { xPosterShared: { ...shared, resolveLocalImage: async source => {
    if (localFailure) return { ok: false, error: localFailure };
    return { ok: true, base64: png.toString('base64'), mime: 'image/png', fileName: 'local.png' };
  } } },
  URL, Uint8Array, Map, Set, Blob, Response, TextDecoder, console,
  btoa: value => Buffer.from(value, 'binary').toString('base64'),
  atob: value => Buffer.from(value, 'base64').toString('binary'),
  AbortSignal: { timeout: ms => { assert.equal(ms, 30000); return AbortSignal.timeout(10); } },
  chrome: { permissions: { contains: async () => granted } },
  fetch: async (url, options) => {
    requests.push(url);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    const route = new URL(url).pathname;
    if (route === '/timeout') return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('signed-token=secret', 'TimeoutError')));
      setTimeout(() => {}, 30);
    });
    if (route === '/redirect') throw new TypeError('https://other.example/pic?signed-token=secret');
    if (route === '/missing') return new Response('', { status: 404 });
    if (route === '/html') return new Response('<html>denied</html>', { headers: { 'Content-Type': 'image/png' } });
    if (route === '/large') return new Response(png, { headers: { 'Content-Length': String(17 * 1024 * 1024) } });
    if (route === '/stream-large') return new Response(new Uint8Array(17 * 1024 * 1024));
    return new Response(png, { headers: { 'Content-Type': 'application/octet-stream' } });
  }
};
(async () => {
  assert(fs.existsSync('./extension/article.js'), '浏览器图片准备模块尚未实现');
  vm.runInNewContext(fs.readFileSync('./extension/article.js', 'utf8'), context);
  const api = context.window.xArticleFiles;
  const markdown = '---\ncover: https://img.example/cover\n---\n前文\n\n![A](https://img.example/a?signed-token=secret)\n\n中间\n\n![B](https://img.example/b)\n\n![重复 A](https://img.example/a?signed-token=secret)\n\n![本地](local.png)\n\n`![代码](https://img.example/missing)`\n\n```md\n![代码](https://img.example/missing)\n```\n';
  const parsed = api.parseArticle(markdown, '文件名标题.md');
  assert.equal(parsed.title, '文件名标题');
  assert.deepEqual(Array.from(api.imageOrigins(parsed)), ['https://img.example/*']);
  const result = await api.buildPayload(parsed);
  assert.deepEqual(Array.from(result.images, x => x.alt), ['A', 'B', '重复 A', '本地', 'cover']);
  assert.equal(result.images.filter(x => x.coverOnly).length, 1);
  assert.equal(requests.filter(x => x.includes('/a?')).length, 1);
  assert(!requests.some(x => x.includes('/missing')));
  const implicit = await api.buildPayload(api.parseArticle('# 标题\n\n![A](https://img.example/a)\n\n![B](https://img.example/b)\n\n![重复](https://img.example/a)', 'test.md'));
  assert.deepEqual(Array.from(implicit.images, x => x.coverOnly), [true, false, false]);
  const data = await api.buildPayload(api.parseArticle(`# 标题\n\n![图](data:image/png;base64,${png.toString('base64')})`, 'data.md'));
  assert.equal(data.images.length, 1);
  for (const [route, pattern] of [['missing', /404/], ['html', /图片/], ['large', /16 MiB/], ['stream-large', /16 MiB/], ['timeout', /超时/], ['redirect', /直链|重定向/]]) {
    await assert.rejects(api.buildPayload(api.parseArticle(`![坏图](https://img.example/${route}?signed-token=secret)`, 'bad.md')), error => pattern.test(error.message) && !error.message.includes('signed-token'));
  }
  for (const url of ['http://localhost/a', 'http://127.0.0.1/a', 'http://10.0.0.1/a', 'http://[::1]/a', 'https://user:password@img.example/a']) {
    assert.throws(() => api.imageOrigins(api.parseArticle(`![坏图](${url})`, 'bad.md')), /地址|私有|凭证/);
  }
  granted = false;
  await assert.rejects(api.buildPayload(api.parseArticle('![图](https://img.example/a)', 'bad.md')), /授权/);
  granted = true;
  localFailure = 'Local image folder permission expired';
  await assert.rejects(api.buildPayload(api.parseArticle('![图](local.png)', 'bad.md')), /文件夹/);
  localFailure = '';
  await assert.rejects(api.buildPayload(api.parseArticle('![图](../outside.png)', 'bad.md')), /越出|越界/);
  console.log('PASS: 浏览器 payload 标题、图床/内嵌/附件、封面、顺序、去重及失败阻断');
})().catch(error => { console.error(error); process.exitCode = 1; });
