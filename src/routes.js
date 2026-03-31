import { Actor } from 'apify';
import { createCheerioRouter, social } from 'crawlee';
import { LABELS, BASE_URL } from './constants.js';

const router = createCheerioRouter();

// ---------------------------------------------------------------------------
// DEFAULT / SEARCH handler — processes keyword search result pages
// ---------------------------------------------------------------------------
router.addDefaultHandler(async ({ request, $, log, enqueueLinks, crawler }) => {
    const config = await Actor.getValue('CONFIG');
    log.info(`Processing search page: ${request.url}`);

    // --- Try extracting businesses from Next.js JSON data ---
    let enqueued = 0;
    try {
        const nextDataEl = $('#__NEXT_DATA__');
        if (nextDataEl.length) {
            const jData = JSON.parse(nextDataEl.html());
            const businesses = jData?.props?.pageProps?.businessUnits || [];
            const requests = [];

            for (const biz of businesses) {
                if (config.countryFullName && biz?.location?.country !== config.countryFullName) {
                    continue;
                }
                if (!biz.identifyingName) continue;

                requests.push({
                    url: `${BASE_URL}/review/${biz.identifyingName}`,
                    label: LABELS.PROFILE,
                    userData: { source: 'search' },
                });
            }

            if (requests.length) {
                await crawler.addRequests(requests);
                enqueued += requests.length;
            }
        }
    } catch (err) {
        log.warning(`Failed to parse __NEXT_DATA__ on ${request.url}: ${err.message}`);
    }

    // --- Fallback: enqueue business-unit-card links (works on category-style pages too) ---
    const { processedRequests } = await enqueueLinks({
        selector: 'a[name="business-unit-card"]',
        label: LABELS.PROFILE,
        userData: { source: 'search' },
    });
    enqueued += processedRequests.length;
    log.info(`Enqueued ${enqueued} business profiles from search page`);

    // --- Pagination ---
    await enqueueLinks({
        selector: '[aria-label="Pagination"] a[href]',
    });
});

// ---------------------------------------------------------------------------
// CATEGORY handler — processes industry/category listing pages
// ---------------------------------------------------------------------------
router.addHandler(LABELS.CATEGORY, async ({ request, $, log, enqueueLinks, crawler }) => {
    const config = await Actor.getValue('CONFIG');
    log.info(`Processing category page: ${request.url}`);

    const category = $('[aria-label="Breadcrumb"] li:nth-of-type(1)').text().trim() || '';
    const subCategory = request.url.split('/').pop()?.split('?')[0] || '';

    const requests = [];

    $('[name="business-unit-card"]').each((_i, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        const trustScoreRaw = $(el).find('[class*=trustScore]').first().text().replace(/TrustScore/i, '').trim();
        const trustScore = parseFloat(trustScoreRaw) || 0;

        const ratingText = $(el).find('[class*=ratingText]').first().text() || '';
        const reviewCountPart = ratingText.split('|')[1]?.trim() || '0';
        const reviewCount = parseInt(reviewCountPart.replace(/[^0-9]/g, ''), 10) || 0;

        // Apply filters
        if (config.minTrustScore > 0 && trustScore < config.minTrustScore) return;
        if (config.minReviewCount > 0 && reviewCount < config.minReviewCount) return;

        const profileUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
        requests.push({
            url: profileUrl,
            label: LABELS.PROFILE,
            userData: { category, subCategory, trustScore, reviewCount },
        });
    });

    if (requests.length) {
        await crawler.addRequests(requests);
    }
    log.info(`Enqueued ${requests.length} profiles from category page (${category} / ${subCategory})`);

    // Pagination — keep the CATEGORY label so next pages go through this handler
    await enqueueLinks({
        selector: '[aria-label="Pagination"] a[href]',
        label: LABELS.CATEGORY,
    });
});

// ---------------------------------------------------------------------------
// PROFILE handler — scrapes business info + individual reviews
// Uses __NEXT_DATA__ JSON for reliable data extraction (Cheerio can't see
// JS-hydrated review attributes like rating, text, and links).
// ---------------------------------------------------------------------------
router.addHandler(LABELS.PROFILE, async ({ request, $, log, crawler }) => {
    const config = await Actor.getValue('CONFIG');

    // ------------------------------------------------------------------
    // Ensure star-filter params are in the URL so only relevant reviews show
    // ------------------------------------------------------------------
    if (!request.url.includes('stars=')) {
        const starParams = Array.from(
            { length: config.maxStarRating },
            (_, i) => `stars=${i + 1}`,
        ).join('&');
        const sep = request.url.includes('?') ? '&' : '?';
        const filteredUrl = `${request.url}${sep}${starParams}&languages=all`;

        await crawler.addRequests([{
            url: filteredUrl,
            label: LABELS.PROFILE,
            uniqueKey: filteredUrl,
            userData: { ...request.userData, starsApplied: true },
        }]);
        return;
    }

    // ------------------------------------------------------------------
    // Parse __NEXT_DATA__ JSON — the single source of truth
    // ------------------------------------------------------------------
    const nextDataEl = $('#__NEXT_DATA__');
    if (!nextDataEl.length) {
        log.warning(`No __NEXT_DATA__ found on ${request.url}, skipping.`);
        return;
    }

    let pageProps;
    try {
        const jData = JSON.parse(nextDataEl.html());
        pageProps = jData?.props?.pageProps;
    } catch (err) {
        log.warning(`Failed to parse __NEXT_DATA__ on ${request.url}: ${err.message}`);
        return;
    }

    if (!pageProps || !pageProps.businessUnit) {
        log.warning(`Missing businessUnit in __NEXT_DATA__ on ${request.url}`);
        return;
    }

    // ------------------------------------------------------------------
    // Extract business-level information from JSON
    // ------------------------------------------------------------------
    const bu = pageProps.businessUnit;
    const businessName = bu.displayName || 'Unknown';
    const trustpilotUrl = `${BASE_URL}/review/${bu.identifyingName || ''}`;
    const websiteUrl = bu.websiteUrl || '';
    const trustScore = request.userData.trustScore || bu.trustScore || 0;
    const isVerified = bu.isClaimed || false;

    // Star distribution from filters.reviewStatistics.ratings
    const ratings = pageProps.filters?.reviewStatistics?.ratings || {};
    const oneStarCount = ratings.one || 0;
    const twoStarCount = ratings.two || 0;
    const threeStarCount = ratings.three || 0;
    const fourStarCount = ratings.four || 0;
    const fiveStarCount = ratings.five || 0;
    const totalReviews = ratings.total || bu.numberOfReviews || 0;

    // Category from userData, JSON categories, or breadcrumb
    const category = request.userData.category
        || bu.categories?.[0]?.name
        || '';

    // Email: try JSON contactInfo first, then fallback to HTML scan
    let email = bu.contactInfo?.email || '';
    if (!email) {
        const pageHtml = $.html() || '';
        const emails = social.emailsFromText(pageHtml) || [];
        // Filter out Trustpilot's own emails and internal build identifiers
        email = emails.find((e) => !e.includes('trustpilot.com') && e.includes('.') && e.split('@')[1]?.includes('.')) || '';
    }

    log.info(`Scraping profile: ${businessName} | Trust: ${trustScore} | Reviews: ${totalReviews}`);

    // ------------------------------------------------------------------
    // Apply business-level filters
    // ------------------------------------------------------------------
    if (config.minReviewCount > 0 && totalReviews < config.minReviewCount) {
        log.info(`Skipping ${businessName} — only ${totalReviews} reviews (min: ${config.minReviewCount})`);
        return;
    }
    if (config.minTrustScore > 0 && trustScore < config.minTrustScore) {
        log.info(`Skipping ${businessName} — trust score ${trustScore} below min ${config.minTrustScore}`);
        return;
    }

    // ------------------------------------------------------------------
    // Extract individual reviews from __NEXT_DATA__ JSON
    // ------------------------------------------------------------------
    const previouslyCollected = request.userData.reviewsCollected || 0;
    const maxReviews = config.maxReviewsPerBusiness || Infinity;
    const remaining = maxReviews - previouslyCollected;

    if (remaining <= 0) {
        log.info(`Already collected ${previouslyCollected} reviews for ${businessName}, skipping.`);
        return;
    }

    const jsonReviews = pageProps.reviews || [];
    const reviews = [];

    for (const r of jsonReviews) {
        if (reviews.length >= remaining) break;

        const reviewStars = r.rating;
        if (!reviewStars || reviewStars > config.maxStarRating) continue;

        const reviewerName = r.consumer?.displayName || '';
        const reviewText = r.text || r.title || '';
        const reviewUrl = r.id ? `${BASE_URL}/reviews/${r.id}` : '';
        const reviewDate = r.dates?.publishedDate || r.dates?.experiencedDate || '';

        reviews.push({
            businessName,
            trustpilotUrl,
            websiteUrl,
            trustScore,
            isVerified,
            totalReviews,
            oneStarCount,
            twoStarCount,
            threeStarCount,
            fourStarCount,
            fiveStarCount,
            category,
            email,
            reviewerName,
            reviewText,
            reviewUrl,
            reviewStars,
            reviewDate,
        });
    }

    if (reviews.length) {
        await Actor.pushData(reviews);
        log.info(`Pushed ${reviews.length} reviews for ${businessName} (total so far: ${previouslyCollected + reviews.length})`);
    } else {
        log.info(`No qualifying reviews found on this page for ${businessName}`);
    }

    // ------------------------------------------------------------------
    // Paginate through remaining review pages
    // ------------------------------------------------------------------
    const totalCollected = previouslyCollected + reviews.length;
    const pagination = pageProps.filters?.pagination || {};
    const currentPage = pagination.currentPage || 1;
    const totalPages = pagination.totalPages || 1;

    if (totalCollected < maxReviews && currentPage < totalPages) {
        const nextPage = currentPage + 1;
        const baseUrl = request.url.replace(/[&?]page=\d+/, '');
        const sep = baseUrl.includes('?') ? '&' : '?';
        const nextUrl = `${baseUrl}${sep}page=${nextPage}`;

        await crawler.addRequests([{
            url: nextUrl,
            label: LABELS.PROFILE,
            uniqueKey: nextUrl,
            userData: {
                ...request.userData,
                reviewsCollected: totalCollected,
                category,
                trustScore,
            },
        }]);
        log.info(`Enqueued page ${nextPage}/${totalPages} for ${businessName}`);
    }
});

export default router;
