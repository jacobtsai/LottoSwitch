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

  const oddsA = ref({ additionalProfit: play.value.oddsA.additionalProfit })
  const oddsB = ref({ additionalProfit: play.value.oddsB.additionalProfit })

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
  const deltaProfit = computed(() => actualProfitA.value - ((play.value.costA.baseProfit || 0) * 100))

  const theoreticalCostB = computed(() => calcTheoCost(costB.value.givenOdds, costB.value.subGivenOdds))

  // 雙向綁定的防無限迴圈鎖
  let isSyncingB = false

  // 當 A 盤獲利改變或 B 盤賠率改變，B 盤主動反推成本並鎖死利潤
  watch([actualProfitA, () => costB.value.givenOdds, () => costB.value.subGivenOdds, () => costB.value.additionalProfit], () => {
    if (isSyncingB) return
    isSyncingB = true
    
    const theoB = calcTheoCost(costB.value.givenOdds, costB.value.subGivenOdds)
    const targetProfit = actualProfitA.value + (costB.value.additionalProfit * 100)
    const newCost = targetProfit + theoB
    
    costB.value.cost = +(newCost).toFixed(4)
    costB.value.rebate = +(100 - newCost).toFixed(4)
    
    nextTick(() => { isSyncingB = false })
  })

  // 當使用者手動強制干預 B 盤退水時，B 盤放棄原本的鎖定，轉而把差額寫回「利潤疊加」
  watch([() => costB.value.rebate, () => costB.value.cost], ([newRebate, newCost], [oldR, oldC]) => {
    if (isSyncingB) return
    isSyncingB = true

    if (newRebate !== oldR) {
      costB.value.cost = +(100 - newRebate).toFixed(4)
      newCost = costB.value.cost
    } else if (newCost !== oldC) {
      costB.value.rebate = +(100 - newCost).toFixed(4)
    }

    const theoB = calcTheoCost(costB.value.givenOdds, costB.value.subGivenOdds)
    const currentActualProfitB = newCost - theoB
    
    // Reverse calculate additionalProfit needed to justify this override
    costB.value.additionalProfit = +((currentActualProfitB - actualProfitA.value) / 100).toFixed(6)
    
    nextTick(() => { isSyncingB = false })
  })
  
  const computedProfitB = computed(() => costB.value.cost - theoreticalCostB.value)

  // 現金盤 A/B (單向防禦機制)
  const oddsA_TargetProfit = computed({
    get() {
      const baseP = play.value.oddsA.baseProfit || 0
      const addP = oddsA.value.additionalProfit || 0
      return (baseP * 100) + deltaProfit.value + (addP * 100)
    },
    set(newProfit) {
      if (typeof newProfit !== 'number' || isNaN(newProfit)) return
      const baseP = play.value.oddsA.baseProfit || 0
      oddsA.value.additionalProfit = +((newProfit - (baseP * 100) - deltaProfit.value) / 100).toFixed(6)
    }
  })

  const oddsB_TargetProfit = computed({
    get() {
      const baseP = play.value.oddsB.baseProfit || 0
      const addP = oddsB.value.additionalProfit || 0
      return (baseP * 100) + deltaProfit.value + (addP * 100)
    },
    set(newProfit) {
      if (typeof newProfit !== 'number' || isNaN(newProfit)) return
      const baseP = play.value.oddsB.baseProfit || 0
      oddsB.value.additionalProfit = +((newProfit - (baseP * 100) - deltaProfit.value) / 100).toFixed(6)
    }
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
    
    oddsA.value.additionalProfit = newPlay.oddsA.additionalProfit
    oddsB.value.additionalProfit = newPlay.oddsB.additionalProfit

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
