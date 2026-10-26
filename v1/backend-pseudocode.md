# V1 正式版后端设计（Cloudflare Workers + R2 + KV）

> 本文是**伪代码 / 设计稿**，不是可直接部署的成品代码。所有标注 `>>> 需要你填写` 的配置项，
> 必须在部署前替换为你自己的值。MVP 与 V1 共用同一套脱敏词库（`shared/desensitize.json`）
> 与 5 套 System Prompt（`worker/src/prompts.js`）。

## 0. V1 相对 MVP 新增什么

| 模块 | MVP | V1 |
| --- | --- | --- |
| 图片提示词生成 / 视频提示词生成 / 粘贴优化 | ✅ | ✅ 不变 |
| 图片反推 / 视频反推 | ❌ | ✅ 新增（R2 临时存储 + 豆包多模态） |
| 样本库 | 浏览器 localStorage | Cloudflare KV 云端存储 |
| 调用额度 | ❌ | ✅ 卡密次数系统 |
| 上传素材 | 无 | R2 临时桶，处理完立即删除 |

---

## 1. wrangler.toml（V1 完整配置）

```toml
name = "muse-prompt-api"
main = "src/index.js"
compatibility_date = "2025-01-01"

[vars]
DOUBAO_MODEL = ""          # >>> 需要你填写：豆包文本模型 / 推理接入点 ID
DOUBAO_VISION_MODEL = ""   # >>> 需要你填写：支持图片输入的视觉模型 / 接入点 ID（反推用）
DOUBAO_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
ALLOWED_ORIGINS = ""       # >>> 需要你填写：Pages 域名，如 https://muse-prompt-web.pages.dev
FEATURE_REVERSE = "false"  # 灰度开关：false 时反推接口返回 503，便于先上线再放开

# >>> 需要你填写：R2 临时桶绑定（先执行 wrangler r2 bucket create muse-tmp-uploads）
[[r2_buckets]]
binding = "MUSE_TMP"
bucket_name = "muse-tmp-uploads"

# >>> 需要你填写：KV 命名空间（先执行 wrangler kv namespace create MUSE_SAMPLES 等，把返回的 id 填进来）
[[kv_namespaces]]
binding = "MUSE_SAMPLES"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

[[kv_namespaces]]
binding = "MUSE_QUOTA"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# 密钥不进 toml：
#   wrangler secret put DOUBAO_API_KEY
```

### 配置清单（哪些必须你自己填）

| 配置项 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| `DOUBAO_API_KEY` | `wrangler secret put` | ✅ | 豆包 API 密钥，绝不进代码/前端 |
| `DOUBAO_MODEL` | `[vars]` | ✅ | 文本模型 / 推理接入点 ID（方舟控制台获取） |
| `DOUBAO_VISION_MODEL` | `[vars]` | ✅ 反推 | 视觉模型（需支持图片输入） |
| `MUSE_TMP` bucket | `[[r2_buckets]]` | ✅ 反推 | 临时上传桶，配生命周期自动清理 |
| `MUSE_SAMPLES` KV | `[[kv_namespaces]]` | V1 样本云同步 | 样本库 |
| `MUSE_QUOTA` KV | `[[kv_namespaces]]` | 额度系统 | 卡密与计数 |
| `ALLOWED_ORIGINS` | `[vars]` | 建议 | 限制只有你的 Pages 域名可跨域调用 |
| `FEATURE_REVERSE` | `[vars]` | 灰度 | `true` 才放开反推接口 |

---

## 2. 新增接口总览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/image-reverse` | 功能2：上传图片 → 反推 Muse Image 提示词 |
| POST | `/api/video-reverse` | 功能4：上传视频 → 抽帧 → 反推 Muse Video 提示词 |
| GET/POST/DELETE | `/api/samples` | 样本库 KV 化后的云端 CRUD |
| POST | `/api/quota/redeem` | 卡密激活（查询余量） |

---

## 3. `/api/image-reverse` 伪代码（功能2）

```js
// 约束：文件大小限制（如图 ≤ 10MB）；解析完成 R2 自动删除；不持久化用户素材。
app.post('/api/image-reverse', async (req, env) => {
  if (env.FEATURE_REVERSE !== 'true') return err(503, 'FEATURE_OFF', '反推功能灰度中，暂未开放');
  const quota = await checkQuota(req, env);                 // 见第 6 节，失败抛 402/429

  const file = req.body.image;                              // base64 data URI 或 multipart
  if (!file || file.bytes > 10 * 1024 * 1024) return err(400, 'FILE_TOO_LARGE', '图片超过 10MB 上限');
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return err(400, 'BAD_TYPE', '仅支持 jpg/png/webp');

  // 1) 上传到 R2 临时区（key 带随机前缀，避免碰撞）
  const key = `tmp/img/${crypto.randomUUID()}.jpg`;
  await env.MUSE_TMP.put(key, file.bytes, {
    httpMetadata: { contentType: file.type },
    customMetadata: { uploadedAt: new Date().toISOString() },
  });

  try {
    // 2) 豆包视觉输入：R2 私有对象需要预签名 URL（有效期 15 分钟）
    //    >>> 需要你填写：R2 预签名实现（S3 API SigV4，或给桶绑 r2.dev 子域用公开 URL，二选一）
    const imageUrl = await presignR2Url(env, key, 900);

    // 3) 组 Prompt：System-2 + 服务端从 KV 选 Few-shot 样本（第 5 节）
    const system = buildSystemPrompt('imageReverse', await pickSamplesFromKV(env, '人像自拍'));
    const llm = await chatCompletion(env, {
      systemPrompt: system,
      visionModel: env.DOUBAO_VISION_MODEL,                 // 反推走视觉模型
      userContent: [
        { type: 'image_url', image_url: { url: imageUrl } },
        { type: 'text', text: '请反推这张图片适配 Muse Image 的提示词。' },
      ],
    });

    // 4) 输出再过一遍同一套脱敏词库
    const out = desensitize(llm.content);
    if (out.blocked) return err(400, 'HARD_BLOCK', out.blocked.reason);

    await consumeQuota(env, quota);                          // 成功才扣次数
    return ok({ prompt: out.text, replacements: out.replacements });
  } finally {
    // 5) 无论成功失败，立即删除临时文件（禁止持久化用户素材）
    await env.MUSE_TMP.delete(key);
  }
});
```

---

## 4. `/api/video-reverse` 伪代码（功能4）

```js
// 约束：禁止抓取网络链接；限制大小（如 ≤ 100MB）与时长（如 ≤ 30s）；
//       ffmpeg 抽取 3-5 张关键帧，完整视频不传给大模型；素材解析完 R2 自动删除。
app.post('/api/video-reverse', async (req, env) => {
  if (env.FEATURE_REVERSE !== 'true') return err(503, 'FEATURE_OFF', '反推功能灰度中，暂未开放');
  const quota = await checkQuota(req, env);

  const file = req.body.video;
  if (!file || file.bytes > 100 * 1024 * 1024) return err(400, 'FILE_TOO_LARGE', '视频超过 100MB 上限');
  if (file.durationSec && file.durationSec > 30) return err(400, 'TOO_LONG', '视频超过 30 秒上限');

  const key = `tmp/video/${crypto.randomUUID()}.mp4`;
  await env.MUSE_TMP.put(key, file.bytes, { httpMetadata: { contentType: file.type } });
  const frameKeys = [];
  try {
    // 1) 抽帧：首帧、中间帧、结尾帧 + 中间均匀间隔，共 3-5 张
    //    >>> 需要你填写：extractKeyframes 的实现方案，见下方三种方案注释
    const frames = await extractKeyframes(env, key);        // 返回 [{key, index}]
    if (frames.length < 3) return err(422, 'FRAME_FAIL', '关键帧抽取失败，请更换视频');
    frameKeys.push(...frames.map((f) => f.key));

    // 2) 帧图转 base64 / 预签名 URL 后批量送入视觉模型
    const system = buildSystemPrompt('videoReverse', await pickSamplesFromKV(env, '穿搭短片'));
    const llm = await chatCompletion(env, {
      systemPrompt: system,
      visionModel: env.DOUBAO_VISION_MODEL,
      userContent: [
        ...frames.map((f, i) => ({ type: 'image_url', image_url: { url: f.url } })),
        { type: 'text', text: `这是按时间顺序抽取的 ${frames.length} 张关键帧，请反推整套视频的 Muse Video 提示词。` },
      ],
    });

    const out = desensitize(llm.content);
    if (out.blocked) return err(400, 'HARD_BLOCK', out.blocked.reason);
    await consumeQuota(env, quota);
    return ok({ prompt: out.text, replacements: out.replacements });
  } finally {
    await env.MUSE_TMP.delete(key);
    await Promise.all(frameKeys.map((k) => env.MUSE_TMP.delete(k))); // 帧图一并删除
  }
});

/**
 * extractKeyframes 三种实现方案（按团队技术栈三选一）：
 *
 * 方案 A（推荐，最省事）：前端 ffmpeg.wasm 本地抽 3-5 帧，只上传帧图。
 *   优点：Worker 无重计算、无 ffmpeg 依赖；"完整视频不传给大模型"天然满足。
 *   缺点：用户侧消耗几秒 CPU；需在前端加 ffmpeg.wasm（约 25MB，懒加载）。
 *
 * 方案 B：Cloudflare Containers 跑 ffmpeg sidecar，Worker 把 R2 对象转给容器抽帧。
 *   优点：服务端可控、兼容性强；缺点：Containers 额外计费，需容器镜像内置 ffmpeg。
 *
 * 方案 C：Worker  bundle 内编译 ffmpeg.wasm 直接抽帧。
 *   优点：无额外服务；缺点：内存/CPU 吃紧（Worker 128MB 内存限制），长视频容易超时，
 *   仅作备选。无论哪种方案，都遵循：先上传 R2 临时区 → 抽帧 → 帧图送模型 → finally 全删。
 */
```

---

## 5. 样本库迁移 KV（替代 localStorage）

```js
// KV 数据模型：
//   key = "sample:<id>"        → { id, text, tag, createdAt }
//   key = "index:tag:<tag>"    → [id, ...]（写入时维护；读取按前缀 list 亦可）
const SAMPLE_PREFIX = 'sample:';

// GET /api/samples?tag=人像自拍&limit=50 —— 列表
app.get('/api/samples', async (req, env) => {
  const tag = req.query.tag;
  const listed = await env.MUSE_SAMPLES.list({ prefix: SAMPLE_PREFIX, limit: 200 });
  const items = await Promise.all(listed.keys.map((k) => env.MUSE_SAMPLES.get(k.name, 'json')));
  return ok({ samples: items.filter((s) => s && (!tag || s.tag === tag)) });
});

// POST /api/samples { text, tag } —— 新增（服务端同样过脱敏词库）
app.post('/api/samples', async (req, env) => {
  const guard = desensitize(req.body.text || '');
  if (guard.blocked) return err(400, 'HARD_BLOCK', guard.blocked.reason);
  const id = crypto.randomUUID();
  await env.MUSE_SAMPLES.put(`sample:${id}`, { id, text: guard.text, tag: req.body.tag, createdAt: Date.now() });
  return ok({ id });
});

// DELETE /api/samples/:id
app.delete('/api/samples/:id', async (req, env) => {
  await env.MUSE_SAMPLES.delete(`sample:${req.params.id}`);
  return ok({});
});

/**
 * 服务端 Few-shot 选择：生成/反推接口不再依赖前端传 samples，
 * 改为按分类从 KV 拉取，替换 {{DYNAMIC_FEW_SHOT_SAMPLES}} 占位符。
 * 与 MVP 的区别只是"样本来源"从请求体变成 KV，buildSystemPrompt() 完全复用。
 */
async function pickSamplesFromKV(env, tag, limit = 4) {
  const listed = await env.MUSE_SAMPLES.list({ prefix: SAMPLE_PREFIX, limit: 100 });
  const all = (await Promise.all(listed.keys.map((k) => env.MUSE_SAMPLES.get(k.name, 'json')))).filter(Boolean);
  const same = all.filter((s) => s.tag === tag).slice(0, limit);
  if (same.length >= limit) return same;
  return [...same, ...all.filter((s) => s.tag !== tag)].slice(0, limit); // 不足用其他分类补齐
}
```

**MVP → V1 样本迁移**：在样本库页点「导出 JSON」，得到 `{samples:[...]}`；
写一个一次性脚本 `scripts/import-samples-to-kv.mjs`，逐条 `env.MUSE_SAMPLES.put()` 写入
（可用 `wrangler kv key put` 或直接在 Worker 里加一个受密钥保护的一次性导入端点）。

---

## 6. 额度与卡密系统

```js
// KV 数据模型：
//   key = "card:<卡密>"  → { total: 100, used: 23, active: true, expiresAt: 1699999999999 }
// 客户端在每个请求头带：X-Quota-Token: <卡密>

async function checkQuota(req, env) {
  const token = req.headers.get('X-Quota-Token');
  if (!token) throw new QuotaError(401, 'MISSING_TOKEN', '请先输入卡密');
  const card = await env.MUSE_QUOTA.get(`card:${token}`, 'json');
  if (!card || !card.active) throw new QuotaError(401, 'BAD_CARD', '卡密无效');
  if (card.expiresAt && Date.now() > card.expiresAt) throw new QuotaError(401, 'EXPIRED', '卡密已过期');
  if (card.used >= card.total) throw new QuotaError(402, 'EXHAUSTED', '卡密次数已用完');
  return { token, card };
}

async function consumeQuota(env, quota) {
  const key = `card:${quota.token}`;
  const card = await env.MUSE_QUOTA.get(key, 'json');
  card.used += 1;
  await env.MUSE_QUOTA.put(key, card);
  // 注意：KV 最终一致，竞态下可能少量超发。严格计数可换 Durable Object 单例维护计数器。
}
```

> 卡密生成后台：写一个本地脚本 `scripts/gen-cards.mjs`（受你自己保管的 ADMIN_TOKEN 保护），
> 批量生成随机卡密并 `wrangler kv key put` 写入 `card:<卡密>`。前端在设置面板输入卡密，
> 存 localStorage，之后每个请求自动带上 `X-Quota-Token`。

---

## 7. R2 临时存储与自动清理（双保险）

1. **代码层（主路径）**：所有反推接口 `finally` 中显式 `env.MUSE_TMP.delete(key)`，视频连帧图一起删。
2. **桶层（安全网）**：R2 控制台 → 桶 `muse-tmp-uploads` → 生命周期规则 → 「删除 1 天前的对象」，
   防止异常路径漏删。两条兜底保证**用户上传素材不被永久留存**。

---

## 8. V1 落地检查清单

- [ ] `wrangler r2 bucket create muse-tmp-uploads`，并配 1 天生命周期规则
- [ ] `wrangler kv namespace create MUSE_SAMPLES` / `MUSE_QUOTA`，id 填进 wrangler.toml
- [ ] `wrangler secret put DOUBAO_API_KEY`；`[vars]` 填 `DOUBAO_MODEL` / `DOUBAO_VISION_MODEL`
- [ ] 反推接口按本文伪代码实现，`FEATURE_REVERSE` 先设 `false`，自测通过后改 `true`
- [ ] 抽帧方案三选一（推荐方案 A：前端 ffmpeg.wasm）
- [ ] 前端：反推 Tab 解锁 + 卡密输入面板 + `X-Quota-Token` 请求头
- [ ] 样本库页增加「同步到云端」按钮，localStorage 样本导入 KV
- [ ] 灰度：先自己对拍，再放小流量，观察 `wrangler tail` 日志
