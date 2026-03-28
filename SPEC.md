# Website Rebuild Spec — Gutterbugs.co.uk

## Current Site Audit (Squarespace)

### Site Structure
```
/ (Home)
├── /gutter-clearing     — Service page + pricing + FAQ
├── /roof-cleaning       — Service page + pricing + FAQ
├── /pressure-washing    — Service page (no pricing listed)
├── /soffit-fascia-washing — Service page (no pricing listed)
├── /conservatory-cleaning — Service page (no pricing listed)
├── /about              — About Ryan & Richard, family business
├── /contact            — Phone, email, GHL embedded form
├── /locations          — Business address only (Tring)
└── /thank-you          — Post-form submission (GA4 conversion)
```

### Current Content Summary

**Homepage:**
- Hero section (title: "Gutter Cleaning & Roof Moss Removal in Hertfordshire")
- Customer testimonials carousel (10 reviews — Alison, Muhammad, Sophie, Phoebe, Shirley, P Banks, Heather, Christos, Russell, Mark)
- Phone CTA button in nav: 📞 07904621160

**Services:**
- Gutter Clearing: Full pricing (bungalow £65-75, terraced £75-95, detached £90-200, 3-storey £160-300), FAQ section, leak testing, joint replacement £12
- Roof Cleaning: Pricing (terraced £400-800, medium detached £800-1500, large £1500-2500+), FAQ, biocide treatment included
- Pressure Washing: No pricing listed, process description
- Soffit & Fascia: No pricing listed, description
- Conservatory Cleaning: No pricing listed, description

**About:** Ryan & dad Richard, family business, 2000+ houses cleaned, based in Tring

**Contact:** Phone (07904621160), email (ryan@gutterbugs.co.uk), GHL embedded form

**Locations:** Just address (Pegasus Barn, Astrope Lane, Tring, HP23 4PP), hours Mon-Fri 9-5

### Current Tech Stack
- Squarespace 7.1 (template: blue-carnation-343b)
- Fonts: Poppins (headings), Inter (body)
- GTM: GTM-P4JZQHT
- GA4: UA-215126166-1 (legacy) + G-1PVFX7ESJ7 (GA4)
- Trustpilot widget loaded
- GHL form embedded via iframe on /contact
- Phone button in header nav
- Schema.org: WebSite, Organization, LocalBusiness (all present)
- Announcement bar: "Taking a break 30th May to 9 July"

### Current Design
- Color scheme: Dark/professional with green accents
- Logo: High-res image logo
- Mobile logo: Different (transparent version)
- Nav layout: Center nav with phone CTA button
- Fixed header with drop shadow
- Pill-shaped buttons (outline style)
- Reviews carousel on homepage

---

## Design & Navigation Improvements

### Issues with Current Site
1. **No clear CTA hierarchy** — homepage reviews are the main content, no hero section with value proposition
2. **Inconsistent pricing** — gutter + roof have pricing, other services don't
3. **Locations page is thin** — just an address, no service area map
4. **No before/after gallery** — huge missed opportunity for visual proof
5. **Contact form is an iframe** — no attribution, clunky
6. **No urgency/trust signals** — no "2000+ homes cleaned" badge, no guarantee badge
7. **No service area pages** — missing local SEO opportunity
8. **Announcement bar about breaks** — should be dynamic, not always visible
9. **No social proof integration** — Trustpilot widget but no Google Reviews
10. **Mobile experience** — Squarespace generic, not optimised for trade services

### Proposed Improvements
1. **Hero section with strong CTA** — "Hertfordshire's Trusted Exterior Cleaning Experts"
2. **Trust bar** — "2000+ Homes Cleaned | Family Business | Same-Day Quotes | Before & After Photos"
3. **Service cards on homepage** — visual grid with icons, not just nav links
4. **Before/after gallery** — photo comparison slider (huge conversion driver)
5. **Pricing on all service pages** — transparency builds trust
6. **Service area map** — interactive map showing coverage
7. **Individual location pages** — /tring, /berkhamsted, /hemel-hempstead, /aylesbury (local SEO)
8. **Inline contact form** — native, with full attribution tracking
9. **Sticky phone CTA** — mobile: fixed bottom bar with phone + form buttons
10. **Speed** — static site = sub-second loads = better Quality Score = lower CPC

---

## Technical Architecture

### Stack
- **Framework:** Astro (static site generation, zero JS by default, islands architecture)
- **Styling:** Tailwind CSS (utility-first, fast to build, excellent responsive)
- **Hosting:** Cloudflare Pages (free tier, global CDN, custom domain)
- **Form Backend:** Cloudflare Worker → forwards to Mission Control API
- **Analytics:** Our own tracking + GA4 as backup
- **Images:** Cloudflare R2 or optimised static assets

### Domain Migration
- gutterbugs.co.uk DNS → Cloudflare (free plan)
- SSL: Cloudflare automatic
- Old Squarespace → cancel subscription after migration

### Form Integration
```
Contact Form (on page)
  ├── Captures: name, email, phone, address, postcode, service, message
  ├── Attribution: gclid (localStorage), UTM params, referrer, landing page
  ├── Posts to: Cloudflare Worker (edge function)
  │   └── Worker forwards to: Mission Control API (via Tailscale Funnel or tunnel)
  │       ├── SQLite DB insert
  │       ├── Xero contact creation (async)
  │       ├── iCloud contact sync (async)
  │       └── gclid resolution (async)
  └── Redirects to: /thank-you (GA4 conversion event)
```

### Analytics & Tracking
- **Native tracking:** Every page view, click, form interaction tracked
- **gclid capture:** Automatic on landing, persisted in localStorage
- **Phone click tracking:** Native event, no GTM dependency
- **GA4:** Kept as secondary analytics
- **GTM:** Simplified or removed (tracking built into site)

### SEO
- **Structured data:** LocalBusiness, Service, FAQ, Review schemas on every relevant page
- **Meta tags:** Proper title, description, OG tags per page
- **Sitemap:** Auto-generated
- **Robots.txt:** Proper crawl directives
- **Location pages:** /gutter-cleaning-tring, /gutter-cleaning-berkhamsted, etc.
- **Page speed:** 90+ Lighthouse score target

---

## Page Plan

### Core Pages
1. **/** — Homepage (hero, trust bar, services grid, reviews, CTA)
2. **/gutter-clearing** — Service detail + pricing + FAQ + before/after
3. **/roof-cleaning** — Service detail + pricing + FAQ + before/after
4. **/pressure-washing** — Service detail + pricing + FAQ + before/after
5. **/soffit-fascia-washing** — Service detail + pricing + FAQ
6. **/conservatory-cleaning** — Service detail + pricing + FAQ
7. **/solar-panel-cleaning** — NEW service page
8. **/about** — Team, story, credentials, trust signals
9. **/contact** — Native form + phone + email + map
10. **/gallery** — Before/after photo gallery
11. **/locations** — Service area overview with map
12. **/thank-you** — Post-form confirmation (conversion tracking)

### Location Pages (Local SEO)
- /gutter-cleaning-tring
- /gutter-cleaning-berkhamsted
- /gutter-cleaning-hemel-hempstead
- /gutter-cleaning-aylesbury
- /roof-cleaning-tring (etc.)

### Content to Migrate
- All service descriptions
- Customer testimonials (10 reviews)
- About page content
- Pricing information
- FAQ sections
- Business details and contact info
- Logo and brand assets

---

## Migration Checklist
- [ ] Set up Astro project
- [ ] Design system (colors, typography, components)
- [ ] Build all pages with content
- [ ] Implement contact form with attribution
- [ ] Set up Cloudflare Worker for form backend
- [ ] Configure Cloudflare Pages deployment
- [ ] Migrate DNS to Cloudflare
- [ ] Set up redirects (old URLs → new URLs)
- [ ] Configure GA4 + GTM (simplified)
- [ ] Test all forms end-to-end
- [ ] Test mobile experience
- [ ] Lighthouse audit (target 90+)
- [ ] Schema.org validation
- [ ] Go live + cancel Squarespace
