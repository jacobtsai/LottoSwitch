import Papa from 'papaparse';
import Decimal from 'decimal.js';

const GAMES = [
  { name: '六合彩', gid: '49076286' },
  { name: '大樂透', gid: '151954460' },
  { name: '539', gid: '699245093' },
  { name: '天天樂', gid: '1283251878' }
];

const BASE_URL = 'https://docs.google.com/spreadsheets/d/1qrJz52TB55rNj0Rc1hqZRPUq6nINb68P2TjKozdt0mQ/export?format=csv&gid=';
const parseSafeInt = (val) => {
  if (!val || typeof val !== 'string') return 0;
  const parsed = parseInt(val.replace(/,/g, ''), 10);
  return isNaN(parsed) ? 0 : parsed;
};

const parseSafeFloat = (val) => {
  if (!val || typeof val !== 'string') return null;
  const parsed = parseFloat(val.replace(/,/g, ''));
  return isNaN(parsed) ? null : parsed;
};

const parseSafePercent = (val) => {
  if (!val || typeof val !== 'string') return 0;
  const parsed = parseFloat(val.replace(/,/g, '').replace(/%/g, ''));
  return isNaN(parsed) ? 0 : parsed / 100;
};

export async function fetchAllGameData() {
  const result = {};

  const fetchPromises = GAMES.map(async (game) => {
    const res = await fetch(BASE_URL + game.gid);
    if (!res.ok) throw new Error(`無法讀取 ${game.name} 資料`);
    
    const csv = await res.text();
    const parsed = Papa.parse(csv, { skipEmptyLines: true });
    
    // 跳過前兩列標題，篩選出玩法列
    const dataRows = parsed.data.slice(2).filter(row => row[2] && row[2].trim() !== '' && row[2].trim() !== '玩法');
    
    let currentCategory = '';
    result[game.name] = dataRows.map(row => {
      const rawCat = row[1]?.trim();
      if (rawCat) currentCategory = rawCat;
      
      const totalCount = parseSafeInt(row[3]);
      const drawCount = parseSafeInt(row[10]) || 0; // 和局次數 (Index 10 / Column K)
      const effectiveTotal = totalCount - drawCount; // 計算理論值的基準母數
      
      const winCount = parseSafeInt(row[4]);
      const subWinCount = row[7] ? parseSafeInt(row[7]) : null;

      return {
        category: currentCategory,
        playType: row[2]?.trim() || '',
        baseData: {
          totalCount,
          drawCount,
          winCount,
          // 機率與理論賠率：必須排除和局後的有效總次數作為母數
          prob: effectiveTotal > 0 ? (winCount / effectiveTotal) : (parseSafePercent(row[5]) || 0),
          // 理論賠率直接由系統計算：總次數 ÷ 主獎次數，並採 6 位捨去，避免 Excel 儲存格格式造成的精度流失
          theoreticalOdds: (winCount > 0 && effectiveTotal > 0) ? new Decimal(effectiveTotal).dividedBy(winCount).toDecimalPlaces(6, Decimal.ROUND_DOWN).toNumber() : 0,
          subWinCount,
          subProb: (effectiveTotal > 0 && subWinCount !== null) ? (subWinCount / effectiveTotal) : parseSafePercent(row[8]),
          // 副獎理論賠率：總次數 ÷ 副獎次數，採 6 位捨去
          subTheoreticalOdds: (subWinCount && subWinCount > 0 && effectiveTotal > 0) ? new Decimal(effectiveTotal).dividedBy(subWinCount).toDecimalPlaces(6, Decimal.ROUND_DOWN).toNumber() : null
        },
        costA: {
          givenOdds: parseSafeFloat(row[21]) || 0,
          subGivenOdds: parseSafeFloat(row[22]),
          baseCost: parseSafeFloat(row[25]) || 0,
          baseRebate: parseSafeFloat(row[24]) || 0,
          baseProfitStr: row[27], 
          baseProfit: parseSafePercent(row[27]),
          additionalProfit: 0 
        },
        costB: {
          givenOdds: parseSafeFloat(row[29]) || 0,
          subGivenOdds: parseSafeFloat(row[30]),
          baseCost: parseSafeFloat(row[33]) || 0,
          baseRebate: parseSafeFloat(row[32]) || 0,
          baseProfitStr: row[34], 
          baseProfit: parseSafePercent(row[34]),
          additionalProfit: parseSafePercent(row[35]) 
        },
        oddsA: {
          givenOdds: parseSafeFloat(row[36]) || 0,
          subGivenOdds: parseSafeFloat(row[37]),
          baseProfitStr: row[38],
          baseProfit: parseSafePercent(row[38]),
          additionalProfit: parseSafePercent(row[39]) 
        },
        oddsB: {
          givenOdds: parseSafeFloat(row[40]) || 0,
          subGivenOdds: parseSafeFloat(row[41]),
          baseProfitStr: row[42],
          baseProfit: parseSafePercent(row[42]),
          additionalProfit: parseSafePercent(row[43])
        }
      };
    });
  });

  await Promise.all(fetchPromises);
  return result;
}
