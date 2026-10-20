import type { ReactNode } from 'react'
import { fmt } from './engine'

export const COL = ['#0d7c8f', '#c0561b', '#3b5bdb', '#1b8a5a', '#9c36b5', '#d4a017', '#e03e6b', '#5f6b7a']

// 1원 단위 금액 입력: 숫자만 받고 천 단위 콤마를 자동으로 붙입니다
export function Money(p: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span>{p.label}</span>
      <div className="inp">
        <input
          inputMode="numeric"
          placeholder="0"
          value={p.value ? p.value.toLocaleString() : ''}
          onChange={e => { const d = e.target.value.replace(/[^\d]/g, '').slice(0, 15); p.onChange(d ? Number(d) : 0) }}
        />
        <em>원</em>
      </div>
      <small className="read">{p.value >= 10000 ? fmt(p.value) : '\u00a0'}</small>
    </label>
  )
}

export function Num(p: { label: string; value: number; unit: string; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span>{p.label}</span>
      <div className="inp">
        <input type="number" value={p.value} step={p.step ?? 1} onChange={e => p.onChange(Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 0)} />
        <em>{p.unit}</em>
      </div>
      <small className="read">&nbsp;</small>
    </label>
  )
}

export function Rng(p: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span>{p.label} <b>{p.value}{p.unit}</b></span>
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.value} onChange={e => p.onChange(Number(e.target.value))} />
    </label>
  )
}

// 접었다 펼 수 있는 카드
export function Card(p: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="card fold" open={p.open ?? true}>
      <summary><h2>{p.title}</h2></summary>
      <div className="fold-body">{p.children}</div>
    </details>
  )
}

type P = { age: number; v: number }

// 적립기와 인출기를 한 줄로 이어 보여주는 차트 (모두 오늘 가치)
export function LifeChart({ acc, wd, alt, need }: { acc: P[]; wd: P[]; alt: P[]; need: number }) {
  const W = 680, H = 260, pad = 46
  const a0 = acc[0].age, a1 = wd[wd.length - 1].age
  const max = Math.max(need, ...acc.map(p => p.v), ...wd.map(p => p.v), ...alt.map(p => p.v), 1) * 1.1
  const x = (age: number) => pad + ((age - a0) / Math.max(1, a1 - a0)) * (W - pad * 2)
  const y = (v: number) => H - pad - (Math.max(v, 0) / max) * (H - pad * 2)
  const d = (pts: P[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.age)},${y(p.v)}`).join(' ')
  const rx = x(wd[0].age)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="적립기와 인출기 자산 경로">
      <line className="axis" x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} />
      <line className="mark" x1={rx} x2={rx} y1={22} y2={H - pad} />
      <text className="lbl" x={rx} y={16} textAnchor="middle">인출 시작</text>
      <path d={d(alt)} className="alt" />
      <path d={d(acc)} className="line" />
      <path d={d(wd)} className="line" />
      <circle cx={rx} cy={y(need)} r="5" className="needdot" />
      <text className="lbl" x={rx - 9} y={y(need) - 8} textAnchor="end">필요 {fmt(need)}</text>
      <text className="lbl" x={pad} y={H - 14}>{a0}세</text>
      <text className="lbl" x={W - pad} y={H - 14} textAnchor="end">{a1}세</text>
    </svg>
  )
}

export function Donut({ data }: { data: { label: string; value: number }[] }) {
  const rows = data.filter(d => d.value > 0)
  const total = rows.reduce((t, d) => t + d.value, 0)
  if (total <= 0) return <p className="empty">비중을 볼 자산이 없습니다.</p>
  let cum = 0
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 42 42" className="donut" role="img" aria-label="자산 비중">
        <circle cx="21" cy="21" r="15.915" fill="none" stroke="#e6ebf0" strokeWidth="6" />
        {rows.map((d, i) => {
          const pc = (d.value / total) * 100
          const el = <circle key={i} cx="21" cy="21" r="15.915" fill="none" stroke={COL[i % COL.length]} strokeWidth="6" strokeDasharray={`${pc} ${100 - pc}`} strokeDashoffset={25 - cum} />
          cum += pc
          return el
        })}
      </svg>
      <ul className="legend">
        {rows.map((d, i) => (
          <li key={i}><i style={{ background: COL[i % COL.length] }} /><span>{d.label}</span><b>{((d.value / total) * 100).toFixed(1)}%</b></li>
        ))}
      </ul>
    </div>
  )
}
