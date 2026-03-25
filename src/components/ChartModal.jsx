// src/components/ChartModal.jsx
// 종목 / 업종지수 차트 팝업 모달
import { useEffect } from "react";
import CandleChart from "./CandleChart";
import "./ChartModal.css";

/**
 * ChartModal props:
 *
 * 종목 차트:
 *   <ChartModal code="005930" name="삼성전자" onClose={fn} />
 *
 * 업종/지수 차트:
 *   <ChartModal isIndex inds_cd="001" name="KOSPI" onClose={fn} />
 *
 * initialPeriod: "day" | "week" | "month" | "min" (기본 "day")
 */
export default function ChartModal({
  code,
  name,
  isIndex = false,
  inds_cd,
  initialPeriod = "day",
  onClose,
}) {
  // ESC 키로 닫기
  useEffect(() => {
    const handler = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // 스크롤 막기
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="cm-overlay" onClick={onClose}>
      <div className="cm-modal" onClick={e => e.stopPropagation()}>
        <button className="cm-close" onClick={onClose} aria-label="닫기">✕</button>
        <CandleChart
          code={code}
          name={name}
          isIndex={isIndex}
          inds_cd={inds_cd}
          initialPeriod={initialPeriod}
        />
      </div>
    </div>
  );
}
