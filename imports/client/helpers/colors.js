// Lightweight categorical color mapping without d3 dependency
// API preserved: colors(key) -> color string
const PALETTE = [
	'#1976D2', '#FB8C00', '#43A047', '#E53935', '#8E24AA',
	'#00897B', '#FDD835', '#78909C', '#5C6BC0', '#EF6C00',
	'#7CB342', '#D81B60', '#0097A7', '#C0CA33', '#90A4AE',
	'#1E88E5', '#F4511E', '#66BB6A', '#AB47BC', '#26A69A'
]

function hashString(str) {
	if (str == null) return 0
	let h = 0
	const s = String(str)
	for (let i = 0; i < s.length; i++) {
		h = (h << 5) - h + s.charCodeAt(i)
		h |= 0
	}
	return Math.abs(h)
}

export function colors(key) {
	const idx = hashString(key) % PALETTE.length
	return PALETTE[idx]
}

export { PALETTE as DEFAULT_COLORS }
