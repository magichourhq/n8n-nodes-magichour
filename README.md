# n8n-nodes-magichour

Generate and edit video, image and audio with [Magic Hour](https://magichour.ai)
from inside n8n.

This is the official Magic Hour node, maintained by Magic Hour. It covers the
same **27 generation endpoints** as the Apify Actors in
[`magic-hour-channels`](https://github.com/magichourhq/magic-hour-channels),
driven from a shared catalog (`catalog/operations.json`).

## Installation

**Self-hosted** — Settings → Community Nodes → Install, then enter
`n8n-nodes-magichour`.

**n8n Cloud** — only verified community nodes can be installed. Once this
package is verified, search for "Magic Hour" in the nodes panel. Installing
the package by npm name is available only on self-hosted n8n.

See [n8n's community-node installation options](https://docs.n8n.io/integrations/community-nodes/installation-and-management/).

Maintained by [malihashar](https://github.com/malihashar); product branding and API are Magic Hour.

**Local / unpublished** — from this repo:

```bash
npm install
npm run build
# then link into your n8n custom extensions folder, or:
npm run dev
```

## Credentials

You need a Magic Hour API key. Create one in the
[developer dashboard](https://magichour.ai/developer?tab=api-keys), then add it
once as a **Magic Hour API** credential. Every Magic Hour node in your
workflows reuses it. Generations are billed to that account (BYOK — there is no
n8n pay-per-event layer like Apify PPE).

Saving the credential verifies the key with a read-only call, so a wrong key
fails immediately rather than on your first generation.

## Operations

### Video (11)

| Operation | Endpoint |
|---|---|
| Image to Video | `/image-to-video` |
| Text to Video | `/text-to-video` |
| Video Face Swap | `/face-swap` |
| Talking Photo | `/ai-talking-photo` |
| Lip Sync | `/lip-sync` |
| Character Replace | `/character-replace` |
| Edit Video | `/ai-video-editor` |
| Video to Video | `/video-to-video` |
| Audio to Video | `/audio-to-video` |
| Auto Subtitles | `/auto-subtitle-generator` |
| Animation | `/animation` |

### Image (14)

| Operation | Endpoint |
|---|---|
| Generate Image | `/ai-image-generator` |
| Edit Image | `/ai-image-editor` |
| Image Face Swap | `/face-swap-photo` |
| Upscale Image | `/ai-image-upscaler` |
| Remove Background | `/image-background-remover` |
| Headshot | `/ai-headshot-generator` |
| Clothes Changer | `/ai-clothes-changer` |
| Head Swap | `/head-swap` |
| Body Swap | `/body-swap` |
| Face Editor | `/ai-face-editor` |
| GIF Generator | `/ai-gif-generator` |
| Meme Generator | `/ai-meme-generator` |
| Photo Colorizer | `/photo-colorizer` |
| QR Code Generator | `/ai-qr-code-generator` |

### Audio (2)

| Operation | Endpoint |
|---|---|
| Voice Generator | `/ai-voice-generator` |
| Voice Cloner | `/ai-voice-cloner` |

### Project

| Operation | Inputs |
|---|---|
| Get Status | project ID, project type |

## Files come straight from the previous node

Every media input accepts either a **file from the previous node** or a
**URL**. "From Previous Node" is the default, so this works with no hosting
step of your own:

```
Google Drive → Magic Hour (Talking Photo) → Google Drive
```

Behind the scenes the node requests a presigned upload URL from Magic Hour,
uploads the bytes, and passes the resulting file reference to the generation.
You never have to make a file publicly reachable.

## Waiting for generations

Magic Hour generations are asynchronous. **Wait for Completion** is on by
default: the node creates the job, polls with backoff, and returns the finished
media URL, so the next node can use it directly.

Turn it off to get the project ID immediately and poll separately with the
**Get Status** operation — useful for very long jobs or when you would rather
not hold a workflow open.

**Timeout** defaults to 15 minutes. On timeout the node reports the project ID,
and the job keeps running on Magic Hour, so nothing is lost.

## Output

One shape across every operation (aligned with the Apify Actor dataset):

```json
{
  "schemaVersion": "1.0",
  "externalId": "row-42",
  "status": "succeeded",
  "operation": "imageToVideo",
  "slug": "image-to-video",
  "outputUrl": "https://...",
  "downloadUrl": "https://...",
  "downloadUrls": ["https://..."],
  "mediaType": "video/mp4",
  "projectId": "clx1234567890",
  "creditsCharged": 120,
  "errorCode": null,
  "errorMessage": null
}
```

Set **External ID** to round-trip your own catalog key through a batch.

Magic Hour download URLs expire, so add a node that saves the file if you need
to keep it.

## Pricing

Unlike Apify Store PPE, n8n does not take a platform cut on generations.
Credits are charged on the caller's Magic Hour account only. Use
`creditsCharged` on the output (and
[Magic Hour pricing](https://magichour.ai/pricing)) for cost tracking.

## Batches and loops

Each input item is processed in turn, and output items are paired back to their
input, so results stay aligned when you feed in a spreadsheet or a folder.

Turn on **Continue On Fail** if you would rather a 200-row batch skip a bad row
than stop. Failed items come through with `status: "failed"` and an
`errorMessage`.

Magic Hour rate-limits heavy bursts; if you hit one, the node says so and a
Wait node between items resolves it.

## Example workflow

Import [`workflows/image-to-video.example.json`](workflows/image-to-video.example.json)
into n8n, attach your Magic Hour credential, and run.

## Templates (§11)

| Template | File |
|---|---|
| A — Product video automation | [`templates/A-product-video-automation.json`](templates/A-product-video-automation.json) |
| B — Social video factory | [`templates/B-social-video-factory.json`](templates/B-social-video-factory.json) |
| C — UGC talking photo | [`templates/C-ugc-talking-photo.json`](templates/C-ugc-talking-photo.json) |

Launch status vs the official brief: [`STATUS.md`](STATUS.md). E2E checklist: [`TESTING.md`](TESTING.md).

## Coverage check

```bash
npm run coverage
```

Fails if `catalog/operations.json` lists an endpoint the node does not expose.
Refresh the catalog from `magic-hour-channels` when Magic Hour ships new APIs.

## Use with AI Agents

This node is available as a tool, so an AI Agent can call it and fill in the
parameters itself — for example generating an image from a prompt it wrote, or
turning a supplied photo into a video.

## Errors

The node translates Magic Hour's responses into actionable messages: an invalid
key points at the developer dashboard, insufficient credits says so plainly,
and a rate limit suggests the fix rather than repeating the status code.

## Links

Same support surface as the Magic Hour Apify Actors:

| | URL |
|---|---|
| Product | https://magichour.ai |
| API docs | https://docs.magichour.ai |
| API keys | https://magichour.ai/developer?tab=api-keys |
| Pricing | https://magichour.ai/pricing |
| Support | support@magichour.ai |
| Community | https://discord.gg/JX5rgsZaJp |
| Issues (this node) | https://github.com/malihashar/n8n-nodes-magichour/issues |

## License

[MIT](LICENSE)

## Recover an accepted job

With Continue On Fail enabled, a generation that times out or encounters a polling
error returns `status: failed` with its accepted `projectId`, known `creditsCharged`,
and the input `externalId`. Save those fields and use Project > Get Status with the
same ID and media type. Do not repeat the create action to recover a rendering delay.
A completed job with no usable download returns an error instead of `succeeded`.
Failed-job credit refunds are reflected when the provider returns the final charge.

Development verification: `npm run build`, `npm run lint`, then
`node --test scripts/recovery.test.cjs`. The recovery suite uses controlled HTTP
responses and spends no credits.
