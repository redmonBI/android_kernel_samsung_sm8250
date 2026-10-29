# 데이터 사전

SQLite 파일 `data/app.db`. 스키마는 `src/lib/schema.ts`. 금액은 원 단위 정수다.

| 테이블 | 역할 |
| --- | --- |
| users, departments | 계정과 부서. 역할은 권한 문서 참고 |
| categories, category_mappings | 화면 분류와 엑셀 품목구분 매핑 |
| products | 품목 마스터. `deleted_at`이 있으면 소프트 삭제. `is_sample`이 1이면 예시 수량·단가 |
| inventory_items | ERP 수량, 예약, 출고 예정, 하자, 격리, 구매원가, 판매가 |
| product_images | `normal`과 `defect`를 분리 |
| defects | 하자 유형, 영향 수량, 설명, 등록자 |
| promotions, promotion_items | 프로모션 가격과 남은 수량. 판매가 원장은 덮지 않음 |
| saved_lists, saved_list_items | 선택 목록과 공유 토큰 |
| proposals, proposal_items | 제안서 스냅샷. 이후 문구와 단가 수정 |
| reservations, shipments | 예약과 출고. 승인 전 `requested` |
| disposition_plans, activities | 소진 계획과 메모 |
| import_jobs, import_job_rows | 엑셀 비교. 승인 전 `preview` |
| approval_requests | 예약, 조정, 출고, 엑셀의 승인 대기 |
| inventory_adjustments | 수량·원가 변경 요청 |
| delete_requests | 엑셀에서 빠진 품목의 삭제 후보 |
| banners, posts | 배너, 게시판, 비공개 문의 |
| audit_logs | 변경 전후 JSON |
| app_settings | 시드 여부 |

품목코드는 생성 후 화면에서 바꾸지 않는다. 주소는 `slug`를 쓴다. `+`와 대괄호가 있는 코드는 슬러그에서 안전하게 바꾼다.
