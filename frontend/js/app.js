/**
 * frontend/js/app.js —— 应用引导：Tab 路由 / 免责声明 / 模式切换 / 片段模板 / 字数统计
 */
import { $, $$, toast, storage } from './utils.js';
import { CONFIG, DISCLAIMER, isDemoMode, setDemoMode } from './config.js';
import { loadDictionary } from './desensitize.js';
import { SYSTEM_FRAGMENTS } from './templates.js';
import { initImageGenTab } from './tabs/image-gen.js';
import { initVideoGenTab } from './tabs/video-gen.js';
import { initOptimizeTab } from './tabs/optimize.js';
import { initSamplesTab } from './tabs/samples.js';

const LOCKED_TABS = ['image-reverse', 'video-reverse']; // V1 功能，MVP 锁定

function switchTab(tabId) {
  if (LOCKED_TABS.includes(tabId)) {
    toast('该功能属于 V1 版本规划（云端反推），MVP 暂未上线', 'warn');
    return;
  }
  $$('#mainTabs .tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabId));
  $$('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${tabId}`));
  if (location.hash !== `#${tabId}`) history.replaceState(null, '', `#${tabId}`);
}

function initTabs() {
  $$('#mainTabs .tab').forEach((btn) =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab))
  );
  window.addEventListener('hashchange', () => switchTab(location.hash.replace('#', '')));
  window.addEventListener('muse:switch-tab', (e) => switchTab(e.detail && e.detail.tab));
}

function initDisclaimer() {
  const modal = $('#disclaimerModal');
  $('#dmText').textContent = DISCLAIMER.full;
  const open = () => {
    modal.hidden = false;
  };
  const close = () => {
    modal.hidden = true;
  };
  $('#disclaimerBtn').addEventListener('click', open);
  $('#legalBanner').addEventListener('click', open);
  $('#dmAccept').addEventListener('click', () => {
    storage.set('muse.legalAccepted', true);
    close();
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  // 首次访问强制阅读
  if (!storage.get('muse.legalAccepted', false)) open();
}

function initModeToggle() {
  const btn = $('#modeToggle');
  const render = () => {
    const demo = isDemoMode();
    btn.textContent = demo ? '演示模式' : '在线模式';
    btn.className = `mode-toggle ${demo ? 'demo' : 'online'}`;
    btn.title = demo ? '当前：本地演示数据（未调用后端）。点击切换到在线模式' : '当前：调用 Cloudflare Worker 后端。点击切换到演示模式';
  };
  btn.addEventListener('click', () => {
    setDemoMode(!isDemoMode());
    toast(isDemoMode() ? '已切换为演示模式（不调用后端）' : '已切换为在线模式（调用 Worker 后端）', 'info');
  });
  window.addEventListener('muse:mode', render);
  render();
}

/** 系统内置片段模板：渲染为可点击 chip，点击插入对应输入框 */
function initFragBars() {
  $$('.frag-bar').forEach((bar) => {
    const key = bar.dataset.frags;
    const targetId = bar.dataset.target;
    (SYSTEM_FRAGMENTS[key] || []).forEach((frag) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'frag-chip';
      chip.textContent = frag.label;
      chip.title = frag.text;
      chip.addEventListener('click', () => {
        const ta = document.getElementById(targetId);
        if (!ta) return;
        const cur = ta.value.trim().replace(/[，,]$/, '');
        ta.value = cur ? `${cur}，${frag.text}` : frag.text;
        ta.dispatchEvent(new Event('input'));
        ta.focus();
      });
      bar.appendChild(chip);
    });
  });
}

/** textarea 字数统计 */
function initCharCounters() {
  $$('textarea[maxlength]').forEach((ta) => {
    const counter = document.createElement('span');
    counter.className = 'char-count';
    const update = () => {
      counter.textContent = `${ta.value.length}/${ta.maxlength}`;
      counter.classList.toggle('over', ta.value.length > ta.maxlength * 0.9);
    };
    ta.addEventListener('input', update);
    ta.insertAdjacentElement('afterend', counter);
    update();
  });
}

function initFooter() {
  const el = $('#footerDisclaimer');
  if (el) el.textContent = `${DISCLAIMER.full}\n\nMusePrompt ${CONFIG.VERSION} · 前端 Cloudflare Pages / 后端 Cloudflare Workers + 豆包多模态 API`;
}

async function initApp() {
  initTabs();
  initDisclaimer();
  initModeToggle();
  initFragBars();
  initCharCounters();
  initFooter();
  initImageGenTab();
  initVideoGenTab();
  initOptimizeTab();
  initSamplesTab();
  switchTab(location.hash.replace('#', '') || 'image-gen');

  try {
    await loadDictionary();
  } catch (e) {
    toast(`脱敏词库加载失败：${e.message}`, 'error', 8000);
  }
}

initApp();
