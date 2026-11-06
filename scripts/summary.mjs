// Qualitative interpretation of the current benchmark design; figures come from raw results.
export function renderSummary(result, table) {
  const op = (id, framework) =>
    result.operations.find((row) => row.id === id && row.framework === framework).dom.median;
  const ms = (id, framework) => op(id, framework).toFixed(1);
  const startup = (boot, cache, framework) =>
    result.startup
      .find((row) => row.boot === boot && row.cache === cache && row.framework === framework)
      .ready.median.toFixed(1);
  const heap = (framework) =>
    (
      result.memory.find((row) => row.id === 'rows-10000' && row.framework === framework).heap
        .median /
      1024 ** 2
    ).toFixed(0);
  const cycles = result.memory.find((row) => row.id === 'mount-100' && row.framework === 'jinge');
  const growth = [10, 50, 100].map((count) => {
    const values = cycles.trials
      .map(
        (trial) =>
          trial.checkpoints.find((point) => point.cycles === count).usedBytes -
          trial.before.usedBytes,
      )
      .sort((a, b) => a - b);
    return (values[Math.floor(values.length / 2)] / 1024 ** 2).toFixed(2);
  });
  return [
    '## 各方向表现总结',
    '',
    '**这轮实测中，Jinge 在包体和细粒度更新上有优势，但大列表更新和内存开销突出；Vue 比较均衡；React 在常规列表操作、批量更新和大列表内存上表现较好。**',
    '',
    '以下均指本机、当前三套实现的结果。Vue 使用 JSX，React 使用不可变更新和 memo；耗时取中位数。定性解读针对本次实现与测量口径，修改用例、版本或配置后需要重新复核。',
    '',
    table('| 方向 | Jinge | Vue | React |', [
      `| 包体 | 最小，JS ${(result.artifacts.jinge.js / 1000).toFixed(2)} kB | ${(result.artifacts.vue.js / 1000).toFixed(2)} kB | ${(result.artifacts.react.js / 1000).toFixed(2)} kB |`,
      `| 空页面启动 | 最快，冷启动 ready ${startup('empty', 'cold', 'jinge')} ms | ${startup('empty', 'cold', 'vue')} ms | ${startup('empty', 'cold', 'react')} ms |`,
      `| 带大量内容的启动 | 优势消失，千行表格冷启动 ${startup('table', 'cold', 'jinge')} ms | 千行表格最快，${startup('table', 'cold', 'vue')} ms | ${startup('table', 'cold', 'react')} ms；暖启动表格最快 |`,
      '| 列表创建、替换、追加、删除 | 多数场景较慢 | 万行创建最快，交换行也突出 | 千行创建、替换、追加、删除较快 |',
      `| 列表局部更新 | 明显短板：万行中更新千行为 **${ms('list-update-10000', 'jinge')} ms** | ${ms('list-update-10000', 'vue')} ms | ${ms('list-update-10000', 'react')} ms |`,
      `| 大量绑定中只改一个 | 表现好，万绑定约 ${ms('binding-one-10000', 'jinge')} ms | 同样很好，约 ${ms('binding-one-10000', 'vue')} ms | 随组件数量增加，万绑定约 ${ms('binding-one-10000', 'react')} ms |`,
      `| 同一轮批量更新 | 修改千属性为 ${ms('batch-1000', 'jinge')} ms | ${ms('batch-1000', 'vue')} ms | 最快，${ms('batch-1000', 'react')} ms |`,
      '| 嵌套属性与对象替换 | 三者接近 | 三者接近 | 三者接近 |',
      `| 共享对象通知 | 千个别名更新为 ${ms('shared-1000', 'jinge')} ms | ${ms('shared-1000', 'vue')} ms | ${ms('shared-1000', 'react')} ms |`,
      '| 挂载、卸载 | 挂载较慢，卸载较快 | 挂载接近 Jinge | 挂载最快，卸载与 Jinge 接近 |',
      '| 路由更新 | 约 0.2～0.3 ms | 约 0.4～0.5 ms | 约 15 ms，包含 React Router 默认调度等待 |',
      '| 表单输入 | 三者都很快 | 三者都很快 | 三者都很快 |',
      '| 连续更新、滚动和拖动 | 小范围更新延迟低 | 同样表现稳定 | 部分场景更新等待较长，但本次连续测试整体仍保持约 16.7 ms 帧间隔 |',
      `| 大列表内存 | 最高，万行总 JS 堆约 **${heap('jinge')} MiB** | 约 ${heap('vue')} MiB | 最低，约 ${heap('react')} MiB |`,
      '| 重复挂载后的清理 | 堆持续增长值得重点排查 | 增长较小，后期趋缓 | 增长较小，后期趋缓 |',
    ]),
    '',
    '路由的差距不能直接解释成 React 核心渲染慢几十倍，它包含各生态路由库的调度策略。布局和绘制本身也没有呈现统一的框架排名。',
    '',
    '对三个框架分别看：',
    '',
    '- **Jinge：小包、少量精准更新是强项。** 但当前精细订阅的成本在大量列表项、批量通知和对象保留上暴露出来。没有虚拟 DOM，并不意味着创建和更新大量 DOM 就一定更快。',
    '- **Vue：这组用例中最均衡。** 单点更新快、大列表创建快，内存处于中间，没有类似 Jinge 万行局部更新那样突出的退化。',
    '- **React：常规列表操作、批量更新和大列表内存表现突出。** 少量变化仍可能承担父组件遍历、不可变复制和调度成本；这些表现与具体组件拆分、memo 及路由配置有关。',
    '',
    '**Jinge 下一步最值得排查的三个方向：**',
    '',
    `1. **万行列表局部更新的 ${ms('list-update-10000', 'jinge')} ms 开销**：通知传播、订阅遍历和子组件属性更新链。`,
    '2. **大列表的订阅内存成本**：为什么相同万行 DOM，JS 堆明显更大。',
    `3. **重复挂载后的对象保留**：50 个子组件反复挂载卸载，10／50／100 轮后堆增量约为 ${growth.join('／')} MiB，持续增长；DOM 和监听器归零不能证明其他对象已释放。`,
    '',
  ];
}
