# ZERO TRIP API 키 설정

실제 키는 프로젝트 루트의 `.env.local`에 입력합니다. 이 파일은 Git에서 제외되며, 공유용 항목 목록은 `.env.example`에 있습니다.

## 먼저 입력할 키 3개

```dotenv
# 현재 실시간 인구에 연결되어 있습니다.
SEOUL_OPEN_DATA_KEY=서울_열린데이터광장_일반_인증키

# 날씨 기반 코스 추천 연동용입니다.
KMA_SERVICE_KEY=공공데이터포털_기상청_서비스키

# 실제 장소 검색과 도보 경로 연동용입니다.
KAKAO_REST_API_KEY=카카오디벨로퍼스_REST_API_키
```

| 환경 변수 | 우선순위 | 사용 범위 | 발급·신청 |
| --- | --- | --- | --- |
| `SEOUL_OPEN_DATA_KEY` | 필수·연결 완료 | 지정 121개 주요장소 실시간 인구. 같은 일반 키로 서울 도시데이터의 현재 날씨·환경·도로·대중교통·문화행사도 확장 가능 | [서울 실시간 인구데이터](https://data.seoul.go.kr/dataList/OA-21778/A/1/datasetView.do) · [서울 실시간 도시데이터](https://data.seoul.go.kr/dataList/OA-21285/A/1/datasetView.do) |
| `KMA_SERVICE_KEY` | 권장·연결 완료 | 임박한 일정은 초단기예보, 이후 일정은 단기예보를 조회해 비·눈·강풍·낙뢰·극한 기온일 때 야외 후보 제외 | [기상청 단기예보 조회서비스](https://www.data.go.kr/data/15084084/openapi.do) |
| `KAKAO_REST_API_KEY` | 권장·연결 완료 | 추천 장소명 검색으로 좌표·주소 확인, 최종 코스의 실제 도보 경로·거리·시간 적용 | [카카오 로컬 API](https://developers.kakao.com/docs/ko/local/dev-guide) · [카카오맵 REST API](https://developers.kakao.com/docs/ko/kakaomap/rest-api) |

서울 도시데이터에 현재 날씨가 포함되지만, 사용자가 선택한 미래 시간대 판단에는 기상청 예보 키가 별도로 필요합니다. 일정 전체가 최신 약 6시간 범위에 들면 `getUltraSrtFcst`, 그 밖에는 `getVilageFcst`를 사용합니다. 공식 단기예보 제공 범위를 벗어난 날짜에는 기존 장소 조건으로 추천하고 화면에 그 사실을 표시합니다.

## 선택 기능용 키

TourAPI는 현재 위치·주소 보강에 연결되어 있습니다. 나머지 값은 기능을 실제로 추가할 때만 입력하면 되며 비어 있어도 앱 실행에는 문제가 없습니다.

```dotenv
# 관광지·행사·숙박·사진·반려동물 동반 관광정보
TOUR_API_SERVICE_KEY=

# 서울 밖까지 확장할 때 사용할 전국 대기질
AIRKOREA_SERVICE_KEY=

# 실시간 도착정보를 전용 API로 직접 표시할 때만 사용
SEOUL_SUBWAY_API_KEY=
SEOUL_BUS_SERVICE_KEY=
```

| 환경 변수 | 필요한 경우 | 발급·신청 |
| --- | --- | --- |
| `TOUR_API_SERVICE_KEY` | 주변 공식 관광정보를 조회하고 기존 검증 후보와 이름·500m 이내 좌표가 일치할 때 주소와 좌표를 보강. API에 가격·주간 운영시간이 없는 신규 장소는 자동 추천하지 않음 | [한국관광공사 국문 관광정보 서비스](https://www.data.go.kr/data/15101578/openapi.do) |
| `AIRKOREA_SERVICE_KEY` | 서울 밖의 미세먼지·초미세먼지·오존까지 산책 적합도에 반영 | [에어코리아 대기오염정보](https://www.data.go.kr/data/15073861/openapi.do) |
| `SEOUL_SUBWAY_API_KEY` | 역별 실시간 도착 전광판 수준의 정보를 직접 조회 | [서울 열린데이터광장 인증키 신청](https://data.seoul.go.kr/together/mypage/actkeyMain.do) |
| `SEOUL_BUS_SERVICE_KEY` | 정류장별 서울 버스 도착정보를 직접 조회 | [서울 버스도착정보 조회](https://www.data.go.kr/data/15000314/openapi.do) |

공공데이터포털에서 여러 API에 같은 프로젝트 서비스키를 승인받은 경우 값이 같아도 됩니다. 환경 변수는 API별 권한·교체·오류 확인을 쉽게 하려고 따로 두었습니다.

## RAGFlow·Airbyte 서버 설정

RAGFlow와 Airbyte 값은 선택 사항입니다. 비어 있으면 로컬 데모 모드로 실행됩니다. RAGFlow의 URL·API key·dataset ID·허용 출처 host 일부만 입력한 경우에는 정확하지 않은 fallback을 막기 위해 `misconfigured` 상태로 처리합니다.

```dotenv
RAGFLOW_BASE_URL=https://ragflow.example.com
RAGFLOW_API_KEY=서버_API_키
RAGFLOW_DATASET_IDS=서울_관광_dataset_id
RAGFLOW_ALLOWED_SOURCE_HOSTS=data.seoul.go.kr
RAGFLOW_FALLBACK_TO_DEMO=false

AIRBYTE_API_URL=https://api.airbyte.com/v1
AIRBYTE_CLIENT_ID=application_client_id
AIRBYTE_CLIENT_SECRET=application_client_secret
AIRBYTE_MAIN_DB_CONNECTION_IDS=메인_DB_connection_uuid
AIRBYTE_RAGFLOW_CONNECTION_IDS=RAG_파이프라인_connection_uuid

ZERO_TRIP_TOOLS_ADMIN_TOKEN=충분히_긴_관리자_토큰
```

Airbyte는 고정 `AIRBYTE_ACCESS_TOKEN`도 지원하지만, 만료 시간이 포함된 client credentials 방식을 권장합니다. 실제 주기 실행은 앱 타이머가 아니라 각 Airbyte Connection의 schedule에서 설정합니다. 전체 변수, canonical 장소 JSON 형식, 관리자 API와 무중단 RAG 인덱스 교체 절차는 [`docs/TOOL_INTEGRATIONS.md`](./docs/TOOL_INTEGRATIONS.md)를 참고하세요.

## 별도 키가 필요 없는 것

- 현재 픽셀형 서울 지도와 한강 표현은 로컬 데이터라 지도 키가 필요 없습니다.
- 현재 Google 지도 버튼은 외부 검색/길찾기 URL을 열기 때문에 Google Maps API 키가 필요 없습니다.
- 브라우저 현재 위치, 일몰 시각 계산, 로컬 코스 저장에도 키가 필요 없습니다.
- 현재 추천 엔진은 로컬 규칙 기반이라 OpenAI API 키가 필요 없습니다.

## 입력 및 적용 방법

1. `.env.local`에서 해당 환경 변수의 `=` 오른쪽에 키를 붙여 넣습니다. 따옴표는 넣지 않습니다.
2. 실행 중인 개발 서버를 종료합니다.
3. `npm run dev`로 다시 시작합니다.

```powershell
npm run dev
```

`RAGFLOW_FALLBACK_TO_DEMO=true`는 RAGFlow 청크가 아직 준비되지 않았거나 조회가 실패했을 때 화면에 명확히 표시되는 데모 카탈로그로 코스 생성을 계속하는 로컬 개발용 선택지입니다. 운영에서는 검증되지 않은 대체 데이터를 막기 위해 기본값 `false`를 유지하세요.

`npm run build` 후 `npm start`로 실행할 때도 Node 22의 `--env-file-if-exists=.env.local` 옵션으로 같은 파일을 읽습니다. 배포 환경에서는 파일 대신 호스팅 플랫폼의 Secret/환경변수 설정에 등록하세요.

## 추천에서 실제로 사용하는 방식

- KMA: 출발 좌표를 기상 격자(`nx`, `ny`)로 변환하고 일정 시점에 따라 초단기 또는 단기예보를 조회합니다. 위험 날씨에는 `outdoors` 제약이나 `outdoor` 태그가 있는 장소를 후보에서 제외합니다.
- TourAPI: 출발지 주변 `locationBasedList2` 결과와 기존 후보를 이름 및 500m 이내 좌표로 교차 확인하고, 일치한 장소의 공식 주소와 좌표만 반영합니다. 가격과 운영시간은 추측하지 않으며 위치 보강 출처는 별도 참조 정보로 남깁니다.
- Kakao: 1차 추천 장소를 키워드 검색으로 확인한 뒤 최대 5개 경유지를 포함한 도보 경로를 한 번에 조회합니다. 반환된 구간별 거리·시간으로 운영시간, 종료시간, 도보 한도를 다시 검사하며 조건을 넘으면 안전한 앞부분만 남기고 그것도 불가능하면 장소 없는 결과로 닫습니다. API 자체가 일시 실패한 경우에만 기존 추정 경로를 명확히 표시합니다.
- 세 API가 일시 실패해도 추천 전체를 실패시키지 않고 기존 검증 데이터·추정 경로로 복구하며, 결과의 연동 상태와 경고에 실패 사실을 남깁니다.

`SEOUL_OPEN_DATA_KEY=sample`을 유지하면 서울시 공식 샘플 범위인 `광화문·덕수궁` 한 곳의 실시간 값만 표시됩니다.

## 보안 주의

- 실제 키는 `.env.local`에만 넣고 `.env.example`에는 넣지 않습니다.
- 서버 전용 키에는 `VITE_` 접두사를 붙이지 않습니다. `VITE_` 변수는 브라우저 번들에 포함될 수 있습니다.
- 키를 React 코드, 공유 URL, 커밋, 스크린샷에 넣지 않습니다.
- 카카오 REST 키는 가능하면 호출 허용 IP를 설정하고 서버 프록시를 통해 사용합니다.
- RAGFlow·Airbyte·관리자 토큰도 서버 전용이며 `VITE_` 접두사를 붙이지 않습니다.
