// src/hooks/useChartPopup.js
// 어느 페이지에서든 종목 차트 팝업을 1줄로 호출하는 훅
//
// 사용법:
//   const { chartItem, openChart, closeChart, ChartPopup } = useChartPopup()
//   ...
//   <button onClick={() => openChart({ code:'005930', name:'삼성전자' })}>차트</button>
//   ...
//   <ChartPopup />   ← JSX 어딘가에 배치 (렌더 마운트)
//
// GlobalChartModal(type='stock')을 내부적으로 사용하므로
// 드로잉 Firestore 자동저장, MA 토글, 리사이즈 모두 포함됨

import { useState, useCallback } from 'react'
import GlobalChartModal from '../components/GlobalChartModal'

export function useChartPopup() {
  const [chartItem, setChartItem] = useState(null)   // { code, name } | null

  const openChart = useCallback((item) => {
    if (!item?.code) return
    setChartItem({ code: item.code, name: item.name || item.code })
  }, [])

  const closeChart = useCallback(() => setChartItem(null), [])

  // 렌더에 <ChartPopup /> 한 줄만 추가하면 됨
  const ChartPopup = chartItem
    ? () => (
        <GlobalChartModal
          type="stock"
          symbol={chartItem.code}
          name={chartItem.name}
          onClose={closeChart}
        />
      )
    : () => null

  return { chartItem, openChart, closeChart, ChartPopup }
}
