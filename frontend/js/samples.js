/**
 * frontend/js/samples.js
 * Muse 提示词样本库（MVP：localStorage 本地存储；V1 迁移 Cloudflare KV）。
 * 采集网上实测有效的 Muse 提示词，打标签入库；生成时挑选同分类样本作为
 * Few-shot 示例随请求传给后端（后端替换 System Prompt 的占位符）。
 */
import { CONFIG } from './config.js';
import { storage, uid } from './utils.js';

const LS_KEY = 'muse.samples.v1';

/** 页签 → 优先挑选的样本分类（需求：同分类 3-5 条） */
const TAB_PREFERRED_TAGS = {
  'image-gen': ['人像自拍', '氛围感居家'],
  'video-gen': ['穿搭短片', '产品短片', '氛围感居家'],
  optimize: null, // 优化不限制分类，取最近样本
};

export function loadSamples() {
  const list = storage.get(LS_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function saveSample({ text, tag }) {
  const t = String(text || '').trim();
  if (t.length < 10) throw new Error('样本内容太短（至少 10 个字符）');
  const list = loadSamples();
  const sample = { id: uid(), text: t, tag: tag || CONFIG.SAMPLE_TAGS[0], createdAt: Date.now() };
  list.unshift(sample);
  storage.set(LS_KEY, list);
  return sample;
}

export function deleteSample(id) {
  storage.set(LS_KEY, loadSamples().filter((s) => s.id !== id));
}

export function clearSamples() {
  storage.set(LS_KEY, []);
}

/** 批量导入：按行或 "---" 分隔；自动去重；返回实际入库数量 */
export function importBulkSamples(raw, tag) {
  const items = String(raw || '')
    .split(/\r?\n/)
    .flatMap((line) => line.split(/-{3,}/))
    .map((s) => s.trim())
    .filter((s) => s.length >= 10);
  const existing = new Set(loadSamples().map((s) => s.text));
  const seen = new Set();
  let added = 0;
  const list = loadSamples();
  for (const text of items) {
    if (existing.has(text) || seen.has(text)) continue;
    seen.add(text);
    list.unshift({ id: uid(), text, tag: tag || CONFIG.SAMPLE_TAGS[0], createdAt: Date.now() });
    added += 1;
  }
  if (added > 0) storage.set(LS_KEY, list);
  return added;
}

/** 导出为 JSON 字符串（V1 迁移 KV 时用） */
export function exportSamplesJson() {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), samples: loadSamples() }, null, 2);
}

/**
 * 生成时挑选 Few-shot 样本：先按页签优先分类挑，不足再用最近样本补齐。
 * @param {string} tab image-gen / video-gen / optimize
 * @param {number} limit 默认取 CONFIG.FEW_SHOT_LIMIT
 */
export function pickSamples(tab, limit = CONFIG.FEW_SHOT_LIMIT) {
  const all = loadSamples();
  const preferred = TAB_PREFERRED_TAGS[tab];
  const picked = [];
  const seen = new Set();
  const push = (s) => {
    if (picked.length >= limit || seen.has(s.id)) return;
    picked.push(s);
    seen.add(s.id);
  };
  if (preferred) {
    for (const tag of preferred) {
      for (const s of all) if (s.tag === tag) push(s);
    }
  }
  for (const s of all) push(s);
  return picked.slice(0, limit);
}
