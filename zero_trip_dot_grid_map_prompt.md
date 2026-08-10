# ZERO TRIP 도트 그리드 지도 UI 구현 프롬프트

## 목적

ZERO TRIP / 0원 여행 앱의 지역 탐색 화면을 일반적인 Google Maps, Naver Maps, Kakao Maps 스타일이 아니라,  
**미니멀한 Dot Grid Geographic Map / Pointillist Map 스타일**로 구현한다.

첨부한 레퍼런스 이미지의 핵심 시각 언어인  
**“실제 지리 형태를 작은 원형 점들의 배열로 표현하는 지도”**를 참고하되,  
원본 서비스의 브랜드명, 문구, 고유 UI 배치, 색상 구성 등을 그대로 복제하지 않는다.

---

# 핵심 디자인 콘셉트

다음 키워드를 기준으로 디자인한다.

- Minimal Dot-Grid Geographic Map
- Pointillist Geographic Map
- Circular Pixel Map
- Dot Atlas UI
- Minimal Editorial Map UI
- Geographic Silhouette Made of Dots
- Warm Minimalist Travel Interface

지도는 일반적인 도로 중심 지도가 아니라  
**지역의 형태 자체를 수백 개의 동일 크기 원형 점으로 표현하는 추상화된 지도**여야 한다.

---

# 지도 구현 방식

실제 대한민국 행정구역 또는 대상 도시의 GeoJSON 데이터를 사용한다.

예:

- 대한민국 전체 행정경계
- 시·도 경계
- 서울특별시
- 서울 25개 자치구
- 부산광역시
- 제주특별자치도

GeoJSON Polygon / MultiPolygon을 그대로 색칠하지 않는다.

대신 다음 방식으로 렌더링한다.

1. 행정구역 Bounding Box를 계산한다.
2. 지도 영역 전체에 일정한 간격으로 Grid Point를 생성한다.
3. 각각의 Grid Point가 행정구역 Polygon 내부에 있는지 검사한다.
4. Polygon 내부에 포함되는 Point만 화면에 표시한다.
5. 각 Point는 동일 크기의 작은 원(circle)으로 렌더링한다.
6. 수백 개의 작은 원들이 모여 실제 지역의 실루엣을 형성하도록 한다.

즉,

`Polygon Fill`

방식이 아니라

`Polygon → Uniform Point Grid → Circle Rendering`

방식을 사용한다.

---

# 매우 중요한 지도 표현 규칙

다음 요소는 표시하지 않는다.

- 일반 지도 타일
- 도로
- 건물
- 지하철 노선
- 상세 지명
- 행정구역 외곽선
- 일반적인 지도 핀
- 위성사진
- 지형 음영
- 강한 지도색
- Google Maps 스타일 UI
- Naver Maps 스타일 UI
- Kakao Maps 스타일 UI

지도는 오직

**“작은 점 + 여백 + 텍스트”**

를 중심으로 표현한다.

---

# Dot 스타일

기본 Dot은 다음과 같이 구성한다.

- 완전한 원형
- 모든 Dot의 기본 크기는 동일
- Dot 사이 간격은 일정
- Dot끼리 서로 붙지 않음
- 외곽선 없음
- 그림자 없음
- 3D 효과 없음
- 기본 Dot은 매우 연한 Warm Gray
- 배경과 충분히 구분되지만 강하게 튀지 않음

권장 느낌:

- dot diameter: 약 6~10px
- dot gap: diameter의 약 40~80%
- 화면 크기에 따라 responsive하게 조절

단, 숫자는 절대값이 아니라 시각적 균형을 우선한다.

---

# 배경

전체 UI는 따뜻한 미니멀 톤으로 구성한다.

권장:

- Pure White보다 약간 따뜻한 Off-White
- Ivory
- Warm White
- 아주 연한 Beige Gray

예:

`#F8F7F4`

또는 유사한 Warm Off-White 계열.

단, 특정 색상 코드를 강제하기보다 전체적인 느낌을 우선한다.

---

# 지도 상태별 Dot 표현

ZERO TRIP에서는 Dot 하나에 의미를 부여한다.

## 기본 상태

연한 Warm Gray Dot

의미:

- 아직 탐색하지 않은 지역
- 무료 콘텐츠 정보가 없는 지역
- 사용자가 방문하지 않은 지역

---

## 무료 여행 콘텐츠 존재

조금 더 진한 Dot 또는 Accent Dot

의미:

- 무료 관광지가 존재
- 무료 전시 존재
- 무료 행사 존재
- 무료 코스를 생성할 수 있음

---

## 오늘 무료 이벤트 존재

조금 더 강조된 Dot

예:

- Accent Color
- slightly larger dot
- 작은 ring 효과

단, 과도한 애니메이션이나 발광 효과는 사용하지 않는다.

---

## 사용자 방문 완료

방문한 장소나 지역의 Dot은  
해당 장소 대표 사진에서 추출한 Dominant Color를 사용하거나  
ZERO TRIP 고유 Accent Palette를 사용한다.

여러 장소를 방문한 지역은 다양한 Dot Color가 섞여  
사진의 색조가 작은 점들 안에 흩어진 듯한 느낌을 만들 수 있다.

이때 색상은 화려한 Rainbow Map처럼 보이지 않도록  
채도를 낮추고 자연스러운 색을 사용한다.

---

# 전국 지도 화면

대한민국 전체를 하나의 거대한 Dot Silhouette로 표시한다.

예시 구조:

```text
ZERO TRIP

대한민국

              · · · · · ·
          · · · · · · · · ·
       · · · · · · · · · ·
      · · · ● · · · · · ·
      · · ● ● · · · · · ·
      · · · · · · · · · ·
       · · · · · · · · ·
         · · · · · · ·

             · ·
           · · · ·
```

실제 화면에서는 반드시 실제 GeoJSON 좌표를 기반으로 형태를 생성한다.

대한민국 본토와 제주도 및 주요 섬들의 상대적 위치도 실제 지리 좌표를 따른다.

지도 모양을 임의로 손으로 그리지 않는다.

---

# 지역별 진행 상태

지도 아래에 다음과 같은 형태로 정보를 보여준다.

```text
발견한 무료 지역

48 / 288
```

또는:

```text
무료 여행 가능 지역

48 / 288
```

숫자 `48`은 크게 보여주고  
`/ 288`은 작고 연한 색으로 보여준다.

---

# 지역 리스트

전국 지도 아래에 지역별 진행 상태를 보여준다.

예:

```text
지역 여행

[작은 서울 Dot Map]

서울특별시
19 / 25 · 6곳 남음
```

```text
[작은 부산 Dot Map]

부산광역시
8 / 16 · 8곳 남음
```

각 지역 카드에서도 일반 지도 Thumbnail 대신  
동일한 Dot Grid Map을 축소해서 사용한다.

---

# 지역 상세 화면

사용자가 서울특별시를 선택하면  
서울 전체가 화면 중앙에 크게 Dot Grid로 표시된다.

상단 정보:

```text
지역

서울특별시

19 / 25 · 6곳 남음
```

그 아래 대형 서울 Dot Map을 배치한다.

---

# 서울 25개 자치구 표현

가능하다면 각 Dot이 정확히 하나의 행정구를 의미하게 만드는 것이 아니라,  
서울 전체 Polygon을 Grid Sampling한 뒤 각각의 Dot이 어느 자치구 Polygon에 속하는지를 계산한다.

따라서:

- 강남구의 Dot
- 종로구의 Dot
- 마포구의 Dot
- 성동구의 Dot

등을 서로 다른 데이터 상태로 표현할 수 있다.

사용자가 특정 구의 Dot Cluster를 선택하면 해당 구 상세 화면으로 이동한다.

---

# ZERO TRIP 특화 인터랙션

Dot Map은 단순 장식이 아니라 실제 탐색 인터페이스로 사용한다.

사용자가 지역을 선택하면:

```text
성동구

무료 장소 17곳
오늘 무료 행사 3개
0원 코스 4개

[성동구 0원 여행 만들기]
```

와 같은 Bottom Sheet 또는 Detail Panel을 보여준다.

---

# Dot Hover / Tap Interaction

Desktop:

- Dot 또는 Dot Cluster Hover 시 약간 확대
- 지역명 표시
- 무료 장소 개수 표시

Mobile:

- Tap 시 선택
- 해당 지역 Dot만 약간 강조
- Bottom Sheet 표시

애니메이션은 매우 절제해서 사용한다.

예:

- scale 1 → 1.08
- opacity 변화
- 150~250ms transition

Bounce, Glow, Pulse처럼 강한 효과는 피한다.

---

# 진행도 표현

사용자가 ZERO TRIP을 이용하면서 지역을 방문하거나  
무료 여행 코스를 완료하면 지도 자체가 점점 채워지는 구조를 만든다.

예:

```text
첫 여행
2026.08.10

──────────────●──────────────○

              50%          전국완성
```

또는:

```text
발견한 지역 · 19
```

처럼 Gamification 요소를 최소한으로 넣는다.

게임처럼 화려하게 만들기보다  
여행 기록이 차분하게 쌓이는 느낌을 유지한다.

---

# 대표 사진 색상 적용

사용자가 방문한 무료 관광지 또는 여행 코스의 대표 사진이 있을 경우  
해당 사진의 Dominant Color 또는 Average Color를 추출해  
일부 Dot을 채우는 방식으로 여행 기록을 표현할 수 있다.

예:

경복궁 사진

→ Beige / Brown 계열 Dot

서울숲 사진

→ Green 계열 Dot

한강 야경

→ Blue / Navy 계열 Dot

전시회

→ 해당 포스터 대표 색상

이 색들이 지도 위에 작은 점으로 축적되면서  
사용자만의 여행 지도가 만들어지는 구조로 설계한다.

---

# 타이포그래피

UI 전체는 미니멀한 Editorial Typography를 사용한다.

특징:

- Sans-serif
- 큰 제목
- 숫자 강조
- 넓은 줄간격
- 넉넉한 여백
- Bold 사용 최소화
- 보조정보는 Warm Gray
- 본문은 거의 Black에 가까운 Dark Gray

예:

```text
지역

서울특별시

19 / 25 · 6곳 남음
```

`서울특별시`는 매우 크게 표시한다.

---

# 레이아웃

전체적으로 화면에 많은 정보를 억지로 넣지 않는다.

우선순위:

1. 제목
2. Dot Map
3. 진행 상태
4. 지역 정보
5. CTA

큰 White Space를 적극 사용한다.

카드 UI를 과도하게 사용하지 않는다.

---

# Divider

섹션 구분은 카드나 그림자 대신  
아주 얇은 Horizontal Divider를 사용한다.

예:

```text
────────────────────────────
```

색상은 매우 연한 Warm Gray.

---

# 금지할 디자인

다음 스타일로 만들지 않는다.

- 일반 관광앱 스타일
- 지도에 Pin 수십 개 표시
- Material Design 카드 남발
- Gradient Background
- 강한 Drop Shadow
- Neon Color
- Glassmorphism
- 지나치게 둥근 카드
- 캐릭터 중심 UI
- 게임 스타일 Map
- Google Maps 클론
- Naver Maps 클론
- Kakao Maps 클론
- 지도 Boundary를 굵은 선으로 표시
- 지역마다 서로 다른 원색 Fill
- Choropleth Map 스타일

---

# ZERO TRIP 적용 예시

첫 화면:

```text
ZERO TRIP

대한민국

       [DOT MAP]

무료로 즐길 수 있는 지역

48 / 288


────────────────────────────


지역 여행

서울특별시
19 / 25 · 6곳 남음

부산광역시
8 / 16 · 8곳 남음

제주특별자치도
2 / 2 · 완료
```

---

# 서울 상세 화면

```text
지역

서울특별시

19 / 25 · 6곳 남음


            [SEOUL DOT MAP]


점을 누르면 무료 여행지를 볼 수 있어요.


────────────────────────────


오늘 서울에서

무료 장소       138
무료 행사        17
0원 추천 코스     24


[오늘 0원 코스 만들기]
```

---

# 여행 완료 후 지도 변화

여행 완료 시 해당 지역 Dot에 색상이 들어간다.

예:

```text
여행 완료

성동구
서울숲 → 무료 전시 → 한강 야경

콘텐츠 비용 ₩0
```

해당 코스에서 방문한 장소들의 대표 색상이  
성동구 Dot Cluster 일부에 반영된다.

이를 반복하면서 사용자의 대한민국 지도가 점점 채워진다.

---

# 구현 기술 권장

웹 기반이라면 다음 방식 중 하나를 사용한다.

## 옵션 A: SVG

권장.

- GeoJSON 좌표 Projection
- Grid Sampling
- point-in-polygon 검사
- SVG Circle 생성

장점:

- 반응형 구현 쉬움
- Dot interaction 쉬움
- 모바일 대응 용이
- 개별 Dot 색상 변경 쉬움

---

## 옵션 B: Canvas

Dot 수가 매우 많거나 애니메이션이 많을 경우 사용.

다만 ZERO TRIP 초기 버전에서는  
SVG 방식이 유지보수와 인터랙션 측면에서 더 적합하다.

---

# 라이브러리 예시

필요하다면:

- D3.js
- Turf.js
- Mapbox GeoJSON utilities
- topojson-client

등을 활용할 수 있다.

핵심은 지도 라이브러리의 기본 Map UI를 그대로 사용하는 것이 아니라  
GeoJSON Geometry 계산만 활용하고  
최종 렌더링은 자체 Dot Map UI로 구현하는 것이다.

---

# 반응형 규칙

Desktop / Tablet / Mobile에서 지도 비율을 유지한다.

모바일에서는:

- Dot 크기를 너무 작게 만들지 않는다.
- 최소 Touch Target 문제는 Dot 하나가 아니라 Region Cluster 단위 클릭으로 해결한다.
- 대한민국 지도가 화면 너비의 약 65~80% 정도를 차지하도록 한다.
- 주변 White Space를 충분히 유지한다.

---

# 접근성

색상만으로 상태를 구분하지 않는다.

필요하면:

- Dot opacity
- Dot outline
- 선택 상태 ring
- 텍스트 숫자

등을 병행한다.

지도 아래에는 반드시 텍스트로도 상태를 표시한다.

예:

`서울특별시 · 무료 여행 가능 지역 19/25`

---

# 최종 디자인 목표

사용자가 앱을 실행했을 때

**“이건 일반 지도 앱이 아니다.”**

라는 인상을 즉시 받아야 한다.

지도를 정보가 빽빽한 Navigation Map으로 표현하지 않고,

**여행을 발견하고 기록하면서 점점 채워지는 개인적인 Travel Atlas**

처럼 보여준다.

ZERO TRIP에서 지도는 이동을 위한 도구이기 전에  
무료 여행 가능 지역을 발견하고 사용자의 경험을 축적하는  
**시각적 여행 기록 인터페이스**가 되어야 한다.

---

# 최종 한 문장 지시

> 실제 GeoJSON 행정구역 형태를 일정한 간격의 작은 원형 점들로 샘플링하여 지리적 실루엣을 만들고, 연한 Warm Gray의 미방문 Dot과 방문·무료콘텐츠·이벤트 상태를 나타내는 Accent Dot을 조합한 미니멀 Dot Atlas UI를 구현해줘. 일반 지도 타일, 도로, 핀, 건물, 행정구역 외곽선은 사용하지 말고, 넓은 Off-White 여백과 큰 Editorial Typography를 사용해서 차분하고 프리미엄한 여행 기록 앱처럼 보여줘. 첨부 레퍼런스의 시각 언어만 참고하고 원본 브랜드·문구·고유 레이아웃은 복제하지 마.
