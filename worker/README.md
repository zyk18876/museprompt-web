# muse-prompt-api（Cloudflare Worker · MVP）

Muse 提示词后端。密钥只存在这里，前端不接触任何密钥。

## 本地开发

```bash
# 方式一：npx（无需安装）
npx wrangler dev

# 方式二：安装依赖后
npm install
npm run dev
```

本地 `.env` 放密钥（不要提交 git）：

```bash
# worker/.dev.vars  （wrangler dev 自动读取，已在 .gitignore 忽略）
DOUBAO_API_KEY=你的豆包密钥
```

## 部署

```bash
npx wrangler secret put DOUBAO_API_KEY   # 输入豆包 API Key
npx wrangler deploy                      # 得到 https://muse-prompt-api.<你的子域>.workers.dev
```

部署前把 `wrangler.toml` 里 `DOUBAO_MODEL` 改成你的推理接入点 ID。

## 端点

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 / 词库版本 |
| POST | `/api/image-prompt` | 功能1 图片提示词生成 |
| POST | `/api/video-prompt` | 功能3 视频提示词生成 |
| POST | `/api/optimize-prompt` | 功能5 粘贴优化 |

V1 反推端点伪代码见 `../v1/backend-pseudocode.md`。
