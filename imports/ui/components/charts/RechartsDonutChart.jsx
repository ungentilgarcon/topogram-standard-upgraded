import React, { useMemo, useRef, useEffect } from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'

// Generic Donut chart using Recharts
// Props:
// - data: Array<{ name: string, value: number }>
// - colors: string[] base palette used when slice not selected
// - selectedNames: Set<string> of labels to highlight
// - onItemClick: (name: string) => void
// - title?: string
// - height?: number (default 320)
// - onContainer?: (el: HTMLElement|null) => void
export default function RechartsDonutChart({
  data = [],
  colors = ['#1976D2','#FB8C00','#43A047','#E53935','#8E24AA','#00897B','#FDD835','#78909C'],
  selectedNames,
  onItemClick,
  title,
  height = 320,
  onContainer,
  style,
  className,
}) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (typeof onContainer === 'function') onContainer(containerRef.current)
  }, [onContainer])

  const items = useMemo(() => Array.isArray(data) ? data.filter(d => d && isFinite(d.value)) : [], [data])
  const isSelected = (name) => !!(selectedNames && selectedNames.has(String(name)))

  const handleSliceClick = (entry) => {
    if (typeof onItemClick === 'function' && entry && entry.name != null) onItemClick(String(entry.name))
  }

  const handleLegendClick = (o) => {
    // o.value contains the series name by default
    if (o && typeof onItemClick === 'function' && o.value != null) onItemClick(String(o.value))
  }

  // Compute radii responsively; keep donut look
  const innerRadius = 60
  const outerRadius = 110

  return (
    <div ref={containerRef} className={className} style={style}>
      {title ? <div className="chart-title" style={{ marginBottom: 6 }}>{String(title)}</div> : null}
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={items}
            dataKey="value"
            nameKey="name"
            cx="45%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            isAnimationActive={false}
            onClick={(_, index) => handleSliceClick(items[index])}
            paddingAngle={1}
            label
          >
            {items.map((entry, index) => {
              const defaultColor = colors[index % colors.length]
              const fill = isSelected(entry.name) ? '#EEFF41' : defaultColor
              const stroke = isSelected(entry.name) ? '#263238' : '#000000'
              const strokeOpacity = isSelected(entry.name) ? 0.85 : 0.08
              return (
                <Cell key={`cell-${index}-${entry.name}`} fill={fill} stroke={stroke} strokeOpacity={strokeOpacity} />
              )
            })}
          </Pie>
          <Tooltip formatter={(v) => [v, 'count']} />
          <Legend verticalAlign="middle" align="right" layout="vertical" onClick={handleLegendClick} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
