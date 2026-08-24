# ZERO TRIP

예산·시간·출발지·동행·취향을 입력하면 서울의 데모 장소를 조합해 실행 가능한 하루 코스 하나를 만드는 여행 플래너입니다.

## 실행

```bash
npm install
npm run dev
```

서울 주요 거점의 실시간 인구를 모두 표시하려면 [서울 열린데이터광장](https://data.seoul.go.kr/dataList/OA-21778/A/1/datasetView.do)에서 인증키를 발급받고 `.env.local`에 키를 설정합니다. 날씨 기반 추천과 실제 도보 경로에 사용할 기상청·카카오 키 항목도 미리 준비되어 있습니다.

API 키 목록과 입력 방법은 [`API_KEYS.md`](./API_KEYS.md)에 따로 정리되어 있습니다.

```dotenv
SEOUL_OPEN_DATA_KEY=발급받은_인증키
```

키는 Vite 서버 프록시에서만 사용되어 브라우저 번들에 포함되지 않습니다. 키가 없으면 서울시가 허용하는 `광화문·덕수궁` 샘플 실시간 값만 표시됩니다.

이 API 경로는 로컬 개발 서버와 `vite preview`에서 동작합니다. GitHub Pages처럼 정적 파일만 제공하는 배포에서는 같은 서버 프록시를 별도로 배포해 `/api/seoul-population`에 연결해야 합니다. 서울시 원본 API가 HTTP로 제공되므로 인증키는 클라이언트에 넣지 않고 서버에서만 사용합니다.

프로덕션 빌드와 추천 엔진 테스트:

```bash
npm run build
npm test
```

## 구현된 기능

- 0원~50,000원 1인 예산, 날짜, 시작 시각, 이용 시간 설정
- 혼자·연인·아이·부모님·반려견 동행별 추천 점수
- 무료·전시·공연·공원·산책·전망/야경·카페·휴식 취향
- 운영시간, 고정 행사시각, 가격, 총시간, 총도보거리 hard constraint
- Haversine 도보 추정과 beam search 기반 경로 최적화
- 일정 타임라인, 실제 서울 25개 구 GeoJSON 기반 Dot Atlas, 콘텐츠 비용, Wi-Fi SSID 표시
- 서울시 공식 실시간 인구 API 기반 주요 거점 혼잡도·인구 범위·기준 시각 표시
- 다른 후보 경로 재생성, 로컬 저장·복원, 조건이 담긴 공유 링크
- 현재 위치 공유 시 가까운 공개 기준점으로 자동 일반화
- 모바일 고정 출발 CTA, 키보드 포커스, reduced-motion 대응

## 데이터 안내

현재 `src/data/seoul-places.ts`는 제품 흐름을 검증하기 위한 서울 데모 카탈로그입니다. 실제 장소를 참고하되 운영시간·가격·행사·카페 항목은 실시간 정보가 아니며, 화면에도 `데모 운영시간`으로 표시됩니다.

지도는 `southkorea/seoul-maps`의 KOSTAT 2013 서울 자치구 단순 GeoJSON(Apache-2.0)을 로컬에 포함합니다. 브라우저에서 경계의 bounding box를 계산하고, 균일한 격자점을 point-in-polygon으로 판정한 뒤 SVG 원만 렌더링합니다. 출처와 기준연도는 지도 하단에 표시됩니다.

실시간 인구는 서울시 지정 121개 핫스팟 가운데 지도 주요 11개 거점을 조회합니다. 서울시 공식 혼잡도를 기준으로 낮음은 파랑, 높음은 빨강으로 표현하며 장소별 추정 인구 범위와 `PPLTN_TIME`을 함께 표시합니다. 응답은 서버에서 5분 동안 캐시합니다.

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
