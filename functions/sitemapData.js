const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const cheerio = require('cheerio');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Function to extract metadata from a given URL
async function extractMetaData(url, type) {
  try {
    await delay(1000); // To avoid rate-limiting
    if (url.toLowerCase().includes(type.toLowerCase())) {
      const response = await axios.get(url);
      const html = response.data;
      const $ = cheerio.load(html);

      const description = $('h3.text-title').text().toLowerCase() || '';

      const keywords = ['ground', 'beans'];

      const hasKeyword = keywords.some((keyword) =>
        description.includes(keyword)
      );
      if (!hasKeyword) {
        const pods =
          $('#product-attributes .attribute-label:contains("Number of pods")')
            .next('.attribute-value')
            .text() || '';
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

        return {
          brand: title,
          id: sku,
          image,
          pods,
          price,
          system: type,
          url,
        };
      }
    }
  } catch (error) {
    if (error.response && error.response.status === 429) {
      console.warn(`Rate limit hit, retrying after delay for ${url}`);
      await delay(3000); // Wait for 3 seconds before retrying
      return extractMetaData(url, type); // Retry the request
    } else {
      console.error(`Error fetching data from ${url}:`, error);
      return { url, error: 'Could not retrieve data' };
    }
  }
}

exports.handler = async function (event, context) {
  try {
    const queryParams = event.queryStringParameters || {};
    const categoryFilter = queryParams.category || 'All';
    const page = parseInt(queryParams.page) || 1;
    const pageSize = 8;
    const startIndex = (page - 1) * pageSize;
    const endIndex = page * pageSize;

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

    const validUrls = urls.filter((url) =>
      url.toLowerCase().includes(categoryFilter.toLowerCase())
    );

    // Pagination logic: only fetch the required range of URLs
    const paginatedUrls = validUrls.slice(startIndex, endIndex);
    const metaDataPromises = paginatedUrls.map((url) =>
      extractMetaData(url, categoryFilter)
    );
    const metaData = await Promise.all(metaDataPromises);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: metaData.filter((data) => !!data),
        currentPage: page,
        totalPages: Math.ceil(validUrls.length / pageSize),
      }),
    };
  } catch (error) {
    console.error('Error fetching sitemap data:', error);
    return {
      statusCode: 500,
      body: 'Error fetching sitemap data',
    };
  }
};
