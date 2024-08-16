const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const cheerio = require('cheerio');

puppeteer.use(StealthPlugin());

let browser = null;
let browserPromise = null;

async function getBrowserInstance() {
  if (!browser) {
    if (!browserPromise) {
      browserPromise = puppeteer
        .launch({
          executablePath:
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          headless: 'new',
        })
        .then((b) => {
          browser = b;
          return browser;
        })
        .catch((err) => {
          browserPromise = null; // Reset the promise on error
          throw err;
        });
    }
    return browserPromise;
  }
  return browser;
}

async function fetchSitemapUrls() {
  try {
    const { data } = await axios.get(
      'https://www.kaffekapslen.co.uk/sitemap/uk/sitemap.xml'
    );
    const $ = cheerio.load(data, { xmlMode: true });
    const urls = [];
    $('url > loc').each((i, elem) => {
      urls.push($(elem).text());
    });
    return urls;
  } catch (error) {
    console.error('Error fetching sitemap:', error);
    return [];
  }
}

async function scrapeProductData(url) {
  const browser = await getBrowserInstance();
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('.product-title', { timeout: 60000 });
    const data = await page.evaluate(() => {
      const title =
        document.querySelector('.product-title')?.innerText || 'N/A';
      const price =
        document.querySelector('.product-price')?.innerText || 'N/A';
      return { title, price };
    });

    await page.close(); // Close the page to free up resources
    return data;
  } catch (error) {
    console.error(`Error scraping ${url}:`, error);
    await page.close();
    return null;
  }
}

exports.handler = async function (event, context) {
  try {
    const urls = await fetchSitemapUrls();
    const scrapePromises = urls.map((url) => scrapeProductData(url));
    const products = await Promise.all(scrapePromises);
    return {
      statusCode: 200,
      body: JSON.stringify(products.filter((product) => product !== null)),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: 'Error fetching product data',
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};
