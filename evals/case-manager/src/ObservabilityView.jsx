import { useMemo, useState } from "react";
import {
  ArrowUpRight, CaretRight, ChartBar, CheckCircle, CircleNotch, ClipboardText,
  Database, FileText, Funnel, Gauge, Info, MagnifyingGlass, X,
} from "@phosphor-icons/react";
import { auditEvents, EVAL_DIMENSIONS } from "./observability-data";

const STOP_LABELS = {
  target_reached: "达到目标", plateau: "收益停滞", cycle_detected: "循环振荡",
  budget_exhausted: "预算用尽", blocked: "受阻", failed: "失败", unknown: "未知",
};
const DECISION_LABELS = { keep: "保留", revert: "回退", inconclusive: "待判" };
const STATUS_LABELS = { pass: "暂定通过", fail: "未通过", incomplete: "未完成", unknown: "未知" };
const TITLE = {
  overview: ["质量总览", "从样本到交付，检查质量、证据和运行状态。"],
  traces: ["运行追踪", "回看每轮修复假设、验证决定和停止原因。"],
  artifacts: ["生成结果", "按产物定位对应的参考、过程与最终评测。"],
  evaluations: ["评测对比", "以独立 E2E 五维分数比较方案，保留缺测和校准状态。"],
  metrics: ["指标面板", "按方案查看质量和迭代效率；仅计算有记录的结果。"],
  audit: ["审计记录", "按时间追溯运行、评测和审批事件及其来源。"],
};

function date(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "—" : new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(parsed);
}
function shortHash(value) { return value ? `${value.slice(0, 12)}…` : "未记录"; }
function score(value) { return Number.isFinite(value) ? Math.round(value) : "—"; }
function Status({ value, type = "eval" }) {
  const label = type === "stop" ? STOP_LABELS[value] ?? value : STATUS_LABELS[value] ?? value;
  const tone = type === "stop" ? value === "target_reached" ? "good" : value === "failed" ? "bad" : "warm" : value === "pass" ? "good" : value === "fail" ? "bad" : "neutral";
  return <span className={`qo-status qo-${tone}`}><i />{label}</span>;
}
function Intro({ view, children }) {
  return <div className="qo-intro"><div><p className="eyebrow">QUALITY / OBSERVABILITY</p><h1>{TITLE[view][0]}</h1><p>{TITLE[view][1]}</p></div>{children}</div>;
}
function Panel({ title, caption, children, action }) {
  return <section className="qo-panel"><div className="qo-panel-head"><div><h2>{title}</h2>{caption && <p>{caption}</p>}</div>{action}</div>{children}</section>;
}
function Empty({ title, message, icon: Icon = CircleNotch }) {
  return <div className="qo-empty"><span><Icon size={25} weight="light" /></span><h3>{title}</h3><p>{message}</p></div>;
}
function Kpi({ icon: Icon, label, value, detail, tone = "blue" }) {
  return <article className="qo-kpi"><div className={`qo-kpi-icon qo-icon-${tone}`}><Icon size={18} /></div><p>{label}</p><strong>{value}</strong><small>{detail}</small></article>;
}
function RunTable({ runs, cases, onSelect, compact = false }) {
  if (!runs.length) return <Empty title="暂无运行记录" message="切换演示数据，或导入 Restore v0.2 的 report.json。" icon={ClipboardText} />;
  return <div className="qo-table-wrap"><table className="qo-table"><thead><tr><th>运行 / 案例</th><th>方案</th><th>Loop 停止</th>{!compact && <th>修复轮次</th>}<th>独立 E2E</th><th>分数</th><th>时间</th><th /></tr></thead><tbody>{runs.map((run) => <tr key={run.id} tabIndex="0" onClick={() => onSelect(run)} onKeyDown={(event) => event.key === "Enter" && onSelect(run)}><td><div className="qo-table-id"><span className="qo-file-icon"><FileText size={16} /></span><div><strong>{run.id}</strong><small>{cases.find((item) => item.id === run.caseId)?.title ?? run.caseId ?? "未关联案例"}</small></div></div></td><td>{run.variant}</td><td><Status value={run.loopStop} type="stop" /></td>{!compact && <td>{run.rounds.length} 轮</td>}<td><Status value={run.e2e.status} /></td><td className="qo-score-cell">{score(run.e2e.total)}<small>{run.e2e.total == null ? "" : "/100"}</small></td><td className="qo-date">{date(run.startedAt)}</td><td><CaretRight size={15} /></td></tr>)}</tbody></table></div>;
}
function RunDrawer({ run, cases, onClose }) {
  const [tab, setTab] = useState("trace");
  const linkedCase = cases.find((item) => item.id === run.caseId);
  return <div className="detail-backdrop qo-drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="detail-panel qo-drawer" role="dialog" aria-modal="true" aria-label={`运行 ${run.id} 详情`}><header className="detail-header"><div className="breadcrumb"><button onClick={onClose}>运行记录</button><CaretRight size={12} /><span>{run.id}</span></div><button className="icon-button" aria-label="关闭运行详情" onClick={onClose}><X size={18} /></button></header><div className="qo-drawer-scroll"><div className="qo-drawer-title"><p className="eyebrow">RUN INSPECTION</p><h2>{run.id}</h2><p>{linkedCase?.title ?? run.caseId ?? "未关联案例"}</p><div className="qo-pill-row"><Status value={run.loopStop} type="stop" /><Status value={run.e2e.status} />{run.demo && <span className="qo-source-badge">演示数据</span>}</div></div>
    <div className="qo-inspector-grid"><div><small>方案</small><strong>{run.variant}</strong></div><div><small>总分</small><strong>{score(run.e2e.total)}{run.e2e.total == null ? "" : "/100"}</strong></div><div><small>状态覆盖</small><strong>{run.stateCount}</strong></div><div><small>产物哈希</small><strong title={run.artifactHash ?? ""}>{shortHash(run.artifactHash)}</strong></div></div>
    <div className="qo-drawer-tabs" role="tablist"><button role="tab" aria-selected={tab === "trace"} className={tab === "trace" ? "active" : ""} onClick={() => setTab("trace")}>修复轨迹</button><button role="tab" aria-selected={tab === "evidence"} className={tab === "evidence" ? "active" : ""} onClick={() => setTab("evidence")}>证据与产物</button><button role="tab" aria-selected={tab === "eval"} className={tab === "eval" ? "active" : ""} onClick={() => setTab("eval")}>最终评测</button></div>
    {tab === "trace" && <div className="qo-drawer-section"><p className="qo-section-caption">基线 → 修复 → 验证 → 冻结最佳产物</p><ol className="qo-timeline"><li><span className="qo-timeline-dot" /><div><strong>建立基线</strong><small>{date(run.startedAt)}</small><p>冻结页面范围和参考，开始视觉自检。</p></div></li>{run.rounds.map((round) => <li key={round.number}><span className={`qo-timeline-dot qo-dot-${round.decision}`} /><div><strong>第 {round.number} 轮 · {round.issue}</strong><small>{DECISION_LABELS[round.decision] ?? round.decision}</small><p>{round.hypothesis}</p></div></li>)}<li><span className="qo-timeline-dot" /><div><strong>结束：{STOP_LABELS[run.loopStop] ?? run.loopStop}</strong><p>最佳产物已冻结；后续 E2E 独立判分。</p></div></li></ol></div>}
    {tab === "evidence" && <div className="qo-drawer-section"><div className="qo-meta-list"><div><span>参考 URL</span>{run.referenceUrl ? <a href={run.referenceUrl} target="_blank" rel="noreferrer">打开参考 <ArrowUpRight size={12} /></a> : <strong>未记录</strong>}</div><div><span>产物 SHA-256</span><code title={run.artifactHash ?? ""}>{run.artifactHash ?? "未记录"}</code></div><div><span>契约 SHA-256</span><code title={run.contractHash ?? ""}>{run.contractHash ?? "未记录"}</code></div></div><h3>证据索引 <small>{run.evidence.length}</small></h3>{run.evidence.length ? <div className="qo-evidence-list">{run.evidence.map((item, index) => <div key={`${item.id}-${index}`}><span className="qo-file-icon"><FileText size={16} /></span><div><strong>{item.id ?? item.kind ?? `证据 ${index + 1}`}</strong><small>{item.stage} · {item.kind ?? "unknown"} · {item.uri ?? "无路径"}</small></div></div>)}</div> : <Empty title="没有证据索引" message="导入的报告未包含可展示的证据记录。" icon={FileText} />}<p className="qo-footnote">文件路径是报告内的相对引用。单独导入 JSON 不会自动导入图片或生成项目。</p></div>}
    {tab === "eval" && <div className="qo-drawer-section"><p className="qo-section-caption">独立 E2E · {run.e2e.calibration?.status === "calibrated" ? "已校准" : "评分器未校准或未记录"}</p>{run.e2e.dimensions.length ? <div className="qo-dimension-list">{EVAL_DIMENSIONS.map(([id, label]) => { const item = run.e2e.dimensions.find((entry) => entry.id === id); return <div key={id}><span>{label}</span><div className="qo-dim-track"><i style={{ width: `${(item?.score ?? 0) * 25}%` }} /></div><strong>{item?.status === "scored" ? `${item.score}/4` : "未知"}</strong></div>; })}</div> : <Empty title="五维评分未完成" message={run.e2e.reason ?? "未接入独立评委，不能推断通过。"} icon={Gauge} />}<h3>红线</h3>{run.e2e.redlines.length ? <div className="qo-redlines">{run.e2e.redlines.map((item) => <span key={item.id} className={item.status === "pass" ? "pass" : "unknown"}>{item.id} · {item.status}</span>)}</div> : <p className="qo-footnote">未记录红线判定。</p>}<p className="qo-footnote">Loop 自评分不映射为 E2E 分数。{run.e2e.provisional ? "本次结果为暂定值。" : "本次结果含校准记录。"}</p></div>}
  </div></aside></div>;
}

function Overview({ runs, cases, onSelect, onNavigate }) {
  const complete = runs.filter((item) => Number.isFinite(item.e2e.total));
  const pass = complete.filter((item) => item.e2e.status === "pass").length;
  const average = complete.length ? Math.round(complete.reduce((sum, item) => sum + item.e2e.total, 0) / complete.length) : "—";
  const variants = [...new Set(runs.map((item) => item.variant))];
  return <><Intro view="overview"><button className="button button-primary" onClick={() => onNavigate("traces")}>查看运行追踪 <CaretRight size={15} /></button></Intro><div className="qo-kpi-grid"><Kpi icon={ClipboardText} label="运行次数" value={runs.length} detail="当前数据范围" /><Kpi icon={CheckCircle} label="已完成 E2E" value={complete.length} detail={`${runs.length - complete.length} 条待评`} tone="green" /><Kpi icon={Gauge} label="平均质量分" value={average === "—" ? "—" : `${average}` } detail="仅完整评分 / 100" tone="amber" /><Kpi icon={Database} label="覆盖案例" value={new Set(runs.map((item) => item.caseId).filter(Boolean)).size} detail={`样本库共 ${cases.length} 条`} tone="blue" /></div>
    <div className="qo-overview-grid"><Panel title="方案质量概览" caption="按有完整 E2E 分数的运行聚合；暂定分数仍需人工复核。" action={<button className="qo-text-button" onClick={() => onNavigate("evaluations")}>展开对比 <ArrowUpRight size={14} /></button>}>{variants.length ? <div className="qo-variant-bars">{variants.map((variant) => { const items = complete.filter((run) => run.variant === variant); const avg = items.length ? Math.round(items.reduce((sum, run) => sum + run.e2e.total, 0) / items.length) : null; return <div key={variant}><div><strong>{variant}</strong><span>{items.length} 次有效评分</span></div><div className="qo-variant-track"><i style={{ width: `${avg ?? 0}%` }} /></div><b>{avg ?? "—"}</b></div>; })}</div> : <Empty title="没有可聚合的运行" message="导入 report.json 后显示方案分数。" icon={ChartBar} />}</Panel>
    <Panel title="质量门禁" caption="过程结束、E2E 结果和审批分别记录。"><div className="qo-gate-list"><div><span className="qo-gate-number">01</span><div><strong>Loop 已结束</strong><small>{runs.filter((item) => item.loopStop !== "unknown").length} / {runs.length} 条有停止原因</small></div></div><div><span className="qo-gate-number">02</span><div><strong>独立 E2E</strong><small>{complete.length} 条完整 · {pass} 条暂定通过</small></div></div><div><span className="qo-gate-number">03</span><div><strong>人工审批</strong><small>{runs.filter((item) => item.approval).length} 条有审批记录</small></div></div></div><p className="qo-panel-note"><Info size={14} />未知和未完成不会折算为通过。</p></Panel></div>
    <Panel title="最近运行" caption="从最终结果回到修复轨迹。" action={<button className="qo-text-button" onClick={() => onNavigate("traces")}>全部运行 <ArrowUpRight size={14} /></button>}><RunTable runs={[...runs].sort((a,b) => Date.parse(b.startedAt ?? 0) - Date.parse(a.startedAt ?? 0)).slice(0, 5)} cases={cases} onSelect={onSelect} compact /></Panel></>;
}

function Traces({ runs, cases, onSelect }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = runs.filter((run) => [run.id, run.caseId, run.variant, cases.find((item) => item.id === run.caseId)?.title].join(" ").toLowerCase().includes(query.toLowerCase()) && (status === "all" || run.loopStop === status));
  return <><Intro view="traces"><span className="qo-heading-count">{filtered.length} / {runs.length} 条运行</span></Intro><div className="qo-toolbar"><div className="search-field"><MagnifyingGlass size={17} /><input aria-label="搜索运行" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索运行 ID、案例或方案…" /></div><div className="qo-select"><Funnel size={15} /><select aria-label="筛选停止原因" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部停止原因</option>{Object.entries(STOP_LABELS).filter(([key]) => key !== "unknown").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div></div><Panel title="运行清单" caption="点击运行查看轮次、证据和最终评测。"><RunTable runs={filtered} cases={cases} onSelect={onSelect} /></Panel></>;
}

function Artifacts({ runs, cases, onSelect }) {
  return <><Intro view="artifacts"><span className="qo-heading-count">{runs.filter((run) => run.artifactHash).length} 个产物索引</span></Intro><div className="qo-artifact-grid">{runs.length ? runs.map((run) => <article className="qo-artifact" key={run.id}><div className="qo-artifact-preview"><FileText size={29} weight="light" /><span>{run.previewUrl ? "外部预览已关联" : "未附加可视预览"}</span></div><div className="qo-artifact-body"><div className="qo-artifact-top"><span>{run.id}</span><Status value={run.e2e.status} /></div><h2>{cases.find((item) => item.id === run.caseId)?.title ?? run.caseId ?? "未关联案例"}</h2><p>{run.variant}</p><div className="qo-artifact-meta"><span>产物哈希</span><code title={run.artifactHash ?? ""}>{shortHash(run.artifactHash)}</code></div><div className="qo-artifact-actions"><button className="qo-text-button" onClick={() => onSelect(run)}>查看证据链 <CaretRight size={14} /></button>{run.previewUrl && <a href={run.previewUrl} target="_blank" rel="noreferrer">打开预览 <ArrowUpRight size={13} /></a>}</div></div></article>) : <Empty title="暂无生成结果" message="导入运行报告后，产物和证据索引会关联到对应运行。" icon={FileText} />}</div></>;
}

function Evaluations({ runs, cases, onSelect }) {
  const [leftId, setLeftId] = useState(runs[0]?.id ?? "");
  const [rightId, setRightId] = useState(runs[1]?.id ?? "");
  const left = runs.find((item) => item.id === leftId) ?? runs[0];
  const right = runs.find((item) => item.id === rightId) ?? runs[1];
  const invalidPair = left && right && left.id === right.id;
  const differentCases = left && right && left.caseId !== right.caseId;
  return <><Intro view="evaluations" /><div className="qo-compare-controls"><div><label htmlFor="compare-left">方案 A</label><select id="compare-left" value={left?.id ?? ""} onChange={(event) => setLeftId(event.target.value)}>{runs.map((run) => <option key={run.id} value={run.id}>{run.id} · {run.variant}</option>)}</select></div><div><label htmlFor="compare-right">方案 B</label><select id="compare-right" value={right?.id ?? ""} onChange={(event) => setRightId(event.target.value)}>{runs.map((run) => <option key={run.id} value={run.id}>{run.id} · {run.variant}</option>)}</select></div></div>
    {runs.length < 2 ? <Panel title="评测对比"><Empty title="至少需要两条运行" message="导入两个方案的运行报告，才能进行并排对照。" icon={Gauge} /></Panel> : invalidPair ? <div className="qo-alert">请选择两条不同的运行。</div> : <><div className="qo-compare-note"><Info size={15} />{differentCases ? "两条运行来自不同案例；分数只能作浏览，不能当作同题方案差值。" : `同一案例：${cases.find((item) => item.id === left.caseId)?.title ?? left.caseId ?? "案例未关联"}。差值仅作本次对照，非跨样本统计结论。`}</div><div className="qo-compare-summary"><div><small>方案 A · {left.id}</small><strong>{score(left.e2e.total)}</strong><span>{left.variant}</span><Status value={left.e2e.status} /></div><div className="qo-compare-delta"><span>总分差值</span><strong>{left.e2e.total == null || right.e2e.total == null ? "—" : `${right.e2e.total - left.e2e.total > 0 ? "+" : ""}${Math.round(right.e2e.total - left.e2e.total)}`}</strong><small>B − A</small></div><div><small>方案 B · {right.id}</small><strong>{score(right.e2e.total)}</strong><span>{right.variant}</span><Status value={right.e2e.status} /></div></div><Panel title="E2E 五维评分矩阵" caption="0–4 rubric；unknown 和 not_applicable 不换算为分数。"><div className="qo-table-wrap"><table className="qo-table qo-matrix"><thead><tr><th>维度</th><th>方案 A</th><th>方案 B</th><th>差值 B − A</th></tr></thead><tbody>{EVAL_DIMENSIONS.map(([id, label]) => { const a = left.e2e.dimensions.find((item) => item.id === id); const b = right.e2e.dimensions.find((item) => item.id === id); const diff = a?.status === "scored" && b?.status === "scored" ? b.score - a.score : null; return <tr key={id}><td><strong>{label}</strong></td><td>{a?.status === "scored" ? `${a.score} / 4` : a?.status ?? "未知"}</td><td>{b?.status === "scored" ? `${b.score} / 4` : b?.status ?? "未知"}</td><td className={diff > 0 ? "qo-positive" : diff < 0 ? "qo-negative" : ""}>{diff == null ? "—" : diff > 0 ? `+${diff}` : diff}</td></tr>; })}</tbody></table></div><div className="qo-compare-footer"><span>评分器校准：A {left.e2e.calibration?.status ?? "未知"} · B {right.e2e.calibration?.status ?? "未知"}</span><button className="qo-text-button" onClick={() => onSelect(right)}>查看 B 的完整证据 <CaretRight size={14} /></button></div></Panel></>}
  </>;
}

function Metrics({ runs, cases }) {
  const [caseId, setCaseId] = useState("all");
  const scoped = caseId === "all" ? runs : runs.filter((run) => run.caseId === caseId);
  const scored = scoped.filter((run) => Number.isFinite(run.e2e.total));
  const variants = [...new Set(scoped.map((run) => run.variant))];
  const keep = scoped.flatMap((run) => run.rounds).filter((round) => round.decision === "keep").length;
  const totalRounds = scoped.reduce((sum, run) => sum + run.rounds.length, 0);
  return <><Intro view="metrics"><div className="qo-select"><Funnel size={15} /><select aria-label="指标筛选案例" value={caseId} onChange={(event) => setCaseId(event.target.value)}><option value="all">全部案例</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.title}</option>)}</select></div></Intro><div className="qo-kpi-grid"><Kpi icon={Gauge} label="有效评分" value={scored.length} detail="五维完整" /><Kpi icon={CheckCircle} label="暂定通过率" value={scored.length ? `${Math.round(scored.filter((run) => run.e2e.status === "pass").length / scored.length * 100)}%` : "—"} detail="以完整评分为分母" tone="green" /><Kpi icon={CircleNotch} label="轮次保留率" value={totalRounds ? `${Math.round(keep / totalRounds * 100)}%` : "—"} detail={`${keep} / ${totalRounds} 轮可信改善`} tone="amber" /><Kpi icon={Database} label="运行覆盖" value={new Set(scoped.map((run) => run.caseId).filter(Boolean)).size} detail={`样本库 ${cases.length} 条`} /></div><div className="qo-metrics-grid"><Panel title="按方案聚合" caption="分数按有完整 E2E 的运行计算；样本量随方案展示。">{variants.length ? <div className="qo-metric-rows">{variants.map((variant) => { const items = scored.filter((run) => run.variant === variant); const avg = items.length ? Math.round(items.reduce((sum, run) => sum + run.e2e.total, 0) / items.length) : null; return <div key={variant}><div><strong>{variant}</strong><small>n = {items.length}</small></div><div className="qo-metric-track"><i style={{ width: `${avg ?? 0}%` }} /></div><b>{avg ?? "—"}</b></div>; })}</div> : <Empty title="无可用分组" message="选择其他案例或导入报告。" icon={ChartBar} />}</Panel><Panel title="数据完整性" caption="把缺测显示出来，不让汇总分掩盖缺口。"><div className="qo-completeness"><div><span>完整 E2E</span><strong>{scored.length} / {scoped.length}</strong></div><div><span>产物哈希</span><strong>{scoped.filter((run) => run.artifactHash).length} / {scoped.length}</strong></div><div><span>证据索引</span><strong>{scoped.filter((run) => run.evidence.length).length} / {scoped.length}</strong></div><div><span>校准记录</span><strong>{scoped.filter((run) => run.e2e.calibration?.status === "calibrated").length} / {scoped.length}</strong></div></div></Panel></div><div className="qo-alert qo-muted-alert"><Info size={15} />当前页面只展示描述性统计。跨 case 的差值置信区间、偏差测试和版本 Go / No-Go 需独立批量评测后生成，不能从少量演示记录推断。</div></>;
}

function Audit({ runs, onSelect }) {
  const [query, setQuery] = useState("");
  const events = useMemo(() => auditEvents(runs), [runs]);
  const filtered = events.filter((event) => [event.runId, event.action, event.detail, event.actor].join(" ").toLowerCase().includes(query.toLowerCase()));
  return <><Intro view="audit"><span className="qo-heading-count">{events.length} 条可追溯事件</span></Intro><div className="qo-alert qo-muted-alert"><Info size={15} />此视图来自导入报告和其中的轮次记录，是来源索引；未提供服务端身份认证、不可篡改存储或文件签名校验。</div><div className="qo-toolbar"><div className="search-field"><MagnifyingGlass size={17} /><input aria-label="搜索审计记录" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索动作、运行或责任方…" /></div></div><Panel title="事件时间线" caption="按照报告中记录的时间排序；缺失时间保留为空。">{filtered.length ? <div className="qo-table-wrap"><table className="qo-table"><thead><tr><th>时间</th><th>事件</th><th>运行</th><th>执行方</th><th>详情</th><th>来源</th></tr></thead><tbody>{filtered.map((event) => <tr key={event.id} tabIndex="0" onClick={() => { const run = runs.find((item) => item.id === event.runId); if (run) onSelect(run); }} onKeyDown={(keyEvent) => { if (keyEvent.key === "Enter") { const run = runs.find((item) => item.id === event.runId); if (run) onSelect(run); } }}><td className="qo-date">{date(event.at)}</td><td><strong>{event.action}</strong></td><td>{event.runId}</td><td>{event.actor}</td><td>{event.detail}</td><td><span className="qo-source-badge">{event.source}</span></td></tr>)}</tbody></table></div> : <Empty title="没有匹配的事件" message="更换关键词，或导入包含轮次记录的报告。" icon={ClipboardText} />}</Panel></>;
}

export function ObservabilityView({ view, runs, cases }) {
  const [selected, setSelected] = useState(null);
  const navigate = (next) => window.dispatchEvent(new CustomEvent("quality:navigate", { detail: next }));
  return <section className="page-content qo-page"><div className="qo-view">
    {view === "overview" && <Overview runs={runs} cases={cases} onSelect={setSelected} onNavigate={navigate} />}
    {view === "traces" && <Traces runs={runs} cases={cases} onSelect={setSelected} />}
    {view === "artifacts" && <Artifacts runs={runs} cases={cases} onSelect={setSelected} />}
    {view === "evaluations" && <Evaluations runs={runs} cases={cases} onSelect={setSelected} />}
    {view === "metrics" && <Metrics runs={runs} cases={cases} />}
    {view === "audit" && <Audit runs={runs} onSelect={setSelected} />}
  </div>{selected && <RunDrawer key={selected.id} run={selected} cases={cases} onClose={() => setSelected(null)} />}</section>;
}
