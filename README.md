# Paytm Resolve

Your AI teammate for billing, payments and resolution.

**PaytmKaro · Merchant Growth AI · Paytm AI Hackathon Chennai**

Paytm Resolve is an independent merchant demo for Sri Murugan Stores. It checks UPI claims against a fixed synthetic ledger, tracks unresolved cases, and records bills with merchant-entered cash or simulated UPI evidence.

## Run locally

Use Node 22.18 or newer.

```sh
npm ci
npm run dev
```

Open [the local merchant app](http://localhost:3000). Use the same browser and address throughout the demo to keep your saved data available.

### Enable live Tamil or Tanglish voice

Copy `.env.example` to `.env.local`, set `SARVAM_API_KEY` to a valid Sarvam key, and restart Next.js. Open the bill editor and choose **Add by Tamil Voice** to start recording. Microphone access requires HTTPS or localhost. The browser stops recording after 25 seconds.

The server sends audio to Saaras v4 in Tamil code-mix mode, then asks Sarvam-105B for verbatim product, quantity, and unit phrases. It checks the returned phrases against the transcript. The review uses matching catalogue prices and asks for missing details and custom prices before adding items. [Speech-to-Text REST](https://docs.sarvam.ai/api-reference-docs/speech-to-text/transcribe) · [Chat Completions V2](https://docs.sarvam.ai/api-reference/chat/chat-completions-v2)

Without a key, the [voice demo route](http://127.0.0.1:3000/bills/new/voice) offers **Open Sample Review**, a labelled Tamil text fixture. Live transcription requires a configured key and provider access.

## Demo A · Payment resolution

Open **Check**, expand **Try a demo scenario**, select a row to fill the form, then choose **Check Payment**. All times are IST on **13 November 2026**.

| Outcome | Amount | Approximate time | UPI reference |
| --- | ---: | --- | --- |
| Received | ₹500 | 9:48 AM | 990000002006 |
| Not verified | ₹2,000 | 9:48 AM | Leave blank |
| Pending | ₹240 | 10:21 AM | 990000002007 |
| Failed | ₹180 | 10:54 AM | 990000002008 |
| Unavailable | ₹500 | 12:10 PM | Leave blank |
| More details needed | ₹320 | 11:18 AM | Leave blank |

For **Received**, show the merchant record `DEMO-206` and its UPI reference. Then check the ₹2,000 claim, choose **Save as Issue**, recheck it, and close it. In a fresh browser this creates `PR-1001`. The **Closed** tab keeps the check history and Home updates its open-issue count.

The ledger uses the amount, a ten-minute window around the entered time, and the exact UPI reference when supplied. A unique matching received record is required to confirm. The unavailable example uses a fixed simulated outage window.

## Demo B · Billing and collection

1. Create a bill and manually add **2 Milk packets** and **1 Bread packet** for ₹96 at demo prices.
2. Choose **Add by Tamil Voice**. Say the phrase below when Sarvam is configured. The voice demo route also offers a labelled text fixture.

   > ரெண்டு மில்க் பாக்கெட், மூணு பிஸ்கட், ஒரு கிலோ சர்க்கரை, அரை கிலோ அரிசி

3. Review and confirm the four candidates. Milk merges from 2 to 4 packets. Biscuit × 3 pieces, Sugar × 1 kg, and Rice × 0.5 kg become three new lines. With demo prices and no discount, the total is **₹260**.
4. Review, continue to payment, choose **Collected via Cash**, and confirm. Open the itemised receipt from **Bill history**.
5. To demonstrate UPI collection on a separate bill, use **Quick Amount** for ₹500, then select **Check Payment Status** and enter the received example above. The QR encodes the amount and bill revision as non-payable plain text. A ledger reference can be linked to one bill per browser data store.

For the presenter walkthrough, choose **Simulate Customer Payment** in **Presenter controls** on the checkout screen. The success receipt and **Demo Paid** history status are stored in this browser. The supplied MP3 plays when the confirmation is first saved. Use **Replay Sound** on the result screen if the browser blocks automatic playback.

Drafts, catalogue edits, bills, and issues use browser storage. The app supports one active draft at a time. Payment activity and sample prices are synthetic. Cash records reflect merchant confirmation. There is no real Paytm account connection or transaction initiation.

## Checks

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm start
```
