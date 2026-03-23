<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import allData from './assets/data.json'
import { useOddsCalculator } from './composables/useOddsCalculator'
import Multiselect from '@vueform/multiselect'
import '@vueform/multiselect/themes/default.css'

const gamesList = Object.keys(allData)
const selectedGameName = ref(gamesList[0])
const currentPlays = computed(() => allData[selectedGameName.value] || [])

const selectedPlayValue = ref(null)
const manualNumberInput = ref('')
const requiredCatForNumber = ref(null) // e.g., '台號'

// Grouping structure for Multiselect
const groupedOptions = computed(() => {
  const groups = {}
  
  currentPlays.value.forEach((p, idx) => {
    // 屏除「部份遊戲沒有『特碼』的玩法（無總次數且無機率）」
    if ((p.baseData.totalCount === 0 || p.baseData.totalCount === null) && p.baseData.theoreticalOdds === 0) return

    let cat = p.category || '一般'
    const isNumInput = cat === '台號' || cat.includes('特尾三') || cat.includes('特三')
    
    if (!groups[cat]) {
      groups[cat] = { label: cat, options: [] }
    }
    
    if (isNumInput) {
      if (groups[cat].options.length === 0) {
        // 只留一個代表性的入口放入下拉
        groups[cat].options.push({ value: `NUM_INPUT_${cat}`, label: `【手動指定號碼】 ${cat}` })
      }
    } else {
      groups[cat].options.push({ value: idx, label: p.playType })
    }
  })
  return Object.values(groups)
})

// Initialize Engine with a safe fallback
const engine = useOddsCalculator(currentPlays.value[1] || currentPlays.value[0])

const {
  play, baseData,
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
    manualNumberInput.value = '' // 清空讓玩家準備輸入
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
const fmtPerc = (val) => val !== null && val !== undefined && !isNaN(val) ? (val * 100).toFixed(4) + '%' : '-'

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
        <div class="form-group mb-0">
          <label>選擇遊戲</label>
          <select class="native-select" v-model="selectedGameName">
            <option v-for="g in gamesList" :key="g" :value="g">{{ g }}</option>
          </select>
        </div>
        <div class="form-group mb-0 group-select-box">
          <label>指定分類與玩法</label>
          <!-- 群組階層樹狀下拉單 -->
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

    <main class="main-content">
      <!-- 若選中台號，強迫卡特尾輸入框 -->
      <div v-if="requiredCatForNumber" class="glass-panel manual-num-panel mb-4">
         <h2>{{ requiredCatForNumber }} - 請輸入欲查詢號碼</h2>
         <input type="text" v-model="manualNumberInput" class="large-input" placeholder="例如: 01, 88...">
         <p v-if="isNotFoundNumber" class="error-msg">⚠️ 查無該號碼資料，請輸入有效號碼，或等待輸入完成。</p>
         <p v-else-if="manualNumberInput" class="success-msg">✅ 載入成功！目前顯示號碼 {{ manualNumberInput }} 數據</p>
      </div>

      <!-- 基礎資料 -->
      <section class="base-data glass-panel" v-if="play && !isNotFoundNumber">
        <h2 class="section-title">原始邏輯數值 (Zero-sum Base) - [{{ play.category }}] {{ play.playType }}</h2>
        <div class="data-grid">
          <div class="data-item">
            <label>資料筆數</label>
            <span class="num">{{ play?.baseData?.totalCount?.toLocaleString() || '-' }}</span>
          </div>
          <div class="data-item">
            <label>主獎機率</label>
            <span class="num highlight">{{ fmtPerc(play.baseData.prob) }}</span>
          </div>
          <div class="data-item">
            <label>主獎理論賠率</label>
            <span class="num highlight">{{ fmtNum(play.baseData.theoreticalOdds, 4) }}</span>
          </div>
          <template v-if="play.baseData.subProb">
            <div class="data-item">
              <label>副獎機率</label>
              <span class="num warning">{{ fmtPerc(play.baseData.subProb) }}</span>
            </div>
            <div class="data-item">
              <label>副獎理論賠率</label>
              <span class="num warning">{{ fmtNum(play.baseData.subTheoreticalOdds, 4) }}</span>
            </div>
          </template>
        </div>
      </section>

      <!-- 變盤引擎操作區 (4 Columns) -->
      <section class="markets-grid" v-if="play && !isNotFoundNumber">
        <!-- ================= COST A (MASTER) ================= -->
        <div class="market-panel glass-panel master-panel">
          <div class="panel-header">
            <h3>成本 A 盤 <span class="badge badge-master">Master 主控</span></h3>
            <p class="desc">高退水盤口。變動此處將即時連動其他三盤。</p>
          </div>
          
          <div class="form-section">
            <div class="form-group flex-group">
              <label>給定賠率</label>
              <input type="number" v-model.number="costA.givenOdds" step="0.1">
            </div>
            <div class="form-group flex-group" v-if="costA.subGivenOdds !== null">
              <label>副獎給定賠率</label>
              <input type="number" v-model.number="costA.subGivenOdds" step="0.1">
            </div>
            
            <div class="form-group flex-group">
              <label>退水成本連動</label>
              <div class="split-inputs">
                <div>
                  <small>給定退水 (Rebate)</small>
                  <input type="number" v-model.number="costA.rebate" step="0.1">
                </div>
                <div>
                  <small>給定成本 (Cost)</small>
                  <input type="number" v-model.number="costA.cost" step="0.1">
                </div>
              </div>
            </div>
          </div>

          <div class="result-section flex-grow-end">
            <div class="result-row">
              <label>理論成本 (Expected)</label>
              <span class="num">{{ fmtNum(theoreticalCostA) }}</span>
            </div>
            <div class="result-row highlight-row">
              <label>實際利潤 (%)</label>
              <span class="num" :class="actualProfitA >= 0 ? 'profit-pos' : 'profit-neg'">
                {{ fmtNum(actualProfitA, 4) }}%
              </span>
            </div>
            <div class="result-row">
              <label>驅動用偏移基準 (Delta)</label>
              <span class="num highlight">{{ deltaProfit > 0 ? '+' : '' }}{{ fmtNum(deltaProfit, 4) }}%</span>
            </div>
            <!-- User requested to remove Additional Profit from Cost A -->
          </div>
        </div>

        <!-- ================= COST B ================= -->
        <div class="market-panel glass-panel slave-panel master-b-panel">
          <div class="panel-header">
            <h3>成本 B 盤 <span class="badge badge-slave">進階干預</span></h3>
            <p class="desc">預設隨 A 盤利潤連動，也可透過手動填入直接改變 B 盤退水</p>
          </div>
          
          <div class="form-section">
            <div class="form-group flex-group">
              <label>自訂高賠率目標</label>
              <input type="number" v-model.number="costB.givenOdds" step="0.1" class="border-accent">
            </div>
            <div class="form-group flex-group" v-if="costB.subGivenOdds !== null">
              <label>自訂副獎賠率</label>
              <input type="number" v-model.number="costB.subGivenOdds" step="0.1" class="border-accent">
            </div>
            
            <div class="form-group flex-group mt-3">
              <label>反算與手動退水覆蓋</label>
              <div class="split-inputs">
                <div>
                  <small>給定退水 (可編輯)</small>
                  <input type="number" v-model.number="costB.rebate" step="0.1" class="border-warning">
                </div>
                <div>
                  <small>給定成本 (Cost)</small>
                  <input type="number" v-model.number="costB.cost" step="0.1">
                </div>
              </div>
            </div>
          </div>

          <div class="result-section flex-grow-end">
             <div class="data-row separator">
                <label>目標理論成本</label>
                <span class="num">{{ fmtNum(theoreticalCostB) }}</span>
              </div>
              <div class="data-row highlight-row">
                 <label>當前 B 盤利潤</label>
                 <span class="num profit-pos">{{ fmtNum(computedProfitB, 4) }}%</span>
              </div>
            <hr class="divider">
            <div class="form-group">
              <label>利潤疊加 (被動推算 / 或手動干預)</label>
              <div class="input-suffix">
                <input type="number" v-model.number="costB.additionalProfit" step="0.1">
                <span>%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ================= ODDS A ================= -->
        <div class="market-panel glass-panel slave-panel">
          <div class="panel-header">
            <h3>賠率 A 盤 <span class="badge badge-slave">連動</span></h3>
            <p class="desc">現金玩法。隨 A 盤利潤變化，自動反推新的派彩賠率。</p>
          </div>
          
          <div class="readonly-section">
            <div class="data-box mb-4">
              <div class="data-row box-highlight">
                <label>反推現金最高賠率</label>
                <span class="num highlight">{{ fmtNum(computedOddsA.givenOdds) }}</span>
              </div>
              <div class="data-row" v-if="computedOddsA.subGivenOdds !== null">
                <label>保留副獎賠率</label>
                <span class="num warning">{{ fmtNum(computedOddsA.subGivenOdds) }}</span>
              </div>
            </div>
            
            <div class="data-row">
              <label>目標理論成本</label>
              <span class="num">{{ fmtNum(computedOddsA.theoreticalCost) }}</span>
            </div>
            <div class="data-row">
              <label>鎖定目標利潤</label>
              <span class="num profit-pos">{{ fmtNum(computedOddsA.profit, 4) }}%</span>
            </div>
          </div>

          <div class="result-section flex-grow-end">
            <hr class="divider">
            <div class="form-group">
              <label>利潤疊加 (自訂溢價)</label>
              <div class="input-suffix">
                <input type="number" v-model.number="oddsA.additionalProfit" step="0.1">
                <span>%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ================= ODDS B ================= -->
        <div class="market-panel glass-panel slave-panel">
          <div class="panel-header">
            <h3>賠率 B 盤 <span class="badge badge-slave">連動</span></h3>
            <p class="desc">現金玩法。隨 A 盤利潤變化，自動反推新的派彩賠率。</p>
          </div>
          
          <div class="readonly-section">
            <div class="data-box mb-4">
              <div class="data-row box-highlight">
                <label>反推現金最高賠率</label>
                <span class="num highlight">{{ fmtNum(computedOddsB.givenOdds) }}</span>
              </div>
              <div class="data-row" v-if="computedOddsB.subGivenOdds !== null">
                <label>保留副獎賠率</label>
                <span class="num warning">{{ fmtNum(computedOddsB.subGivenOdds) }}</span>
              </div>
            </div>
            
            <div class="data-row">
              <label>目標理論成本</label>
              <span class="num">{{ fmtNum(computedOddsB.theoreticalCost) }}</span>
            </div>
            <div class="data-row">
              <label>鎖定目標利潤</label>
              <span class="num profit-pos">{{ fmtNum(computedOddsB.profit, 4) }}%</span>
            </div>
          </div>

          <div class="result-section flex-grow-end">
            <hr class="divider">
            <div class="form-group">
              <label>利潤疊加 (自訂溢價)</label>
              <div class="input-suffix">
                <input type="number" v-model.number="oddsB.additionalProfit" step="0.1">
                <span>%</span>
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
  gap: 1rem;
  width: 500px;
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

.master-panel {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
  box-shadow: 0 0 30px rgba(248, 113, 113, 0.05);
}

.master-b-panel {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(251, 191, 36, 0.3);
}
.border-accent { border: 1px solid var(--accent-color) !important;}
.border-warning { border: 1px dashed var(--warning-color) !important;}

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
  padding: 0 0.75rem;
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
:deep(.multiselect-group-label) {
  background: #0f172a;
  color: var(--accent-color);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
}
</style>
