# 디자인 시스템

공통 조각은 `src/components`에 있다.

- `FilamentHeader`: 로고, 메뉴, 모바일 메뉴, 로그아웃
- `BrandHero`: 어두운 배너
- `ProductCatalogCard`, `CatalogScreen`: 카드와 표, 필터, 페이지
- `FilterDrawer`, `SelectionDrawer`
- `ui.tsx`: 배지, 가격, 빈 화면, 골격, 경로, 푸터, 예시 데이터 안내

상태 색은 브랜드 블루와 따로 둔다. 판매 가능은 녹색, 검토는 황색, 하자와 오류는 적색, 종료는 회색이다. 배지에 글자를 함께 쓴다. 등급은 윤곽선 배지다.

1280px 이하에서 페이지 전체 가로 스크롤을 만들지 않는다. 카테고리 탭만 가로로 움직인다. 표는 좁은 화면에서 상태 열을 숨긴다.

키보드 포커스는 파란 윤곽으로 남긴다. `prefers-reduced-motion`이면 애니메이션을 끈다.
