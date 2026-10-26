/**
 * frontend/js/tabs/common.js
 * 生成类页签共用流水线：
 *   1) 本地脱敏词库预替换（即时显示替换日志，命中硬拦截直接阻止）
 *   2) 挑选 Few-shot 样本（localStorage 样本库）
 *   3) 调用 Worker API；演示模式 / 网络失败时自动降级为本地演示数据
 *   4) 渲染结果 + 合并本地/后端替换日志
 */
import { CONFIG, isDemoMode, setDemoMode } from '../config.js';
import { getDictionary, applyDesensitize } from '../desensitize.js';
import { pickSamples } from '../samples.js';
import { ApiError, isNetworkError } from '../api.js';
import { toast, sleep } from '../utils.js';
import { renderResult, renderLog, showBlocked, clearBlocked, setBusy } from '../render.js';

/**
 * @param {object} o
 * @param {string} o.tab image-gen / video-gen / optimize
 * @param {object} o.fields 表单字段（string 值会被本地脱敏清洗）
 * @param {(f:object)=>string} o.buildUserText 组装纯文本（仅用于本地日志）
 * @param {(cleaned:object, samples:array)=>Promise<object>} o.demoFn 演示数据生成器
 * @param {(body:object)=>Promise<object>} o.apiFn 真实接口
 * @param {object} o.els { btn, promptEl, negativeEl, logEl, blockedEl, outputCard, demoNote, sampleUsedEl }
 * @param {object} [o.extra] 附加到请求体的字段（如 useRefImage）
 * @returns {Promise<object|null>} 生成结果数据
 */
export async function runPipeline({ tab, fields, buildUserText, demoFn, apiFn, els, extra = {} }) {
  const dict = getDictionary();
  if (!dict) {
    toast('脱敏词库尚未加载完成，请稍候再试', 'warn');
    return null;
  }

  // 1) 本地预脱敏（逐字段；命中硬拦截 → 红色警示，不发请求）
  const cleaned = {};
  const localReplacements = [];
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v !== 'string') {
      cleaned[k] = v;
      continue;
    }
    const r = applyDesensitize(v, dict);
    if (r.blocked) {
      showBlocked(els, r.blocked);
      toast(`输入包含高风险内容（${r.blocked.category}），已阻止生成`, 'error', 5000);
      return null;
    }
    cleaned[k] = r.text;
    r.replacements.forEach((x) => localReplacements.push({ ...x, source: '本地预替换' }));
  }
  // 拼接文本再整体过一次（兜底，防跨字段组合出新词）
  const whole = applyDesensitize(buildUserText(cleaned), dict);
  if (whole.blocked) {
    showBlocked(els, whole.blocked);
    toast(`输入包含高风险内容（${whole.blocked.category}），已阻止生成`, 'error', 5000);
    return null;
  }
  whole.replacements.forEach((x) => {
    if (!localReplacements.some((e) => e.from === x.from && e.to === x.to)) {
      localReplacements.push({ ...x, source: '本地预替换' });
    }
  });

  // 2) 挑选 Few-shot 样本
  const samples = pickSamples(tab, CONFIG.FEW_SHOT_LIMIT);

  // 3) 调用（在线 / 演示 / 自动降级）
  setBusy(els, true);
  try {
    let data;
    if (isDemoMode()) {
      await sleep(300);
      data = await demoFn(cleaned, samples);
      data = { ...data, log: { input: localReplacements, output: [] } };
    } else {
      try {
        data = await apiFn({ ...extra, fields: cleaned, samples });
      } catch (err) {
        if (isNetworkError(err)) {
          setDemoMode(true);
          toast('无法连接后端，已自动切换为演示模式（可在右上角切回）', 'warn', 5000);
          await sleep(200);
          data = await demoFn(cleaned, samples);
          data = { ...data, log: { input: localReplacements, output: [] } };
        } else {
          throw err;
        }
      }
    }

    // 4) 渲染
    clearBlocked(els);
    renderResult(els, data);
    const merged = [
      ...localReplacements,
      ...(data.log && Array.isArray(data.log.input) ? data.log.input.map((x) => ({ ...x, source: '后端输入复核' })) : []),
      ...(data.log && Array.isArray(data.log.output) ? data.log.output.map((x) => ({ ...x, source: '输出复核' })) : []),
    ];
    renderLog(els.logEl, merged);
    return data;
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === 'HARD_BLOCK') {
        const detail = err.detail || {};
        showBlocked(els, { category: detail.category || '高风险内容', reason: err.message, matches: detail.matches || [] });
      } else if (err.code === 'CONFIG') {
        setDemoMode(true);
        toast('后端未配置豆包密钥，已切换演示模式', 'warn', 5000);
      } else if (err.code === 'RATE_LIMITED') {
        toast(err.message, 'warn', 5000);
      } else {
        toast(`生成失败：${err.message}`, 'error', 5000);
      }
    } else {
      toast(`生成失败：${err && err.message ? err.message : err}`, 'error', 5000);
    }
    return null;
  } finally {
    setBusy(els, false);
  }
}
