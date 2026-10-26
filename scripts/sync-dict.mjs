#!/usr/bin/env node
/**
 * scripts/sync-dict.mjs
 * 把 shared/ 下的脱敏词库与引擎同步到前端与 Worker 两端，保证"同一套词库"。
 *   输入：shared/desensitize.json（词库，唯一编辑源）
 *        shared/desensitize.engine.js（引擎，唯一编辑源）
 *   输出：frontend/data/desensitize.json   （前端运行时 fetch）
 *        frontend/js/desensitize.js        （生成物，勿手改）
 *        worker/src/desensitize.json       （Worker 构建时 import）
 *        worker/src/desensitize.js         （生成物，勿手改）
 * 用法：node scripts/sync-dict.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const engine = readFileSync(join(root, 'shared/desensitize.engine.js'), 'utf8');
const dictJson = readFileSync(join(root, 'shared/desensitize.json'), 'utf8');
JSON.parse(dictJson); // 校验 JSON 合法，不合法直接抛错

mkdirSync(join(root, 'frontend/data'), { recursive: true });
mkdirSync(join(root, 'frontend/js'), { recursive: true });
mkdirSync(join(root, 'worker/src'), { recursive: true });

writeFileSync(join(root, 'frontend/data/desensitize.json'), dictJson);
writeFileSync(join(root, 'worker/src/desensitize.json'), dictJson);

const banner = (to) =>
  '/* eslint-disable */\n' +
  '// ⚠️ 本文件由 scripts/sync-dict.mjs 自动生成，请勿手改。\n' +
  '// 修改请编辑 shared/desensitize.json 或 shared/desensitize.engine.js，然后运行：node scripts/sync-dict.mjs\n' +
  `// 同步目标：${to}\n`;

writeFileSync(
  join(root, 'frontend/js/desensitize.js'),
  banner('frontend') +
    engine +
    `
export const DICT_URL = 'data/desensitize.json';
let _compiled = null;

/** 页面启动时调用一次；失败会抛错，由 app.js 提示 */
export async function loadDictionary(url = DICT_URL) {
  if (_compiled) return _compiled;
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error('脱敏词库加载失败: HTTP ' + res.status);
  _compiled = compileDictionary(await res.json());
  return _compiled;
}

/** 已加载的编译后词库；未加载时返回 null（各页签调用前应确保已 load） */
export function getDictionary() {
  return _compiled;
}
`
);

writeFileSync(
  join(root, 'worker/src/desensitize.js'),
  banner('worker') +
    "import dict from './desensitize.json';\n" +
    engine +
    `
/** Worker 侧统一入口：输入文本 → { text, replacements, blocked } */
export function desensitize(text) {
  return applyDesensitize(text, dict);
}

export const DICT_VERSION = dict.version;
`
);

console.log('[sync-dict] OK -> frontend/data/desensitize.json, frontend/js/desensitize.js, worker/src/desensitize.json, worker/src/desensitize.js');
