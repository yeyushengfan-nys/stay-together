# 运行说明

本说明对应已部署网站 v51、来源提交 `59a905f`、采集扩展 0.2.7。当前导出保留框架与服务端代码，但不包含原网站的运行时密钥、部署身份或用户资料。

## 1. 无依赖本地页面预览

要求：Node.js ≥22.13.0；在仓库根目录运行：

```sh
node scripts/preview-hotel.mjs
```

打开 **http://127.0.0.1:8130/**。该脚本仅使用 Node 内建模块及仓库模块，不需要 `pnpm install`。

可以验证页面渲染、填写及保存偏好、导入截图、查看本地规则与虚构演示。初次使用可点击“演示模式”；演示酒店不是可预订的真实结果。真实行程与演示存储隔离。

该服务器向 AI 和酒店搜索处理器传入空环境对象，**不会读取 `.env`，也不会使用终端中的 API 密钥**。因此 AI 提取／推荐及联网搜索不会在这个预览中完成；出现“尚未配置”的提示属于此模式的预期边界。

本地服务器提供真实文件路径，如 `/workspace.html`、`/prices.html`；线上 `/workspace` 等简写路由和登录跳转并未由该服务器实现。不要把简单预览部署为对外 AI 服务。

截图存在该地址的 IndexedDB；行程、偏好和结果存在 localStorage。它们不会自动出现在另一个浏览器、地址或设备，可使用页面的导出／导入功能迁移。`Ctrl+C` 停止服务器。

## 2. 框架与服务端开发路径

源码使用 Vinext／React、Vite 和 Cloudflare Worker。`app/page.tsx` 展示 `public/workspace.html`；`worker/index.ts` 接入 Vinext 请求处理器及 Sites 连接器能力。API 路由使用 `cloudflare:workers` 的运行时 `env`，不是普通静态文件接口。

依赖版本由 `package.json` 和 `pnpm-lock.yaml` 记录：Node ≥22.13.0、pnpm 11.25.0。已有脚本为：

```sh
cp .openai/hosting.example.json .openai/hosting.json
pnpm install
pnpm dev
```

普通本地执行配置会选择 portable 路径；开发端口由脚本设置为 5173，以终端输出为准。`pnpm build` 是框架构建，`pnpm start` 使用构建后的 `dist/server/wrangler.json` 启动本地 Worker。这套框架命令不是上述无依赖预览的前置条件；干净克隆后的完整安装、构建及外部部署需在使用者自己的环境验收。

### Sites 依赖与身份边界

- `.openai/hosting.example.json` 仅是无私密配置的模板；真实 `.openai/hosting.json` 不上传。若使用 Sites 发布，必须使用自己的项目及配置，不能用占位 ID 发布到原网站。
- 线上登录依赖 Sites 提供的 `/signin-with-chatgpt` 流程和经可信边缘注入的 `oai-authenticated-user-*` 身份头。AI 后端将该身份与 `AI_OWNER_EMAIL` 比较。
- portable 开发插件提供回环地址上的模拟登录，仅用于本地开发，不是真实 ChatGPT 身份认证，也不会授予线上所有者权限。
- 连接器预览依赖活动的 Sites 预览会话；单独克隆不包含该会话或权限。
- 若迁移到其他托管服务，需配置自己的可信认证、秘密注入和 Worker 运行环境。不能直接信任公网客户端自带的身份头。

**本仓库不承诺 clone 后真实 AI 立即可用。** 线上网站的所有者限制没有因为公开源码而放开，面试官免登录完成整套 AI 流程的 Demo 尚未完成。

### 环境变量

`.env.example` 只列名称与占位值，不含凭据。真实值应由自己的服务端运行时安全注入；复制模板不等于 Cloudflare／Sites 已获得对应绑定。

| 名称 | 用途 |
| --- | --- |
| `OPENAI_API_KEY` | 服务端模型调用密钥；截图提取、推荐、公开检索与补查共用。 |
| `OPENAI_MODEL` | 模型配置；当前源码默认值为 `gpt-5.4-mini`。 |
| `AI_OWNER_EMAIL` | 允许调用付费接口的所有者身份；不作为前端配置。 |
| `FLYAI_API_KEY` | 可选的飞猪 FlyAI 酒店**搜索**接口凭据，并非完整房型报价能力。 |
| `FLYAI_SIGN_SECRET` | 可选的、由提供方明确要求的协议签名配置。 |

不要把密钥放入 `public/`、扩展、浏览器存储或 Git。现有进程内限速不是全局用量或费用上限。公开试用的预算、鉴权和全局限流尚未交付。

### API 入口

| 路径 | 当前职责 |
| --- | --- |
| `GET /api/ai/status` | 返回是否配置及当前请求是否获准，不返回密钥。 |
| `POST /api/ai/extract` | 读取截图并输出结构化字段，保存前需核对。 |
| `POST /api/ai/recommend` | 结合确认材料、逐人条件与来源输出解读／核实清单；正式推荐仍受必要条件门槛约束。 |
| `POST /api/ai/discover`、`research`、`audit` | 联网查找候选或补充公开资料；检索摘要不等于原始住客评价或人工确认事实。 |
| `GET/POST /api/hotel-prices` | 可选 FlyAI 搜索联调入口；不是携程／同程完整报价 API，也不能提供已核验的同条件最低价。 |

## 3. Chrome 采集扩展

使用 Chrome 的“加载已解压的扩展程序”选择 `collector-extension/`。这是源码扩展，尚未上架商店。安装权限及现场流程见 `public/collector-setup.html`。

当前 0.2.7 的网站桥接固定为项目线上域名：

- `collector-extension/manifest.json` 的网站匹配范围；
- `collector-extension/bridge.js` 的 `ORIGIN`；
- `collector-extension/core.js` 的 `SITE_ORIGIN`。

因此扩展默认**不会连接 `127.0.0.1:8130` 或他人的部署**。迁移时需将这三处协调改为自己的可信地址，重新加载扩展并重新验收；本导出没有代替使用者完成此迁移。

当前自动来源为携程、同程可见页面。需要使用者在同一 Chrome 中使用自己的平台账号；登录／验证码由本人处理，程序不会绕过。新任务默认读取房型页参考价，不进入订单预览、不提交订单或付款。历史订单预览代码和记录仍在，不能据此称默认任务已核验最终应付价。

目前适配六城（北京、上海、杭州、广州、深圳、成都）、1间房、1–4成人、无儿童、最多14晚。候选发现和页面核对有数量上限，不是全城穷尽搜索。飞猪、去哪儿未接入自动完整报价。平台页面变化、账号价格、加载异常和访问限制均可能影响采集。

扩展任务使用 `chrome.storage.session`，重启整个浏览器后不保证恢复；回传结果由网站保存在当前浏览器。不会自动变成全站共享价格库，也不是手机云端采集服务。

## 4. 离线验证与尚未验收的能力

README 列出的六条测试命令均使用本地材料／测试替身，不需账号、真实密钥或联网 API。历史 `tests/collector-fixtures/`、`tests/fixtures/` 和公开案例用于复现当时断言，不能代表当前价格、库存或全平台准确率。

最新真实模型案例的正式入住推荐为 **0**；“优先核实候选”是下一步核实顺序，不是绕过缺失证据的首选／备选。完整无登录 AI Demo、多人实时同步、广泛用户效果验证和微信小程序尚未完成。进一步进度及失败项统一维护在 `PROJECT_STATUS.md`。
