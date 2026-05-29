import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";

const today = () => new Date().toISOString().slice(0, 10);
const storageKey = "jeongmu-settlement-tabs-v2";
const loginStorageKey = "jeongmu-settlement-login-ok";
const users = [
  { id: "admin", name: "관리자", password: "9999", rowId: "main_admin", role: "admin" },
  { id: "jeongmu", name: "정무", password: "12345", rowId: "main_jeongmu", role: "user" },
  { id: "coachA", name: "코치A", password: "1111", rowId: "main_coachA", role: "user" },
  { id: "coachB", name: "코치B", password: "2222", rowId: "main_coachB", role: "user" },
];
const defaultUser = users[0];

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
  const [userIdInput, setUserIdInput] = useState("");
const [currentUser, setCurrentUser] = useState(() => {
  const savedUserId = localStorage.getItem("currentUserId");
  return users.find((user) => user.id === savedUserId) || defaultUser;
});
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState("settlement");
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState(defaultProducts);
  const [savedText, setSavedText] = useState("저장 준비");
  const [newProduct, setNewProduct] = useState({ name: "", buyPrice: "", sellPrice: "" });
  const [bulkBuyer, setBulkBuyer] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [adminSelectedUserId, setAdminSelectedUserId] = useState("jeongmu");
  const [priceBulkText, setPriceBulkText] = useState("");
  useEffect(() => {
    async function loadCloudData() {
      try {
        setSavedText("불러오는 중");

        const { data, error } = await supabase
          .from("app_data")
          .select("data")
.eq("id", currentUser.rowId)
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
filter: `id=eq.${currentUser.rowId}`,
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
.upsert({ id: currentUser.rowId, data: payload, updated_at: new Date().toISOString() });

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
  const ignoreWords = [
    "택배비",
    "총액",
    "전잔액",
    "잔액",
    "입금",
    "입금완료",
    "송금",
    "발주",
    "받았어요",
    "감사합니다",
    "고맙습니다",
  ];

  const parsed = splitLines(bulkText)
    .map((line) => {
      if (ignoreWords.some((word) => line.includes(word))) {
        return null;
      }

      let productName = "";

      const foundProduct = products.find((product) =>
        normalizeName(line).includes(normalizeName(product.name))
      );

      if (foundProduct) {
        productName = foundProduct.name;
      } else {
        let nameOnly = line
          .replace(/(적|빨강|빨|레드|검정|검|블랙)\s*[0-9]+/g, " ")
          .replace(/[0-9]+\s*(장|개|켤레|벌|자루|박스|통|세트)/g, " ")
          .trim();

        productName = findBestProductName(nameOnly);
      }

      const qtyMatches = line.match(
        /(적|빨강|빨|레드|검정|검|블랙)\s*([0-9]+)/g
      );

      let qty = 0;

      if (qtyMatches) {
        qtyMatches.forEach((match) => {
          const num = match.match(/[0-9]+/);
          if (num) qty += Number(num[0]);
        });
      } else {
        const lineWithoutProduct = productName
          ? line.replace(productName, "")
          : line;

        const normalQty = lineWithoutProduct.match(
          /([0-9]+)\s*(장|개|켤레|벌|자루|박스|통|세트)?/
        );

        if (normalQty) {
          qty = Number(normalQty[1]);
        }
      }

      if (!productName || !qty) return null;

      return {
        id: Date.now() + Math.random(),
        date: today(),
        buyer: bulkBuyer.trim(),
        productName,
        qty,
        done: false,
      };
    })
    .filter(Boolean);

  if (parsed.length === 0) {
    alert("인식된 정산이 없습니다. 예: 테너지05 적2 검1");
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

  function parsePriceBulk() {
    const lines = splitLines(priceBulkText);

    if (lines.length === 0) {
      alert("가격표를 붙여넣어주세요.");
      return;
    }

    setProducts((prev) => {
      let next = [...prev];

      lines.forEach((line) => {
        const parts = line.replaceAll(",", " ").split(" ").filter(Boolean);
        if (parts.length < 3) return;

        const sellPrice = Number(parts[parts.length - 1].replace(/[^0-9]/g, ""));
        const buyPrice = Number(parts[parts.length - 2].replace(/[^0-9]/g, ""));
        const name = parts.slice(0, -2).join(" ");

        if (!name || !buyPrice) return;

        const foundIndex = next.findIndex(
          (product) => normalizeName(product.name) === normalizeName(name)
        );

        if (foundIndex >= 0) {
          next[foundIndex] = {
            ...next[foundIndex],
            name,
            buyPrice,
            sellPrice,
          };
        } else {
          next.push({
            id: Date.now() + Math.random(),
            name,
            buyPrice,
            sellPrice,
          });
        }
      });

      return next;
    });

    setPriceBulkText("");
    alert("가격표가 적용되었습니다.");
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

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `핑퐁드림어스_정산파일_${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
function backupAllData() {
  const backup = {
    exportDate: new Date().toISOString(),
    orders,
    products,
  };

  const blob = new Blob(
    [JSON.stringify(backup, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `핑퐁드림어스_전체백업_${today()}.json`;
  a.click();

  URL.revokeObjectURL(url);
}
function restoreAllData(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (
    !confirm(
      "백업 파일로 전체 복원할까요? 현재 데이터가 덮어쓰기 됩니다."
    )
  ) {
    event.target.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = async () => {
    try {
      const backup = JSON.parse(reader.result);

      if (
        !Array.isArray(backup.orders) ||
        !Array.isArray(backup.products)
      ) {
        alert("올바른 백업 파일이 아닙니다.");
        return;
      }

      setOrders(backup.orders);
      setProducts(backup.products);

      localStorage.setItem(
        storageKey,
        JSON.stringify({
          orders: backup.orders,
          products: backup.products,
        })
      );

      await supabase.from("app_data").upsert({
id: currentUser.rowId,
        data: {
          orders: backup.orders,
          products: backup.products,
        },
        updated_at: new Date().toISOString(),
      });

      alert("복원이 완료되었습니다.");
    } catch (error) {
      console.error(error);
      alert("복원 실패: 백업 파일을 확인해주세요.");
    } finally {
      event.target.value = "";
    }
  };

  reader.readAsText(file);
} 
function handleLogin(event) {
  event.preventDefault();

  const foundUser = users.find(
    (user) =>
      user.id === userIdInput.trim() &&
      user.password === passwordInput
  );

  if (foundUser) {
    localStorage.setItem(loginStorageKey, "yes");
    localStorage.setItem("currentUserId", foundUser.id);

    setCurrentUser(foundUser);
    setIsUnlocked(true);
    setLoginError("");
    setPasswordInput("");
    setUserIdInput("");
  } else {
    setLoginError("아이디 또는 비밀번호가 맞지 않습니다.");
  }
}

function handleLogout() {
  localStorage.removeItem(loginStorageKey);
  localStorage.removeItem("currentUserId");
  setIsUnlocked(false);
  setCurrentUser(defaultUser);
  setPasswordInput("");
  setUserIdInput("");
}

  if (!isUnlocked) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black p-4 text-yellow-100">
        <img src="/dragon.png" className="absolute inset-0 h-full w-full object-cover opacity-95" />
        <div className="absolute inset-0 bg-black/60" />

        <form
          onSubmit={handleLogin}
          className="relative z-10 w-full max-w-md rounded-[1.4rem] border border-yellow-500/30 bg-black/75 p-10 text-center shadow-[0_0_90px_rgba(245,158,11,0.25)] backdrop-blur-xl"
        >
          <h1 className="bg-gradient-to-b from-yellow-100 via-yellow-400 to-yellow-700 bg-clip-text text-5xl font-black tracking-wide text-transparent">
            핑퐁드림어스
          </h1>

          <p className="mt-3 text-xl font-semibold tracking-[0.25em] text-yellow-500/80">
            주문 시스템
          </p>
{isAdmin && (
  <div className="mb-3 rounded-xl border border-red-500 bg-red-900/30 p-3">
    <div className="mb-2 text-center font-black text-red-300">
      👑 관리자 모드
    </div>

    <select
      value={adminSelectedUserId}
      onChange={(e) => setAdminSelectedUserId(e.target.value)}
      className="w-full rounded-xl border border-red-500/40 bg-black px-3 py-2 text-white"
    >
      <option value="jeongmu">정무</option>
      <option value="coachA">코치A</option>
      <option value="coachB">코치B</option>
    </select>
  </div>
)}
          <div className="my-8 flex items-center gap-3">
            <div className="h-px flex-1 bg-yellow-500/20" />
            <span className="text-yellow-500/50">◆</span>
            <div className="h-px flex-1 bg-yellow-500/20" />
          </div>

          <p className="mb-4 text-sm text-yellow-100/60">비밀번호를 입력해주세요</p>
<input
  type="text"
  value={userIdInput}
  onChange={(e) => setUserIdInput(e.target.value)}
  placeholder="ID"
  className="mb-3 w-full rounded-xl border border-yellow-500/30 bg-black/70 px-5 py-4 text-center text-lg font-bold tracking-[0.15em] text-yellow-100 outline-none placeholder:text-yellow-900 focus:border-yellow-400"
/>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="PASSWORD"
            className="w-full rounded-xl border border-yellow-500/30 bg-black/70 px-5 py-4 text-center text-lg font-bold tracking-[0.2em] text-yellow-100 outline-none placeholder:text-yellow-900 focus:border-yellow-400"
          />

          {loginError && <p className="mt-3 text-sm font-bold text-rose-400">{loginError}</p>}

          <button
            type="submit"
            className="mt-6 w-full rounded-xl bg-gradient-to-r from-yellow-700 via-yellow-400 to-yellow-600 px-5 py-4 text-lg font-black text-black shadow-lg shadow-yellow-500/20 transition active:scale-95"
          >
            로그인
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050505] pb-28 text-yellow-50">
      <div className="mx-auto max-w-5xl space-y-5 p-4">
        <header className="relative overflow-hidden rounded-[2rem] border border-yellow-500/25 bg-gradient-to-br from-black via-[#171100] to-black p-6 shadow-xl shadow-black/40">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-yellow-500/15 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-amber-500/10 blur-3xl" />

          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="rounded-full border border-yellow-500/25 bg-yellow-500/10 px-3 py-1 text-xs font-bold text-yellow-200">
                {koreanDate(today())}
              </span>
              <div className="flex gap-2">
                <span className="rounded-full border border-yellow-500/25 bg-yellow-500/10 px-3 py-1 text-xs font-bold text-yellow-200">
                  {savedText}
                </span>
                <button
                  onClick={handleLogout}
                  className="rounded-full border border-yellow-500/25 bg-black/40 px-3 py-1 text-xs font-bold text-yellow-300"
                >
                  로그아웃
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="inline-flex rounded-full border border-yellow-500/25 bg-yellow-500/10 px-3 py-1 text-sm font-bold text-yellow-200">
                  Pingpong Dreamus
                </p>
                <h1 className="mt-3 bg-gradient-to-r from-yellow-100 via-yellow-400 to-yellow-700 bg-clip-text text-3xl font-black tracking-tight text-transparent sm:text-4xl">
                  핑퐁드림어스 정산파일
                </h1>
                <p className="mt-2 text-sm font-medium text-yellow-100/60">
                  용품 주문 · 정산 · 가격 관리를 한 번에
                </p>
              </div>

              <button
                onClick={() => addOrder()}
                className="rounded-2xl bg-gradient-to-r from-yellow-700 via-yellow-400 to-yellow-600 px-4 py-3 font-black text-black"
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
            backupAllData={backupAllData}
            restoreAllData={restoreAllData}
          />
        ) : (
          <ProductPage
            products={products}
            newProduct={newProduct}
            setNewProduct={setNewProduct}
            addProduct={addProduct}
            updateProduct={updateProduct}
            deleteProduct={deleteProduct}
            priceBulkText={priceBulkText}
            setPriceBulkText={setPriceBulkText}
            parsePriceBulk={parsePriceBulk}
          />
        )}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-yellow-500/20 bg-black/85 p-3 shadow-2xl backdrop-blur-xl">
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
  backupAllData,
  restoreAllData,
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

      <section className="rounded-[1.7rem] border border-yellow-500/20 bg-black/60 p-4 shadow-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-yellow-300">엑셀 다운로드</h2>
            <p className="text-xs text-yellow-100/50">현재 정산 내역을 CSV 파일로 저장합니다.</p>
          </div>
          <div className="flex gap-2">
  <button
    onClick={downloadExcelCsv}
    className="rounded-2xl bg-yellow-400 px-4 py-3 font-black text-black"
  >
    엑셀 다운로드
  </button>

 <button
  onClick={backupAllData}
  className="rounded-2xl bg-emerald-600 px-4 py-3 font-black text-white"
>
  전체 백업
</button>

<label className="cursor-pointer rounded-2xl bg-blue-600 px-4 py-3 font-black text-white">
  백업 복원
  <input
    type="file"
    accept=".json"
    onChange={restoreAllData}
    className="hidden"
  />
</label>

</div>
        </div>
      </section>

      <section className="rounded-[1.7rem] border border-yellow-500/20 bg-black/60 p-4 shadow-xl">
        <h2 className="mb-3 text-lg font-black text-yellow-300">대량 입력 자동정리</h2>
        <div className="space-y-2">
          <input
            value={bulkBuyer}
            onChange={(e) => setBulkBuyer(e.target.value)}
            placeholder="주문자명, 비워도 됨"
            className="w-full rounded-2xl border border-yellow-500/25 bg-black/60 px-3 py-3 text-yellow-100 outline-none"
          />
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={placeholderText}
            className="h-36 w-full rounded-2xl border border-yellow-500/25 bg-black/60 px-4 py-3 text-yellow-100 outline-none"
          />
          <button onClick={parseBulkOrders} className="w-full rounded-2xl bg-yellow-400 px-4 py-3 font-black text-black">
            자동으로 정산 추가
          </button>
        </div>
      </section>

      <section className="rounded-[1.7rem] border border-yellow-500/20 bg-black/60 p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-yellow-300">정산 내역</h2>
          <button onClick={() => addOrder()} className="rounded-2xl border border-yellow-500/25 bg-black px-4 py-3 font-black text-yellow-300">
            추가
          </button>
        </div>

        {calculatedOrders.length === 0 ? (
          <div className="rounded-3xl bg-black/50 p-8 text-center text-sm text-yellow-100/50">
            아직 정산 내역이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {calculatedOrders.map((order) => (
              <article key={order.id} className="rounded-[1.7rem] border border-yellow-500/20 bg-black/55 p-4 shadow-md">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <input
                    type="date"
                    value={order.date}
                    onChange={(e) => updateOrder(order.id, "date", e.target.value)}
                    className="rounded-2xl border border-yellow-500/25 bg-black px-3 py-2 text-sm text-yellow-100 outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateOrder(order.id, "done", !order.done)}
                      className={`rounded-2xl px-3 py-2 text-sm font-bold ${
                        order.done ? "bg-emerald-600 text-white" : "bg-yellow-400 text-black"
                      }`}
                    >
                      {order.done ? "완료" : "미완료"}
                    </button>
                    <button onClick={() => deleteOrder(order.id)} className="rounded-2xl bg-rose-700 px-3 py-2 text-sm font-bold text-white">
                      삭제
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <input
                    value={order.buyer}
                    onChange={(e) => updateOrder(order.id, "buyer", e.target.value)}
                    placeholder="주문자"
                    className="rounded-2xl border border-yellow-500/25 bg-black px-3 py-3 text-yellow-100 outline-none"
                  />
                  <select
                    value={order.productName}
                    onChange={(e) => updateOrder(order.id, "productName", e.target.value)}
                    className="rounded-2xl border border-yellow-500/25 bg-black px-3 py-3 text-yellow-100 outline-none"
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
                    className="rounded-2xl border border-yellow-500/25 bg-black px-3 py-3 text-yellow-100 outline-none"
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

function ProductPage({
  products,
  newProduct,
  setNewProduct,
  addProduct,
  updateProduct,
  deleteProduct,
  priceBulkText,
  setPriceBulkText,
  parsePriceBulk,
}) {
  return (
    <section className="rounded-[1.7rem] border border-yellow-500/20 bg-black/60 p-4 shadow-xl">
      <h2 className="mb-3 text-lg font-black text-yellow-300">용품관리</h2>

      <div className="mb-4 rounded-2xl border border-yellow-500/20 bg-black/50 p-4">
        <h3 className="mb-2 font-black text-yellow-300">가격표 대량입력</h3>
        <p className="mb-2 text-xs text-yellow-100/50">형식: 용품명 받는가격 판매가격</p>

        <textarea
          value={priceBulkText}
          onChange={(e) => setPriceBulkText(e.target.value)}
          placeholder={`예시)
테너지05 63000 79000
테너지64 63000 79000
MXP 40000 52000`}
          className="h-36 w-full rounded-2xl border border-yellow-500/25 bg-black px-4 py-3 text-yellow-100 outline-none"
        />

        <button
          onClick={parsePriceBulk}
          className="mt-2 w-full rounded-2xl bg-yellow-400 px-4 py-3 font-black text-black"
        >
          가격표 자동 적용
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_0.7fr_0.7fr_auto]">
        <input
          value={newProduct.name}
          onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
          placeholder="용품명"
          className="rounded-2xl border border-yellow-500/25 bg-black px-3 py-3 text-yellow-100 outline-none"
        />
        <input
          type="number"
          value={newProduct.buyPrice}
          onChange={(e) => setNewProduct({ ...newProduct, buyPrice: e.target.value })}
          placeholder="받는가격"
          className="rounded-2xl border border-yellow-500/25 bg-black px-3 py-3 text-yellow-100 outline-none"
        />
        <input
          type="number"
          value={newProduct.sellPrice}
          onChange={(e) => setNewProduct({ ...newProduct, sellPrice: e.target.value })}
          placeholder="판매가격"
          className="rounded-2xl border border-yellow-500/25 bg-black px-3 py-3 text-yellow-100 outline-none"
        />
        <button onClick={addProduct} className="rounded-2xl bg-yellow-400 px-4 py-3 font-black text-black">
          추가
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <article key={product.id} className="rounded-[1.7rem] border border-yellow-500/20 bg-black/55 p-4 shadow-md">
            <div className="mb-3 flex items-center gap-2">
              <input
                value={product.name}
                onChange={(e) => updateProduct(product.id, "name", e.target.value)}
                className="w-full rounded-2xl border border-yellow-500/25 bg-black px-3 py-3 font-bold text-yellow-100 outline-none"
              />
              <button onClick={() => deleteProduct(product.id)} className="rounded-2xl bg-rose-700 px-3 py-3 text-sm font-bold text-white">
                삭제
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-bold text-yellow-100/60">
                받는가격
                <input
                  type="number"
                  value={product.buyPrice}
                  onChange={(e) => updateProduct(product.id, "buyPrice", e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-yellow-500/25 bg-black px-3 py-3 text-yellow-100 outline-none"
                />
              </label>
              <label className="text-xs font-bold text-yellow-100/60">
                판매가격
                <input
                  type="number"
                  value={product.sellPrice}
                  onChange={(e) => updateProduct(product.id, "sellPrice", e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-yellow-500/25 bg-black px-3 py-3 text-yellow-100 outline-none"
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
    <div className={`rounded-[1.7rem] p-5 shadow-xl ${highlight ? "bg-gradient-to-br from-yellow-700 to-yellow-400 text-black" : "border border-yellow-500/20 bg-black/60 text-yellow-100"}`}>
      <p className={`text-xs font-bold ${highlight ? "text-black/70" : "text-yellow-100/60"}`}>{title}</p>
      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  );
}

function Info({ label, value, green }) {
  return (
    <div className={`rounded-2xl p-3 ${green ? "bg-yellow-400 text-black" : "bg-black text-yellow-100"}`}>
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
        active ? "bg-yellow-400 text-black" : "bg-black text-yellow-300"
      }`}
    >
      {label}
    </button>
  );
}
