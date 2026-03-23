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
      
      const parseSafeFloat = (val) => {
        if (!val || typeof val !== 'string') return null;
        const parsed = parseFloat(val.replace(/,/g, ''));
        return isNaN(parsed) ? null : parsed;
      }
      const parseSafePercent = (val) => {
        if (!val || typeof val !== 'string') return 0;
        const parsed = parseFloat(val.replace(/,/g, '').replace(/%/g, ''));
        return isNaN(parsed) ? 0 : parsed / 100;
      }

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
            prob: parseSafeFloat(row[5]) || 0,
            theoreticalOdds: parseSafeFloat(row[6]) || 0,
            subWinCount: row[7] ? parseInt(row[7].replace(/,/g, '')) : null,
            subProb: parseSafeFloat(row[8]),
            subTheoreticalOdds: parseSafeFloat(row[9])
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
