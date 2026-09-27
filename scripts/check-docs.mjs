import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const excluded = new Set(['node_modules', 'dist', '.git', '.codex', '.tierdecay', 'coverage']);
const failures = [];
const documents = [];
const assets = [];
const mebibyte = 1024 * 1024;
let checkedLinks = 0;

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name.toLowerCase())) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(filename);
    if (!entry.isFile()) continue;
    if (/\.(?:md|markdown|html?)$/i.test(entry.name)) documents.push(filename);
    const relative = path.relative(root, filename).split(path.sep);
    if (relative[0] === 'docs' && relative[1] === 'assets') assets.push(filename);
  }
}

function blank(value) {
  return value.replace(/[^\n]/g, ' ');
}

function removeExamples(source, markdown) {
  let text = source.replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, blank);
  if (!markdown) return text;
  let fence;
  text = text.split('\n').map(line => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length &&
          line.slice(marker[0].length).trim() === '') fence = undefined;
      return blank(line);
    }
    if (marker) {
      fence = { character: marker[1][0], length: marker[1].length };
      return blank(line);
    }
    return line;
  }).join('\n');
  // Only equal-length runs close a Markdown code span.
  const runs = [...text.matchAll(/`+/g)];
  const regions = [];
  for (let index = 0; index < runs.length; index++) {
    const end = runs.findIndex((run, candidate) => candidate > index && run[0].length === runs[index][0].length);
    if (end === -1) continue;
    regions.push([runs[index].index, runs[end].index + runs[end][0].length]);
    index = end;
  }
  for (const [start, end] of regions.reverse()) {
    text = text.slice(0, start) + blank(text.slice(start, end)) + text.slice(end);
  }
  return text;
}

function destination(text, start) {
  let cursor = start;
  while (/\s/.test(text[cursor] ?? '') && cursor < text.length) cursor++;
  if (text[cursor] === '<') {
    const end = text.indexOf('>', cursor + 1);
    return end === -1 ? undefined : text.slice(cursor + 1, end);
  }
  let value = '';
  let depth = 0;
  for (; cursor < text.length; cursor++) {
    const character = text[cursor];
    if (character === '\\' && cursor + 1 < text.length) {
      value += character + text[++cursor];
      continue;
    }
    if (/\s/.test(character)) break;
    if (character === '(') depth++;
    if (character === ')') {
      if (depth === 0) break;
      depth--;
    }
    value += character;
  }
  return value || undefined;
}

function links(text, markdown) {
  const found = [];
  if (markdown) {
    for (const match of text.matchAll(/\]\(/g)) {
      const value = destination(text, match.index + 2);
      if (value) found.push({ value, offset: match.index });
    }
    // Validating definitions also covers full, collapsed and shortcut reference links.
    for (const match of text.matchAll(/^ {0,3}\[[^\]\n]+\]:\s*/gm)) {
      const value = destination(text, match.index + match[0].length);
      if (value) found.push({ value, offset: match.index });
    }
  }
  for (const tag of text.matchAll(/<(?:[^"'<>]|"[^"]*"|'[^']*')*>/g)) {
    for (const attribute of tag[0].matchAll(/\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
      found.push({ value: attribute[1] ?? attribute[2] ?? attribute[3], offset: tag.index });
    }
  }
  return found;
}

function decodeEntities(value) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
    const key = entity.slice(1, -1).toLowerCase();
    const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
    if (named[key]) return named[key];
    const number = key.startsWith('#x') ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return Number.isInteger(number) && number > 0 && number <= 0x10ffff
      ? String.fromCodePoint(number) : entity;
  });
}

async function validateLink(filename, text, link) {
  const relativeFile = path.relative(root, filename);
  const line = text.slice(0, link.offset).split('\n').length;
  const location = `${relativeFile}:${line}`;
  const value = decodeEntities(link.value).replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\^_`{|}~])/g, '$1').trim();
  // Site-root URLs are deployment routes, not relative filesystem destinations.
  if (!value || value.startsWith('#') || value.startsWith('?') ||
      value.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(value)) return;
  const pathname = value.split(/[?#]/, 1)[0];
  if (!pathname) return;
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { failures.push(`${location}: invalid URL encoding: ${value}`); return; }
  const target = path.resolve(path.dirname(filename), decoded);
  const relativeTarget = path.relative(root, target);
  if (relativeTarget === '..' || relativeTarget.startsWith(`..${path.sep}`) || path.isAbsolute(relativeTarget)) {
    failures.push(`${location}: local link escapes repository: ${value}`); return;
  }
  checkedLinks++;
  try { await stat(target); }
  catch { failures.push(`${location}: missing local target: ${value}`); }
}

await walk(root);
for (const filename of documents) {
  const source = await readFile(filename, 'utf8');
  const markdown = /\.(?:md|markdown)$/i.test(filename);
  const text = removeExamples(source, markdown);
  for (const link of links(text, markdown)) await validateLink(filename, text, link);
}
let assetBytes = 0;
for (const filename of assets) {
  const { size } = await stat(filename);
  assetBytes += size;
  if (/\.png$/i.test(filename) && size > 4 * mebibyte) {
    failures.push(`${path.relative(root, filename)}: PNG exceeds 4 MiB (${size} bytes)`);
  }
}
if (assetBytes > 12 * mebibyte) failures.push(`docs/assets: exceeds 12 MiB total (${assetBytes} bytes)`);
if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`Docs check failed: ${failures.length} issue(s).`);
  process.exitCode = 1;
} else {
  console.log(`Docs check passed: ${documents.length} documents, ${checkedLinks} local links, ${assets.length} assets (${assetBytes} bytes).`);
}
