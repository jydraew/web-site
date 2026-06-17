const dns = require("dns");
const { MongoClient } = require("mongodb");
const { loadEnv } = require("../src/env");

dns.setServers(["168.126.63.1", "8.8.8.8"]);
loadEnv();

const menus = [
  { id: "mn1", name: "아메리카노", category: "커피", price: 3500, isActive: true },
  { id: "mn2", name: "카페라떼", category: "커피", price: 4500, isActive: true },
  { id: "mn3", name: "바닐라라떼", category: "커피", price: 5000, isActive: true },
  { id: "mn4", name: "초코라떼", category: "논커피", price: 4800, isActive: true },
  { id: "mn5", name: "레몬에이드", category: "에이드", price: 5200, isActive: true },
  { id: "mn6", name: "치즈케이크", category: "디저트", price: 6200, isActive: true },
  { id: "mn7", name: "소금빵", category: "디저트", price: 3200, isActive: true }
];

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "cafe_stamp_db");

  for (const menu of menus) {
    await db.collection("menus").updateOne(
      { id: menu.id },
      { $setOnInsert: menu },
      { upsert: true }
    );
  }

  const restored = await db.collection("menus")
    .find({ id: { $in: menus.map((menu) => menu.id) } })
    .project({ _id: 0, id: 1, name: 1, price: 1 })
    .sort({ id: 1 })
    .toArray();

  console.log(JSON.stringify(restored, null, 2));
  await client.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
