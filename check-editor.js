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
async function failedWrite(title, type = 'unstyled', articleId = '123', text = '', canWrite = false) {
  let writes = 0, clock = 0;
  // Only the Draft immutable primitives are simulated; runFlow and its save wait run unchanged.
  function List(items = []) { return { constructor: List, size: items.length, get: i => items[i], first: () => items[0], some: fn => items.some(fn), push: item => List([...items, item]) }; }
  function Block(text, type, key, chars = List()) {
    return { getKey: () => key, getText: () => text, getType: () => type, getCharacterList: () => chars,
      getData: () => ({ clear: () => ({}) }), merge: data => Block(data.text, data.type, data.key, data.characterList) };
  }
  function BlockMap(blocks = []) {
    const map = new Map(blocks.map(block => [block.getKey(), block]));
    map.constructor = BlockMap; map.find = fn => [...map.values()].find(fn);
    return map;
  }
  let map = BlockMap([Block(text, type, 'blank')]);
  const content = { getBlockMap: () => map, getBlocksAsArray: () => [...map.values()], set: (key, value) => { if (key === 'blockMap') map = value; return content; } };
  class Selection { static createEmpty() { return new Selection(); } }
  class State {
    getCurrentContent() { return content; } getSelection() { return new Selection(); }
    static push() { return new State(); } static moveSelectionToEnd(state) { return state; }
  }
  const savedArticle = { title: '', content_state: { blocks: [] } };
  const node = { props: { editorState: new State(), onChange: state => {
    writes++; node.props.editorState = state;
    if (canWrite === 'save-body') savedArticle.content_state.blocks = content.getBlocksAsArray().map(block => ({ key: block.getKey(), text: block.getText() }));
  } } };
  const editor = { getBoundingClientRect: () => ({ width: 600, height: 400 }), focus() {}, dispatchEvent() {},
    __reactFiber$test: { stateNode: node, memoizedProps: { prevMediaEntityKeys: [], articleEntity: savedArticle } } };
  const page = { window: {}, location: { href: 'https://x.com/compose/articles/edit/123' },
    document: { cookie: '', querySelectorAll: selector => selector.includes('input') ? [] : [editor], execCommand: () => {
      if (!canWrite) return false;
      const style = { clear() { return this; }, add() { return this; } };
      const char = { getEntity: () => null, getStyle: () => style, set() { return this; } };
      map = BlockMap([Block('x', 'unstyled', 'sample', List([char]))]); return true;
    } },
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
    failedWrite('', 'unstyled', '999').then(result => assert.match(result.error, /草稿|切换/)),
    failedWrite('', 'unstyled', '123', '', true).then(result => assert.match(result.error, /未保存/, '正文写入后必须等到服务端保存')),
    failedWrite('expected title', 'unstyled', '123', '', 'save-body').then(result => assert.match(result.error, /未保存/, '正文保存也不能掩盖标题失败'))
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
  await checkRelocation();
  console.log('PASS: 空草稿/目标绑定、写入失败及服务端正文标题保存确认');
})().catch(error => { console.error(error); process.exitCode = 1; });

async function checkRelocation() {
  function MapOf(blocks = []) { const map = new Map(blocks.map(b => [b.getKey(), b])); map.constructor = MapOf; return map; }
  const block = (key, text, entity) => ({ getKey: () => key, getType: () => entity ? 'atomic' : 'unstyled', getText: () => text,
    getCharacterList: () => ({ first: () => entity ? { getEntity: () => entity } : null, get: () => ({ getEntity: () => entity }) }),
    findEntityRanges: (test, fn) => { if (entity) fn(0); } });
  function makeNode(hasTarget) {
    let writes = 0, map = MapOf([block('old', ' ', 'old'), ...(hasTarget ? [block('new', ' ', 'wanted')] : []), block('marker', '__XPOSTER_a_IMAGE_1__')]);
    const content = { getBlockMap: () => map, getBlocksAsArray: () => [...map.values()],
      getEntity: entity => ({ getType: () => 'MEDIA', getData: () => ({ mediaItems: [{ mediaId: entity }] }) }),
      set: (key, value) => { if (key === 'blockMap') map = value; return content; } };
    class Selection { static createEmpty() { return new Selection(); } }
    class State { getCurrentContent() { return content; } getSelection() { return new Selection(); }
      static push() { return new State(); } static moveSelectionToEnd(state) { return state; } }
    return { props: { editorState: new State(), onChange() { writes++; } }, writes: () => writes };
  }
  const stale = makeNode(false), fresh = makeNode(true);
  const editor = { getBoundingClientRect: () => ({ width: 600, height: 400 }), __reactFiber$test: { stateNode: fresh } };
  const page = { window: {}, location: { href: 'https://x.com/compose/articles/edit/123' }, document: { querySelectorAll: () => [editor] },
    setTimeout: fn => fn(), console: { log() {} } };
  const source = fs.readFileSync(require.resolve('./xpage.js'), 'utf8');
  // Expose the existing private functions only in this VM; their implementation is unchanged.
  assert(source.includes('return await runFlow(payload);'));
  vm.runInNewContext(source.replace('return await runFlow(payload);', 'return { relocateImages, settleUploadedImageAtMarker };'), page);
  const api = await page.window.__xArticleWrite({ articleId: '123' });
  const upload = { mediaId: 'wanted', blockKey: 'new', entityKey: 'wanted', markerBlock: 'marker', marker: '__XPOSTER_a_IMAGE_1__', markerExact: true };
  const missing = api.relocateImages(stale, [upload], new Set());
  assert.equal(missing.moved, 0, '缺失目标不能搬运第一张旧图');
  assert.equal(missing.missing, 1);
  assert.equal(stale.writes(), 0);
  const result = await api.settleUploadedImageAtMarker(stale, upload, new Set());
  assert.equal(result.missing, 0, '上传后应读取当前编辑器');
  assert.equal(stale.writes(), 0);
  assert.equal(fresh.writes(), 1);
}
