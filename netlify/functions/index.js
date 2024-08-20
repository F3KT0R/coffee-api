const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const cheerio = require('cheerio');

async function extractMetaData(url, type) {
  try {
    if (url.toLowerCase().includes(type.toLowerCase())) {
      const response = await axios.get(url);
      const html = response.data;
      const $ = cheerio.load(html);

      const title = $('meta[property="og:title"]').attr('content') || '';
      const image = $('meta[property="og:image"]').attr('content') || '';
      const price =
        $('meta[property="product:price:amount"]').attr('content') || '';

      const scriptContent = $('script:contains("parseProduct_")').html();
      let sku = '';
      if (scriptContent) {
        const skuMatch = scriptContent.match(/"sku":"(\d+)"/);
        if (skuMatch && skuMatch[1]) {
          sku = skuMatch[1];
        }
      }

      return { url, brand: title, image, price, system: type, id: sku };
    }
  } catch (error) {
    console.error(`Error fetching data from ${url}:`, error);
    return { url, error: 'Could not retrieve data' };
  }
}

exports.handler = async function (event, context) {
  try {
    const categoryFilter = event.queryStringParameters.category || 'All';
    const sitemapUrl = 'https://www.kaffekapslen.co.uk/sitemap/uk/sitemap.xml';
    const response = await axios.get(sitemapUrl);
    const parser = new XMLParser();
    const parsedSitemap = parser.parse(response.data);

    const urlEntries = parsedSitemap.urlset.url;
    const urls = [];

    urlEntries.forEach((entry) => {
      const loc = entry.loc;
      const hreflangEntries = entry['xhtml:link'] || [];

      if (loc && loc.includes('kaffekapslen.co.uk')) {
        urls.push(loc);
      } else {
        const enGbLink = hreflangEntries.find(
          (link) => link['@_hreflang'] === 'en-GB'
        );
        if (enGbLink && enGbLink['@_href'].includes('kaffekapslen.co.uk')) {
          urls.push(enGbLink['@_href']);
        }
      }
    });

    // Extract metadata for each URL
    const metaDataPromises = urls.map((url) =>
      extractMetaData(url, categoryFilter)
    );
    const metaData = await Promise.all(metaDataPromises);
    const filteredMetaData = metaData.filter((data) => !!data);

    return {
      statusCode: 200,
      body: JSON.stringify(filteredMetaData),
    };
  } catch (error) {
    console.error('Error fetching sitemap data:', error);
    return {
      statusCode: 500,
      body: 'Error fetching sitemap data',
    };
  }
};
