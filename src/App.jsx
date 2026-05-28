import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";

const today = () => new Date().toISOString().slice(0, 10);
const storageKey = "jeongmu-settlement-tabs-v2";
const loginStorageKey = "jeongmu-settlement-login-ok";
const appPassword = "12345";
const cloudRowId = "main";

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
    .split(String.fromCharCode(10))
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function App() {
  const [isUnlocked, setIsUnlocked] = useState(() => localStorage.getItem(loginStorageKey) === "yes");
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState("settlement");
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState(defaultProducts);
  const [savedText, setSavedText] = useState("저장 준비");
  const [newProduct, setNewProduct] = useState({ name: "", buyPrice: "", sellPrice: "" });
  const [bulkBuyer, setBulkBuyer] = useState("");
  const [bulkText, setBulkText] = useState("");

  useEffect(() => {
    async function loadCloudData() {
      try {
        setSavedText("불러오는 중");

        const { data, error } = await supabase
          .from("app_data")
          .select("data")
          .eq("id", cloudRowId)
          .single();

        if (error) throw error;

        if (data?.data) {
          if (Array.isArray(data.data.orders)) setOrders(data.data.orders);
          if (Array.isArray(data.data.products) && data.data.products.length > 0) {
            setProducts(data.data.products);
          }
        }

        setSavedText("클라우드 연결됨");
      } catch (error) {
        console.error("클라우드 불러오기 실패", error);
        setSavedText("클라우드 실패 · 기기 저장");

        try {
          const saved = localStorage.getItem(storageKey);
          if (saved) {
            const localData = JSON.parse(saved);
            if (Array.isArray(localData.orders)) setOrders(localData.orders);
            if (Array.isArray(localData.products)) setProducts(localData.products);
          }
        } catch (localError) {
          console.error("기기 저장 불러오기 실패", localError);
        }
      }
    }

    loadCloudData();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("app-data-live")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "app_data",
          filter: `id=eq.${cloudRowId}`,
        },
        (payload) => {
          const cloudData = payload.new?.data;
          if (!cloudData) return;

          if (Array.isArray(cloudData.orders)) setOrders(cloudData.orders);
          if (Array.isArray(cloudData.products) && cloudData.products.length > 0) {
            setProducts(cloudData.products);
          }

          setSavedText("실시간 반영됨");
          setTimeout(() => setSavedText("자동 저장"), 1000);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setSavedText("실시간 연결됨");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const payload = { orders, products };
        localStorage.setItem(storageKey, JSON.stringify(payload));

        const { error } = await supabase
          .from("app_data")
          .upsert({ id: cloudRowId, data: payload, updated_at: new Date().toISOString() });

        if (error) throw error;

        setSavedText("클라우드 저장됨");
        setTimeout(() => setSavedText("자동 저장"), 1000);
      } catch (error) {
        console.error("클라우드 저장 실패", error);
        setSavedText("기기 저장됨 · 클라우드 실패");
      }
    }, 700);

    return () => clearTimeout(timer);
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
      return { ...order, buyPrice, sellPrice, totalBuy, totalSell, profit: totalSell - totalBuy };
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
      { id: Date.now(), date: today(), buyer: "", productName, qty: 1, done: false },
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
          done: false,
        };
      })
      .filter(Boolean);

    if (parsed.length === 0) {
      alert("인식된 정산이 없습니다. 예: 테너지05 2장");
      return;
    }

    setOrders((prev) => {
  const next = [...prev];

  parsed.forEach((item) => {
    const index = next.findIndex(
      (order) =>
        order.productName === item.productName &&
        order.buyer === item.buyer &&
        order.done === false
    );

    if (index >= 0) {
      next[index] = {
        ...next[index],
        qty: Number(next[index].qty || 0) + Number(item.qty || 0),
      };
    } else {
      next.unshift(item);
    }
  });

  return next;
});
    setBulkBuyer("");
    setBulkText("");
    setTab("settlement");
  }

  function updateOrder(id, key, value) {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === id ? { ...order, [key]: key === "qty" ? Number(value || 0) : value } : order
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
        product.id === id ? { ...product, [key]: key === "name" ? value : Number(value || 0) } : product
      )
    );
  }

  function deleteProduct(id) {
    setProducts((prev) => prev.filter((product) => product.id !== id));
  }

  function downloadExcelCsv() {
    const headers = ["날짜", "주문자", "용품명", "수량", "받는가격", "판매가격", "총받는가격", "총판매금액", "정산금", "완료여부"];
    const rows = calculatedOrders.map((order) => [
      koreanDate(order.date),
      order.buyer || "",
      order.productName || "",
      order.qty || 0,
      order.buyPrice || 0,
      order.sellPrice || 0,
      order.totalBuy || 0,
      order.totalSell || 0,
      order.profit || 0,
      order.done ? "완료" : "미완료",
    ]);
    const summaryRows = [[], ["합계", "", "", "", "", "", totals.totalBuy, totals.totalSell, totals.profit, ""]];
    const escapeCsv = (value) => `"${String(value).replaceAll('"', '""')}"`;
    const csvContent = [headers, ...rows, ...summaryRows]
      .map((row) => row.map(escapeCsv).join(","))
      .join(String.fromCharCode(10));
    const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `핑퐁드림어스_정산파일_${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleLogin(event) {
    event.preventDefault();
    if (passwordInput === appPassword) {
      localStorage.setItem(loginStorageKey, "yes");
      setIsUnlocked(true);
      setLoginError("");
      setPasswordInput("");
    } else {
      setLoginError("비밀번호가 맞지 않습니다.");
    }
  }

  function handleLogout() {
    localStorage.removeItem(loginStorageKey);
    setIsUnlocked(false);
    setPasswordInput("");
  }

if (!isUnlocked) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050505] p-4 text-slate-100">

      {/* 배경 */}
      <div className="pointer-events-none absolute inset-0">
        
        <img
  src="./dragon.png"
  alt="dragon"
  className="absolute left-1/2 top-1/2 w-[1100px] -translate-x-1/2 -translate-y-1/2 opacity-20 select-none"
/>
        {/* 황금 용 느낌 */}
        <div className="absolute left-1/2 top-1/2 h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-yellow-500/10 shadow-[0_0_180px_rgba(245,158,11,0.18)]" />

        <div className="absolute left-1/2 top-[45%] h-[460px] w-[1000px] -translate-x-1/2 -translate-y-1/2 rotate-[-14deg] rounded-full border-[24px] border-yellow-500/10" />

        <div className="absolute left-[10%] top-[10%] h-80 w-80 rounded-full bg-yellow-500/5 blur-3xl" />

        <div className="absolute bottom-[8%] right-[8%] h-[420px] w-[420px] rounded-full bg-amber-500/5 blur-3xl" />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_rgba(0,0,0,0.45)_50%,_rgba(0,0,0,0.95)_100%)]" />
      </div>

      {/* 로그인 카드 */}
      <form
        onSubmit={handleLogin}
        className="relative z-10 w-full max-w-md rounded-[1.2rem] border border-yellow-500/20 bg-[#050505]/92 p-10 shadow-[0_0_80px_rgba(245,158,11,0.12)] backdrop-blur-xl"
      >

        {/* 로고 */}
        <div className="mb-6 flex items-center justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-yellow-500/20 bg-gradient-to-br from-[#f6d365] via-[#d4a017] to-[#b8860b] text-3xl font-black text-black shadow-lg shadow-yellow-500/10">
            DR
          </div>
        </div>

        {/* 제목 */}
        <div className="text-center">

          <h1 className="bg-gradient-to-b from-yellow-100 via-[#f6d365] to-[#b8860b] bg-clip-text text-5xl font-black tracking-wide text-transparent">
            핑퐁드림어스
          </h1>

          <p className="mt-3 text-xl font-semibold tracking-[0.25em] text-yellow-500/70">
            ORDER SYSTEM
          </p>

        </div>

        {/* 라인 */}
        <div className="my-8 flex items-center gap-3">
          <div className="h-px flex-1 bg-yellow-500/15" />
          <span className="text-yellow-500/40">◆</span>
          <div className="h-px flex-1 bg-yellow-500/15" />
        </div>

        {/* 설명 */}
        <p className="mb-4 text-center text-sm text-slate-400">
          비밀번호를 입력해주세요
        </p>

        {/* 입력 */}
        <input
          type="password"
          value={passwordInput}
          onChange={(e) => setPasswordInput(e.target.value)}
          placeholder="PASSWORD"
          className="w-full rounded-xl border border-yellow-500/20 bg-black/70 px-5 py-4 text-center text-lg font-bold tracking-[0.2em] text-yellow-100 outline-none placeholder:text-slate-600 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-500/10"
        />

        {/* 에러 */}
        {loginError && (
          <p className="mt-3 text-center text-sm font-bold text-rose-400">
            {loginError}
          </p>
        )}

        {/* 버튼 */}
        <button
          type="submit"
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-[#f6d365] via-[#d4a017] to-[#b8860b] px-5 py-4 text-lg font-black tracking-wide text-black shadow-lg shadow-yellow-500/10 transition hover:scale-[1.01] active:scale-95"
        >
          로그인
        </button>

      </form>
    </main>
  );
}

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#7c3aed55,_transparent_32%),radial-gradient(circle_at_top_right,_#06b6d455,_transparent_30%),radial-gradient(circle_at_bottom,_#ec489955,_transparent_35%),linear-gradient(135deg,_#020617,_#111827,_#1e1b4b)] pb-28 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-5 p-4">
       <header className="relative overflow-hidden rounded-[2rem] border border-slate-700 bg-gradient-to-br from-[#111827] via-[#172033] to-[#1e293b] p-6 text-slate-100 shadow-xl shadow-black/30">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-400/25 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-fuchsia-500/25 blur-3xl" />
          <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-400/20 blur-3xl" />

          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100 shadow-sm backdrop-blur">
                {koreanDate(today())}
              </span>
              <div className="flex gap-2">
                <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-bold text-emerald-100 shadow-sm">
                  {savedText}
                </span>
                <button
                  onClick={handleLogout}
                  className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold text-white shadow-sm backdrop-blur transition hover:bg-white/20"
                >
                  로그아웃
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-sm font-bold text-cyan-100 backdrop-blur">Pingpong Dreamers</p>
                <h1 className="mt-3 bg-gradient-to-r from-white via-cyan-100 to-fuchsia-200 bg-clip-text text-3xl font-black tracking-tight text-transparent drop-shadow-sm sm:text-4xl">
                  핑퐁드림어스 정산파일
                </h1>
                <p className="mt-2 text-sm font-medium text-slate-300">용품 주문 · 정산 · 가격 관리를 한 번에</p>
              </div>

              <button
                onClick={() => addOrder()}
                className="w-full rounded-2xl border border-slate-700 bg-white px-4 py-3 text-slate-900 outline-none"
              >
                + 정산 추가
              </button>
            </div>
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
            downloadExcelCsv={downloadExcelCsv}
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

      <nav className="fixed bottom-0 left-0 right-0 border-t border-cyan-300/20 bg-slate-950/80 p-3 shadow-2xl backdrop-blur-xl">
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
  downloadExcelCsv,
}) {
  const placeholderText =
    "예시" +
    String.fromCharCode(10) +
    "테너지05 2장" +
    String.fromCharCode(10) +
    "테너지64 2장" +
    String.fromCharCode(10) +
    "MXP 4개";

  return (
    <>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard title="총 받는금액" value={won(totals.totalBuy)} />
        <SummaryCard title="총 판매금액" value={won(totals.totalSell)} />
        <SummaryCard title="총 정산금" value={won(totals.profit)} highlight />
      </section>

      <section className="rounded-[1.7rem] border border-slate-700 bg-[#111827]/95 p-4 shadow-xl shadow-violet-100/70 backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black">엑셀 다운로드</h2>
            <p className="text-xs text-slate-500">현재 정산 내역을 CSV 파일로 저장합니다.</p>
          </div>
          <button
            onClick={downloadExcelCsv}
            className="w-full rounded-2xl border border-slate-700 bg-white px-4 py-3 text-slate-900 outline-none"
          >
            엑셀 다운로드
          </button>
        </div>
      </section>

      <section className="rounded-[1.7rem] border border-slate-700 bg-[#111827]/95 p-4 shadow-xl shadow-violet-100/70 backdrop-blur">
        <h2 className="mb-3 text-lg font-black">대량 입력 자동정리</h2>
        <div className="space-y-2">
          <input
            value={bulkBuyer}
            onChange={(e) => setBulkBuyer(e.target.value)}
            placeholder="주문자명, 비워도 됨"
            className="w-full rounded-2xl border border-violet-100 bg-white px-3 py-3 outline-none transition focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-100"
          />
         <textarea
  value={bulkText}
  onChange={(e) => setBulkText(e.target.value)}
  className="w-full rounded-2xl border border-slate-700 bg-white px-4 py-3 text-slate-900 outline-none"
/>
          <button
            onClick={parseBulkOrders}
            className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 font-black text-slate-900 shadow-lg shadow-fuchsia-200 transition hover:scale-[1.01] active:scale-95"
          >
            자동으로 정산 추가
          </button>
        </div>
      </section>

      <section className="rounded-[1.7rem] border border-slate-700 bg-[#111827]/95p-4 shadow-xl shadow-violet-100/70 backdrop-blur">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-black">정산 내역</h2>
          <button
            onClick={() => addOrder()}
            className="w-full rounded-2xl border border-slate-700 bg-white px-4 py-3 text-slate-900 outline-none"
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
              <article
                key={order.id}
                className={`rounded-[1.7rem] border p-4 shadow-md ${
                  order.done
                    ? "border-emerald-200 bg-gradient-to-br from-emerald-900/40 via-[#111827] to-cyan-900/30 shadow-emerald-100/70"
                    : "border-violet-100 bg-gradient-to-br from-[#111827] via-[#172033] to-[#1e293b] shadow-violet-100/60"
                }`}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <input
                    type="date"
                    value={order.date}
                    onChange={(e) => updateOrder(order.id, "date", e.target.value)}
                    className="rounded-2xl border border-slate-700 bg-[#1a2336] text-slate-100 px-3 py-2 text-sm outline-none focus:border-violet-400"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateOrder(order.id, "done", !order.done)}
                      className={`rounded-2xl px-3 py-2 text-sm font-bold transition active:scale-95 ${
                        order.done
                          ? "bg-emerald-600 text-white shadow-md shadow-emerald-200"
                          : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                      }`}
                    >
                      {order.done ? "완료" : "미완료"}
                    </button>
                    <button
                      onClick={() => deleteOrder(order.id)}
                      className="rounded-2xl bg-rose-100 px-3 py-2 text-sm font-bold text-rose-600 transition hover:bg-rose-200 active:scale-95"
                    >
                      삭제
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <input
                    value={order.buyer}
                    onChange={(e) => updateOrder(order.id, "buyer", e.target.value)}
                    placeholder="주문자"
                    className="rounded-2xl border border-slate-700 bg-[#1a2336] text-slate-100 px-3 py-3 placeholder:text-slate-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  />
                  <select
                    value={order.productName}
                    onChange={(e) => updateOrder(order.id, "productName", e.target.value)}
                    className="rounded-2xl border border-slate-700 bg-[#1a2336] text-slate-100 px-3 py-3 placeholder:text-slate-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
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
                    className="rounded-2xl border border-slate-700 bg-[#1a2336] text-slate-100 px-3 py-3 placeholder:text-slate-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
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
    <section className="rounded-[1.7rem] border border-slate-700 bg-[#111827]/95 p-4 shadow-xl shadow-violet-100/70 backdrop-blur">
      <h2 className="mb-3 text-lg font-black">용품관리</h2>

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_0.7fr_0.7fr_auto]">
        <input
          value={newProduct.name}
          onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
          placeholder="용품명"
          className="rounded-2xl border border-slate-700 bg-[#1a2336] text-slate-100 px-3 py-3 placeholder:text-slate-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
        <input
          type="number"
          value={newProduct.buyPrice}
          onChange={(e) => setNewProduct({ ...newProduct, buyPrice: e.target.value })}
          placeholder="받는가격"
          className="rounded-2xl border border-slate-700 bg-[#1a2336] text-slate-100 px-3 py-3 placeholder:text-slate-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
        <input
          type="number"
          value={newProduct.sellPrice}
          onChange={(e) => setNewProduct({ ...newProduct, sellPrice: e.target.value })}
          placeholder="판매가격"
          className="rounded-2xl border border-slate-700 bg-[#1a2336] text-slate-100 px-3 py-3 placeholder:text-slate-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
        <button
          onClick={addProduct}
          className="w-full rounded-2xl border border-slate-700 bg-white px-4 py-3 text-slate-900 outline-none"
        >
          추가
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <article key={product.id} className="rounded-[1.7rem] border border-violet-100 bg-gradient-to-br from-white via-violet-50/60 to-cyan-50/70 p-4 shadow-md shadow-violet-100/60">
            <div className="mb-3 flex items-center gap-2">
              <input
                value={product.name}
                onChange={(e) => updateProduct(product.id, "name", e.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-[#1a2336] text-slate-100 px-3 py-3 font-bold outline-none focus:border-violet-400"
              />
              <button
                onClick={() => deleteProduct(product.id)}
                className="rounded-2xl bg-rose-100 px-3 py-3 text-sm font-bold text-rose-600 transition hover:bg-rose-200 active:scale-95"
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
                  className="mt-1 w-full rounded-2xl border border-slate-700 bg-[#1a2336] text-slate-100 px-3 py-3 text-white outline-none focus:border-violet-400"
                />
              </label>
              <label className="text-xs font-bold text-slate-500">
                판매가격
                <input
                  type="number"
                  value={product.sellPrice}
                  onChange={(e) => updateProduct(product.id, "sellPrice", e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-700 bg-[#1a2336] text-slate-100 px-3 py-3 text-white outline-none focus:border-violet-400"
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
    <div className={`rounded-[1.7rem] p-5 shadow-xl ${highlight ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-fuchsia-200" : "border border-slate-700 bg-[#111827]/95 shadow-violet-100/70"}`}>
      <p className={`text-xs font-bold ${highlight ? "text-violet-100" : "text-slate-500"}`}>{title}</p>
      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  );
}

function Info({ label, value, green }) {
  return (
    <div className={`rounded-2xl p-3 ${green ? "bg-gradient-to-br from-emerald-100 to-cyan-100 text-emerald-700" : "bg-[#1a2336] text-slate-100 shadow-black/20"}`}>
      <p className="text-xs font-bold opacity-60">{label}</p>
      <p className="mt-1 font-black">{value}</p>
    </div>
  );
}

function TabButton({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
        active ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-fuchsia-200" : "bg-[#1a2336] text-slate-300 hover:bg-violet-100 hover:text-violet-700"
      }`}
    >
      {label}
    </button>
  );
}
