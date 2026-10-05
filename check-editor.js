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
