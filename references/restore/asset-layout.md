# 资产布局

面向发布项目的默认布局是 `asset/font`、`asset/style`、`asset/animation` 和 `asset/ui`，按需要增加目录。它是语义分类，不是搬迁命令；现有项目及游戏引擎布局优先保持稳定。接口字段由 [interfaces.md](interfaces.md#优化规格与准备检查)控制。

| 分类 | 内容 | 注意 |
| --- | --- | --- |
| font | 字体与字体授权/来源索引 | 保留实际字重、字符集和 fallback |
| style | 可复用 CSS、主题与样式数据 | 页面业务代码仍可留在 src；设计 token 真相在冻结合同 |
| animation | clip、Lottie、sprite sheet 与动画数据 | 动作脚本可以留在组件/引擎目录 |
| ui | 图标、组件视觉、九宫格与 UI 图集 | 与状态、变体和用途关联 |
| image / video | 照片、插画、纹理或画面视频 | 视频不能替代需要实时响应的空间交互 |
| model / material / texture / shader | 三维模型、材质、纹理与 shader | 保留 GLTF 相对引用、法线/色彩空间、KTX2/Draco/Basis 的解码依赖 |
| audio | BGM、SFX、ambience、voice、source、processed | 按需要细分；留存生成/来源与后处理依据，事件规格不靠文件名猜测 |
| 自定义类别 | 地图、关卡、对话、棋盘、配置等 | 仅在目标需要时建立；目录名和 profile 可扩展 |

例如已有 Three.js 项目的 `fonts/`、`assets/`、`assets/sounds/`、`vendor/three/libs/` 可直接映射，不强制改名为 asset。采用游戏引擎时遵循其已有工程格式、导入器和相邻依赖；节点图、分支树、关卡规则与状态机数据按目标需要组织，不新建通用叙事引擎。

原站下载缓存、参考帧、调用日志和捕获诊断属于 run 证据，不混进发布目录；继续使用 asset-map 和合同 resources 的来源、角色、URI、SHA-256 引用。生成与转换后的文件须与原件分开，并记录使用的方法及真实结果。保存 spec 不等于资源已正确加载或已在目标状态中使用，须用浏览器核对。

工具按缺口选择：先复用已确认的原素材；DOM/CSS/SVG 能达到目标时直接实现；空间/几何需求可调用可用的 3d-stack-selector 指导建模/渲染；图像、视频和时间线工具在确有缺失时使用。声音可用素材库或可用的 soundza、bfxr、BeepBox，再按需要以 FFmpeg 后处理、Web Audio/Tone.js 编排。这里是路由指南，不承诺这些工具已安装或已集成；本版没有新增长驻服务或生成平台。
