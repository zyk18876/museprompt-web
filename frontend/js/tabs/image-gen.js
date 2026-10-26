/**
 * frontend/js/tabs/image-gen.js —— 功能1：真人感图片提示词生成
 */
import { $, toast, copyText } from '../utils.js';
import { REF_PREFIX_IMAGE } from '../config.js';
import { demoImagePrompt } from '../demo.js';
import { apiImagePrompt } from '../api.js';
import { runPipeline } from './common.js';
import { syncRefPreview } from '../render.js';
import {
  loadUserTemplates, saveUserTemplate, deleteUserTemplate, applyImageTemplate,
} from '../templates.js';

export function initImageGenTab() {
  const els = {
    btn: $('#igGenerate'),
    promptEl: $('#igPrompt'),
    negativeEl: $('#igNegative'),
    logEl: $('#igLog'),
    blockedEl: $('#igBlocked'),
    outputCard: $('#igOutputCard'),
    demoNote: $('#igDemoNote'),
    sampleUsedEl: $('#igSampleUsed'),
    refPreview: $('#igRefPreview'),
  };

  // 参考图开关 → 预览将附加的固定说明句
  const refToggle = $('#igRef');
  const syncRef = () => syncRefPreview(els, refToggle.checked, REF_PREFIX_IMAGE);
  refToggle.addEventListener('change', syncRef);
  syncRef();

  // 生成
  els.btn.addEventListener('click', async () => {
    const fields = {
      appearance: $('#igAppearance').value,
      scene: $('#igScene').value,
      light: $('#igLight').value,
      lightCustom: $('#igLightCustom').value,
      quality: $('#igQuality').value,
      style: $('#igStyle').value,
      extra: $('#igExtra').value,
    };
    await runPipeline({
      tab: 'image-gen',
      fields,
      buildUserText: (f) =>
        [f.appearance, f.scene, f.lightCustom || f.light, f.quality, f.style, f.extra].filter(Boolean).join('，'),
      extra: { useRefImage: refToggle.checked },
      demoFn: async (cleaned, samples) => demoImagePrompt({ ...cleaned, useRefImage: refToggle.checked }, samples),
      apiFn: (body) => apiImagePrompt(body),
      els,
    });
  });

  // 复制：提示词 / 负面词 / 全部
  $('#igCopyPrompt').addEventListener('click', () => copyText(els.promptEl.textContent, '提示词已复制'));
  $('#igCopyNegative').addEventListener('click', () => copyText(els.negativeEl.textContent, '负面词已复制'));
  $('#igCopyAll').addEventListener('click', () =>
    copyText(`${els.promptEl.textContent}\n\n负面提示词：${els.negativeEl.textContent}`, '提示词+负面词已复制'));

  // 自定义模板：保存 / 应用 / 删除
  const tplSelect = $('#igTplSelect');
  const refreshTplSelect = () => {
    const list = loadUserTemplates().filter((t) => t.type === 'image');
    tplSelect.innerHTML = '';
    if (!list.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '（暂无自定义模板）';
      tplSelect.appendChild(opt);
      return;
    }
    list.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      tplSelect.appendChild(opt);
    });
  };
  refreshTplSelect();

  $('#igSaveTpl').addEventListener('click', () => {
    const text = `${els.promptEl.textContent}\n\n负面提示词：${els.negativeEl.textContent}`.trim();
    if (!els.promptEl.textContent.trim()) {
      toast('请先生成提示词', 'warn');
      return;
    }
    const name = window.prompt('模板名称：', `图片模板 ${new Date().toLocaleDateString('zh-CN')}`);
    if (name === null) return;
    saveUserTemplate({ name, type: 'image', text });
    refreshTplSelect();
    toast('已保存为自定义模板', 'success');
  });

  $('#igTplApply').addEventListener('click', () => {
    const tpl = loadUserTemplates().find((t) => t.id === tplSelect.value);
    if (!tpl) {
      toast('请先选择一个模板', 'warn');
      return;
    }
    const mapped = applyImageTemplate(tpl.text);
    $('#igExtra').value = mapped.extra;
    $('#igExtra').dispatchEvent(new Event('input'));
    toast(`已应用模板「${tpl.name}」，可继续编辑`, 'success');
  });

  $('#igTplDelete').addEventListener('click', () => {
    if (!tplSelect.value) {
      toast('请先选择一个模板', 'warn');
      return;
    }
    deleteUserTemplate(tplSelect.value);
    refreshTplSelect();
    toast('模板已删除', 'success');
  });
}
