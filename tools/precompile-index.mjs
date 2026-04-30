import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(rootDir, 'src', 'index.babel.html');
const outputPath = path.join(rootDir, 'index.html');
const babelVersion = '7.23.9';
const cacheDir = path.join(rootDir, 'tools', '.cache');
const babelCachePath = path.join(cacheDir, `babel-standalone-${babelVersion}.min.js`);
const babelUrl = `https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/${babelVersion}/babel.min.js`;

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        download(new URL(res.headers.location, url).href).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Download failed ${res.statusCode}: ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

async function loadBabelStandalone() {
  mkdirSync(cacheDir, { recursive: true });
  if (!existsSync(babelCachePath)) {
    const code = await download(babelUrl);
    writeFileSync(babelCachePath, code, 'utf8');
  }
  const code = readFileSync(babelCachePath, 'utf8');
  const sandbox = { console, setTimeout, clearTimeout };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: `babel-standalone-${babelVersion}.js` });
  if (!sandbox.Babel) throw new Error('Babel standalone did not initialize');
  return sandbox.Babel;
}

function extractBabelScript(html) {
  const matches = [...html.matchAll(/<script\s+type=["']text\/babel["'][^>]*>[\s\S]*?<\/script>/gi)];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one text/babel script in ${path.relative(rootDir, sourcePath)}, found ${matches.length}`);
  }
  const tag = matches[0][0];
  const openEnd = tag.indexOf('>') + 1;
  const closeStart = tag.lastIndexOf('</script>');
  return {
    tag,
    source: tag.slice(openEnd, closeStart)
  };
}

const html = readFileSync(sourcePath, 'utf8');
const { tag, source } = extractBabelScript(html);
const Babel = await loadBabelStandalone();
const compiled = Babel.transform(source, {
  presets: [['react', { runtime: 'classic', development: false }]],
  sourceType: 'script',
  comments: true,
  compact: false
}).code;

const withoutRuntimeBabel = html.replace(/\r?\n?<script\b[^>]*src=["'][^"']*babel-standalone\/7\.23\.9\/babel\.min\.js["'][^>]*><\/script>\s*/i, '\n');
if (withoutRuntimeBabel === html) {
  throw new Error('Could not find the Babel standalone runtime script tag to remove');
}

const generatedNote = [
  '<!-- Generated from src/index.babel.html by npm run build:precompile.',
  '     Keep this file self-contained for GitHub Pages; edit the source HTML, then rebuild. -->'
].join('\n');
const compiledTag = `<script data-precompiled="babel-standalone-${babelVersion}">\n${compiled}\n</script>`;
const output = withoutRuntimeBabel.replace(tag, () => `${generatedNote}\n${compiledTag}`);

writeFileSync(outputPath, output, 'utf8');
console.log(`Precompiled ${path.relative(rootDir, sourcePath)} -> ${path.relative(rootDir, outputPath)}`);
