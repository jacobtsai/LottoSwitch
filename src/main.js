import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

// 全域監聽 Focus 事件，當任何 input 被選中時自動全選文字
window.addEventListener('focusin', (e) => {
  if (e.target && e.target.tagName === 'INPUT' && (e.target.type === 'text' || e.target.type === 'number')) {
    e.target.select()
  }
})

createApp(App).mount('#app')
