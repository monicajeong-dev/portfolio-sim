import { describe, expect, it } from 'vitest'
import { DEFAULT, credit, moveValue, sanitize, simulate, solve, withdrawPath, check, type S } from './engine'

const base = (p: Partial<S> = {}): S => ({ ...JSON.parse(JSON.stringify(DEFAULT)), ...p })

describe('필요 자산과 인출 경로', () => {
  it('필요 자산만큼 있으면 끝에 남길 원금이 정확히 남는다', () => {
    const s = base({ monthly: 3_000_000, keep: 100_000_000 })
    const w = withdrawPath(s, simulate(s).need)
    expect(w.dep).toBeNull()
    expect(Math.abs(w.end - s.keep)).toBeLessThan(10)
    expect(w.ok).toBe(true)
  })
  it('필요 자산보다 모자라면 부족으로 판정한다', () => {
    const s = base({ monthly: 3_000_000, keep: 100_000_000 })
    expect(withdrawPath(s, simulate(s).need * 0.9).ok).toBe(false)
  })
  it('국민연금이 있으면 필요 자산이 줄고, 시작 전 공백 자산이 계산된다', () => {
    const a = base({ monthly: 3_000_000 })
    const b = base({ monthly: 3_000_000, incomes: [{ id: 1, name: '국민연금', startAge: 65, monthly: 1_000_000 }] })
    expect(simulate(b).need).toBeLessThan(simulate(a).need)
    expect(simulate(b).bridge).toBeGreaterThan(0)
  })
  it('수익률이 낮아지면 필요 자산이 늘어난다', () => {
    const s = base({ monthly: 3_000_000 })
    expect(simulate(s, { dRet: -1.5, crash: 0 }).need).toBeGreaterThan(simulate(s).need)
  })
  it('은퇴 시점에 판다고 한 부동산은 비용을 뺀 금액만 더해진다', () => {
    const s = base({ saleCost: 5, properties: [{ id: 1, name: '집', value: 1_000_000_000, note: '', rent: 0, sell: true }] })
    expect(simulate(s).saleReal).toBe(950_000_000)
  })
})

describe('세금과 공제', () => {
  it('연봉 5천만원, 연금저축 월 50만원 + IRP 월 25만원 → 환급 148.5만원', () => {
    const s = base({ salary: 50_000_000 }); s.accs[3].pmt = 500_000; s.accs[2].pmt = 250_000
    expect(Math.round(credit(s).refund)).toBe(1_485_000)
  })
  it('연봉 6천만원이면 공제율이 13.2%다', () => {
    const s = base({ salary: 60_000_000 }); s.accs[2].pmt = 750_000
    expect(Math.round(credit(s).refund)).toBe(1_188_000)
  })
  it('연금저축 한도 600만원을 넘는 납입은 공제 대상에서 제외된다', () => {
    const s = base({ salary: 50_000_000 }); s.accs[3].pmt = 1_000_000
    expect(credit(s).base).toBe(6_000_000)
  })
  it('ISA 순이익이 비과세 한도 이하면 세금이 없다', () => {
    const s = base({ retireAge: 40 }); s.accs[1].bal = 6_000_000; s.accs[1].principal = 4_000_000
    expect(Math.round(simulate(s).assetReal)).toBe(6_000_000)
  })
  it('ISA 초과 수익에는 9.9%가 붙는다', () => {
    const s = base({ retireAge: 40 }); s.accs[1].bal = 5_000_000; s.accs[1].principal = 1_000_000
    expect(Math.round(simulate(s).assetReal)).toBe(4_802_000)
  })
  it('연금계좌 자산은 수령 시 5.5%가 차감된다', () => {
    const s = base({ retireAge: 40 }); s.accs[2].bal = 10_000_000
    expect(Math.round(simulate(s).assetReal)).toBe(9_450_000)
  })
})

describe('입력 안전장치', () => {
  it('이상한 데이터가 들어와도 구조가 유지된다', () => {
    const s = sanitize({ accs: [1, 'x'], age: 'abc', loans: [null, { bal: -5 }], monthly: -10, holdings: 7 })
    expect(s.accs).toHaveLength(5)
    expect(s.monthly).toBe(0)
    expect(s.loans).toHaveLength(1)
    expect(s.loans[0].bal).toBe(0)
    expect(sanitize(null).age).toBe(40)
    expect(() => simulate(s)).not.toThrow()
  })
  it('나이 순서가 잘못되면 오류를 알려준다', () => {
    expect(check(base({ age: 60, retireAge: 55 })).errors.length).toBeGreaterThan(0)
    expect(check(base({ retireAge: 55, endAge: 50 })).errors.length).toBeGreaterThan(0)
  })
  it('납입 한도를 넘으면 경고한다', () => {
    const s = base(); s.accs[1].pmt = 2_000_000
    expect(check(s).warns.length).toBeGreaterThan(0)
  })
})

describe('해결 시나리오와 조정', () => {
  it('찾은 해결책을 적용하면 실제로 목표를 채운다', () => {
    const s = base({ monthly: 3_000_000, keep: 50_000_000 }); s.accs[1].pmt = 300_000; s.accs[3].bal = 20_000_000
    const q = solve(s)
    for (const x of [q.sA, q.sB, q.sC]) if (x) expect(simulate(x).gap).toBeLessThan(2)
  })
  it('종목 비중을 옮겨도 총 평가금액은 그대로다', () => {
    const s = base(); s.holdings = [
      { id: 1, name: 'A', acc: 4, qty: 10, avg: 100, price: 120, ret: 6, pmt: 0 },
      { id: 2, name: 'B', acc: 4, qty: 5, avg: 200, price: 210, ret: 4, pmt: 0 },
    ]
    const m = moveValue(s, 1, 2, 600)
    const tot = (x: S) => x.holdings.reduce((t, h) => t + h.qty * h.price, 0)
    expect(Math.round(tot(m))).toBe(Math.round(tot(s)))
  })
})
