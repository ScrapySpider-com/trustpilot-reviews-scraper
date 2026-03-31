import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';
import { LABELS, BASE_URL, COUNTRY_CODES } from './constants.js';
import router from './routes.js';

await Actor.init();

const input = await Actor.getInput();
const {
    keyword,
    industry,
    startUrls = [],
    country,
    maxStarRating = 3,
    minTrustScore = 0,
    minReviewCount = 0,
    maxReviewsPerBusiness = 5,
    maxRequestsPerCrawl = 1000,
    proxyConfiguration,
} = input ?? {};

if (!keyword && !industry && startUrls.length === 0) {
    throw new Error(
        'At least one of "keyword", "industry", or "startUrls" must be provided. '
        + 'Please set a search keyword, pick an industry category, or supply direct Trustpilot URLs.',
    );
}

const countryParam = country ? `&country=${encodeURIComponent(country.toUpperCase())}` : '';
const requests = [];

if (keyword) {
    requests.push({
        url: `${BASE_URL}/search?query=${encodeURIComponent(keyword)}${countryParam}`,
        label: LABELS.SEARCH,
    });
}

if (industry) {
    const separator = `${BASE_URL}/categories/${industry}`.includes('?') ? '&' : '?';
    const countryQuery = country ? `${separator}country=${encodeURIComponent(country.toUpperCase())}` : '';
    requests.push({
        url: `${BASE_URL}/categories/${industry}${countryQuery}`,
        label: LABELS.CATEGORY,
    });
}

for (const entry of startUrls) {
    const rawUrl = typeof entry === 'string' ? entry : entry.url;
    if (!rawUrl) continue;

    const label = rawUrl.includes('/review/') ? LABELS.PROFILE : LABELS.SEARCH;

    let url = rawUrl;
    if (country && !url.includes('country=')) {
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}country=${encodeURIComponent(country.toUpperCase())}`;
    }

    // Pre-apply star filters to profile URLs to avoid a wasteful redirect
    if (label === LABELS.PROFILE && !url.includes('stars=')) {
        const starParams = Array.from({ length: maxStarRating }, (_, i) => `stars=${i + 1}`).join('&');
        const sep = url.includes('?') ? '&' : '?';
        url = `${url}${sep}${starParams}&languages=all`;
    }

    requests.push({ url, label, userData: { starsApplied: label === LABELS.PROFILE } });
}

await Actor.setValue('CONFIG', {
    maxStarRating,
    minTrustScore,
    minReviewCount,
    maxReviewsPerBusiness,
    country,
    countryFullName: country ? COUNTRY_CODES[country.toUpperCase()] : null,
});

const proxy = await Actor.createProxyConfiguration(proxyConfiguration);

const crawler = new CheerioCrawler({
    proxyConfiguration: proxy,
    maxRequestsPerCrawl,
    maxConcurrency: 5,
    requestHandlerTimeoutSecs: 120,
    navigationTimeoutSecs: 60,
    requestHandler: router,
    additionalMimeTypes: ['application/json'],
    preNavigationHooks: [
        (_ctx, gotOptions) => {
            gotOptions.headers = {
                ...gotOptions.headers,
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            };
        },
    ],
});

await crawler.run(requests);

await Actor.exit();
