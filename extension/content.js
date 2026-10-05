// A shortcut to the same standalone importer shown by the extension icon.
(() => {
  function syncButton() {
    const ready = Array.from(document.querySelectorAll('[contenteditable="true"]')).some(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 200 && rect.height > 80;
    });
    const existing = document.getElementById('hermes-import-btn');
    if (!ready) { existing?.remove(); return; }
    if (existing) return;
    const button = document.createElement('button');
    button.id = 'hermes-import-btn';
    button.type = 'button';
    button.textContent = '📥 选择 Markdown';
    button.style.cssText = 'position:fixed;top:12px;right:12px;z-index:99998;background:#116ab5;color:white;padding:8px 16px;border:0;border-radius:20px;font:600 13px system-ui;cursor:pointer';
    button.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'open-importer' }));
    document.body.appendChild(button);
  }
  setTimeout(syncButton, 1000);
  setInterval(syncButton, 800);
})();
