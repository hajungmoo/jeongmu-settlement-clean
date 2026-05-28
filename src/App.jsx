import React, { useEffect, useMemo, useState } from "react";

const today = () => new Date().toISOString().slice(0, 10);
const storageKey = "jeongmu-settlement-basic-v1";

function won(value) {
  return Number(value || 0).toLocaleString("ko-KR") + "원";
}

function koreanDate(value) {
  const d = value ? new Date(value) : new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export default function App() {
  const [orders, setOrders] = useState([]);
  const [savedText, setSavedText] = useState("저장 준비");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const data = JSON.parse(saved);
        if (Array.isArray(data.orders)) setOrders(data.orders);
      }
      setSavedText("자동 저장");
    } catch (error) {
      console.error("저장 데이터 불러오기 실패", error);
      setSavedText("불러오기 실패");
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ orders }));
      setSavedText("저장됨");
      const timer = setTimeout(() => setSavedText("자동 저장"), 1000);
      return () => clearTimeout(timer);
    } catch (error) {
      console.error("자동 저장 실패", error);
      setSavedText("저장 실패");
    }
  }, [orders]);

  function addOrder() {
    setOrders((prev) => [
      {
        id: Date.now(),
        date: today(),
        buyer: "",
        productName: "",
        qty: 1,
        buyPrice: 0,
        sellPrice: 0,
      },
      ...prev,
    ]);
  }

  function updateOrder(id, key, value) {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === id
          ? {
              ...order,
              [key]: ["qty", "buyPrice", "sellPrice"].includes(key) ? Number(value || 0) : value,
            }
          : order
      )
    );
  }

  function deleteOrder(id) {
    setOrders((prev) => prev.filter((order) => order.id !== id));
  }

  const calculatedOrders = orders.map((order) => {
    const totalBuy = Number(order.buyPrice || 0) * Number(order.qty || 0);
    const totalSell = Number(order.sellPrice || 0) * Number(order.qty || 0);
    return {
      ...order,
      totalBuy,
      totalSell,
      profit: totalSell - totalBuy,
    };
  });

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

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-900">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-violet-600">{koreanDate(today())}</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black">정무의 정산앱</h1>
              <p className="text-sm text-slate-500">2단계: 자동 저장 적용 · {savedText}</p>
            </div>
            <button
              onClick={addOrder}
              className="rounded-2xl bg-violet-600 px-5 py-3 font-black text-white shadow-lg shadow-violet-200"
            >
              + 정산 추가
            </button>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard title="총 받는금액" value={won(totals.totalBuy)} />
          <SummaryCard title="총 판매금액" value={won(totals.totalSell)} />
          <SummaryCard title="총 정산금" value={won(totals.profit)} highlight />
        </section>

        <section className="rounded-3xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-black">정산 내역</h2>

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

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                    <input
                      value={order.buyer}
                      onChange={(e) => updateOrder(order.id, "buyer", e.target.value)}
                      placeholder="주문자"
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none"
                    />
                    <input
                      value={order.productName}
                      onChange={(e) => updateOrder(order.id, "productName", e.target.value)}
                      placeholder="용품명"
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none"
                    />
                    <input
                      type="number"
                      value={order.qty}
                      onChange={(e) => updateOrder(order.id, "qty", e.target.value)}
                      placeholder="수량"
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none"
                    />
                    <input
                      type="number"
                      value={order.buyPrice}
                      onChange={(e) => updateOrder(order.id, "buyPrice", e.target.value)}
                      placeholder="받는가격"
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none"
                    />
                    <input
                      type="number"
                      value={order.sellPrice}
                      onChange={(e) => updateOrder(order.id, "sellPrice", e.target.value)}
                      placeholder="판매가격"
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none"
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                    <Info label="총 받는금액" value={won(order.totalBuy)} />
                    <Info label="총 판매금액" value={won(order.totalSell)} />
                    <Info label="정산금" value={won(order.profit)} green />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
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
