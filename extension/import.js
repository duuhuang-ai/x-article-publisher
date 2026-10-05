'use strict';
const files = window.xArticleFiles;
const shared = window.xPosterShared;
const ui = Object.fromEntries(['markdown','details','folder-section','folder','folder-name','import','status','draft']
  .map(id => [id, document.getElementById(id)]));
let parsed = null;
let importing = false;
let generation = 0;

ui.markdown.addEventListener('change', async () => {
  const current = ++generation;
  parsed = null;
  ui.import.disabled = true;
  ui.draft.hidden = true;
  ui.status.textContent = '';
  ui.details.textContent = '';
  ui['folder-section'].hidden = true;
  const file = ui.markdown.files[0];
  if (!file) return;
  try {
    const article = files.parseArticle(await file.text(), file.name);
    const origins = files.imageOrigins(article);
    if (current !== generation) return;
    parsed = article;
    const sources = [...article.segments.filter(x => x.type === 'image').map(x => x.source), article.cover].filter(Boolean);
    ui.details.textContent = `${article.title} · ${new Set(sources).size} 张图片 · ${origins.length} 个图床域名`;
    ui['folder-section'].hidden = !sources.some(source => shared.isLocalImageSource(source));
    ui.import.disabled = false;
    if (!ui['folder-section'].hidden) {
      const record = await shared.getVaultRecord();
      if (current === generation) ui['folder-name'].textContent = record ? `已选择：${record.name}（权限失效时请重新选择）` : '尚未选择';
    }
  } catch (error) { if (current === generation) ui.status.textContent = `文件读取失败：${error.message}`; }
});

ui.folder.addEventListener('click', async () => {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    await shared.saveVaultHandle(handle);
    ui['folder-name'].textContent = `已选择：${handle.name}`;
    ui.status.textContent = '';
  } catch (error) {
    if (error.name !== 'AbortError') ui.status.textContent = '无法读取附件文件夹，请重新选择并允许读取。';
  }
});

// Runs only inside a newly created X tab. No function depends on extension closures.
async function prepareBlankEditor() {
  const deadline = Date.now() + 60000;
  let clicked = false;
  while (Date.now() < deadline) {
    const editor = Array.from(document.querySelectorAll('[contenteditable="true"]')).find(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 200 && rect.height > 80;
    });
    if (/\/articles\/edit\/\d+/.test(location.href) && editor) {
      if (editor.textContent.trim()) return { ok: false, error: '编辑器已有正文，拒绝覆盖非空草稿' };
      return { ok: true };
    }
    if (!clicked) {
      const create = document.querySelector('button[aria-label="create" i], [role="button"][aria-label="create" i]');
      if (create) { create.click(); clicked = true; }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return { ok: false, error: '没有找到新的文章编辑器，请确认已登录 X、具有 Articles 资格并保持页面打开' };
}

async function openBlankDraft() {
  const current = await chrome.tabs.getCurrent();
  const tab = await chrome.tabs.create({ url: 'https://x.com/compose/articles/new', windowId: current.windowId, active: true });
  ui.draft.hidden = false;
  ui.draft.textContent = '查看 X 页面';
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const state = await chrome.tabs.get(tab.id);
    if (state.url?.startsWith('https://x.com/') && state.status === 'complete') {
      const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: prepareBlankEditor });
      const final = await chrome.tabs.get(tab.id);
      if (/^https:\/\/x\.com\/compose\/articles\/edit\/\d+/.test(final.url)) {
        ui.draft.href = final.url;
        ui.draft.textContent = '查看 X 草稿';
      }
      if (!result?.result?.ok) throw new Error(result?.result?.error || '无法确认新草稿');
      return tab.id;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('X 页面加载超时，请确认网络和登录状态');
}

ui.import.addEventListener('click', async () => {
  if (importing || !parsed) return;
  importing = true;
  ui.import.disabled = true;
  ui.markdown.disabled = true;
  ui.folder.disabled = true;
  ui.draft.hidden = true;
  ui.draft.href = 'https://x.com/compose/articles/new';
  try {
    const origins = files.imageOrigins(parsed);
    // request must happen inside this click gesture, before asynchronous file work.
    if (origins.length && !await chrome.permissions.request({ origins })) throw new Error('未获得图床访问授权，请允许后再导入');
    const payload = await files.buildPayload(parsed, (done, total) => {
      ui.status.textContent = total ? `准备图片 ${done}/${total}…` : '正在准备文章…';
    });
    ui.status.textContent = '正在打开新的 X 草稿…';
    const tabId = await openBlankDraft();
    ui.status.textContent = `正在导入正文及 ${payload.images.length} 张图片，请保持本页面和 X 页面打开，等待完成后再编辑。`;
    await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['xpage.js'] });
    const [injected] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN',
      func: async payload => {
        try { return await window.__xArticleWrite(payload); }
        catch (error) { return { ok: false, error: error.message || '编辑器写入失败' }; }
      }, args: [payload] });
    if (!injected?.result?.ok) throw new Error(injected?.result?.error || '没有收到导入完成确认，请检查草稿');
    ui.status.textContent = '导入完成。请检查标题、封面和正文图片，再在 X 手动发布。';
  } catch (error) {
    ui.status.textContent = `导入失败：${error.message || '页面已关闭或连接中断'}。已有草稿保留，请先检查。`;
  } finally {
    importing = false;
    ui.import.disabled = !parsed;
    ui.markdown.disabled = false;
    ui.folder.disabled = false;
  }
});
