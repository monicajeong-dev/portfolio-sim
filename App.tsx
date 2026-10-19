import { useEffect, useState } from 'react'

// 모든 금액 단위: 원 (1원까지 입력)
type Acc = { name: string; note: string; bal: number; principal: number; pmt: number; ret: number; vol?: number }
type Loan = { id: number; name: string; bal: number; rate: number; pay: number }
type Holding = { id: number; name: string; acc: number; qty: number; avg: number; price: number; ret?: number; vol?: number }
type Cash = { id: number; name: string; bal: number; pmt: number; rate: number }
type S = {
  stockPct: number; bondPct: number; cashPct: number;
  age: number; retireAge: number; endAge: number
  monthly: number; keep: number; inflation: number; wRet: number
  salary: number; reinvest: boolean
  loans: Loan[]
  holdings: Holding[]
  cash: Cash[]
  accs: Acc[]
}

// 계좌 순서 고정: 0 CMA, 1 ISA, 2 IRP, 3 연금저축, 4 일반
const DEFAULT: S = {
  stockPct: 60, bondPct: 30, cashPct: 10,
  age: 40, retireAge: 55, endAge: 90,
  monthly: 0, keep: 0, inflation: 3, wRet: 4,
  salary: 0, reinvest: true,
  loans: [], holdings: [], cash: [],
  accs: [
    { name: 'CMA', note: '비상금·대기자금', bal: 0, principal: 0, pmt: 0, ret: 2 },
    { name: 'ISA', note: '중기 절세 투자', bal: 0, principal: 0, pmt: 0, ret: 5 },
    { name: 'IRP', note: '세액공제·노후', bal: 0, principal: 0, pmt: 0, ret: 5 },
    { name: '연금저축', note: '세액공제·노후', bal: 0, principal: 0, pmt: 0, ret: 5 },
    { name: '일반 투자', note: '주식·ETF 등', bal: 0, principal: 0, pmt: 0, ret: 7 },
  ],
}

// 세금 가정 (세법 개정 시 여기만 수정)
const TAX = {
  deposit: 0.154, isaExempt: 2_000_000, isaRate: 0.099, pension: 0.055,
  creditPension: 6_000_000, creditTotal: 9_000_000, salaryLine: 55_000_000, creditLow: 0.165, creditHigh: 0.132,
}
const DEF_VOL = [0.5, 12, 10, 10, 15] // 계좌별 기본 변동성(%): CMA, ISA, IRP, 연금저축, 일반
const COL = ['#0d7c8f', '#c0561b', '#3b5bdb', '#1b8a5a', '#9c36b5', '#d4a017', '#e03e6b', '#5f6b7a']

const hv = (h: Holding) => h.qty * h.price // 종목 평가금액
const hp = (h: Holding) => h.qty * h.avg // 종목 투자원금
const won = (v: number) => `${Math.round(v).toLocaleString()}원`
const fmt = (v: number) => {
  const a = Math.abs(v), s = v < 0 ? '-' : ''
  if (a >= 1e8) return `${s}${(a / 1e8).toFixed(2)}억원`
  if (a >= 1e4) return `${s}${Math.round(a / 1e4).toLocaleString()}만원`
  return `${s}${Math.round(a).toLocaleString()}원`
}

function load(): S {
  try {
    const r = localStorage.getItem('sim-v3') // 초기 금액 0원 기본값 버전
    return r ? { ...DEFAULT, ...JSON.parse(r), stockPct: JSON.parse(r).stockPct ?? 60, bondPct: JSON.parse(r).bondPct ?? 30, cashPct: JSON.parse(r).cashPct ?? 10 } : DEFAULT
  } catch { return DEFAULT }
}

function randn() {
  let u = 0, v = 0
  while (!u) u = Math.random()
  while (!v) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// 연금저축·IRP 세액공제 환급 (연)
function credit(s: S) {
  const pen = Math.min(s.accs[3].pmt * 12, TAX.creditPension)
  const base = Math.min(pen + s.accs[2].pmt * 12, TAX.creditTotal)
  const rate = s.salary <= TAX.salaryLine ? TAX.creditLow : TAX.creditHigh
  return { refund: base * rate, base, room: TAX.creditTotal - base, rate }
}

const kindOf = (i: number) => (i === 1 ? 1 : i === 2 || i === 3 ? 2 : 0) // 0 과세, 1 ISA, 2 연금

// stoch=true면 매달 시장 충격을 무작위로 넣습니다(몬테카를로 1회)
function simulate(s: S, stoch = false) {
  const years = Math.max(0, s.retireAge - s.age), months = years * 12
  const infl = s.inflation / 100
  const items = [
    ...s.accs.map((a, i) => ({ kind: kindOf(i), bal: a.bal, pr: a.principal, pmt: a.pmt, ret: a.ret, vol: a.vol ?? DEF_VOL[i] })),
    ...s.holdings.map(h => ({ kind: kindOf(h.acc), bal: hv(h), pr: hp(h), pmt: 0, ret: h.ret ?? s.accs[h.acc].ret, vol: h.vol ?? 18 })),
    ...s.cash.map(c => ({ kind: 0, bal: c.bal, pr: c.bal, pmt: c.pmt, ret: c.rate, vol: 0 })),
  ]
  // 과세 항목은 수익에 15.4%를 매년 반영 (단순화)
  const rm = items.map(x => Math.pow(1 + (x.ret / 100) * (x.kind === 0 ? 1 - TAX.deposit : 1), 1 / 12) - 1)
  const b = items.map(x => x.bal), pr = items.map(x => x.pr)
  const d = s.loans.map(l => l.bal)
  const debt = () => d.reduce((t, v) => t + v, 0)
  const cr = credit(s)

  // 세후 가치: ISA는 계좌 전체를 합쳐 한 번만 비과세·분리과세, 연금계좌는 연금소득세 차감
  const net = () => {
    let sum = 0, isaB = 0, isaP = 0
    b.forEach((v, i) => {
      const k = items[i].kind
      if (k === 2) sum += v * (1 - TAX.pension)
      else if (k === 1) { isaB += v; isaP += pr[i] }
      else sum += v
    })
    return sum + isaB - Math.max(0, isaB - isaP - TAX.isaExempt) * TAX.isaRate
  }

  const series = [{ age: s.age, v: net() - debt() }]
  for (let m = 1; m <= months; m++) {
    const zm = stoch ? randn() : 0
    items.forEach((x, i) => {
      let g = 1 + rm[i]
      if (stoch && x.vol > 0) g = Math.max(0.01, g + (x.vol / 100 / Math.sqrt(12)) * (0.7 * zm + 0.714 * randn()))
      b[i] = (b[i] + x.pmt) * g
      pr[i] += x.pmt
    })
    s.loans.forEach((l, i) => { d[i] = Math.max(0, d[i] * (1 + l.rate / 1200) - l.pay) })
    if (m % 12 === 0) {
      if (s.reinvest) b[3] += cr.refund // 세액공제 환급금을 연금저축에 재투자
      series.push({ age: s.age + m / 12, v: (net() - debt()) / Math.pow(1 + infl, m / 12) })
    }
  }

  const f = Math.pow(1 + infl, years)
  const debtLeft = debt()
  const assetNom = net() - debtLeft
  const assetReal = assetNom / f

  // 인출 단계: 오늘 가치 기준 필요 자산 = 월 인출의 현재가치 + 남길 돈의 현재가치
  const T = Math.max(1, s.endAge - s.retireAge)
  const rw = (1 + s.wRet / 100) / (1 + infl) - 1
  const rmw = Math.pow(1 + rw, 1 / 12) - 1
  const n = T * 12
  const ann = Math.abs(rmw) < 1e-9 ? n : (1 - Math.pow(1 + rmw, -n)) / rmw
  const need = s.monthly * ann + s.keep / Math.pow(1 + rw, T)

  const gap = need - assetReal
  const ra = rm[1]
  const fac = months === 0 ? 0 : ra === 0 ? months : (Math.pow(1 + ra, months) - 1) / ra
  const extra = gap > 0 && fac > 0 ? (gap * f) / fac : 0
  return { years, series, assetNom, assetReal, need, gap, extra, debtLeft, credit: cr }
}

// 같은 입력으로 미래를 runs번 만들어 성공 비율과 하위10/50/상위90% 경로를 구합니다
function monteCarlo(s: S, runs = 1000) {
  const finals: number[] = []
  const cols: number[][] = []
  let ages: number[] = []
  for (let i = 0; i < runs; i++) {
    const r = simulate(s, true)
    finals.push(r.assetReal)
    ages = r.series.map(p => p.age)
    r.series.forEach((p, j) => { if (!cols[j]) cols[j] = []; cols[j].push(p.v) })
  }
  const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))]
  // 은퇴 후에도 월별 시장 충격을 적용하며 인출합니다. 잔액이 목표 잔존금액보다
  // 낮아지면 실패로 판정합니다. 금액은 모두 오늘의 구매력 기준입니다.
  const years = Math.max(1, s.endAge - s.retireAge)
  const months = years * 12
  const realAnnual = (1 + s.wRet / 100) / (1 + s.inflation / 100) - 1
  const baseMonthly = Math.pow(1 + realAnnual, 1 / 12) - 1
  const weights = s.accs.map(a => Math.max(0, a.bal) + Math.max(0, a.pmt) * 12)
  const vols = s.accs.map((a, i) => a.vol ?? DEF_VOL[i])
  const weightSum = weights.reduce((a, b) => a + b, 0)
  const allocationTotal = Math.max(1, s.stockPct + s.bondPct + s.cashPct)
  const stockW = s.stockPct / allocationTotal, bondW = s.bondPct / allocationTotal, cashW = s.cashPct / allocationTotal
  const portfolioVol = Math.sqrt(stockW * stockW * 0.20 * 0.20 + bondW * bondW * 0.06 * 0.06 + cashW * cashW * 0.01 * 0.01 + 2 * stockW * bondW * 0.15 * 0.20 * 0.06)
  let successes = 0
  const withdrawalCols: number[][] = Array.from({ length: years + 1 }, () => [])
  let depletionMonths: number[] = []
  finals.forEach(start => {
    let balance = Math.max(0, start)
    withdrawalCols[0].push(balance)
    let depletedAt = -1
    let survived = true
    for (let m = 0; m < months; m++) {
      const shock = (portfolioVol / Math.sqrt(12)) * randn()
      balance = Math.max(0, balance * Math.max(0.01, 1 + baseMonthly + shock) - s.monthly)
      if (balance <= 0 && depletedAt < 0) { depletedAt = m + 1; survived = false }
      if ((m + 1) % 12 === 0) withdrawalCols[Math.floor((m + 1) / 12)].push(balance)
    }
    if (depletedAt >= 0) depletionMonths.push(depletedAt)
    if (survived && balance >= s.keep) successes++
  })
  return {
    rate: successes / runs,
    p10: q(finals, 0.1), p50: q(finals, 0.5), p90: q(finals, 0.9),
    fan: ages.map((age, j) => ({ age, lo: q(cols[j], 0.1), hi: q(cols[j], 0.9) })),
    withdrawalFan: withdrawalCols.map((vals, year) => ({ age: s.retireAge + year, lo: vals.length ? q(vals, 0.1) : 0, mid: vals.length ? q(vals, 0.5) : 0, hi: vals.length ? q(vals, 0.9) : 0 })),
    depletionAge: depletionMonths.length ? s.retireAge + Math.min(...depletionMonths) / 12 : null,
  }
}

// 1원 단위 금액 입력: 숫자만 받고 천 단위 콤마를 자동으로 붙입니다
function Money(p: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span>{p.label}</span>
      <div className="inp">
        <input
          inputMode="numeric"
          placeholder="0"
          value={p.value ? p.value.toLocaleString() : ''}
          onChange={e => { const d = e.target.value.replace(/[^\d]/g, ''); p.onChange(d ? Number(d) : 0) }}
        />
        <em>원</em>
      </div>
      <small className="read">{p.value >= 10000 ? fmt(p.value) : '\u00a0'}</small>
    </label>
  )
}

function Num(p: { label: string; value: number; unit: string; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span>{p.label}</span>
      <div className="inp">
        <input type="number" value={p.value} step={p.step ?? 1} onChange={e => p.onChange(Number(e.target.value))} />
        <em>{p.unit}</em>
      </div>
    </label>
  )
}

function Rng(p: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span>{p.label} <b>{p.value}{p.unit}</b></span>
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.value} onChange={e => p.onChange(Number(e.target.value))} />
    </label>
  )
}

function Chart({ pts, need, fan }: { pts: { age: number; v: number }[]; need: number; fan?: { age: number; lo: number; hi: number }[] }) {
  const W = 640, H = 240, pad = 40
  const max = Math.max(need, ...pts.map(p => p.v), ...(fan ?? []).map(f => f.hi)) * 1.1 || 1
  const x = (i: number) => pad + (pts.length < 2 ? 0 : (i * (W - pad * 2)) / (pts.length - 1))
  const y = (v: number) => H - pad - (Math.max(v, 0) / max) * (H - pad * 2)
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.v)}`).join(' ')
  const band = fan && fan.length > 1
    ? fan.map((f, i) => `${i ? 'L' : 'M'}${x(i)},${y(f.hi)}`).join(' ') + ' ' +
      [...fan].reverse().map((f, i) => `L${x(fan.length - 1 - i)},${y(f.lo)}`).join(' ') + ' Z'
    : ''
  const last = pts.length - 1
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="자산 성장 차트">
      {band && <path d={band} className="band" />}
      <line className="need" x1={pad} x2={W - pad} y1={y(need)} y2={y(need)} />
      <text className="lbl" x={W - pad} y={y(need) - 8} textAnchor="end">필요 자산 {fmt(need)}</text>
      <path d={path} className="line" />
      <circle cx={x(last)} cy={y(pts[last].v)} r="5" className="dot" />
      <text className="lbl" x={x(last)} y={y(pts[last].v) + 20} textAnchor="end">{fmt(pts[last].v)}</text>
      <text className="lbl" x={pad} y={H - 12}>{pts[0].age}세</text>
      <text className="lbl" x={W - pad} y={H - 12} textAnchor="end">{pts[last].age}세</text>
    </svg>
  )
}

function Donut({ data }: { data: { label: string; value: number }[] }) {
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


function WithdrawalChart({ rows }: { rows: { age: number; lo: number; mid: number; hi: number }[] }) {
  if (!rows.length) return <p className="empty">확률 계산을 실행하면 인출기 경로가 표시됩니다.</p>
  const W=640,H=220,pad=42,max=Math.max(1,...rows.map(r=>r.hi));
  const x=(i:number)=>pad+(rows.length<2?0:i*(W-pad*2)/(rows.length-1));
  const y=(v:number)=>H-pad-Math.max(0,v)/max*(H-pad*2);
  const line=(key:'lo'|'mid'|'hi')=>rows.map((r,i)=>`${i?'L':'M'}${x(i)},${y(r[key])}`).join(' ');
  return <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="은퇴 후 자산 잔액 확률 경로"><path d={line('hi')} className="band-line"/><path d={line('mid')} className="line"/><path d={line('lo')} className="need-line"/><text className="lbl" x={pad} y={H-10}>{rows[0].age}세</text><text className="lbl" x={W-pad} y={H-10} textAnchor="end">{rows[rows.length-1].age}세</text></svg>
}

export default function App() {
  const [s, setS] = useState<S>(load)
  const [mc, setMc] = useState<(ReturnType<typeof monteCarlo> & { key: string }) | null>(null)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<'acc' | 'item'>('acc')
  const [importError, setImportError] = useState('')
  useEffect(() => { try { localStorage.setItem('sim-v3', JSON.stringify(s)) } catch { /* 저장 실패는 무시 */ } }, [s])

  const set = <K extends keyof S>(k: K, v: S[K]) => setS(o => ({ ...o, [k]: v }))
  const setAcc = (i: number, k: keyof Acc, v: number) =>
    setS(o => ({ ...o, accs: o.accs.map((a, j) => (j === i ? { ...a, [k]: v } : a)) }))
  const setLoan = (id: number, k: keyof Loan, v: string | number) =>
    setS(o => ({ ...o, loans: o.loans.map(l => (l.id === id ? { ...l, [k]: v } : l)) }))
  const addLoan = () =>
    setS(o => ({ ...o, loans: [...o.loans, { id: Date.now(), name: `대출 ${o.loans.length + 1}`, bal: 0, rate: 4, pay: 0 }] }))
  const delLoan = (id: number) => setS(o => ({ ...o, loans: o.loans.filter(l => l.id !== id) }))
  const setHolding = (id: number, k: keyof Holding, v: string | number) =>
    setS(o => ({ ...o, holdings: o.holdings.map(h => (h.id === id ? { ...h, [k]: v } : h)) }))
  const addHolding = () =>
    setS(o => ({ ...o, holdings: [...o.holdings, { id: Date.now(), name: `종목 ${o.holdings.length + 1}`, acc: 4, qty: 0, avg: 0, price: 0, ret: 5, vol: 18 }] }))
  const delHolding = (id: number) => setS(o => ({ ...o, holdings: o.holdings.filter(h => h.id !== id) }))
  const setCash = (id: number, k: keyof Cash, v: string | number) =>
    setS(o => ({ ...o, cash: o.cash.map(c => (c.id === id ? { ...c, [k]: v } : c)) }))
  const addCash = () =>
    setS(o => ({ ...o, cash: [...o.cash, { id: Date.now(), name: `예·적금 ${o.cash.length + 1}`, bal: 0, pmt: 0, rate: 3 }] }))
  const delCash = (id: number) => setS(o => ({ ...o, cash: o.cash.filter(c => c.id !== id) }))
  const accStock = (i: number) => s.holdings.filter(h => h.acc === i).reduce((t, h) => t + hv(h), 0)

  const r = simulate(s)
  const pct = r.need > 0 ? (r.assetReal / r.need) * 100 : 0
  const ok = r.gap <= 0
  const stockVal = s.holdings.reduce((t, h) => t + hv(h), 0)
  const stockPrin = s.holdings.reduce((t, h) => t + hp(h), 0)
  const cashTotal = s.cash.reduce((t, c) => t + c.bal, 0)
  const totalBal = s.accs.reduce((t, a) => t + a.bal, 0) + stockVal + cashTotal
  const totalPrin = s.accs.reduce((t, a) => t + a.principal, 0) + stockPrin + cashTotal
  const totalPmt = s.accs.reduce((t, a) => t + a.pmt, 0) + s.cash.reduce((t, c) => t + c.pmt, 0)
  const totalDebt = s.loans.reduce((t, l) => t + l.bal, 0)
  const totalPay = s.loans.reduce((t, l) => t + l.pay, 0)
  const profit = totalBal - totalPrin

  const byAcc = [...s.accs.map((a, i) => ({ label: a.name, value: a.bal + accStock(i) })), { label: '예·적금', value: cashTotal }]
  const byItem = [
    ...s.holdings.map(h => ({ label: h.name || '종목', value: hv(h) })),
    { label: '종목 외 계좌 잔액', value: s.accs.reduce((t, a) => t + a.bal, 0) },
    { label: '예·적금', value: cashTotal },
  ]
  const stale = !!mc && mc.key !== JSON.stringify(s)
  const runMC = () => {
    setBusy(true)
    const key = JSON.stringify(s)
    setTimeout(() => { setMc({ ...monteCarlo(s), key }); setBusy(false) }, 30)
  }

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'portfolio-sim-backup.json'; a.click(); URL.revokeObjectURL(url);
  }
  const importJSON = async (file?: File) => {
    if (!file) return;
    try { const parsed = JSON.parse(await file.text()); if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.accs)) throw new Error('형식이 올바르지 않습니다.'); setS({ ...DEFAULT, ...parsed }); setMc(null); setImportError(''); } catch { setImportError('JSON 파일을 읽지 못했습니다. 이 시뮬레이터에서 내보낸 백업 파일인지 확인해 주세요.'); }
  }
  const allocTotal = Math.max(1, s.stockPct + s.bondPct + s.cashPct)
  const allocReturn = (s.stockPct * 7 + s.bondPct * 3.5 + s.cashPct * 2) / allocTotal
  const scenarioSpend = (extraPmt: number, retireAge: number) => simulate({ ...s, accs: s.accs.map((a, i) => i === 1 ? { ...a, pmt: a.pmt + extraPmt } : a), retireAge }).gap
  const extraNeeded = (() => { if (ok) return 0; let lo=0,hi=100000; while(hi<100000000 && scenarioSpend(hi,s.retireAge)>0) hi*=2; for(let i=0;i<28;i++){const mid=(lo+hi)/2;if(scenarioSpend(mid,s.retireAge)<=0)hi=mid;else lo=mid;} return Math.ceil(hi/10000)*10000 })()
  const delayedAge = (() => { for(let a=Math.max(s.retireAge+1,s.age+1);a<=Math.min(85,s.endAge-1);a++){if(simulate({ ...s, retireAge:a }).gap<=0)return a;} return null })()
  const reducedMonthly = (() => { let lo=0,hi=s.monthly; for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(simulate({ ...s, monthly:mid }).gap<=0)lo=mid;else hi=mid;} return Math.floor(lo/10000)*10000 })()

  return (
    <div className="page">
      <header className="top">
        <h1>캐시플로우 플래너</h1>
        <p>
          {s.retireAge}세부터 {s.endAge}세까지,
          통장에 매달 세후 {won(s.monthly)}이 찍히려면
        </p>
        <p>
          현재 자산과 투자 계획을 바탕으로
          목표 달성에 필요한 방법을 시뮬레이션해 보세요.</p>
        
      </header>

      <section className="card backup-tools">
        <h2>백업 및 복원</h2>
        <div className="tool-row"><button className="btn" onClick={exportJSON}>JSON 백업 다운로드</button><label className="btn file-btn">JSON 백업 불러오기<input type="file" accept="application/json,.json" onChange={e => importJSON(e.target.files?.[0])} /></label></div>
        {importError && <p className="warn">{importError}</p>}<p className="hint">다른 기기에서 이 파일을 불러오면 입력값을 복원할 수 있습니다. 백업 파일에는 금융 정보가 포함될 수 있으니 안전하게 보관하세요.</p>
      </section>
      <div className="layout">
        <main className="inputs">
          <section className="card">
            <h2>나와 목표</h2>
            <div className="grid3">
              <Num label="현재 나이" value={s.age} unit="세" onChange={v => set('age', v)} />
              <Num label="인출 시작 나이" value={s.retireAge} unit="세" onChange={v => set('retireAge', v)} />
              <Num label="인출 종료 나이" value={s.endAge} unit="세" onChange={v => set('endAge', v)} />
            </div>
            <div className="grid2" style={{ marginTop: 14 }}>
              <Money label="월 목표 (세후)" value={s.monthly} onChange={v => set('monthly', v)} />
              <Money label="끝까지 남길 원금" value={s.keep} onChange={v => set('keep', v)} />
            </div>
          </section>

          <section className="card">
            <h2>보수적 가정</h2>
            <div className="grid2">
              <Rng label="물가상승률" value={s.inflation} min={0} max={6} step={0.5} unit="%" onChange={v => set('inflation', v)} />
              <Rng label="인출기 수익률" value={s.wRet} min={0} max={8} step={0.5} unit="%" onChange={v => set('wRet', v)} />
            </div>
            <p className="hint">적립기 수익률은 아래 계좌별로 입력합니다. 물가가 높고 수익률이 낮을수록 필요 자산이 커집니다.</p>
          </section>

          <section className="card">
            <h2>자산 배분 시뮬레이션</h2>
            <p className="hint">비중을 조절하면 인출기 확률 계산의 예상 변동성이 달라집니다. 비중은 자동으로 100% 정규화해 계산합니다.</p>
            <div className="grid3">
              <Rng label="주식" value={s.stockPct} min={0} max={100} step={5} unit="%" onChange={v => set('stockPct',v)} />
              <Rng label="채권" value={s.bondPct} min={0} max={100} step={5} unit="%" onChange={v => set('bondPct',v)} />
              <Rng label="현금" value={s.cashPct} min={0} max={100} step={5} unit="%" onChange={v => set('cashPct',v)} />
            </div>
            <p className="sum-line">입력 비중 {s.stockPct+s.bondPct+s.cashPct}% · 가중 기대수익률 예시 <b>{allocReturn.toFixed(2)}%</b> · 예상 변동성 <b>{(Math.sqrt(Math.pow(s.stockPct/allocTotal*.20,2)+Math.pow(s.bondPct/allocTotal*.06,2)+Math.pow(s.cashPct/allocTotal*.01,2))*100).toFixed(1)}%</b></p>
          </section>

          <section className="card">
            <h2>내 계좌</h2>
            {s.accs.map((a, i) => (
              <div className="acc" key={a.name}>
                <div className="acc-head"><strong>{a.name}</strong><span>{a.note}</span>{accStock(i) > 0 && <span className="stock">보유 종목 {won(accStock(i))} 별도</span>}</div>
                <div className="grid2">
                  <Money label="평가금액 (종목 제외)" value={a.bal} onChange={v => setAcc(i, 'bal', v)} />
                  <Money label="투자원금 (종목 제외)" value={a.principal} onChange={v => setAcc(i, 'principal', v)} />
                  <Money label="월 납입" value={a.pmt} onChange={v => setAcc(i, 'pmt', v)} />
                  <Num label="기대수익률" value={a.ret} unit="%" step={0.5} onChange={v => setAcc(i, 'ret', v)} />
                  <Num label="변동성 (확률 계산용)" value={a.vol ?? DEF_VOL[i]} unit="%" step={0.5} onChange={v => setAcc(i, 'vol', v)} />
                </div>
              </div>
            ))}
          </section>

          <section className="card">
            <h2>세액공제 환급</h2>
            <div className="grid2">
              <Money label="연 총급여" value={s.salary} onChange={v => set('salary', v)} />
              <label className="check">
                <input type="checkbox" checked={s.reinvest} onChange={e => set('reinvest', e.target.checked)} />
                환급금을 연금저축에 재투자
              </label>
            </div>
            <p className="sum-line">
              연 환급 예상 <b>{won(r.credit.refund)}</b> 공제율 <b>{(r.credit.rate * 100).toFixed(1)}%</b> 공제 대상 납입 <b>{won(r.credit.base)}</b>
            </p>
            {r.credit.room > 0 && (
              <p className="hint">공제 한도까지 연 {won(r.credit.room)} 여유가 있습니다. 한도는 연금저축 {fmt(TAX.creditPension)}, IRP 포함 {fmt(TAX.creditTotal)}입니다.</p>
            )}
          </section>

          <section className="card">
            <h2>보유 종목</h2>
            {s.holdings.length === 0 && <p className="empty">주식·ETF를 계좌별로 기록해 보세요. 원화 환산 가격으로 입력합니다.</p>}
            {s.holdings.map(h => {
              const diff = hv(h) - hp(h)
              return (
                <div className="loan" key={h.id}>
                  <div className="loan-head">
                    <input className="name-input" value={h.name} aria-label="종목명" onChange={e => setHolding(h.id, 'name', e.target.value)} />
                    <select className="sel" value={h.acc} aria-label="보유 계좌" onChange={e => setHolding(h.id, 'acc', Number(e.target.value))}>
                      {s.accs.map((a, i) => <option key={a.name} value={i}>{a.name}</option>)}
                    </select>
                    <button className="btn-del" onClick={() => delHolding(h.id)}>삭제</button>
                  </div>
                  <div className="grid3">
                    <Num label="수량" value={h.qty} unit="주" onChange={v => setHolding(h.id, 'qty', v)} />
                    <Money label="평균 매입가" value={h.avg} onChange={v => setHolding(h.id, 'avg', v)} />
                    <Money label="현재가" value={h.price} onChange={v => setHolding(h.id, 'price', v)} />
                  </div>
                  <div className="grid2" style={{ marginTop: 10 }}>
                    <Num label="기대수익률" value={h.ret ?? s.accs[h.acc].ret} unit="%" step={0.5} onChange={v => setHolding(h.id, 'ret', v)} />
                    <Num label="변동성 (확률 계산용)" value={h.vol ?? 18} unit="%" step={0.5} onChange={v => setHolding(h.id, 'vol', v)} />
                  </div>
                  <p className="sum-line">
                    평가금액 <b>{won(hv(h))}</b> 평가손익{' '}
                    <b className={diff >= 0 ? 'up' : 'down'}>{diff >= 0 ? '+' : ''}{won(diff)}{hp(h) > 0 ? ` (${((diff / hp(h)) * 100).toFixed(1)}%)` : ''}</b>
                  </p>
                </div>
              )
            })}
            <button className="btn" onClick={addHolding}>+ 종목 추가</button>
            <p className="hint">종목은 선택한 계좌의 잔액에 더해지고, 종목마다 자기 기대수익률로 계산됩니다. 변동성은 주식형 15~25%, 채권형 3~8% 정도가 일반적입니다. 해외 종목은 원화로 환산한 가격을 입력하세요.</p>
          </section>

          <section className="card">
            <h2>현금성 자산 (예금·적금)</h2>
            {s.cash.length === 0 && <p className="empty">예금, 적금, 파킹통장 같은 현금성 자산을 추가하세요.</p>}
            {s.cash.map(c => (
              <div className="loan" key={c.id}>
                <div className="loan-head">
                  <input className="name-input" value={c.name} aria-label="상품명" onChange={e => setCash(c.id, 'name', e.target.value)} />
                  <button className="btn-del" onClick={() => delCash(c.id)}>삭제</button>
                </div>
                <div className="grid3">
                  <Money label="현재 잔액" value={c.bal} onChange={v => setCash(c.id, 'bal', v)} />
                  <Money label="월 납입 (적금)" value={c.pmt} onChange={v => setCash(c.id, 'pmt', v)} />
                  <Num label="이자율 (연)" value={c.rate} unit="%" step={0.1} onChange={v => setCash(c.id, 'rate', v)} />
                </div>
              </div>
            ))}
            <button className="btn" onClick={addCash}>+ 예·적금 추가</button>
            <p className="hint">이자에는 15.4%를 과세한다고 가정하고, 만기가 되면 같은 조건으로 계속 굴린다고 봅니다.</p>
          </section>

          <section className="card">
            <h2>부채</h2>
            {s.loans.length === 0 && <p className="empty">등록된 대출이 없습니다. 대출이 있다면 종류별로 추가하세요.</p>}
            {s.loans.map(l => (
              <div className="loan" key={l.id}>
                <div className="loan-head">
                  <input className="name-input" value={l.name} aria-label="대출 이름" onChange={e => setLoan(l.id, 'name', e.target.value)} />
                  <button className="btn-del" onClick={() => delLoan(l.id)}>삭제</button>
                </div>
                <div className="grid3">
                  <Money label="대출 잔액" value={l.bal} onChange={v => setLoan(l.id, 'bal', v)} />
                  <Num label="금리 (연)" value={l.rate} unit="%" step={0.1} onChange={v => setLoan(l.id, 'rate', v)} />
                  <Money label="월 상환액" value={l.pay} onChange={v => setLoan(l.id, 'pay', v)} />
                </div>
                {l.bal > 0 && l.pay < (l.bal * l.rate) / 1200 && (
                  <p className="warn">월 상환액이 월 이자(약 {won((l.bal * l.rate) / 1200)})보다 적어 잔액이 계속 늘어납니다.</p>
                )}
              </div>
            ))}
            <button className="btn" onClick={addLoan}>+ 대출 추가</button>
            <p className="hint">월 상환액은 위 납입액과 별개로 나가는 돈입니다. 인출 시작 시점에 남은 대출은 자산에서 차감합니다.</p>
          </section>
        </main>

        <aside className="result">
          <section className={`hero ${ok ? 'good' : 'short'}`}>
            <p className="hero-sub">{s.retireAge}세 시점 달성률</p>
            <p className="hero-num">{pct.toFixed(0)}%</p>
            <div className="bar"><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
            <p className="hero-msg">
              {ok ? `목표를 ${fmt(-r.gap)} 넘게 모을 수 있어요.` : `오늘 가치로 ${fmt(r.gap)}이 부족해요.`}
            </p>
          </section>

          {!ok && r.extra > 0 && (
            <section className="card note">
              월 <b>{won(Math.ceil(r.extra))}</b>을 ISA에 더 넣으면 메울 수 있어요.
              <small>ISA 수익률 기준의 단순 계산입니다.</small>
            </section>
          )}

          <section className="card">
            <h2>목표 부족 해결 시나리오</h2>
            {ok ? <p className="sum-line">현재 입력 기준으로 목표 자산을 충족합니다. 납입액이나 배분을 바꿔 여유도를 확인해 보세요.</p> : <div className="scenario-list">
              <div><span>① 월 납입액 늘리기</span><b>월 {won(extraNeeded)} 추가</b><small>현재 ISA 월 납입액에 추가하는 금액으로 계산한 근사치입니다.</small></div>
              <div><span>② 인출 시작 늦추기</span><b>{delayedAge === null ? '목표 달성 불가' : `${delayedAge}세부터 인출`}</b><small>{delayedAge === null ? '현재 종료 나이까지 연기해도 부족할 수 있습니다.' : `현재보다 ${delayedAge-s.retireAge}년 늦춥니다.`}</small></div>
              <div><span>③ 월 목표 생활비 줄이기</span><b>월 {won(reducedMonthly)} 이하</b><small>오늘 가치 기준 월 인출 목표의 근사치입니다.</small></div>
            </div>}
          </section>

          <section className="card">
            <h2>성공 확률 (몬테카를로)</h2>
            <p className="hint" style={{ marginTop: 0 }}>적립기와 인출기 모두 시장 변동을 반영한 1,000개 경로를 계산합니다. 인출 기간 동안 자산이 고갈되지 않고 목표 잔존금액을 지키는 비율입니다.</p>
            {mc && (
              <>
                <p className={`mc-num ${mc.rate >= 0.8 ? 'good' : mc.rate >= 0.5 ? 'mid' : 'low'}`}>{(mc.rate * 100).toFixed(0)}%</p>
                <dl className="stats">
                  <div><dt>은퇴 시 자산 (하위 10%)</dt><dd>{fmt(mc.p10)}</dd></div>
                  <div><dt>은퇴 시 자산 (중앙값)</dt><dd>{fmt(mc.p50)}</dd></div>
                  <div><dt>은퇴 시 자산 (상위 10%)</dt><dd>{fmt(mc.p90)}</dd></div>
                </dl>
                <small className="hint">성공 확률은 인출기 변동까지 반영합니다. 자산 범위와 아래 차트는 은퇴 전 적립기의 결과이며, 모두 오늘 가치 기준입니다.</small>
                {stale && <p className="warn">입력이 바뀌었습니다. 다시 돌려야 최신 결과가 나옵니다.</p>}
              </>
            )}
            <button className="btn" style={{ marginTop: 12 }} onClick={runMC} disabled={busy}>{busy ? '계산 중…' : mc ? '다시 돌리기' : '1,000번 돌려보기'}</button>
          </section>

          <section className="card">
            <h2>{s.retireAge}세에 필요한 자산 vs 예상 자산</h2>
            <Chart pts={r.series} need={r.need} fan={mc?.fan} />
            <small className="hint">선은 순자산(자산-부채)을 오늘 가치로 환산한 값입니다.</small>
            <dl className="stats">
              <div><dt>필요 자산 (오늘 가치)</dt><dd>{fmt(r.need)}</dd></div>
              <div><dt>예상 자산 (오늘 가치)</dt><dd>{fmt(r.assetReal)}</dd></div>
              <div><dt>예상 자산 (미래 금액)</dt><dd>{fmt(r.assetNom)}</dd></div>
              <div><dt>인출 시점 남은 대출</dt><dd>{fmt(r.debtLeft)}</dd></div>
            </dl>
          </section>

          <section className="card">
            <h2>인출기 자산 고갈 경로</h2>
            {mc && <p className="sum-line">예상 자산 고갈 시점: <b>{mc.depletionAge === null ? '시뮬레이션 경로에서 고갈 없음' : `${mc.depletionAge.toFixed(1)}세 전후`}</b></p>}
            <WithdrawalChart rows={mc?.withdrawalFan ?? []} />
            {mc && <div className="legend-text"><span>위쪽 선: 상위 10%</span><span>가운데 선: 중앙값</span><span>아래쪽 선: 하위 10%</span></div>}
            <p className="hint">인출기 경로는 현재 가정과 단순화된 월별 무작위 수익률에 따른 예시이며 미래를 예측하거나 보장하지 않습니다.</p>
          </section>

          <section className="card">
            <h2>자산 비중</h2>
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={view === 'acc'} className={view === 'acc' ? 'on' : ''} onClick={() => setView('acc')}>계좌별</button>
              <button role="tab" aria-selected={view === 'item'} className={view === 'item' ? 'on' : ''} onClick={() => setView('item')}>종목별</button>
            </div>
            <Donut data={view === 'acc' ? byAcc : byItem} />
          </section>

          <section className="card">
            <h2>현재 현황</h2>
            <dl className="stats">
              <div><dt>총 평가금액</dt><dd>{won(totalBal)}</dd></div>
              <div><dt>총 투자원금</dt><dd>{won(totalPrin)}</dd></div>
              <div><dt>보유 종목 평가금액</dt><dd>{won(stockVal)}</dd></div>
              <div><dt>현금성 자산</dt><dd>{won(cashTotal)}</dd></div>
              <div><dt>평가손익</dt><dd className={profit >= 0 ? 'up' : 'down'}>{profit >= 0 ? '+' : ''}{won(profit)}</dd></div>
              <div><dt>총 부채 ({s.loans.length}건)</dt><dd>{won(totalDebt)}</dd></div>
              <div><dt>순자산</dt><dd>{won(totalBal - totalDebt)}</dd></div>
              <div><dt>월 총 납입</dt><dd>{won(totalPmt)}</dd></div>
              <div><dt>월 총 상환</dt><dd>{won(totalPay)}</dd></div>
              <div><dt>연 세액공제 환급 예상</dt><dd>{won(r.credit.refund)}</dd></div>
            </dl>
          </section>
        </aside>
      </div>

      <footer>
        참고용 시뮬레이션이며 투자 권유가 아닙니다. 세금은 단순화했습니다: CMA·일반 계좌 수익 15.4%, ISA 만기 비과세 {won(TAX.isaExempt)} 초과분 9.9%, IRP·연금저축 수령 5.5%. 세법은 바뀔 수 있으니 실제 적용 전에 확인하세요.
      </footer>
    </div>
  )
}
