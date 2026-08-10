# ZERO TRIP

예산·시간·출발지·동행·취향을 입력하면 서울의 데모 장소를 조합해 실행 가능한 하루 코스 하나를 만드는 여행 플래너입니다.

## 실행

```bash
npm install
npm run dev
```

프로덕션 빌드와 추천 엔진 테스트:

```bash
npm run build
npm test
```

## 구현된 기능

- 0원~50,000원 1인 예산, 날짜, 시작 시각, 이용 시간, 최대 도보거리 설정
- 혼자·연인·아이·부모님·반려견 동행별 추천 점수
- 무료·전시·공연·공원·산책·전망/야경·카페·휴식 취향과 기피 조건
- 운영시간, 고정 행사시각, 가격, 총시간, 총도보거리 hard constraint
- Haversine 도보 추정과 beam search 기반 경로 최적화
- 일정 타임라인, 실제 서울 25개 구 GeoJSON 기반 Dot Atlas, 콘텐츠 비용, Wi-Fi SSID 표시
- 다른 후보 경로 재생성, 로컬 저장·복원, 조건이 담긴 공유 링크
- 현재 위치 공유 시 가까운 공개 기준점으로 자동 일반화
- 모바일 고정 출발 CTA, 키보드 포커스, reduced-motion 대응

## 데이터 안내

현재 `src/data/seoul-places.ts`는 제품 흐름을 검증하기 위한 서울 데모 카탈로그입니다. 실제 장소를 참고하되 운영시간·가격·행사·카페 항목은 실시간 정보가 아니며, 화면에도 `데모 운영시간`으로 표시됩니다.

지도는 `southkorea/seoul-maps`의 KOSTAT 2013 서울 자치구 단순 GeoJSON(Apache-2.0)을 로컬에 포함합니다. 브라우저에서 경계의 bounding box를 계산하고, 균일한 격자점을 point-in-polygon으로 판정한 뒤 SVG 원만 렌더링합니다. 출처와 기준연도는 지도 하단에 표시됩니다.

프로덕션에서는 공공데이터 API를 직접 UI에 연결하지 않고 다음 경계를 유지하는 것을 권장합니다.

```text
공공데이터/TourAPI/지자체 API
  → 서버 수집·정규화·검증
  → normalized Place 모델
  → planTrip 추천 엔진
  → React UI
```

가격이 `unknown`인 장소는 무료로 간주하지 않으며 추천에서 제외합니다. 카페 음료는 사용자가 카페를 선택했을 때 콘텐츠 예산에 포함하고, 별도 식사와 교통비는 제외합니다.

## 주요 구조

```text
src/
  components/       shadcn/ui 패턴의 UI와 플래너·결과·Dot Atlas 화면
  data/             서울 데모 장소 카탈로그와 자치구 GeoJSON
  lib/geo.ts        GeoJSON projection·point-in-polygon·grid sampling
  lib/planner.ts    제약 기반 코스 생성 엔진
  lib/planner.test.ts
  types/            요청·장소·결과 타입
```

스타일은 shadcn/ui의 CSS 변수 기반 의미 토큰과 Card/Badge/Slider 조합을 따르며, ZERO TRIP 고유의 포레스트 그린과 라임 포인트를 적용했습니다.
