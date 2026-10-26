/**
 * frontend/js/tabs/samples.js —— 附加功能：Muse 提示词样本库管理（localStorage）
 * 收集网上实测有效的 Muse 提示词，打标签入库；生成时按分类挑 3-5 条作 Few-shot。
 * V1 迁移 Cloudflare KV（见 v1/backend-pseudocode.md 第 6 节）。
 */
import { $, toast, copyText, escapeHtml } from '../utils.js';
import { CONFIG } from '../config.js';
import {
  loadSamples, saveSample, deleteSample, clearSamples, importBulkSamples, exportSamplesJson,
} from '../samples.js';

const TAG_CLASS = { 人像自拍: 'tag-a', 穿搭短片: 'tag-b', 氛围感居家: 'tag-c', 产品短片: 'tag-d' };

function renderList() {
  const listEl = $('#spList');
  const filter = $('#spFilter').value;
  const all = loadSamples();
  const list = filter === '__all' ? all : all.filter((s) => s.tag === filter);
  $('#spCount').textContent = `共 ${all.length} 条${filter !== '__all' ? `（筛选出 ${list.length} 条）` : ''}`;

  if (!list.length) {
    listEl.innerHTML = '<li class="empty-state">样本库为空。粘贴实测有效的 Muse 提示词，打上分类标签即可开始积累 Few-shot 素材。</li>';
    return;
  }
  listEl.innerHTML = list
    .map(
      (s) => `
    <li class="sample-card" data-id="${s.id}">
      <div class="sample-text">${escapeHtml(s.text)}</div>
      <div class="sample-meta">
        <span class="tag-chip ${TAG_CLASS[s.tag] || ''}">${escapeHtml(s.tag)}</span>
        <span class="sample-date">${new Date(s.createdAt).toLocaleString('zh-CN')}</span>
        <span class="sample-actions">
          <button class="btn sm ghost" data-act="copy">复制</button>
          <button class="btn sm danger" data-act="del">删除</button>
        </span>
      </div>
    </li>`
    )
    .join('');
}

export function initSamplesTab() {
  const tagOptions = CONFIG.SAMPLE_TAGS.map((t) => `<option value="${t}">${t}</option>`).join('');
  $('#spTag').innerHTML = tagOptions;
  $('#spBulkTag').innerHTML = tagOptions;
  $('#spFilter').innerHTML = `<option value="__all">全部分类</option>${tagOptions}`;

  renderList();
  $('#spFilter').addEventListener('change', renderList);

  // 单条新增
  $('#spAdd').addEventListener('click', () => {
    const text = $('#spText').value;
    try {
      saveSample({ text, tag: $('#spTag').value });
      $('#spText').value = '';
      renderList();
      toast('样本已保存', 'success');
    } catch (e) {
      toast(e.message, 'warn');
    }
  });

  // 批量导入（按行 / --- 分隔）
  $('#spBulkImport').addEventListener('click', () => {
    const raw = $('#spBulk').value;
    if (!raw.trim()) {
      toast('请先粘贴要导入的提示词', 'warn');
      return;
    }
    const added = importBulkSamples(raw, $('#spBulkTag').value);
    $('#spBulk').value = '';
    renderList();
    toast(added > 0 ? `成功导入 ${added} 条样本` : '没有可导入的新样本（可能都已存在）', added > 0 ? 'success' : 'warn');
  });

  // 列表操作：复制 / 删除
  $('#spList').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.sample-card').dataset.id;
    const sample = loadSamples().find((s) => s.id === id);
    if (btn.dataset.act === 'copy') {
      copyText(sample.text, '样本已复制');
    } else if (btn.dataset.act === 'del') {
      deleteSample(id);
      renderList();
      toast('样本已删除', 'success');
    }
  });

  // 导出（V1 迁移 KV 用）
  $('#spExport').addEventListener('click', () => {
    const json = exportSamplesJson();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `muse-samples-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('样本库已导出为 JSON', 'success');
  });

  // 清空（二次确认）
  $('#spClear').addEventListener('click', () => {
    if (!loadSamples().length) {
      toast('样本库已经是空的', 'warn');
      return;
    }
    if (window.confirm('确定清空全部样本？此操作不可恢复（建议先导出备份）。')) {
      clearSamples();
      renderList();
      toast('样本库已清空', 'success');
    }
  });
}
