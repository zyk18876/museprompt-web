/**
 * worker/src/doubao.js
 * 豆包（火山引擎方舟 Ark）多模态 Chat Completions 封装。
 *
 * >>> 需要你填写（二选一或都配）：
 *   1. API 密钥：wrangler secret put DOUBAO_API_KEY   （绝不写进代码/前端）
 *   2. 模型标识：wrangler.toml [vars] DOUBAO_MODEL = "你的推理接入点ID或模型名"
 *      （在火山引擎方舟控制台 → 推理接入点 获取；反推功能需要支持图片输入的视觉模型）
 *
 * 官方文档：https://www.volcengine.com/docs/82379/1298454 （方舟 Ark API）
 */

import { ApiError } from './errors.js';

const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

/**
 * 调用豆包多模态对话接口。
 * @param {object} env Worker 环境变量
 * @param {object} opts
 * @param {string} opts.systemPrompt 系统提示词（已做 Few-shot 占位符替换）
 * @param {string|Array} opts.userContent 用户内容；多模态识图时传
 *        [{type:'text',text:'...'},{type:'image_url',image_url:{url:'...'}}]
 * @param {number} [opts.maxTokens]
 * @param {number} [opts.temperature]
 * @returns {Promise<{content:string, model:string, usage:object|null}>}
 */
export async function chatCompletion(env, {
  systemPrompt,
  userContent,
  maxTokens = 1500,
  temperature = 0.7,
}) {
  const apiKey = env.DOUBAO_API_KEY;
  if (!apiKey) {
    throw new ApiError('CONFIG', '后端未配置豆包 API 密钥（wrangler secret put DOUBAO_API_KEY）', 500);
  }
  const model = env.DOUBAO_MODEL;
  if (!model) {
    throw new ApiError('CONFIG', '后端未配置豆包模型（wrangler.toml [vars] DOUBAO_MODEL）', 500);
  }
  const baseUrl = (env.DOUBAO_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');

  let resp;
  try {
    resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
    });
  } catch (e) {
    throw new ApiError('UPSTREAM', `无法连接豆包 API：${e && e.message ? e.message : e}`, 502);
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new ApiError('UPSTREAM', `豆包 API 返回 ${resp.status}：${detail.slice(0, 300)}`, 502);
  }

  const data = await resp.json().catch(() => null);
  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : '';
  if (!content || !String(content).trim()) {
    throw new ApiError('UPSTREAM', '豆包 API 返回内容为空', 502);
  }
  return { content: String(content).trim(), model, usage: data.usage || null };
}
