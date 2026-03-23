import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const __dirname = path.resolve();

const games = [
  { name: '六合彩', gid: '49076286' },
  { name: '大樂透', gid: '151954460' },
  { name: '539', gid: '699245093' },
  { name: '天天樂', gid: '1283251878' }
];

const BASE_URL = 'https://docs.google.com/spreadsheets/d/1qrJz52TB55rNj0Rc1hqZRPUq6nINb68P2TjKozdt0mQ/export?format=csv&gid=';

async function main() {
  const result = {};

  for (const game of games) {
    console.log(`Fetching ${game.name}...`);
    try {
      const res = await fetch(BASE_URL + game.gid);
      if (!res.ok) {
        throw new Error(`Failed to fetch ${game.name}: ${res.statusText}`);
      }
      const csv = await res.text();
      
      const parsed = Papa.parse(csv, { skipEmptyLines: true });
      
      // Data starts roughly at row 3 (index 2). We look for rows that have '玩法' in column 2, but exclude the header itself.
      const dataRows = parsed.data.slice(2).filter(row => row[2] && row[2].trim() !== '' && row[2].trim() !== '玩法');
      
      let currentCategory = '';
      result[game.name] = dataRows.map(row => {
        const rawCat = row[1]?.trim();
        if (rawCat) {
          currentCategory = rawCat;
        }
        
        return {
          category: currentCategory,
          playType: row[2]?.trim() || '',
          baseData: {
            totalCount: parseInt(row[3]?.replace(/,/g, '') || '0', 10),
            winCount: parseInt(row[4]?.replace(/,/g, '') || '0', 10),
            prob: parseFloat(row[5]) || 0,
            theoreticalOdds: parseFloat(row[6]) || 0,
            subWinCount: row[7] ? parseInt(row[7].replace(/,/g, '')) : null,
            subProb: row[8] ? parseFloat(row[8]) : null,
            subTheoreticalOdds: row[9] ? parseFloat(row[9]) : null
          },
          costA: {
            givenOdds: parseFloat(row[21]) || 0,
            subGivenOdds: row[22] ? parseFloat(row[22]) : null,
            baseCost: parseFloat(row[25]) || 0,
            baseRebate: parseFloat(row[24]) || 0,
            baseProfitStr: row[27], // e.g. "0.1964%"
            baseProfit: parseFloat(row[27]) / 100 || 0,
            additionalProfit: 0 // Will be adjustable in UI
          },
          costB: {
            givenOdds: parseFloat(row[29]) || 0,
            subGivenOdds: row[30] ? parseFloat(row[30]) : null,
            baseCost: parseFloat(row[33]) || 0,
            baseRebate: parseFloat(row[32]) || 0,
            baseProfitStr: row[34], // same target profit logic
            baseProfit: parseFloat(row[34]) / 100 || 0,
            additionalProfit: parseFloat(row[35]) / 100 || 0 // e.g. AI2
          },
          oddsA: {
            givenOdds: parseFloat(row[36]) || 0,
            subGivenOdds: row[37] ? parseFloat(row[37]) : null,
            baseProfitStr: row[38],
            baseProfit: parseFloat(row[38]) / 100 || 0,
            additionalProfit: parseFloat(row[39]) / 100 || 0 
          },
          oddsB: {
            givenOdds: parseFloat(row[40]) || 0,
            subGivenOdds: row[41] ? parseFloat(row[41]) : null,
            baseProfitStr: row[42],
            baseProfit: parseFloat(row[42]) / 100 || 0,
            additionalProfit: parseFloat(row[43]) / 100 || 0
          }
        };
      });
      console.log(`✅ Loaded ${result[game.name].length} play types for ${game.name}.`);
    } catch (err) {
      console.error(`❌ Error fetching ${game.name}:`, err);
    }
  }

  const outputPath = path.resolve(__dirname, 'src', 'assets', 'data.json');
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log('✅ Generated src/assets/data.json');
}

main().catch(console.error);
