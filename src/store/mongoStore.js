const dns = require("dns");
const { MongoClient } = require("mongodb");

if (process.env.MONGODB_DNS_SERVERS) {
  dns.setServers(process.env.MONGODB_DNS_SERVERS
    .split(",")
    .map((server) => server.trim())
    .filter(Boolean));
}

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "cafe_stamp_db";

let client;
let db;
let initialized = false;

const seedMembers = [
  { id: "m1", name: "김민수", phone: "010-1234-5678", joinDate: "2026-05-20", stampBalance: 8 },
  { id: "m2", name: "이지은", phone: "010-2222-3344", joinDate: "2026-06-01", stampBalance: 4 },
  { id: "m3", name: "박서준", phone: "010-7777-0909", joinDate: "2026-06-10", stampBalance: 11 }
];

const seedMenus = [
  { id: "mn1", name: "아메리카노", category: "커피", price: 3500, isActive: true },
  { id: "mn2", name: "카페라떼", category: "커피", price: 4500, isActive: true },
  { id: "mn3", name: "바닐라라떼", category: "커피", price: 5000, isActive: true },
  { id: "mn4", name: "초코라떼", category: "논커피", price: 4800, isActive: true },
  { id: "mn5", name: "레몬에이드", category: "에이드", price: 5200, isActive: true },
  { id: "mn6", name: "치즈케이크", category: "디저트", price: 6200, isActive: true },
  { id: "mn7", name: "소금빵", category: "디저트", price: 3200, isActive: true }
];

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function seedOrders() {
  const today = todayString();
  return [
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
      items: [{ menuId: "mn5", quantity: 2, unitPrice: 5200, subtotal: 10400 }],
      totalAmount: 10400,
      status: "결제완료"
    }
  ];
}

function seedPayments() {
  const today = todayString();
  return [
    { id: "p1", orderId: "o1", method: "카드", paidAmount: 10200, paidAt: `${today}T09:21:00`, status: "완료" },
    { id: "p2", orderId: "o2", method: "간편결제", paidAmount: 10700, paidAt: `${today}T12:06:00`, status: "완료" },
    { id: "p3", orderId: "o3", method: "현금", paidAmount: 10400, paidAt: `${today}T14:31:00`, status: "완료" }
  ];
}

function seedStampLogs() {
  const today = todayString();
  return [
    { id: "s1", memberId: "m1", orderId: "o1", type: "적립", count: 2, createdAt: `${today}T09:21:00` },
    { id: "s2", memberId: "m2", orderId: "o2", type: "적립", count: 2, createdAt: `${today}T12:06:00` },
    { id: "s3", memberId: "m3", orderId: null, type: "사용", count: -10, createdAt: "2026-06-15T10:00:00" },
    { id: "s4", memberId: "m3", orderId: null, type: "관리자조정", count: 1, createdAt: "2026-06-16T18:20:00" }
  ];
}

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

function collection(name) {
  return db.collection(name);
}

async function connect() {
  if (!uri || uri.includes("<db_password>")) {
    throw new Error(".env의 MONGODB_URI에서 <db_password>를 실제 MongoDB 비밀번호로 바꿔야 합니다.");
  }
  if (client) return db;
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  await initialize();
  return db;
}

async function initialize() {
  if (initialized) return;
  await collection("counters").createIndex({ key: 1 }, { unique: true });
  await collection("members").createIndex({ id: 1 }, { unique: true });
  await collection("menus").createIndex({ id: 1 }, { unique: true });
  await collection("orders").createIndex({ id: 1 }, { unique: true });
  await collection("payments").createIndex({ id: 1 }, { unique: true });
  await collection("stampLogs").createIndex({ id: 1 }, { unique: true });

  if ((await collection("members").countDocuments()) === 0) {
    await collection("members").insertMany(seedMembers);
    await collection("menus").insertMany(seedMenus);
    await collection("orders").insertMany(seedOrders());
    await collection("payments").insertMany(seedPayments());
    await collection("stampLogs").insertMany(seedStampLogs());
    await collection("counters").insertMany([
      { key: "member", value: 4 },
      { key: "menu", value: 8 },
      { key: "order", value: 4 },
      { key: "payment", value: 4 },
      { key: "stampLog", value: 5 }
    ]);
  }
  initialized = true;
}

async function nextId(key, prefix) {
  const result = await collection("counters").findOneAndUpdate(
    { key },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "before" }
  );
  const value = typeof result?.value === "number" ? result.value : result?.value?.value || 1;
  return `${prefix}${value}`;
}

async function getMember(id) {
  if (!id) return null;
  return collection("members").findOne({ id }, { projection: { _id: 0 } });
}

async function getMenu(id) {
  if (!id) return null;
  return collection("menus").findOne({ id }, { projection: { _id: 0 } });
}

async function findMenuByName(name) {
  return collection("menus").findOne({ name: { $regex: `^${escapeRegExp(name.trim())}$`, $options: "i" } }, { projection: { _id: 0 } });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function hydrateOrder(order) {
  const [member, payment, logs] = await Promise.all([
    getMember(order.memberId),
    collection("payments").findOne({ orderId: order.id }, { projection: { _id: 0 } }),
    collection("stampLogs").find({ orderId: order.id }).project({ _id: 0 }).toArray()
  ]);
  const items = await Promise.all(order.items.map(async (item) => ({
    ...item,
    menu: (await getMenu(item.menuId)) || { name: "삭제된 메뉴", category: "-", price: item.unitPrice }
  })));
  return {
    ...order,
    memberName: member ? member.name : "비회원",
    payment,
    stampCount: logs.reduce((sum, log) => sum + log.count, 0),
    items
  };
}

async function getDashboard() {
  const today = todayString();
  const [orders, members, menus] = await Promise.all([
    collection("orders").find({}).project({ _id: 0 }).toArray(),
    collection("members").find({}).project({ _id: 0 }).toArray(),
    collection("menus").find({}).project({ _id: 0 }).toArray()
  ]);
  const todayOrders = orders.filter((order) => order.orderDate.startsWith(today));
  const sales = todayOrders.filter((order) => order.status === "결제완료").reduce((sum, order) => sum + order.totalAmount, 0);
  const menuCount = new Map();
  orders.forEach((order) => {
    order.items.forEach((item) => menuCount.set(item.menuId, (menuCount.get(item.menuId) || 0) + item.quantity));
  });
  const popularMenus = await Promise.all([...menuCount.entries()]
    .map(async ([menuId, count]) => ({ menu: await getMenu(menuId), count })));
  const recentOrders = await Promise.all(orders
    .slice()
    .sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate))
    .slice(0, 5)
    .map(hydrateOrder));
  return {
    todayOrderCount: todayOrders.length,
    sales,
    memberCount: members.length,
    menuCount: menus.length,
    recentMenus: menus.slice().reverse().slice(0, 5),
    totalStamps: members.reduce((sum, member) => sum + member.stampBalance, 0),
    popularMenus: popularMenus.filter((item) => item.menu).sort((a, b) => b.count - a.count).slice(0, 5),
    recentOrders
  };
}

async function listMembers(query = "") {
  const normalized = query.trim();
  const filter = normalized
    ? { $or: [{ name: { $regex: escapeRegExp(normalized), $options: "i" } }, { phone: { $regex: escapeRegExp(normalized), $options: "i" } }] }
    : {};
  return collection("members").find(filter).project({ _id: 0 }).sort({ joinDate: -1, id: 1 }).toArray();
}

async function addMember({ name, phone }) {
  const member = {
    id: await nextId("member", "m"),
    name: name.trim(),
    phone: phone.trim(),
    joinDate: new Date().toISOString().slice(0, 10),
    stampBalance: 0
  };
  await collection("members").insertOne(member);
  return member;
}

async function deleteMember(id) {
  await collection("members").deleteOne({ id });
}

async function listMenus() {
  return collection("menus").find({}).project({ _id: 0 }).sort({ category: 1, name: 1 }).toArray();
}

async function addMenu({ name, category, price }) {
  const menu = {
    id: await nextId("menu", "mn"),
    name: name.trim(),
    category: category.trim(),
    price: Number(price),
    isActive: true
  };
  await collection("menus").insertOne(menu);
  return menu;
}

async function updateMenu(id, { name, category, price, isActive }) {
  await collection("menus").updateOne(
    { id },
    { $set: { name: name.trim(), category: category.trim(), price: Number(price), isActive: isActive === "on" || isActive === true } }
  );
}

async function deleteMenu(id) {
  await collection("menus").deleteOne({ id });
}

async function createOrder({ memberId, method, quantities }) {
  const entries = await Promise.all(Object.entries(quantities).map(async ([menuId, quantity]) => ({
    menu: await getMenu(menuId),
    quantity: Number(quantity)
  })));
  const items = entries
    .filter((item) => item.menu && item.menu.isActive && item.quantity > 0)
    .map((item) => ({
      menuId: item.menu.id,
      quantity: item.quantity,
      unitPrice: item.menu.price,
      subtotal: item.menu.price * item.quantity
    }));
  if (items.length === 0) throw new Error("주문할 메뉴를 1개 이상 선택해야 합니다.");

  const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);
  const orderId = await nextId("order", "o");
  const paymentId = await nextId("payment", "p");
  const createdAt = new Date().toISOString();
  const cleanMemberId = memberId && memberId !== "guest" ? memberId : null;
  const order = { id: orderId, memberId: cleanMemberId, orderDate: createdAt, items, totalAmount, status: "결제완료" };
  await collection("orders").insertOne(order);
  await collection("payments").insertOne({ id: paymentId, orderId, method, paidAmount: totalAmount, paidAt: createdAt, status: "완료" });

  if (cleanMemberId) {
    const stampCount = Math.floor(totalAmount / 5000);
    if (stampCount > 0) {
      await collection("stampLogs").insertOne({ id: await nextId("stampLog", "s"), memberId: cleanMemberId, orderId, type: "적립", count: stampCount, createdAt });
      await collection("members").updateOne({ id: cleanMemberId }, { $inc: { stampBalance: stampCount } });
    }
  }
  return hydrateOrder(order);
}

async function createQuickEntry({ memberId, menuName, amount, stampCount }) {
  const cleanMenuName = menuName.trim();
  const totalAmount = Number(amount);
  const cleanStampCount = Number(stampCount || 0);
  const cleanMemberId = memberId && memberId !== "guest" ? memberId : null;
  if (!cleanMenuName) throw new Error("메뉴명을 입력해야 합니다.");
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) throw new Error("금액은 1원 이상이어야 합니다.");
  if (!Number.isFinite(cleanStampCount) || cleanStampCount < 0) throw new Error("스탬프는 0개 이상이어야 합니다.");

  let menu = await findMenuByName(cleanMenuName);
  if (!menu) {
    menu = { id: await nextId("menu", "mn"), name: cleanMenuName, category: "간편추가", price: totalAmount, isActive: true };
    await collection("menus").insertOne(menu);
  }

  const orderId = await nextId("order", "o");
  const paymentId = await nextId("payment", "p");
  const createdAt = new Date().toISOString();
  const order = {
    id: orderId,
    memberId: cleanMemberId,
    orderDate: createdAt,
    items: [{ menuId: menu.id, quantity: 1, unitPrice: totalAmount, subtotal: totalAmount }],
    totalAmount,
    status: "결제완료"
  };
  await collection("orders").insertOne(order);
  await collection("payments").insertOne({ id: paymentId, orderId, method: "간편입력", paidAmount: totalAmount, paidAt: createdAt, status: "완료" });
  if (cleanMemberId && cleanStampCount > 0) {
    await collection("stampLogs").insertOne({ id: await nextId("stampLog", "s"), memberId: cleanMemberId, orderId, type: "적립", count: cleanStampCount, createdAt });
    await collection("members").updateOne({ id: cleanMemberId }, { $inc: { stampBalance: cleanStampCount } });
  }
  return hydrateOrder(order);
}

async function listOrders() {
  const orders = await collection("orders").find({}).project({ _id: 0 }).sort({ orderDate: -1 }).toArray();
  return Promise.all(orders.map(hydrateOrder));
}

async function deleteOrder(id) {
  const logs = await collection("stampLogs").find({ orderId: id }).project({ _id: 0 }).toArray();
  await Promise.all(logs.map((log) => collection("members").updateOne({ id: log.memberId }, { $inc: { stampBalance: -log.count } })));
  await collection("stampLogs").deleteMany({ orderId: id });
  await collection("payments").deleteMany({ orderId: id });
  await collection("orders").deleteOne({ id });
}

async function listStampLogs() {
  const logs = await collection("stampLogs").find({}).project({ _id: 0 }).sort({ createdAt: -1 }).toArray();
  return Promise.all(logs.map(async (log) => ({
    ...log,
    member: await getMember(log.memberId),
    order: log.orderId ? await collection("orders").findOne({ id: log.orderId }, { projection: { _id: 0 } }) : null
  })));
}

module.exports = {
  money,
  formatDateTime,
  connect,
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
