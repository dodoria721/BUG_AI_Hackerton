"use client";

// 좌측 아이콘 레일 — 대시보드(지도)와 선박 모니터링 콘솔이 공유한다.
// href가 있는 항목은 라우팅되고, 없는 항목은 아직 미연결(장식).
import Link from "next/link";

const muted = "#8aa0c8";
const panel = "rgba(11,18,34,0.82)";
const border = "1px solid rgba(120,160,255,0.14)";

export const RAIL_ITEMS: { icon: string; label: string; href?: string }[] = [
  { icon: "🗺️", label: "관제 지도", href: "/dashboard" },
  { icon: "🚢", label: "선박 모니터링", href: "/vessel" },
  { icon: "⚓", label: "선석 대기" },
  { icon: "📊", label: "혼잡도 통계", href: "/congestion" },
  { icon: "⚙️", label: "설정" },
];

// active: 현재 화면에 해당하는 항목의 href (예: "/vessel")
export default function LeftRail({ active }: { active: string }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: 16,
        bottom: 16,
        width: 52,
        zIndex: 500,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        padding: "12px 0",
        background: panel,
        backdropFilter: "blur(14px)",
        border,
        borderRadius: 14,
      }}
    >
      <Link
        href="/"
        title="홈"
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          background: "linear-gradient(135deg,#2f6bff,#5b8cff)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 8,
          textDecoration: "none",
        }}
      >
        <div style={{ width: 12, height: 12, border: "2.5px solid #fff", borderRadius: "50%", borderRightColor: "transparent" }} />
      </Link>
      {RAIL_ITEMS.map((item, i) => {
        const on = item.href === active;
        const inner = (
          <div
            key={i}
            title={item.label}
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 17,
              color: on ? "#fff" : muted,
              background: on ? "linear-gradient(135deg,#2f6bff,#5b8cff)" : "transparent",
              cursor: item.href ? "pointer" : "default",
            }}
          >
            {item.icon}
          </div>
        );
        return item.href ? (
          <Link key={i} href={item.href} style={{ textDecoration: "none" }}>
            {inner}
          </Link>
        ) : (
          inner
        );
      })}
    </div>
  );
}
