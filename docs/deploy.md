# 部署说明：MVP 上线步骤 & V1 迭代步骤

前置条件（一次性）：
1. 注册 Cloudflare 账号（免费套餐即可跑通 MVP）；
2. 本机安装 Node.js 18+；
3. 注册火山引擎方舟（Ark）账号，开通豆包多模态模型，创建推理接入点，拿到 API Key；
   （控制台：https://console.volcengine.com/ark → 推理接入点）

---

## 一、MVP 上线步骤（约 20 分钟）

### 1. 本地预览（不部署也能看效果）

前端默认是**演示模式**，不起服务也能先评审 UI：

```bash
cd museprompt-web/frontend
npx wrangler pages dev .        # 或 python3 -m http.server 8080
```

浏览器打开后：四个可用页签（图片生成 / 视频生成 / 提示词优化 / 样本库）全部可以用本地演示数据跑通；
反推两个 Tab 锁定为 V1。

### 2. 部署 Worker（后端）

```bash
cd museprompt-web/worker

# 1) 首次登录（会跳浏览器授权）
npx wrangler login

# 2) 填入你的豆包模型标识：编辑 wrangler.toml
#    [vars] DOUBAO_MODEL = "ep-xxxxxx"   ← 方舟控制台你的推理接入点 ID

# 3) 配置密钥（不会写进任何文件）
npx wrangler secret put DOUBAO_API_KEY
#    提示后粘贴你的豆包 API Key

# 4. 部署
npx wrangler deploy
#    输出：https://muse-prompt-api.<你的子域>.workers.dev  ← 记下这个地址

# 5. 自测
curl https://muse-prompt-api.<你的子域>.workers.dev/api/health
#    期望：{"ok":true,...,"dictVersion":"1.0.0"}
```

### 3. 配置前端指向后端

编辑 `frontend/js/config.js`：

```js
API_BASE_URL: 'https://muse-prompt-api.<你的子域>.workers.dev',  // 第 2 步拿到的地址
DEMO_MODE: false,                                                // 关闭演示模式，走真实 API
```

### 4. 部署前端到 Cloudflare Pages

```bash
cd museprompt-web
npx wrangler pages deploy frontend --project-name=muse-prompt-web
# 输出：https://muse-prompt-web.pages.dev
```

（也可以用 Cloudflare  dashboard → Pages → 直接上传 frontend 目录，效果相同。）

### 5. 上线前检查清单

- [ ] 页面右上角显示「在线模式」；任选一个页签点生成，能拿到真实结果
- [ ] 浏览器 Console 无 CORS 报错（如有：把 `ALLOWED_ORIGINS` 改成你的 Pages 域名后重新 `wrangler deploy`）
- [ ] 输入「萝莉」「 nude 」等高危词，确认被红色警示拦截
- [ ] 输入「纯欲风」「8s 720p」等，确认替换日志有记录、参数被清理
- [ ] 样本库加几条样本后生成，确认「本次携带 N 条 Few-shot 样本」
- [ ] 确认免责声明横幅 / 弹窗 / 页脚都在；文案需要改的话编辑 `frontend/js/config.js` 的 `DISCLAIMER`
- [ ] 确认页面与 Console 中没有任何 API Key 泄露（密钥只应在 Worker 侧）

### 6.（可选）绑定自定义域名

Pages 与 Workers 都支持在 Cloudflare dashboard 里绑定自己的域名，按提示加 CNAME 即可。

---

## 二、V1 迭代步骤（MVP 验证通过后）

> 伪代码见 `v1/backend-pseudocode.md`，配置清单在该文档第 1 节。

1. **建存储**：
   ```bash
   npx wrangler r2 bucket create muse-tmp-uploads
   npx wrangler kv namespace create MUSE_SAMPLES
   npx wrangler kv namespace create MUSE_QUOTA
   ```
   把返回的 id 填进 `worker/wrangler.toml` 的 `[[kv_namespaces]]`；R2 桶在 dashboard 配「删除 1 天前对象」生命周期规则（安全网）。
2. **加变量**：`DOUBAO_VISION_MODEL`（视觉模型）、`FEATURE_REVERSE=false`（灰度先关）、`ALLOWED_ORIGINS` 收紧为 Pages 域名。
3. **实现反推端点**：按伪代码实现 `/api/image-reverse`、`/api/video-reverse`；抽帧推荐方案 A（前端 ffmpeg.wasm，只上传 3-5 帧）。
4. **样本库迁移 KV**：样本库页「导出 JSON」→ 一次性导入脚本写 KV → 前端「同步到云端」。
5. **额度系统**：卡密生成脚本 + 前端卡密输入面板 + 请求头 `X-Quota-Token`。
6. **灰度放开**：自测通过后 `FEATURE_REVERSE=true`，重新 `wrangler deploy`。
7. 每一步都跑一遍「上线前检查清单」的对应项。

---

## 三、常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 一直显示演示模式、点击生成无反应 | `config.js` 的 `DEMO_MODE` 仍是 `true`，或 `API_BASE_URL` 没改 |
| Console 报 CORS | Worker 的 `ALLOWED_ORIGINS` 不含当前域名；设为 Pages 域名后重新部署 |
| 返回 `CONFIG` 错误 | Worker 没配 `DOUBAO_API_KEY` 或 `DOUBAO_MODEL`；`wrangler secret put` + 改 toml |
| 返回 `UPSTREAM` 错误 | 豆包侧问题：密钥无效 / 模型名写错 / 账户欠费；看 `wrangler tail` 日志 |
| 429 RATE_LIMITED | 单 IP 每分钟 30 次上限，属正常保护，稍等即可 |
| 改词库不生效 | 编辑 `shared/desensitize.json` 后必须跑 `node scripts/sync-dict.mjs`，再重新部署 Worker / 前端 |
