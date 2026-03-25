<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { fetchAllGameData } from './services/excelService'
import { useOddsCalculator } from './composables/useOddsCalculator'
import Multiselect from '@vueform/multiselect'
import '@vueform/multiselect/themes/default.css'
import Decimal from 'decimal.js'

const allData = ref({})
const isLoading = ref(true)
const fetchError = ref(null)

const gamesList = computed(() => Object.keys(allData.value))
const selectedGameName = ref('')
const currentPlays = computed(() => allData.value[selectedGameName.value] || [])

const selectedPlayValue = ref(null)
const manualNumberInput = ref('')
const requiredCatForNumber = ref(null)

// Grouping structure for Multiselect
const groupedOptions = computed(() => {
  const groups = {}
  
  currentPlays.value.forEach((p, idx) => {
    if ((p.baseData.totalCount === 0 || p.baseData.totalCount === null) && p.baseData.theoreticalOdds === 0) return

    let cat = p.category || '一般'
    const isNumInput = cat === '台號' || cat.includes('特尾三') || cat.includes('特三')
    
    if (!groups[cat]) {
      groups[cat] = { label: cat, options: [] }
    }
    
    if (isNumInput) {
      if (groups[cat].options.length === 0) {
        groups[cat].options.push({ value: `NUM_INPUT_${cat}`, label: `【手動指定號碼】 ${cat}` })
      }
    } else {
      groups[cat].options.push({ value: idx, label: p.playType })
    }
  })
  return Object.values(groups)
})

// Initialize Engine with a safe fallback
const dummyPlay = {
  category: '', playType: '',
  baseData: { totalCount: 0, winCount: 0, prob: 0, theoreticalOdds: 0 },
  costA: { givenOdds: 0, baseCost: 0, baseRebate: 0, baseProfit: 0 },
  costB: { givenOdds: 0, baseCost: 0, baseRebate: 0, baseProfit: 0 },
  oddsA: { givenOdds: 0, baseProfit: 0 },
  oddsB: { givenOdds: 0, baseProfit: 0 }
}
const engine = useOddsCalculator(dummyPlay)

async function loadData() {
  isLoading.value = true
  fetchError.value = null
  try {
    const data = await fetchAllGameData()
    allData.value = data
    if (gamesList.value.length > 0 && !selectedGameName.value) {
      selectedGameName.value = gamesList.value[0]
    }
  } catch (err) {
    console.error(err)
    fetchError.value = '資料載入失敗，請檢查網路連線或試算表權限。'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadData()
})

const {
  play,
  costA, theoreticalCostA, actualProfitA, deltaProfit,
  costB, theoreticalCostB, computedProfitB,
  oddsA, computedOddsA,
  oddsB, computedOddsB
} = engine

watch(selectedGameName, () => {
  selectedPlayValue.value = null
  manualNumberInput.value = ''
  requiredCatForNumber.value = null
})

watch(selectedPlayValue, (val) => {
  if (val === null) return

  if (typeof val === 'string' && val.startsWith('NUM_INPUT_')) {
    requiredCatForNumber.value = val.replace('NUM_INPUT_', '')
    manualNumberInput.value = ''
  } else {
    requiredCatForNumber.value = null
    const targetPlay = currentPlays.value[val]
    if (targetPlay) engine.setPlay(targetPlay)
  }
})

watch(manualNumberInput, (newNum) => {
  if (requiredCatForNumber.value && newNum) {
    const formattedNum = newNum.trim()
    const found = currentPlays.value.find(p => p.category === requiredCatForNumber.value && p.playType === formattedNum)
    if (found) {
      engine.setPlay(found)
    }
  }
})

// UI Helpers
const fmtNum = (val, decimals = 2) => val !== null && val !== undefined && !isNaN(val) ? Number(val).toFixed(decimals) : '-'
const fmtFloor = (val, decimals = 6) => val !== null && val !== undefined && !isNaN(val) ? new Decimal(val).toDecimalPlaces(decimals, Decimal.ROUND_DOWN).toFixed(decimals) : '-'
const fmtPerc = (val) => val !== null && val !== undefined && !isNaN(val) ? (val * 100).toFixed(4) + '%' : '-'

const fmtOdds = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '-'
  const num = Number(val)
  const absNum = Math.abs(num)
  const sign = num < 0 ? -1 : 1
  
  if (absNum >= 100) return (sign * Math.floor(absNum)).toFixed(0)
  if (absNum >= 10) return (sign * (Math.floor(absNum * 10) / 10)).toFixed(1)
  return (sign * (Math.floor(absNum * 100) / 100)).toFixed(2)
}

const isNotFoundNumber = computed(() => {
  return requiredCatForNumber.value && manualNumberInput.value && play.value?.playType !== manualNumberInput.value.trim()
})
</script>

<template>
  <div class="app-container">
    <header class="glass-header glass-panel">
      <div>
        <h1 class="logo">彩票變盤試算系統</h1>
        <p class="subtitle">單一錨點連動引擎 (Master-Slave Architecture)</p>
      </div>
      <div class="controls">
        <button class="sync-btn" @click="loadData" :disabled="isLoading" :class="{ 'spinning': isLoading }">
          <span class="icon">🔄</span>
          <span class="text">{{ isLoading ? '同步中...' : '同步數值' }}</span>
        </button>
        <div class="form-group mb-0">
          <label>選擇遊戲</label>
          <select class="native-select" v-model="selectedGameName">
            <option v-for="g in gamesList" :key="g" :value="g">{{ g }}</option>
          </select>
        </div>
        <div class="form-group mb-0 group-select-box">
          <label>指定分類與玩法</label>
          <Multiselect
            v-model="selectedPlayValue"
            :options="groupedOptions"
            :groups="true"
            :searchable="true"
            placeholder="點擊選擇階層分類與對應玩法..."
          />
        </div>
      </div>
    </header>

    <transition name="fade">
      <div v-if="isLoading" class="loading-overlay">
        <div class="loader-box">
          <div class="spinner"></div>
          <p>正在從 Excel 獲取最新資料...</p>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="fetchError" class="error-overlay">
        <div class="error-box">
          <h3>⚠️ Data Fetch Error</h3>
          <p>{{ fetchError }}</p>
          <button @click="loadData">重試 (Retry)</button>
        </div>
      </div>
    </transition>

    <main class="main-content">
      <!-- (號碼輸入區已移至成本 A 盤內) -->

      <div v-if="selectedPlayValue === null" class="empty-state glass-panel" style="text-align: center; padding: 6rem 2rem; color: var(--text-secondary);">
        <div style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;">📊</div>
        <h2 style="font-size: 1.5rem; margin-bottom: 0.75rem; color: var(--text-primary);">請先於右上方選擇分類與對應玩法</h2>
        <p>系統將根據您的選擇，即時載入原始數學模型與四盤連動配置。</p>
      </div>

      <section class="base-data glass-panel" v-if="selectedPlayValue !== null && play && !isNotFoundNumber">
        <h2 class="section-title">原始邏輯數值 (Zero-sum Base) - [{{ play.category }}] {{ play.playType }}</h2>
        <div class="data-grid">
          <div class="data-item">
            <label>總次數 (Total)</label>
            <span class="num">{{ play?.baseData?.totalCount?.toLocaleString() || '-' }}</span>
          </div>
          <div class="data-item">
            <label>主獎次數 (Win)</label>
            <span class="num">{{ play?.baseData?.winCount?.toLocaleString() || '-' }}</span>
          </div>
          <template v-if="play?.baseData?.subWinCount">
            <div class="data-item">
              <label>副獎次數 (Sub)</label>
              <span class="num">{{ play?.baseData?.subWinCount?.toLocaleString() || '-' }}</span>
            </div>
          </template>
          <template v-if="play?.baseData?.drawCount">
            <div class="data-item">
              <label>和局次數 (Draw)</label>
              <span class="num warning">{{ play?.baseData?.drawCount?.toLocaleString() || '-' }}</span>
            </div>
          </template>
          <div class="data-item">
            <label>主獎機率</label>
            <span class="num highlight">{{ fmtPerc(play.baseData.prob) }}</span>
            <small class="formula-hint mt-1">中獎數 ÷ (總次數 - 和局)</small>
          </div>
          <div class="data-item">
            <label>主獎理論賠率</label>
            <span class="num highlight">{{ fmtFloor(play.baseData.theoreticalOdds, 6) }}</span>
            <small class="formula-hint mt-1">(總次數 - 和局) ÷ 中獎數</small>
          </div>
          <template v-if="play.baseData.subProb">
            <div class="data-item">
              <label>副獎機率</label>
              <span class="num warning">{{ fmtPerc(play.baseData.subProb) }}</span>
              <small class="formula-hint mt-1">副獎數 ÷ (總次數 - 和局)</small>
            </div>
            <div class="data-item">
              <label>副獎理論賠率</label>
              <span class="num warning">{{ fmtFloor(play.baseData.subTheoreticalOdds, 6) }}</span>
              <small class="formula-hint mt-1">(總次數 - 和局) ÷ 副獎數</small>
            </div>
          </template>
        </div>
      </section>

      <section class="markets-grid" v-if="selectedPlayValue !== null && play">
        <!-- ================= COST A (MASTER) ================= -->
        <div class="market-panel glass-panel master-panel">
          <div class="panel-header">
            <div class="header-top">
              <h3>成本 A 盤 <span class="badge badge-master">Master 主控</span></h3>
            </div>
            <p class="desc">高退水盤口。此處數值將即刻連動其他三盤。</p>
          </div>
          
          <div class="form-section">
            <transition name="fade-slide">
              <div v-if="requiredCatForNumber" class="form-group mb-4 p-3" style="background: rgba(56, 189, 248, 0.1); border: 1px solid var(--accent-color); border-radius: 8px; text-align: center;">
                 <label class="warning mb-2" style="display:block; color: var(--accent-color) !important;">{{ requiredCatForNumber }} - 手動綁定號碼：</label>
                 <input type="text" v-model="manualNumberInput" style="font-size: 1.25rem; font-weight: bold; text-align: center; width: 100%; padding: 0.5rem; border-radius: 6px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1);" placeholder="例如: 01, 88...">
                 <p v-if="isNotFoundNumber" class="error-msg" style="margin-top: 0.5rem; font-size:0.75rem;">⚠️ 等待完整號碼輸入中...</p>
                 <p v-else-if="manualNumberInput" class="success-msg" style="margin-top: 0.5rem; font-size:0.75rem;">✅ 已載入</p>
              </div>
            </transition>

            <template v-if="!isNotFoundNumber">
            <div class="form-group flex-group">
              <label>給定賠率</label>
              <input type="number" v-model.number="costA.givenOdds" step="0.1" class="border-odds" @focus="$event.target.select()">
            </div>
            <div class="form-group flex-group" v-if="costA.subGivenOdds !== null">
              <label>副獎給定賠率</label>
              <input type="number" v-model.number="costA.subGivenOdds" step="0.1" class="border-odds" @focus="$event.target.select()">
            </div>
            
            <div class="form-group flex-group">
              <label>退水成本設定 (連動互鎖)</label>
              <div class="split-inputs">
                <div>
                  <small>給定退水 (Rebate)</small>
                  <input type="number" v-model.number="costA.rebate" step="0.1" class="border-cost" @focus="$event.target.select()">
                </div>
                <div>
                  <small>給定成本 (Cost)</small>
                  <input type="number" v-model.number="costA.cost" step="0.1" class="border-cost" @focus="$event.target.select()">
                </div>
              </div>
            </div>
            </template>
          </div>

          <div class="result-section flex-grow-end" v-if="!isNotFoundNumber">
            <div class="result-row">
              <label>驅動偏移基準 (Delta)</label>
              <div class="val-col">
                <span class="num highlight">{{ deltaProfit > 0 ? '+' : '' }}{{ fmtNum(deltaProfit, 4) }}%</span>
                <small class="formula-hint">當前利潤 - 初始利潤基準</small>
              </div>
            </div>
            <div class="result-row separator">
              <label>理論成本 (Expected)</label>
              <div class="val-col">
                <span class="num">{{ fmtNum(theoreticalCostA, 6) }}</span>
                <small class="formula-hint">(給定賠率 ÷ 理論賠率) × 100</small>
              </div>
            </div>
            <div class="result-row highlight-row">
              <label>當前利潤</label>
              <div class="val-col">
                <span class="num" :class="actualProfitA >= 0 ? 'profit-pos' : 'text-danger'">
                  {{ fmtNum(actualProfitA, 4) }}%
                </span>
                <small class="formula-hint">給定成本 - 理論成本</small>
              </div>
            </div>
          </div>
        </div>

        <!-- ================= COST B ================= -->
        <div class="market-panel glass-panel slave-panel master-b-panel" v-if="!isNotFoundNumber">
          <div class="panel-header">
            <div class="header-top">
              <h3>成本 B 盤 <span class="badge badge-slave">連動調盤</span></h3>
              <div class="top-right-input">
                <label>疊加設定</label>
                <div class="input-suffix small-input">
                  <input type="number" v-model.number="costB.additionalProfit" step="0.1" class="border-odds" @focus="$event.target.select()">
                  <span>%</span>
                </div>
              </div>
            </div>
            <p class="desc">維持追隨 A 盤利潤，或手動干預自動反推補足差額。</p>
          </div>
          
          <div class="form-section">
            <div class="form-group flex-group">
              <label>自訂高賠率目標</label>
              <input type="number" v-model.number="costB.givenOdds" step="0.1" class="border-odds" @focus="$event.target.select()">
            </div>
            <div class="form-group flex-group" v-if="costB.subGivenOdds !== null">
              <label>自訂副獎賠率</label>
              <input type="number" v-model.number="costB.subGivenOdds" step="0.1" class="border-odds" @focus="$event.target.select()">
            </div>
            
            <div class="form-group flex-group mt-3">
              <label>反算與手動退水覆蓋</label>
              <div class="split-inputs">
                <div>
                  <small>給定退水</small>
                  <input type="number" v-model.number="costB.rebate" step="0.001" class="border-cost" @focus="$event.target.select()">
                </div>
                <div>
                  <small>給定成本</small>
                  <input type="number" v-model.number="costB.cost" step="0.001" class="border-cost" @focus="$event.target.select()">
                </div>
              </div>
            </div>
          </div>

          <div class="result-section flex-grow-end">
             <div class="data-row separator">
                <label>目標理論成本</label>
                <div class="val-col">
                  <span class="num">{{ fmtNum(theoreticalCostB, 6) }}</span>
                  <small class="formula-hint">(自訂賠率 ÷ 理論賠率) × 100</small>
                </div>
              </div>
              <div class="data-row highlight-row">
                 <label>當前利潤</label>
                 <div class="val-col">
                   <span class="num" :class="computedProfitB >= 0 ? 'profit-pos' : 'text-danger'">
                     {{ fmtNum(computedProfitB, 4) }}%
                   </span>
                   <small class="formula-hint">給定成本 - 目標理論成本</small>
                 </div>
              </div>
          </div>
        </div>

        <!-- ================= ODDS A ================= -->
        <div class="market-panel glass-panel slave-panel" v-if="!isNotFoundNumber">
          <div class="panel-header">
            <div class="header-top">
              <h3>賠率 A 盤 <span class="badge badge-slave">連動調盤</span></h3>
              <!-- (已依要求移除利潤疊加設定) -->
            </div>
            <p class="desc">現金玩法。隨 A 盤利潤推算派彩賠率。</p>
          </div>
          
          <div class="form-section">
            <div class="data-box mb-4">
              <div class="data-row box-highlight">
                <label>反推現金最高賠率</label>
                <div class="val-col">
                  <span class="num highlight" :class="{ 'text-danger': computedOddsA.givenOdds < 0 }">{{ fmtOdds(computedOddsA.givenOdds) }}</span>
                  <small class="formula-hint">(100 - 利潤 - 副獎成本) ÷ 100 × 主獎理論賠率</small>
                </div>
              </div>
              <div class="data-row" v-if="computedOddsA.subGivenOdds !== null">
                <label>保留副獎賠率</label>
                <div class="val-col">
                  <span class="num warning">{{ fmtNum(computedOddsA.subGivenOdds) }}</span>
                  <small class="formula-hint">固定繼承 A 盤</small>
                </div>
              </div>
            </div>
          </div>

          <div class="result-section flex-grow-end">
            <div class="data-row separator">
              <label>主獎理論賠率</label>
              <div class="val-col">
                <span class="num">{{ fmtNum(play?.baseData?.theoreticalOdds, 6) }}</span>
                <small class="formula-hint">繼承原始理論賠率</small>
              </div>
            </div>
            <div class="data-row" v-if="play?.baseData?.subTheoreticalOdds">
              <label>副獎理論賠率</label>
              <div class="val-col">
                <span class="num">{{ fmtNum(play?.baseData?.subTheoreticalOdds, 6) }}</span>
                <small class="formula-hint">繼承原始理論賠率</small>
              </div>
            </div>
            <div class="data-row highlight-row mt-2">
              <label>當前利潤</label>
              <div class="val-col">
                <span class="num" :class="computedOddsA.profit >= 0 ? 'profit-pos' : 'text-danger'">
                  {{ fmtNum(computedOddsA.profit, 4) }}%
                </span>
                <small class="formula-hint">A盤初始利潤 + 偏移差值(Δ)</small>
              </div>
            </div>
          </div>
        </div>

        <!-- ================= ODDS B ================= -->
        <div class="market-panel glass-panel slave-panel" v-if="!isNotFoundNumber">
          <div class="panel-header">
            <div class="header-top">
              <h3>賠率 B 盤 <span class="badge badge-slave">連動調盤</span></h3>
              <div class="top-right-input">
                <label>疊加設定</label>
                <div class="input-suffix small-input">
                  <input type="number" v-model.number="oddsB.additionalProfit" step="0.1" class="border-odds" @focus="$event.target.select()">
                  <span>%</span>
                </div>
              </div>
            </div>
            <p class="desc">現金玩法。隨 A 盤利潤推算派彩賠率。</p>
          </div>
          
          <div class="form-section">
            <div class="data-box mb-4">
              <div class="data-row box-highlight">
                <label>反推現金最高賠率</label>
                <div class="val-col">
                  <span class="num highlight" :class="{ 'text-danger': computedOddsB.givenOdds < 0 }">{{ fmtOdds(computedOddsB.givenOdds) }}</span>
                  <small class="formula-hint">(100 - 利潤 - 副獎成本) ÷ 100 × 主獎理論賠率</small>
                </div>
              </div>
              <div class="data-row" v-if="computedOddsB.subGivenOdds !== null">
                <label>保留副獎賠率</label>
                <div class="val-col">
                  <span class="num warning">{{ fmtNum(computedOddsB.subGivenOdds) }}</span>
                  <small class="formula-hint">固定繼承 A 盤</small>
                </div>
              </div>
            </div>
          </div>

          <div class="result-section flex-grow-end">
            <div class="data-row separator">
              <label>主獎理論賠率</label>
              <div class="val-col">
                <span class="num">{{ fmtNum(play?.baseData?.theoreticalOdds, 6) }}</span>
                <small class="formula-hint">繼承原始理論賠率</small>
              </div>
            </div>
            <div class="data-row" v-if="play?.baseData?.subTheoreticalOdds">
              <label>副獎理論賠率</label>
              <div class="val-col">
                <span class="num">{{ fmtNum(play?.baseData?.subTheoreticalOdds, 6) }}</span>
                <small class="formula-hint">繼承原始理論賠率</small>
              </div>
            </div>
            <div class="data-row highlight-row mt-2">
              <label>當前利潤</label>
              <div class="val-col">
                <span class="num" :class="computedOddsB.profit >= 0 ? 'profit-pos' : 'text-danger'">
                  {{ fmtNum(computedOddsB.profit, 4) }}%
                </span>
                <small class="formula-hint">賠率A當前利潤 × (1 + 疊加%)</small>
              </div>
            </div>
          </div>
        </div>

      </section>
    </main>
  </div>
</template>

<style scoped>
.app-container {
  max-width: 1600px;
  margin: 0 auto;
  padding: 2rem;
}

.glass-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  position: relative;
  z-index: 100;
}

.logo {
  font-size: 1.5rem;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.subtitle {
  color: var(--accent-color);
  font-size: 0.875rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.controls {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 650px;
}

.controls .form-group {
  flex: 1;
}
.group-select-box {
  flex: 2 !important;
}

.native-select {
  height: 40px;
}

/* Sync Button */
.sync-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.3);
  color: var(--accent-color);
  padding: 0 1rem;
  height: 40px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
  margin-top: 1.25rem; /* Match label height alignment */
}
.sync-btn:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.2);
  border-color: var(--accent-color);
  transform: translateY(-2px);
}
.sync-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.spinning .icon {
  display: inline-block;
  animation: rotate 1.5s linear infinite;
}
@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Overlays */
.loading-overlay, .error-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.8);
  backdrop-filter: blur(10px);
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
}
.loader-box, .error-box {
  text-align: center;
  background: rgba(255, 255, 255, 0.05);
  padding: 3rem;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}
.spinner {
  width: 50px;
  height: 50px;
  border: 3px solid rgba(56, 189, 248, 0.1);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: rotate 1s linear infinite;
  margin: 0 auto 1.5rem;
}
.error-box h3 { color: var(--danger-color); margin-bottom: 1rem; }
.error-box button {
  margin-top: 1.5rem;
  padding: 0.75rem 2rem;
  background: var(--accent-color);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.5s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.mb-0 { margin-bottom: 0 !important; }
.mb-4 { margin-bottom: 1.5rem !important; }
.mt-3 { margin-top: 1rem; }

.section-title {
  font-size: 1.1rem;
  color: var(--text-secondary);
  margin-bottom: 1rem;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.manual-num-panel {
  text-align: center;
  border-color: rgba(56, 189, 248, 0.4);
  background: rgba(56, 189, 248, 0.05);
  box-shadow: 0 0 20px rgba(56, 189, 248, 0.1);
}
.manual-num-panel h2 { margin-bottom: 1rem; }
.large-input {
  font-size: 1.8rem;
  text-align: center;
  width: 300px;
  padding: 1rem;
  border-radius: 12px;
  background: rgba(0,0,0,0.4);
}
.error-msg { margin-top: 0.5rem; color: var(--danger-color); font-size: 0.85rem;}
.success-msg { margin-top: 0.5rem; color: var(--success-color); font-size: 0.85rem;}

.data-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
}

.data-item {
  display: flex;
  flex-direction: column;
}
.data-item label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-transform: uppercase;
}
.data-item .num {
  font-size: 1.5rem;
}
.warning { color: var(--warning-color) !important; }
.profit-pos { color: var(--success-color, #4ade80); }
.text-danger { color: var(--danger-color, #ef4444); font-weight: bold; }

.markets-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.5rem;
  margin-top: 2rem;
}

.market-panel {
  display: flex;
  flex-direction: column;
}

.panel-header {
  margin-bottom: 1.5rem;
}
.header-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.top-right-input {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
}
.top-right-input label {
  font-size: 0.7rem;
  color: var(--accent-color);
  text-transform: uppercase;
}
.small-input {
  width: 90px;
  height: 28px;
}
.small-input input {
  font-size: 0.85rem;
  text-align: right;
  padding-right: 0.25rem;
}
.small-input span {
  padding: 0 0.5rem;
  font-size: 0.75rem;
}

.panel-header h3 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.25rem;
}
.badge {
  font-size: 0.65rem;
  padding: 0.25rem 0.6rem;
  border-radius: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.badge-master {
  background: rgba(248, 113, 113, 0.2);
  color: var(--danger-color);
  border: 1px solid rgba(248, 113, 113, 0.4);
}
.badge-slave {
  background: rgba(56, 189, 248, 0.2);
  color: var(--accent-color);
  border: 1px solid rgba(56, 189, 248, 0.4);
}
.desc {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-top: 0.5rem;
  height: 2.4rem;
}

.val-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.formula-hint {
  display: block;
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.2;
  font-family: 'Roboto Mono', monospace;
  letter-spacing: 0.3px;
  font-weight: normal;
  margin-top: 2px;
}

.master-panel {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
  box-shadow: 0 0 30px rgba(248, 113, 113, 0.05);
}

.master-b-panel {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(251, 191, 36, 0.3);
}
.border-odds { border: 1px dashed var(--warning-color) !important; background: rgba(251, 191, 36, 0.05) !important; }
.border-cost { border: 1px dashed var(--accent-color) !important; background: rgba(56, 189, 248, 0.05) !important; }

.split-inputs {
  display: flex;
  gap: 0.5rem;
}
.split-inputs > div { flex: 1; }
.split-inputs small {
  display: block;
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-bottom: 0.25rem;
}

.input-suffix {
  display: flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}
.input-suffix input {
  border: none;
  background: transparent;
  flex: 1;
}
.input-suffix span {
  color: var(--text-secondary);
  font-family: 'Roboto Mono', monospace;
  background: rgba(255, 255, 255, 0.05);
}

.result-section {
  margin-top: auto;
  padding-top: 1.5rem;
}
.flex-grow-end {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  height: 100%;
}

.result-row, .data-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.4rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.result-row:last-child, .data-row:last-child {
  border-bottom: none;
}
.result-row label, .data-row label {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.highlight-row {
  background: rgba(74, 222, 128, 0.1);
  margin: 0.5rem -1rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border: 1px solid rgba(74, 222, 128, 0.2);
}

.divider {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 1.25rem 0;
}

.data-box {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.05);
}
.box-highlight {
  border-bottom: 1px solid rgba(56, 189, 248, 0.3) !important;
  margin-bottom: 0.5rem;
  padding-bottom: 0.5rem;
}
.box-highlight label {
  color: var(--accent-color) !important;
  font-weight: 500;
}
.box-highlight .num {
  font-size: 1.25rem;
}

.separator {
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
  margin-top: 0.5rem;
  padding-top: 0.5rem;
}

/* Override multiselect theme for Glassmorphism */
:deep(.multiselect) {
  --ms-bg: rgba(0, 0, 0, 0.4);
  --ms-border-color: rgba(255, 255, 255, 0.1);
  --ms-dropdown-bg: #1e293b;
  --ms-dropdown-border-color: rgba(255, 255, 255, 0.1);
  --ms-option-bg-pointed: rgba(56, 189, 248, 0.2);
  --ms-option-bg-selected: #38bdf8;
  --ms-option-color-pointed: #fff;
  --ms-option-color-selected: #fff;
  --ms-font-color: #fff;
  --ms-ring-color: rgba(56, 189, 248, 0.3);
  --ms-radius: 6px;
  height: 40px;
}
:deep(.multiselect-dropdown) {
  z-index: 9999 !important;
}
:deep(.multiselect-group-label) {
  background: #0f172a;
  color: var(--accent-color);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
}
</style>
