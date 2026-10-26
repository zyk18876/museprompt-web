/**
 * frontend/js/templates.js
 * 模板模块：系统内置片段模板（点击插入表单）+ 用户自定义保存模板（localStorage）。
 */
import { storage, uid } from './utils.js';

const LS_KEY = 'muse.userTemplates.v1';

/** 系统内置片段库：key 对应表单字段，点击 chip 即插入对应输入框 */
export const SYSTEM_FRAGMENTS = {
  appearance: [
    { label: '清透氧气妆', text: '清透底妆，浅棕眉毛，杏色眼影，玻璃唇釉，低饱和度妆容' },
    { label: '港风复古妆', text: '哑光底妆，细弯眉，正红唇膏，复古卷发' },
    { label: '韩系水光妆', text: '水光底妆，平眉，粉色腮红，镜面唇釉' },
    { label: '日系清爽', text: '干净短发，清爽眉眼，自然肤色' },
    { label: '法式慵懒', text: '微乱发包，裸粉唇膏，淡扫腮红' },
    { label: '商务干练', text: '低马尾，精致眉眼，豆沙色唇膏' },
    { label: '运动阳光', text: '高马尾，健康肤色，淡淡唇色' },
    { label: '雅痞绅士', text: '利落短发，修剪整齐的胡须，深色西装' },
  ],
  scene: [
    { label: '咖啡馆窗边', text: '午后咖啡馆靠窗位置，木桌与拿铁杯' },
    { label: '城市天台', text: '黄昏城市天台，远处楼群与渐变天空' },
    { label: '居家客厅', text: '温暖居家客厅，米色沙发与落地灯' },
    { label: '林间小径', text: '清晨林间小径，斑驳树影与薄雾' },
    { label: '海边栈桥', text: '午后海边木栈桥，柔和海风' },
    { label: '老城街巷', text: '雨后老城街巷，湿漉石板反光' },
    { label: '美术馆', text: '极简美术馆白墙展厅' },
    { label: '夜间车内', text: '夜间车内，仪表盘微光与窗外霓虹' },
  ],
  action: [
    { label: '缓慢步行', text: '缓慢步行，双臂自然摆动' },
    { label: '转身回头', text: '转身回头，目光迎向镜头' },
    { label: '坐下理衣角', text: '坐下后轻抚面料衣角' },
    { label: '仰望天空', text: '抬头望向天空，深呼吸' },
    { label: '端杯轻抿', text: '端起咖啡杯轻抿一口' },
    { label: '整理围巾', text: '整理围巾后继续前行' },
  ],
  extra: [
    { label: '真实皮肤强调', text: '强调真实皮肤质感与自然过渡，规避CG感与二次元风格' },
    { label: '自然抓拍感', text: '自然抓拍感，轻微动态模糊，生活化瞬间' },
    { label: '浅景深', text: '大光圈浅景深，背景柔和虚化' },
  ],
};

export function loadUserTemplates() {
  const list = storage.get(LS_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function saveUserTemplate({ name, type, text }) {
  const list = loadUserTemplates();
  const tpl = {
    id: uid(),
    name: String(name || '').trim() || `我的模板 ${list.length + 1}`,
    type: type === 'video' ? 'video' : 'image',
    text: String(text || '').trim(),
    createdAt: Date.now(),
  };
  list.unshift(tpl);
  storage.set(LS_KEY, list);
  return tpl;
}

export function deleteUserTemplate(id) {
  storage.set(LS_KEY, loadUserTemplates().filter((t) => t.id !== id));
}

/** 解析 Muse Video 固定分段格式：场景：xxx；人物：xxx；... */
export function parseVideoSegments(text) {
  const segs = { scene: '', person: '', action: '', camera: '', quality: '', audio: '' };
  if (!text) return segs;
  const parts = String(text).split(/[；;]/).map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    const idx = p.search(/[：:]/);
    if (idx < 0) continue;
    const key = p.slice(0, idx).trim();
    const val = p.slice(idx + 1).trim();
    if (key.includes('场景')) segs.scene = val;
    else if (key.includes('人物')) segs.person = val;
    else if (key.includes('动作')) segs.action = val;
    else if (key.includes('镜头') || key.includes('运镜')) segs.camera = val;
    else if (key.includes('画质')) segs.quality = val;
    else if (/audio|音频|音乐/i.test(key)) segs.audio = val;
  }
  return segs;
}

/** 应用视频模板 → 返回逻辑字段映射（由页签负责写入 DOM） */
export function applyVideoTemplate(text) {
  const segs = parseVideoSegments(text);
  const negativeMatch = String(text).match(/(?:^|；|;|\n)\s*负面\s*[：:]\s*([\s\S]*)$/);
  return { ...segs, negative: negativeMatch ? negativeMatch[1].trim() : '' };
}

/** 应用图片模板：正文（去掉负面段）整体放入"补充描述" */
export function applyImageTemplate(text) {
  const body = String(text)
    .replace(/(?:^|\n)\s*(?:负面提示词|负面词|负面)\s*[：:][\s\S]*$/, '')
    .trim();
  return { extra: body };
}
