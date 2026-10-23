# Product photo → downloadable video

Animate a product photo with Magic Hour, then download the MP4 directly in n8n. Start with one image before connecting a catalog.

## Install and run

1. Use self-hosted n8n. In `~/.n8n/nodes`, run `npm install https://github.com/magichourhq/n8n-nodes-magichour/releases/download/0.2.4/n8n-nodes-magichour-0.2.4.tgz`, then restart n8n ([manual installation](https://docs.n8n.io/integrations/community-nodes/installation-and-management/manual-installation/)). This is the tested 0.2.4 GitHub release; npm still serves 0.2.3 because 0.2.4 registry publication is blocked by package permissions. Unverified community nodes cannot be installed on n8n Cloud.
2. Create a [Magic Hour API key](https://magichour.ai/developer?tab=api-keys) and save it in a **Magic Hour API** credential in n8n. Select that credential on the Magic Hour node. Never paste a key into the workflow JSON.
3. Import [image-to-video.example.json](image-to-video.example.json). The included photo is Magic Hour's fictional AURORA product, not a customer asset. Replace its URL with your own authorized product photo when adapting.
4. Review the prompt, duration and resolution, and check the [current API pricing and account estimate](https://help.magichour.ai/en/articles/8350794-api-pricing-calculator-and-usage-based-billing). Executing Magic Hour creates a billable generation on your account; the sample requests five seconds at 720p.
5. Run the workflow once. Magic Hour returns `projectId`, `externalId`, `creditsCharged` and `outputUrl`. Open **Download Video → Binary → data** to preview or save the MP4. Inspect the complete video for product shape, label accuracy and unwanted motion before using it.

## Existing demonstration

![Synthetic AURORA product photo](https://raw.githubusercontent.com/magichourhq/skills/e43c205454e2b98f155cf1632cf158220c564907/examples/aurora/guided-image.png)

[Watch the existing Magic Hour product animation](https://github.com/magichourhq/skills/blob/e43c205454e2b98f155cf1632cf158220c564907/examples/aurora/guided-video.mp4). It was generated through the web interface on September 10, 2026 with LTX-2.5, 480p and a one-second request. It illustrates the input/output, not an execution of this n8n workflow or its five-second settings. [Source, prompt and provenance](https://github.com/magichourhq/skills/tree/e43c205454e2b98f155cf1632cf158220c564907/examples/aurora).

## Scale to a product sheet

Import [A-product-video-automation.json](../templates/A-product-video-automation.json). Configure Google Sheets and Drive credentials, select a sheet and destination folder, and start with one row:

| product_id | image_url | prompt |
| --- | --- | --- |
| aurora-001 | Your authorized, downloadable image URL | Slow camera push-in; keep the product, label and colors unchanged. |

`prompt` is optional. The workflow preserves each row's `product_id` as `externalId` and saves `<product_id>_product.mp4` to Drive. Google OAuth setup is separate from Magic Hour authentication. Review credit use on one item before running a batch.

## Recover without another generation

Keep the original execution and its `projectId`. If waiting times out, the error includes that ID; the job may still be running. Use a Magic Hour node with **Resource → Project**, **Operation → Get Status**, **Project Type → Video** and that same ID. A completed project returns `status: complete` and `downloads[].url`; download the first URL with an HTTP Request node set to **Response Format → File**. Project status uses the raw API shape, unlike the generation node's `status: succeeded` and `outputUrl`. Preserve the full signed URL. Do not rerun a billable create to retrieve an existing result.
