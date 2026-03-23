<script setup>
import { ref, computed, watch } from 'vue'
import allData from './assets/data.json'
import { useOddsCalculator } from './composables/useOddsCalculator'

const gamesList = Object.keys(allData)
const selectedGameName = ref(gamesList[0])

const currentPlays = computed(() => allData[selectedGameName.value] || [])
const selectedPlayIndex = ref(0) // Default to first (e.g., '二星')

watch(selectedGameName, () => {
  selectedPlayIndex.value = 0
})

const selectedPlayData = computed(() => {
  if (currentPlays.value.length === 0) return null
  return currentPlays.value[selectedPlayIndex.value]
})

// Initialize Engine
const engine = useOddsCalculator(currentPlays.value[0])

watch(selectedPlayData, (newPlay) => {
  if (newPlay) {
    engine.setPlay(newPlay)
  }
})

const {
  play, baseData,
  costA, theoreticalCostA, actualProfitA, deltaProfit,
  costB, computedCostB,
  oddsA, computedOddsA,
  oddsB, computedOddsB
} = engine

// Formatters
const fmtNum = (val, decimals = 2) => val !== null && val !== undefined ? Number(val).toFixed(decimals) : '-'
const fmtPerc = (val) => val !== null && val !== undefined ? (val * 100).toFixed(4) + '%' : '-'

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
          <select v-model="selectedGameName">
            <option v-for="g in gamesList" :key="g" :value="g">{{ g }}</option>
          </select>
        </div>
        <div class="form-group mb-0">
          <label>選擇玩法</label>
          <select v-model="selectedPlayIndex">
            <option v-for="(p, i) in currentPlays" :key="i" :value="i">[{{ p.category }}] {{ p.playType }}</option>
          </select>
        </div>
      </div>
    </header>

    <main class="main-content" v-if="play">
      <!-- 基礎資料 -->
      <section class="base-data glass-panel">
        <h2 class="section-title">原始邏輯數值 (Zero-sum Base)</h2>
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
      <section class="markets-grid">
        <!-- ================= COST A (MASTER) ================= -->
        <div class="market-panel glass-panel master-panel">
          <div class="panel-header">
            <h3>成本 A 盤 <span class="badge badge-master">Master 主控</span></h3>
            <p class="desc">高退水盤口。變動此盤口數值將即時連動其他三盤。</p>
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

          <div class="result-section">
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
              <label>衍生盤口基準 (Delta)</label>
              <span class="num highlight">{{ deltaProfit > 0 ? '+' : '' }}{{ fmtNum(deltaProfit, 4) }}%</span>
            </div>
            
            <hr class="divider">
            <div class="form-group">
              <label>利潤疊加 (Additional Margin)</label>
              <div class="input-suffix">
                <input type="number" v-model.number="costA.additionalProfit" step="0.1">
                <span>%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ================= COST B ================= -->
        <div class="market-panel glass-panel slave-panel">
          <div class="panel-header">
            <h3>成本 B 盤 <span class="badge badge-slave">連動</span></h3>
            <p class="desc">高賠率盤口。系統自動反推退水以維持等同 A 盤的利潤率。</p>
          </div>
          
          <div class="readonly-section">
            <div class="data-row">
              <label>目標給定賠率</label>
              <span class="num highlight">{{ fmtNum(computedCostB.givenOdds) }}</span>
            </div>
            <div class="data-row" v-if="computedCostB.subGivenOdds !== null">
              <label>目標副獎給定賠率</label>
              <span class="num warning">{{ fmtNum(computedCostB.subGivenOdds) }}</span>
            </div>
            
            <div class="data-box mt-4">
              <div class="data-row box-highlight">
                <label>反推給定退水</label>
                <span class="num highlight">{{ fmtNum(computedCostB.rebate) }}</span>
              </div>
              <div class="data-row">
                <label>反推給定成本</label>
                <span class="num">{{ fmtNum(computedCostB.cost) }}</span>
              </div>
              <div class="data-row separator">
                <label>目標理論成本</label>
                <span class="num">{{ fmtNum(computedCostB.theoreticalCost) }}</span>
              </div>
              <div class="data-row">
                 <label>鎖定目標利潤</label>
                 <span class="num profit-pos">{{ fmtNum(computedCostB.profit, 4) }}%</span>
              </div>
            </div>
          </div>

          <div class="result-section flex-grow-end">
            <hr class="divider">
            <div class="form-group">
              <label>利潤疊加 (自訂溢價)</label>
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
            <p class="desc">現金玩法。隨 A 盤利潤變化，自動反推新的最高派彩賠率。</p>
          </div>
          
          <div class="readonly-section">
            <div class="data-box mb-4">
              <div class="data-row box-highlight">
                <label>反推給定賠率</label>
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
            <p class="desc">現金玩法。隨 A 盤利潤變化，自動反推新的最高派彩賠率。</p>
          </div>
          
          <div class="readonly-section">
            <div class="data-box mb-4">
              <div class="data-row box-highlight">
                <label>反推給定賠率</label>
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
  min-width: 400px;
}

.controls .form-group {
  flex: 1;
}

.mb-0 { margin-bottom: 0 !important; }
.mt-4 { margin-top: 1rem; }

.section-title {
  font-size: 1.1rem;
  color: var(--text-secondary);
  margin-bottom: 1rem;
  text-transform: uppercase;
  letter-spacing: 1px;
}

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
.warning { color: var(--warning-color); }

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
}

.result-row, .data-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
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
  margin: 1.5rem 0;
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
</style>
