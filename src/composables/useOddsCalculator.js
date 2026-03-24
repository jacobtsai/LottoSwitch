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
    return new Decimal(costA.value.cost).minus(theoreticalCostA.value).toDecimalPlaces(6, Decimal.ROUND_DOWN).toNumber()
  })
  
  // Delta (偏移基準) 現在嚴格對齊「引擎初始化時算出的數學真值」，消除與 CSV 字串的四捨五入誤差
  const deltaProfit = computed(() => {
    return new Decimal(actualProfitA.value).minus(initialActualProfitA.value).toDecimalPlaces(6, Decimal.ROUND_DOWN).toNumber()
  })

  const theoreticalCostB = computed(() => calcTheoCost(costB.value.givenOdds, costB.value.subGivenOdds))

  // 雙向綁定的防無限迴圈鎖
  let isSyncingB = false

  // 1. MASTER 驅動更新 (A盤利潤變動，或使用者手動調整「利潤疊加」時)：鎖死利潤，全自動配合新算式去更改 B 盤的退水/成本
  watch([actualProfitA, () => costB.value.additionalProfit], () => {
    if (isSyncingB) return
    isSyncingB = true
    
    const theoB = calcTheoCost(costB.value.givenOdds, costB.value.subGivenOdds)
    const multiplier = new Decimal(costB.value.additionalProfit || 0).dividedBy(100)
    const targetProfit = new Decimal(actualProfitA.value).times(new Decimal(1).plus(multiplier)).toDecimalPlaces(6, Decimal.ROUND_DOWN)
    const newCost = targetProfit.plus(theoB)
    
    // 成本 B 盤精度標準化為 3 位，退水採捨去
    const rebateVal = new Decimal(100).minus(newCost).toDecimalPlaces(3, Decimal.ROUND_DOWN)
    costB.value.rebate = rebateVal.toNumber()
    costB.value.cost = new Decimal(100).minus(rebateVal).toNumber()
    
    setTimeout(() => { isSyncingB = false }, 0)
  })

  // 2. 使用者手動干預 B 盤參數 (賠率 / 退水 / 成本)：打破利潤鎖定，允許當前利潤產生變化，並反推「利潤疊加」來吸收差異
  watch([() => costB.value.givenOdds, () => costB.value.subGivenOdds, () => costB.value.rebate, () => costB.value.cost], ([newOdds, newSubOdds, newRebate, newCost], [oldOdds, oldSubOdds, oldR, oldC]) => {
    if (isSyncingB) return
    isSyncingB = true

    // 若使用者動的是【退水】或【成本】，要先互相連動
    if (newRebate !== oldR) {
      // 退水、成本精度統一為 3 位數，退水強制捨去
      costB.value.rebate = new Decimal(newRebate).toDecimalPlaces(3, Decimal.ROUND_DOWN).toNumber()
      costB.value.cost = new Decimal(100).minus(costB.value.rebate).toNumber()
      newCost = costB.value.cost
    } else if (newCost !== oldC) {
      // 若動的是成本，則退水由 100 - 成本 並進行捨去
      const calcRebate = new Decimal(100).minus(newCost).toDecimalPlaces(3, Decimal.ROUND_DOWN)
      costB.value.rebate = calcRebate.toNumber()
      costB.value.cost = new Decimal(100).minus(calcRebate).toNumber()
    }

    // 重算干預後的真實利潤
    const theoB = calcTheoCost(costB.value.givenOdds, costB.value.subGivenOdds)
    const currentActualProfitB = new Decimal(newCost).minus(theoB)
    
    // 反向倒推出這個操作製造了多少利潤百分比，寫入 additionalProfit 吸收
    let newAddProfit = new Decimal(0)
    if (actualProfitA.value !== 0) {
      newAddProfit = currentActualProfitB.dividedBy(actualProfitA.value).minus(1).times(100)
    } else {
      newAddProfit = new Decimal(costB.value.additionalProfit || 0)
    }
    // 預防浮點數無限連鎖更新
    if (new Decimal(costB.value.additionalProfit || 0).minus(newAddProfit).abs().greaterThan(0.000001)) {
      costB.value.additionalProfit = newAddProfit.toDecimalPlaces(6, Decimal.ROUND_DOWN).toNumber()
    }
    
    setTimeout(() => { isSyncingB = false }, 0)
  })
  
  const computedProfitB = computed(() => {
    return new Decimal(costB.value.cost).minus(theoreticalCostB.value).toDecimalPlaces(6, Decimal.ROUND_DOWN).toNumber()
  })

  // 現金盤 A/B (單向防禦機制)
  const oddsA_TargetProfit = computed(() => {
    const baseP = play.value.oddsA.baseProfit || 0
    // 利潤基準亦需標準化 (6位捨去)
    return new Decimal(baseP).times(100).plus(deltaProfit.value).toDecimalPlaces(6, Decimal.ROUND_DOWN).toNumber()
  })

  // 賠率 B 盤是以 A 盤為基準，疊加其百分比 (例如 20% 即為 A 盤利潤 * 1.2)
  const oddsB_TargetProfit = computed(() => {
    const multiplier = new Decimal(oddsB.value.additionalProfit || 0).dividedBy(100)
    return new Decimal(oddsA_TargetProfit.value).times(new Decimal(1).plus(multiplier)).toDecimalPlaces(6, Decimal.ROUND_DOWN).toNumber()
  })

  const calcCashOddsFromProfit = (baseDataKey, targetProfit) => {
    const b = play.value.baseData
    const origConfig = play.value[baseDataKey]
    
    const targetTheoCost = new Decimal(100).minus(new Decimal(targetProfit).toDecimalPlaces(6, Decimal.ROUND_DOWN))
    
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

    // 初始化當下，立即擷取引擎端計算出的絕對精準利潤，並標準化為 6 位小數無條件捨去
    initialActualProfitA.value = new Decimal(newPlay.costA.baseCost).minus(calcTheoCost(newPlay.costA.givenOdds, newPlay.costA.subGivenOdds)).toDecimalPlaces(6, Decimal.ROUND_DOWN).toNumber()

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
