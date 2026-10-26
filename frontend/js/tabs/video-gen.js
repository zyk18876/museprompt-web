/**
 * frontend/js/tabs/video-gen.js —— 功能3：真人感视频提示词生成（含 Audio 控制面板）
 */
import { $, toast, copyText } from '../utils.js';
import { REF_PREFIX_VIDEO } from '../config.js';
import { demoVideoPrompt } from '../demo.js';
import { apiVideoPrompt } from '../api.js';
import { runPipeline } from './common.js';
import { syncRefPreview } from '../render.js';
import {
  loadUserTemplates, saveUserTemplate, deleteUserTemplate, applyVideoTemplate,
} from '../templates.js';

/** 动作数量软提醒：单镜头建议 1-2 个主动作，Muse 动作过多容易崩坏 */
function checkActionCount() {
  const raw = $('#vgAction').value.trim();
  if (!raw) {
    $('#vgActionWarn').hidden = true;
    return;
  }
  const clauses = raw.split(/[，,。；;、\s]+/).filter(Boolean).length;
  const warn = $('#vgActionWarn');
  warn.hidden = clauses <= 2;
  warn.textContent = `检测到约 ${clauses} 个动作片段：单镜头建议只写 1-2 个主动作，动作堆砌容易导致画面崩坏`;
}

export function initVideoGenTab() {
  const els = {
    btn: $('#vgGenerate'),
    promptEl: $('#vgPrompt'),
    negativeEl: $('#vgNegative'),
    logEl: $('#vgLog'),
    blockedEl: $('#vgBlocked'),
    outputCard: $('#vgOutputCard'),
    demoNote: $('#vgDemoNote'),
    sampleUsedEl: $('#vgSampleUsed'),
    refPreview: $('#vgRefPreview'),
  };

  const refToggle = $('#vgRef');
  const syncRef = () => syncRefPreview(els, refToggle.checked, REF_PREFIX_VIDEO);
  refToggle.addEventListener('change', syncRef);
  syncRef();

  $('#vgAction').addEventListener('input', checkActionCount);

  els.btn.addEventListener('click', async () => {
    const fields = {
      scene: $('#vgScene').value,
      person: $('#vgPerson').value,
      action: $('#vgAction').value,
      camera: $('#vgCamera').value,
      cameraCustom: $('#vgCameraCustom').value,
      quality: $('#vgQuality').value,
      musicStyle: $('#vgMusicStyle').value,
      bpm: $('#vgBpm').value,
      ambient: $('#vgAmbient').value,
      ambientVolume: $('#vgAmbientVolume').value,
    };
    const audio = {
      musicStyle: fields.musicStyle,
      bpm: fields.bpm,
      ambient: fields.ambient,
      ambientVolume: fields.ambientVolume,
    };
    await runPipeline({
      tab: 'video-gen',
      fields,
      buildUserText: (f) =>
        [f.scene, f.person, f.action, f.cameraCustom || f.camera, f.quality, f.ambient].filter(Boolean).join('，'),
      extra: { useRefImage: refToggle.checked },
      demoFn: async (cleaned, samples) =>
        demoVideoPrompt(
          {
            ...cleaned,
            camera: cleaned.camera || cleaned.cameraCustom,
            audio: {
              musicStyle: cleaned.musicStyle,
              bpm: cleaned.bpm,
              ambient: cleaned.ambient,
              ambientVolume: cleaned.ambientVolume,
            },
            useRefImage: refToggle.checked,
          },
          samples
        ),
      apiFn: (body) =>
        apiVideoPrompt({ useRefImage: refToggle.checked, fields: { ...body.fields, audio }, samples: body.samples }),
      els,
    });
  });

  $('#vgCopyPrompt').addEventListener('click', () => copyText(els.promptEl.textContent, '完整视频提示词已复制'));
  $('#vgCopyNegative').addEventListener('click', () => copyText(els.negativeEl.textContent, '负面词已复制'));

  // 自定义模板
  const tplSelect = $('#vgTplSelect');
  const refreshTplSelect = () => {
    const list = loadUserTemplates().filter((t) => t.type === 'video');
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

  $('#vgSaveTpl').addEventListener('click', () => {
    if (!els.promptEl.textContent.trim()) {
      toast('请先生成提示词', 'warn');
      return;
    }
    const name = window.prompt('模板名称：', `视频模板 ${new Date().toLocaleDateString('zh-CN')}`);
    if (name === null) return;
    saveUserTemplate({ name, type: 'video', text: els.promptEl.textContent });
    refreshTplSelect();
    toast('已保存为自定义模板', 'success');
  });

  $('#vgTplApply').addEventListener('click', () => {
    const tpl = loadUserTemplates().find((t) => t.id === tplSelect.value);
    if (!tpl) {
      toast('请先选择一个模板', 'warn');
      return;
    }
    const m = applyVideoTemplate(tpl.text);
    $('#vgScene').value = m.scene;
    $('#vgPerson').value = m.person;
    $('#vgAction').value = m.action;
    $('#vgCamera').value = '';
    $('#vgCameraCustom').value = m.camera;
    $('#vgQuality').value = m.quality;
    ['vgScene', 'vgPerson', 'vgAction', 'vgCameraCustom'].forEach((id) => $(`#${id}`).dispatchEvent(new Event('input')));
    checkActionCount();
    toast(`已应用模板「${tpl.name}」，可继续编辑`, 'success');
  });

  $('#vgTplDelete').addEventListener('click', () => {
    if (!tplSelect.value) {
      toast('请先选择一个模板', 'warn');
      return;
    }
    deleteUserTemplate(tplSelect.value);
    refreshTplSelect();
    toast('模板已删除', 'success');
  });
}
