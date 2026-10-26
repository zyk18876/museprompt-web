/**
 * frontend/js/render.js —— 输出结果 / 替换日志 / 拦截提示 的渲染（各页签共用）
 */
import { escapeHtml } from './utils.js';

const CAT_CLASS = {
  氛围: 'vibe', 神态: 'expression', 服饰: 'outfit', 场景: 'scene',
  动作: 'action', 镜头: 'camera', 画质: 'quality', 参数清理: 'param',
  未成年人: 'block', 色情与性暗示: 'block', 暴力与自残: 'block', 违法违规: 'block',
};

const catClass = (c) => CAT_CLASS[c] || 'default';

/** 渲染替换日志；entries: [{source, category, from, to, count}] */
export function renderLog(el, entries) {
  if (!el) return;
  if (!entries || entries.length === 0) {
    el.innerHTML = '<li class="log-empty">本次输入未触发词库替换，输入内容干净</li>';
    return;
  }
  el.innerHTML = entries
    .map(
      (e) => `
    <li class="log-item">
      <span class="log-src">${escapeHtml(e.source || '本地预替换')}</span>
      <span class="log-chip cat-${catClass(e.category)}">${escapeHtml(e.category || '改写')}</span>
      <span class="log-text">「${escapeHtml(e.from)}」→「${escapeHtml(e.to)}」${e.count > 1 ? ` ×${e.count}` : ''}</span>
    </li>`
    )
    .join('');
}

/** 命中硬拦截时展示红色警示块 */
export function showBlocked(els, blocked) {
  if (!els || !els.blockedEl) return;
  const matches = (blocked && blocked.matches) || [];
  els.blockedEl.innerHTML = `
    <div class="blocked-title">⛔ 已阻止生成（${escapeHtml((blocked && blocked.category) || '高风险内容')}）</div>
    <div class="blocked-reason">${escapeHtml((blocked && blocked.reason) || '输入包含高风险内容')}</div>
    ${matches.length ? `<div class="blocked-matches">命中词：${matches.map((m) => `「${escapeHtml(m)}」`).join(' ')}</div>` : ''}`;
  els.blockedEl.hidden = false;
}

export function clearBlocked(els) {
  if (els && els.blockedEl) {
    els.blockedEl.hidden = true;
    els.blockedEl.innerHTML = '';
  }
}

/** 渲染生成结果（图片：主提示词+负面词；视频：完整分段文本+负面词） */
export function renderResult(els, data) {
  if (!els) return;
  if (els.promptEl) els.promptEl.textContent = data.prompt || '';
  if (els.negativeEl) els.negativeEl.textContent = data.negative || '（本次未生成负面词）';
  if (els.outputCard) els.outputCard.classList.add('has-result');
  if (els.demoNote) els.demoNote.hidden = !data.demo;
  if (els.sampleUsedEl) {
    els.sampleUsedEl.textContent = data.usedSamples
      ? `本次携带 ${data.usedSamples} 条 Few-shot 样本`
      : '样本库为空，未携带 Few-shot 样本';
  }
}

/** 按钮忙碌状态（保存原始文案） */
export function setBusy(els, busy, label = '生成中…') {
  if (!els || !els.btn) return;
  if (!els.btn.dataset.label) els.btn.dataset.label = els.btn.textContent;
  els.btn.disabled = busy;
  els.btn.textContent = busy ? label : els.btn.dataset.label;
}

/** 参考图预览（开启开关时展示将附加的固定说明句） */
export function syncRefPreview(els, useRefImage, prefixText) {
  if (!els || !els.refPreview) return;
  els.refPreview.hidden = !useRefImage;
  if (useRefImage) {
    els.refPreview.innerHTML = `<span class="ref-preview-label">将自动附加：</span>${escapeHtml(prefixText)}`;
  }
}
