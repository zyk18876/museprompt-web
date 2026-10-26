/* eslint-disable */
// ⚠️ 本文件由 scripts/sync-dict.mjs 自动生成，请勿手改。
// 修改请编辑 shared/desensitize.json 或 shared/desensitize.engine.js，然后运行：node scripts/sync-dict.mjs
// 同步目标：frontend
/**
 * shared/desensitize.engine.js
 * Muse 提示词脱敏引擎（纯函数：无 DOM / 无网络 / 无 Node 专有 API，前端与 Worker 共用）。
 * 本文件是引擎唯一编辑源；scripts/sync-dict.mjs 会把它与 shared/desensitize.json
 * 一起同步生成 frontend/js/desensitize.js 与 worker/src/desensitize.js。
 *
 * 处理顺序：hardBlock（命中即拒） → stripParams（清理工具参数） → rewrites（同义客观化改写）
 */

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildEntryRegex(entry) {
  // 兼容两种键名：rewrites/stripParams 用 from，hardBlock 用 patterns
  const raw = Array.isArray(entry.from)
    ? entry.from
    : Array.isArray(entry.patterns)
      ? entry.patterns
      : [entry.from];
  const patterns = raw
    .map((p) => String(p == null ? '' : p).trim())
    .filter(Boolean);
  if (patterns.length === 0) return null;
  const source = patterns.map((p) => (entry.regex ? p : escapeRegExp(p))).join('|');
  try {
    // 子串匹配统一忽略英文大小写；regex 条目带 i 标志
    return new RegExp(source, entry.regex ? 'gi' : 'g');
  } catch (e) {
    // 单条正则写错不应让整个词库失效
    return null;
  }
}

/** 把原始词库 JSON 编译为可复用匹配器（带缓存，避免每次调用重复编译） */
export function compileDictionary(dict) {
  if (!dict || typeof dict !== 'object') throw new Error('脱敏词库格式错误');
  if (dict.__museCompiled) return dict; // 已编译，原样返回（防止二次编译清空条目）
  const compile = (list) => (Array.isArray(list) ? list : [])
    .map((entry) => ({ entry, re: buildEntryRegex(entry) }))
    .filter((x) => x.re);
  const compiled = {
    version: String(dict.version || '0.0.0'),
    hardBlock: compile(dict.hardBlock),
    rewrites: compile(dict.rewrites),
    stripParams: compile(dict.stripParams),
  };
  // 不可枚举标记，用于识别"已编译"对象
  Object.defineProperty(compiled, '__museCompiled', { value: true, enumerable: false });
  return compiled;
}

const _compiledCache = new WeakMap();

function getCompiled(dict) {
  if (dict && dict.__museCompiled) return dict; // 已编译
  if (_compiledCache.has(dict)) return _compiledCache.get(dict);
  const compiled = compileDictionary(dict);
  _compiledCache.set(dict, compiled);
  return compiled;
}

function findBlocked(text, compiled) {
  for (const { entry, re } of compiled.hardBlock) {
    re.lastIndex = 0;
    const matched = text.match(re);
    if (matched) {
      return {
        category: entry.category || '高风险',
        reason: entry.reason || '输入包含高风险内容，已阻止生成。',
        matches: Array.from(new Set(matched)).slice(0, 8),
      };
    }
  }
  return null;
}

function applyReplacements(text, list, replacements, defaultCategory) {
  let out = text;
  for (const { entry, re } of list) {
    re.lastIndex = 0;
    const matched = out.match(re);
    if (!matched) continue;
    const count = matched.length;
    const to = entry.to == null ? '' : String(entry.to);
    // 用函数式替换，避免 to 值里出现 $ 符号被当作替换模式
    out = out.replace(re, () => to);
    replacements.push({
      category: entry.category || defaultCategory,
      from: Array.from(new Set(matched)).slice(0, 5).join(' / '),
      to: to || '（已清理）',
      count,
    });
  }
  return out;
}

/**
 * 对一段文本执行脱敏。
 * @returns {{ text: string, replacements: Array, blocked: {category,reason,matches}|null }}
 */
export function applyDesensitize(text, dict) {
  const source = String(text == null ? '' : text);
  const result = { text: source, replacements: [], blocked: null };
  if (!source.trim()) return result;
  const compiled = getCompiled(dict);

  const blocked = findBlocked(source, compiled);
  if (blocked) {
    result.blocked = blocked;
    return result; // 命中硬拦截：不改写、不放行
  }

  result.text = applyReplacements(source, compiled.stripParams, result.replacements, '参数清理');
  result.text = applyReplacements(result.text, compiled.rewrites, result.replacements, '脱敏改写');

  // 轻度清理删除参数后留下的冗余符号
  result.text = result.text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/，\s*，/g, '，')
    .replace(/；\s*；/g, '；')
    .replace(/^\s*[，,；;、]\s*/, '')
    .trim();
  return result;
}

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
