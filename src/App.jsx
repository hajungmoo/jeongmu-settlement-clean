import React from "react";

export default function App() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "#f5f5f5",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "sans-serif"
    }}>
      <div style={{
        background: "white",
        padding: "40px",
        borderRadius: "20px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
        textAlign: "center"
      }}>
        <h1 style={{fontSize: "32px", marginBottom: "10px"}}>
          정무의 정산앱
        </h1>

        <p style={{color:"#666"}}>
          새 프로젝트 정상 작동중 😎
        </p>
      </div>
    </main>
  );
}
