import { ref, computed, watch } from 'vue'

export function useOddsCalculator(initialPlay) {
  // `play` is the original data for the selected Gameplay (玩法)
  const play = ref(initialPlay)

  // Reactive state for markets (users can modify A parameters, others are computed/auto-linked except 'additionalProfit')
  const costA = ref({
    givenOdds: play.value.costA.givenOdds,
    subGivenOdds: play.value.costA.subGivenOdds,
    cost: play.value.costA.baseCost,
    rebate: play.value.costA.baseRebate,
    additionalProfit: 0
  })

  const costB = ref({
    additionalProfit: play.value.costB.additionalProfit
  })

  const oddsA = ref({
    additionalProfit: play.value.oddsA.additionalProfit
  })

  const oddsB = ref({
    additionalProfit: play.value.oddsB.additionalProfit
  })

  // Helper: Calculate Theoretical Cost (%)
  // Formula: (Given / Theo) * 100 + (SubGiven / SubTheo) * 100
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

  // Cost A Sync between Rebate and Cost (Rebate + Cost = 100)
  watch(() => costA.value.rebate, (val) => {
    costA.value.cost = +(100 - val).toFixed(4)
  })
  watch(() => costA.value.cost, (val) => {
    costA.value.rebate = +(100 - val).toFixed(4)
  })

  // 1. Cost A Theoretical Cost & Actual Profit
  const theoreticalCostA = computed(() => calcTheoCost(costA.value.givenOdds, costA.value.subGivenOdds))
  const actualProfitA = computed(() => {
    return costA.value.cost + (costA.value.additionalProfit * 100) - theoreticalCostA.value
  })

  // 2. Delta (利潤差額) = Actual Profit A - Original Base Profit A
  const deltaProfit = computed(() => {
    const baseProfitAPercent = (play.value.costA.baseProfit || 0) * 100
    return actualProfitA.value - baseProfitAPercent
  })

  // 3. Sync to Cost B (Master -> Slave)
  // Cost B aims for the EXACT SAME profit as A (plus its own additional profit)
  const computedCostB = computed(() => {
    // Original fixed givenOdds for B from JSON config
    const givenOddsB = play.value.costB.givenOdds
    const subGivenOddsB = play.value.costB.subGivenOdds
    
    const theoCostB = calcTheoCost(givenOddsB, subGivenOddsB)
    
    // Target profit for B = Actual Profit A + B's additional profit stack
    const targetProfitB = actualProfitA.value + (costB.value.additionalProfit * 100)
    
    // Since Profit = Cost - TheoCost, Cost = TargetProfit + TheoCost
    const c = targetProfitB + theoCostB
    const r = 100 - c
    
    return {
      givenOdds: givenOddsB,
      subGivenOdds: subGivenOddsB,
      theoreticalCost: theoCostB,
      cost: c,
      rebate: r,
      profit: targetProfitB
    }
  })

  // 4. Sync to Odds A & Odds B (Master -> Slave)
  // Cash markets use target profit = Base Cash Profit + Delta Profit + Additional Profit
  // Cash markets do not have rebate/cost, so Profit = 100 - Theoretical Cost.
  // Therefore: Theoretical Cost = 100 - Target Profit.
  // Since Theoretical Cost = (Given / Theo) * 100, we derive Given Odds.
  const calcCashOdds = (baseDataKey, additionalProfitRef) => {
    const b = play.value.baseData
    const origConfig = play.value[baseDataKey]
    
    const baseP = origConfig.baseProfit || 0
    const addP = additionalProfitRef.value || 0
    const targetProfit = (baseP * 100) + deltaProfit.value + (addP * 100)
    const targetTheoCost = 100 - targetProfit
    
    // Reverse math to find New Given Odds
    // If there is NO sub prize:
    // targetTheoCost = (given / b.theo) * 100 => given = (targetTheoCost / 100) * b.theo
    // If there IS a sub prize, typically we keep the original sub prize and only adjust the main prize, 
    // or scale proportionally. For betting systems, scaling main prize is standard.
    // Let's keep sub prize fixed to original for simplicity, and shift all profit to main odds.
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

  const computedOddsA = computed(() => calcCashOdds('oddsA', oddsA))
  const computedOddsB = computed(() => calcCashOdds('oddsB', oddsB))

  // Provide method to switch active play entirely
  const setPlay = (newPlay) => {
    play.value = newPlay
    // Reset A inputs
    costA.value.givenOdds = newPlay.costA.givenOdds
    costA.value.subGivenOdds = newPlay.costA.subGivenOdds
    costA.value.cost = newPlay.costA.baseCost
    costA.value.rebate = newPlay.costA.baseRebate
    costA.value.additionalProfit = 0
    
    // Reset additions
    costB.value.additionalProfit = newPlay.costB.additionalProfit
    oddsA.value.additionalProfit = newPlay.oddsA.additionalProfit
    oddsB.value.additionalProfit = newPlay.oddsB.additionalProfit
  }

  return {
    play,
    baseData: play.value.baseData,
    
    // Cost A
    costA,
    theoreticalCostA,
    actualProfitA,
    
    // Cost B (Auto-Calculated)
    costB,
    computedCostB,
    
    // Odds A & B (Auto-Calculated)
    oddsA,
    computedOddsA,
    oddsB,
    computedOddsB,

    setPlay,
    deltaProfit
  }
}
