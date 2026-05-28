import React, { useEffect, useMemo, useState } from "react";

const today = () => new Date().toISOString().slice(0, 10);
const storageKey = "jeongmu-settlement-tabs-v1";

const defaultProducts = [
  { id: 1, name: "테너지05", buyPrice: 63000, sellPrice: 0 },
  { id: 2, name: "MXP", buyPrice: 40000, sellPrice: 0 },
  { id: 3, name: "로제나", buyPrice: 28000, sellPrice: 0 },
];

function won(value) {
  return Number(value || 0).toLocaleString("ko-KR") + "원";
}

function koreanDate(value) {
  const d = value ? new Date(value) : new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function normalizeName(text) {
  return String(text || "").toLowerCase().replaceAll(" ", "").replaceAll("-", "");
}

function splitLines(text) {
  return String(text || "")
    .split(/
?
/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function App() {
  const [tab, setTab] = useState("settlement");
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState(defaultProducts);
  const [savedText, setSavedText] = useState("저장 준비");
  const [newProduct, setNewProduct] = useState({ name: "", buyPrice: "", sellPrice: "" });
  const [bulkBuyer, setBulkBuyer] = useState("");
  const [bulkText, setBulkText] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const data = JSON.parse(saved);
        if (Array.isArray(data.orders)) setOrders(data.orders);
        if (Array.isArray(data.products)) setProducts(data.products);
      }
      setSavedText("자동 저장");
    } catch (error) {
      console.error("저장 데이터 불러오기 실패", error);
      setSavedText("불러오기 실패");
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ orders, products }));
      setSavedText("저장됨");
      const timer = setTimeout(() => setSavedText("자동 저장"), 1000);
      return () => clearTimeout(timer);
    } catch (error) {
      console.error("자동 저장 실패", error);
      setSavedText("저장 실패");
    }
  }, [orders, products]);

  const productMap = useMemo(() => {
    return Object.fromEntries(products.map((product) => [product.name, product]));
  }, [products]);

  const calculatedOrders = useMemo(() => {
    return orders.map((order) => {
      const product = productMap[order.productName] || {};
      const qty = Number(order.qty || 0);
      const buyPrice = Number(product.buyPrice || 0);
      const sellPrice = Number(product.sellPrice || 0);
      const totalBuy = buyPrice * qty;
      const totalSell = sellPrice * qty;

      return {
        ...order,
        buyPrice,
        sellPrice,
        totalBuy,
        totalSell,
        profit: totalSell - totalBuy,
      };
    });
  }, [orders, productMap]);

  const totals = useMemo(() => {
    return calculatedOrders.reduce(
      (acc, order) => {
        acc.totalBuy += order.totalBuy;
        acc.totalSell += order.totalSell;
        acc.profit += order.profit;
        return acc;
      },
      { totalBuy: 0, totalSell: 0, profit: 0 }
    );
  }, [calculatedOrders]);

  function findBestProductName(rawName) {
    const target = normalizeName(rawName);
    const exact = products.find((product) => normalizeName(product.name) === target);
    if (exact) return exact.name;
    return rawName.trim();
  }

  function addOrder(productName = products[0]?.name || "") {
    setOrders((prev) => [
      {
        id: Date.now(),
        date: today(),
        buyer: "",
        productName,
        qty: 1,
      },
      ...prev,
    ]);
    setTab("settlement");
  }

  function parseBulkOrders() {
    const parsed = splitLines(bulkText)
      .map((line) => {
        const parts = line.replaceAll(",", " ").split(" ").filter(Boolean);
        if (parts.length < 2) return null;

        const last = parts[parts.length - 1];
        const qtyText = last
          .replaceAll("장", "")
          .replaceAll("개", "")
          .replaceAll("켤레", "")
          .replaceAll("벌", "")
          .replaceAll("자루", "")
          .replaceAll("박스", "")
          .replaceAll("통", "")
          .replaceAll("세트", "");

        const qty = Number(qtyText);
        const rawName = parts.slice(0, -1).join(" ");
        if (!rawName || !qty) return null;

        return {
          id: Date.now() + Math.random(),
          date: today(),
          buyer: bulkBuyer.trim(),
          productName: findBestProductName(rawName),
          qty,
        };
      })
      .filter(Boolean);

    if (parsed.length === 0) {
      alert("인식된 정산이 없습니다. 예: 테너지05 2장");
      return;
    }

    setOrders((prev) => [...parsed, ...prev]);
    setBulkBuyer("");
    setBulkText("");
    setTab("settlement");
  }

  function updateOrder(id, key, value) {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === id
          ? {
              ...order,
              [key]: key === "qty" ? Number(value || 0) : value,
            }
          : order
      )
    );
  }

  function deleteOrder(id) {
    setOrders((prev) => prev.filter((order) => order.id !== id));
  }

  function addProduct() {
    if (!newProduct.name.trim()) return;

    setProducts((prev) => [
      ...prev,
      {
        id: Date.now(),
        name: newProduct.name.trim(),
        buyPrice: Number(newProduct.buyPrice || 0),
        sellPrice: Number(newProduct.sellPrice || 0),
      },
    ]);

    setNewProduct({ name: "", buyPrice: "", sellPrice: "" });
  }

  function updateProduct(id, key, value) {
    setProducts((prev) =>
      prev.map((product) =>
        product.id === id
          ? {
              ...product,
              [key]: key === "name" ? value : Number(value || 0),
            }
          : product
      )
    );
  }

  function deleteProduct(id) {
    setProducts((prev) => prev.filter((product) => product.id !== id));
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-24 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        <header className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-violet-600">{koreanDate(today())}</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black">정무의 정산앱</h1>
              <p className="text-sm text-slate-500">용품관리 연결됨 · {savedText}</p>
            </div>
            <button
              onClick={() => addOrder()}
              className="rounded-2xl bg-violet-600 px-5 py-3 font-black text-white shadow-lg shadow-violet-200"
            >
              + 정산 추가
            </button>
          </div>
        </header>

        {tab === "settlement" ? (
          <SettlementPage
            products={products}
            calculatedOrders={calculatedOrders}
            totals={totals}
            addOrder={addOrder}
            bulkBuyer={bulkBuyer}
            setBulkBuyer={setBulkBuyer}
            bulkText={bulkText}
            setBulkText={setBulkText}
            parseBulkOrders={parseBulkOrders}
            updateOrder={updateOrder}
            deleteOrder={deleteOrder}
          />
        ) : (
          <ProductPage
            products={products}
            newProduct={newProduct}
            setNewProduct={setNewProduct}
            addProduct={addProduct}
            updateProduct={updateProduct}
            deleteProduct={deleteProduct}
          />
        )}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
          <TabButton active={tab === "settlement"} onClick={() => setTab("settlement")} label="정산" />
          <TabButton active={tab === "products"} onClick={() => setTab("products")} label="용품관리" />
        </div>
      </nav>
    </main>
  );
}

function SettlementPage({
  products,
  calculatedOrders,
  totals,
  addOrder,
  bulkBuyer,
  setBulkBuyer,
  bulkText,
  setBulkText,
  parseBulkOrders,
  updateOrder,
  deleteOrder,
}) {
  return (
    <>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard title="총 받는금액" value={won(totals.totalBuy)} />
        <SummaryCard title="총 판매금액" value={won(totals.totalSell)} />
        <SummaryCard title="총 정산금" value={won(totals.profit)} highlight />
      </section>

      <section className="rounded-3xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-black">대량 입력 자동정리</h2>
        <div className="space-y-2">
          <input
            value={bulkBuyer}
            onChange={(e) => setBulkBuyer(e.target.value)}
            placeholder="주문자명, 비워도 됨"
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none"
          />
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={"예시
테너지05 2장
테너지64 2장
MXP 4개"}
            rows={5}
            className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none"
          />
          <button
            onClick={parseBulkOrders}
            className="w-full rounded-2xl bg-violet-600 px-4 py-3 font-black text-white"
          >
            자동으로 정산 추가
          </button>
        </div>
      </section>

      <section className="rounded-3xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-black">정산 내역</h2>
          <button
            onClick={() => addOrder()}
            className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
          >
            추가
          </button>
        </div>

        {calculatedOrders.length === 0 ? (
          <div className="rounded-3xl bg-slate-50 p-8 text-center text-sm text-slate-500">
            아직 정산 내역이 없습니다. + 정산 추가를 눌러주세요.
          </div>
        ) : (
          <div className="space-y-3">
            {calculatedOrders.map((order) => (
              <article key={order.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <input
                    type="date"
                    value={order.date}
                    onChange={(e) => updateOrder(order.id, "date", e.target.value)}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                  />
                  <button
                    onClick={() => deleteOrder(order.id)}
                    className="rounded-2xl bg-rose-100 px-3 py-2 text-sm font-bold text-rose-600"
                  >
                    삭제
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <input
                    value={order.buyer}
                    onChange={(e) => updateOrder(order.id, "buyer", e.target.value)}
                    placeholder="주문자"
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none"
                  />
                  <select
                    value={order.productName}
                    onChange={(e) => updateOrder(order.id, "productName", e.target.value)}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none"
                  >
                    <option value="">용품 선택</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.name}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={order.qty}
                    onChange={(e) => updateOrder(order.id, "qty", e.target.value)}
                    placeholder="수량"
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none"
                  />
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-5">
                  <Info label="받는가격" value={won(order.buyPrice)} />
                  <Info label="판매가격" value={won(order.sellPrice)} />
                  <Info label="총 받는금액" value={won(order.totalBuy)} />
                  <Info label="총 판매금액" value={won(order.totalSell)} />
                  <Info label="정산금" value={won(order.profit)} green />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function ProductPage({ products, newProduct, setNewProduct, addProduct, updateProduct, deleteProduct }) {
  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-black">용품관리</h2>

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_0.7fr_0.7fr_auto]">
        <input
          value={newProduct.name}
          onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
          placeholder="용품명"
          className="rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none"
        />
        <input
          type="number"
          value={newProduct.buyPrice}
          onChange={(e) => setNewProduct({ ...newProduct, buyPrice: e.target.value })}
          placeholder="받는가격"
          className="rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none"
        />
        <input
          type="number"
          value={newProduct.sellPrice}
          onChange={(e) => setNewProduct({ ...newProduct, sellPrice: e.target.value })}
          placeholder="판매가격"
          className="rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none"
        />
        <button onClick={addProduct} className="rounded-2xl bg-violet-600 px-4 py-3 font-black text-white">
          추가
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <article key={product.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <input
                value={product.name}
                onChange={(e) => updateProduct(product.id, "name", e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 font-bold outline-none"
              />
              <button
                onClick={() => deleteProduct(product.id)}
                className="rounded-2xl bg-rose-100 px-3 py-3 text-sm font-bold text-rose-600"
              >
                삭제
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-bold text-slate-500">
                받는가격
                <input
                  type="number"
                  value={product.buyPrice}
                  onChange={(e) => updateProduct(product.id, "buyPrice", e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-slate-900 outline-none"
                />
              </label>
              <label className="text-xs font-bold text-slate-500">
                판매가격
                <input
                  type="number"
                  value={product.sellPrice}
                  onChange={(e) => updateProduct(product.id, "sellPrice", e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-slate-900 outline-none"
                />
              </label>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SummaryCard({ title, value, highlight }) {
  return (
    <div className={`rounded-3xl p-4 shadow-sm ${highlight ? "bg-violet-600 text-white" : "bg-white"}`}>
      <p className={`text-xs font-bold ${highlight ? "text-violet-100" : "text-slate-500"}`}>{title}</p>
      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  );
}

function Info({ label, value, green }) {
  return (
    <div className={`rounded-2xl p-3 ${green ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-800"}`}>
      <p className="text-xs font-bold opacity-60">{label}</p>
      <p className="mt-1 font-black">{value}</p>
    </div>
  );
}

function TabButton({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl px-4 py-3 text-sm font-black ${
        active ? "bg-violet-600 text-white shadow-lg shadow-violet-200" : "bg-slate-100 text-slate-500"
      }`}
    >
      {label}
    </button>
  );
}
