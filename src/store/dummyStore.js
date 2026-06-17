const now = new Date();
const today = now.toISOString().slice(0, 10);

let nextMemberId = 4;
let nextMenuId = 8;
let nextOrderId = 4;
let nextPaymentId = 4;
let nextStampLogId = 5;

const members = [
  { id: "m1", name: "김민수", phone: "010-1234-5678", joinDate: "2026-05-20", stampBalance: 8 },
  { id: "m2", name: "이지은", phone: "010-2222-3344", joinDate: "2026-06-01", stampBalance: 4 },
  { id: "m3", name: "박서준", phone: "010-7777-0909", joinDate: "2026-06-10", stampBalance: 11 }
];

const menus = [
  { id: "mn1", name: "아메리카노", category: "커피", price: 3500, isActive: true },
  { id: "mn2", name: "카페라떼", category: "커피", price: 4500, isActive: true },
  { id: "mn3", name: "바닐라라떼", category: "커피", price: 5000, isActive: true },
  { id: "mn4", name: "초코라떼", category: "논커피", price: 4800, isActive: true },
  { id: "mn5", name: "레몬에이드", category: "에이드", price: 5200, isActive: true },
  { id: "mn6", name: "치즈케이크", category: "디저트", price: 6200, isActive: true },
  { id: "mn7", name: "소금빵", category: "디저트", price: 3200, isActive: true }
];

const orders = [
  {
    id: "o1",
    memberId: "m1",
    orderDate: `${today}T09:20:00`,
    items: [
      { menuId: "mn1", quantity: 2, unitPrice: 3500, subtotal: 7000 },
      { menuId: "mn7", quantity: 1, unitPrice: 3200, subtotal: 3200 }
    ],
    totalAmount: 10200,
    status: "결제완료"
  },
  {
    id: "o2",
    memberId: "m2",
    orderDate: `${today}T12:05:00`,
    items: [
      { menuId: "mn2", quantity: 1, unitPrice: 4500, subtotal: 4500 },
      { menuId: "mn6", quantity: 1, unitPrice: 6200, subtotal: 6200 }
    ],
    totalAmount: 10700,
    status: "결제완료"
  },
  {
    id: "o3",
    memberId: null,
    orderDate: `${today}T14:30:00`,
    items: [
      { menuId: "mn5", quantity: 2, unitPrice: 5200, subtotal: 10400 }
    ],
    totalAmount: 10400,
    status: "결제완료"
  }
];

const payments = [
  { id: "p1", orderId: "o1", method: "카드", paidAmount: 10200, paidAt: `${today}T09:21:00`, status: "완료" },
  { id: "p2", orderId: "o2", method: "간편결제", paidAmount: 10700, paidAt: `${today}T12:06:00`, status: "완료" },
  { id: "p3", orderId: "o3", method: "현금", paidAmount: 10400, paidAt: `${today}T14:31:00`, status: "완료" }
];

const stampLogs = [
  { id: "s1", memberId: "m1", orderId: "o1", type: "적립", count: 2, createdAt: `${today}T09:21:00` },
  { id: "s2", memberId: "m2", orderId: "o2", type: "적립", count: 2, createdAt: `${today}T12:06:00` },
  { id: "s3", memberId: "m3", orderId: null, type: "사용", count: -10, createdAt: "2026-06-15T10:00:00" },
  { id: "s4", memberId: "m3", orderId: null, type: "관리자조정", count: 1, createdAt: "2026-06-16T18:20:00" }
];

function money(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getMember(id) {
  return members.find((member) => member.id === id) || null;
}

function getMenu(id) {
  return menus.find((menu) => menu.id === id) || null;
}

function findMenuByName(name) {
  const normalized = name.trim().toLowerCase();
  return menus.find((menu) => menu.name.toLowerCase() === normalized) || null;
}

function hydrateOrder(order) {
  const member = getMember(order.memberId);
  const payment = payments.find((item) => item.orderId === order.id) || null;
  const stampCount = stampLogs
    .filter((log) => log.orderId === order.id)
    .reduce((sum, log) => sum + log.count, 0);
  return {
    ...order,
    memberName: member ? member.name : "비회원",
    payment,
    stampCount,
    items: order.items.map((item) => ({
      ...item,
      menu: getMenu(item.menuId) || { name: "삭제된 메뉴", category: "-", price: item.unitPrice }
    }))
  };
}

function getDashboard() {
  const todayOrders = orders.filter((order) => order.orderDate.startsWith(today));
  const paidOrders = todayOrders.filter((order) => order.status === "결제완료");
  const sales = paidOrders.reduce((sum, order) => sum + order.totalAmount, 0);
  const totalStamps = members.reduce((sum, member) => sum + member.stampBalance, 0);
  const menuCount = new Map();

  orders.forEach((order) => {
    order.items.forEach((item) => {
      menuCount.set(item.menuId, (menuCount.get(item.menuId) || 0) + item.quantity);
    });
  });

  const popularMenus = [...menuCount.entries()]
    .map(([menuId, count]) => ({ menu: getMenu(menuId), count }))
    .filter((item) => item.menu)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    todayOrderCount: todayOrders.length,
    sales,
    memberCount: members.length,
    menuCount: menus.length,
    recentMenus: menus.slice().reverse().slice(0, 5),
    totalStamps,
    popularMenus,
    recentOrders: orders.slice().reverse().slice(0, 5).map(hydrateOrder)
  };
}

function listMembers(query = "") {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return members;
  return members.filter((member) =>
    [member.name, member.phone].some((value) => value.toLowerCase().includes(normalized))
  );
}

function addMember({ name, phone }) {
  const member = {
    id: `m${nextMemberId++}`,
    name: name.trim(),
    phone: phone.trim(),
    joinDate: new Date().toISOString().slice(0, 10),
    stampBalance: 0
  };
  members.push(member);
  return member;
}

function deleteMember(id) {
  const index = members.findIndex((member) => member.id === id);
  if (index >= 0) members.splice(index, 1);
}

function listMenus() {
  return menus;
}

function addMenu({ name, category, price }) {
  const menu = {
    id: `mn${nextMenuId++}`,
    name: name.trim(),
    category: category.trim(),
    price: Number(price),
    isActive: true
  };
  menus.push(menu);
  return menu;
}

function updateMenu(id, { name, category, price, isActive }) {
  const menu = getMenu(id);
  if (!menu) return null;
  menu.name = name.trim();
  menu.category = category.trim();
  menu.price = Number(price);
  menu.isActive = isActive === "on" || isActive === true;
  return menu;
}

function deleteMenu(id) {
  const index = menus.findIndex((menu) => menu.id === id);
  if (index >= 0) menus.splice(index, 1);
}

function createOrder({ memberId, method, quantities }) {
  const items = Object.entries(quantities)
    .map(([menuId, quantity]) => ({ menu: getMenu(menuId), quantity: Number(quantity) }))
    .filter((item) => item.menu && item.menu.isActive && item.quantity > 0)
    .map((item) => ({
      menuId: item.menu.id,
      quantity: item.quantity,
      unitPrice: item.menu.price,
      subtotal: item.menu.price * item.quantity
    }));

  if (items.length === 0) {
    throw new Error("주문할 메뉴를 1개 이상 선택해야 합니다.");
  }

  const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);
  const orderId = `o${nextOrderId++}`;
  const createdAt = new Date().toISOString();
  const cleanMemberId = memberId && memberId !== "guest" ? memberId : null;
  const order = {
    id: orderId,
    memberId: cleanMemberId,
    orderDate: createdAt,
    items,
    totalAmount,
    status: "결제완료"
  };
  orders.push(order);

  payments.push({
    id: `p${nextPaymentId++}`,
    orderId,
    method,
    paidAmount: totalAmount,
    paidAt: createdAt,
    status: "완료"
  });

  if (cleanMemberId) {
    const stampCount = Math.floor(totalAmount / 5000);
    if (stampCount > 0) {
      stampLogs.push({
        id: `s${nextStampLogId++}`,
        memberId: cleanMemberId,
        orderId,
        type: "적립",
        count: stampCount,
        createdAt
      });
      const member = getMember(cleanMemberId);
      member.stampBalance += stampCount;
    }
  }

  return hydrateOrder(order);
}

function createQuickEntry({ memberId, menuName, amount, stampCount }) {
  const cleanMenuName = menuName.trim();
  const totalAmount = Number(amount);
  const cleanStampCount = Number(stampCount || 0);
  const cleanMemberId = memberId && memberId !== "guest" ? memberId : null;

  if (!cleanMenuName) throw new Error("메뉴명을 입력해야 합니다.");
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) throw new Error("금액은 1원 이상이어야 합니다.");
  if (!Number.isFinite(cleanStampCount) || cleanStampCount < 0) throw new Error("스탬프는 0개 이상이어야 합니다.");

  let menu = findMenuByName(cleanMenuName);
  if (!menu) {
    menu = {
      id: `mn${nextMenuId++}`,
      name: cleanMenuName,
      category: "간편추가",
      price: totalAmount,
      isActive: true
    };
    menus.push(menu);
  }

  const orderId = `o${nextOrderId++}`;
  const createdAt = new Date().toISOString();
  const order = {
    id: orderId,
    memberId: cleanMemberId,
    orderDate: createdAt,
    items: [
      {
        menuId: menu.id,
        quantity: 1,
        unitPrice: totalAmount,
        subtotal: totalAmount
      }
    ],
    totalAmount,
    status: "결제완료"
  };
  orders.push(order);

  payments.push({
    id: `p${nextPaymentId++}`,
    orderId,
    method: "간편입력",
    paidAmount: totalAmount,
    paidAt: createdAt,
    status: "완료"
  });

  if (cleanMemberId && cleanStampCount > 0) {
    stampLogs.push({
      id: `s${nextStampLogId++}`,
      memberId: cleanMemberId,
      orderId,
      type: "적립",
      count: cleanStampCount,
      createdAt
    });
    const member = getMember(cleanMemberId);
    if (member) member.stampBalance += cleanStampCount;
  }

  return hydrateOrder(order);
}

function listOrders() {
  return orders.slice().reverse().map(hydrateOrder);
}

function deleteOrder(id) {
  const order = orders.find((item) => item.id === id);
  if (!order) return;

  const relatedStampLogs = stampLogs.filter((log) => log.orderId === id);
  relatedStampLogs.forEach((log) => {
    const member = getMember(log.memberId);
    if (member) member.stampBalance -= log.count;
  });

  for (let i = stampLogs.length - 1; i >= 0; i -= 1) {
    if (stampLogs[i].orderId === id) stampLogs.splice(i, 1);
  }
  for (let i = payments.length - 1; i >= 0; i -= 1) {
    if (payments[i].orderId === id) payments.splice(i, 1);
  }
  const orderIndex = orders.findIndex((item) => item.id === id);
  if (orderIndex >= 0) orders.splice(orderIndex, 1);
}

function listStampLogs() {
  return stampLogs
    .slice()
    .reverse()
    .map((log) => ({
      ...log,
      member: getMember(log.memberId),
      order: log.orderId ? orders.find((order) => order.id === log.orderId) : null
    }));
}

module.exports = {
  money,
  formatDateTime,
  getDashboard,
  listMembers,
  addMember,
  deleteMember,
  listMenus,
  addMenu,
  updateMenu,
  deleteMenu,
  createOrder,
  createQuickEntry,
  listOrders,
  deleteOrder,
  listStampLogs
};
