export const zhDiscovery = {
  'discovery.title': '发现职位',
  'discovery.hint':
    '读取有限的搜索页，并保存符合条件的职位完整描述。本次运行固定搜索设置。将可审核链接复制到申请批次前，请先检查保存的结果。',
  'discovery.bounds': '发现范围',
  'discovery.collectionHint':
    '关闭后仍读取完整描述用于筛选，并在此工作进程运行期间保留在内存中。发现历史仅保存筛选决定，不保存描述。已有描述保持不变。将结果复制到申请批次时也会复制此设置。',
  'discovery.collectionMemory':
    '本次发现已关闭描述保存。重启后无法恢复临时描述；已保存的筛选决定仍然可用。',
  'discovery.readAt': '描述读取时间：{date}',
  'discovery.maxPages': '最多页数',
  'discovery.maxVacancies': '最多不同职位数',
  'discovery.durationMs': '最长时间（秒）',
  'discovery.refresh': '重新读取已保存的描述',
  'discovery.start': '开始发现职位',
  'discovery.status': '刷新发现状态',
  'discovery.stop': '停止发现',
  'discovery.progress':
    '已访问页数：{pages} · 不同职位：{count} · 重复项：{duplicates}',
  'discovery.source':
    '已保存搜索：{query} · 简历：{resume} · 最多 {pages} 页 / {maximum} 个职位',
  'discovery.useBatch': '将可审核链接复制到批次草稿',
  'discovery.phase.running': '正在发现职位',
  'discovery.phase.completed': '已在设定范围内完成',
  'discovery.phase.stopped': '发现已停止；保留已确认的结果',
  'discovery.phase.expired': '发现时间已到；保留已确认的结果',
  'discovery.phase.failed': '发现失败；保留已确认的结果',
  'discovery.phase.interrupted': '发现曾被中断；查看状态不会重新启动',
  'discovery.reason.exhausted': '原生搜索没有下一页',
  'discovery.reason.page-limit': '已达到页数限制；可能还有其他结果',
  'discovery.reason.vacancy-limit':
    '已达到职位数限制；当前页可能只读取了一部分',
  'discovery.salaryLadder': '逐级降低简历匹配搜索的薪资下限',
  'discovery.salaryHint':
    '使用下方共享薪资目标。未设置最低薪资时，简历搜索从 RUB 税后目标开始，遍历当前级别的所有页面后才降低 50,000 RUB。薪资未知的职位仍符合条件。不会发送申请。',
  'discovery.salaryTier': '薪资级别 {tier} · 最低 {floor} RUB 等值',
  'discovery.pay.apply': '薪资符合条件',
  'discovery.pay.defer': '等待较低薪资级别',
  'discovery.pay.exclude': '薪资已排除：公布上限低于目标一半',
};
