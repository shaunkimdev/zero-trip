# ZERO TRIP API 키 설정

실제 키는 프로젝트 루트의 `.env.local`에 입력합니다. 이 파일은 Git에서 제외되며, 공유용 항목 목록은 `.env.example`에 있습니다.

## 먼저 입력할 키 3개

```dotenv
# 현재 실시간 인구에 연결되어 있습니다.
SEOUL_OPEN_DATA_KEY=서울_열린데이터광장_일반_인증키

# 날씨 기반 코스 추천 연동용입니다.
KMA_SERVICE_KEY=공공데이터포털_기상청_서비스키

# 실제 장소 검색과 도보·대중교통 경로 연동용입니다.
KAKAO_REST_API_KEY=카카오디벨로퍼스_REST_API_키
```

| 환경 변수 | 우선순위 | 사용 범위 | 발급·신청 |
| --- | --- | --- | --- |
| `SEOUL_OPEN_DATA_KEY` | 필수·연결 완료 | 지정 121개 주요장소 실시간 인구. 같은 일반 키로 서울 도시데이터의 현재 날씨·환경·도로·대중교통·문화행사도 확장 가능 | [서울 실시간 인구데이터](https://data.seoul.go.kr/dataList/OA-21778/A/1/datasetView.do) · [서울 실시간 도시데이터](https://data.seoul.go.kr/dataList/OA-21285/A/1/datasetView.do) |
| `KMA_SERVICE_KEY` | 필수·다음 연동 | 초단기실황, 6시간 초단기예보, 단기예보의 강수·기온·풍속을 코스 시간대에 적용 | [기상청 단기예보 조회서비스](https://www.data.go.kr/data/15084084/openapi.do) |
| `KAKAO_REST_API_KEY` | 권장·다음 연동 | 장소/카페 검색, 주소↔좌표 변환, 실제 도보·대중교통 경로와 이동시간 | [카카오 로컬 API](https://developers.kakao.com/docs/ko/local/dev-guide) · [카카오 REST API](https://developers.kakao.com/docs/ko/rest-api/reference) |

서울 도시데이터에 현재 날씨가 포함되지만, 사용자가 선택한 미래 시간대의 비·기온을 판단하려면 기상청 예보 키가 별도로 필요합니다. 날씨 연동 시 비·폭염·한파·강풍에는 산책과 야외 장소 점수를 낮추고 실내 후보를 우선하도록 사용할 예정입니다.

## 선택 기능용 키

아래 값은 기능을 실제로 추가할 때만 입력하면 됩니다. 지금 비어 있어도 앱 실행에는 문제가 없습니다.

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
| `TOUR_API_SERVICE_KEY` | 데모 장소 목록을 실제 관광지·행사·이미지 데이터로 교체하거나 전국으로 확장 | [한국관광공사 국문 관광정보 서비스](https://www.data.go.kr/data/15101578/openapi.do) |
| `AIRKOREA_SERVICE_KEY` | 서울 밖의 미세먼지·초미세먼지·오존까지 산책 적합도에 반영 | [에어코리아 대기오염정보](https://www.data.go.kr/data/15073861/openapi.do) |
| `SEOUL_SUBWAY_API_KEY` | 역별 실시간 도착 전광판 수준의 정보를 직접 조회 | [서울 열린데이터광장 인증키 신청](https://data.seoul.go.kr/together/mypage/actkeyMain.do) |
| `SEOUL_BUS_SERVICE_KEY` | 정류장별 서울 버스 도착정보를 직접 조회 | [서울 버스도착정보 조회](https://www.data.go.kr/data/15000314/openapi.do) |

공공데이터포털에서 여러 API에 같은 프로젝트 서비스키를 승인받은 경우 값이 같아도 됩니다. 환경 변수는 API별 권한·교체·오류 확인을 쉽게 하려고 따로 두었습니다.

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

`SEOUL_OPEN_DATA_KEY=sample`을 유지하면 서울시 공식 샘플 범위인 `광화문·덕수궁` 한 곳의 실시간 값만 표시됩니다.

## 보안 주의

- 실제 키는 `.env.local`에만 넣고 `.env.example`에는 넣지 않습니다.
- 서버 전용 키에는 `VITE_` 접두사를 붙이지 않습니다. `VITE_` 변수는 브라우저 번들에 포함될 수 있습니다.
- 키를 React 코드, 공유 URL, 커밋, 스크린샷에 넣지 않습니다.
- 카카오 REST 키는 가능하면 호출 허용 IP를 설정하고 서버 프록시를 통해 사용합니다.
