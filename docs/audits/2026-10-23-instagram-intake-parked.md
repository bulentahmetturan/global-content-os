# Instagram automatic intake: parked (2026-10-23)

Goal (owner): posts from selected Instagram accounts land automatically in the Hub inbox for curation. No auto-publish.

## Decision
Official API route chosen (Meta Instagram Graph API, Business Discovery on public Creator/Business accounts). Third-party scrapers rejected (terms violation). **Parked by the owner**; the setup below stays as is.

## State left in place (owner-side, Meta)
- Meta developer app `Global OS Reader` (app id `1688382113074831`), use case "Manage messaging & content on Instagram", permission `instagram_basic` added (Ready for testing). `pages_show_list`, `pages_read_engagement` available.
- Facebook Page `İyileşme Kanalı` (id `1463813453473702`), Instagram `@iyilesmekanali` (Creator) NOT linked to it (Meta rejects with an ad-policy message; Account Quality shows no restriction).
- Portfolio `SCOPE Türkiye` (owner is full-access admin, sole member): Page `İyileşme Kanalı` and Instagram profile `@tiptoplulugu` (code `17841438552512623`) added; the Instagram identity has **Full access** as a person, to be reduced to partial when this resumes.
- No token or secret was stored anywhere. Explorer tokens are short-lived.

## Where it stopped
The Explorer user token returned `data: []` for `me/accounts`: the permission dialog was completed without selecting the Page. The Page-to-Instagram link (`instagram_business_account`) was never returned by the Graph API.

## Unverified before building anything
- Whether Business Discovery works for other accounts in development mode, or needs App Review / Tech Provider and access verification (Meta shows these requirements; the permission reference was not found).
- Instagram API with Instagram Login does not list Business Discovery (hashtags and public content point to the Facebook Login route).
- Long-lived token expiry (about 60 days) needs a refresh design.

## To resume
1. Re-run the Explorer flow selecting Page `İyileşme Kanalı` and Instagram `@tiptoplulugu` in the permission dialog, then `me/accounts?fields=name,instagram_business_account`.
2. Test one Business Discovery read of a known public Creator account; learn whether App Review is required.
3. Only then build the connector (RAW items to the triage inbox, MANUAL review, token as a Worker secret put by the owner).
4. Reduce `@tiptoplulugu` person access from Full to partial; owner may leave the unused portfolios (Halitosil, Ulusoy Nakliyat, Türkiye Futbol Tiyatrosu) where the menu allows.

Interim: Instagram posts the owner selects enter by manual intake; automatic flow comes from RSS sources only (for example the Substack feeds of Brewer and Topol).
