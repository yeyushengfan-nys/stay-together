# 参考价选择范围修复（2026-10-27）

沿用用户已接受的房型页参考价模式。本次新增明确的 `reference_selection`：只从当前行程、当前目标房型、已清洗的匹配套餐核对参考预算；其他必要条件仍逐项校验，不把参考价写入最终含税房价字段。

- 其他必要证据齐备时，结果标为“参考价首选／备选”；发票、晚到、设施或体验仍未知时，只输出核实清单。
- 默认最终价格核验通道保留；参考价不是最终应付价，不宣称同条件最低价，不提交订单或付款。
- 参考价卡片和AI输入共用派生视图，不改原始房价或同行偏好；没有儿童适配，明确拒绝含儿童的参考价任务。
- 模型理由的引用范围与服务端选中套餐检查一致，避免正常平台引用被误拒。演示资料与真实资料仍隔离。
- 本次代码检查：36个离线测试脚本通过，属于合成数据和固定材料回归；不是36次真实模型调用或36名用户。当前真实酒店的必要缺口和最新现场结果以 `PROJECT_STATUS.md` 为准，不能据此提前宣称真实首选验收成功。

---

# 当前进度：参考价核实清单与评价证据（2026-10-27）

当前扩展为 0.2.8；网站版本及最新验收以 `PROJECT_STATUS.md` 为准。

- AI 增加独立的“优先核实候选”：仅从套餐符合当前参考预算、早餐/床型/取消窗口且没有明确必要冲突的候选中选择最多两家。每位同行人的理由有同酒店原文引用，未知条件继续列为具体核实任务。
- 这份清单是参考价阶段的核实顺序；正式推荐仍要求必要条件证据齐全，不将参考价写成最终含税价。
- 同房型重新查价保留已核对的评价材料；新套餐、旧价格及不适用的房型事实重新核对，同行偏好不改。
- 2026-10-27 本地后端调用真实模型：两家真实酒店、此前采集的参考价和6条人工核对评价，22.135秒得到2条核实候选和2条评价解读，正式推荐0；移除报价和评价的不足案例5.463秒得到空核实清单。不是新一轮查价或外部用户试用，原始含私人状态的结果保存在仓库外。
- 程序回归：`node tests/test-verification-shortlist.mjs`、`node tests/test-evidence-preservation.mjs`、`node tests/test-decision-ui.mjs`。模拟检查与真实模型测试分开统计。

以下为历史开发记录，不能代替当前状态。

---

# 历史进度：住一起 0.2.4 功能验证版

目标：有证据、能核对价格口径、能解释同行取舍的酒店决策工具。当前交付是网页、Chrome采集扩展和服务端源码；微信小程序尚未开发或发布。

## 2026-10-26 同程加载诊断

- 本轮后续已取得北京东四饭店11月1—3日、1间2成人的双平台订单预览房费：携程488元、同程498元。取消责任不同，不能直接同条件比价；税费与优惠资格仍有缺口。仅此单酒店人工核验，不是0.2.4自动端到端成功。逐字段证据见 `docs/full-price-recheck-2026-10-26.md`。
- 随后用保留的同行偏好与真实资料调用AI4次：首轮引用被后台拦截，第二、三轮人工发现语义或条件归属问题，修正预算缺口标签、逐人检查上下文与提示后，第四轮通过“无早餐违反朋友必要条件，暂不推荐”的负向案例。所有失败保留；没有正向首选备选或托管页面登录链路验收结论。
- 同程旧Service Worker为主程序模块返回opaque缓存，Chrome报ERR_FAILED。正常首页搜索能取得酒店身份与列表起价；列表起价不能代替完整房费。
- 临时网络直读诊断后酒店、日期与2成人恢复；房型请求随后返回429，停止重复请求。仅清理已确认出错的一条JavaScript缓存；未清除登录数据，临时网络直读设置已恢复。最终结果以本轮复核记录为准。
- 0.2.4仅在扩展隔离环境保留已知公共主脚本加载失败的路径与时间，不读取请求头、Cookie或响应。加载失败暂停，避免循环刷新。
- 同程“没有满足筛选条件的房型”保留原因未确认，不能直接判无房或用推荐卡片起价填补。真实429来自Chrome诊断，不声称扩展能识别所有HTTP状态。
- 离线检查：node tests/test-tongcheng-loading.mjs（5组）、node tests/test-collector.mjs（37项）。不能作为完整报价现场成功率。
- 没有新增权限；旧扩展需用户重新加载后才生效。参考价默认流程不变，未重跑三组回归，未增加平台。完整报价通过前不做AI推荐现场验收。

## 本轮范围

- 修复北京日期/人数同步误判：页面加载完成与搜索控件同步分开判断。短暂同步等待期间不采价；持续不符、URL年份错误仍暂停，并显示实际读到的日期/人数。
- 根据用户最新要求，新发起的任务使用房型页**参考价模式**，不进入订单预览。旧的完整订单预览测试记录保留独立口径。
- 携程、同程逐家查找；参考价带日期、房型、早餐和取消提示、来源、采集时间。未通过房型条件的价格仅供查看，不当作已满足条件。
- 参考价不推算全程总额，不当作最终含税应付价，不将房型/早餐对应扩大成完整条件已核验。
- 同行偏好保留；暂不新增飞猪、去哪儿适配。飞猪本机实测预订按钮要求App扫码，去哪儿旧酒店入口跳转品牌首页，均未完成自动报价接入。

## 验证口径

已完成的历史上海0.2.2功能测试：3家酒店、2平台、34条房型套餐、6个完整订单预览总额、1家同条件可比；约341秒，无人工继续、跳过或手动刷新。没有候选通过全部必要条件。这是一轮功能测试，不是稳定性、节省时间或用户增长证明。

0.2.3自动检查：`node tests/test-collector.mjs`（37项）、`node tests/test-reference-prices.mjs`、`node tests/test-selection-client.mjs`、`node tests/test-selection.mjs`。这些包含DOM/Chrome API测试替身，不代替真实网页或模型评测。

三组现场参考价回归已完成（北京原日期、上海同日期、北京另一日期）：18/18个酒店×平台组合取得参考价，三组同行偏好逐字段保持一致。通过当前房型条件且两平台名称/早餐对应的套餐为0；完整应付价与AI决策不在本轮范围。详见 `docs/regression-results-2026-10-26.md` 与脱敏JSON记录。

每次分别记录：参考价取得数、完整报价取得数、参考房型/餐食对应数、完整条件可比数、必要条件满足情况。参考价模式的完整报价核验不在本轮范围，不合并成功率。

## 本地运行

- 仅看页面：`node scripts/preview-hotel.mjs`，使用终端实际输出的本地地址。
- 完整网页后台：按package.json声明的Node和pnpm版本安装依赖，执行 `pnpm dev`。AI接口需要服务端密钥及所有者访问配置。
- Chrome采集：在Chrome加载 `collector-extension/`。默认只信任当前配置的住一起线上域名；改成自己的站点时需同时修改core.js及manifest.json中的站点声明。
- 安装说明在 `public/collector-setup.html`。需要用户自己的平台登录；不会处理验证码，不提交订单或付款。
- 密钥使用未跟踪的环境文件或托管运行时秘密配置；测试材料与个人行程备份放在仓库外。小程序的数据来源先单独验证，再决定移动端范围。

以下为旧功能及接口说明；如有冲突，以本节当前范围为准。

---

# 住一起 · 酒店选择助手

线上地址：https://stay-together-yusi-1024.yusinn0613.chatgpt.site

## 用户流程
1. 在对比页输入城市和最多两家酒店，自动检索可获取的公开资料。九类来源逐项显示覆盖情况，摘要保留来源链接。
2. 填写行程和同行偏好，选择具体房型，未知设施保持待确认。
2. 导入截图，点「AI 理解这张截图」。核对转录、酒店、房型与设施字段后保存。
3. 回到对比页，点「结合偏好，生成 AI 推荐」。查看各人的理由、原文引用和待确认信息。
4. 修改资料或偏好后重新生成。截图和行程保存在浏览器中，可导出备份。

## 实现
Vinext + Cloudflare Worker 后台，原静态页面保留于 public/workspace.html。
POST /api/ai/extract 使用 Responses API 视觉输入和结构化输出；POST /api/ai/recommend 使用已确认的资料、全体成员偏好与原文来源。
后台检查必要条件、推荐数量、所有同行人的理由、酒店与引用是否对应、引用是否出现在原文。不能证明评论本身真实。
GET /api/ai/status 只返回是否配置/是否有权访问，不暴露密钥。
付费接口只允许配置的所有者登录使用；平台提供身份头。基础限速为单 Worker 实例内每分钟6次，非全局预算上限。

## 配置
托管环境通过 Sites 环境变量配置 OPENAI_API_KEY（secret）、AI_OWNER_EMAIL（secret）、OPENAI_MODEL。
默认模型 gpt-5.4-mini。密钥不进入前端、Git 或部署包。本地 .env.local 已忽略。
普通 UI 预览不读取密钥，不产生 API 费用：node scripts/preview-hotel.mjs

## 检查
node test-ai.mjs
node test-engine.cjs
AI 检查使用明确的模拟响应，不是实时模型效果评测。
真实 API 推理验收仍等待账户充值后进行：1张截图提取 + 1次推荐 + 人工逐项对照原图。

## 限制
通过 Responses web_search 实际联网检索公开资料；不保证九个平台都能取得正文。搜索摘要与原始住客引文分别标注。不会绕过登录或批量抓取；不查询实时价、不预订。
演示候选和评价均虚构。来源链接由用户填写，系统不自动访问。
点击分析时材料会经后台发送给 OpenAI，使用 store:false；这不等同于承诺零数据保留。
最多8家候选、8位成员，每家30条评价；先裁剪长截图，避免文字过小。

## 自动检索
POST /api/ai/research：先执行真实web_search（最多6次工具调用），再用结构化模型整理事实、评价摘要、待确认和9类平台覆盖。来源ID只能来自搜索工具返回的URL。过滤明确对应另一家酒店的来源，并校验平台覆盖链接域名。此启发式校验不能保证每句摘要都正确，因此不标为独立核验事实。
公开示例 public/beijing-research.json 来自实际接口检索，带检索时间，不含API密钥或私人资料。页面载入示例不产生API费用，点击重新检索才调用API。
添加到候选的检索摘要默认未确认；用户核对后才能用于推荐。必要设施与实际房型仍需确认。
node test-research.mjs 验证来源、酒店混淆、平台归属、链接安全与检索执行要求。
真实截图识别和推荐已在2026-10-24完成一次演示材料测试；新增自动检索也用北京瑰丽与北京璞瑄进行了真实API测试。

## 否定句与模式隔离修复（2026-10-24）
本地字段提示已拆为 public/claims.js：优先处理否定，收费洗衣不认作免费自助；条件、疑问、房型差异、来源冲突保留未知。tests/claims-cases.json 包含54条有人工预期值的回归用例（57个已标注字段），不能据此声称普遍识别准确率。
“我的行程”和“演示模式”使用独立本地存储；旧v1存储原样保留作为迁移备份。真实模式去除演示酒店和演示评价，按城市过滤，跨城市加入结果需要确认并清空日期。后台再次拒绝模式/城市混用，避免仅靠前端过滤。
功能测试行程可明确标记；测试日期和预算不应被写成真实出游需求，真实酒店资料缺失时保留未知。
检查：node test-claims.cjs；node test-journey.cjs；node test-mode-api.mjs；以及原有AI、检索和规则检查。

## Automatic pricing integration status (2026-10-25)

The requested multi-platform live room-price feature is **not complete**. The Shanghai price page remains a dated manual observation. No Ctrip, Tongcheng, Fliggy room-rate distribution or Qunar quote API credential has been configured.

`GET /api/hotel-prices` returns connection status without secrets. `POST /api/hotel-prices` validates city, dates, rooms, adults and selected structured preferences. With the owner's official `FLYAI_API_KEY` it calls FlyAI `search_hotels` on the server; external calls remain owner-only during integration, with a four-requests-per-minute best-effort isolate limit. Visitor querying is not enabled. Names, personal notes, screenshots, booking cookies and the OpenAI key are not sent to FlyAI.

This is a **search-only transport**, not an inventory adapter. Its result never supplies complete offers or updates hotel budget/necessary-condition decisions. A masked `¥3x` remains masked; even unmasked hotel-search prices remain references because room, occupancy, meals, cancellation and tax scope are absent. No historical or generated prices substitute for failed live queries. The SDK's shared demo API key is not included in this website or used by production. FlyAI's public SDK signing-protocol default is used, independently of the owner's formal API key. A future full-price adapter must use its own documented response schema and production credential.

Live feasibility observation: an official SDK trial request on 2026-10-25 returned HTTP 200 and four Shanghai hotel search results, with `¥3x`/`¥4x` price strings and an explicit experience-mode message requiring a formal key. No complete room rates were returned. The provider console redirects to Taobao login; browser safety policy prevented agent access to that login. No login bypass was attempted.

Required before claiming automatic real comparison works:

1. Obtain approved read-only hotel listing, room-rate/stock and validation permissions for at least two Chinese booking channels, plus the right to display their rates. A distribution rate is not automatically the same as the retail app member rate.
2. Obtain the actual response documentation and test credentials; store credentials only in Sites runtime secrets, never in the client or chat.
3. Map hotel and room identities using authorized supplier IDs, address and room attributes; preserve uncertain matches instead of comparing names alone.
4. Require exact stay dates, room count, occupancy, CNY total, taxes, breakfast, cancellation deadline/fees, payment terms, cashback/coupon eligibility, inventory status, source and retrieval time. Unknown fields block a same-terms minimum-price claim.
5. Verify with two fresh dates against platform pages. Confirm timeouts, expired credentials, unavailable inventory, coupon eligibility and per-day price totals; configure durable rate limiting and an explicit public trial allowance before enabling visitor calls.

Official references:
- FlyAI search: https://flyai.open.fliggy.com/docs/quickstart
- FlyAI missing-price FAQ: https://flyai.open.fliggy.com/docs/faq
- Fliggy hotel distribution onboarding (enterprise Alipay and permission package): https://developer.alibaba.com/docs/doc.htm?articleId=121384&docType=1&treeId=817
- Fliggy hotel quotes: https://developer.alibaba.com/docs/doc.htm?articleId=121387&docType=1&treeId=817
- Tongcheng/eLong real-time vs prefetch endpoints: https://open.elong.com/notice/detail?id=391

Validation: `node test-price-search.mjs` checks date/occupancy validation, real observed masked responses, synthetic reference-only responses (test-only), missing-credential behavior with zero upstream calls, owner access, origin checks, throttling, provider errors and minimal data forwarding. Mock tests do not establish production price accuracy or user benefit.
