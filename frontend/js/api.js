/**
 * frontend/js/api.js —— 调用 Cloudflare Worker 的三个 MVP 接口。
 * 前端只传表单数据与 Few-shot 样本，不接触任何 API 密钥。
 */
import { CONFIG } from './config.js';

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export function isNetworkError(err) {
  if (err instanceof TypeError) return true; // fetch 网络层失败
  return /failed to fetch|networkerror|load failed|network request failed/i.test(String((err && err.message) || ''));
}

async function callApi(path, body, timeoutMs = CONFIG.TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${CONFIG.API_BASE_URL.replace(/\/+$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || json.ok === false) {
      throw new ApiError(
        (json && json.error && json.error.code) || `HTTP_${res.status}`,
        (json && json.error && json.error.message) || `请求失败（HTTP ${res.status}）`,
        res.status
      );
    }
    return json.data;
  } finally {
    clearTimeout(timer);
  }
}

/** 功能1：图片提示词生成 */
export const apiImagePrompt = (body) => callApi('/api/image-prompt', body);

/** 功能3：视频提示词生成 */
export const apiVideoPrompt = (body) => callApi('/api/video-prompt', body);

/** 功能5：粘贴优化 */
export const apiOptimizePrompt = (body) => callApi('/api/optimize-prompt', body);
