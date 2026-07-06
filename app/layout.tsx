import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "부산항 AIS AI 플랫폼",
  description: "AIS 데이터 기반 부산항 ETA 예측, 혼잡도 예측, 지도 시각화, LLM 어드바이저",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
