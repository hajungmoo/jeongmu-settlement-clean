import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";

const CLOUD_ID = "main";
const PASSWORD = "12345";

const defaultProducts = [
  { name: "테너지05", price: 79000 },
  { name: "테너지64", price: 79000 },
  { name: "디그닉스05", price: 89000 },
  { name: "디그닉스09C", price: 89000 },
  { name: "MXP", price: 52000 },
  { name: "MXK", price: 52000 },
  { name: "로제나", price: 45000 },
  { name: "오메가", price: 52000 },
  { name: "넥시시합구6구", price: 9000 },
  { name: "이너포스 ALC FL", price: 185000 },
  { name: "탁구화", price: 0 },
];

const ignoreWords = [
  "택배비",
  "총액",
  "전잔액",
  "입금",
  "잔액",
  "받았어요",
  "발주",
  "송금",
  "완료",
];

function App() {
  const [loggedIn, setLoggedIn] = useState(localStorage.getItem("loggedIn") === "yes");
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState("orders");
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState(defaultProducts);
  const [customer, setCustomer] = useState("");
  const [item, setItem] = useState("");
  const [color, setColor] = useState("");
  const [qty, setQty] = useState(1);
  const [memo, setMemo] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCloud();
    const channel = supabase
      .channel("app_data_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_data" },
        () => loadCloud()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  async function loadCloud() {
    const { data } = await supabase
      .from("app_data")
      .select("*")
      .eq("id", CLOUD_ID)
      .single();

    if (data?.data) {
      setOrders(data.data.orders || []);
      setProducts(data.data.products || defaultProducts);
    }
  }

  async function saveCloud(nextOrders = orders, nextProducts = products) {
    setSaving(true);
    await supabase.from("app_data").upsert({
      id: CLOUD_ID,
      data: {
        orders: nextOrders,
        products: nextProducts,
        updatedAt: new Date().toISOString(),
      },
    });
    setSaving(false);
  }

  function login(e) {
    e.preventDefault();
    if (password === PASSWORD) {
      localStorage.setItem("loggedIn", "yes");
      setLoggedIn(true);
    } else {
      alert("비밀번호가 틀렸습니다.");
    }
  }

  function getPrice(name) {
    return products.find((p) => p.name === name)?.price || 0;
  }

  function addOrder(order) {
    const next = [...orders];
    const found = next.find(
      (o) =>
        o.customer === order.customer &&
        o.item === order.item &&
        o.color === order.color &&
        !o.done
    );

    if (found) {
      found.qty = Number(found.qty) + Number(order.qty);
    } else {
      next.unshift({
        id: Date.now() + Math.random(),
        done: false,
        createdAt: new Date().toLocaleString(),
        ...order,
      });
    }

    setOrders(next);
    saveCloud(next, products);
  }

  function addManualOrder() {
    if (!customer || !item) return alert("주문자와 용품명을 입력하세요.");

    addOrder({
      customer,
      item,
      color,
      qty: Number(qty),
      price: getPrice(item),
      memo,
    });

    setItem("");
    setColor("");
    setQty(1);
    setMemo("");
  }

  function parseBulk() {
    if (!customer) return alert("주문자를 먼저 입력하세요.");

    const lines = bulkText
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean);

    let count = 0;

    lines.forEach((line) => {
      if (ignoreWords.some((w) => line.includes(w))) return;

      const product = products.find((p) =>
        line.replaceAll(" ", "").includes(p.name.replaceAll(" ", ""))
      );

      if (!product) return;

      const redMatch = line.match(/(적|빨강|레드)\s*(\d+)/);
      const blackMatch = line.match(/(검|검정|블랙)\s*(\d+)/);
      const normalMatch = line.match(/(\d+)\s*(장|개|족)?/);

      if (redMatch) {
        addOrder({
          customer,
          item: product.name,
          color: "적",
          qty: Number(redMatch[2]),
          price: product.price,
          memo: "카톡 자동입력",
        });
        count++;
      }

      if (blackMatch) {
        addOrder({
          customer,
          item: product.name,
          color: "검",
          qty: Number(blackMatch[2]),
          price: product.price,
          memo: "카톡 자동입력",
        });
        count++;
      }

      if (!redMatch && !blackMatch && normalMatch) {
        addOrder({
          customer,
          item: product.name,
          color: "",
          qty: Number(normalMatch[1]),
          price: product.price,
          memo: "카톡 자동입력",
        });
        count++;
      }
    });

    setBulkText("");
    alert(`${count}건 자동 추가 완료`);
  }

  function toggleDone(id) {
    const next = orders.map((o) => (o.id === id ? { ...o, done: !o.done } : o));
    setOrders(next);
    saveCloud(next, products);
  }

  function removeOrder(id) {
    if (!confirm("삭제할까요?")) return;
    const next = orders.filter((o) => o.id !== id);
    setOrders(next);
    saveCloud(next, products);
  }

  function addProduct() {
    const name = prompt("용품명");
    if (!name) return;
    const price = Number(prompt("가격") || 0);
    const next = [...products, { name, price }];
    setProducts(next);
    saveCloud(orders, next);
  }

  function removeProduct(name) {
    const next = products.filter((p) => p.name !== name);
    setProducts(next);
    saveCloud(orders, next);
  }

  function downloadBackup() {
    const blob = new Blob([JSON.stringify({ orders, products }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "핑퐁드림어스_전체백업.json";
    a.click();
  }

  function downloadCSV() {
    const rows = [
      ["주문자", "용품", "색상", "수량", "단가", "합계", "상태", "메모", "날짜"],
      ...orders.map((o) => [
        o.customer,
        o.item,
        o.color,
        o.qty,
        o.price,
        o.qty * o.price,
        o.done ? "완료" : "미완료",
        o.memo,
        o.createdAt,
      ]),
    ];

    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "핑퐁드림어스_정산.csv";
    a.click();
  }

  const total = useMemo(
    () => orders.reduce((sum, o) => sum + Number(o.qty) * Number(o.price), 0),
    [orders]
  );

  if (!loggedIn) {
    return (
      <div className="min-h-screen relative flex items-center justify-center bg-black overflow-hidden">
        <img
          src="/dragon.png"
          className="absolute inset-0 w-full h-full object-cover opacity-95"
        />
        <div className="absolute inset-0 bg-black/55" />

        <form
          onSubmit={login}
          className="relative z-10 w-[90%] max-w-sm rounded-3xl border border-yellow-500/40 bg-black/75 p-8 shadow-2xl shadow-yellow-700/30 text-center"
        >
          <h1 className="text-4xl font-black text-yellow-400 tracking-tight">
            핑퐁드림어스
          </h1>
          <p className="mt-2 text-yellow-100/80">주문 시스템</p>

          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-8 w-full rounded-xl bg-black border border-yellow-500/50 px-4 py-3 text-yellow-100 outline-none focus:border-yellow-300"
          />

          <button className="mt-4 w-full rounded-xl bg-gradient-to-r from-yellow-600 to-yellow-300 py-3 font-black text-black">
            입장하기
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-yellow-50 p-4">
      <header className="max-w-6xl mx-auto mb-5 rounded-3xl border border-yellow-500/30 bg-gradient-to-r from-black via-[#171100] to-black p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black text-yellow-400">핑퐁드림어스</h1>
            <p className="text-yellow-100/60">보스 관리자 주문 · 정산 시스템</p>
          </div>

          <div className="flex gap-2">
            <button onClick={downloadCSV} className="goldBtn">CSV</button>
            <button onClick={downloadBackup} className="goldBtn">백업</button>
            <button
              onClick={() => {
                localStorage.removeItem("loggedIn");
                setLoggedIn(false);
              }}
              className="darkBtn"
            >
              로그아웃
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat title="총 주문" value={`${orders.length}건`} />
          <Stat title="미완료" value={`${orders.filter((o) => !o.done).length}건`} />
          <Stat title="완료" value={`${orders.filter((o) => o.done).length}건`} />
          <Stat title="총 금액" value={`${total.toLocaleString()}원`} />
        </div>
      </header>

      <main className="max-w-6xl mx-auto">
        <nav className="grid grid-cols-3 gap-2 mb-4">
          {[
            ["orders", "정산내역"],
            ["bulk", "대량입력"],
            ["products", "용품관리"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`rounded-2xl py-3 font-black border ${
                activeTab === key
                  ? "bg-yellow-400 text-black border-yellow-300"
                  : "bg-black text-yellow-300 border-yellow-500/30"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {saving && <p className="mb-3 text-sm text-yellow-300">클라우드 저장중...</p>}

        {activeTab === "orders" && (
          <>
            <section className="bossCard mb-4">
              <h2 className="bossTitle">주문 추가</h2>
              <div className="grid md:grid-cols-6 gap-2">
                <input className="bossInput" placeholder="주문자" value={customer} onChange={(e) => setCustomer(e.target.value)} />
                <select className="bossInput" value={item} onChange={(e) => setItem(e.target.value)}>
                  <option value="">용품 선택</option>
                  {products.map((p) => <option key={p.name}>{p.name}</option>)}
                </select>
                <input className="bossInput" placeholder="색상" value={color} onChange={(e) => setColor(e.target.value)} />
                <input className="bossInput" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
                <input className="bossInput" placeholder="메모" value={memo} onChange={(e) => setMemo(e.target.value)} />
                <button onClick={addManualOrder} className="goldBtn">추가</button>
              </div>
            </section>

            <OrderTable orders={orders} toggleDone={toggleDone} removeOrder={removeOrder} />
          </>
        )}

        {activeTab === "bulk" && (
          <section className="bossCard">
            <h2 className="bossTitle">카톡 복붙 자동정리</h2>
            <input
              className="bossInput mb-3"
              placeholder="주문자 이름"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
            />
            <textarea
              className="bossInput h-72"
              placeholder={`예시)
MXP 적 3 검 1
테너지05검1
디그닉스 05 적 1
넥시시합구6구 2개`}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            <button onClick={parseBulk} className="goldBtn mt-3 w-full">
              자동 정산 추가
            </button>
          </section>
        )}

        {activeTab === "products" && (
          <section className="bossCard">
            <div className="flex justify-between items-center mb-3">
              <h2 className="bossTitle">용품관리</h2>
              <button onClick={addProduct} className="goldBtn">용품 추가</button>
            </div>

            <div className="grid gap-2">
              {products.map((p) => (
                <div key={p.name} className="flex justify-between items-center rounded-xl border border-yellow-500/20 bg-black/50 p-3">
                  <div>
                    <p className="font-black text-yellow-300">{p.name}</p>
                    <p className="text-sm text-yellow-100/60">{p.price.toLocaleString()}원</p>
                  </div>
                  <button onClick={() => removeProduct(p.name)} className="darkBtn">삭제</button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Stat({ title, value }) {
  return (
    <div className="rounded-2xl border border-yellow-500/20 bg-black/60 p-4">
      <p className="text-sm text-yellow-100/50">{title}</p>
      <p className="text-2xl font-black text-yellow-300">{value}</p>
    </div>
  );
}

function OrderTable({ orders, toggleDone, removeOrder }) {
  return (
    <section className="bossCard overflow-x-auto">
      <h2 className="bossTitle">정산 내역</h2>
      <table className="w-full min-w-[850px] text-sm">
        <thead className="text-yellow-300 border-b border-yellow-500/30">
          <tr>
            <th className="p-2">상태</th>
            <th className="p-2">주문자</th>
            <th className="p-2">용품</th>
            <th className="p-2">색상</th>
            <th className="p-2">수량</th>
            <th className="p-2">단가</th>
            <th className="p-2">합계</th>
            <th className="p-2">메모</th>
            <th className="p-2">관리</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className={`border-b border-yellow-500/10 ${o.done ? "opacity-45" : ""}`}>
              <td className="p-2 text-center">
                <button onClick={() => toggleDone(o.id)} className={o.done ? "goldBtn" : "darkBtn"}>
                  {o.done ? "완료" : "미완료"}
                </button>
              </td>
              <td className="p-2">{o.customer}</td>
              <td className="p-2 text-yellow-300 font-bold">{o.item}</td>
              <td className="p-2">{o.color}</td>
              <td className="p-2 text-center">{o.qty}</td>
              <td className="p-2 text-right">{Number(o.price).toLocaleString()}</td>
              <td className="p-2 text-right font-black text-yellow-300">
                {(Number(o.qty) * Number(o.price)).toLocaleString()}
              </td>
              <td className="p-2">{o.memo}</td>
              <td className="p-2 text-center">
                <button onClick={() => removeOrder(o.id)} className="darkBtn">삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default App;
