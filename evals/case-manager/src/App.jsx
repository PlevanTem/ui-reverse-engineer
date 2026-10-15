import { useEffect, useMemo, useRef, useState } from "react";
import YAML from "yaml";
import bundledDatasetText from "../../cases.yaml?raw";
import { ObservabilityView } from "./ObservabilityView";
import { DEMO_RUNS, RUN_STORAGE_KEY, loadImportedRuns, normalizeReport } from "./observability-data";
import {
  DownloadSimple,
  ArrowDown,
  UploadSimple,
  ArrowUpRight,
  ChartBar,
  Check,
  CheckCircle,
  CaretRight,
  CircleNotch,
  ClipboardText,
  Database,
  FileText,
  Funnel,
  Gauge,
  GridFour,
  Info,
  MagnifyingGlass,
  Plus,
  PencilSimple,
  SlidersHorizontal,
  Tag,
  Trash,
  X,
} from "@phosphor-icons/react";

const STORAGE_KEY = "ui-reverse-engineer-case-manager:v1.2";
const LEGACY_STORAGE_KEY = "ui-reverse-engineer-case-manager:v1.1";
const DIFFICULTY_LABELS = { easy: "简单", medium: "中等", hard: "困难" };
const DIFFICULTY_CLASS = { easy: "easy", medium: "medium", hard: "hard" };
const STATUS_LABELS = { draft: "草稿", ready: "可评测", retired: "已归档" };
const INPUT_LABELS = {
  url: "网页 URL",
  screenshot: "截图",
  video: "录屏",
  source_code: "源码",
  local_html: "本地 HTML",
  design_file: "设计稿",
};
const VIEW_LABELS = { overview: "质量总览", cases: "样本库", stats: "样本统计", traces: "运行追踪", artifacts: "生成结果", evaluations: "评测对比", metrics: "指标面板", audit: "审计记录" };
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeDataset(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("数据集根节点必须是对象。");
  const dataset = {
    schema_version: "1.2",
    ui_types: Array.isArray(value.ui_types) ? value.ui_types : [],
    task_types: Array.isArray(value.task_types) ? value.task_types : [],
    cases: Array.isArray(value.cases) ? value.cases : [],
  };
  const ids = new Set();
  for (const [catalogName, catalog] of [["UI 类型", dataset.ui_types], ["任务类型", dataset.task_types]]) {
    for (const entry of catalog) {
      if (!entry.id || !entry.name) throw new Error(`${catalogName}缺少稳定 ID 或名称。`);
      if (ids.has(`${catalogName}:${entry.id}`)) throw new Error(`${catalogName} ID 重复：${entry.id}`);
      ids.add(`${catalogName}:${entry.id}`);
      entry.description ??= "";
      entry.archived ??= false;
    }
  }
  const caseIds = new Set();
  for (const item of dataset.cases) {
    if (!item.id || !item.title) throw new Error("每条 case 都必须有 ID 和标题。");
    if (caseIds.has(item.id)) throw new Error(`Case ID 重复：${item.id}`);
    caseIds.add(item.id);
    if (!dataset.ui_types.some((entry) => entry.id === item.ui_type_id)) throw new Error(`Case ${item.id} 引用了不存在的 UI 类型：${item.ui_type_id ?? "空值"}`);
    if (!dataset.task_types.some((entry) => entry.id === item.task_type_id)) throw new Error(`Case ${item.id} 引用了不存在的任务类型：${item.task_type_id ?? "空值"}`);
    item.keywords = Array.isArray(item.keywords) ? item.keywords : [];
    item.technology_stack = Array.isArray(item.technology_stack) ? item.technology_stack : [];
    item.input_kinds = Array.isArray(item.input_kinds) ? item.input_kinds : [];
    item.technology_stack_source ??= "unknown";
    item.technology_stack_evidence = Array.isArray(item.technology_stack_evidence) ? item.technology_stack_evidence : [];
    delete item.difficulty_factors;
    item.status ??= "draft";
    item.notes ??= "";
    item.created_at ??= new Date().toISOString();
    item.updated_at ??= item.created_at;
  }
  return dataset;
}

function parseDataset(text) {
  try {
    return normalizeDataset(YAML.parse(text));
  } catch (error) {
    throw new Error(`无法读取 YAML 数据集。${error.message ? ` ${error.message}` : ""}`);
  }
}

function initialDataset() {
  const savedSnapshot = localStorage.getItem(`${STORAGE_KEY}:saved`) ?? localStorage.getItem(`${LEGACY_STORAGE_KEY}:saved`);
  const cached = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
  if (cached) {
    try {
      const dataset = normalizeDataset(JSON.parse(cached));
      // Seed the bundled cases over a pre-seed empty cache once. Preserve an
      // explicitly saved empty dataset and any non-empty browser draft.
      if (dataset.cases.length > 0 || savedSnapshot !== null) return dataset;
    } catch { /* Fall back to the bundled dataset. */ }
  }
  return parseDataset(bundledDatasetText);
}

function initialSavedSnapshot() {
  const saved = localStorage.getItem(`${STORAGE_KEY}:saved`) ?? localStorage.getItem(`${LEGACY_STORAGE_KEY}:saved`);
  if (saved !== null) {
    try { return serializeDataset(parseDataset(saved)); } catch { return saved; }
  }
  return serializeDataset(initialDataset());
}

function serializeDataset(dataset) {
  return YAML.stringify(dataset, { lineWidth: 0 });
}

function slugify(value) {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `type-${Date.now().toString(36)}`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function IconButton({ label, onClick, children, className = "", disabled = false }) {
  return <button type="button" className={`icon-button ${className}`} aria-label={label} title={label} onClick={onClick} disabled={disabled}>{children}</button>;
}

function Field({ label, hint, children, required = false }) {
  return <label className="field"><span className="field-label">{label}{required && <b className="required-mark">*</b>}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}

function TagInput({ value, onChange, placeholder }) {
  const [draft, setDraft] = useState("");
  const add = (text) => {
    const next = text.trim().replace(/,$/, "");
    if (next && !value.includes(next)) onChange([...value, next]);
    setDraft("");
  };
  return <div className="tag-input" onClick={(event) => event.currentTarget.querySelector("input")?.focus()}>
    {value.map((tag) => <span className="input-chip" key={tag}>{tag}<button type="button" aria-label={`移除 ${tag}`} onClick={(event) => { event.stopPropagation(); onChange(value.filter((item) => item !== tag)); }}><X size={12} weight="bold" /></button></span>)}
    <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
      if (["Enter", ","].includes(event.key)) { event.preventDefault(); add(draft); }
      if (event.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
    }} onBlur={() => draft && add(draft)} placeholder={value.length ? "继续添加…" : placeholder} />
  </div>;
}

function emptyCase() {
  return {
    id: "",
    title: "",
    ui_type_id: "",
    task_type_id: "",
    description: "",
    keywords: [],
    url: null,
    technology_stack: [],
    technology_stack_source: "unknown",
    technology_stack_evidence: [],
    difficulty: "medium",
    input_kinds: [],
    status: "draft",
    notes: "",
  };
}

function CaseForm({ initial, dataset, onClose, onSave }) {
  const [form, setForm] = useState(() => ({ ...emptyCase(), ...clone(initial ?? emptyCase()) }));
  const [error, setError] = useState("");
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const submit = (event) => {
    event.preventDefault();
    if (!form.title.trim()) return setError("请填写案例名称。");
    if (!form.ui_type_id) return setError("请选择 UI 类型。");
    if (!form.task_type_id) return setError("请选择任务类型。");
    if (form.url && !/^https?:\/\//i.test(form.url)) return setError("URL 需以 http:// 或 https:// 开头；未知时留空。");
    onSave({ ...form, title: form.title.trim(), description: form.description.trim(), url: form.url?.trim() || null, updated_at: new Date().toISOString() });
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="case-modal" role="dialog" aria-modal="true" aria-labelledby="case-form-title">
      <header className="modal-header"><div><p className="eyebrow">案例信息</p><h2 id="case-form-title">{initial ? "编辑案例" : "新增案例"}</h2></div><IconButton label="关闭" onClick={onClose}><X size={18} /></IconButton></header>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="案例名称" required><input autoFocus value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="例如：订单管理仪表盘" /></Field>
          <Field label="案例 ID" hint="保存时自动生成，创建后保持稳定"><input value={form.id || "保存后自动分配"} readOnly className="readonly-input" /></Field>
          <Field label="UI 类型" required><select value={form.ui_type_id} onChange={(event) => set("ui_type_id", event.target.value)}><option value="">选择页面类型</option>{dataset.ui_types.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="任务类型" required><select value={form.task_type_id} onChange={(event) => set("task_type_id", event.target.value)}><option value="">选择逆向任务</option>{dataset.task_types.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="页面 URL" hint="未知或不适用时留空"><div className="input-with-icon"><input value={form.url ?? ""} onChange={(event) => set("url", event.target.value)} placeholder="https://example.com" /><ArrowUpRight size={16} /></div></Field>
          <div className="field"><div className="field-label-row"><label className="field-label" htmlFor="case-difficulty">难度</label><span className="difficulty-help"><button type="button" aria-label="查看难度分级说明" aria-describedby="difficulty-tooltip"><Info size={13} /></button><span id="difficulty-tooltip" className="difficulty-tooltip" role="tooltip"><strong>综合看五项</strong><span>布局密度 · 交互复杂度 · 素材完整度 · 参考歧义 · 视口范围</span><span><b>简单</b>：结构直观、交互少，参考与素材齐全。</span><span><b>中等</b>：存在局部复杂度，或少量缺失、歧义、多视口要求。</span><span><b>困难</b>：高密度或复杂流程，或多项因素叠加，明显增加还原负担。</span><em>按整体判断，不逐项计分。</em></span></span></div><select id="case-difficulty" aria-label="难度" value={form.difficulty} onChange={(event) => set("difficulty", event.target.value)}><option value="easy">简单</option><option value="medium">中等</option><option value="hard">困难</option></select></div>
          <Field label="描述" hint="简洁说明页面的关键特征"><textarea rows="3" value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="描述页面布局、内容密度或主要交互…" /></Field>
          <Field label="关键词" hint="按 Enter 添加，可用于搜索筛选"><TagInput value={form.keywords} onChange={(value) => set("keywords", value)} placeholder="输入关键词后回车" /></Field>
          <Field label="技术栈" hint="仅填写已知或有证据支持的技术；未知时保持空列表"><TagInput value={form.technology_stack} onChange={(value) => set("technology_stack", value)} placeholder="如 React、Next.js…" /></Field>
          <Field label="技术栈来源"><select value={form.technology_stack_source} onChange={(event) => set("technology_stack_source", event.target.value)}><option value="unknown">未知</option><option value="manual">人工确认</option><option value="url_analysis">URL 分析</option><option value="source_analysis">源码分析</option></select></Field>
          <Field label="技术栈证据" hint="可记录判断依据；没有证据时留空"><TagInput value={form.technology_stack_evidence} onChange={(value) => set("technology_stack_evidence", value)} placeholder="如页面源码中的框架标记…" /></Field>
          <Field label="输入材料" hint="可多选"><div className="check-options">{Object.entries(INPUT_LABELS).map(([value, label]) => <label className="check-option" key={value}><input type="checkbox" checked={form.input_kinds.includes(value)} onChange={(event) => set("input_kinds", event.target.checked ? [...form.input_kinds, value] : form.input_kinds.filter((item) => item !== value))} />{label}</label>)}</div></Field>
          <Field label="状态"><select value={form.status} onChange={(event) => set("status", event.target.value)}><option value="draft">草稿</option><option value="ready">可评测</option><option value="retired">已归档</option></select></Field>
          <Field label="备注"><textarea rows="2" value={form.notes} onChange={(event) => set("notes", event.target.value)} placeholder="补充说明、证据或边界…" /></Field>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="modal-footer"><span className="muted">未知信息保持为空，不需要猜测补全。</span><div><button type="button" className="button button-quiet" onClick={onClose}>取消</button><button className="button button-primary" type="submit"><Check size={16} />保存案例</button></div></footer>
      </form>
    </section>
  </div>;
}

function TypeManager({ dataset, onClose, onChange }) {
  const [activeCatalog, setActiveCatalog] = useState("ui_types");
  const [draftName, setDraftName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const catalog = dataset[activeCatalog];
  const kindLabel = activeCatalog === "ui_types" ? "UI 类型" : "任务类型";
  const addType = (event) => {
    event.preventDefault();
    const name = draftName.trim();
    if (!name) return;
    const id = slugify(name);
    if (catalog.some((item) => item.id === id || item.name.toLowerCase() === name.toLowerCase())) return setError("该类型已存在，请换一个名称。");
    onChange({ ...dataset, [activeCatalog]: [...catalog, { id, name, description: "", archived: false }] });
    setDraftName(""); setError("");
  };
  const saveName = (id) => {
    const name = editingName.trim();
    if (!name) return setError("类型名称不能为空。");
    if (catalog.some((item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase())) return setError("该类型名称已存在。");
    onChange({ ...dataset, [activeCatalog]: catalog.map((item) => item.id === id ? { ...item, name } : item) });
    setEditingId(null); setError("");
  };
  const deleteType = (entry) => {
    const refKey = activeCatalog === "ui_types" ? "ui_type_id" : "task_type_id";
    const usedBy = dataset.cases.filter((item) => item[refKey] === entry.id).length;
    setPendingRemoval({ entry, catalogKey: activeCatalog, usedBy });
  };
  const confirmRemoval = () => {
    const { entry, catalogKey, usedBy } = pendingRemoval;
    const source = dataset[catalogKey];
    const nextCatalog = usedBy
      ? source.map((item) => item.id === entry.id ? { ...item, archived: true } : item)
      : source.filter((item) => item.id !== entry.id);
    onChange({ ...dataset, [catalogKey]: nextCatalog });
    setPendingRemoval(null);
  };
  const restoreType = (entry) => onChange({ ...dataset, [activeCatalog]: catalog.map((item) => item.id === entry.id ? { ...item, archived: false } : item) });

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="type-modal" role="dialog" aria-modal="true" aria-labelledby="type-manager-title">
    <header className="modal-header"><div><p className="eyebrow">字典管理</p><h2 id="type-manager-title">维护类型</h2></div><IconButton label="关闭" onClick={onClose}><X size={18} /></IconButton></header>
    <div className="type-tabs"><button className={activeCatalog === "ui_types" ? "active" : ""} onClick={() => setActiveCatalog("ui_types")}>UI 类型 <span>{dataset.ui_types.length}</span></button><button className={activeCatalog === "task_types" ? "active" : ""} onClick={() => setActiveCatalog("task_types")}>任务类型 <span>{dataset.task_types.length}</span></button></div>
    <p className="type-help">{activeCatalog === "ui_types" ? "描述样本页面属于哪类产品或页面形态，例如仪表盘、电商、内容站。" : "描述要执行哪种 UI 逆向任务，例如页面还原、风格迁移或需求反推。"}</p>
    <form className="add-type-form" onSubmit={addType}><input value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder={`新增${kindLabel}`} /><button className="button button-primary" type="submit"><Plus size={16} />新增类型</button></form>
    {error && <p className="form-error">{error}</p>}
    <div className="type-list">{catalog.map((entry) => <div className={`type-row ${entry.archived ? "is-archived" : ""}`} key={entry.id}>
      <div className="type-copy"><span className="type-name">{editingId === entry.id ? <input value={editingName} onChange={(event) => setEditingName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && saveName(entry.id)} autoFocus /> : entry.name}</span><code>{entry.id}</code>{entry.archived && <span className="archive-pill">已归档</span>}</div>
      <div className="type-actions">{editingId === entry.id ? <><IconButton label="保存名称" onClick={() => saveName(entry.id)}><Check size={16} /></IconButton><IconButton label="取消修改" onClick={() => setEditingId(null)}><X size={16} /></IconButton></> : <><IconButton label={`修改${entry.name}`} onClick={() => { setEditingId(entry.id); setEditingName(entry.name); }}><PencilSimple size={16} /></IconButton>{entry.archived ? <button className="text-action" onClick={() => restoreType(entry)}>恢复</button> : null}<IconButton label={`${entry.name}删除或归档`} onClick={() => deleteType(entry)}><Trash size={16} /></IconButton></>}</div>
    </div>)}</div>
    <footer className="modal-footer"><span className="muted">改名保留稳定 ID；被 case 使用的类型只能归档。</span><button className="button button-quiet" onClick={onClose}>完成</button></footer>
  </section>{pendingRemoval && <ConfirmDialog title={pendingRemoval.usedBy ? "归档此类型？" : "删除此类型？"} message={pendingRemoval.usedBy ? `「${pendingRemoval.entry.name}」仍被 ${pendingRemoval.usedBy} 条 case 使用。归档可保留历史关联。` : `「${pendingRemoval.entry.name}」当前没有 case 使用，删除后将从类型目录移除。`} confirmLabel={pendingRemoval.usedBy ? "归档类型" : "删除类型"} onCancel={() => setPendingRemoval(null)} onConfirm={confirmRemoval} />}</div>;
}

function ConfirmDialog({ title, message, confirmLabel, onCancel, onConfirm }) {
  return <div className="confirm-layer"><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message"><div className="confirm-icon"><Trash size={19} /></div><h2 id="confirm-title">{title}</h2><p id="confirm-message">{message}</p><div className="confirm-actions"><button className="button button-quiet" onClick={onCancel}>取消</button><button className="button button-danger" onClick={onConfirm}>{confirmLabel}</button></div></section></div>;
}

function CaseDetail({ item, dataset, onClose, onEdit, onDelete }) {
  const uiType = dataset.ui_types.find((type) => type.id === item.ui_type_id)?.name ?? "未分类";
  const taskType = dataset.task_types.find((type) => type.id === item.task_type_id)?.name ?? "未分类";
  return <div className="detail-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <header className="detail-header"><div className="breadcrumb"><button onClick={onClose}>样本库</button><CaretRight size={12} /><span>{item.id}</span></div><IconButton label="关闭详情" onClick={onClose}><X size={18} /></IconButton></header>
      <div className="detail-content"><div className="detail-title-row"><div><span className={`difficulty ${DIFFICULTY_CLASS[item.difficulty]}`}>{DIFFICULTY_LABELS[item.difficulty] ?? "未标注难度"}</span><span className={`status-pill status-${item.status}`}>{STATUS_LABELS[item.status] ?? item.status}</span></div><div className="detail-actions"><button className="button button-quiet" onClick={() => onDelete(item)}><Trash size={15} />删除</button><button className="button button-primary" onClick={() => onEdit(item)}>编辑</button></div></div>
        <h2 id="detail-title">{item.title}</h2><p className="detail-description">{item.description || "尚未填写描述。"}</p>
        <section className="detail-section"><h3>分类</h3><div className="detail-pair"><span>UI 类型</span><strong>{uiType}</strong></div><div className="detail-pair"><span>任务类型</span><strong>{taskType}</strong></div></section>
        <section className="detail-section"><h3>参考来源</h3>{item.url ? <a className="url-link" href={item.url} target="_blank" rel="noreferrer">{item.url}<ArrowUpRight size={14} /></a> : <span className="muted">没有录入 URL</span>}<div className="detail-tag-row">{item.input_kinds?.map((kind) => <span className="soft-tag" key={kind}>{INPUT_LABELS[kind] ?? kind}</span>)}</div></section>
        <section className="detail-section"><h3>关键词</h3><div className="detail-tag-row">{item.keywords?.length ? item.keywords.map((keyword) => <span className="keyword-tag" key={keyword}>{keyword}</span>) : <span className="muted">未添加关键词</span>}</div></section>
        <section className="detail-section"><h3>技术栈 <span className="source-badge">{item.technology_stack_source === "unknown" ? "未确认" : item.technology_stack_source === "manual" ? "人工确认" : "分析记录"}</span></h3><div className="detail-tag-row">{item.technology_stack?.length ? item.technology_stack.map((tech) => <span className="stack-tag" key={tech}>{tech}</span>) : <span className="muted">未知，保持空列表</span>}</div>{item.technology_stack_evidence?.length > 0 && <p className="evidence-note">{item.technology_stack_evidence.join(" · ")}</p>}</section>
        {item.notes && <section className="detail-section"><h3>备注</h3><p className="detail-description">{item.notes}</p></section>}
        <section className="detail-section detail-meta"><div><span>创建日期</span><strong>{formatDate(item.created_at)}</strong></div><div><span>最近修改</span><strong>{formatDate(item.updated_at)}</strong></div></section>
      </div>
    </aside>
  </div>;
}

function StatBar({ name, count, total, color = "blue" }) {
  const percent = total ? Math.max(2, Math.round((count / total) * 100)) : 0;
  return <div className="stat-bar-row"><div className="stat-bar-label"><span>{name}</span><strong>{count}</strong></div><div className="stat-bar-track"><i className={`bar-${color}`} style={{ width: `${percent}%` }} /></div></div>;
}

export function App() {
  const [dataset, setDataset] = useState(initialDataset);
  const [savedSnapshot, setSavedSnapshot] = useState(initialSavedSnapshot);
  const [fileHandle, setFileHandle] = useState(null);
  const [view, setView] = useState("overview");
  const [importedRuns, setImportedRuns] = useState(loadImportedRuns);
  const [demoMode, setDemoMode] = useState(() => localStorage.getItem("ui-reverse-engineer-observability:mode") !== "real");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ uiType: "all", taskType: "all", difficulty: "all", status: "all" });
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [editingCase, setEditingCase] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showTypes, setShowTypes] = useState(false);
  const [pendingCaseDelete, setPendingCaseDelete] = useState(null);
  const [toast, setToast] = useState("");
  const [fileStatus, setFileStatus] = useState("内置样本集（来自 cases.yaml）");
  const importRef = useRef(null);
  const fileInputRef = useRef(null);
  const reportInputRef = useRef(null);
  const searchRef = useRef(null);
  const snapshot = useMemo(() => serializeDataset(dataset), [dataset]);
  const isDirty = snapshot !== savedSnapshot;
  const selectedCase = dataset.cases.find((item) => item.id === selectedCaseId) ?? null;
  const platformRuns = demoMode ? DEMO_RUNS : importedRuns;
  const isDatasetView = view === "cases" || view === "stats";

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, snapshot);
  }, [snapshot]);

  useEffect(() => {
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(importedRuns));
  }, [importedRuns]);

  useEffect(() => {
    localStorage.setItem("ui-reverse-engineer-observability:mode", demoMode ? "demo" : "real");
  }, [demoMode]);

  useEffect(() => {
    const navigate = (event) => setView(event.detail);
    window.addEventListener("quality:navigate", navigate);
    return () => window.removeEventListener("quality:navigate", navigate);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const filteredCases = useMemo(() => {
    const text = query.trim().toLowerCase();
    return dataset.cases.filter((item) => {
      const uiName = dataset.ui_types.find((entry) => entry.id === item.ui_type_id)?.name ?? "";
      const taskName = dataset.task_types.find((entry) => entry.id === item.task_type_id)?.name ?? "";
      const searchable = [item.id, item.title, item.description, uiName, taskName, ...(item.keywords ?? []), ...(item.technology_stack ?? [])].join(" ").toLowerCase();
      return (!text || searchable.includes(text))
        && (filters.uiType === "all" || item.ui_type_id === filters.uiType)
        && (filters.taskType === "all" || item.task_type_id === filters.taskType)
        && (filters.difficulty === "all" || item.difficulty === filters.difficulty)
        && (filters.status === "all" || item.status === filters.status);
    }).sort((a, b) => Date.parse(b.updated_at ?? "") - Date.parse(a.updated_at ?? ""));
  }, [dataset, filters, query]);

  const readyCount = dataset.cases.filter((item) => item.status === "ready").length;
  const draftCount = dataset.cases.filter((item) => item.status === "draft").length;
  const activeCases = dataset.cases.filter((item) => item.status !== "retired");
  const difficultyCounts = Object.keys(DIFFICULTY_LABELS).map((key) => [key, activeCases.filter((item) => item.difficulty === key).length]);

  const commitDataset = (next, message = "更改已暂存") => {
    const normalized = normalizeDataset(next);
    setDataset(normalized);
    setToast(message);
  };

  const connectDataset = async () => {
    if (!window.showOpenFilePicker) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: "评测案例集", accept: { "application/json": [".yaml", ".yml", ".json"] } }],
      });
      const file = await handle.getFile();
      const next = parseDataset(await file.text());
      setFileHandle(handle);
      commitDataset(next, "数据集已载入");
      setSavedSnapshot(serializeDataset(next));
      localStorage.setItem(`${STORAGE_KEY}:saved`, serializeDataset(next));
      setFileStatus(file.name);
    } catch (error) {
      if (error?.name !== "AbortError") setToast(`载入失败：${error.message}`);
    }
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const next = parseDataset(await file.text());
      setFileHandle(null);
      commitDataset(next, "数据集已导入；请保存到文件");
      setFileStatus(`${file.name}（待另存）`);
    } catch (error) { setToast(error.message); }
    event.target.value = "";
  };

  const saveDataset = async () => {
    const output = serializeDataset(dataset);
    try {
      if (fileHandle) {
        let permission = await fileHandle.queryPermission({ mode: "readwrite" });
        if (permission !== "granted") permission = await fileHandle.requestPermission({ mode: "readwrite" });
        if (permission !== "granted") throw new Error("未获得写入该文件的权限。");
        const writable = await fileHandle.createWritable();
        await writable.write(output);
        await writable.close();
        setToast("已保存到 cases.yaml");
      } else {
        const blob = new Blob([output], { type: "application/yaml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "cases.yaml";
        link.click();
        URL.revokeObjectURL(url);
        setToast("数据集已下载为 cases.yaml");
      }
      setSavedSnapshot(output);
      localStorage.setItem(`${STORAGE_KEY}:saved`, output);
    } catch (error) { setToast(`保存失败：${error.message}`); }
  };

  const openImport = () => importRef.current?.click();
  const importReports = async (event) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    try {
      const reports = await Promise.all(files.map(async (file) => normalizeReport(JSON.parse(await file.text()))));
      setImportedRuns((previous) => {
        const byId = new Map(previous.map((item) => [item.id, item]));
        reports.forEach((item) => byId.set(item.id, item));
        return Array.from(byId.values());
      });
      setDemoMode(false);
      setView("traces");
      setToast(`已导入 ${reports.length} 条 Restore 报告`);
    } catch (error) { setToast(`导入失败：${error.message}`); }
    event.target.value = "";
  };
  const saveCase = (form) => {
    const isEdit = Boolean(form.id);
    const nextIdNumber = Math.max(0, ...dataset.cases.map((entry) => Number(entry.id.match(/(\d+)$/)?.[1] ?? 0))) + 1;
    const item = {
      ...form,
      id: form.id || `UIR-${String(nextIdNumber).padStart(4, "0")}`,
      created_at: form.created_at || new Date().toISOString(),
    };
    const next = isEdit ? dataset.cases.map((entry) => entry.id === item.id ? item : entry) : [...dataset.cases, item];
    commitDataset({ ...dataset, cases: next }, isEdit ? "案例已更新，记得保存数据集" : "案例已新增，记得保存数据集");
    setEditingCase(null); setIsCreating(false); setSelectedCaseId(item.id);
  };

  const deleteCase = (item) => {
    setPendingCaseDelete(item);
  };

  const confirmDeleteCase = () => {
    const item = pendingCaseDelete;
    if (!item) return;
    commitDataset({ ...dataset, cases: dataset.cases.filter((entry) => entry.id !== item.id) }, "案例已删除，记得保存数据集");
    setSelectedCaseId(null);
    setPendingCaseDelete(null);
  };

  const resetFilters = () => { setQuery(""); setFilters({ uiType: "all", taskType: "all", difficulty: "all", status: "all" }); };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-lockup"><div className="brand-mark"><GridFour size={20} weight="fill" /></div><div><strong>还原质量中心</strong><span>QUALITY OBSERVATORY</span></div></div>
      <div className="workspace-label">工作台</div>
      <nav className="primary-nav" aria-label="主导航">
        <button className={view === "overview" ? "nav-item active" : "nav-item"} onClick={() => setView("overview")}><Gauge size={18} weight={view === "overview" ? "fill" : "regular"} /><span>质量总览</span></button>
        <div className="nav-group-label">资产与执行</div>
        <button className={view === "cases" ? "nav-item active" : "nav-item"} onClick={() => setView("cases")}><Database size={18} weight={view === "cases" ? "fill" : "regular"} /><span>样本库</span><span className="nav-count">{dataset.cases.length}</span></button>
        <button className={view === "stats" ? "nav-item active" : "nav-item"} onClick={() => setView("stats")}><ChartBar size={18} weight={view === "stats" ? "fill" : "regular"} /><span>样本统计</span></button>
        <button className={view === "traces" ? "nav-item active" : "nav-item"} onClick={() => setView("traces")}><CircleNotch size={18} weight={view === "traces" ? "fill" : "regular"} /><span>运行追踪</span><span className="nav-count">{platformRuns.length}</span></button>
        <button className={view === "artifacts" ? "nav-item active" : "nav-item"} onClick={() => setView("artifacts")}><FileText size={18} weight={view === "artifacts" ? "fill" : "regular"} /><span>生成结果</span></button>
        <div className="nav-group-label">质量决策</div>
        <button className={view === "evaluations" ? "nav-item active" : "nav-item"} onClick={() => setView("evaluations")}><ClipboardText size={18} weight={view === "evaluations" ? "fill" : "regular"} /><span>评测对比</span></button>
        <button className={view === "metrics" ? "nav-item active" : "nav-item"} onClick={() => setView("metrics")}><ChartBar size={18} weight={view === "metrics" ? "fill" : "regular"} /><span>指标面板</span></button>
        <button className={view === "audit" ? "nav-item active" : "nav-item"} onClick={() => setView("audit")}><ClipboardText size={18} weight={view === "audit" ? "fill" : "regular"} /><span>审计记录</span></button>
      </nav>
      <div className="sidebar-bottom">
        <div className="dataset-status"><span className={isDirty ? "connection-dot dirty" : fileHandle ? "connection-dot" : "connection-dot idle"} /><div><strong>{isDirty ? "有未保存更改" : fileHandle ? "数据文件已连接" : "本地草稿"}</strong><span>{fileStatus}</span></div></div>
        <button className="nav-item settings-link" onClick={() => setShowTypes(true)}><SlidersHorizontal size={17} /><span>类型管理</span><CaretRight size={14} className="nav-trailing" /></button>
        <div className="sidebar-footnote">Case Schema v1.2 <span>·</span> Platform v0.1</div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="topbar-breadcrumb"><span>还原质量中心</span><CaretRight size={13} /><strong>{VIEW_LABELS[view]}</strong></div><div className="topbar-actions">
        {isDatasetView ? <><button className="button button-quiet" onClick={connectDataset}><UploadSimple size={16} />打开数据集</button>
        <button className="button button-quiet" onClick={openImport}><DownloadSimple size={16} />导入</button>
        <button className={`button ${isDirty ? "button-save" : "button-quiet"}`} onClick={saveDataset}><CheckCircle size={16} />{fileHandle ? "保存" : "导出 cases.yaml"}</button></> : <><span className="qo-top-label">数据范围</span><select className="qo-mode-select" aria-label="数据范围" value={demoMode ? "demo" : "real"} onChange={(event) => setDemoMode(event.target.value === "demo")}><option value="demo">演示数据</option><option value="real">已导入报告</option></select><button className="button button-primary" onClick={() => reportInputRef.current?.click()}><UploadSimple size={16} />导入报告</button></>}
        <input ref={fileInputRef} type="file" accept=".yaml,.yml,.json,application/json" hidden onChange={handleImport} />
        <input ref={importRef} type="file" accept=".yaml,.yml,.json,application/json" hidden onChange={handleImport} />
        <input ref={reportInputRef} type="file" accept=".json,application/json" multiple hidden onChange={importReports} />
      </div></header>

      {!isDatasetView && <div className={`qo-data-banner ${demoMode ? "qo-demo-banner" : ""}`}><Info size={16} /><span>{demoMode ? "演示模式 · 运行、分数、审批和审计事件均为合成数据，不代表真实评测结果。" : importedRuns.length ? `本地导入 ${importedRuns.length} 条报告 · 仅解析 report.json；证据文件和产物需另行保管。` : "暂无真实运行报告。导入 Restore v0.2 的 report.json 后可查看真实记录。"}</span>{demoMode && <button onClick={() => setDemoMode(false)}>查看真实数据 <CaretRight size={12} /></button>}</div>}

      {view === "cases" ? <section className="page-content">
        <div className="page-heading"><div><p className="eyebrow">评测资产</p><h1>样本库</h1><p>管理页面样本与逆向任务，保持来源可查、难度有据。</p></div><button className="button button-primary add-case-button" onClick={() => setIsCreating(true)}><Plus size={17} weight="bold" />新增案例</button></div>
        <div className="summary-strip"><div className="summary-item"><span className="summary-icon blue"><ClipboardText size={18} /></span><div><strong>{dataset.cases.length}</strong><span>全部案例</span></div></div><div className="summary-item"><span className="summary-icon green"><CheckCircle size={18} /></span><div><strong>{readyCount}</strong><span>可用于评测</span></div></div><div className="summary-item"><span className="summary-icon amber"><FileText size={18} /></span><div><strong>{draftCount}</strong><span>待补充</span></div></div><div className="summary-item summary-caption"><span>可评测占比</span><strong>{dataset.cases.length ? `${Math.round(dataset.cases.filter((item) => item.status === "ready").length / dataset.cases.length * 100)}%` : "—"}</strong></div></div>
        <div className="filter-toolbar"><div className="search-field"><MagnifyingGlass size={17} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、关键词、技术栈…" /><kbd>Ctrl K</kbd></div><div className="filter-group"><Funnel size={15} /><select aria-label="筛选 UI 类型" value={filters.uiType} onChange={(event) => setFilters({ ...filters, uiType: event.target.value })}><option value="all">全部 UI 类型</option>{dataset.ui_types.filter((item) => !item.archived).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><select aria-label="筛选任务类型" value={filters.taskType} onChange={(event) => setFilters({ ...filters, taskType: event.target.value })}><option value="all">全部任务类型</option>{dataset.task_types.filter((item) => !item.archived).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><select aria-label="筛选难度" value={filters.difficulty} onChange={(event) => setFilters({ ...filters, difficulty: event.target.value })}><option value="all">全部难度</option>{Object.entries(DIFFICULTY_LABELS).map(([key, name]) => <option value={key} key={key}>{name}</option>)}</select><select aria-label="筛选状态" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="all">全部状态</option>{Object.entries(STATUS_LABELS).map(([key, name]) => <option value={key} key={key}>{name}</option>)}</select><button className="text-action reset-button" onClick={resetFilters}>重置</button></div></div>
        <div className="table-shell"><div className="table-topline"><div><strong>全部样本</strong><span>{filteredCases.length} 条记录</span></div><div className="table-tools"><ArrowDown size={13} /><span>最近更新在前</span></div></div>
          {filteredCases.length ? <div className="table-scroll"><table><thead><tr><th>案例</th><th>UI 类型</th><th>任务类型</th><th>技术栈</th><th>难度</th><th>状态</th><th>更新日期</th><th></th></tr></thead><tbody>{filteredCases.map((item) => <tr key={item.id} onClick={() => setSelectedCaseId(item.id)} tabIndex="0" onKeyDown={(event) => event.key === "Enter" && setSelectedCaseId(item.id)}><td><div className="case-cell"><span className="case-file-icon"><FileText size={16} /></span><div><strong>{item.title}</strong><small>{item.id}<span>·</span>{item.keywords?.slice(0, 2).join(" / ") || item.description || "暂无描述"}</small></div></div></td><td><span className="type-text">{dataset.ui_types.find((entry) => entry.id === item.ui_type_id)?.name ?? "未分类"}</span></td><td><span className="task-tag">{dataset.task_types.find((entry) => entry.id === item.task_type_id)?.name ?? "未分类"}</span></td><td><div className="stack-cell">{item.technology_stack?.length ? item.technology_stack.slice(0, 2).map((tech) => <span key={tech}>{tech}</span>) : <span className="muted">未标注</span>}{item.technology_stack?.length > 2 && <em>+{item.technology_stack.length - 2}</em>}</div></td><td><span className={`difficulty ${DIFFICULTY_CLASS[item.difficulty]}`}>{DIFFICULTY_LABELS[item.difficulty] ?? "未标注"}</span></td><td><span className={`status-pill status-${item.status}`}>{STATUS_LABELS[item.status] ?? item.status}</span></td><td className="date-cell">{formatDate(item.updated_at)}</td><td><CaretRight size={15} className="row-caret" /></td></tr>)}</tbody></table></div> : <div className="empty-state"><div className="empty-illustration"><Database size={27} weight="light" /></div><h2>{dataset.cases.length ? "没有符合条件的案例" : "样本库还没有案例"}</h2><p>{dataset.cases.length ? "换个关键词或清除筛选条件试试。" : "从一条真实、可复现的页面样本开始。未知的 URL 或技术栈可以留空。"}</p><div className="empty-actions">{dataset.cases.length ? <button className="button button-quiet" onClick={resetFilters}>清除筛选</button> : <button className="button button-primary" onClick={() => setIsCreating(true)}><Plus size={16} />录入第一个案例</button>}<button className="text-action" onClick={() => setShowTypes(true)}>先维护类型</button></div></div>}
          <footer className="table-footer"><span>显示 {filteredCases.length} / {dataset.cases.length} 条</span><span>共 {dataset.cases.length} 条案例</span></footer>
        </div>
      </section> : view === "stats" ? <section className="page-content stats-page">
        <div className="page-heading"><div><p className="eyebrow">数据概览</p><h1>统计分析</h1><p>查看样本构成，识别覆盖不足的页面类型与任务类型。</p></div><button className="button button-quiet" onClick={saveDataset}><DownloadSimple size={16} />导出数据</button></div>
        <div className="stats-kpis"><article className="stat-card"><span>案例总数</span><strong>{dataset.cases.length}</strong><small>所有状态</small></article><article className="stat-card"><span>可评测案例</span><strong>{readyCount}</strong><small>已满足运行条件</small></article><article className="stat-card"><span>UI 类型覆盖</span><strong>{new Set(activeCases.map((item) => item.ui_type_id)).size}</strong><small>当前有样本的页面类型</small></article><article className="stat-card"><span>任务类型覆盖</span><strong>{new Set(activeCases.map((item) => item.task_type_id)).size}</strong><small>当前有样本的任务类型</small></article></div>
        <div className="stats-grid"><article className="stats-panel"><div className="panel-heading"><div><h2>按 UI 类型</h2><p>页面 / 产品形态</p></div><Tag size={18} /></div><div className="bars-list">{dataset.ui_types.filter((item) => !item.archived).map((type) => <StatBar key={type.id} name={type.name} count={activeCases.filter((item) => item.ui_type_id === type.id).length} total={activeCases.length} />)}</div>{!activeCases.length && <p className="chart-empty">录入案例后显示分布</p>}</article>
          <article className="stats-panel"><div className="panel-heading"><div><h2>按任务类型</h2><p>逆向工作流</p></div><Gauge size={18} /></div><div className="bars-list">{dataset.task_types.filter((item) => !item.archived).map((type) => <StatBar key={type.id} name={type.name} count={activeCases.filter((item) => item.task_type_id === type.id).length} total={activeCases.length} color="teal" />)}</div>{!activeCases.length && <p className="chart-empty">录入案例后显示分布</p>}</article>
          <article className="stats-panel"><div className="panel-heading"><div><h2>难度分布</h2><p>按所有未归档案例统计</p></div><ChartBar size={18} /></div><div className="bars-list">{difficultyCounts.map(([key, count]) => <StatBar key={key} name={DIFFICULTY_LABELS[key]} count={count} total={activeCases.length} color={key === "hard" ? "amber" : key === "medium" ? "teal" : "blue"} />)}</div>{!activeCases.length && <p className="chart-empty">录入案例后显示分布</p>}</article>
          <article className="stats-panel"><div className="panel-heading"><div><h2>常见技术栈</h2><p>按标签出现次数</p></div><SlidersHorizontal size={18} /></div><div className="tech-cloud">{Object.entries(activeCases.flatMap((item) => item.technology_stack ?? []).reduce((acc, name) => ({ ...acc, [name]: (acc[name] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, count]) => <span className="tech-stat" key={name}>{name}<b>{count}</b></span>)}</div>{!activeCases.some((item) => item.technology_stack?.length) && <p className="chart-empty">尚无已确认的技术栈数据</p>}</article>
        </div>
        <div className="stats-note"><span className="note-icon"><CircleNotch size={16} /></span><p>图表依据当前载入的数据集实时计算。草稿和可评测案例参与分布，已归档案例默认排除。</p></div>
      </section> : <ObservabilityView view={view} runs={platformRuns} cases={dataset.cases} />}
    </main>

    {selectedCase && <CaseDetail item={selectedCase} dataset={dataset} onClose={() => setSelectedCaseId(null)} onEdit={(item) => { setSelectedCaseId(null); setEditingCase(item); }} onDelete={deleteCase} />}
    {(isCreating || editingCase) && <CaseForm initial={editingCase} dataset={dataset} onClose={() => { setIsCreating(false); setEditingCase(null); }} onSave={saveCase} />}
    {showTypes && <TypeManager dataset={dataset} onClose={() => setShowTypes(false)} onChange={(next) => commitDataset(next, "类型已更新，记得保存数据集")} />}
    {pendingCaseDelete && <ConfirmDialog title="删除此案例？" message={`「${pendingCaseDelete.title}」将从当前数据集移除。保存数据集后才会写入文件。`} confirmLabel="删除案例" onCancel={() => setPendingCaseDelete(null)} onConfirm={confirmDeleteCase} />}
    {toast && <div className="toast" role="status"><CheckCircle size={17} />{toast}</div>}
  </div>;
}
