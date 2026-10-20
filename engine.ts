// 계산 엔진: 화면(React)과 완전히 분리된 순수 함수들. 모든 금액 단위는 원.

export type Acc = { name: string; note: string; bal: number; principal: number; pmt: number; ret: number }
export type Loan = { id: number; name: string; bal: number; rate: number; pay: number }
export type Holding = { id: number; name: string; acc: number; qty: number; avg: number; price: number; ret: number; pmt: number }
export type Cash = { id: number; name: string; bal: number; pmt: number; rate: number }
export type Property = { id: number; name: string; value: number; note: string; rent: number; sell: boolean }
export type Income = { id: number; name: string; startAge: number; monthly: number }
export type S = {
  age: number; retireAge: number; endAge: number
  monthly: number; keep: number; inflation: number
  stockPct: number; bondPct: number; cashPct: number
  rStock: number; rBond: number; rCash: number
  salary: number; reinvest: boolean; saleCost: number
  loans: Loan[]; holdings: Holding[]; cash: Cash[]; properties: Property[]; incomes: Income[]
  accs: Acc[]
}
export type Sc = { dRet: number; crash: number } // 수익률 가감(%p), 은퇴 직후 충격(0.25 = -25%)

// 세금·한도 가정 (세법 개정 시 여기만 수정하고 기준일을 확인하세요)
export const TAX = {
  deposit: 0.154, isaExempt: 2_000_000, isaRate: 0.099, pension: 0.055,
  creditPension: 6_000_000, creditTotal: 9_000_000, salaryLine: 55_000_000, creditLow: 0.165, creditHigh: 0.132,
  isaLimit: 20_000_000, pensionLimit: 18_000_000,
}

export const hv = (h: Holding) => h.qty * h.price
export const hp = (h: Holding) => h.qty * h.avg
export const won = (v: number) => `${Math.round(v).toLocaleString()}원`
export const fmt = (v: number) => {
  const a = Math.abs(v), s = v < 0 ? '-' : ''
  if (a >= 1e8) return `${s}${(a / 1e8).toFixed(2)}억원`
  if (a >= 1e4) return `${s}${Math.round(a / 1e4).toLocaleString()}만원`
  return `${s}${Math.round(a).toLocaleString()}원`
}

// 계좌 순서 고정: 0 CMA, 1 ISA, 2 IRP, 3 연금저축, 4 일반
export const DEFAULT: S = {
  age: 40, retireAge: 55, endAge: 90,
  monthly: 0, keep: 0, inflation: 3,
  stockPct: 60, bondPct: 30, cashPct: 10,
  rStock: 6, rBond: 3, rCash: 2,
  salary: 0, reinvest: true, saleCost: 5,
  loans: [], holdings: [], cash: [], properties: [], incomes: [],
  accs: [
    { name: 'CMA', note: '비상금·대기자금', bal: 0, principal: 0, pmt: 0, ret: 2 },
    { name: 'ISA', note: '중기 절세 투자', bal: 0, principal: 0, pmt: 0, ret: 5 },
    { name: 'IRP', note: '세액공제·노후', bal: 0, principal: 0, pmt: 0, ret: 5 },
    { name: '연금저축', note: '세액공제·노후', bal: 0, principal: 0, pmt: 0, ret: 5 },
    { name: '일반 투자', note: '주식·ETF 등', bal: 0, principal: 0, pmt: 0, ret: 7 },
  ],
}

// ---- 저장·불러오기 데이터 정리: 어떤 데이터가 들어와도 화면이 죽지 않게 합니다 ----
const n = (v: unknown, d: number, lo = 0, hi = 1e15) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d
const str = (v: unknown, d: string) => (typeof v === 'string' ? v.slice(0, 40) : d)
const list = (v: unknown): any[] => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object').slice(0, 100) : [])

export function sanitize(raw: any): S {
  const r = raw && typeof raw === 'object' ? raw : {}
  const D = DEFAULT
  let seq = Date.now()
  const id = (x: any) => (typeof x?.id === 'number' && Number.isFinite(x.id) ? x.id : ++seq)
  return {
    age: Math.round(n(r.age, D.age, 0, 120)),
    retireAge: Math.round(n(r.retireAge, D.retireAge, 0, 120)),
    endAge: Math.round(n(r.endAge, D.endAge, 0, 130)),
    monthly: n(r.monthly, D.monthly), keep: n(r.keep, D.keep),
    inflation: n(r.inflation, D.inflation, 0, 20),
    stockPct: n(r.stockPct, D.stockPct, 0, 100), bondPct: n(r.bondPct, D.bondPct, 0, 100), cashPct: n(r.cashPct, D.cashPct, 0, 100),
    rStock: n(r.rStock, D.rStock, -20, 30), rBond: n(r.rBond, D.rBond, -20, 30), rCash: n(r.rCash, D.rCash, -20, 30),
    salary: n(r.salary, D.salary), reinvest: typeof r.reinvest === 'boolean' ? r.reinvest : true,
    saleCost: n(r.saleCost, D.saleCost, 0, 50),
    accs: D.accs.map((d, i) => {
      const a = Array.isArray(r.accs) ? r.accs[i] : undefined
      return { name: d.name, note: d.note, bal: n(a?.bal, 0), principal: n(a?.principal, 0), pmt: n(a?.pmt, 0), ret: n(a?.ret, d.ret, -50, 100) }
    }),
    loans: list(r.loans).map(l => ({ id: id(l), name: str(l.name, '대출'), bal: n(l.bal, 0), rate: n(l.rate, 4.5, 0, 50), pay: n(l.pay, 0) })),
    holdings: list(r.holdings).map(h => {
      const acc = Math.round(n(h.acc, 4, 0, 4))
      return { id: id(h), name: str(h.name, '종목'), acc, qty: n(h.qty, 0), avg: n(h.avg, 0), price: n(h.price, 0), ret: n(h.ret, D.accs[acc].ret, -50, 100), pmt: n(h.pmt, 0) }
    }),
    cash: list(r.cash).map(c => ({ id: id(c), name: str(c.name, '예·적금'), bal: n(c.bal, 0), pmt: n(c.pmt, 0), rate: n(c.rate, 3, 0, 50) })),
    properties: list(r.properties).map(p => ({ id: id(p), name: str(p.name, '부동산'), value: n(p.value, 0), note: str(p.note, ''), rent: n(p.rent, 0), sell: p.sell === true })),
    incomes: list(r.incomes).map(i => ({ id: id(i), name: str(i.name, '연금'), startAge: Math.round(n(i.startAge, 65, 0, 130)), monthly: n(i.monthly, 0) })),
  }
}

// ---- 계산 ----
const accPmt = (s: S, i: number) => s.accs[i].pmt + s.holdings.filter(h => h.acc === i).reduce((t, h) => t + h.pmt, 0)

// 인출기 기대수익률(명목, %): 자산 배분 비중 × 자산군별 기대수익률
export const wRetOf = (s: S) => {
  const t = s.stockPct + s.bondPct + s.cashPct
  return t > 0 ? (s.stockPct * s.rStock + s.bondPct * s.rBond + s.cashPct * s.rCash) / t : 0
}

// 연금저축·IRP 세액공제 환급 (연). 종목 월 매수액도 해당 계좌 납입으로 봅니다.
export function credit(s: S) {
  const pen = Math.min(accPmt(s, 3) * 12, TAX.creditPension)
  const base = Math.min(pen + accPmt(s, 2) * 12, TAX.creditTotal)
  const rate = s.salary <= TAX.salaryLine ? TAX.creditLow : TAX.creditHigh
  return { refund: base * rate, base, room: TAX.creditTotal - base, rate }
}

const kindOf = (i: number) => (i === 1 ? 1 : i === 2 || i === 3 ? 2 : 0) // 0 과세, 1 ISA, 2 연금

// 인출기 월 소득(오늘 가치, 세후): 연금 + 팔지 않는 부동산의 임대수익
function incomeAt(s: S, age: number) {
  let t = 0
  s.incomes.forEach(i => { if (age >= i.startAge - 1e-9) t += i.monthly })
  s.properties.forEach(p => { if (!p.sell) t += p.rent })
  return t
}

// 인출기 계획: 오늘 가치 기준 필요 자산을 끝(남길 원금)에서 거꾸로 계산합니다
function plan(s: S, dRet: number) {
  const T = Math.max(1, s.endAge - s.retireAge), nm = T * 12
  const rw = (1 + (wRetOf(s) + dRet) / 100) / (1 + s.inflation / 100) - 1
  const rm = Math.pow(Math.max(0.01, 1 + rw), 1 / 12) - 1
  const out = (m: number) => Math.max(0, s.monthly - incomeAt(s, s.retireAge + (m - 1) / 12))
  let need = s.keep
  for (let m = nm; m >= 1; m--) need = (need + out(m)) / (1 + rm)
  const starts = s.incomes.filter(i => i.monthly > 0).map(i => i.startAge)
  const first = starts.length ? Math.min(...starts) : null
  let bridge = 0 // 연금이 시작되기 전 공백 기간에 필요한 자산
  if (first !== null && first > s.retireAge) {
    const bm = Math.min(nm, Math.round((first - s.retireAge) * 12))
    for (let m = 1; m <= bm; m++) bridge += out(m) / Math.pow(1 + rm, m)
  }
  return { need, rm, nm, out, bridge, first }
}

// 은퇴 시점 자산(오늘 가치)에서 매달 생활비를 빼며 끝까지 가는지 확인
export function withdrawPath(s: S, startReal: number, dRet = 0, crash = 0) {
  const { rm, nm, out } = plan(s, dRet)
  let bal = Math.max(0, startReal) * (1 - crash), dep: number | null = null
  const path = [{ age: s.retireAge, v: bal }]
  for (let m = 1; m <= nm; m++) {
    bal = bal * (1 + rm) - out(m)
    if (bal < -1 && dep === null) dep = s.retireAge + m / 12
    if (bal < 0) bal = 0
    if (m % 12 === 0) path.push({ age: s.retireAge + m / 12, v: bal })
  }
  return { path, dep, end: bal, ok: dep === null && bal >= s.keep - 1 }
}

export function simulate(s: S, sc: Sc = { dRet: 0, crash: 0 }) {
  const years = Math.max(0, s.retireAge - s.age), months = years * 12
  const infl = s.inflation / 100
  const items = [
    ...s.accs.map((a, i) => ({ kind: kindOf(i), bal: a.bal, pr: a.principal, pmt: a.pmt, ret: a.ret })),
    ...s.holdings.map(h => ({ kind: kindOf(h.acc), bal: hv(h), pr: hp(h), pmt: h.pmt, ret: h.ret })),
    ...s.cash.map(c => ({ kind: 0, bal: c.bal, pr: c.bal, pmt: c.pmt, ret: c.rate })),
  ]
  // 과세 항목은 수익에 15.4%를 매년 반영 (단순화)
  const rm = items.map(x => Math.pow(Math.max(0.01, 1 + ((x.ret + sc.dRet) / 100) * (x.kind === 0 ? 1 - TAX.deposit : 1)), 1 / 12) - 1)
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
    items.forEach((x, i) => { b[i] = (b[i] + x.pmt) * (1 + rm[i]); pr[i] += x.pmt })
    s.loans.forEach((l, i) => { d[i] = Math.max(0, d[i] * (1 + l.rate / 1200) - l.pay) })
    if (m % 12 === 0) {
      if (s.reinvest) b[3] += cr.refund // 세액공제 환급금을 연금저축에 재투자
      series.push({ age: s.age + m / 12, v: (net() - debt()) / Math.pow(1 + infl, m / 12) })
    }
  }

  const f = Math.pow(1 + infl, years)
  const debtLeft = debt()
  const finReal = (net() - debtLeft) / f
  // 부동산은 은퇴 시점에 "팔기"로 표시한 것만 (비용·세금 차감 후) 금융자산에 더합니다. 실질 가격 변동 0% 가정.
  const saleReal = s.properties.filter(p => p.sell).reduce((t, p) => t + p.value * (1 - s.saleCost / 100), 0)
  const assetReal = finReal + saleReal
  const p = plan(s, sc.dRet)
  const wd = withdrawPath(s, assetReal, sc.dRet, sc.crash)
  return { years, series, finReal, saleReal, assetReal, assetNom: assetReal * f, need: p.need, gap: p.need - assetReal, bridge: p.bridge, first: p.first, debtLeft, credit: cr, wd }
}

// ---- 가상 조정 ----
export function boost(s: S, kind: 'acc' | 'hold', id: number, step: number): S {
  return kind === 'acc'
    ? { ...s, accs: s.accs.map((a, i) => (i === id ? { ...a, pmt: a.pmt + step } : a)) }
    : { ...s, holdings: s.holdings.map(h => (h.id === id ? { ...h, pmt: h.pmt + step } : h)) }
}

// 종목 A의 평가금액 일부를 종목 B로 옮긴 가상의 입력 (매도 세금은 반영하지 않음)
export function moveValue(s: S, fromId: number, toId: number, amt: number): S {
  const A = s.holdings.find(h => h.id === fromId), B = s.holdings.find(h => h.id === toId)
  if (!A || !B || A.id === B.id || amt <= 0 || hv(A) <= 0 || B.price <= 0) return s
  const mv = Math.min(amt, hv(A))
  return {
    ...s,
    holdings: s.holdings.map(h => {
      if (h.id === A.id) return { ...h, qty: h.qty * (1 - mv / hv(h)) }
      if (h.id === B.id) { const q = h.qty + mv / h.price; return { ...h, qty: q, avg: (hp(h) + mv) / q } }
      return h
    }),
  }
}

// 부족할 때: 납입 늘리기 / 인출 시작 늦추기 / 월 목표 줄이기 각각의 "딱 맞는" 값
export function solve(s: S) {
  const ok = (x: S) => simulate(x).gap <= 1
  const withX = (x: number): S => ({ ...s, accs: s.accs.map((a, i) => (i === 1 ? { ...a, pmt: a.pmt + x } : a)) })
  let A: number | null = null
  if (s.retireAge > s.age && ok(withX(50_000_000))) {
    let lo = 0, hi = 50_000_000
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (ok(withX(mid))) hi = mid; else lo = mid }
    A = Math.ceil(hi / 1000) * 1000
  }
  let B: number | null = null
  for (let k = 1; s.retireAge + k < s.endAge; k++) if (ok({ ...s, retireAge: s.retireAge + k })) { B = k; break }
  let C: number | null = null
  if (ok({ ...s, monthly: 0 })) {
    let lo = 0, hi = s.monthly
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (ok({ ...s, monthly: mid })) lo = mid; else hi = mid }
    C = Math.floor(lo / 1000) * 1000
  }
  return {
    A, B, C,
    sA: A !== null ? withX(A) : null,
    sB: B !== null ? { ...s, retireAge: s.retireAge + B } : null,
    sC: C !== null ? { ...s, monthly: C } : null,
  }
}

// ---- 입력 점검 ----
export function check(s: S) {
  const errors: string[] = [], warns: string[] = []
  if (s.age > s.retireAge) errors.push('인출 시작 나이는 현재 나이보다 크거나 같아야 합니다.')
  if (s.endAge <= s.retireAge) errors.push('인출 종료 나이는 인출 시작 나이보다 커야 합니다.')
  if (s.stockPct + s.bondPct + s.cashPct <= 0) errors.push('자산 배분 비중의 합이 0입니다. 하나 이상 입력해 주세요.')
  const pensionBal = s.accs[2].bal + s.accs[3].bal + s.holdings.filter(h => h.acc === 2 || h.acc === 3).reduce((t, h) => t + hv(h), 0)
  if (s.retireAge < 55 && pensionBal > 0) warns.push('IRP·연금저축은 55세 이전에 인출하면 기타소득세(16.5%)가 붙습니다. 인출 시작 나이를 확인하세요.')
  if (accPmt(s, 1) * 12 > TAX.isaLimit) warns.push(`ISA 연 납입이 한도(${fmt(TAX.isaLimit)})를 넘습니다.`)
  if ((accPmt(s, 2) + accPmt(s, 3)) * 12 > TAX.pensionLimit) warns.push(`IRP·연금저축 연 납입이 합산 한도(${fmt(TAX.pensionLimit)})를 넘습니다.`)
  if (s.incomes.some(i => i.monthly > 0 && i.startAge >= s.endAge)) warns.push('연금 수령 시작 나이가 인출 종료 나이 이후라 계산에 반영되지 않습니다.')
  s.holdings.forEach(h => { if (h.qty > 0 && h.price <= 0) warns.push(`${h.name}: 현재가가 0원입니다.`) })
  return { errors, warns }
}
