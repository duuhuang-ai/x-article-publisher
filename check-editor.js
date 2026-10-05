// X 插图先上传，再延迟保存。缺少任何保存证据都不能进入下一张。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = { window: {}, console: { log() {} } };
vm.runInNewContext(fs.readFileSync(require.resolve('./xpage.js'), 'utf8'), context);
const saved = context.xArticleImageSaved;
const props = { prevMediaEntityKeys: ['entity-a'], prevArticleEntityMedia: [{ media_id: '123' }], mediaIdToLocalMediaIdMap: { '123': 2 } };
assert.equal(saved(props, 'entity-a', '123'), true);
assert.equal(saved({ ...props, prevMediaEntityKeys: [] }, 'entity-a', '123'), false);
assert.equal(saved({ ...props, prevArticleEntityMedia: [] }, 'entity-a', '123'), false);
assert.equal(saved({ ...props, mediaIdToLocalMediaIdMap: {} }, 'entity-a', '123'), false);
assert.equal(saved(props, 'entity-b', '123'), false);
assert.equal(saved(props, 'entity-a', '124'), false);
assert.equal(saved(null, 'entity-a', '123'), false);
assert.equal(saved(props, '', ''), false);
console.log('PASS: 图片必须完成保存、实体确认及媒体映射，才允许继续');

// Exercise the real entry point with an editor whose insertion/paste does nothing.
async function failedWrite(title, type = 'unstyled', articleId = '123', text = '') {
  let writes = 0, clock = 0;
  const chars = { size: 0, first: () => null, some: () => false };
  const block = { getKey: () => 'blank', getText: () => text, getType: () => type, getCharacterList: () => chars };
  const map = { find: () => null, forEach: fn => fn(block, 'blank') };
  const content = { getBlockMap: () => map, getBlocksAsArray: () => [block] };
  const node = { props: { editorState: { getCurrentContent: () => content, getSelection: () => ({}) }, onChange: () => writes++ } };
  const editor = { getBoundingClientRect: () => ({ width: 600, height: 400 }), focus() {}, dispatchEvent() {},
    __reactFiber$test: { stateNode: node, memoizedProps: { prevMediaEntityKeys: [], articleEntity: { title: '', content_state: { blocks: [] } } } } };
  const page = { window: {}, location: { href: 'https://x.com/compose/articles/edit/123' },
    document: { cookie: '', querySelectorAll: selector => selector.includes('input') ? [] : [editor], execCommand: () => false },
    Date: { now: () => clock }, setTimeout: fn => { clock += 500; fn(); },
    DataTransfer: class { setData() {} }, ClipboardEvent: class { constructor(type, options) { Object.assign(this, options); } },
    fetch: async () => ({ ok: false, status: 403, text: async () => 'denied' }), console: { log() {}, error() {} } };
  vm.runInNewContext(fs.readFileSync(require.resolve('./xpage.js'), 'utf8'), page);
  const result = await page.window.__xArticleWrite({ title, articleId, blocks: [{ type: 'unstyled', text: 'expected body' }], plan: [], images: [], html: '', plain: '' });
  assert.equal(result.ok, false, '标题/正文均未写入时不能报告完成');
  if (type === 'atomic' || articleId !== '123') assert.equal(writes, 0, '拒绝覆盖或切换后的草稿');
  return result;
}
(async () => {
  const results = await Promise.allSettled([
    failedWrite('expected title'), failedWrite(''),
    failedWrite('', 'atomic', '123', ' ').then(result => assert.match(result.error, /非空|已有/)),
    failedWrite('', 'unstyled', '999').then(result => assert.match(result.error, /草稿|切换/))
  ]);
  const failures = results.flatMap((result, i) => result.status === 'rejected' ? [`case ${i + 1}: ${result.reason.message}`] : []);
  assert.equal(failures.length, 0, failures.join('\n'));
  const blank = context.xArticleDraftBlank;
  const content = (type, text, entity = false) => ({ getBlocksAsArray: () => [{ getType: () => type, getText: () => text, getCharacterList: () => ({ some: () => entity }) }] });
  assert.equal(blank(content('unstyled', '')), true);
  assert.equal(blank(content('atomic', ' ')), false);
  assert.equal(blank(content('unstyled', '', true)), false);
  assert.equal(blank(null), false);
  const savedContent = context.xArticleContentSaved;
  const current = [{ getKey: () => 'a', getText: () => 'body' }];
  const props = { articleEntity: { title: 'title', content_state: { blocks: [{ key: 'a', text: 'body' }] } } };
  assert.equal(savedContent(props, current, 'title'), true);
  assert.equal(savedContent(props, current, 'wrong title'), false);
  assert.equal(savedContent({ articleEntity: { title: 'title', content_state: { blocks: [] } } }, current, 'title'), false);
  console.log('PASS: 空草稿/目标绑定、写入失败及服务端正文标题保存确认');
})().catch(error => { console.error(error); process.exitCode = 1; });
