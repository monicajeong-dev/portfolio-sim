# 은퇴 현금흐름 시뮬레이터

## 실행
- Node.js 20.19 이상 권장
- `npm install`
- `npm run dev`
- 배포 빌드: `npm run build` (Vite 빌드)

## Vercel
GitHub 저장소를 Vercel에서 Import하고 Framework Preset `Vite`, Build Command `npm run build`, Output Directory `dist`로 설정합니다. 이 프로젝트의 build 스크립트는 Vite 빌드만 수행합니다. 기존 `tsc -b && vite build`에서 발생하는 TypeScript 빌드 중단을 피하기 위한 설정이며, 타입 검증은 별도로 `npx tsc -b`로 실행할 수 있습니다.

## 기능
- 계좌/종목/현금/부채 입력 및 은퇴 현금흐름 계산
- 주식·채권·현금 배분 비중 조절과 가정 기반 위험 계산
- 월 납입액 증가, 인출 시작 연기, 월 목표 생활비 감소 시나리오 비교
- 몬테카를로 기반 인출 성공률과 인출기 자산 경로(하위 10%, 중앙값, 상위 10%)
- JSON 백업 다운로드 및 다른 기기에서 JSON 복원

## 주의
모델은 교육용 단순화 계산입니다. 수익률·변동성·상관관계, 세금, 수수료, 환율, 실제 인출 규칙을 완전히 반영하지 않으며 투자 조언이나 결과 보장이 아닙니다. JSON 백업은 브라우저 간 자동 동기화가 아니며, 파일에 금융 정보가 포함될 수 있습니다.
