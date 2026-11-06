import { readFile, writeFile } from 'node:fs/promises';
import { cases, frames } from '../src/shared/cases.ts';
import { renderSummary } from './summary.mjs';
const result = JSON.parse(await readFile('results/latest.json', 'utf8'));
if (!result.completed)
  throw new Error('Run did not complete; refusing to publish an incomplete report');
if (
  result.operations.length !== cases.length * 3 ||
  result.startup.length !== 18 ||
  result.continuous.length !== 9 ||
  result.memory.length !== 21
)
  throw new Error('A complete run of all categories is required for README generation');
if (
  !result.extended?.completed ||
  result.extended.gestures.length !== 9 ||
  result.extended.startupCPU.length !== 9
)
  throw new Error('Run pnpm bench:extended to complete gestures and startup CPU diagnostics');
const verification = JSON.parse(await readFile('results/verification.json', 'utf8'));
const frameworks = ['jinge', 'vue', 'react'],
  titles = { jinge: 'Jinge', vue: 'Vue', react: 'React' };
const f = (value) =>
  value == null
    ? '—'
    : Math.abs(value) < 0.05
      ? value === 0
        ? '0.00'
        : '<0.05'
      : value.toFixed(2);
const kib = (value) => (value / 1024).toFixed(1),
  signed = (value) => (value >= 0 ? '+' : '') + kib(value);
const metric = (collection, fw, predicate) =>
  result[collection].find((item) => item.framework === fw && predicate(item));
const op = (id, fw) => metric('operations', fw, (item) => item.id === id);
const cell = (stats) => `${f(stats.median)} / ${f(stats.p95)}`;
const table = (header, rows) =>
  [
    header,
    '| ' +
      header
        .split('|')
        .filter((s) => s.trim())
        .map(() => '---')
        .join(' | ') +
      ' |',
    ...rows,
  ].join('\n') + '\n';
const environment = result.environment,
  config = result.config;
const relative = cases
  .map((item) => {
    const j = op(item.id, 'jinge').dom.median,
      v = op(item.id, 'vue').dom.median,
      r = op(item.id, 'react').dom.median;
    return { ...item, j, v, r, ratio: j / Math.max(0.1, Math.min(v, r)) };
  })
  .filter((item) => Math.max(item.j, item.v, item.r) >= 0.5);
const advantages = relative
  .filter((item) => item.j < Math.min(item.v, item.r) * 0.8)
  .sort((a, b) => a.ratio - b.ratio)
  .slice(0, 3);
const disadvantages = relative
  .filter((item) => item.j > Math.min(item.v, item.r) * 1.2)
  .sort((a, b) => b.ratio - a.ratio)
  .slice(0, 3);
const describe = (item) =>
  `${item.label}（Jinge ${f(item.j)} ms，Vue ${f(item.v)} ms，React ${f(item.r)} ms）`;
const lines = [
  '# Jinge / Vue / React 浏览器性能基准',
  '',
  '此仓库以可重复运行的浏览器用例比较三套实现。README 由真实样本生成，先给出结果概要，再列出全部指标与用例；原始数据和测量代码随仓库保留。它是独立基准，列表操作参考 js-framework-benchmark 的场景，**不是该项目的官方实现或排行榜结果**。',
  '',
  '## 结果概要',
  '',
  `- 测量完成时间：${result.completed}。基于 npm 最新稳定版 React ${environment.versions.react} / React DOM ${environment.versions['react-dom']}、Vue ${environment.versions.vue}，以及 Jinge ${environment.versions.jinge} / compiler ${environment.versions['jinge-compiler']}。版本按本次测试日锁定，不随读者未来运行自动升级。`,
  `- 正确性：${verification.checks} 项浏览器场景通过，另有共享数据模型的可变/不可变更新一致性检查。覆盖列表 key 身份、路径/query 更新时页面复用、页面切换时替换，以及子组件挂载/卸载计数。`,
  `- 覆盖：${cases.length} 项操作 × 3 框架；6 项启动场景 × 3；3 项连续更新 × 3；7 项内存场景 × 3。操作每项 ${config.warmup} 次预热、${config.samples} 次正式采样。`,
  `- 主基准应用 JS / gzip：${frameworks.map((fw) => `${titles[fw]} ${(result.artifacts[fw].js / 1000).toFixed(2)} / ${(result.artifacts[fw].gzip / 1000).toFixed(2)} kB`).join('；')}。包括主基准场景、路由和观测代码（滚动/拖动使用独立入口，不计入这里），并非最小 Hello World 或框架裸包。`,
  advantages.length
    ? `- 本机这组实现中，Jinge 中位数明显较小的场景示例：${advantages.map(describe).join('；')}。`
    : '- 本次没有达到摘要筛选条件的 Jinge 优势场景；完整结果如下，不据此声称 Jinge 全面更快。',
  disadvantages.length
    ? `- 也存在 Jinge 中位数较大的场景：${disadvantages.map(describe).join('；')}。这些结果一并保留，不能从包体小推断所有更新更快。`
    : '- 各框架优劣应逐项阅读下表，不能从包体大小推断所有更新更快。',
  '- 摘要只描述本机观测值，筛选示例的 20% 差距不是统计显著性检验。亚毫秒结果易受时钟粒度和调度影响，不给出跨场景总分或普遍速度倍数。',
  '',
  '## 环境与实现口径',
  '',
  table('| 项目 | 本次配置 |', [
    `| 硬件 | ${environment.cpu}，${environment.logicalCPUs} 逻辑核，${environment.memoryGiB} GiB 内存 |`,
    `| 系统 | ${environment.platform} ${environment.osRelease} / ${environment.arch} |`,
    `| 浏览器 | Chrome ${environment.browser}，headless，${environment.viewport}，DPR 1 |`,
    `| 工具 | Node ${environment.node}，pnpm ${environment.pnpm}，Vite ${environment.versions.vite}，Playwright ${environment.versions.playwright} |`,
    `| CPU / 网络 | CPU ${environment.cpuThrottle}×；本机 HTTP、无网络限速、实际传输不启用 gzip |`,
    `| 路由 | jinge-router ${environment.versions['jinge-router']}；vue-router ${environment.versions['vue-router']}；react-router-dom ${environment.versions['react-router-dom']} |`,
  ]),
  '三套应用使用相同的数据生成器、最终 DOM 结构、CSS、视口和固定尺寸布局，没有虚拟列表。Jinge 使用编译后的 TSX 与 VM；Vue 使用官方 JSX 插件与 reactive（不是 SFC 模板）；React 使用 createRoot、useState、结构共享的不可变更新及 memo 行/字段组件，未启用 StrictMode、React Compiler 或 flushSync。',
  '',
  '这比较的是仓库中的具体实现与配置，不代表所有写法的最优上限，尤其不能把 Vue JSX 结果直接等同于优化过的 SFC 模板结果。可变对象更新与 React 不可变复制是各自实现的一部分，计时包含实际数据处理与调度；没有把 React 改造成外部信号订阅系统，也没有对代理框架强加深拷贝。',
  '',
  '路由指标包含各自路由库及默认调度的成本；React Router 没有强制同步提交，不能把这组路由差异直接当作 React DOM 与 Jinge 核心的纯渲染差异。',
  '',
  '各框架串行执行，不并行跑测量；主要操作和启动延迟按轮轮换框架顺序，诊断、连续更新、内存及手势按场景/框架串行执行。预置数据和准备 DOM 位于操作计时之外；创建/追加操作自身的数据创建仍位于计时之内。完整 DOM 结果在计时后核对。无关页面保持静止，关闭开发构建及 HMR。',
  '',
  '## 启动与资源',
  '',
  `每格为中位数 / P95，单位 ms，每项 ${config.startupSamples} 次。ready 是 navigation 起点到应用挂载标记，包含本机文档/资源加载、模块执行及框架挂载；FCP 来自浏览器 Paint Timing。cold 为新浏览器上下文并禁用 HTTP 缓存，warm 在同一上下文加载一次后重新导航，不代表操作系统、硬件或浏览器进程完全冷启动。`,
  '',
  table(
    '| 场景 | Jinge ready | Vue ready | React ready |',
    result.startup
      .filter((x) => x.framework === 'jinge')
      .map(
        (item) =>
          `| ${item.boot} / ${item.cache} | ${frameworks.map((fw) => cell(metric('startup', fw, (x) => x.boot === item.boot && x.cache === item.cache).ready)).join(' | ')} |`,
      ),
  ),
  'table=1,000 行表格，form=200 个受控输入，empty=空场景但保留同一基准应用及控制按钮。',
  '',
  table(
    '| 场景 FCP | Jinge | Vue | React |',
    result.startup
      .filter((x) => x.framework === 'jinge')
      .map(
        (item) =>
          `| ${item.boot} / ${item.cache} | ${frameworks
            .map((fw) => {
              const stats = metric(
                'startup',
                fw,
                (x) => x.boot === item.boot && x.cache === item.cache,
              ).fcp;
              return stats ? cell(stats) : '—';
            })
            .join(' | ')} |`,
      ),
  ),
  '本机启动不模拟真实互联网；LCP、CLS、线上访问级 INP 不用于这套框架微基准的排名。',
  '',
  '## 状态修改到 DOM 目标完成',
  '',
  `每格为中位数 / P95，单位 ms。${config.warmup} 次预热后记录 ${config.samples} 次。`,
  '',
  '计时从应用事件处理中的状态操作开始，到统一 MutationObserver 确认目标 DOM 结果为止，包含调度等待和观测开销；不是纯 JS CPU 时间，也不是绘制完成。多元素操作检查末尾目标，随后在计时外核对完整内容与顺序。表单通过真实键盘输入，使用回显文本确认提交，避免仅把浏览器原生 input.value 变化当作框架完成。',
];
for (const group of [...new Set(cases.map((item) => item.group))]) {
  lines.push(
    '',
    `### ${group}`,
    '',
    table(
      '| 用例 | Jinge | Vue | React |',
      cases
        .filter((item) => item.group === group)
        .map(
          (item) =>
            `| ${item.label} | ${frameworks.map((fw) => cell(op(item.id, fw).dom)).join(' | ')} |`,
        ),
    ),
  );
}
lines.push(
  '',
  '## 用户交互事件与长任务',
  '',
  '下表使用 Event Timing 的 click / keydown 交互记录，包含事件前的输入等待与下一帧呈现相关延迟。每格为已记录事件的中位数 ms（记录数 / 操作样本数），不是访问级 INP。浏览器阈值设为 16 ms，时长有量化，未记录事件标为 —，不当作 0；因此已记录样本的中位数有阈值截断，不能当成所有点击/按键的总体中位数。input delay、事件处理时间和长任务的逐样本数据见 JSON。表单窗口还包含聚焦和全选，取该序列最后一个被上报的 keydown，不将其当成独立字符的完整输入延迟。',
  '',
  table(
    '| 操作交互 | Jinge | Vue | React |',
    cases.map(
      (item) =>
        `| ${item.label} | ${frameworks
          .map((fw) => {
            const data = op(item.id, fw);
            return data.event ? `${f(data.event.median)} (${data.event.n}/${data.dom.n})` : '—';
          })
          .join(' | ')} |`,
    ),
  ),
  '',
  table(
    '| 操作采样期间观察到的长任务 | Jinge | Vue | React |',
    cases.map(
      (item) =>
        `| ${item.label} | ${frameworks
          .map((fw) => {
            const durations = op(item.id, fw).samples.flatMap((s) => s.longTasks);
            return `${durations.length} 次 / ${f(durations.reduce((a, b) => a + b, 0))} ms`;
          })
          .join(' | ')} |`,
    ),
  ),
  '长任务来自 Long Tasks 观察器，操作之间清空观测数组，完成后等待帧机会再读取；它是诊断观测，不是按事件精确归因的阻塞时间。',
  '',
  '## 浏览器主线程诊断',
  '',
  '单独运行 3 次，避免将 trace 录制开销混入主要操作计时。每格依次为 Script / Style / Layout / Task 的中位数 ms，来源于 CDP Performance 累计指标差值。窗口覆盖触发操作至后续两个 rAF，包含公共驱动/观察逻辑；这些是诊断窗口数据，不是互斥且可直接相加的“纯框架耗时”。除表单仍使用键盘外，此处直接调用动作，不含鼠标事件驱动。布局/样式次数也保存在原始数据。',
  '',
  table(
    '| 用例 | Jinge S/S/L/T | Vue S/S/L/T | React S/S/L/T |',
    cases.map(
      (item) =>
        `| ${item.label} | ${frameworks
          .map((fw) => {
            const m = metric('diagnostics', fw, (x) => x.id === item.id).median;
            return ['ScriptDuration', 'RecalcStyleDuration', 'LayoutDuration', 'TaskDuration']
              .map((key) => f(m[key]))
              .join(' / ');
          })
          .join(' | ')} |`,
    ),
  ),
  '',
  `另为 6 个代表场景 × 3 个框架录制 ${result.traces.length} 份原始 Chrome trace，位于 results/traces/（较大且不纳入 Git）。可在 DevTools Performance 中导入，检查 JS、样式、布局、绘制与 User Timing 标记；文件校验值见 latest.json。没有把 rAF 回调时间冒充精确 paint-complete。`,
  '',
  '## 连续更新与帧间隔',
  '',
  `每个场景 ${config.frameTrials} 轮，每轮 60 次，按 rAF 驱动。先采集空闲 rAF 基线，再逐帧执行并等待 DOM 目标。每格为 rAF 间隔中位数 / P95 ms；最后一列为超过各自空闲基线 1.5 倍的间隔次数。`,
  '',
  table(
    '| 场景 | Jinge | Vue | React | 超预算次数 J/V/R |',
    frames.map(
      (item) =>
        `| ${item.label} | ${frameworks.map((fw) => cell(metric('continuous', fw, (x) => x.id === item.id).interval)).join(' | ')} | ${frameworks.map((fw) => metric('continuous', fw, (x) => x.id === item.id).overBudget).join(' / ')} / 各 ${config.frameTrials * 60} 次 |`,
    ),
  ),
  '',
  table(
    '| 每帧更新完成耗时，中位数 / P95 ms | Jinge | Vue | React |',
    frames.map(
      (item) =>
        `| ${item.label} | ${frameworks.map((fw) => cell(metric('continuous', fw, (x) => x.id === item.id).update)).join(' | ')} |`,
    ),
  ),
  'rAF 间隔是主线程帧机会的代理指标，不等于 GPU 呈现帧率，也没有测量真实滚动或拖动。连续输入使用原生 setter + input 事件驱动（合成事件，不含物理输入等待），真实键盘用例已在上方单独测量；相关结果不能当成 INP。连续测试的 update 时间还包含公共期望模型与观测代码。',
  '',
  '## 内存与清理',
  '',
  `每项 ${config.memorySamples} 个独立浏览器上下文，等待更新与清理后通过 CDP 连续请求 GC，再读取 JS 已用堆和 DOM 计数。下表为堆中位数 KiB（相对同场景空数据基线的变化）；它不包含整个浏览器进程、原生 DOM/GPU 的全部内存，GC 也不用于主要计时。`,
  '',
  table(
    '| 场景 | Jinge heap（Δ） | Vue heap（Δ） | React heap（Δ） |',
    result.memory
      .filter((x) => x.framework === 'jinge')
      .map(
        (item) =>
          `| ${item.id} | ${frameworks
            .map((fw) => {
              const m = metric('memory', fw, (x) => x.id === item.id);
              return `${kib(m.heap.median)} (${signed(m.delta.median)})`;
            })
            .join(' | ')} |`,
      ),
  ),
  '',
  'ready 为表格空数据稳态；rows 为创建后保持；replace-5 在 1,000 行上连续替换 5 次且每次使用新 key；clear-10000 在创建 10,000 行后清空；mount-100 反复挂载/卸载 50 个组件共 100 轮；route-100 在两个真实路由页面间往返 100 轮。',
  '',
  table(
    '| 清理后的 DOM 节点变化 / 监听器变化 | Jinge | Vue | React |',
    result.memory
      .filter((x) => x.framework === 'jinge')
      .map(
        (item) =>
          `| ${item.id} | ${frameworks
            .map((fw) => {
              const m = metric('memory', fw, (x) => x.id === item.id);
              return `${m.nodeDelta.median} / ${m.listenerDelta.median}`;
            })
            .join(' | ')} |`,
      ),
  ),
  '',
  '### 重复生命周期的增长检查',
  '',
  '每格为第 10 / 50 / 100 轮 GC 后相对初始基线的堆变化 KiB；样本轮之间取中位数。正增长可能来自缓存、JIT 或框架保留对象，不能凭这一个数直接判定泄漏。原始数据同时提供每个检查点的节点、文档、监听器和实际挂载/卸载计数，可据持续增长情况进一步定位。',
  '',
  table(
    '| 场景 | Jinge ΔKiB | Vue ΔKiB | React ΔKiB |',
    ['mount-100', 'route-100'].map(
      (id) =>
        `| ${id} | ${frameworks
          .map((fw) => {
            const m = metric('memory', fw, (x) => x.id === id);
            return [10, 50, 100]
              .map((cycles) => {
                const values = m.trials
                  .map(
                    (t) =>
                      t.checkpoints.find((c) => c.cycles === cycles).usedBytes - t.before.usedBytes,
                  )
                  .sort((a, b) => a - b);
                return signed(values[Math.floor(values.length / 2)]);
              })
              .join(' / ');
          })
          .join(' | ')} |`,
    ),
  ),
  '',
  '## 复现与仓库结构',
  '',
  '```sh\npnpm install --frozen-lockfile\npnpm check\npnpm test\npnpm bench\npnpm report\n```',
  '',
  '默认使用本机 Chrome。没有安装 Chrome 时运行 `pnpm exec playwright install chrome`；或安装 Playwright Chromium，并设置 `PLAYWRIGHT_CHANNEL=chromium`。报告会记录实际浏览器版本。',
  '',
  '完整测量默认操作 30 次、预热 5 次、启动 30 次、内存 3 次、连续更新 3 轮。环境变量 BENCH_SAMPLES、BENCH_WARMUP、BENCH_STARTUP_SAMPLES、BENCH_MEMORY_SAMPLES、BENCH_FRAME_TRIALS 可调整次数；BENCH_CPU=4 可另跑 CPU 降速配置，不能与默认结果混合。BENCH_ONLY=operations,startup,diagnostics,continuous,memory 可选择类别，部分运行仅输出 JSON，不生成完整 README。BENCH_TRACES=0 可关闭额外 trace。',
  '',
  '- src/shared/model.ts：确定性数据、可变/结构共享不可变更新、正确性 oracle。',
  '- src/shared/cases.ts：所有操作和连续场景参数。',
  '- src/shared/bridge.ts：统一完成观察、事件记录和浏览器驱动接口。',
  '- src/jinge、src/vue、src/react：三套界面与真实路由实现。',
  '- scripts/verify.mjs：全场景结果、key 身份、页面复用及生命周期验证。',
  '- scripts/run.mjs：串行、轮换顺序的采样、启动、CPU、内存与 trace。',
  '- scripts/report.mjs：从完整结果生成本文，拒绝未完成或缺少类别的结果。',
  '- [results/latest.json](results/latest.json)：逐样本原始数据、环境、统计及 trace 校验值。',
  '- [results/verification.json](results/verification.json)：正确性验证记录。',
  '- [results/artifacts.json](results/artifacts.json)：构建文件明细；kB=1000 bytes，gzip 为文件级离线压缩值。',
  '',
  '本地 Git 仓库不自动创建远端或发布。依赖精确版本及锁文件已保留；使用 npm 官方 registry，最新版本的发布延迟豁免在 pnpm-workspace.yaml 中按具体版本记录。',
  '',
  '## 参考资料',
  '',
  '- [js-framework-benchmark：列表场景、keyed 语义与基准方法](https://github.com/krausest/js-framework-benchmark)',
  '- [Chrome：内存、GC 与 detached DOM 排查](https://developer.chrome.com/docs/devtools/memory-problems)',
  '- [交互输入等待、处理与呈现的区分](https://web.dev/articles/optimize-inp)',
  '- [Chrome DevTools Protocol Performance](https://chromedevtools.github.io/devtools-protocol/tot/Performance/)',
  '- [Jinge](https://github.com/jingeweb/jinge)、[Jinge compiler](https://github.com/jingeweb/jinge-rust-compiler)、[Jinge router](https://github.com/jingeweb/jinge-router)',
  '',
);
const paintRows = result.paintDiagnostics ?? [];
lines.splice(
  lines.indexOf('## 连续更新与帧间隔'),
  0,
  '### 代表场景的绘制 CPU 记录',
  '',
  '从单独录制的 trace 中，使用本次操作的 User Timing 标记定位 renderer 主线程，排除其他页面/线程，并合并嵌套或重叠区间。每格为 Paint / PrePaint 的 CPU 记录耗时 ms，每场景仅一次诊断记录，不计算 P95、不混入主要计时。这不是屏幕像素呈现的端到端延迟。',
  '',
  table(
    '| 代表用例 | Jinge Paint/PrePaint | Vue Paint/PrePaint | React Paint/PrePaint |',
    [...new Set(paintRows.map((row) => row.id))].map(
      (id) =>
        `| ${cases.find((item) => item.id === id)?.label ?? id} | ${frameworks
          .map((fw) => {
            const row = paintRows.find((row) => row.framework === fw && row.id === id);
            return row ? `${f(row.paintMs)} / ${f(row.prePaintMs)}` : '—';
          })
          .join(' | ')} |`,
    ),
  ),
  '原始绘制事件数、renderer 标识和窗口信息见 results/paint.json；BENCH_TRACES=0 时不生成这项诊断。',
  '',
);
const extended = result.extended;
const lookupGesture = (id, fw) =>
  extended.gestures.find((item) => item.id === id && item.framework === fw);
const startCPU = extended.startupCPU;
lines.splice(
  lines.indexOf('## 状态修改到 DOM 目标完成'),
  0,
  '### 启动阶段 CPU 诊断',
  '',
  '另外使用禁用 HTTP 缓存的新上下文各运行 3 次。每格是 Script / Style / Layout / Task 的中位数 ms，包含导航到 ready 后两个帧机会的浏览器主线程工作。Script 不等于精确的解析时间；Task 包含更多工作，不能与各分项简单相加。这一批独立于上面的启动延迟采样。',
  '',
  table(
    '| 启动场景 | Jinge S/S/L/T | Vue S/S/L/T | React S/S/L/T |',
    ['empty', 'table', 'form'].map(
      (boot) =>
        `| ${boot} | ${frameworks
          .map((fw) => {
            const stats = startCPU.find(
              (item) => item.framework === fw && item.boot === boot,
            ).median;
            return ['ScriptDuration', 'RecalcStyleDuration', 'LayoutDuration', 'TaskDuration']
              .map((key) => f(stats[key]))
              .join(' / ');
          })
          .join(' | ')} |`,
    ),
  ),
  '',
);
lines.splice(
  lines.indexOf('## 内存与清理'),
  0,
  '## 真实滚动与指针拖动',
  '',
  `使用三个独立生产入口，${extended.gestureTrials} 个新上下文/场景，每轮 ${extended.steps} 步。通过 Playwright 的真实鼠标 wheel / pointer 事件驱动，验证实际 scrollTop、回显文本以及拖动结束的 translateX(240px)。Vue 仍为 JSX，React 静态列表使用 memo。它们没有改动主基准的应用入口及计时数据。`,
  '',
  '- scroll-passive：原生滚动 200 行内容，仅观测事件，没有状态回显。这里的 passive 表示不进行响应式更新，不是在三套框架中强制配置了相同的 addEventListener passive 标志。',
  '- scroll-bound：相同滚动，事件更新框架状态并在输出区域回显 scrollTop。',
  '- drag：指针捕获后拖动方块，框架更新位置文本与 CSS transform。',
  '',
  table(
    '| 场景：事件处理开始到目标 DOM 中位数 / P95 ms | Jinge | Vue | React |',
    ['scroll-passive', 'scroll-bound', 'drag'].map(
      (id) =>
        `| ${id} | ${frameworks
          .map((fw) => {
            const row = lookupGesture(id, fw);
            return row.dom ? cell(row.dom) : '—（无状态更新）';
          })
          .join(' | ')} |`,
    ),
  ),
  '',
  table(
    '| 事件处理开始到下一 rAF 中位数 / P95 ms | Jinge | Vue | React |',
    ['scroll-passive', 'scroll-bound', 'drag'].map(
      (id) => `| ${id} | ${frameworks.map((fw) => cell(lookupGesture(id, fw).raf)).join(' | ')} |`,
    ),
  ),
  '',
  '滚动事件时间戳不代表滚轮物理输入的起点；下一 rAF 也不代表绘制完成。原始结果保留事件年龄和 rAF 间隔，但自动化驱动的节奏也会影响帧机会，因此不从这批数据宣称真实用户 FPS 或访问级 INP。',
  '',
);
const cycle = metric('memory', 'jinge', (item) => item.id === 'mount-100');
const growthByCycle = [10, 50, 100].map((count) => {
  const values = cycle.trials
    .map(
      (trial) =>
        trial.checkpoints.find((point) => point.cycles === count).usedBytes -
        trial.before.usedBytes,
    )
    .sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
});
const sustainedGrowth =
  growthByCycle[2] > growthByCycle[1] + 256 * 1024 &&
  growthByCycle[1] > growthByCycle[0] + 256 * 1024;
lines.splice(
  lines.indexOf('## 环境与实现口径'),
  0,
  `补充结果：真实滚动/拖动共 3 类 × 3 框架 × ${extended.gestureTrials} 轮已通过事件与最终状态校验，启动 CPU 另有 3 类 × 3 框架；补充采样完成于 ${extended.completed}。`,
  '',
  `内存方面，Jinge 的 mount-100 用例在 GC 后堆增量中位数为 ${(cycle.delta.median / 1024 ** 2).toFixed(2)} MiB，DOM 与监听器增量均为 ${cycle.nodeDelta.median} / ${cycle.listenerDelta.median}；10、50、100 轮的增长明细在下方。${sustainedGrowth ? '它是需要进一步定位的保留增长信号' : '是否存在保留增长应结合检查点和快照判断'}，不用“节点已释放”代替堆内存分析，也不直接断言已经证明泄漏。`,
  '',
);
lines.push(
  '',
  '### 堆快照定位',
  '',
  '执行 `pnpm heap jinge`（也可传 vue / react），在独立上下文中保存 50 个子组件反复挂载前、100 轮卸载后的堆快照和摘要。快照可用 DevTools Memory 的 Comparison / Retainers 查看；.heapsnapshot 和大型 trace 不纳入 Git，JSON 摘要与校验值保留。当前已生成 Jinge 的快照及 results/jinge-heap-notes.json，方便继续定位上述增长；没有修改任何框架源码来改变本次结果。',
  '',
  '扩展驱动为 scripts/extended.mjs，独立手势入口为 src/*-gestures，原始补充结果为 results/extended.json。BENCH_GESTURE_TRIALS 控制手势轮数；pnpm bench:extended 可以在完整主基准后单独重跑补充项。',
  '',
);
lines.splice(lines.indexOf('## 结果概要'), 0, ...renderSummary(result, table));
await writeFile('README.md', lines.join('\n'));
console.log('Generated README.md from complete raw results');
