# 필라멘트코리아 제품·장기재고

공개 제품 소개와 사내 장기재고·영업 제안서를 한 앱에서 나누어 운영합니다. 고도몰 결제 엔진을 대체하지 않습니다. 구매원가, 하자, 담당자, 예약은 로그인 뒤 허용된 역할만 봅니다.

지금 저장소의 수량과 단가는 **예시**입니다. 실제 ERP 엑셀은 Git에 넣지 말고, 업데이트 센터에서 올려 승인한 뒤에 반영합니다.

## 실행

```bash
cd filament-inventory
npm install
npm test
npm run dev
```

브라우저에서 `http://localhost:3000` 을 엽니다. 데이터베이스 파일은 `data/app.db` 이며 Git에 포함하지 않습니다.

공개 게시판의 전 품목은 `python3 scripts/import-public-catalog.py` 로 다시 넣을 수 있습니다. 새로 들어온 품목은 수량과 단가가 비어 있고 화면에는 `재고 미등록`으로 나옵니다. 제품 사진 파일은 용량 때문에 Git에 올리지 않고, 스크립트가 공개 사이트에서 다시 받습니다.

검토용 비밀번호는 `demo1234` 입니다.

| 역할 | 이메일 |
| --- | --- |
| 영업 | sales@filament.demo |
| 관리자 | admin@filament.demo |
| 승인자 | approver@filament.demo |
| 구매지원 | purchase@filament.demo |
| 물류 | warehouse@filament.demo |
| 재무 조회 | finance@filament.demo |
| 부서 담당 | manager@filament.demo |
| 조회 | viewer@filament.demo |

배포 전에 `SESSION_SECRET`을 바꾸고 비밀번호를 다시 발급하세요. `.env.example`을 참고합니다.

## 화면

- 공개: 제품, 시공 사진, 조달, 자료실, 문의
- 사내: 재고 홈, 제품·재고, 프로모션, 선택 목록, 제안서 편집과 PDF 인쇄, 업무함, 엑셀 업데이트, 배너·게시글

제안서는 문구와 단가를 고친 뒤 인쇄 화면에서 PDF로 저장합니다. 구매원가는 제안서에 넣지 않습니다.

## 검증

```bash
npm test
npm run build
```

`tests/domain.test.ts`가 가용수량, 총액 일치, 원가 비공개, 엑셀 승인 전후, 사진·판매가 유지, 동시 예약, 삭제 복구를 확인합니다.
