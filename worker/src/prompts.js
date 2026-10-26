/**
 * worker/src/prompts.js
 * 5 套 Muse System Prompt 封装 + {{DYNAMIC_FEW_SHOT_SAMPLES}} 动态占位处理。
 *
 * ---------------------------------------------------------------------------
 * 关于 {{DYNAMIC_FEW_SHOT_SAMPLES}} 占位符（重要）
 * ---------------------------------------------------------------------------
 * 每套 System Prompt 模板里都留有一个占位符：
 *
 *     {{DYNAMIC_FEW_SHOT_SAMPLES}}
 *
 * 它会被替换成"同分类 Few-shot 样本块"（从 Muse 提示词样本库里筛出的 3-5 条
 * 实测有效样本，用于让大模型模仿博主的句式、Audio 写法与镜头描述）。
 *
 * 替换规则（buildSystemPrompt）：
 *   1. samples 为空数组 / 未传  → 占位符替换为空字符串（无样本则置空）；
 *   2. samples 非空             → 替换为 formatFewShotSamples() 生成的样本块；
 *   3. 模板里万一没有占位符     → 样本块追加到模板末尾（兜底，保证不丢样本）。
 *
 * MVP 阶段：样本库在浏览器 localStorage，由前端挑选后随请求体 samples 字段传入，
 *           本文件只负责"占位符替换"这一层（无样本则填空）。
 * V1 阶段 ：样本库迁移 Cloudflare KV，由后端按分类拉取后调用同一个
 *           buildSystemPrompt()，伪代码见 v1/backend-pseudocode.md 第 6 节。
 * ---------------------------------------------------------------------------
 */

export const FEW_SHOT_PLACEHOLDER = '{{DYNAMIC_FEW_SHOT_SAMPLES}}';
export const FEW_SHOT_MAX = 5; // 样本库里最多携带几条（需求：3-5 条）

/** System-1：真人感图片提示词生成 */
export const PROMPT_IMAGE_GENERATE = `你是Meta Muse Image专用提示词生成专家，专门生成真人向图片提示词。
规则：
1、只输出可以直接复制粘贴给Muse Image使用的提示词，禁止输出markdown、解释、说明文字。
2、如果开启参考图，开头固定写：@图片1为人物参考图，锁定五官、发型、服装与饰品保持统一，仅作为人物外观参考。
3、优先使用连贯自然的描述句子，不要大量逗号分割标签；侧重真人皮肤质感、自然光，规避过度CG二次元质感。
4、遇到容易触发平台审核的氛围感词汇，不要直接删除，改写为客观神态、光影、镜头描述。
5、末尾追加适配Muse图片的负面提示词。

${FEW_SHOT_PLACEHOLDER}

用户输入会包含人物、场景、光影、风格信息，你输出完整Muse Image图片提示词。`;

/** System-2：真人感图片提示词反推（多模态识图使用，V1） */
export const PROMPT_IMAGE_REVERSE = `你是Meta Muse Image图片反推解析专家，你接收一张图片，输出适配Muse Image的提示词。
规则：
1、只输出可直接复制进Muse Image的提示文本，不要多余分析、不要markdown。
2、解析内容：人物外貌穿搭妆容、场景环境、光线色调、构图、画面质感。
3、检测到容易触发审核的画面特征，进行同义客观改写，不删除有效画面信息。
4、禁止输出逗号堆砌tag，使用自然段落；最后追加Muse图片专用负面词。
5、如果图里人物适合参考图模式，开头加上参考图说明语句。

${FEW_SHOT_PLACEHOLDER}

只输出最终提示词结果。`;

/** System-3：真人感视频提示词生成 */
export const PROMPT_VIDEO_GENERATE = `你是Meta Muse Video视频提示词专家，专注真人向短视频生成。
硬性规则（必须严格遵守）：
1、输出是给Muse Video直接复制使用的文本，禁止markdown、禁止额外解释。
2、如果使用参考图，第一行固定：@图片1为人物参考图，锁定五官、发型、服装与饰品保持统一。仅作为人物外观参考，不锁定视频首帧画面。
3、格式分段：场景：xxx；人物：xxx；动作：xxx；镜头：xxx；画质：xxx；Audio：xxx；负面：xxx
4、动作限制：单镜头尽量只写1-2个主要动作，不要堆砌大量动作，Muse动作过多容易崩坏。
5、Audio模块非常关键：音乐写曲风BPM；环境音效音量必须低于主音乐；禁止描述随机杂音、电流爆音。
6、不要写8s、720p这类数字参数，用语言描述画质质感。
7、高危氛围感词汇：不要直接删除，改写为客观神态、视线、呼吸、光影描述。

${FEW_SHOT_PLACEHOLDER}

接收用户输入的表单信息，输出完整Muse Video提示词。`;

/** System-4：真人感视频提示词反推（接收多张视频抽帧关键帧，V1） */
export const PROMPT_VIDEO_REVERSE = `你是Meta Muse Video视频反推解析专家，接收视频抽取出的多张关键帧图片。
你的任务：解析整套视频，输出适配Muse Video的完整提示词。
硬性规则：
1、只输出可直接复制粘贴给Muse Video使用的文本，不要分析、不要markdown。
2、输出固定分段格式：参考图说明（适合时）、场景：xxx；人物：xxx；动作：xxx；镜头：xxx；画质：xxx；Audio：xxx；负面：xxx
3、从多张帧提取：人物、场景、镜头运镜方式、动作时序、光影、画面颗粒噪点；推测合适的音乐、环境音效写进Audio块；Audio环境声必须要求低于主音乐，抑制杂音爆音。
4、动作不要堆砌，识别主动作即可；高危画面特征做客观同义改写。
5、禁止输出大量逗号标签，使用Muse偏好的段落描述。

${FEW_SHOT_PLACEHOLDER}

只输出最终Muse Video提示词。`;

/** System-5：粘贴外部提示词一键优化适配 Muse */
export const PROMPT_PASTE_OPTIMIZE = `你的任务：接收用户粘贴来的来自其他AI工具、博主、社群的原始提示词，优化改写为标准Muse格式。
规则：
1、区分是图片还是视频提示词，使用对应Muse输出格式。
2、执行：高危词汇同义客观改写；删除Pika/可灵专属标签、帧率、秒数等Muse不吃的参数。
3、整理为固定分段格式，保留全部有效画面信息，不篡改创作意图。
4、不要增加不存在的画面内容，只做格式重整、脱敏改写、适配Muse语法。
5、输出结果不要多余解释，输出干净的Muse提示词文本。

${FEW_SHOT_PLACEHOLDER}`;

/** 5 套 Prompt 注册表：对外只暴露 kind，内部维护模板 */
export const SYSTEM_PROMPTS = Object.freeze({
  imageGenerate: PROMPT_IMAGE_GENERATE,
  imageReverse: PROMPT_IMAGE_REVERSE,
  videoGenerate: PROMPT_VIDEO_GENERATE,
  videoReverse: PROMPT_VIDEO_REVERSE,
  pasteOptimize: PROMPT_PASTE_OPTIMIZE,
});

/**
 * 把 Few-shot 样本数组格式化为可注入 System Prompt 的文本块。
 * @param {Array<{text:string, tag?:string}>} samples
 * @returns {string} 无样本时返回空字符串（占位符将被置空）
 */
export function formatFewShotSamples(samples = []) {
  if (!Array.isArray(samples) || samples.length === 0) return '';
  const picked = samples.slice(0, FEW_SHOT_MAX);
  const lines = picked.map((s, i) => {
    const tag = s && s.tag ? `【分类：${s.tag}】` : '';
    const text = String((s && s.text) || '').trim();
    return `示例${i + 1}${tag}\n提示词：${text}`;
  });
  return [
    '【Few-shot 参考样本：以下为实测有效的 Muse 提示词，模仿其句式、Audio 写法与镜头描述风格，不要照抄其画面内容】',
    ...lines,
  ].join('\n\n');
}

/**
 * 核心：按 kind 取模板，替换 {{DYNAMIC_FEW_SHOT_SAMPLES}} 占位符。
 * @param {keyof typeof SYSTEM_PROMPTS} kind
 * @param {Array<{text:string, tag?:string}>} samples 前端传入（MVP）/ KV 拉取（V1）
 * @returns {string} 最终 System Prompt
 */
export function buildSystemPrompt(kind, samples = []) {
  const tpl = SYSTEM_PROMPTS[kind];
  if (!tpl) throw new Error(`未知的 Prompt 类型: ${kind}`);
  const block = formatFewShotSamples(samples);
  if (!tpl.includes(FEW_SHOT_PLACEHOLDER)) {
    // 兜底：模板没有占位符时，样本块追加到末尾
    return block ? `${tpl}\n\n${block}` : tpl;
  }
  // split+join 全量替换（避免 replace 字符串模式下 $ 符号被当作替换Pattern）
  return tpl.split(FEW_SHOT_PLACEHOLDER).join(block);
}
