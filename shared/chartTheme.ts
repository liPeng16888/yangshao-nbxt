// Shared visual defaults; series, values, units, and interactions stay in each report.
export const chartColors = {
  income: '#738b9c',
  expense: '#ac8c7e',
  settled: '#7d9685',
  unsettled: '#b58179',
  monthly: '#738b9c',
  prepaid: '#94869f',
  neutral: '#9aa5ad',
  total: '#435764'
}

export const chartCategoryColors: Record<string, string> = {
  办公: '#738b9c', 耗材: '#7d9685', 设备: '#94869f', 交通: '#b3a079',
  餐饮: '#b58179', 线上服务: '#8caaa9', 其他: '#9aa5ad'
}

export const chartTheme = {
  animationDuration: 300,
  animationDurationUpdate: 180,
  color: [chartColors.income, chartColors.expense, chartColors.settled, chartColors.prepaid, '#b3a079', '#8caaa9', '#8f98ac', '#ac9e96'],
  backgroundColor: 'transparent',
  textStyle: { fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif', fontSize: 12, color: '#66737d' },
  legend: { textStyle: { color: '#4d5963', fontSize: 12 }, itemWidth: 12, itemHeight: 10, itemGap: 18 },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#dce2e6' } },
    axisTick: { show: false },
    axisLabel: { color: '#66737d', margin: 12 },
    splitLine: { show: false }
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#66737d', margin: 10 },
    nameTextStyle: { color: '#66737d' },
    splitLine: { lineStyle: { color: '#e9edef', width: 1 } }
  },
  tooltip: {
    backgroundColor: '#ffffff',
    borderColor: '#dce2e6',
    borderWidth: 1,
    padding: [10, 12],
    textStyle: { color: '#29343d', fontSize: 12 },
    extraCssText: 'border-radius:6px;box-shadow:0 6px 20px rgba(41,52,61,.1);',
    axisPointer: { lineStyle: { color: '#aab8c1', width: 1 }, shadowStyle: { color: 'rgba(94,118,135,.06)' } }
  },
  bar: { barMaxWidth: 44 },
  line: { symbolSize: 5, lineStyle: { width: 2 } },
  pie: { itemStyle: { borderColor: '#ffffff', borderWidth: 2 }, label: { color: '#4d5963' } }
}
