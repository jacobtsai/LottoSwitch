import { ref, computed, watch, nextTick } from 'vue'

export function useOddsCalculator(initialPlay) {
  const play = ref(initialPlay)

  // A 盤
  const costA = ref({
    givenOdds: play.value.costA.givenOdds,
    subGivenOdds: play.value.costA.subGivenOdds,
    cost: play.value.costA.baseCost,
    rebate: play.value.costA.baseRebate
  })

  // B 盤 (Editable GivenOdds, subGivenOdds, Cost, Rebate, Auto-syncing AdditionalProfit)
  const costB = ref({
    givenOdds: play.value.costB.givenOdds,
    subGivenOdds: play.value.costB.subGivenOdds,
    cost: play.value.costB.baseCost,
    rebate: play.value.costB.baseRebate,
    additionalProfit: play.value.costB.additionalProfit
  })

  const oddsA = ref({ additionalProfit: play.value.oddsA.additionalProfit || 0 })
  const oddsB = ref({ additionalProfit: 20 })

  // 內部數學真值基準點（用於消除 CSV CSV 四捨五入造成的字串落差）
  const initialActualProfitA = ref(0)

  const calcTheoCost = (given, subGiven) => {
    let cost = 0
    const b = play.value.baseData
    if (b.theoreticalOdds > 0 && given > 0) {
      cost += (given / b.theoreticalOdds) * 100
    }
    if (subGiven !== null && b.subTheoreticalOdds && b.subTheoreticalOdds > 0) {
      cost += (subGiven / b.subTheoreticalOdds) * 100
    }
    return cost
  }

  // A 盤連動 (互鎖)
  watch(() => costA.value.rebate, (val) => { costA.value.cost = +(100 - val).toFixed(4) })
  watch(() => costA.value.cost, (val) => { costA.value.rebate = +(100 - val).toFixed(4) })

  const theoreticalCostA = computed(() => calcTheoCost(costA.value.givenOdds, costA.value.subGivenOdds))
  const actualProfitA = computed(() => costA.value.cost - theoreticalCostA.value)
  
  // Delta (偏移基準) 現在嚴格對齊「引擎初始化時算出的數學真值」，消除與 CSV 字串的四捨五入誤差
  const deltaProfit = computed(() => actualProfitA.value - initialActualProfitA.value)

  const theoreticalCostB = computed(() => calcTheoCost(costB.value.givenOdds, costB.value.subGivenOdds))

  // 雙向綁定的防無限迴圈鎖
  let isSyncingB = false

  // 1. MASTER 驅動更新 (A盤利潤變動，或使用者手動調整「利潤疊加」時)：鎖死利潤，全自動配合新算式去更改 B 盤的退水/成本
  watch([actualProfitA, () => costB.value.additionalProfit], () => {
    if (isSyncingB) return
    isSyncingB = true
    
    const theoB = calcTheoCost(costB.value.givenOdds, costB.value.subGivenOdds)
    const targetProfit = actualProfitA.value + (costB.value.additionalProfit * 100)
    const newCost = targetProfit + theoB
    
    costB.value.cost = +(newCost).toFixed(4)
    costB.value.rebate = +(100 - newCost).toFixed(4)
    
    setTimeout(() => { isSyncingB = false }, 0)
  })

  // 2. 使用者手動干預 B 盤參數 (賠率 / 退水 / 成本)：打破利潤鎖定，允許當前利潤產生變化，並反推「利潤疊加」來吸收差異
  watch([() => costB.value.givenOdds, () => costB.value.subGivenOdds, () => costB.value.rebate, () => costB.value.cost], ([newOdds, newSubOdds, newRebate, newCost], [oldOdds, oldSubOdds, oldR, oldC]) => {
    if (isSyncingB) return
    isSyncingB = true

    // 若使用者動的是【退水】或【成本】，要先互相連動
    if (newRebate !== oldR) {
      costB.value.cost = +(100 - newRebate).toFixed(4)
      newCost = costB.value.cost
    } else if (newCost !== oldC) {
      costB.value.rebate = +(100 - newCost).toFixed(4)
    }

    // 重算干預後的真實利潤
    const theoB = calcTheoCost(costB.value.givenOdds, costB.value.subGivenOdds)
    const currentActualProfitB = newCost - theoB
    
    // 反向倒推出這個操作製造了多少利潤差額，寫入 additionalProfit 吸收
    const newAddProfit = (currentActualProfitB - actualProfitA.value) / 100
    // 預防浮點數無限連鎖更新
    if (Math.abs((costB.value.additionalProfit || 0) - newAddProfit) > 0.000001) {
      costB.value.additionalProfit = +(newAddProfit).toFixed(6)
    }
    
    setTimeout(() => { isSyncingB = false }, 0)
  })
  
  const computedProfitB = computed(() => costB.value.cost - theoreticalCostB.value)

  // 現金盤 A/B (單向防禦機制)
  const oddsA_TargetProfit = computed(() => {
    const baseP = play.value.oddsA.baseProfit || 0
    const addP = oddsA.value.additionalProfit || 0
    return (baseP * 100) + deltaProfit.value + addP
  })

  // 賠率 B 盤是以 A 盤為基準，疊加其百分比 (例如 20% 即為 A 盤利潤 * 1.2)
  const oddsB_TargetProfit = computed(() => {
    const multiplier = (oddsB.value.additionalProfit || 0) / 100
    return oddsA_TargetProfit.value * (1 + multiplier)
  })

  const calcCashOddsFromProfit = (baseDataKey, targetProfit) => {
    const b = play.value.baseData
    const origConfig = play.value[baseDataKey]
    
    const targetTheoCost = 100 - targetProfit
    
    let subGiven = origConfig.subGivenOdds
    let theoCostFromSub = 0
    if (subGiven !== null && b.subTheoreticalOdds) {
      theoCostFromSub = (subGiven / b.subTheoreticalOdds) * 100
    }
    
    let mainGiven = 0
    if (b.theoreticalOdds > 0) {
      const remainingTheo = targetTheoCost - theoCostFromSub
      mainGiven = (remainingTheo / 100) * b.theoreticalOdds
    }

    return {
      givenOdds: +(mainGiven.toFixed(2)),
      subGivenOdds: subGiven,
      profit: targetProfit,
      theoreticalCost: targetTheoCost
    }
  }

  const computedOddsA = computed(() => calcCashOddsFromProfit('oddsA', oddsA_TargetProfit.value))
  const computedOddsB = computed(() => calcCashOddsFromProfit('oddsB', oddsB_TargetProfit.value))

  const setPlay = (newPlay) => {
    play.value = newPlay
    isSyncingB = true // Prevent erratic reverse calc during init
    
    costA.value.givenOdds = newPlay.costA.givenOdds
    costA.value.subGivenOdds = newPlay.costA.subGivenOdds
    costA.value.cost = newPlay.costA.baseCost
    costA.value.rebate = newPlay.costA.baseRebate
    
    costB.value.givenOdds = newPlay.costB.givenOdds
    costB.value.subGivenOdds = newPlay.costB.subGivenOdds
    costB.value.cost = newPlay.costB.baseCost
    costB.value.rebate = newPlay.costB.baseRebate
    costB.value.additionalProfit = newPlay.costB.additionalProfit
    
    oddsA.value.additionalProfit = newPlay.oddsA.additionalProfit || 0
    oddsB.value.additionalProfit = 20

    // 初始化當下，立即擷取引擎端計算出的絕對精準利潤，做為日後 Delta 偏移的基底
    initialActualProfitA.value = newPlay.costA.baseCost - calcTheoCost(newPlay.costA.givenOdds, newPlay.costA.subGivenOdds)

    nextTick(() => { isSyncingB = false })
  }

  return {
    play,
    baseData: play.value.baseData,
    costA,
    theoreticalCostA,
    actualProfitA,
    costB,
    theoreticalCostB,
    computedProfitB,
    oddsA,
    computedOddsA,
    oddsA_TargetProfit,
    oddsB,
    computedOddsB,
    oddsB_TargetProfit,
    setPlay,
    deltaProfit
  }
}
