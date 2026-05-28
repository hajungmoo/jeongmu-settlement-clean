```jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";

const PASSWORD = "12345";
const CLOUD_ID = "main";

const defaultProducts = [
  { name: "테너지05", price: 79000 },
  { name: "테너지64", price: 79000 },
  { name: "디그닉스05", price: 89000 },
  { name: "MXP", price: 52000 },
  { name: "로제나", price: 45000 },
];

export default function App() {
  const [loggedIn, setLoggedIn] = useState(
    localStorage.getItem("loggedIn") === "yes"
  );

  const [password, setPassword] = useState("");
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState(defaultProducts);

  useEffect(() => {
    loadCloud();
  }, []);

  async function loadCloud() {
    try {
      const { data } = await supabase
        .from("app_data")
        .select("*")
        .eq("id", CLOUD_ID)
        .single();

      if (data?.data) {
        setOrders(data.data.orders || []);
        setProducts(data.data.products || defaultProducts);
      }
    } catch (e) {
      console.log(e);
    }
  }

  async function saveCloud(nextOrders = orders) {
    try {
      await supabase.from("app_data").upsert({
        id: CLOUD_ID,
        data: {
          orders: nextOrders,
          products,
        },
      });
    } catch (e) {
      console.log(e);
    }
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

  function logout() {
    localStorage.removeItem("loggedIn");
    setLoggedIn(false);
  }

  function addOrder() {
    const name = prompt("주문자");
    const item = prompt("용품명");

    if (!name || !item) return;

    const next = [
      {
        id: Date.now(),
        customer: name,
        item,
        qty: 1,
        done: false,
      },
      ...orders,
    ];

    setOrders(next);
    saveCloud(next);
  }

  function toggleDone(id) {
    const next = orders.map((o) =>
      o.id === id ? { ...o, done: !o.done } : o
    );

    setOrders(next);
    saveCloud(next);
  }

  function removeOrder(id) {
    const next = orders.filter((o) => o.id !== id);

    setOrders(next);
    saveCloud(next);
  }

  const total = useMemo(() => {
    return orders.length;
  }, [orders]);

  if (!loggedIn) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-black flex items-center justify-center">

        <img
          src="/dragon.png"
          className="absolute inset-0 w-full h-full object-cover opacity-90"
        />

        <div className="absolute inset-0 bg-black/60" />

        <form
          onSubmit={login}
          className="relative z-10 w-[92%] max-w-md rounded-3xl border border-yellow-500/30 bg-black/70 p-8 backdrop-blur-xl shadow-2xl"
        >
          <h1 className="text-center text-5xl font-black text-yellow-400">
            핑퐁드림어스
          </h1>

          <p className="mt-3 text-center text-yellow-100/70">
            주문 시스템
          </p>

          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-8 w-full rounded-2xl border border-yellow-500/40 bg-black/60 px-5 py-4 text-center text-yellow-100 outline-none"
          />

          <button className="mt-5 w-full rounded-2xl bg-gradient-to-r from-yellow-600 to-yellow-300 py-4 text-lg font-black text-black">
            로그인
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-yellow-50 p-4">

      <header className="mx-auto max-w-6xl rounded-3xl border border-yellow-500/20 bg-black/60 p-5 mb-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-yellow-400">
              핑퐁드림어스
            </h1>

            <p className="text-yellow-100/60">
              주문 · 정산 시스템
            </p>
          </div>

          <button
            onClick={logout}
            className="rounded-xl border border-yellow-500/30 px-4 py-2 text-yellow-300"
          >
            로그아웃
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl">

        <div className="mb-5 rounded-3xl border border-yellow-500/20 bg-black/60 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-yellow-100/60">총 주문</p>
              <h2 className="text-4xl font-black text-yellow-300">
                {total}
              </h2>
            </div>

            <button
              onClick={addOrder}
              className="rounded-2xl bg-gradient-to-r from-yellow-600 to-yellow-300 px-5 py-4 font-black text-black"
            >
              주문 추가
            </button>
          </div>
        </div>

        <section className="rounded-3xl border border-yellow-500/20 bg-black/60 p-5">

          <h2 className="mb-4 text-2xl font-black text-yellow-300">
            주문 목록
          </h2>

          <div className="space-y-3">

            {orders.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between rounded-2xl border border-yellow-500/10 bg-black/40 p-4"
              >
                <div>
                  <p className="font-black text-yellow-300">
                    {o.customer}
                  </p>

                  <p className="text-yellow-100/70">
                    {o.item}
                  </p>
                </div>

                <div className="flex gap-2">

                  <button
                    onClick={() => toggleDone(o.id)}
                    className={`rounded-xl px-4 py-2 font-bold ${
                      o.done
                        ? "bg-green-600 text-white"
                        : "bg-yellow-500 text-black"
                    }`}
                  >
                    {o.done ? "완료" : "미완료"}
                  </button>

                  <button
                    onClick={() => removeOrder(o.id)}
                    className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white"
                  >
                    삭제
                  </button>

                </div>
              </div>
            ))}

          </div>
        </section>
      </main>
    </div>
  );
}
```
