import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const res = await fetch('https://www.belugaxlinfo.com/');
const html = await res.text();
const $ = cheerio.load(html);

console.log('Total tables found:', $('table').length);
console.log('Total h3 headings:', $('h3').length);
console.log('Total h4 headings:', $('h4').length);

// Log first few headings
$('h3, h4').slice(0, 10).each((i, el) => {
  console.log(`Heading ${i}: ${$(el).text().trim()}`);
});

// Log first table structure
const firstTable = $('table').first();
console.log('\nFirst table rows:', firstTable.find('tr').length);
firstTable.find('tr').slice(0, 3).each((i, row) => {
  const cells = $(row).find('td, th').map((_, cell) => $(cell).text().trim()).get();
  console.log(`Row ${i}:`, cells);
});
