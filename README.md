# 은퇴 현금흐름 시뮬레이터

React + TypeScript + Vite로 만든 브라우저 기반 시뮬레이터입니다.

## 로컬 실행
1. Node.js LTS를 설치합니다: https://nodejs.org/
2. 이 폴더에서 터미널을 열고 `npm install`을 실행합니다.
3. `npm run dev`를 실행하고 터미널에 표시되는 주소(보통 http://localhost:5173)를 엽니다.
4. 배포 전 확인: `npm run build`

## Vercel에 공개 배포하기 (초보자용)

### 방법 A: GitHub를 통해 배포 (추천)
1. https://github.com 에 로그인하거나 계정을 만듭니다.
2. `portfolio-sim` 폴더의 파일을 새 GitHub 저장소에 올립니다. `node_modules` 폴더는 올리지 않습니다.
3. https://vercel.com 에 접속해 **Continue with GitHub**로 로그인합니다.
4. Vercel 대시보드에서 **Add New… → Project**를 선택합니다.
5. 방금 만든 GitHub 저장소 옆의 **Import**를 누릅니다.
6. 설정을 확인합니다.
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
7. **Deploy**를 누릅니다. 빌드가 끝나면 `https://프로젝트이름.vercel.app` 형태의 공개 주소가 나옵니다.
8. 그 주소를 휴대폰이나 다른 컴퓨터에서 열어 확인합니다. 이후 GitHub에 변경사항을 올리면 Vercel이 자동으로 다시 배포합니다.

### GitHub에 파일 올리는 쉬운 방법
1. GitHub에서 **New repository**를 누르고 이름을 `portfolio-sim`으로 만듭니다.
2. 저장소 페이지에서 **uploading an existing file**을 누릅니다.
3. 압축을 푼 `portfolio-sim` 폴더 안의 파일과 폴더를 드래그해 올립니다. `.gitignore`, `package.json`, `package-lock.json`, `index.html`, `src`, `public`, 설정 파일이 포함되어야 합니다.
4. `node_modules`와 `dist`는 업로드하지 않습니다.
5. **Commit changes**를 누른 뒤 Vercel에서 위 순서대로 Import합니다.

## 기본값 및 계산 참고
- 계좌 잔액, 원금, 납입금, 목표 인출액, 잔존 목표, 급여 등 금액 기본값은 0원입니다.
- 수익률은 예시용 장기 가정치로 설정되어 있습니다. 실제 평균 수익률이나 미래 수익을 보장하지 않습니다.
- 확률 계산은 무작위 경로를 이용한 단순화된 몬테카를로 모델입니다. 시장 수익률을 정규분포에 가깝게 근사하고 세금·수수료·자산 간 상관관계·수익률의 장기 변화를 완전히 반영하지 않습니다.
- 브라우저 `localStorage`에 입력값을 저장합니다. 같은 브라우저에서는 새로 열어도 입력값이 남을 수 있습니다. 다른 기기와 자동 동기화되지는 않습니다.
- 세금은 교육용으로 단순화했으므로 실제 세금·연금 규정과 다를 수 있습니다. 투자 판단 전 별도 검증이 필요합니다.
