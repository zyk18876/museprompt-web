/** frontend/js/utils.js —— DOM / 复制 / 提示 / 存储 等基础工具 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 轻提示 */
export function toast(message, type = 'info', duration = 3200) {
  const wrap = $('#toastWrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/** 一键复制（带降级：navigator.clipboard 不可用时用 textarea） */
export async function copyText(text, okMessage = '已复制到剪贴板') {
  const str = String(text == null ? '' : text);
  if (!str.trim()) {
    toast('没有可复制的内容', 'warn');
    return false;
  }
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(str);
      ok = true;
    }
  } catch (e) { /* 降级 */ }
  if (!ok) {
    try {
      const ta = document.createElement('textarea');
      ta.value = str;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      ta.remove();
    } catch (e) { ok = false; }
  }
  toast(ok ? okMessage : '复制失败，请手动选择文本复制', ok ? 'success' : 'error');
  return ok;
}

/** localStorage 安全封装（隐私模式 / Node 测试环境下退化为内存存储） */
const memStore = new Map();
export const storage = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) {
      return memStore.has(key) ? memStore.get(key) : fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      memStore.set(key, value);
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      memStore.delete(key);
    }
  },
};
