// The extension page owns long imports; the service worker only opens it.
async function openImporter() {
  return chrome.tabs.create({ url: chrome.runtime.getURL('import.html') });
}
chrome.action.onClicked.addListener(openImporter);
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'open-importer' || sender.id !== chrome.runtime.id) return;
  openImporter().then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
  return true;
});
