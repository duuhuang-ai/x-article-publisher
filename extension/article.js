// Browser-only file preparation. Parser and paste plan remain in shared.js.
(() => {
  'use strict';
  const shared = window.xPosterShared;
  const MAX_BYTES = 16 * 1024 * 1024;

  function parseArticle(markdown, fileName) {
    if (!String(markdown).trim()) throw new Error('Markdown 文件为空');
    return shared.parseMarkdown(markdown, { fileName, extractTitle: true, extractCover: true });
  }

  function imageSegments(parsed) {
    const segments = parsed.segments.filter(segment => segment.type === 'image');
    if (parsed.cover && !segments.some(segment => shared.imageSourcesMatch(segment.source, parsed.cover))) {
      segments.push({ type: 'image', source: parsed.cover, alt: 'cover' });
    }
    return segments;
  }

  function remoteUrl(source) {
    const url = new URL(source);
    if (!shared.isRemoteHttpImageSource(source)) throw new Error('不支持私有网络图片地址');
    if (url.username || url.password) throw new Error('图片地址不能含账号凭证');
    return url;
  }

  function imageOrigins(parsed) {
    return [...new Set(imageSegments(parsed).filter(segment => /^https?:\/\//i.test(segment.source))
      .map(segment => `${remoteUrl(segment.source).protocol}//${remoteUrl(segment.source).hostname}/*`))];
  }

  function imageFormat(buffer) {
    const b = new Uint8Array(buffer);
    const ascii = (start, end) => String.fromCharCode(...b.subarray(start, end));
    if (b.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10') return ['png', 'image/png'];
    if (b[0] === 255 && b[1] === 216 && b[2] === 255) return ['jpg', 'image/jpeg'];
    if (/^GIF8[79]a$/.test(ascii(0, 6))) return ['gif', 'image/gif'];
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return ['webp', 'image/webp'];
    throw new Error('不是受支持图片（PNG/JPEG/GIF/WebP）');
  }

  async function download(source) {
    const url = remoteUrl(source);
    const origin = `${url.protocol}//${url.hostname}/*`;
    if (!await chrome.permissions.contains({ origins: [origin] })) throw new Error('请授权访问文章的图床域名');
    let response;
    try {
      response = await fetch(url.href, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(30000) });
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new Error('图片下载超时');
      throw new Error('下载失败：请检查网络，并使用无需登录、无重定向的图片直链');
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (response.redirected || response.url && new URL(response.url).origin !== url.origin) {
      await response.body?.cancel();
      throw new Error('图片重定向被拒绝，请使用图片直链');
    }
    if (Number(response.headers.get('content-length')) > MAX_BYTES) {
      await response.body?.cancel();
      throw new Error('图片超过 16 MiB');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('图片响应为空');
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) throw new Error('图片超过 16 MiB');
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      if (error.message === '图片超过 16 MiB') throw error;
      throw new Error(error.name === 'TimeoutError' || error.name === 'AbortError' ? '图片下载超时' : '图片读取失败');
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes.buffer;
  }

  async function compress(buffer, mime) {
    if (!['image/png', 'image/jpeg'].includes(mime) || buffer.byteLength < 150 * 1024) return null;
    let image;
    try {
      image = await createImageBitmap(new Blob([buffer], { type: mime }));
      const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
      return blob?.size && blob.size < buffer.byteLength ? blob.arrayBuffer() : null;
    } catch { return null; } finally { image?.close(); }
  }

  async function readImage(source, index) {
    let buffer;
    if (/^https?:\/\//i.test(source)) buffer = await download(source);
    else {
      if (!source.startsWith('data:') && !shared.localImagePathCandidates(source).length) {
        throw new Error('图片路径越出所选文件夹或为绝对路径，请使用文件夹内相对路径');
      }
      const result = source.startsWith('data:') ? shared.parseDataUri(source) : await shared.resolveLocalImage(source);
      if (!result.ok) throw new Error(source.startsWith('data:') ? '内嵌图片无效或超过 16 MiB' : '无法读取本地图片，请重新选择附件文件夹并检查路径');
      try { buffer = Uint8Array.from(atob(result.base64), char => char.charCodeAt(0)).buffer; }
      catch { throw new Error('图片编码无效'); }
    }
    if (!buffer.byteLength || buffer.byteLength > MAX_BYTES) throw new Error('图片必须非空且不超过 16 MiB');
    let [ext, mime] = imageFormat(buffer);
    const compressed = await compress(buffer, mime);
    if (compressed) { buffer = compressed; ext = 'jpg'; mime = 'image/jpeg'; }
    return { ok: true, base64: shared.arrayBufferToBase64(buffer), mime,
      fileName: `image-${String(index + 1).padStart(3, '0')}.${ext}`, bytes: buffer.byteLength };
  }

  async function buildPayload(parsed, onProgress = () => {}) {
    imageOrigins(parsed); // Validate before any requests.
    const segments = imageSegments(parsed);
    const results = new Map();
    const cache = new Map();
    // ponytail: sequential preparation; add bounded concurrency only if this is measurably slow.
    for (const [index, segment] of segments.entries()) {
      onProgress(index, segments.length);
      try {
        if (!cache.has(segment.source)) cache.set(segment.source, await readImage(segment.source, index));
        results.set(segment, cache.get(segment.source));
      } catch (error) {
        throw new Error(`第 ${index + 1} 张图片准备失败：${error.message}`);
      }
    }
    onProgress(segments.length, segments.length);
    const separateCover = segments.find(segment => !parsed.segments.includes(segment));
    const paste = shared.buildPastePlan(parsed.segments, results, new Map(), {
      coverSource: parsed.cover, coverResult: separateCover ? results.get(separateCover) : null
    });
    return { title: parsed.title || '', cover: parsed.cover || '', html: paste.html, plain: paste.plain,
      blocks: paste.blocks, plan: paste.plan, markerPrefix: paste.markerPrefix, articleId: null,
      images: paste.plan.filter(op => op.op.type === 'image' && op.op.file?.base64).map(op => ({
        marker: op.marker, ...op.op.file, coverOnly: !!op.op.coverOnly,
        fallbackText: op.op.fallbackText || '', source: op.op.source || null
      })) };
  }
  window.xArticleFiles = { parseArticle, imageOrigins, buildPayload };
})();
