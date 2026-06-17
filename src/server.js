const http = require("http");
const { URLSearchParams } = require("url");
const { loadEnv } = require("./env");

loadEnv();

const store = process.env.USE_MONGODB === "true"
  ? require("./store/mongoStore")
  : require("./store/dummyStore");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_ID = process.env.ADMIN_ID || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "1234";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const [key, ...value] = item.split("=");
        return [decodeURIComponent(key), decodeURIComponent(value.join("="))];
      })
  );
}

function isAdmin(req) {
  return parseCookies(req).admin === "true";
}

function layout(title, content, { admin = false } = {}) {
  const nav = [
    ["/", "대시보드"],
    ["/members", "회원"],
    ["/menus", "메뉴"],
    ["/orders/new", "주문 등록"],
    ["/orders", "주문 목록"],
    ["/stamps", "스탬프"],
    [admin ? "/logout" : "/login", admin ? "로그아웃" : "관리자 로그인"]
  ];

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | Cafe Stamp</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="topbar">
    <div>
      <p class="eyebrow">카페 주문 · 회원 스탬프 관리</p>
      <h1>카페 주문 및 스탬프 적립 관리 시스템</h1>
    </div>
    <span class="status">${admin ? "관리자" : "일반 모드"}</span>
  </header>
  <nav class="nav">${nav.map(([href, label]) => `<a href="${href}">${label}</a>`).join("")}</nav>
  <main>${content}</main>
</body>
</html>`;
}

function redirect(res, path) {
  res.writeHead(303, { Location: path });
  res.end();
}

function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  redirect(res, "/login?required=1");
  return false;
}

function send(res, html, statusCode = 200) {
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function sendCss(res) {
  res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
  res.end(css);
}

function notFound(res) {
  send(res, layout("404", `<section class="panel"><h2>페이지를 찾을 수 없습니다</h2><p>요청한 주소가 없습니다.</p></section>`), 404);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        req.destroy();
        reject(new Error("요청 데이터가 너무 큽니다."));
      }
    });
    req.on("end", () => resolve(Object.fromEntries(new URLSearchParams(data))));
    req.on("error", reject);
  });
}

async function dashboardPage(req) {
  const dashboard = await store.getDashboard();
  const admin = isAdmin(req);
  return layout("대시보드", `
    <section class="stats">
      <article><span>오늘 주문</span><strong>${dashboard.todayOrderCount}건</strong></article>
      <article><span>오늘 매출</span><strong>${store.money(dashboard.sales)}원</strong></article>
      <article><span>회원 수</span><strong>${dashboard.memberCount}명</strong></article>
      <article><span>등록 메뉴</span><strong>${dashboard.menuCount}개</strong></article>
      <article><span>보유 스탬프</span><strong>${dashboard.totalStamps}개</strong></article>
    </section>
    <section class="grid two">
      <div class="panel">
        <div class="panel-head">
          <h2>최근 주문</h2>
          <a class="button ghost" href="/orders">전체 보기</a>
        </div>
        <table>
          <thead><tr><th>시간</th><th>회원</th><th>금액</th><th>스탬프</th></tr></thead>
          <tbody>
            ${dashboard.recentOrders.map((order) => `
              <tr>
                <td>${store.formatDateTime(order.orderDate)}</td>
                <td>${escapeHtml(order.memberName)}</td>
                <td>${store.money(order.totalAmount)}원</td>
                <td>${order.stampCount}개</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="panel">
        <div class="panel-head">
          <h2>인기 메뉴</h2>
          <a class="button ghost" href="/menus">메뉴 관리</a>
        </div>
        <div class="rank-list">
          ${dashboard.popularMenus.map((item, index) => `
            <div class="rank-item">
              <span>${index + 1}</span>
              <b>${escapeHtml(item.menu.name)}</b>
              <em>${item.count}잔/개</em>
            </div>
          `).join("")}
        </div>
        <h3 class="subhead">최근 추가 메뉴</h3>
        <div class="compact-list">
          ${dashboard.recentMenus.map((menu) => `
            <div>
              <b>${escapeHtml(menu.name)}</b>
              <span>${escapeHtml(menu.category)} · ${store.money(menu.price)}원</span>
            </div>
          `).join("")}
        </div>
      </div>
    </section>
  `, { admin });
}

async function membersPage(req, query = "") {
  const members = await store.listMembers(query);
  const admin = isAdmin(req);
  return layout("회원 관리", `
    <section class="panel">
      <div class="panel-head">
        <h2>회원 관리</h2>
        <form class="search" method="get" action="/members">
          <input name="q" value="${escapeHtml(query)}" placeholder="이름 또는 전화번호 검색">
          <button>검색</button>
        </form>
      </div>
      <form class="inline-form" method="post" action="/members">
        <input name="name" placeholder="회원명" required>
        <input name="phone" placeholder="전화번호" required>
        <button>회원 등록</button>
      </form>
      ${admin ? "" : `<p class="notice">회원 삭제는 관리자 로그인 후 사용할 수 있습니다.</p>`}
      <table>
        <thead><tr><th>회원명</th><th>전화번호</th><th>가입일</th><th>보유 스탬프</th>${admin ? "<th>관리</th>" : ""}</tr></thead>
        <tbody>
          ${members.map((member) => `
            <tr>
              <td>${escapeHtml(member.name)}</td>
              <td>${escapeHtml(member.phone)}</td>
              <td>${member.joinDate}</td>
              <td><span class="pill">${member.stampBalance}개</span></td>
              ${admin ? `<td><form method="post" action="/members/${member.id}/delete"><button class="danger small">삭제</button></form></td>` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `, { admin });
}

async function menusPage(req) {
  const menus = await store.listMenus();
  const admin = isAdmin(req);
  return layout("메뉴 관리", `
    <section class="panel">
      <div class="panel-head">
        <h2>메뉴 관리</h2>
      </div>
      ${admin ? `<form class="inline-form" method="post" action="/menus">
        <input name="name" placeholder="메뉴명" required>
        <input name="category" placeholder="카테고리" required>
        <input name="price" type="number" min="0" step="100" placeholder="가격" required>
        <button>메뉴 등록</button>
      </form>` : `<p class="notice">메뉴 등록, 메뉴명 수정, 가격 변경, 판매 여부 변경, 삭제는 관리자 로그인 후 사용할 수 있습니다.</p>`}
      <div class="menu-list">
        ${menus.map((menu) => admin ? `
          <form class="menu-card" method="post" action="/menus/${menu.id}/update">
            <input name="name" value="${escapeHtml(menu.name)}" required>
            <input name="category" value="${escapeHtml(menu.category)}" required>
            <input name="price" type="number" min="0" step="100" value="${menu.price}" required>
            <label class="check"><input type="checkbox" name="isActive" ${menu.isActive ? "checked" : ""}> 판매중</label>
            <button>수정</button>
            <button class="danger" formmethod="post" formaction="/menus/${menu.id}/delete">삭제</button>
          </form>
        ` : `
          <article class="readonly-menu-card">
            <div>
              <strong>${escapeHtml(menu.name)}</strong>
              <span>${escapeHtml(menu.category)}</span>
            </div>
            <b>${store.money(menu.price)}원</b>
            <em>${menu.isActive ? "판매중" : "판매중지"}</em>
          </article>
        `).join("")}
      </div>
    </section>
  `, { admin });
}

async function newOrderPage(req, error = "") {
  const members = await store.listMembers();
  const menus = (await store.listMenus()).filter((menu) => menu.isActive);
  const admin = isAdmin(req);
  return layout("주문 등록", `
    <section class="panel">
      <div class="panel-head">
        <h2>주문 등록</h2>
        <p>결제 완료 시 회원 주문은 5,000원당 스탬프 1개가 자동 적립됩니다.</p>
      </div>
      ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
      <form method="post" action="/orders" class="order-form">
        <div class="form-grid">
          <label>회원
            <select name="memberId">
              <option value="guest">비회원</option>
              ${members.map((member) => `<option value="${member.id}">${escapeHtml(member.name)} (${member.stampBalance}개)</option>`).join("")}
            </select>
          </label>
          <label>결제수단
            <select name="method">
              <option>카드</option>
              <option>현금</option>
              <option>간편결제</option>
            </select>
          </label>
        </div>
        <div class="order-menu-grid">
          ${menus.map((menu) => `
            <label class="order-menu">
              <span>
                <b>${escapeHtml(menu.name)}</b>
                <em>${escapeHtml(menu.category)} · ${store.money(menu.price)}원</em>
              </span>
              <input type="number" name="qty_${menu.id}" min="0" value="0">
            </label>
          `).join("")}
        </div>
        <button class="primary">주문 등록 및 결제 완료</button>
      </form>
    </section>
  `, { admin });
}

async function quickAddPage(req, error = "") {
  const members = await store.listMembers();
  const admin = isAdmin(req);
  return layout("간편 추가", `
    <section class="panel auth-panel">
      <div class="panel-head">
        <h2>간편 추가</h2>
        <p>로그인 없이 메뉴명, 회원, 금액, 스탬프를 입력해 주문과 적립 내역을 바로 추가합니다.</p>
      </div>
      ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
      <form class="login-form" method="post" action="/quick-add">
        <label>회원
          <select name="memberId">
            <option value="guest">비회원</option>
            ${members.map((member) => `<option value="${member.id}">${escapeHtml(member.name)} (${member.stampBalance}개)</option>`).join("")}
          </select>
        </label>
        <label>메뉴명
          <input name="menuName" placeholder="예: 아이스티" required>
        </label>
        <label>금액
          <input name="amount" type="number" min="1" step="100" placeholder="예: 4500" required>
        </label>
        <label>적립 스탬프
          <input name="stampCount" type="number" min="0" step="1" value="1" required>
        </label>
        <button class="primary">추가하기</button>
      </form>
      <p class="notice">시간은 입력하지 않아도 서버 시간이 자동으로 저장됩니다.</p>
    </section>
  `, { admin });
}

async function ordersPage(req) {
  const orders = await store.listOrders();
  const admin = isAdmin(req);
  return layout("주문 목록", `
    <section class="panel">
      <div class="panel-head">
        <h2>주문 목록</h2>
        <a class="button" href="/orders/new">새 주문</a>
      </div>
      <div class="orders">
        ${orders.map((order) => `
          <article class="order-card">
            <div class="order-card-head">
              <div>
                <strong>${escapeHtml(order.memberName)}</strong>
                <span>${store.formatDateTime(order.orderDate)} · ${order.payment ? escapeHtml(order.payment.method) : "-"}</span>
              </div>
              <b>${store.money(order.totalAmount)}원</b>
            </div>
            <ul>
              ${order.items.map((item) => `<li>${escapeHtml(item.menu.name)} x ${item.quantity} <span>${store.money(item.subtotal)}원</span></li>`).join("")}
            </ul>
            <div class="order-meta">
              <span>${escapeHtml(order.status)}</span>
              <span>적립 ${order.stampCount}개</span>
              ${admin ? `<form method="post" action="/orders/${order.id}/delete"><button class="danger small">삭제</button></form>` : ""}
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `, { admin });
}

async function stampsPage(req) {
  const logs = await store.listStampLogs();
  const admin = isAdmin(req);
  return layout("스탬프 내역", `
    <section class="panel">
      <div class="panel-head">
        <h2>스탬프 내역</h2>
      </div>
      <table>
        <thead><tr><th>일시</th><th>회원</th><th>구분</th><th>수량</th><th>주문금액</th></tr></thead>
        <tbody>
          ${logs.map((log) => `
            <tr>
              <td>${store.formatDateTime(log.createdAt)}</td>
              <td>${escapeHtml(log.member ? log.member.name : "-")}</td>
              <td>${escapeHtml(log.type)}</td>
              <td><span class="pill">${log.count > 0 ? "+" : ""}${log.count}개</span></td>
              <td>${log.order ? `${store.money(log.order.totalAmount)}원` : "-"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `, { admin });
}

function loginPage(req, error = "") {
  const admin = isAdmin(req);
  return layout("관리자 로그인", `
    <section class="panel auth-panel">
      <div class="panel-head">
        <h2>관리자 로그인</h2>
        <p>관리자로 로그인하면 회원, 메뉴, 주문 삭제 기능을 사용할 수 있습니다.</p>
      </div>
      ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
      <form class="login-form" method="post" action="/login" autocomplete="off">
        <label>아이디
          <input name="adminId" autocomplete="off" required>
        </label>
        <label>비밀번호
          <input name="password" type="password" autocomplete="new-password" required>
        </label>
        <button class="primary">로그인</button>
      </form>
    </section>
  `, { admin });
}

async function handlePost(req, res, pathname) {
  const body = await parseBody(req);
  if (pathname === "/login") {
    if (body.adminId === ADMIN_ID && body.password === ADMIN_PASSWORD) {
      res.writeHead(303, {
        Location: "/",
        "Set-Cookie": "admin=true; Path=/; HttpOnly; SameSite=Lax"
      });
      return res.end();
    }
    return send(res, loginPage(req, "아이디 또는 비밀번호가 올바르지 않습니다."), 401);
  }
  if (pathname === "/members") {
    await store.addMember(body);
    return redirect(res, "/members");
  }
  const deleteMemberMatch = pathname.match(/^\/members\/([^/]+)\/delete$/);
  if (deleteMemberMatch) {
    if (!requireAdmin(req, res)) return;
    await store.deleteMember(deleteMemberMatch[1]);
    return redirect(res, "/members");
  }
  if (pathname === "/menus") {
    if (!requireAdmin(req, res)) return;
    await store.addMenu(body);
    return redirect(res, "/menus");
  }
  if (pathname === "/quick-add") {
    try {
      await store.createQuickEntry(body);
      return redirect(res, "/orders");
    } catch (error) {
      return send(res, await quickAddPage(req, error.message), 400);
    }
  }
  const updateMenuMatch = pathname.match(/^\/menus\/([^/]+)\/update$/);
  if (updateMenuMatch) {
    if (!requireAdmin(req, res)) return;
    await store.updateMenu(updateMenuMatch[1], body);
    return redirect(res, "/menus");
  }
  const deleteMenuMatch = pathname.match(/^\/menus\/([^/]+)\/delete$/);
  if (deleteMenuMatch) {
    if (!requireAdmin(req, res)) return;
    await store.deleteMenu(deleteMenuMatch[1]);
    return redirect(res, "/menus");
  }
  const deleteOrderMatch = pathname.match(/^\/orders\/([^/]+)\/delete$/);
  if (deleteOrderMatch) {
    if (!requireAdmin(req, res)) return;
    await store.deleteOrder(deleteOrderMatch[1]);
    return redirect(res, "/orders");
  }
  if (pathname === "/orders") {
    const quantities = {};
    Object.entries(body).forEach(([key, value]) => {
      if (key.startsWith("qty_")) quantities[key.replace("qty_", "")] = value;
    });
    try {
      await store.createOrder({ memberId: body.memberId, method: body.method, quantities });
      return redirect(res, "/orders");
    } catch (error) {
      return send(res, await newOrderPage(req, error.message), 400);
    }
  }
  return notFound(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (req.method === "GET" && pathname === "/styles.css") return sendCss(res);
    if (req.method === "POST") return handlePost(req, res, pathname);

    if (pathname === "/") return send(res, await dashboardPage(req));
    if (pathname === "/login") return send(res, loginPage(req, url.searchParams.get("required") ? "삭제 기능은 관리자 로그인 후 사용할 수 있습니다." : ""));
    if (pathname === "/logout") {
      res.writeHead(303, {
        Location: "/",
        "Set-Cookie": "admin=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"
      });
      return res.end();
    }
    if (pathname === "/members") return send(res, await membersPage(req, url.searchParams.get("q") || ""));
    if (pathname === "/menus") return send(res, await menusPage(req));
    if (pathname === "/quick-add") return send(res, await quickAddPage(req));
    if (pathname === "/orders/new") return send(res, await newOrderPage(req));
    if (pathname === "/orders") return send(res, await ordersPage(req));
    if (pathname === "/stamps") return send(res, await stampsPage(req));
    return notFound(res);
  } catch (error) {
    send(res, layout("오류", `<section class="panel"><h2>오류가 발생했습니다</h2><p>${escapeHtml(error.message)}</p></section>`), 500);
  }
});

async function start() {
  if (typeof store.connect === "function") {
    await store.connect();
    console.log(`MongoDB connected: ${process.env.MONGODB_DB || "cafe_stamp_db"}`);
  }
  server.listen(PORT, () => {
    console.log(`Cafe stamp app running at http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

const css = `
:root {
  --bg: #f6f7f9;
  --panel: #ffffff;
  --ink: #20242a;
  --muted: #667085;
  --line: #d9dee7;
  --blue: #1f4e79;
  --blue-2: #2f6f9f;
  --green: #217a51;
  --red: #b42318;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: "Malgun Gothic", "Apple SD Gothic Neo", Arial, sans-serif;
}
.topbar {
  min-height: 132px;
  padding: 28px clamp(18px, 5vw, 64px);
  color: white;
  background: linear-gradient(135deg, #1f4e79 0%, #1f7a69 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
.eyebrow { margin: 0 0 8px; font-size: 13px; opacity: .82; }
h1 { margin: 0; font-size: clamp(24px, 4vw, 36px); letter-spacing: 0; }
.status {
  border: 1px solid rgba(255,255,255,.55);
  border-radius: 999px;
  padding: 8px 12px;
  white-space: nowrap;
}
.nav {
  padding: 0 clamp(18px, 5vw, 64px);
  background: white;
  border-bottom: 1px solid var(--line);
  display: flex;
  gap: 4px;
  overflow-x: auto;
}
.nav a {
  padding: 15px 14px;
  color: var(--ink);
  text-decoration: none;
  font-weight: 700;
  white-space: nowrap;
}
.nav a:hover { color: var(--blue-2); }
main { padding: 24px clamp(18px, 5vw, 64px) 48px; }
.stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}
.stats article, .panel, .order-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.stats article { padding: 18px; }
.stats span { display: block; color: var(--muted); font-size: 13px; margin-bottom: 8px; }
.stats strong { font-size: 25px; }
.grid.two {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(300px, .8fr);
  gap: 18px;
}
.panel { padding: 18px; }
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.panel-head h2 { margin: 0; font-size: 20px; }
.panel-head p { margin: 0; color: var(--muted); font-size: 13px; }
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
th, td {
  border-bottom: 1px solid var(--line);
  padding: 11px 9px;
  text-align: left;
  vertical-align: middle;
}
th { color: #475467; background: #f8fafc; font-size: 13px; }
input, select, button, .button {
  height: 40px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  padding: 0 11px;
  font: inherit;
}
button, .button {
  background: var(--blue);
  color: white;
  border-color: var(--blue);
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}
.button.ghost { background: white; color: var(--blue); }
.primary { width: 100%; margin-top: 14px; height: 46px; }
.danger { background: white; color: var(--red); border-color: #f1b8b2; }
.small {
  height: 30px;
  padding: 0 9px;
  font-size: 13px;
}
.inline-form, .search {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}
.inline-form input { min-width: 0; flex: 1; }
.search input { width: min(340px, 52vw); }
.pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 50px;
  padding: 4px 8px;
  border-radius: 999px;
  color: var(--green);
  background: #e8f5ef;
  font-weight: 700;
}
.rank-list { display: grid; gap: 10px; }
.rank-item {
  display: grid;
  grid-template-columns: 34px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 12px;
  background: #f8fafc;
  border-radius: 6px;
}
.rank-item span {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: white;
  background: var(--blue-2);
  font-weight: 800;
}
.rank-item em { color: var(--muted); font-style: normal; }
.subhead {
  margin: 18px 0 10px;
  font-size: 15px;
}
.compact-list {
  display: grid;
  gap: 8px;
}
.compact-list div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #ffffff;
}
.compact-list span {
  color: var(--muted);
  font-size: 13px;
  white-space: nowrap;
}
.menu-list { display: grid; gap: 10px; }
.menu-card {
  display: grid;
  grid-template-columns: 1.4fr 1fr 120px 96px 72px 72px;
  gap: 8px;
  align-items: center;
}
.readonly-menu-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: center;
  padding: 13px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fbfcfe;
}
.readonly-menu-card div {
  display: grid;
  gap: 4px;
}
.readonly-menu-card span,
.readonly-menu-card em {
  color: var(--muted);
  font-size: 13px;
  font-style: normal;
}
.readonly-menu-card b {
  white-space: nowrap;
}
.check {
  height: 40px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
}
.check input { height: auto; }
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.form-grid label { display: grid; gap: 6px; color: var(--muted); font-size: 13px; }
.order-menu-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}
.order-menu {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
  background: #fbfcfe;
}
.order-menu span { display: grid; gap: 4px; }
.order-menu em { color: var(--muted); font-size: 13px; font-style: normal; }
.order-menu input { width: 82px; }
.orders {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.order-card { padding: 15px; }
.order-card-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.order-card-head span {
  display: block;
  color: var(--muted);
  font-size: 13px;
  margin-top: 4px;
}
.order-card ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 7px;
}
.order-card li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: #344054;
}
.order-meta {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  color: var(--muted);
  font-size: 13px;
}
.order-meta span {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 4px 8px;
}
.error {
  border: 1px solid #fda29b;
  color: #912018;
  background: #fffbfa;
  border-radius: 6px;
  padding: 10px 12px;
}
.notice {
  border: 1px solid #d0d5dd;
  color: #475467;
  background: #f8fafc;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 13px;
}
.auth-panel {
  max-width: 520px;
  margin: 0 auto;
}
.login-form {
  display: grid;
  gap: 12px;
}
.login-form label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 13px;
}
@media (max-width: 850px) {
  .topbar { align-items: flex-start; flex-direction: column; }
  .stats, .grid.two, .orders, .order-menu-grid, .form-grid { grid-template-columns: 1fr; }
  .menu-card { grid-template-columns: 1fr; }
  .readonly-menu-card { grid-template-columns: 1fr; }
  .inline-form { flex-direction: column; }
  .panel-head { align-items: flex-start; flex-direction: column; }
}
`;
