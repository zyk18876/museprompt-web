/**
 * frontend/js/config.js
 * 全站配置：接口地址、演示模式、免责声明、内置默认值。
 * >>> 部署前必改：API_BASE_URL（改成你 Worker 的地址），DEMO_MODE 改 false。
 */

export const CONFIG = {
  // >>> 需要你填写：部署 Worker 后，把这里改成 https://muse-prompt-api.<你的子域>.workers.dev
  API_BASE_URL: 'https://muse-prompt-api.example.workers.dev',

  // 演示模式：true = 不调后端，用本地假数据跑通全部 UI（方便先预览/评审）；
  // 上线并部署 Worker 后改为 false（也可在页面右上角实时切换，选择会记住）。
  DEMO_MODE: false,

  TIMEOUT_MS: 90000,
  MAX_INPUT_CHARS: 4000,     // 功能5 粘贴上限
  FEW_SHOT_LIMIT: 4,         // 每次生成携带的 Few-shot 样本数（需求 3-5 条）
  SAMPLE_TAGS: ['人像自拍', '穿搭短片', '氛围感居家', '产品短片'],
  VERSION: 'mvp-1.0.0',
};

/** 参考图说明句（与 System-1 / System-3 规则保持一致，仅用于前端预览提示） */
export const REF_PREFIX_IMAGE = '@图片1为人物参考图，锁定五官、发型、服装与饰品保持统一，仅作为人物外观参考。';
export const REF_PREFIX_VIDEO = '@图片1为人物参考图，锁定五官、发型、服装与饰品保持统一。仅作为人物外观参考，不锁定视频首帧画面。';

/** Muse 负面词兜底默认值（演示模式 / 模型未输出负面词时展示） */
export const DEFAULT_NEGATIVE_IMAGE = '低画质, 模糊, 面部畸变, 多余手指, 肢体畸变, 过度CG感, 二次元, 卡通渲染, 塑料皮肤质感, 过曝, 死白高光, 脏噪点';
export const DEFAULT_NEGATIVE_VIDEO = '画面崩坏, 人物形变, 动作僵硬, 面部扭曲, 闪烁抖动, 过度CG感, 二次元, 塑料皮肤, 杂音, 爆音, 电流声';

/** 免责声明：横幅（短）+ 全文（弹窗/页脚） */
export const DISCLAIMER = {
  banner:
    '本工具为第三方独立开发的提示词辅助工具，与 Meta 及其 Muse 产品无任何官方合作、从属或关联关系；仅输出提示词文本，不调用 Muse 生成视频、不托管 Muse 账号。使用前请阅读完整免责声明。',
  full: `【免责声明】

一、本工具（MusePrompt · 真人向提示词工坊）为第三方独立开发的提示词辅助工具，与 Meta 公司及其 Muse 产品（Muse Image / Muse Video）无任何官方合作、从属或关联关系，亦未获得 Meta 任何形式的授权或认可。

二、本工具仅输出提示词文本，不调用 Muse 生成任何图片或视频，不托管 Muse 账号，不提供任何 Muse 账号、邀请码及相关服务。

三、所有生成的提示词由用户自行获取和使用。用户应自行遵守 Meta 服务条款与使用政策，以及所在国家或地区的法律法规，并对使用行为及产生的一切后果自行承担责任。

四、本工具不对生成内容的准确性、可用性、合规性作任何明示或默示的担保。提示词在 Muse 中的实际效果受平台规则、模型版本等多种因素影响。

五、用户不得利用本工具生成涉及未成年人、暴力、违法、侵权或违反公序良俗的内容。工具内置脱敏词库进行前置筛查，但无法保证完全有效，用户仍需自行审核输出内容。

六、本站不存储用户上传的参考图与素材（MVP 阶段素材仅在浏览器本地处理）；样本库数据保存在浏览器 localStorage 中，清除浏览器数据会导致样本丢失。

若您不同意以上任何条款，请立即停止使用本工具。`,
};

// ---------------- 演示 / 在线模式（运行时切换，记住选择） ----------------

function resolveInitialMode() {
  try {
    const v = localStorage.getItem('muse.mode');
    if (v === 'demo' || v === 'online') return v === 'demo';
  } catch (e) { /* localStorage 不可用时退回配置默认值 */ }
  return CONFIG.DEMO_MODE;
}

let demoMode = resolveInitialMode();

export function isDemoMode() {
  return demoMode;
}

export function setDemoMode(v) {
  demoMode = !!v;
  try {
    localStorage.setItem('muse.mode', demoMode ? 'demo' : 'online');
  } catch (e) { /* ignore */ }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('muse:mode', { detail: { demo: demoMode } }));
  }
}
