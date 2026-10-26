/**
 * worker/src/index.js
 * Muse 提示词 API · MVP（Cloudflare Worker，零第三方依赖）
 *
 * 端点：
 *   GET  /api/health           健康检查 + 词库版本
 *   POST /api/image-prompt     功能1：真人感图片提示词生成
 *   POST /api/video-prompt     功能3：真人感视频提示词生成
 *   POST /api/optimize-prompt  功能5：粘贴提示词一键优化适配 Muse
 *   （V1 新增 /api/image-reverse、/api/video-reverse，伪代码见 v1/backend-pseudocode.md）
 *
 * 安全约定：
 *   - 豆包密钥只存在于 Worker secret（DOUBAO_API_KEY），前端绝不接触；
 *   - 所有接口先过同一套脱敏词库（desensitize.js），LLM 输出再过一次；
 *   - 简易按 IP 限流，防止密钥被滥用。
 */

import { buildSystemPrompt } from './prompts.js';
import { desensitize, DICT_VERSION } from './desensitize.js';
import { chatCompletion } from './doubao.js';
import { ApiError } from './errors.js';

const VERSION = 'mvp-1.0.0';
const MAX_PASTE = 4000;        // 功能5 粘贴文本上限
const MAX_SAMPLES = 5;         // Few-shot 样本上限（需求 3-5 条）
const MAX_SAMPLE_CHARS = 600;  // 单条样本长度上限
const FIELD_MAX = {            // 各表单字段长度上限
  appearance: 800, scene: 500, light: 200, lightCustom: 200, quality: 200,
  style: 200, extra: 800, person: 500, action: 400, camera: 200, cameraCustom: 200,
  ambient: 300, musicStyle: 60, bpm: 10, ambientVolume: 60,
};

// ------------------------------ 基础工具 ------------------------------

function corsHeaders(env, request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
  const allow = allowed.includes('*') || allowed.includes(origin) ? (origin || '*') : 'null';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, status, env, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(env, request) },
  });
}

function clamp(v, max) {
  return String(v == null ? '' : v).slice(0, max);
}

/** 清洗前端传入的 Few-shot 样本（长度/数量截断，过滤空样本） */
function sanitizeSamples(samples) {
  if (!Array.isArray(samples)) return [];
  return samples
    .slice(0, MAX_SAMPLES)
    .map((s) => ({
      text: clamp(s && s.text, MAX_SAMPLE_CHARS).trim(),
      tag: clamp(s && s.tag, 20),
    }))
    .filter((s) => s.text);
}

// ------------------------------ 限流（按 IP，单 isolate 近似） ------------------------------

const RATE = { windowMs: 60 * 1000, max: 30 };
const rateMap = new Map();

function checkRate(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'anon';
  const now = Date.now();
  let rec = rateMap.get(ip);
  if (!rec || now > rec.resetAt) {
    rec = { count: 0, resetAt: now + RATE.windowMs };
    rateMap.set(ip, rec);
  }
  rec.count += 1;
  if (rateMap.size > 5000) rateMap.clear(); // 防止 Map 无限增长
  if (rec.count > RATE.max) {
    throw new ApiError('RATE_LIMITED', '请求过于频繁（每分钟最多 30 次），请稍后再试', 429);
  }
}

// ------------------------------ 输入装配 ------------------------------

function assembleImageUserContent(fields, useRefImage) {
  const f = fields || {};
  const lines = [];
  if (useRefImage) lines.push('【参考图】开启：请在提示词开头固定写参考图说明句');
  else lines.push('【参考图】关闭');
  lines.push(`【人物外貌/穿搭/妆容】${clamp(f.appearance, FIELD_MAX.appearance) || '未填写'}`);
  lines.push(`【场景】${clamp(f.scene, FIELD_MAX.scene) || '未填写'}`);
  if (f.light || f.lightCustom) lines.push(`【光影】${clamp(f.light, FIELD_MAX.light)}${f.lightCustom ? '，' + clamp(f.lightCustom, FIELD_MAX.lightCustom) : ''}`);
  if (f.quality) lines.push(`【画质质感】${clamp(f.quality, FIELD_MAX.quality)}`);
  if (f.style) lines.push(`【风格预设】${clamp(f.style, FIELD_MAX.style)}`);
  if (f.extra) lines.push(`【补充描述】${clamp(f.extra, FIELD_MAX.extra)}`);
  return lines.join('\n');
}

function assembleVideoUserContent(fields, useRefImage) {
  const f = fields || {};
  const lines = [];
  if (useRefImage) lines.push('【参考图】开启：第一行固定写参考图说明句，仅锁人物外观，不锁定视频首帧画面');
  else lines.push('【参考图】关闭');
  lines.push(`【场景】${clamp(f.scene, FIELD_MAX.scene) || '未填写'}`);
  lines.push(`【人物】${clamp(f.person, FIELD_MAX.person) || '未填写'}`);
  lines.push(`【动作】${clamp(f.action, FIELD_MAX.action) || '未填写'}（单镜头只保留1-2个主动作）`);
  if (f.camera || f.cameraCustom) lines.push(`【镜头/运镜】${clamp(f.camera, FIELD_MAX.camera)}${f.cameraCustom ? '，' + clamp(f.cameraCustom, FIELD_MAX.cameraCustom) : ''}`);
  if (f.quality) lines.push(`【画质质感】${clamp(f.quality, FIELD_MAX.quality)}（用语言描述质感，禁止秒数与分辨率数字参数）`);
  const audio = f.audio || {};
  lines.push(
    `【Audio要求】曲风：${clamp(audio.musicStyle, FIELD_MAX.musicStyle) || '不限'}` +
    `；BPM：${clamp(audio.bpm, FIELD_MAX.bpm) || '不限'}` +
    `；环境音效：${clamp(audio.ambient, FIELD_MAX.ambient) || '无'}` +
    `；环境音相对主音乐音量：${clamp(audio.ambientVolume, FIELD_MAX.ambientVolume) || '明显低于主音乐'}` +
    '；必须抑制杂音、爆音、电流声'
  );
  return lines.join('\n');
}

// ------------------------------ 输出解析 ------------------------------

/** 图片结果：拆分主提示词与末尾负面词（规则5：末尾追加负面提示词） */
function splitImageResult(text) {
  const m = text.match(/(?:^|\n)\s*(?:负面提示词|负面词|负面)\s*[：:]\s*([\s\S]*)$/);
  const prompt = (m ? text.slice(0, m.index) : text).replace(/^图片提示词\s*[：:]\s*/, '').trim();
  return { prompt, negative: m ? m[1].trim() : '' };
}

/** 视频结果：全文即 Muse 固定分段格式（含 负面：xxx 段），额外抽出负面词供展示 */
function splitVideoResult(text) {
  const m = text.match(/(?:^|；|;|\n)\s*负面\s*[：:]\s*([\s\S]*)$/);
  return { full: text.trim(), negative: m ? m[1].trim() : '' };
}

/** 功能5：无法从请求判断类型时，用简单启发式猜图片/视频 */
function guessPromptType(text) {
  return /镜头|运镜|Audio|音频|动作|分镜|视频|帧/.test(text) ? 'video' : 'image';
}

// ------------------------------ 三个 MVP 接口 ------------------------------

async function handleImagePrompt(body, env) {
  const fields = body.fields || {};
  const useRefImage = body.useRefImage === true;
  const samples = sanitizeSamples(body.samples);

  const guard = desensitize(assembleImageUserContent(fields, useRefImage));
  if (guard.blocked) throw new ApiError('HARD_BLOCK', guard.blocked.reason, 400, guard.blocked);

  const systemPrompt = buildSystemPrompt('imageGenerate', samples);
  const t0 = Date.now();
  const llm = await chatCompletion(env, { systemPrompt, userContent: guard.text });

  const out = desensitize(llm.content);
  if (out.blocked) throw new ApiError('HARD_BLOCK', `模型输出包含高风险内容，已拦截：${out.blocked.category}`, 400, out.blocked);
  const { prompt, negative } = splitImageResult(out.text);

  return {
    type: 'image',
    prompt,
    negative,
    log: { input: guard.replacements, output: out.replacements },
    usedSamples: samples.length,
    model: llm.model,
    elapsedMs: Date.now() - t0,
  };
}

async function handleVideoPrompt(body, env) {
  const fields = body.fields || {};
  const useRefImage = body.useRefImage === true;
  const samples = sanitizeSamples(body.samples);

  const guard = desensitize(assembleVideoUserContent(fields, useRefImage));
  if (guard.blocked) throw new ApiError('HARD_BLOCK', guard.blocked.reason, 400, guard.blocked);

  const systemPrompt = buildSystemPrompt('videoGenerate', samples);
  const t0 = Date.now();
  const llm = await chatCompletion(env, { systemPrompt, userContent: guard.text });

  const out = desensitize(llm.content);
  if (out.blocked) throw new ApiError('HARD_BLOCK', `模型输出包含高风险内容，已拦截：${out.blocked.category}`, 400, out.blocked);
  const { full, negative } = splitVideoResult(out.text);

  return {
    type: 'video',
    prompt: full,
    negative,
    log: { input: guard.replacements, output: out.replacements },
    usedSamples: samples.length,
    model: llm.model,
    elapsedMs: Date.now() - t0,
  };
}

async function handleOptimizePrompt(body, env) {
  const text = clamp(body.text, MAX_PASTE).trim();
  if (!text) throw new ApiError('BAD_REQUEST', '请粘贴需要优化的提示词', 400);
  const samples = sanitizeSamples(body.samples);

  const guard = desensitize(text);
  if (guard.blocked) throw new ApiError('HARD_BLOCK', guard.blocked.reason, 400, guard.blocked);

  const type = body.type === 'image' || body.type === 'video' ? body.type : guessPromptType(guard.text);
  const systemPrompt = buildSystemPrompt('pasteOptimize', samples);
  const t0 = Date.now();
  const llm = await chatCompletion(env, {
    systemPrompt,
    userContent: `请将以下提示词优化为标准的${type === 'video' ? 'Muse Video 视频' : 'Muse Image 图片'}提示词：\n\n${guard.text}`,
  });

  const out = desensitize(llm.content);
  if (out.blocked) throw new ApiError('HARD_BLOCK', `模型输出包含高风险内容，已拦截：${out.blocked.category}`, 400, out.blocked);
  const parsed = type === 'video' ? splitVideoResult(out.text) : splitImageResult(out.text);

  return {
    type,
    prompt: type === 'video' ? parsed.full : parsed.prompt,
    negative: parsed.negative,
    log: { input: guard.replacements, output: out.replacements },
    usedSamples: samples.length,
    model: llm.model,
    elapsedMs: Date.now() - t0,
  };
}

// ------------------------------ 路由 ------------------------------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, request) });
    }

    if (url.pathname === '/api/health') {
      return json({ ok: true, service: 'muse-prompt-api', version: VERSION, dictVersion: DICT_VERSION }, 200, env, request);
    }

    if (!url.pathname.startsWith('/api/')) {
      return json({ ok: false, error: { code: 'NOT_FOUND', message: 'Not Found' } }, 404, env, request);
    }
    if (request.method !== 'POST') {
      return json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: '请使用 POST' } }, 405, env, request);
    }

    try {
      checkRate(request);
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object') {
        throw new ApiError('BAD_REQUEST', '请求体必须是 JSON', 400);
      }
      let data;
      switch (url.pathname) {
        case '/api/image-prompt':
          data = await handleImagePrompt(body, env);
          break;
        case '/api/video-prompt':
          data = await handleVideoPrompt(body, env);
          break;
        case '/api/optimize-prompt':
          data = await handleOptimizePrompt(body, env);
          break;
        default:
          throw new ApiError('NOT_FOUND', `接口不存在: ${url.pathname}`, 404);
      }
      return json({ ok: true, data }, 200, env, request);
    } catch (err) {
      if (err instanceof ApiError) {
        return json(
          { ok: false, error: { code: err.code, message: err.message, ...(err.extra ? { detail: err.extra } : {}) } },
          err.status,
          env,
          request
        );
      }
      return json({ ok: false, error: { code: 'INTERNAL', message: String((err && err.message) || err) } }, 500, env, request);
    }
  },
};
