import { useEffect, useMemo, useState } from 'react'
import { DEFAULT, TAX, boost, check, fmt, hp, hv, moveValue, sanitize, simulate, solve, wRetOf, won, type S } from './engine'
import { Card, Donut, LifeChart, Money, Num, Rng } from './ui'

type ListKey = 'loans' | 'holdings' | 'cash' | 'properties' | 'incomes'
const KEY = 'sim-v4'
const CONS = { dRet: -1.5, crash: 0 }      // 보수: 모든 수익률 -1.5%p
const CRISIS = { dRet: -1.5, crash: 0.25 } // 위기: 보수 + 은퇴 직후 자산 -25%

function load(): S {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem('sim-v3') // 이전 버전 데이터도 안전하게 불러옴
    return raw ? sanitize(JSON.parse(raw)) : DEFAULT
  } catch { return DEFAULT }
}

export default function App() {
  const [s, setS] = useState<S>(load)
  const [view, setView] = useState<'acc' | 'item'>('acc')
  const [step, setStep] = useState(100_000)
  const [mv, setMv] = useState({ from: 0, to: 0, amt: 0 })
  const [note, setNote] = useState('')
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* 저장 실패는 무시 */ } }, [s])

  const set = <K extends keyof S>(k: K, v: S[K]) => setS(o => ({ ...o, [k]: v }))
  const setAcc = (i: number, k: 'bal' | 'principal' | 'pmt' | 'ret', v: number) =>
    setS(o => ({ ...o, accs: o.accs.map((a, j) => (j === i ? { ...a, [k]: v } : a)) }))
  const upd = (k: ListKey, id: number, p: Record<string, string | number | boolean>) =>
    setS(o => ({ ...o, [k]: (o[k] as { id: number }[]).map(x => (x.id === id ? { ...x, ...p } : x)) }) as S)
  const add = (k: ListKey, item: object) =>
    setS(o => ({ ...o, [k]: [...(o[k] as object[]), { id: Math.floor(Date.now() + Math.random() * 1000), ...item }] }) as S)
  const del = (k: ListKey, id: number) =>
    setS(o => ({ ...o, [k]: (o[k] as { id: number }[]).filter(x => x.id !== id) }) as S)

  // ---- 계산 (입력이 바뀔 때만 다시 계산) ----
  const r = useMemo(() => simulate(s), [s])
  const cons = useMemo(() => simulate(s, CONS), [s])
  const crisis = useMemo(() => simulate(s, CRISIS), [s])
  const msgs = useMemo(() => check(s), [s])
  const sol = useMemo(() => {
    if (r.gap <= 1) return null
    const q = solve(s)
    const rows = [
      { label: '납입 늘리기', desc: q.A !== null ? `ISA에 월 ${won(q.A)} 더 넣기` : '월 5,000만원을 더 넣어도 어렵습니다', scn: q.sA },
      { label: '인출 시작 늦추기', desc: q.B !== null ? `${s.retireAge + q.B}세부터 인출 (+${q.B}년)` : `${s.endAge}세 전에는 달성이 어렵습니다`, scn: q.sB },
      { label: '월 목표 줄이기', desc: q.C !== null ? `월 ${won(q.C)}로 (−${won(s.monthly - q.C)})` : '월 0원으로 줄여도 어렵습니다', scn: q.sC },
    ]
    return rows.map(x => ({ ...x, robust: x.scn ? simulate(x.scn, CRISIS).wd.ok : null }))
  }, [s, r.gap])
  const rank = useMemo(() => [
    ...s.accs.map((a, i) => ({ label: `${a.name} 월 납입`, sc: boost(s, 'acc', i, step) })),
    ...s.holdings.map(h => ({ label: `${h.name || '종목'} 월 매수`, sc: boost(s, 'hold', h.id, step) })),
  ].map(x => {
    const d = simulate(x.sc).assetReal - r.assetReal
    return { label: x.label, d, p: r.need > 0 ? (d / r.need) * 100 : 0 }
  }).sort((a, b) => b.d - a.d), [s, step, r.assetReal, r.need])
  const fromId = mv.from || s.holdings[0]?.id || 0
  const toId = mv.to || s.holdings[1]?.id || 0
  const sMove = useMemo(() => moveValue(s, fromId, toId, mv.amt), [s, fromId, toId, mv.amt])
  const rMove = useMemo(() => simulate(sMove), [sMove])
  const maxD = Math.max(1, ...rank.map(x => x.d))

  // ---- 합계 ----
  const stockVal = s.holdings.reduce((t, h) => t + hv(h), 0)
  const stockPrin = s.holdings.reduce((t, h) => t + hp(h), 0)
  const cashTotal = s.cash.reduce((t, c) => t + c.bal, 0)
  const investBal = s.accs.reduce((t, a) => t + a.bal, 0) + stockVal
  const investPrin = s.accs.reduce((t, a) => t + a.principal, 0) + stockPrin
  const totalBal = investBal + cashTotal
  const propTotal = s.properties.reduce((t, p) => t + p.value, 0)
  const totalDebt = s.loans.reduce((t, l) => t + l.bal, 0)
  const totalPay = s.loans.reduce((t, l) => t + l.pay, 0)
  const totalPmt = s.accs.reduce((t, a) => t + a.pmt, 0) + s.holdings.reduce((t, h) => t + h.pmt, 0) + s.cash.reduce((t, c) => t + c.pmt, 0)
  const accStock = (i: number) => s.holdings.filter(h => h.acc === i).reduce((t, h) => t + hv(h), 0)
  const pct = r.need > 0 ? (r.assetReal / r.need) * 100 : 0
  const ok = r.gap <= 1
  const isEmpty = totalBal === 0 && propTotal === 0 && s.monthly === 0
  const wRet = wRetOf(s)
  const wReal = ((1 + wRet / 100) / (1 + s.inflation / 100) - 1) * 100

  const byAcc = [...s.accs.map((a, i) => ({ label: a.name, value: a.bal + accStock(i) })), { label: '예·적금', value: cashTotal }, ...s.properties.map(p => ({ label: p.name || '부동산', value: p.value }))]
  const byItem = [
    ...s.holdings.map(h => ({ label: h.name || '종목', value: hv(h) })),
    { label: '종목 외 계좌 잔액', value: s.accs.reduce((t, a) => t + a.bal, 0) },
    { label: '예·적금', value: cashTotal },
    ...s.properties.map(p => ({ label: p.name || '부동산', value: p.value })),
  ]

  // ---- 백업 ----
  const exportJSON = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = 'cashflow-planner-backup.json'; a.click(); URL.revokeObjectURL(url)
  }
  const importJSON = async (file?: File) => {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.accs)) throw new Error('형식 오류')
      setS(sanitize(parsed)); setNote('백업을 불러왔습니다. 형식이 맞지 않는 값은 안전한 값으로 바꿔 불러옵니다.')
    } catch { setNote('파일을 읽지 못했습니다. 이 앱에서 내보낸 JSON 백업 파일인지 확인해 주세요.') }
  }

  const scnRows = [['기본', r], ['보수 (수익률 −1.5%p)', cons], ['위기 (보수 + 은퇴 직후 −25%)', crisis]] as const

  return (
    <div className="page">
      <header className="top">
        <div className="top-row">
          <h1>캐시플로우 플래너</h1>
          <button className="btn-del" onClick={() => { if (window.confirm('입력한 값을 모두 지우고 처음 상태로 되돌릴까요?')) setS(DEFAULT) }}>처음 값으로 초기화</button>
        </div>
        <p>{s.retireAge}세부터 {s.endAge}세까지, 통장에 매달 세후 {won(s.monthly)}이 찍히려면</p>
        <p className="privacy">입력한 값은 이 브라우저에만 저장되고 서버로 전송되지 않습니다.</p>
      </header>

      {(msgs.errors.length > 0 || msgs.warns.length > 0) && (
        <div className="banners" role="alert">
          {msgs.errors.map((m, i) => <p key={'e' + i} className="banner err">{m}</p>)}
          {msgs.warns.map((m, i) => <p key={'w' + i} className="banner warnb">{m}</p>)}
        </div>
      )}

      {isEmpty && (
        <section className="card guide">
          <h2>이렇게 시작해 보세요</h2>
          <ol>
            <li><b>나와 목표</b>에 현재 나이와 받고 싶은 월 금액을 입력합니다.</li>
            <li><b>내 계좌·종목·예적금·부동산·부채</b>를 아는 만큼 입력합니다. 0원이어도 괜찮습니다.</li>
            <li>오른쪽(모바일은 위쪽) <b>달성률</b>과 <b>위기 상황 점검</b>을 확인하고, 아래 시나리오로 보완해 보세요.</li>
          </ol>
        </section>
      )}

      <div className="layout">
        <main className="inputs">
          <Card title="나와 목표">
            <div className="grid3">
              <Num label="현재 나이" value={s.age} unit="세" onChange={v => set('age', Math.round(v))} />
              <Num label="인출 시작 나이" value={s.retireAge} unit="세" onChange={v => set('retireAge', Math.round(v))} />
              <Num label="인출 종료 나이" value={s.endAge} unit="세" onChange={v => set('endAge', Math.round(v))} />
            </div>
            <div className="grid2" style={{ marginTop: 14 }}>
              <Money label="월 목표 (세후, 오늘 가치)" value={s.monthly} onChange={v => set('monthly', v)} />
              <Money label="끝까지 남길 원금 (오늘 가치)" value={s.keep} onChange={v => set('keep', v)} />
            </div>
          </Card>

          <Card title="물가와 인출기 자산 배분">
            <Rng label="물가상승률" value={s.inflation} min={0} max={6} step={0.5} unit="%" onChange={v => set('inflation', v)} />
            <p className="hint">인출 시작 이후 자산을 어떻게 굴릴지 정합니다. 인출기 수익률은 이 배분과 자산군별 기대수익률에서 계산되어, 필요 자산 계산에 그대로 쓰입니다.</p>
            <div className="grid3" style={{ marginTop: 12 }}>
              <Rng label="주식" value={s.stockPct} min={0} max={100} step={5} unit="%" onChange={v => set('stockPct', v)} />
              <Rng label="채권" value={s.bondPct} min={0} max={100} step={5} unit="%" onChange={v => set('bondPct', v)} />
              <Rng label="현금" value={s.cashPct} min={0} max={100} step={5} unit="%" onChange={v => set('cashPct', v)} />
            </div>
            <div className="grid3" style={{ marginTop: 12 }}>
              <Num label="주식 기대수익률" value={s.rStock} unit="%" step={0.5} onChange={v => set('rStock', v)} />
              <Num label="채권 기대수익률" value={s.rBond} unit="%" step={0.5} onChange={v => set('rBond', v)} />
              <Num label="현금 기대수익률" value={s.rCash} unit="%" step={0.5} onChange={v => set('rCash', v)} />
            </div>
            <p className="sum-line">비중 합계 {s.stockPct + s.bondPct + s.cashPct}% (100%가 아니어도 비율로 환산) · 인출기 수익률 <b>{wRet.toFixed(2)}%</b> (물가 반영 실질 <b>{wReal.toFixed(2)}%</b>)</p>
          </Card>

          <Card title="연금·기타 소득 (인출기)" open={s.incomes.length > 0}>
            <p className="hint">국민연금·퇴직연금·개인연금처럼 은퇴 후 들어오는 월 소득을 <b>세후, 오늘 가치</b>로 입력하세요. 물가에 따라 오른다고 가정합니다. 시작 나이 전까지의 공백은 자산으로 메웁니다.</p>
            {s.incomes.map(i => (
              <div className="loan" key={i.id}>
                <div className="loan-head">
                  <input className="name-input" value={i.name} aria-label="소득 이름" onChange={e => upd('incomes', i.id, { name: e.target.value })} />
                  <button className="btn-del" onClick={() => del('incomes', i.id)}>삭제</button>
                </div>
                <div className="grid2">
                  <Num label="수령 시작 나이" value={i.startAge} unit="세" onChange={v => upd('incomes', i.id, { startAge: Math.round(v) })} />
                  <Money label="월 수령액" value={i.monthly} onChange={v => upd('incomes', i.id, { monthly: v })} />
                </div>
              </div>
            ))}
            <button className="btn" onClick={() => add('incomes', { name: '국민연금', startAge: 65, monthly: 0 })}>+ 연금·소득 추가</button>
          </Card>

          <Card title="내 계좌">
            {s.accs.map((a, i) => (
              <div className="acc" key={a.name}>
                <div className="acc-head"><strong>{a.name}</strong><span>{a.note}</span>{accStock(i) > 0 && <span className="stock">보유 종목 {won(accStock(i))} 별도</span>}</div>
                <div className="grid2">
                  <Money label="평가금액 (종목 제외)" value={a.bal} onChange={v => setAcc(i, 'bal', v)} />
                  <Money label="투자원금 (종목 제외)" value={a.principal} onChange={v => setAcc(i, 'principal', v)} />
                  <Money label="월 납입" value={a.pmt} onChange={v => setAcc(i, 'pmt', v)} />
                  <Num label="적립기 기대수익률" value={a.ret} unit="%" step={0.5} onChange={v => setAcc(i, 'ret', v)} />
                </div>
              </div>
            ))}
          </Card>

          <Card title="세액공제 환급" open={false}>
            <div className="grid2">
              <Money label="연 총급여" value={s.salary} onChange={v => set('salary', v)} />
              <label className="check">
                <input type="checkbox" checked={s.reinvest} onChange={e => set('reinvest', e.target.checked)} />
                환급금을 연금저축에 재투자
              </label>
            </div>
            <p className="sum-line">연 환급 예상 <b>{won(r.credit.refund)}</b> 공제율 <b>{(r.credit.rate * 100).toFixed(1)}%</b> 공제 대상 납입 <b>{won(r.credit.base)}</b></p>
            {r.credit.room > 0 && <p className="hint">공제 한도까지 연 {won(r.credit.room)} 여유가 있습니다. 한도는 연금저축 {fmt(TAX.creditPension)}, IRP 포함 {fmt(TAX.creditTotal)}입니다.</p>}
          </Card>

          <Card title="보유 종목" open={s.holdings.length > 0}>
            {s.holdings.length === 0 && <p className="empty">주식·ETF를 계좌별로 기록해 보세요. 원화 환산 가격으로 입력합니다.</p>}
            {s.holdings.map(h => {
              const diff = hv(h) - hp(h)
              return (
                <div className="loan" key={h.id}>
                  <div className="loan-head">
                    <input className="name-input" value={h.name} aria-label="종목명" onChange={e => upd('holdings', h.id, { name: e.target.value })} />
                    <select className="sel" value={h.acc} aria-label="보유 계좌" onChange={e => upd('holdings', h.id, { acc: Number(e.target.value) })}>
                      {s.accs.map((a, i) => <option key={a.name} value={i}>{a.name}</option>)}
                    </select>
                    <button className="btn-del" onClick={() => del('holdings', h.id)}>삭제</button>
                  </div>
                  <div className="grid3">
                    <Num label="수량" value={h.qty} unit="주" onChange={v => upd('holdings', h.id, { qty: Math.max(0, v) })} />
                    <Money label="평균 매입가" value={h.avg} onChange={v => upd('holdings', h.id, { avg: v })} />
                    <Money label="현재가" value={h.price} onChange={v => upd('holdings', h.id, { price: v })} />
                  </div>
                  <div className="grid2" style={{ marginTop: 10 }}>
                    <Num label="적립기 기대수익률" value={h.ret} unit="%" step={0.5} onChange={v => upd('holdings', h.id, { ret: v })} />
                    <Money label="월 매수액" value={h.pmt} onChange={v => upd('holdings', h.id, { pmt: v })} />
                  </div>
                  <p className="sum-line">
                    평가금액 <b>{won(hv(h))}</b> 평가손익{' '}
                    <b className={diff >= 0 ? 'up' : 'down'}>{diff >= 0 ? '+' : ''}{won(diff)}{hp(h) > 0 ? ` (${((diff / hp(h)) * 100).toFixed(1)}%)` : ''}</b>
                  </p>
                </div>
              )
            })}
            <button className="btn" onClick={() => add('holdings', { name: `종목 ${s.holdings.length + 1}`, acc: 4, qty: 0, avg: 0, price: 0, ret: 6, pmt: 0 })}>+ 종목 추가</button>
            <p className="hint">종목은 선택한 계좌의 잔액에 더해지고 자기 기대수익률로 계산됩니다. 해외 종목은 원화로 환산한 가격을 입력하세요.</p>
          </Card>

          <Card title="현금성 자산 (예금·적금)" open={s.cash.length > 0}>
            {s.cash.length === 0 && <p className="empty">예금, 적금, 파킹통장 같은 현금성 자산을 추가하세요.</p>}
            {s.cash.map(c => (
              <div className="loan" key={c.id}>
                <div className="loan-head">
                  <input className="name-input" value={c.name} aria-label="상품명" onChange={e => upd('cash', c.id, { name: e.target.value })} />
                  <button className="btn-del" onClick={() => del('cash', c.id)}>삭제</button>
                </div>
                <div className="grid3">
                  <Money label="현재 잔액" value={c.bal} onChange={v => upd('cash', c.id, { bal: v })} />
                  <Money label="월 납입 (적금)" value={c.pmt} onChange={v => upd('cash', c.id, { pmt: v })} />
                  <Num label="이자율 (연)" value={c.rate} unit="%" step={0.1} onChange={v => upd('cash', c.id, { rate: v })} />
                </div>
              </div>
            ))}
            <button className="btn" onClick={() => add('cash', { name: `예·적금 ${s.cash.length + 1}`, bal: 0, pmt: 0, rate: 3 })}>+ 예·적금 추가</button>
            <p className="hint">이자에는 15.4%를 과세한다고 가정하고, 만기가 되면 같은 조건으로 계속 굴린다고 봅니다.</p>
          </Card>

          <Card title="부동산" open={s.properties.length > 0}>
            <p className="hint">기본적으로 은퇴 생활비 계산에는 넣지 않습니다. <b>은퇴 시점에 판다</b>고 표시하면 비용·세금을 뺀 금액이 금융자산에 더해지고, 팔지 않는 부동산의 <b>월 임대수익</b>(세후, 오늘 가치)은 인출기 소득으로 반영됩니다. 가격은 물가와 같은 속도로 오른다고(실질 변동 0%) 가정합니다.</p>
            {s.properties.length > 0 && (
              <div style={{ maxWidth: 220, marginTop: 8 }}>
                <Num label="매도 시 비용·세금" value={s.saleCost} unit="%" step={0.5} onChange={v => set('saleCost', Math.max(0, v))} />
              </div>
            )}
            {s.properties.map(p => (
              <div className="loan" key={p.id}>
                <div className="loan-head">
                  <input className="name-input" value={p.name} aria-label="부동산 이름" onChange={e => upd('properties', p.id, { name: e.target.value })} />
                  <button className="btn-del" onClick={() => del('properties', p.id)}>삭제</button>
                </div>
                <div className="grid2">
                  <Money label="현재 시세" value={p.value} onChange={v => upd('properties', p.id, { value: v })} />
                  <Money label="월 임대수익 (세후)" value={p.rent} onChange={v => upd('properties', p.id, { rent: v })} />
                </div>
                <div className="grid2" style={{ marginTop: 6 }}>
                  <label className="field"><span>용도 / 메모</span><input className="plain" value={p.note} onChange={e => upd('properties', p.id, { note: e.target.value })} /></label>
                  <label className="check"><input type="checkbox" checked={p.sell} onChange={e => upd('properties', p.id, { sell: e.target.checked })} />은퇴 시점에 판다</label>
                </div>
              </div>
            ))}
            <button className="btn" onClick={() => add('properties', { name: `부동산 ${s.properties.length + 1}`, value: 0, note: '', rent: 0, sell: false })}>+ 부동산 추가</button>
          </Card>

          <Card title="부채" open={s.loans.length > 0}>
            {s.loans.length === 0 && <p className="empty">등록된 대출이 없습니다. 대출이 있다면 종류별로 추가하세요.</p>}
            {s.loans.map(l => (
              <div className="loan" key={l.id}>
                <div className="loan-head">
                  <input className="name-input" value={l.name} aria-label="대출 이름" onChange={e => upd('loans', l.id, { name: e.target.value })} />
                  <button className="btn-del" onClick={() => del('loans', l.id)}>삭제</button>
                </div>
                <div className="grid3">
                  <Money label="대출 잔액" value={l.bal} onChange={v => upd('loans', l.id, { bal: v })} />
                  <Num label="금리 (연)" value={l.rate} unit="%" step={0.1} onChange={v => upd('loans', l.id, { rate: v })} />
                  <Money label="월 상환액" value={l.pay} onChange={v => upd('loans', l.id, { pay: v })} />
                </div>
                {l.bal > 0 && l.pay < (l.bal * l.rate) / 1200 && <p className="warn">월 상환액이 월 이자(약 {won((l.bal * l.rate) / 1200)})보다 적어 잔액이 계속 늘어납니다.</p>}
              </div>
            ))}
            <button className="btn" onClick={() => add('loans', { name: `대출 ${s.loans.length + 1}`, bal: 0, rate: 4.5, pay: 0 })}>+ 대출 추가</button>
            <p className="hint">월 상환액은 위 납입액과 별개로 나가는 돈이며, 인출 시작 시점에 남은 대출은 자산에서 차감합니다.</p>
          </Card>

          <Card title="백업 및 복원" open={false}>
            <div className="tool-row">
              <button className="btn" onClick={exportJSON}>JSON 백업 다운로드</button>
              <label className="btn file-btn">JSON 백업 불러오기<input type="file" accept="application/json,.json" onChange={e => { importJSON(e.target.files?.[0]); e.target.value = '' }} /></label>
            </div>
            {note && <p className="warn">{note}</p>}
            <p className="hint">다른 기기에서 이 파일을 불러오면 입력값을 복원할 수 있습니다. 금융 정보가 들어 있으니 안전하게 보관하세요.</p>
          </Card>
        </main>

        <aside className="result">
          <section className={`hero ${ok ? 'good' : 'short'}`}>
            <p className="hero-sub">{s.retireAge}세 시점 달성률</p>
            <p className="hero-num">{pct.toFixed(0)}%</p>
            <div className="bar"><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
            <p className="hero-msg">{isEmpty ? '입력하면 여기에 결과가 나옵니다.' : ok ? `목표를 ${fmt(-r.gap)} 넘게 모을 수 있어요.` : `오늘 가치로 ${fmt(r.gap)}이 부족해요.`}</p>
            {!isEmpty && <p className="hero-sub" style={{ marginTop: 6 }}>{r.wd.dep !== null ? `기본 가정에서 ${r.wd.dep.toFixed(1)}세에 자산이 바닥납니다.` : `기본 가정에서 ${s.endAge}세까지 유지됩니다.`}</p>}
          </section>

          <Card title="위기 상황 점검">
            <table className="scn">
              <thead><tr><th>시나리오</th><th>{s.retireAge}세 자산</th><th>결과</th></tr></thead>
              <tbody>
                {scnRows.map(([label, x]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>{fmt(x.assetReal)}</td>
                    <td className={x.wd.ok ? 'okc' : 'badc'}>{x.wd.dep !== null ? `${x.wd.dep.toFixed(1)}세 고갈` : x.wd.ok ? `${s.endAge}세에 ${fmt(x.wd.end)}` : `남길 원금 ${fmt(s.keep - x.wd.end)} 부족`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">확률이 아니라 가정을 나쁘게 바꿔 본 점검입니다. 모든 금액은 오늘 가치이고, 수익률을 낮추거나 은퇴 직후 시장이 급락해도 버티는지를 봅니다.</p>
          </Card>

          <Card title={`${s.age}세 ~ ${s.endAge}세 자산 경로`}>
            <LifeChart acc={r.series} wd={r.wd.path} alt={crisis.wd.path} need={r.need} />
            <div className="legend-text"><span><i className="sw base" /> 기본</span><span><i className="sw alt" /> 위기 시나리오</span></div>
            <dl className="stats">
              <div><dt>필요 자산 (오늘 가치)</dt><dd>{fmt(r.need)}</dd></div>
              <div><dt>예상 자산 (오늘 가치)</dt><dd>{fmt(r.assetReal)}</dd></div>
              {r.saleReal > 0 && <div><dt>└ 부동산 매도 반영</dt><dd>{fmt(r.saleReal)}</dd></div>}
              <div><dt>예상 자산 (미래 금액)</dt><dd>{fmt(r.assetNom)}</dd></div>
              {r.first !== null && r.first > s.retireAge && <div><dt>연금 시작 전({s.retireAge}~{r.first}세) 필요 자산</dt><dd>{fmt(r.bridge)}</dd></div>}
              <div><dt>인출 시점 남은 대출</dt><dd>{fmt(r.debtLeft)}</dd></div>
            </dl>
            <small className="hint">인출 시작 시점의 점프는 부동산 매도 반영과 인출기 가정 때문입니다. 대출은 차감되어 있습니다.</small>
          </Card>

          <Card title="자산 비중" open={false}>
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={view === 'acc'} className={view === 'acc' ? 'on' : ''} onClick={() => setView('acc')}>계좌별</button>
              <button role="tab" aria-selected={view === 'item'} className={view === 'item' ? 'on' : ''} onClick={() => setView('item')}>종목별</button>
            </div>
            <Donut data={view === 'acc' ? byAcc : byItem} />
          </Card>

          <Card title="현재 현황" open={false}>
            <dl className="stats">
              <div><dt>금융자산 (투자 + 현금성)</dt><dd>{won(totalBal)}</dd></div>
              <div><dt>부동산 (현재 시세)</dt><dd>{won(propTotal)}</dd></div>
              <div><dt>총자산</dt><dd>{won(totalBal + propTotal)}</dd></div>
              <div><dt>총부채 ({s.loans.length}건)</dt><dd>{won(totalDebt)}</dd></div>
              <div><dt>순자산</dt><dd>{won(totalBal + propTotal - totalDebt)}</dd></div>
              <div><dt>투자자산 평가손익</dt><dd className={investBal - investPrin >= 0 ? 'up' : 'down'}>{investBal - investPrin >= 0 ? '+' : ''}{won(investBal - investPrin)}</dd></div>
              <div><dt>월 총 납입</dt><dd>{won(totalPmt)}</dd></div>
              <div><dt>월 총 상환</dt><dd>{won(totalPay)}</dd></div>
              <div><dt>연 세액공제 환급 예상</dt><dd>{won(r.credit.refund)}</dd></div>
            </dl>
          </Card>
        </aside>
      </div>

      <div className="analysis">
        <Card title="부족할 때 해결 시나리오">
          {!sol ? (
            <p className="empty">{isEmpty ? '입력하면 해결 시나리오가 계산됩니다.' : '지금 설정으로 이미 목표를 채웁니다. 목표를 높여 보거나 옆에서 조정 효과를 확인해 보세요.'}</p>
          ) : (
            <>
              <ul className="sol">
                {sol.map(x => (
                  <li key={x.label} className={x.scn ? '' : 'na'}>
                    <b>{x.label}</b>
                    <span>{x.desc}</span>
                    {x.robust !== null && <em className={x.robust ? 'okc' : 'badc'}>{x.robust ? '위기에도 유지' : '위기엔 부족'}</em>}
                  </li>
                ))}
              </ul>
              <p className="hint">각 값은 목표를 딱 맞추는 최소치입니다. 오른쪽 표시는 그 해결책을 적용했을 때 위 &quot;위기&quot; 가정에서도 {s.endAge}세까지 유지되는지입니다. 여유를 두려면 조금 더 넉넉하게 잡으세요.</p>
            </>
          )}
        </Card>

        <Card title="포트폴리오 조정 시뮬레이션">
          <Money label="늘려 볼 월 금액" value={step} onChange={setStep} />
          <p className="hint">월 {won(step)}을 한 곳에 더 넣을 때 {s.retireAge}세 예상 자산이 얼마나 늘어나는지 비교합니다 (오늘 가치). 납입 한도 초과는 위쪽 경고로 알려 드립니다.</p>
          <ul className="rank">
            {rank.map((x, i) => (
              <li key={i}>
                <span>{x.label}</span>
                <i style={{ width: `${Math.max(2, (x.d / maxD) * 100)}%` }} />
                <b>+{fmt(x.d)}</b>
                <em>{x.p.toFixed(1)}%p</em>
              </li>
            ))}
          </ul>

          <h3 className="sub">종목 사이 비중 옮기기</h3>
          {s.holdings.length < 2 ? (
            <p className="empty">보유 종목을 2개 이상 추가하면 비중을 옮겨 볼 수 있어요.</p>
          ) : (
            <>
              <div className="grid3">
                <label className="field"><span>줄일 종목</span>
                  <select className="sel" value={fromId} onChange={e => setMv({ ...mv, from: Number(e.target.value) })}>
                    {s.holdings.map(h => <option key={h.id} value={h.id}>{h.name || '종목'}</option>)}
                  </select>
                </label>
                <label className="field"><span>늘릴 종목</span>
                  <select className="sel" value={toId} onChange={e => setMv({ ...mv, to: Number(e.target.value) })}>
                    {s.holdings.map(h => <option key={h.id} value={h.id}>{h.name || '종목'}</option>)}
                  </select>
                </label>
                <Money label="옮길 금액" value={mv.amt} onChange={v => setMv({ ...mv, amt: v })} />
              </div>
              <dl className="stats">
                <div><dt>{s.retireAge}세 예상 자산 (오늘 가치)</dt><dd>{fmt(r.assetReal)} → {fmt(rMove.assetReal)}</dd></div>
                <div><dt>달성률</dt><dd>{pct.toFixed(0)}% → {(r.need > 0 ? (rMove.assetReal / r.need) * 100 : 0).toFixed(0)}%</dd></div>
              </dl>
              <p className="hint">종목을 팔 때의 세금은 반영하지 않았고, 서로 다른 계좌의 종목끼리는 현실에서 바로 옮길 수 없다는 점에 유의하세요.</p>
            </>
          )}
        </Card>
      </div>

      <div className="mini" aria-live="polite"><b>{pct.toFixed(0)}%</b><span>{isEmpty ? '입력해 보세요' : ok ? '목표 달성' : `${fmt(r.gap)} 부족`}</span></div>

      <footer>
        참고용 계산이며 투자 권유가 아닙니다. 세금은 단순화했습니다: CMA·일반 계좌 수익 15.4%, ISA 만기 비과세 {won(TAX.isaExempt)} 초과분 9.9%, IRP·연금저축 수령 5.5%. 인출 순서에 따른 세금 차이, 연금 수령액이 클 때의 종합과세, 종목별 세금 구분은 반영하지 않았습니다. 세법과 한도는 바뀔 수 있으니 실제 적용 전에 확인하세요.
      </footer>
    </div>
  )
}
