# 카페 주문 및 스탬프 적립 관리 시스템

MongoDB 연결 전 단계로 더미 데이터를 사용하는 Node.js 웹 프로젝트입니다.

## 실행

```bash
npm start
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

## 주요 기능

- 대시보드: 오늘 주문 수, 매출, 인기 메뉴, 스탬프 현황
- 회원 관리: 회원 등록, 검색, 스탬프 조회
- 메뉴 관리: 메뉴 등록, 가격 수정, 판매 여부 변경, 삭제
- 주문 등록: 회원/비회원 주문, 메뉴 수량 선택, 결제수단 선택
- 주문 목록: 주문 상세, 결제 상태, 적립 스탬프 확인
- 스탬프 내역: 적립 이력 조회

## MongoDB 전환 계획

현재 `src/store/dummyStore.js`가 배열 기반 저장소 역할을 합니다.
MongoDB Atlas 연결 시 같은 함수 이름으로 `mongoStore.js`를 만들고 서버에서 저장소 import만 교체하면 됩니다.

예상 컬렉션:

- `members`
- `menus`
- `orders`
- `payments`
- `stampLogs`

환경 변수 예시:

```env
PORT=3000
MONGODB_URI=mongodb+srv://...
```
