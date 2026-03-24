import Papa from 'papaparse';
import Decimal from 'decimal.js';

const GAMES = [
  { name: '六合彩', gid: '49076286' },
  { name: '大樂透', gid: '151954460' },
  { name: '539', gid: '699245093' },
  { name: '天天樂', gid: '1283251878' }
];

const BASE_URL = 'https://docs.google.com/spreadsheets/d/1qrJz52TB55rNj0Rc1hqZRPUq6nINb68P2TjKozdt0mQ/export?format=csv&gid=';

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
      
      const totalCount = parseInt(row[3]?.replace(/,/g, '') || '0', 10);
      const winCount = parseInt(row[4]?.replace(/,/g, '') || '0', 10);
      const subWinCount = row[7] ? parseInt(row[7].replace(/,/g, '')) : null;

      return {
        category: currentCategory,
        playType: row[2]?.trim() || '',
        baseData: {
          totalCount,
          winCount,
          prob: totalCount > 0 ? (winCount / totalCount) : (parseSafePercent(row[5]) || 0),
          // 理論賠率採 6 位捨去
          theoreticalOdds: new Decimal(parseSafeFloat(row[6]) || 0).toDecimalPlaces(6, Decimal.ROUND_DOWN).toNumber(),
          subWinCount,
          subProb: (totalCount > 0 && subWinCount !== null) ? (subWinCount / totalCount) : parseSafePercent(row[8]),
          // 副獎理論賠率亦採 6 位捨去
          subTheoreticalOdds: row[9] ? new Decimal(parseSafeFloat(row[9])).toDecimalPlaces(6, Decimal.ROUND_DOWN).toNumber() : null
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
