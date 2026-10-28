export const repo='https://github.com/PlevanTem/ui-reverse-engineer';
export const release=`${repo}/releases/tag/tiny-skies-v28-showcase`;
export const media=`${repo}/releases/download/tiny-skies-v28-showcase/`;
// Presentation generation status is independent of evaluation dataset readiness.
export const generatedCaseIds=['UIR-0008'];
export const workflows=[
 {id:'query',n:'01',name:'反推需求',en:'INFER THE BRIEF',desc:'从成品界面，梳理可能的需求、功能与风格偏好。',output:'query_instruction.json',prompt:'把这张产品截图反推成需求 JSON，只做需求分析，不生成页面。'},
 {id:'design-md',n:'02',name:'提取设计规范',en:'EXTRACT THE SYSTEM',desc:'把颜色、排版与组件规则，整理成可复用的视觉资产。',output:'DESIGN.md + CSV',prompt:'分析这个网站的视觉规范，生成可复用的 DESIGN.md。'},
 {id:'transfer',n:'03',name:'迁移页面风格',en:'TRANSFER THE STYLE',desc:'以参考风格刷新现有 HTML，保留约定的内容与交互。',output:'transferred.html',prompt:'参考这个截图的视觉风格，迁移到本地的 ./index.html，保留原有文案和交互。'},
 {id:'restore',n:'04',name:'重建参考体验',en:'RESTORE THE EXPERIENCE',desc:'重建页面的视觉和可观察交互，记录迭代、差异与验证。',output:'brief + restored/',prompt:'还原这个网站的主要视觉和交互，交付可运行项目，并说明已验证和未验证的部分。'}
];
export const capabilities={design:{name:'视觉与设计'},interaction:{name:'交互 / 3D'},review:{name:'工程与验证'}};
export const methodRows=[['浏览器保存','留存、离线查看','页面与部分资源副本','检查动态资源和交互是否可用'],['源码与资源获取','复用已有实现','代码、素材与本地运行版本','确认依赖、状态范围和可修改性'],['通用 Agent 生成','快速制作候选','一个候选页面','取证和验收充分程度依任务而定'],['UI Reverse Engineer','结构化重建与审阅','页面 + 状态证据 + 迭代与评测记录','检查输入策略、覆盖与未完成项']];
