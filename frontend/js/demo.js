/**
 * frontend/js/demo.js
 * 演示模式：不调用任何后端/大模型，用本地模板拼装"看起来像 Muse 输出"的结果，
 * 方便在部署 Worker 前完整预览 UI 与交互逻辑。上线后 DEMO_MODE=false 即走真实 API。
 */
import { DEFAULT_NEGATIVE_IMAGE, DEFAULT_NEGATIVE_VIDEO } from './config.js';
import { sleep } from './utils.js';

const pick = (v, fallback) => (v && String(v).trim() ? String(v).trim() : fallback);

/** 功能1 演示：拼一段真人感图片提示词 + 负面词 */
export async function demoImagePrompt(fields, samples) {
  await sleep(400 + Math.random() * 500);
  const ref = fields.useRefImage
    ? '@图片1为人物参考图，锁定五官、发型、服装与饰品保持统一，仅作为人物外观参考。\n'
    : '';
  const prompt =
    ref +
    `一位${pick(fields.appearance, '气质温婉的成年女性')}，身处${pick(fields.scene, '午后咖啡馆靠窗位置')}，` +
    `${pick(fields.light, '柔和自然日光')}，${pick(fields.quality, '真实皮肤质感，可见细微毛孔与纹理')}，` +
    `${pick(fields.style, '日系清新')}风格。` +
    `${fields.extra ? fields.extra + '。' : ''}` +
    '画面强调真实皮肤质感与自然过渡，避免过度CG感与二次元质感。';
  return {
    type: 'image',
    prompt,
    negative: DEFAULT_NEGATIVE_IMAGE,
    log: { input: [], output: [] },
    usedSamples: Array.isArray(samples) ? samples.length : 0,
    model: 'demo-local',
    elapsedMs: 0,
    demo: true,
  };
}

/** 功能3 演示：拼 Muse Video 固定分段格式 */
export async function demoVideoPrompt(fields, samples) {
  await sleep(400 + Math.random() * 500);
  const ref = fields.useRefImage
    ? '@图片1为人物参考图，锁定五官、发型、服装与饰品保持统一。仅作为人物外观参考，不锁定视频首帧画面。\n'
    : '';
  const audio = fields.audio || {};
  const full =
    ref +
    `场景：${pick(fields.scene, '黄昏城市天台')}；` +
    `人物：${pick(fields.person, '25岁女性，简约通勤穿搭')}；` +
    `动作：${pick(fields.action, '缓慢步行，双臂自然摆动')}；` +
    `镜头：${pick(fields.camera, '固定机位，人物自然表演')}；` +
    `画质：${pick(fields.quality, '电影级清晰质感，自然景深，胶片颗粒')}；` +
    `Audio：主音乐为${pick(audio.musicStyle, 'Lo-fi')}，BPM ${pick(audio.bpm, '85')}，为主音量；` +
    `环境音为${pick(audio.ambient || '轻微风声', '轻微风声')}，音量明显低于主音乐；已抑制杂音、爆音与电流声；` +
    `负面：${DEFAULT_NEGATIVE_VIDEO}`;
  return {
    type: 'video',
    prompt: full,
    negative: DEFAULT_NEGATIVE_VIDEO,
    log: { input: [], output: [] },
    usedSamples: Array.isArray(samples) ? samples.length : 0,
    model: 'demo-local',
    elapsedMs: 0,
    demo: true,
  };
}

/** 功能5 演示：把清理后的文本整理为 Muse 格式 */
export async function demoOptimizePrompt(text, type, samples) {
  await sleep(400 + Math.random() * 500);
  const cleaned = String(text || '').trim();
  if (type === 'video') {
    const segs = {
      scene: cleaned.slice(0, 60),
      person: cleaned.slice(60, 120) || '见场景描述',
      action: cleaned.slice(120, 180) || '自然动作',
      camera: '固定机位',
      quality: '电影级清晰质感',
    };
    const full =
      `场景：${segs.scene}；人物：${segs.person}；动作：${segs.action}；镜头：${segs.camera}；画质：${segs.quality}；` +
      `Audio：主音乐为氛围电子，BPM 95；环境音音量明显低于主音乐，抑制杂音爆音；负面：${DEFAULT_NEGATIVE_VIDEO}`;
    return { type: 'video', prompt: full, negative: DEFAULT_NEGATIVE_VIDEO, log: { input: [], output: [] }, usedSamples: 0, model: 'demo-local', elapsedMs: 0, demo: true };
  }
  return {
    type: 'image',
    prompt: cleaned,
    negative: DEFAULT_NEGATIVE_IMAGE,
    log: { input: [], output: [] },
    usedSamples: 0,
    model: 'demo-local',
    elapsedMs: 0,
    demo: true,
  };
}
