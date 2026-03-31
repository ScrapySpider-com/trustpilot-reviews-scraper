## Trustpilot Negative Reviews Scraper

Scrapes negative reviews from Trustpilot business profiles — no account or cookies needed — and returns structured data with reviewer names, review text, star ratings, dates, and business contact emails.

- No Trustpilot account or cookies needed
- Search by keyword, industry, or direct URL
- Configurable star rating filter (1–5 stars)
- Extracts business emails directly from Trustpilot profiles
- Full review breakdown by star rating (1–5)
- Trust score and minimum review count filters
- Export as JSON, CSV, or Excel

### What data does it extract?

Each result contains:

**Business info:** businessName, trustpilotUrl, websiteUrl, trustScore, isVerified, totalReviews

**Star breakdown:** oneStarCount, twoStarCount, threeStarCount, fourStarCount, fiveStarCount

**Contact:** email

**Category:** category

**Review:** reviewerName, reviewText, reviewUrl, reviewStars, reviewDate

All data can be exported as JSON, CSV, or Excel from the Apify dataset.

### Use cases

- **Reputation monitoring:** Track negative reviews for your brand or competitors to catch issues early
- **Lead generation:** Find businesses with poor reviews to offer improvement services or solutions
- **Market research:** Analyze customer complaints across an entire industry to spot trends
- **Competitive intelligence:** Compare review sentiment across competing businesses in a category
- **Customer success:** Identify common pain points from negative feedback to improve your product
- **Quality assurance:** Monitor service quality trends over time by tracking star rating distributions

### How to use

1. Click **Try for free** above
2. In the **Input** tab, enter a search keyword (e.g., "insurance"), select an industry category, or paste Trustpilot business URLs
3. Set the **Maximum Star Rating** (default: 3 = captures 1–3 star reviews)
4. Optionally set trust score and review count filters
5. Click **Start** and wait for the run to complete
6. Download results as JSON, CSV, or Excel from the **Output** tab

### Input parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `keyword` | String | No | — | Search term to find businesses on Trustpilot (e.g., "insurance", "web hosting") |
| `industry` | String (enum) | No | — | Industry category to browse (22 categories available, e.g., "Insurance", "Electronics") |
| `startUrls` | Array | No | — | Direct Trustpilot business profile URLs (e.g., `https://www.trustpilot.com/review/example.com`) |
| `country` | String | No | — | ISO country code to filter businesses by location (US, GB, DE, etc.) |
| `maxStarRating` | Integer | No | 3 | Reviews with this rating or lower are extracted (1–5) |
| `minTrustScore` | Number | No | 0 | Minimum trust score threshold (0–5) |
| `minReviewCount` | Integer | No | 0 | Minimum number of reviews a business must have to be included |
| `maxReviewsPerBusiness` | Integer | No | 5 | Maximum number of negative reviews to extract per business (1–100) |
| `maxRequestsPerCrawl` | Integer | No | 1000 | Safety limit on total HTTP requests per run |
| `proxyConfiguration` | Object | No | Auto | Proxy settings. Residential proxies recommended for best results. |

At least one of `keyword`, `industry`, or `startUrls` must be provided.

### Output example

```json
{
  "businessName": "Acme Insurance Ltd",
  "trustpilotUrl": "https://www.trustpilot.com/review/acme-insurance.com",
  "websiteUrl": "https://acme-insurance.com",
  "trustScore": 2.1,
  "isVerified": false,
  "totalReviews": 342,
  "oneStarCount": 89,
  "twoStarCount": 45,
  "threeStarCount": 38,
  "fourStarCount": 67,
  "fiveStarCount": 103,
  "category": "Insurance",
  "email": "info@acme-insurance.com",
  "reviewerName": "John D.",
  "reviewText": "Terrible customer service. Waited 3 weeks for a response and never got one. Avoid this company at all costs.",
  "reviewUrl": "https://www.trustpilot.com/reviews/abc123",
  "reviewStars": 1,
  "reviewDate": "2024-03-15T10:30:00.000Z"
}
```

### Pricing

This Actor is **free to use** — you only pay for Apify platform compute time and proxy usage.

A typical run costs approximately $0.10–$0.50 in Apify platform credits depending on the number of businesses scraped.

New Apify accounts receive $5 in free credits.

### Technical notes

- **No account needed:** This Actor does not require a Trustpilot login or cookies to operate
- **Residential proxies:** Residential proxies are recommended for best success rates
- **Lightweight:** CheerioCrawler-based — fast and efficient with no browser overhead
- **Live data:** All data is scraped live — no cached or stale data
- **Rate limits:** Configurable request limits ensure respectful scraping

### Support

Have questions or found a bug? Reach out:

- **Email:** ScrapySpider@protonmail.com
- **Website:** ScrapySpider.com
- **Apify:** Open a support issue on this Actor page
- **Response time:** Within 24–48 hours on weekdays
