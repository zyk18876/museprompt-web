#!/usr/bin/env node
/**
 * scripts/test-core.mjs —— 核心逻辑单测（Node 直跑，无浏览器依赖）
 * 覆盖：脱敏引擎（改写/拦截/参数清理/幂等）、System Prompt 占位符替换、
 *       视频分段解析、Few-shot 样本挑选。
 * 运行：node scripts/test-core.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const { compileDictionary, applyDesensitize } = await import(join(root, 'frontend/js/desensitize.js'));
const { buildSystemPrompt, SYSTEM_PROMPTS, FEW_SHOT_PLACEHOLDER, formatFewShotSamples } = await import(join(root, 'worker/src/prompts.js'));
const { parseVideoSegments, applyVideoTemplate, applyImageTemplate } = await import(join(root, 'frontend/js/templates.js'));
const { saveSample, pickSamples, loadSamples, clearSamples } = await import(join(root, 'frontend/js/samples.js'));

const dict = compileDictionary(JSON.parse(readFileSync(join(root, 'shared/desensitize.json'), 'utf8')));

let passed = 0;
let failed = 0;
function assert(cond, name, extra = '') {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

console.log('\n[1] 脱敏引擎');
{
  const r = applyDesensitize('一位纯欲风女孩，穿着睡衣，眼神拉丝', dict);
  assert(r.blocked === null, '普通氛围词不触发拦截');
  assert(r.text.includes('自然清新的风格'), '纯欲风 → 自然清新的风格', `实际: ${r.text}`);
  assert(r.text.includes('宽松居家服'), '睡衣 → 宽松居家服');
  assert(r.text.includes('目光柔和地注视镜头'), '眼神拉丝 → 目光柔和地注视镜头');
  assert(r.replacements.length >= 3, '替换日志有条目', `实际 ${r.replacements.length} 条`);

  const b = applyDesensitize('一个萝莉在跳舞', dict);
  assert(b.blocked && b.blocked.category === '未成年人', '未成年人词命中硬拦截');
  assert(b.text === '一个萝莉在跳舞', '拦截后不改写原文');

  const s = applyDesensitize('电影感，8s，720p，--ar 9:16，帧率30fps', dict);
  assert(!/\d\s*s\b/.test(s.text) && !/\d{3,4}p/i.test(s.text) && !s.text.includes('--ar'), '工具参数被清理', `实际: ${s.text}`);
  assert(s.replacements.some((x) => x.category === '参数清理'), '参数清理写入日志');

  const twice = applyDesensitize(applyDesensitize('纯欲，睡衣', dict).text, dict);
  assert(twice.replacements.length === 0, '幂等：第二次执行无新替换');

  const blocked = applyDesensitize(' nude 内容', dict);
  assert(blocked.blocked && blocked.blocked.category === '色情与性暗示', '英文高危词命中拦截');
}

console.log('\n[2] System Prompt 占位符替换');
{
  const withSamples = buildSystemPrompt('imageGenerate', [
    { text: '示例提示词A', tag: '人像自拍' },
    { text: '示例提示词B', tag: '人像自拍' },
  ]);
  assert(!withSamples.includes(FEW_SHOT_PLACEHOLDER), '占位符被完全替换');
  assert(withSamples.includes('示例提示词A') && withSamples.includes('示例1'), '样本块注入');
  assert(withSamples.includes('你是Meta Muse Image专用提示词生成专家'), '原始模板内容保留');

  const noSamples = buildSystemPrompt('videoGenerate', []);
  assert(!noSamples.includes(FEW_SHOT_PLACEHOLDER), '无样本时占位符置空');
  assert(noSamples.includes('格式分段：场景：xxx'), '无样本时模板内容完整');

  assert(formatFewShotSamples([]) === '', '空样本返回空字符串');
  assert(Object.keys(SYSTEM_PROMPTS).length === 5, '5 套 Prompt 齐备');

  let threw = false;
  try { buildSystemPrompt('not-exist', []); } catch (e) { threw = true; }
  assert(threw, '未知 kind 抛错');
}

console.log('\n[3] 视频分段解析与模板');
{
  const text = '场景：黄昏天台；人物：25岁女性；动作：缓慢步行；镜头：固定机位；画质：电影级；Audio：Lo-fi BPM 90；负面：画面崩坏';
  const segs = parseVideoSegments(text);
  assert(segs.scene === '黄昏天台' && segs.person === '25岁女性' && segs.action === '缓慢步行', '分段解析正确');
  assert(segs.camera === '固定机位' && segs.quality === '电影级' && /Lo-fi/.test(segs.audio), '镜头/画质/Audio 解析正确');
  const m = applyVideoTemplate(text);
  assert(m.negative === '画面崩坏', '负面段被抽出');
  const img = applyImageTemplate('一位女性在咖啡馆。\n\n负面提示词：模糊, 畸变');
  assert(img.extra === '一位女性在咖啡馆。', '图片模板去掉负面段');
}

console.log('\n[4] Few-shot 样本挑选');
{
  clearSamples();
  saveSample({ text: '人像自拍样本一号内容', tag: '人像自拍' });
  saveSample({ text: '人像自拍样本二号内容', tag: '人像自拍' });
  saveSample({ text: '穿搭短片样本一号内容', tag: '穿搭短片' });
  saveSample({ text: '氛围感居家样本一号内容', tag: '氛围感居家' });
  const picked = pickSamples('image-gen', 4);
  assert(picked.length === 4, '补齐到上限 4 条');
  assert(picked.slice(0, 2).every((s) => s.tag === '人像自拍'), '优先挑选同分类样本');
  const videoPicked = pickSamples('video-gen', 4);
  assert(videoPicked[0].tag === '穿搭短片', '视频页签优先穿搭短片');
  clearSamples();
  assert(loadSamples().length === 0, '清空生效');
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
