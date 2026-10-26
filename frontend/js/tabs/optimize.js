/**
 * frontend/js/tabs/optimize.js —— 功能5：复制粘贴提示词一键优化适配 Muse
 * 流水线：本地脱敏词库替换 → 区分图片/视频 → 清理其他工具冗余参数 → 重整为 Muse 格式 → 回填表单
 */
import { $, toast, copyText } from '../utils.js';
import { CONFIG } from '../config.js';
import { demoOptimizePrompt } from '../demo.js';
import { apiOptimizePrompt } from '../api.js';
import { runPipeline } from './common.js';
import { parseVideoSegments, applyImageTemplate } from '../templates.js';

const guessType = (text) => (/镜头|运镜|Audio|音频|动作|分镜|视频|帧/.test(text) ? 'video' : 'image');

export function initOptimizeTab() {
  const els = {
    btn: $('#opRun'),
    promptEl: $('#opPrompt'),
    negativeEl: $('#opNegative'),
    logEl: $('#opLog'),
    blockedEl: $('#opBlocked'),
    outputCard: $('#opOutputCard'),
    demoNote: $('#opDemoNote'),
    sampleUsedEl: $('#opSampleUsed'),
  };

  const textarea = $('#opText');
  const counter = $('#opCharCount');
  const updateCounter = () => {
    counter.textContent = `${textarea.value.length} / ${CONFIG.MAX_INPUT_CHARS}`;
    counter.classList.toggle('over', textarea.value.length > CONFIG.MAX_INPUT_CHARS);
  };
  textarea.addEventListener('input', updateCounter);
  updateCounter();

  const getSelectedType = () => {
    const checked = document.querySelector('input[name="opType"]:checked');
    return checked ? checked.value : 'auto';
  };

  els.btn.addEventListener('click', async () => {
    if (!textarea.value.trim()) {
      toast('请先粘贴需要优化的提示词', 'warn');
      return;
    }
    if (textarea.value.length > CONFIG.MAX_INPUT_CHARS) {
      toast(`粘贴内容超过 ${CONFIG.MAX_INPUT_CHARS} 字上限，请精简后再试`, 'warn');
      return;
    }
    const selected = getSelectedType();
    await runPipeline({
      tab: 'optimize',
      fields: { text: textarea.value },
      buildUserText: (f) => f.text,
      demoFn: async (cleaned, samples) =>
        demoOptimizePrompt(cleaned.text, selected === 'auto' ? guessType(cleaned.text) : selected, samples),
      apiFn: (body) => apiOptimizePrompt({ text: body.fields.text, type: selected, samples: body.samples }),
      els,
    });
  });

  // 复制
  $('#opCopyPrompt').addEventListener('click', () => copyText(els.promptEl.textContent, '优化结果已复制'));
  $('#opCopyAll').addEventListener('click', () =>
    copyText(`${els.promptEl.textContent}\n\n负面提示词：${els.negativeEl.textContent}`, '优化结果+负面词已复制'));

  // 回填生成表单（用户可二次编辑）
  $('#opBackfillImage').addEventListener('click', () => {
    if (!els.promptEl.textContent.trim()) {
      toast('请先执行优化', 'warn');
      return;
    }
    const mapped = applyImageTemplate(els.promptEl.textContent);
    $('#igExtra').value = mapped.extra;
    $('#igExtra').dispatchEvent(new Event('input'));
    window.dispatchEvent(new CustomEvent('muse:switch-tab', { detail: { tab: 'image-gen' } }));
    toast('已回填到图片生成表单，可二次编辑', 'success');
  });

  $('#opBackfillVideo').addEventListener('click', () => {
    if (!els.promptEl.textContent.trim()) {
      toast('请先执行优化', 'warn');
      return;
    }
    const m = parseVideoSegments(els.promptEl.textContent);
    $('#vgScene').value = m.scene;
    $('#vgPerson').value = m.person;
    $('#vgAction').value = m.action;
    $('#vgCameraCustom').value = m.camera;
    $('#vgQuality').value = m.quality;
    ['vgScene', 'vgPerson', 'vgAction', 'vgCameraCustom'].forEach((id) => $(`#${id}`).dispatchEvent(new Event('input')));
    window.dispatchEvent(new CustomEvent('muse:switch-tab', { detail: { tab: 'video-gen' } }));
    toast('已回填到视频生成表单，可二次编辑', 'success');
  });
}
