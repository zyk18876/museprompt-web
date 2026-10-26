# MusePrompt · 真人向提示词工坊（MVP）

第三方 **Muse AI 辅助工具**：只输出提示词文本，**不调用 Muse 生成视频、不托管 Muse 账号、不提供账号/邀请功能**。
与 Meta 及其 Muse 产品无任何官方合作。全部输出提示词由用户自行遵守 Meta 服务条款与法律法规，全站展示免责声明。

- 目标用户：使用 Meta Muse Image / Muse Video 的创作者，主打真人感人像场景
- 前端：Cloudflare Pages（纯静态，无构建步骤）
- 后端：Cloudflare Workers（零依赖）+ 豆包多模态 API（密钥只在后端）
- 样本方案：Few-shot（收集博主实测提示词打标签，非模型微调）

## 目录结构

```
museprompt-web/
├── README.md                     ← 本文件
├── shared/                       ← 前后端共用源（唯一编辑源）
│   ├── desensitize.json          ← 内置脱敏词库（硬拦截/同义改写/参数清理 三层）
│   └── desensitize.engine.js     ← 脱敏引擎（纯函数）
├── scripts/
│   ├── sync-dict.mjs             ← 把 shared/ 同步到 frontend/ 与 worker/（改词库后必跑）
│   └── test-core.mjs             ← 核心逻辑单测：node scripts/test-core.mjs
├── frontend/                     ← MVP 前端（Cloudflare Pages 直接部署）
│   ├── index.html                ← 6 个 Tab（反推锁定为 V1）
│   ├── css/styles.css
│   ├── js/                       ← config / utils / desensitize(生成物) / templates / samples / api / demo / render / tabs
│   └── data/desensitize.json     ← 生成物
├── worker/                       ← MVP 后端（Cloudflare Workers）
│   ├── src/index.js              ← 路由 + CORS + 限流 + 3 个接口
│   ├── src/prompts.js            ← 5 套 System Prompt + {{DYNAMIC_FEW_SHOT_SAMPLES}} 占位符处理
│   ├── src/doubao.js             ← 豆包 Ark API 封装
│   ├── src/desensitize.js        ← 生成物（引擎 + 词库）
│   └── wrangler.toml             ← >>> 需要你填写 DOUBAO_MODEL
├── v1/backend-pseudocode.md      ← V1 反推/KV/R2/卡密伪代码 + 配置清单
└── docs/deploy.md                ← MVP 上线步骤 & V1 迭代步骤
```

## 快速开始

```bash
# 1) 跑核心单测（脱敏引擎 / 占位符替换 / 分段解析 / 样本挑选）
node scripts/test-core.mjs

# 2) 本地预览前端（默认演示模式，无需后端）
cd frontend && npx wrangler pages dev .     # 或 python3 -m http.server 8080

# 3) 部署后端（见 docs/deploy.md 第二节）
cd worker && npx wrangler secret put DOUBAO_API_KEY && npx wrangler deploy

# 4) 前端指向后端：改 frontend/js/config.js 的 API_BASE_URL，DEMO_MODE 改 false
```

## 五大功能与版本规划

| 功能 | MVP | V1 |
| --- | --- | --- |
| 1 真人感图片提示词生成 | ✅ | ✅ |
| 2 图片提示词反推（多模态） | ❌ | ✅（R2 临时存储，解析完即删） |
| 3 真人感视频提示词生成（Audio 控制面板） | ✅ | ✅ |
| 4 视频提示词反推（ffmpeg 抽帧 3-5 张） | ❌ | ✅ |
| 5 粘贴提示词一键优化适配 Muse | ✅ | ✅ |
| 样本库 | localStorage | Cloudflare KV |
| 额度 / 卡密 | ❌ | ✅ |

## 关键设计约定（评审代码时请重点看这几处）

1. **密钥边界**：豆包 API Key 只存在于 Worker secret（`wrangler secret put DOUBAO_API_KEY`），
   前端代码、仓库、页面中均不出现；前端只调 `/api/*`。
2. **`{{DYNAMIC_FEW_SHOT_SAMPLES}}` 占位符**：`worker/src/prompts.js` 的 `buildSystemPrompt(kind, samples)`
   统一处理——有样本注入样本块、无样本置空、模板缺占位符时追加兜底；MVP 样本由前端 localStorage
   挑选后随请求传入，V1 改为服务端从 KV 拉取，Prompt 模板本身不变。
3. **同一套脱敏词库**：`shared/desensitize.json` 是唯一编辑源，`scripts/sync-dict.mjs` 同步到两端；
   前端本地预替换（即时日志）+ 后端复核（输入、LLM 输出各过一次），命中硬拦截直接拒绝。
4. **演示模式**：`config.js` 的 `DEMO_MODE=true` 时全流程用本地假数据，方便先评审 UI；
   上线改 `false`，后端不可达时前端会自动降级并提示。
5. **改词库/引擎后**：编辑 `shared/` 下两个文件 → `node scripts/sync-dict.mjs` → 重新部署。

## 免责声明

本工具为第三方独立开发，与 Meta / Muse 无官方合作；仅输出提示词文本，不调用 Muse 生成、
不托管账号。完整声明见站点页脚与「免责声明」弹窗（文案在 `frontend/js/config.js` 的 `DISCLAIMER`）。
