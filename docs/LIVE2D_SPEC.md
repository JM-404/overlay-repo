# 小灵 Live2D 自研形象 — 美术 / 建模交付规格

> **目的**:让公司美术 / 建模同事按这份规格制作 Live2D 形象,交付后我们这边的接入工作量是"丢文件就能切",不需要再改代码或返工。
> **联系**:技术对接 [JM],收到模型后由我做接入和调试。

---

## 0. 重要前提

| 项 | 必须值 |
|---|---|
| **Cubism 版本** | **Cubism Editor 4.x 或 5.x** 制作,导出 **Cubism 4 SDK 兼容**(`.moc3` / `.model3.json`) |
| **不接受的格式** | ❌ Cubism 2 / 3(`.moc` 老格式)— 我们不支持 |
| **运行环境** | 浏览器(WebGL),所以需要严格遵守纹理上限和参数命名规范 |
| **原型参考** | 当前小灵用的是 TEN demo 的 Kei 模型,可作为"功能下限"参考 |

---

## 1. 文件交付目录结构

最终交给我的应该是一个**独立文件夹**,命名建议 `xiaoling_v1`(以后多版本就 `_v2`、`_v3`),里面文件结构必须是这样:

```
xiaoling_v1/
├── xiaoling_v1.model3.json        ← 主入口配置,文件名要和文件夹同名
├── xiaoling_v1.moc3               ← 模型二进制
├── xiaoling_v1.physics3.json      ← 物理(头发/衣物摆动),可选但强烈推荐
├── xiaoling_v1.cdi3.json          ← 显示信息(可选)
├── textures/
│   ├── texture_00.png             ← 主纹理
│   └── texture_01.png             ← 如果分多张
├── motions/
│   ├── idle.motion3.json          ← 必备
│   ├── talk.motion3.json          ← 必备
│   ├── greet.motion3.json         ← 必备
│   └── nod.motion3.json           ← 必备
└── expressions/                    ← 可选
    ├── smile.exp3.json
    ├── shy.exp3.json
    ├── thinking.exp3.json
    └── surprise.exp3.json
```

⚠️ **`.model3.json` 文件名必须和文件夹同名**,我们的代码靠这个约定加载。

⚠️ 不要交压缩包密码、不要把 Cubism 工程源文件 `.cmo3` 混在一起。**只要导出后的运行时文件**。

---

## 2. 标准参数命名表(关键!不能自由命名)

我们的代码硬编码读取 Cubism 官方默认参数 ID。**不要为了"看着舒服"自己改名字**(改了我们就读不到,口型/眨眼直接失效)。

### 必备(15 项)

| 参数 ID | 中文意思 | 范围 | 用途 |
|---|---|---|---|
| `ParamMouthOpenY` | 嘴张开度 | 0.0 – 1.0 | **关键,口型同步用**——程序按 TTS 音量驱动 |
| `ParamMouthForm` | 嘴形 | -1.0 – 1.0 | 微笑(+) / 噘嘴(-) |
| `ParamEyeLOpen` | 左眼开 | 0.0 – 1.0 | 眨眼用 |
| `ParamEyeROpen` | 右眼开 | 0.0 – 1.0 | 眨眼用 |
| `ParamEyeLSmile` | 左眼笑(眯) | 0.0 – 1.0 | 表情 |
| `ParamEyeRSmile` | 右眼笑(眯) | 0.0 – 1.0 | 表情 |
| `ParamEyeBallX` | 眼球水平 | -1.0 – 1.0 | 视线左右 |
| `ParamEyeBallY` | 眼球垂直 | -1.0 – 1.0 | 视线上下 |
| `ParamAngleX` | 头部水平转 | -30 – 30 | idle 微动 |
| `ParamAngleY` | 头部上下 | -30 – 30 | 点头 / 摇头 |
| `ParamAngleZ` | 头部歪 | -30 – 30 | 倾斜 |
| `ParamBodyAngleX` | 身体水平 | -10 – 10 | idle 呼吸感 |
| `ParamBodyAngleY` | 身体上下 | -10 – 10 | 微动 |
| `ParamBodyAngleZ` | 身体歪 | -10 – 10 | 微动 |
| `ParamBreath` | 呼吸 | 0.0 – 1.0 | 呼吸起伏 |

### 情绪类(可选,但推荐做齐 4 个)

| 参数 ID | 用途 |
|---|---|
| `ParamCheek` | 脸红(0-1,我们在害羞表情用) |
| `ParamBrowLY` / `ParamBrowRY` | 眉毛上下(惊讶/疑惑) |
| `ParamBrowLForm` / `ParamBrowRForm` | 眉形(皱眉/平眉) |
| `ParamHairFront` / `ParamHairSide` / `ParamHairBack` | 头发摆动(物理用) |

如果有自定义参数(衣服细节、特效之类),**额外参数 OK**,但**默认参数必须存在**。如果实在要改名,**提前告诉我,我在接入层做映射**(代价是每个新形象都要改代码)。

---

## 3. 动作清单(motions)— 4 条必备

每个动作是一个 `.motion3.json`,放在 `motions/` 下。文件名按下表:

| 文件名 | 时长 | 循环? | 说明 |
|---|---|---|---|
| `idle.motion3.json` | 4-8 秒 | ✅ 循环 | 待机:呼吸 + 微微头部摆动 + 偶尔眨眼。**最关键,占小灵 80% 时间** |
| `talk.motion3.json` | 2-3 秒 | ✅ 循环 | 说话时的身体动作(头部更明显的点头/侧摆,**不要包含口型——口型程序驱动**)|
| `greet.motion3.json` | 1-2 秒 | ❌ 单次 | 打招呼:点头 / 微笑加深 / 头微歪 |
| `nod.motion3.json` | 1 秒 | ❌ 单次 | 点头(同意 / 听到了),用于 LLM 思考时的反馈 |

### 重要约束

1. **idle 动作不要包含眨眼参数**(`ParamEyeLOpen` / `ParamEyeROpen`)。眨眼由 SDK 自动驱动,如果 idle 又写了会冲突变成怪异闪烁
2. **talk 动作不要包含口型参数**(`ParamMouthOpenY`)。口型由 TTS 音量实时驱动,叠加会卡顿
3. 动作的参数变化幅度**不要太大**,小灵是聊天伴侣不是舞者,大幅度动作会显得抽搐
4. 所有动作首尾参数值**应该一致**,这样切换动作不会看到突跳

---

## 4. 表情清单(expressions)— 可选,推荐 4 个

每个表情是一个 `.exp3.json`,叠加效果(在动作之上做加法)。建议:

| 文件名 | 触发场景 | 主要参数变化 |
|---|---|---|
| `smile.exp3.json` | 用户开玩笑 / 小灵开心 | `ParamMouthForm` +0.6, `ParamEyeLSmile/RSmile` +0.5 |
| `shy.exp3.json` | 被夸奖 / 害羞话题 | `ParamCheek` +0.8, `ParamMouthForm` +0.3 |
| `thinking.exp3.json` | LLM 调用工具 / 思考时 | `ParamBrowLForm/RForm` +0.3, `ParamMouthForm` -0.2 |
| `surprise.exp3.json` | 听到意外的话 | `ParamEyeLOpen/ROpen` +0.3, `ParamBrowLY/RY` +0.5 |

如果美术有想法做更多(比如生气、得意、困倦)欢迎,只要文件命名符合 `*.exp3.json` 即可。

---

## 5. 物理(physics3.json)— 强烈推荐做

让头发、衣服、耳饰等"跟着头/身体动而摇晃"。在 Cubism Editor 里用 Physics 模式配置好,导出 `.physics3.json`。

**核心要点**:
- 长发分前/侧/后 3 段,各自独立摇摆参数
- 衣物下摆、领口、耳饰等"挂件"都要做物理
- 摇摆**衰减系数不要太低**,否则会"晃个不停",看着累

没物理的话小灵看起来像纸片人,**有物理是质感分水岭**。

---

## 6. 纹理 / 性能要求

| 项 | 要求 |
|---|---|
| 单张纹理最大 | **2048 × 2048 px**(超过会在某些移动 GPU 黑屏) |
| 纹理张数 | 1-2 张为佳,**不超过 4 张**(每多一张多一次 draw call) |
| 纹理格式 | PNG with alpha,色彩 sRGB |
| Mesh 顶点总数 | 建议 < 5000 |
| Drawables 数量 | 建议 < 60 个 |

⚠️ **不要把所有部位都拆得太细**(比如每个手指一个 drawable),浏览器渲染会变卡。Live2D 不是 3D,精度过头反而是负担。

---

## 7. 美学方向(参考,非硬性要求)

- 整体气质:**亲和、年轻、有温度**,不要走"二次元过度萌系"或"成熟御姐"两个极端
- 表情默认略带微笑(idle 状态嘴角 `ParamMouthForm` 默认 +0.1 左右就行)
- 姿势:**半身**(腰部以上),正面/微侧 3/4 视角
- 服装:简洁清爽,不要太多复杂细节,会让 idle 微动看起来"杂乱"
- 配色:小灵网页底色是深色(`bg-slate-900`),所以人物不要也是深色,**亮一些好突出**

可以参考的对标(气质上,不抄):VTuber 圈的"清纯小姐姐"档,比如**绊爱早期版本**、**桐生可可日常风格**、**Hololive 的 AZKi**。

---

## 8. 验收标准(交付前美术自查)

请按这个清单自查后再交付,可以省一轮返工:

- [ ] `.model3.json` 文件名和文件夹同名
- [ ] `ParamMouthOpenY` 参数存在,从 0 → 1 时嘴是从闭合 → 完全张开
- [ ] `ParamEyeLOpen` / `ParamEyeROpen` 参数存在,SDK 自动眨眼会工作
- [ ] 所有 motion 文件能在 Cubism Viewer 里独立播放
- [ ] idle 不含口型 / 眨眼参数(避免冲突)
- [ ] talk 不含口型参数
- [ ] 在 [Cubism Web Sample Viewer](https://www.live2d.com/sample-data/) 里能加载并显示无报错
- [ ] 模型文件夹总大小 < 30 MB(超过传输和加载都慢)

---

## 9. 期望工期 / 流水线

| 阶段 | 工期 | 输出 |
|---|---|---|
| 原画 | 3-5 天 | 半身设计稿(正面 + 微侧 3/4) |
| 拆分 PSD(分图层) | 1-2 天 | 按 Live2D 拆分规则的 PSD |
| Cubism 建模 | 5-7 天 | `.cmo3` 工程 + 各参数调整 |
| 动作 + 物理 | 2-3 天 | 4 条 motion + physics |
| 表情(可选) | 1-2 天 | 4 个 exp |
| 导出 + 自查 | 0.5 天 | 上面第 8 节的清单 |
| **合计** | **2-3 周** | |

---

## 10. 接入侧承诺(我这边)

模型交付到我手上后:

- [ ] 0.5 天内完成接入到代码,小灵 UI 上能选到这个新角色
- [ ] 0.5 天调试口型同步、动作触发时机
- [ ] 反馈一份 "可以正式上线 / 需要回炉调整 X 项" 的 review

---

## 11. 有疑问就问,别猜

如果美术对**任何一项不确定**(参数命名、动作时长、纹理上限、文件结构),**先问再做**,比做完返工成本低 10 倍。

直接联系:[JM]

---

**附:相关参考链接**

- Live2D 官方文档:https://docs.live2d.com/
- Cubism 4 SDK 参数规范:https://docs.live2d.com/cubism-editor-manual/parameters/
- 我们目前用的 SDK 包装(技术参考,美术不用看):`pixi-live2d-display/cubism4`
