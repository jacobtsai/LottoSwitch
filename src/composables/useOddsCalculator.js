import { ref, computed, watch, nextTick } from 'vue'
import Decimal from 'decimal.js'

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

  const oddsB = ref({ additionalProfit: 20 })

  // 內部數學真值基準點（用於消除 CSV CSV 四捨五入造成的字串落差）
  const initialActualProfitA = ref(0)

  const calcTheoCost = (given, subGiven) => {
    let cost = new Decimal(0)
    const b = play.value.baseData
    if (given > 0 && b.theoreticalOdds > 0) {
      cost = cost.plus(new Decimal(given).dividedBy(b.theoreticalOdds).times(100))
    }
    if (subGiven !== null && b.subTheoreticalOdds && b.subTheoreticalOdds > 0) {
      cost = cost.plus(new Decimal(subGiven).dividedBy(b.subTheoreticalOdds).times(100))
    }
    return cost.toDecimalPlaces(6, Decimal.ROUND_UP).toNumber()
  }

  // A 盤連動 (互鎖)
  watch(() => costA.value.rebate, (val) => {
    // 退水採捨去 3 位
    const floorRebate = new Decimal(val).toDecimalPlaces(3, Decimal.ROUND_DOWN).toNumber()
    if (costA.value.rebate !== floorRebate) costA.value.rebate = floorRebate
    costA.value.cost = new Decimal(100).minus(floorRebate).toNumber()
  })
  watch(() => costA.value.cost, (val) => {
    // 若動的是成本，則退水由 100 - 成本 並進行捨去 3 位
    const calcRebate = new Decimal(100).minus(val).toDecimalPlaces(3, Decimal.ROUND_DOWN)
    costA.value.rebate = calcRebate.toNumber()
    costA.value.cost = new Decimal(100).minus(calcRebate).toNumber()
  })

  const theoreticalCostA = computed(() => calcTheoCost(costA.value.givenOdds, costA.value.subGivenOdds))
  const actualProfitA = computed(() => {
    if (!theoreticalCostA.value) return 0
    return new Decimal(costA.value.cost).minus(theoreticalCostA.value).toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber()
  })
  
  // Delta (偏移基準) 現在嚴格對齊「引擎初始化時算出的數學真值」，消除與 CSV 字串的四捨五入誤差
  const deltaProfit = computed(() => {
    return new Decimal(actualProfitA.value).minus(initialActualProfitA.value).toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber()
  })

  const theoreticalCostB = computed(() => calcTheoCost(costB.value.givenOdds, costB.value.subGivenOdds))

  // 雙向綁定的防無限迴圈鎖
  let isSyncingB = false

  // 1. MASTER 驅動更新 (A盤利潤變動，或使用者手動調整「利潤疊加」時)：鎖死成本不變，確保目標利潤更新，並去反算「自訂賠率」
  watch([actualProfitA, () => costB.value.additionalProfit], () => {
    if (isSyncingB) return
    isSyncingB = true
    
    const multiplier = new Decimal(costB.value.additionalProfit || 0).dividedBy(100)
    const targetProfit = new Decimal(actualProfitA.value).times(new Decimal(1).plus(multiplier)).toDecimalPlaces(4, Decimal.ROUND_DOWN)
    
    // 目標理論成本 = 給定成本 - 目標利潤
    const targetTheoCost = new Decimal(costB.value.cost).minus(targetProfit)
    
    const b = play.value.baseData
    let subGiven = costB.value.subGivenOdds
    let theoCostFromSub = new Decimal(0)
    if (subGiven !== null && b.subTheoreticalOdds && b.subTheoreticalOdds > 0) {
      theoCostFromSub = new Decimal(subGiven).dividedBy(b.subTheoreticalOdds).times(100).toDecimalPlaces(6, Decimal.ROUND_UP)
    }
    
    const remainingTheo = targetTheoCost.minus(theoCostFromSub)
    if (b.theoreticalOdds > 0) {
      const mainGiven = remainingTheo.dividedBy(100).times(b.theoreticalOdds).toDecimalPlaces(6, Decimal.ROUND_DOWN)
      costB.value.givenOdds = mainGiven.toNumber()
    }
    
    setTimeout(() => { isSyncingB = false }, 0)
  })

  // 2. 使用者手動干預 B 盤參數 (賠率 / 退水 / 成本)：
  // 情況 a: 動了【退水 / 成本】 -> 反算「自訂賠率」
  // 情況 b: 動了【賠率】 -> 反算「退水/成本」
  // 共同點: 「疊加的利潤設定」永遠被鎖定，不可自動修改
  watch([() => costB.value.givenOdds, () => costB.value.subGivenOdds, () => costB.value.rebate, () => costB.value.cost], ([newOdds, newSubOdds, newRebate, newCost], [oldOdds, oldSubOdds, oldR, oldC]) => {
    if (isSyncingB) return
    isSyncingB = true

    let isCostOrRebateChanged = false

    // 若使用者動的是【退水】或【成本】，要先互相連動
    if (newRebate !== oldR) {
      costB.value.rebate = new Decimal(newRebate).toDecimalPlaces(3, Decimal.ROUND_DOWN).toNumber()
      costB.value.cost = new Decimal(100).minus(costB.value.rebate).toNumber()
      newCost = costB.value.cost
      isCostOrRebateChanged = true
    } else if (newCost !== oldC) {
      const calcRebate = new Decimal(100).minus(newCost).toDecimalPlaces(3, Decimal.ROUND_DOWN)
      costB.value.rebate = calcRebate.toNumber()
      costB.value.cost = new Decimal(100).minus(calcRebate).toNumber()
      isCostOrRebateChanged = true
    }

    // 取出當前鎖死的目標利潤
    const multiplier = new Decimal(costB.value.additionalProfit || 0).dividedBy(100)
    const targetProfit = new Decimal(actualProfitA.value).times(new Decimal(1).plus(multiplier)).toDecimalPlaces(4, Decimal.ROUND_DOWN)

    if (isCostOrRebateChanged) {
      // 情況 a: 維持目標利潤不變，根據新成本推算「自訂賠率」
      const targetTheoCost = new Decimal(newCost).minus(targetProfit)
      
      const b = play.value.baseData
      let subGiven = costB.value.subGivenOdds
      let theoCostFromSub = new Decimal(0)
      if (subGiven !== null && b.subTheoreticalOdds && b.subTheoreticalOdds > 0) {
        theoCostFromSub = new Decimal(subGiven).dividedBy(b.subTheoreticalOdds).times(100).toDecimalPlaces(6, Decimal.ROUND_UP)
      }
      
      const remainingTheo = targetTheoCost.minus(theoCostFromSub)
      if (b.theoreticalOdds > 0) {
        const mainGiven = remainingTheo.dividedBy(100).times(b.theoreticalOdds).toDecimalPlaces(6, Decimal.ROUND_DOWN)
        costB.value.givenOdds = mainGiven.toNumber()
      }
    } else {
      // 情況 b: 若改動的是「自訂賠率」，維持目標利潤不變，反算新的「退水/成本」
      const theoB = calcTheoCost(costB.value.givenOdds, costB.value.subGivenOdds)
      
      // 目標成本 = 目標利潤 + 理論成本
      const computedNewCost = targetProfit.plus(theoB)
      
      const rebateVal = new Decimal(100).minus(computedNewCost).toDecimalPlaces(3, Decimal.ROUND_DOWN)
      costB.value.rebate = rebateVal.toNumber()
      costB.value.cost = new Decimal(100).minus(rebateVal).toNumber()
    }
    
    setTimeout(() => { isSyncingB = false }, 0)
  })
  
  const computedProfitB = computed(() => {
    return new Decimal(costB.value.cost).minus(theoreticalCostB.value).toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber()
  })

  // 現金盤 A/B (單向防禦機制)
  const oddsA_TargetProfit = computed(() => {
    const baseP = play.value.oddsA.baseProfit || 0
    // 利潤基準 (百分比值) 採 4 位捨去，即絕對值 6 位
    return new Decimal(baseP).times(100).plus(deltaProfit.value).toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber()
  })

  // 賠率 B 盤是以 A 盤為基準，疊加其百分比 (例如 20% 即為 A 盤利潤 * 1.2)
  const oddsB_TargetProfit = computed(() => {
    const multiplier = new Decimal(oddsB.value.additionalProfit || 0).dividedBy(100)
    return new Decimal(oddsA_TargetProfit.value).times(new Decimal(1).plus(multiplier)).toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber()
  })

  const calcCashOddsFromProfit = (baseDataKey, targetProfit) => {
    const b = play.value.baseData
    const origConfig = play.value[baseDataKey]
    
    const targetTheoCost = new Decimal(100).minus(new Decimal(targetProfit).toDecimalPlaces(4, Decimal.ROUND_DOWN))
    
    let subGiven = origConfig.subGivenOdds
    let theoCostFromSub = new Decimal(0)
    if (subGiven !== null && b.subTheoreticalOdds && b.subTheoreticalOdds > 0) {
      // 副獎成本採 Ceil 6
      theoCostFromSub = new Decimal(subGiven).dividedBy(b.subTheoreticalOdds).times(100).toDecimalPlaces(6, Decimal.ROUND_UP)
    }
    
    let mainGiven = new Decimal(0)
    const remainingTheo = targetTheoCost.minus(theoCostFromSub)
    if (b.theoreticalOdds > 0) {
      // 最終給定賠率採 Floor 6
      mainGiven = remainingTheo.dividedBy(100).times(b.theoreticalOdds).toDecimalPlaces(6, Decimal.ROUND_DOWN)
    }

    return {
      givenOdds: mainGiven.toNumber(),
      subGivenOdds: subGiven,
      profit: targetProfit,
      theoreticalCost: targetTheoCost.toNumber()
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
    
    oddsB.value.additionalProfit = 20

    // 初始化當下，立即擷取引擎端計算出的絕對精準利潤，並標準化為百分比 4 位捨去
    initialActualProfitA.value = new Decimal(newPlay.costA.baseCost).minus(calcTheoCost(newPlay.costA.givenOdds, newPlay.costA.subGivenOdds)).toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber()

    nextTick(() => { isSyncingB = false })
  }

  return {
    play,
    baseData: play.value.baseData,
    costA,
    theoreticalCostA,
    actualProfitA,
    deltaProfit,
    costB,
    theoreticalCostB,
    computedProfitB,
    computedOddsA,
    oddsA_TargetProfit,
    oddsB,
    computedOddsB,
    oddsB_TargetProfit,
    setPlay,
    deltaProfit
  }
}
