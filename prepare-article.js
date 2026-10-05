#!/usr/bin/env node
// 只写 work/ 发布副本，原文和原图床保持不变。
const fs = require('node:fs/promises');
const path = require('node:path');
const shared = require('./shared.js');
const { buildPayload } = require('./payload.js');

const MAX_BYTES = 16 * 1024 * 1024;

async function downloadImage(source) {
  const url = new URL(source);
  if (url.username || url.password) throw new Error('图片链接不能包含账号密码');
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > MAX_BYTES) {
    await response.body.cancel();
    throw new Error('图片超过 16 MiB');
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > MAX_BYTES) throw new Error('图片超过 16 MiB');
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  // 校验实际格式，避免把防盗链/登录页当图片保存；不依赖 URL 后缀或响应 MIME。
  const ext = buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ? 'png'
    : buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff ? 'jpg'
    : /^GIF8[79]a$/.test(buffer.toString('ascii', 0, 6)) ? 'gif'
    : buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' ? 'webp'
    : '';
  if (!ext) throw new Error('响应不是受支持图片（PNG/JPEG/GIF/WebP）');
  return { buffer, ext };
}

async function prepareArticle(mdPath) {
  const sourcePath = path.resolve(mdPath);
  const markdown = (await fs.readFile(sourcePath, 'utf8')).replace(/\r\n/g, '\n');
  const parsed = shared.parseMarkdown(markdown);
  const frontmatter = markdown.match(/^---\n[\s\S]*?\n---\n*/)?.[0] || '';
  let header = frontmatter;
  let body = markdown.slice(frontmatter.length);
  const spans = shared.findSpecialBlocks(body).filter(span => span.segment.type === 'image');
  const sources = [...new Set([...spans.map(span => span.segment.source), parsed.cover].filter(Boolean))];
  const workRoot = path.join(__dirname, 'work');
  await fs.mkdir(workRoot, { recursive: true });
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
  const name = path.basename(sourcePath, path.extname(sourcePath)).replace(/[^\p{L}\p{N}_-]/gu, '-').slice(0, 60) || 'article';
  const outputDir = await fs.mkdtemp(path.join(workRoot, `${date}-${name}-`));
  const replacements = new Map();
  // ponytail: 串行下载，保证错误定位和顺序；大量图片确实慢时再加有限并发。
  for (const [index, source] of sources.entries()) {
    if (source.startsWith('data:')) continue;
    try {
      if (/^https?:\/\//i.test(source)) {
        const { buffer, ext } = await downloadImage(source);
        const fileName = `image-${String(index + 1).padStart(3, '0')}.${ext}`;
        await fs.writeFile(path.join(outputDir, fileName), buffer, { flag: 'wx' });
        replacements.set(source, fileName);
      } else {
        // 副本移到 work/ 后，原来的相对本地路径仍指向原文章旁边的图片。
        const fullPath = path.resolve(path.dirname(sourcePath), source);
        await fs.access(fullPath);
        replacements.set(source, fullPath);
      }
    } catch (error) {
      // 不输出完整图床 URL，避免泄露查询参数中的签名。
      const reason = /^https?:\/\//i.test(source) && !/^(HTTP \d+|图片超过|响应不是|图片链接不能)/.test(error.message)
        ? '网络请求失败或超时' : error.message;
      throw new Error(`第 ${index + 1} 张图片准备失败：${reason}。未生成发布副本；已下载素材保留在 ${outputDir}`);
    }
  }
  for (const span of spans.reverse()) {
    const replacement = replacements.get(span.segment.source);
    if (!replacement) continue;
    body = body.slice(0, span.start) + `![${span.segment.alt}](${replacement})` + body.slice(span.end);
  }
  if (parsed.cover && replacements.has(parsed.cover)) {
    header = header.replace(/^(\s*(?:cover|Cover|封面)\s*):[^\n]*$/gm, (_, key) => `${key}: "${replacements.get(parsed.cover)}"`);
  }
  if (!parsed.title) {
    const title = shared.markdownTitleCandidateFromFileName(sourcePath);
    const titleLine = `title: ${JSON.stringify(title)}\n`;
    // Obsidian 常把标题放在文件名中；仅在副本补上，避免通用 article.md 丢失标题。
    header = header ? header.replace(/^---\n/, `---\n${titleLine}`) : `---\n${titleLine}---\n\n`;
  }
  // 先验证完整 payload，再产生可供使用的 article.md，失败不留下看似可用的副本。
  const candidate = path.join(outputDir, 'article.pending.md');
  await fs.writeFile(candidate, header + body, { flag: 'wx' });
  buildPayload(candidate);
  const outputPath = path.join(outputDir, 'article.md');
  await fs.rename(candidate, outputPath);
  return outputPath;
}

if (require.main === module) {
  if (process.argv.length !== 3) {
    console.error('用法: node prepare-article.js /absolute/path/article.md');
    process.exitCode = 1;
  } else {
    prepareArticle(process.argv[2]).then(output => console.log(output)).catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}

module.exports = { prepareArticle };
