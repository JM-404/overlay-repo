# 小灵 MVP 任务清单

**更新时间**: 2026-04-25
**MVP 定义**: 匿名记忆 + 主动陪伴 Demo + 角色可切换 + 响应式 UI,网页形态(PWA)发布,**不做桌面端**
**预计总工期**: ~2 周 · 剩余 ~7-10 天

---

## 0. 前置依赖(开工前必须搞定)

- [x] **SSH 代理白名单**:`47.95.119.182` 已加到 DIRECT(2026-04-24 验证连通,容器 `ten_agent_dev` 健康)
- [ ] **API Keys 清单**:
  - [x] 和风天气 API Key(免费版 1000 次/天,天气 MCP 用)— Host + Key 存服务器环境变量(`QWEATHER_HOST` / `QWEATHER_KEY`),不进 git
  - [ ] 通义千问 API Key(多模型切换,可选)
  - [ ] OpenAI API Key(多模型切换,可选)
  - [ ] 博查搜索 API Key(搜索 MCP,推迟到 Post-MVP)
- [ ] **老板拍板事项**:
  - [ ] 确认主动陪伴是产品主路线
  - [ ] 确认 MVP 暂不做桌面端(用 PWA 替代)
  - [ ] 自研 Live2D 形象立项,美术/建模排期

---

## 1. 里程碑 M1:基础能力升级(5-7 天)

### 1.1 UI 改版 — ⚠️ 部分完成(横屏 ✅ / 竖屏 ❌)
- [x] 横屏(网页)重构:**左上数字人 + 左下用户摄像头 + 中间波形条 + 右侧聊天** 两栏布局
- [x] 顶部薄工具栏:标题 + 连接状态 + 模型下拉 + Start/Stop + 麦克风开关
- [x] 聊天卡片底部文字输入框(回车/按钮发送)
- [x] 新增 `UserCamera.tsx`(本地预览,`getUserMedia`,不上传)
- [ ] **竖屏(手机浏览器)**:对话区默认占屏幕 1/3,点击自动展开 ← 还没做
- [ ] 响应式断点用 `useMediaQuery` 判定 orientation ← 跟竖屏一起做
- [ ] 过渡动画用 `framer-motion` 的 `AnimatePresence`
- [ ] 窗口 resize 时 Live2D canvas 自动 `app.renderer.resize()`(M3.2 一起处理)
- [ ] 右上角设置入口完整 drawer(现在只是模型下拉,完整版见 M2.3)

**依赖**: 无  
**剩余工期**: 1-2 天(只剩竖屏)

### 1.2 匿名 Memory 系统 — ✅ 2026-04-24 上线(含多用户)
- [x] 前端 `frontend/src/lib/userIdentity.ts`:首次访问 `crypto.randomUUID()` 生成,写入 `localStorage['xiaoling_uid']`;隐身模式 fallback 到会话级临时 UID
- [x] 前端 `frontend/src/lib/persona.ts`:`PERSONA_PROMPT_BASE` + `buildPromptForUser(uid)` 把 `[CURRENT_USER_ID=<uid>]` 拼进 prompt
- [x] 前端 `frontend/src/hooks/useAgentLifecycle.ts`:`/start` 通过 `properties.llm.prompt` override 注入(利用 TEN **字段级 deep-merge**,不覆盖 base_url/api_key)
- [x] 新建 `memory_mcp_server.py`(port 7779,FastMCP + SSE + SQLite)
  - [x] 表:`memories(id, uid, content, created_at)` + index `(uid, created_at DESC)`
  - [x] Tool: `recall(uid)` → 最近 50 条记忆,新用户有专门提示
  - [x] Tool: `remember(uid, content)` → 写记忆,>500 字截断
  - [x] 空/异常 uid 落到 `_unknown` 桶,绝不丢数据
- [x] `property.json` 加 `mcp_memory` 节点 + `tool_register` 挂载
- [x] system prompt 加 recall/remember 指引(本地 `persona.ts` 和 `property.json` 双维护,M2.3 统一)
- [x] DB 路径 `/app/agents/examples/websocket-example/.memory/memory.db`(bind-mount 到 host,容器重建不丢)
- [x] 多用户隔离直接 DB 验证通过 ✅
- [x] Worker 启动日志确认 recall/remember 注册到 LLM ✅
- [ ] (Post-MVP)升级项:向量检索 / profile 蒸馏 / 跨设备同步 / hermes Honcho / systemd 自启

**依赖**: SSH ✅ | DB 持久化 ✅ | TEN `/start` override ✅

### 1.3 Context MCP(时间 + 农历 + 天气)— ✅ 2026-04-24 上线
- [x] 新建 `context_mcp_server.py`(port 7778,FastMCP + SSE,仿 fetch_mcp 模板)
  - [x] Tool: `get_current_time()` — 年月日、星期、时段(早上/上午/中午/下午/傍晚/晚上/深夜)
  - [x] Tool: `get_lunar_date()` — 干支纪年、生肖、农历月日、节气(今日或近 7 天)、节日
  - [x] Tool: `get_weather(city?)` — 和风天气 v7,支持 12 个常用城市,默认北京
- [x] `property.json` 改造:
  - [x] 删除孤儿 `weatherapi_tool_python` 节点(原本 env var 没设,空跑)
  - [x] 新增 `mcp_context` 节点(`mcp_client_python` → `127.0.0.1:7778/sse`)
  - [x] `main_control` 的 `tool_register` source 列表更新
- [x] system prompt 加指示:会话开始前先调 get_current_time + get_lunar_date
- [x] 部署验证:worker 启动时三个工具均 register 成功,graph 无报错
- [x] 同时修复了**本地 overlay 与服务器 drift** 问题(把服务器 property.json 拉回来做 source of truth)

**依赖**: 和风天气 Key ✅ | 服务器 SSH ✅ | `lunar-python` 已装进容器

### 1.4 PWA 壳 — 0.5 天
- [ ] `public/manifest.json`:app name / icons / theme_color / start_url / display: standalone
- [ ] 接入 `next-pwa` 生成 service worker
- [ ] iOS Safari 适配 meta(`apple-mobile-web-app-capable` 等)
- [ ] 验证:Mac Chrome "安装" / iOS Safari "添加到主屏"可用

**依赖**: 无

---

## 2. 里程碑 M2:陪伴 Demo(2-3 天)

### 2.1 主动陪伴 — ✅ 2026-04-26 上线(三件套 A + B + C)
**架构换了**:不走"按钮 + 新 API",改走"复用文本输入管道 + 哨兵字符串"思路,代码量更小、更干净。
- [x] 新建 `frontend/src/lib/proactiveTick.ts`:`__PROACTIVE_TICK__:<reason>` 协议 + 6 种 reason
- [x] **A. 进场即说**:WebSocket 连上自动发 `user_just_arrived` tick,小灵立刻调时间/记忆/天气工具,主动开口。`useEffect` 用 `channelName` 当 session 标识,reconnect 不会重发(避免之前观察到的"开场三连发" bug)
- [x] **B. 沉默打破**(新 patch `main_python/extension.py`):asyncio watchdog,真用户输入重置;45s 无动静自动注入 `silence_60s` tick → 小灵主动追问"还在吗"。tick 自身不重置(避免自喂料死循环);on_stop 干净取消
- [x] **C. URL `?greet=morning|afternoon|evening|remind`**:不同时段 demo 模式,前端读 query 决定 tick reason
- [x] `useWebSocket.ts` 加过滤:`__PROACTIVE_TICK__` 不显示在用户气泡里
- [x] persona prompt 教 LLM 6 种 reason 各自的语气,以及绝不复述 sentinel 字符串
- [x] 端到端浏览器实测通过(包括沉默 45s 触发 watchdog 等)

**依赖**: M1.2 ✅ + M1.3 ✅ + websocket_server text patch ✅

### 2.2 多模型切换 — ✅ 2026-04-25 上线
**换方案了**:不走多 graph,走 **gpt.ge 中转网关**(一个 base_url 支持三家模型,只改 `model` 字段)
- [x] 服务器 `property.json` LLM 换成 `https://api.gpt.ge/v1` + gpt.ge API key(替换原 DeepSeek 直连)
- [x] 新建 `frontend/src/lib/availableModels.ts` 8 个模型:
  - Claude Sonnet 4.6(默认) / Claude Haiku 4.5
  - GPT-5.4 / GPT-5.1 / GPT-4.1 / GPT-4o
  - Gemini 2.5 Pro / Gemini 2.5 Flash
- [x] 前端顶部工具栏模型下拉,选择写 localStorage `xiaoling_model`,下次 Start 生效(运行时灰掉防误切)
- [x] `useAgentLifecycle.ts` 的 `/start` 调用加 `properties.llm.model` 覆盖
- [x] API key 只硬编码在服务器 property.json,前端 JS 不暴露
- [x] **修了 Claude/gpt.ge 的 tool-call 兼容 bug**:`openai_llm2_python` 扩展的 `json.loads("")` 对无参数工具炸,patch 让空字符串等同 `{}`(见 Gotcha #19)

**依赖**: gpt.ge API key ✅  
**附带收益**: Claude 的 tool-use 纪律比 DeepSeek 好,之前"手滑多查""我来看看时间"这类话痨问题显著减轻

### 2.3 设置面板填充 — ⚠️ 部分完成
- [x] 切换模型 — 已做,作为顶部下拉而非侧边 drawer
- [x] 声音开关 — 已做(麦克风 toggle)
- [ ] 完整侧边 drawer(取代顶部散控件)
- [ ] 自定义背景:预设 4-6 张 + 支持上传本地图
- [ ] 切换角色下拉(对接 M3.2 Persona 结构,先占位)
- [ ] 音量条(目前是音量 toggle,非渐变)
- [ ] 配置持久化(模型已 localStorage,其他待加)

**依赖**: 2.2 ✅  
**剩余工期**: 0.5-1 天

---

## 3. 里程碑 M3:角色化(2-3 天 + 等模型)

### 3.1 Live2D 交付规格文档 — ✅ 2026-04-26 完成
- [x] [`docs/LIVE2D_SPEC.md`](docs/LIVE2D_SPEC.md) 完整 11 节
  - Cubism 4/5 导出 + `.moc3` / `.model3.json` 强制
  - 完整参数命名表(15 必备 + 4 可选情绪类),硬要求不可改名
  - 4 条必备动作(idle / talk / greet / nod),含"idle 不含眨眼,talk 不含口型"等避坑约束
  - 4 个可选表情清单
  - 物理(physics3.json)推荐
  - 纹理 / 性能上限(2048×2048,drawables<60)
  - 美学方向参考
  - 交付文件夹标准结构 + 命名约定
  - 美术自查清单 + 期望工期(2-3 周)
  - 我侧的接入承诺(收到 → 0.5 天 + 0.5 天调试)
- [ ] **发给美术 / 建模同事**(留给 JM 操作)

**依赖**: 无

### 3.2 Live2D 切换接口改造 — 1-2 天
- [ ] 定义 TS 接口:
  ```ts
  interface AvatarPersona {
    id: string;
    name: string;
    modelPath: string;
    mouthParam?: string;   // 默认 ParamMouthOpenY
    mouthGain?: number;    // 默认 1.5
    idleMotion?: string;
    talkMotion?: string;
    scale?: number;
    offset?: { x: number; y: number };
  }
  ```
- [ ] `AvatarLive2D.tsx` 接受 `persona` prop,切换时:
  - [ ] destroy 老 model(所有 PIXI resources)
  - [ ] load 新 model
  - [ ] 重新绑定 AnalyserNode 做口型
- [ ] 内存泄漏测试:连续切 20 次看 DevTools Memory
- [ ] `public/live2d/personas.json` 注册表,前端从这读可选列表

**依赖**: SSH 打通 + 审读 `AvatarLive2D.tsx` 现状

### 3.3 自研形象接入 — 1 天
- [ ] 公司交付模型 → `public/live2d/<name>/`
- [ ] 在 `personas.json` 注册
- [ ] 口型参数对齐测试(RMS → mouth open 灵敏度)
- [ ] 动作/表情触发时机调试(开场 greet / 说话 talk / 沉默 idle)

**依赖**: 公司交付 Live2D 模型

---

## 4. Post-MVP 任务(不排期,心里有数)

### 产品增强
- [ ] Tauri 桌面端打包(系统通知 + 开机自启 + 系统托盘)
- [ ] 真 cron 主动触达(替代 Demo 按钮)
- [ ] 飞书 MCP 接入(lark-openapi-mcp,beta,需要 SSE 包装)
- [ ] 钉钉 MCP 接入(TEN 原生 `dingtalk_bot_tool_python`)
- [ ] 搜索 MCP(博查 / Bing)
- [ ] 新闻 RSS MCP(36kr / 少数派)
- [ ] TODO/记事 MCP(和 memory 共用 SQLite)
- [ ] IP 定位 MCP
- [ ] 手机号绑定 → 跨设备同步记忆
- [ ] 微信小程序版本
- [ ] iOS 原生 APP
- [x] ~~文本输入 fallback(麦克风拒绝权限时)~~ — 2026-04-25 已完成(详见 M1.1)

### 技术升级
- [ ] Memory 向量检索(sqlite-vss / Chroma)
- [ ] 评估升级到 hermes-agent 的 Honcho 用户模型
- [ ] 评估接入 openclaw 做多渠道触达
- [ ] AGORA_APP_ID 改造(patch `/app/server/main.go` line 53)
- [ ] systemd unit 让所有 MCP / API / Frontend 开机自启
- [ ] **容器重建保护**:`install.sh` 加步骤自动把 `overlay/ten_packages_patches/*` 恢复到 `/app/agents/ten_packages/` 对应位置,否则重建就丢 websocket_server 文本输入 + Claude 兼容两个关键 patch
- [ ] 主动陪伴:`parallel_tool_calls` 支持(目前 Claude 被迫走多轮 tool 循环,响应偏慢)

---

## 5. 工期总览 & 剩余任务(按优先级)

| # | 任务 | 工期 | 备注 |
|---|---|---|---|
| ~~1~~ | ~~M3.1 Live2D 规格文档~~ | ~~0.5 天~~ | ✅ 2026-04-26 完成,**待 JM 发美术** |
| ~~2~~ | ~~M2.1 主动陪伴~~ | ~~1-2 天~~ | ✅ 2026-04-26 上线(A+B+C 三件套) |
| 3 | **M1.4 PWA 壳** | 0.5 天 | 性价比最高 |
| 4 | **M1.1 竖屏布局**(手机) | 1-2 天 | 横屏已做 |
| 5 | **M2.3 设置面板扩展** | 0.5-1 天 | 模型切换已做,加背景/角色/音量 |
| 6 | **M3.2 Live2D 角色切换接口** | 1-2 天 | 等美术交付前可以先做 |
| 7 | **M3.3 接入公司 Live2D** | 1 天 | 等美术交付 |
| 附 | **演示脚本** | ✅ | [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) 完成 |

**剩余总工期**: ~3-5 天主动开发 + 等美术(2-3 周并行)

---

## 6. 决策日志

| 日期 | 决策 | 背景 |
|---|---|---|
| 2026-04-24 | MVP 不做桌面端,用 PWA 替代 | 减少打包调试成本,专注陪伴感打磨;桌面端留给下一版 |
| 2026-04-24 | Memory 用 LocalStorage UUID + SQLite,不做账号系统 | 降门槛;跨设备同步留给 Post-MVP |
| 2026-04-24 | 主动陪伴做演示按钮,不做真 cron | Demo 可控,避免现场冷场;管道本身复用,非废代码 |
| 2026-04-24 | 短期不融入 hermes-agent,自己搭简化版 | 1 周 vs 1 个月,先验证产品形态,陪伴感上限瓶颈其实在 persona/数据,不在 agent 框架 |
| 2026-04-24 | Live2D 自研形象由公司美术出(Cubism 4) | 品牌化需要;接入层做成"丢文件即可切换" |
| 2026-04-24 | MCP 优先做 memory + context(time/weather/lunar) | 陪伴感性价比最高;日历/搜索/新闻推 Post-MVP |
| 2026-04-25 | LLM 改走 gpt.ge 中转网关,不搞多 graph | 一个 base_url 支持 Claude/OpenAI/Gemini,只需改 `model` 字段;Claude tool-use 纪律更好,捎带修复之前的"手滑多查"问题 |
| 2026-04-25 | 文本输入路径:patch `websocket_server` 扩展接受 `{"text":"..."}`,转成合成 `asr_result` 事件 | MVP 不想再造一条通道;复用现有 ASR→main_control→LLM→TTS 管道。代价:维护两个 ten_packages 小 fork(记入 Gotcha #18/#19) |
| 2026-04-25 | Prompt 约束收窄(no-emoji + 静默调工具 + 不重复调工具 + 不为自己道歉) | 从日志证据来看针对 DeepSeek 的话痨 / 重复 tool_call 问题;切 Claude 后这些规则更多是保险 |
| 2026-04-26 | 主动陪伴改用"哨兵字符串 + 文本输入管道复用"而非"新 API + 按钮" | 避免再起新 endpoint,代码量更小,维护成本低;一次性拿到 A(进场)/ B(沉默)/ C(URL 模式)三种触发 |
| 2026-04-26 | 沉默 watchdog 默认 45s,不是 60s | demo 时长不希望让人等太久;生产可以调高 |
| 2026-04-26 | tick 不重置自己的 watchdog,只首次触发 | 防止小灵自我喂料形成 silence_60s 死循环 |

---

## 7. 备忘与开放问题

- [ ] 话术 persona 手册(小灵怎么说话)需要一份单独文档,目前散在 `property.json` 的 system prompt 里
- [ ] 音量/音色用户有没有偏好调节需求?目前 Minimax TTS 固定 "tianmei"
- [ ] PWA 版本在 iOS Safari 能不能后台播音?未测,影响"被动语音触达"设计
- [ ] 用户不在线时的主动推送:MVP 不做,但要想好 Post-MVP 要走 Web Push 还是依赖桌面/APP
