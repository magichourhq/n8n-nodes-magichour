import type {
	IDataObject,
	JsonObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	AUDIO_OPERATIONS,
	IMAGE_OPERATIONS,
	VIDEO_OPERATIONS,
	findOperation,
	operationProperties,
	type Operation,
} from './operations';
import { magicHourRequest, uploadBinary, waitForCompletion } from './transport';

const SCHEMA_VERSION = '1.0';

const MEDIA_MIME: Record<string, string> = {
	video: 'video/mp4',
	image: 'image/png',
	audio: 'audio/mpeg',
};

export class MagicHour implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Magic Hour',
		name: 'magicHour',
		icon: { light: 'file:magichour.svg', dark: 'file:magichour.dark.svg' },
		group: ['transform'],
		version: [1],
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Generate and edit video, image and audio with Magic Hour',
		defaults: { name: 'Magic Hour' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		// Lets an AI Agent call these operations and fill the parameters itself.
		usableAsTool: true,
		credentials: [{ name: 'magicHourApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				default: 'video',
				options: [
					{ name: 'Audio', value: 'audio' },
					{ name: 'File', value: 'file' },
					{ name: 'Image', value: 'image' },
					{ name: 'Project', value: 'project' },
					{ name: 'Video', value: 'video' },
				],
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'imageToVideo',
				displayOptions: { show: { resource: ['video'] } },
				options: VIDEO_OPERATIONS.map((op) => ({
					name: op.name, value: op.value, action: op.action, description: op.description,
				})),
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'generateImage',
				displayOptions: { show: { resource: ['image'] } },
				options: IMAGE_OPERATIONS.map((op) => ({
					name: op.name, value: op.value, action: op.action, description: op.description,
				})),
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'voiceGenerator',
				displayOptions: { show: { resource: ['audio'] } },
				options: AUDIO_OPERATIONS.map((op) => ({
					name: op.name, value: op.value, action: op.action, description: op.description,
				})),
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'upload',
				displayOptions: { show: { resource: ['file'] } },
				options: [{
					name: 'Upload Media', value: 'upload',
					action: 'Upload media to magic hour',
					description: 'Upload a binary file and get a Magic Hour file path for later generations',
				}],
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'get',
				displayOptions: { show: { resource: ['project'] } },
				options: [{
					name: 'Get Status', value: 'get',
					action: 'Get a project status',
					description: 'Look up a generation by its project ID',
				}],
			},
			{
				displayName: 'Binary Property',
				name: 'uploadBinaryProperty',
				type: 'string',
				default: 'data',
				required: true,
				description: 'Name of the binary field to upload',
				displayOptions: { show: { resource: ['file'], operation: ['upload'] } },
			},
			{
				displayName: 'Media Kind',
				name: 'uploadKind',
				type: 'options',
				default: 'image',
				description: 'What kind of file this is (sets Magic Hour upload type)',
				options: [
					{ name: 'Image', value: 'image' },
					{ name: 'Video', value: 'video' },
					{ name: 'Audio', value: 'audio' },
				],
				displayOptions: { show: { resource: ['file'], operation: ['upload'] } },
			},
			{
				displayName: 'Project ID',
				name: 'projectId',
				type: 'string',
				default: '',
				required: true,
				description: 'The project ID returned when the generation was created',
				displayOptions: { show: { resource: ['project'] } },
			},
			{
				displayName: 'Project Type',
				name: 'projectType',
				type: 'options',
				default: 'video-projects',
				description: 'Which kind of project to look up',
				options: [
					{ name: 'Video', value: 'video-projects' },
					{ name: 'Image', value: 'image-projects' },
					{ name: 'Audio', value: 'audio-projects' },
				],
				displayOptions: { show: { resource: ['project'] } },
			},

			...operationProperties('video', VIDEO_OPERATIONS),
			...operationProperties('image', IMAGE_OPERATIONS),
			...operationProperties('audio', AUDIO_OPERATIONS),

			{
				displayName: 'External ID',
				name: 'externalId',
				type: 'string',
				default: '',
				description:
					'Your own ID for this item. Round-trips on the output so batch results can join back to your catalog — same role as Apify externalId.',
				displayOptions: { show: { resource: ['video', 'image', 'audio'] } },
			},
			{
				displayName: 'Wait for Completion',
				name: 'waitForCompletion',
				type: 'boolean',
				default: true,
				description:
					'Whether to wait for the generation to finish and return the media URL. Turn off to get the project ID immediately and poll separately.',
				displayOptions: { show: { resource: ['video', 'image', 'audio'] } },
			},
			{
				displayName: 'Timeout (Seconds)',
				name: 'timeoutSeconds',
				type: 'number',
				default: 900,
				description:
					'How long to wait before giving up. Long video can take several minutes; the job keeps running on Magic Hour either way.',
				typeOptions: { minValue: 30, maxValue: 3600 },
				displayOptions: {
					show: { resource: ['video', 'image', 'audio'], waitForCompletion: [true] },
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const results: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			// Keep accepted jobs recoverable even when a later poll or download fails.
			let acceptedProjectId: string | null = null;
			let acceptedCredits: number | null = null;
			let activeOperation: Operation | undefined;
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				if (resource === 'project') {
					const projectId = this.getNodeParameter('projectId', i) as string;
					const namespace = this.getNodeParameter('projectType', i) as
						'video-projects' | 'image-projects' | 'audio-projects';
					const body = await magicHourRequest.call(this, 'GET', `/${namespace}/${projectId}`);
					results.push({ json: body as IDataObject, pairedItem: { item: i } });
					continue;
				}

				if (resource === 'file') {
					const property = this.getNodeParameter('uploadBinaryProperty', i, 'data') as string;
					const kind = this.getNodeParameter('uploadKind', i, 'image') as
						'image' | 'video' | 'audio';
					const filePath = await uploadBinary.call(this, i, property, kind);
					results.push({
						json: { filePath, kind, status: 'uploaded' },
						pairedItem: { item: i },
					});
					continue;
				}

				const op = findOperation(operation);
				activeOperation = op;
				if (!op) {
					throw new NodeOperationError(
						this.getNode(), `Unknown operation "${operation}"`, { itemIndex: i },
					);
				}

				const externalId = (this.getNodeParameter('externalId', i, '') as string) || null;
				const payload = await buildPayload.call(this, op, i);
				const created = await magicHourRequest.call(this, 'POST', op.path, payload);
				const projectId = String(created.id ?? '');
				acceptedProjectId = projectId || null;
				acceptedCredits = (created.credits_charged as number | null) ?? null;
				if (!projectId) {
					throw new NodeOperationError(
						this.getNode(),
						'Magic Hour did not return a project ID for this generation',
						{ itemIndex: i },
					);
				}

				const wait = this.getNodeParameter('waitForCompletion', i, true) as boolean;
				if (!wait) {
					results.push({
						json: shapeOutput({
							status: String(created.status ?? 'queued'),
							operation: op.value,
							slug: op.slug,
							mediaType: MEDIA_MIME[op.mediaType] ?? null,
							projectId,
							externalId,
							creditsCharged: (created.credits_charged as number | null) ?? null,
							outputUrl: null,
							downloadUrls: [],
						}),
						pairedItem: { item: i },
					});
					continue;
				}

				const timeout = this.getNodeParameter('timeoutSeconds', i, 900) as number;
				const result = await waitForCompletion.call(
					this, projectId, op.namespace, timeout, i,
				);

				acceptedCredits = result.creditsCharged ?? acceptedCredits;

				if (result.status !== 'complete' && result.status !== 'completed') {
					throw new NodeOperationError(
						this.getNode(),
						`Magic Hour could not complete this generation (status: ${result.status}). Project ID ${projectId}.`,
						{ itemIndex: i },
					);
				}

				const downloadUrls = result.downloads.filter((url) => {
					try { return new URL(url).protocol === 'https:'; } catch { return false; }
				});
				if (!downloadUrls.length) {
					throw new NodeOperationError(this.getNode(),
						'Magic Hour completed this project without a usable download URL. Retrieve the same project again before creating another generation.',
						{ itemIndex: i });
				}

				results.push({
					json: shapeOutput({
						status: 'succeeded',
						operation: op.value,
						slug: op.slug,
						mediaType: MEDIA_MIME[op.mediaType] ?? null,
						projectId,
						externalId,
						creditsCharged: acceptedCredits,
						outputUrl: downloadUrls[0],
						downloadUrls,
					}),
					pairedItem: { item: i },
				});
			} catch (error) {
				const originalMessage = (error as Error).message;
				const errorMessage = acceptedProjectId && !originalMessage.includes(acceptedProjectId)
					? `${originalMessage} Project ID ${acceptedProjectId}. Retrieve this existing project before creating another generation.`
					: originalMessage;
				// Honour the workflow's own error setting rather than always
				// stopping: a 200-item batch should not die on one bad row.
				if (this.continueOnFail()) {
					const externalId = (() => {
						try {
							return (this.getNodeParameter('externalId', i, '') as string) || null;
						} catch {
							return null;
						}
					})();
					results.push({
						json: shapeOutput({
							status: 'failed',
							operation: (this.getNodeParameter('operation', i, '') as string) || null,
							slug: activeOperation?.slug ?? null,
							mediaType: activeOperation ? MEDIA_MIME[activeOperation.mediaType] ?? null : null,
							projectId: acceptedProjectId,
							externalId,
							creditsCharged: acceptedCredits,
							outputUrl: null,
							downloadUrls: [],
							errorCode: 'generation_failed',
							errorMessage,
						}),
						pairedItem: { item: i },
					});
					continue;
				}
				if (error instanceof NodeOperationError) {
					throw new NodeOperationError(this.getNode(), errorMessage, { itemIndex: i });
				}
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i, message: errorMessage });
			}
		}

		return [results];
	}
}

/** Same field list spirit as Apify gateway/output.py — one shape across ops. */
function shapeOutput(fields: {
	status: string;
	operation: string | null;
	slug: string | null;
	mediaType: string | null;
	projectId: string | null;
	externalId: string | null;
	creditsCharged: number | null;
	outputUrl: string | null;
	downloadUrls: string[];
	errorCode?: string | null;
	errorMessage?: string | null;
}): IDataObject {
	return {
		schemaVersion: SCHEMA_VERSION,
		externalId: fields.externalId,
		status: fields.status,
		operation: fields.operation,
		slug: fields.slug,
		outputUrl: fields.outputUrl,
		downloadUrl: fields.outputUrl,
		downloadUrls: fields.downloadUrls,
		mediaType: fields.mediaType,
		projectId: fields.projectId,
		creditsCharged: fields.creditsCharged,
		errorCode: fields.errorCode ?? null,
		errorMessage: fields.errorMessage ?? null,
	};
}

/** Assemble the create-request body, uploading any binary inputs first. */
async function buildPayload(
	this: IExecuteFunctions,
	op: Operation,
	itemIndex: number,
): Promise<IDataObject> {
	const payload: IDataObject = { name: `${op.name} via n8n` };
	const assets: IDataObject = {};
	const style: IDataObject = {};

	for (const media of op.media) {
		const source = this.getNodeParameter(`${media.name}Source`, itemIndex, 'binary') as string;
		let filePath: string;

		if (source === 'binary') {
			const property = this.getNodeParameter(
				`${media.name}BinaryProperty`, itemIndex, 'data',
			) as string;
			filePath = await uploadBinary.call(this, itemIndex, property, media.kind);
		} else {
			filePath = this.getNodeParameter(`${media.name}Url`, itemIndex, '') as string;
			if (!filePath && media.required) {
				throw new NodeOperationError(
					this.getNode(),
					`${media.displayName} is required for ${op.name}`,
					{ itemIndex },
				);
			}
		}

		if (filePath) {
			assets[media.assetKey] = media.assetKey.endsWith('_paths') ? [filePath] : filePath;
		}
	}

	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	if (op.prompt) {
		const prompt = this.getNodeParameter('prompt', itemIndex, '') as string;
		if (!prompt && op.prompt.required) {
			throw new NodeOperationError(
				this.getNode(), `A prompt is required for ${op.name}`, { itemIndex },
			);
		}
		if (prompt) style.prompt = prompt;
	}

	if (op.duration) {
		const seconds = this.getNodeParameter('durationSeconds', itemIndex, 5) as number;
		payload.end_seconds = seconds;
		if (op.window) payload.start_seconds = 0;
	}

	if (op.specials?.includes('scaleFactor')) {
		payload.scale_factor = this.getNodeParameter('scaleFactor', itemIndex, 2) as number;
	}
	if (op.specials?.includes('qrContent')) {
		payload.content = this.getNodeParameter('qrContent', itemIndex, '') as string;
	}
	if (op.specials?.includes('voiceName')) {
		style.voice_name = this.getNodeParameter('voiceName', itemIndex, 'Elon Musk') as string;
	}
	if (op.specials?.includes('memeTopic')) {
		style.topic = this.getNodeParameter('memeTopic', itemIndex, '') as string;
	}
	if (op.specials?.includes('memeTemplate')) {
		style.template = this.getNodeParameter('memeTemplate', itemIndex, 'Random') as string;
	}
	if (op.specials?.includes('artStyle')) {
		style.art_style = this.getNodeParameter('artStyle', itemIndex, '') as string;
	}

	// Animation needs a few required style enums; default to directed-by-AI so
	// a workflow author is not forced through every slider on first use.
	if (op.slug === 'animation') {
		if (!style.art_style) style.art_style = 'Directed by AI';
		style.camera_effect = style.camera_effect ?? 'Simple Zoom In';
		style.prompt_type = style.prompt_type ?? (style.prompt ? 'custom' : 'ai_choose');
		style.transition_speed = style.transition_speed ?? 5;
	}

	if (options.model && options.model !== 'default') payload.model = options.model;
	if (options.resolution) payload.resolution = options.resolution;
	if (options.aspectRatio) payload.aspect_ratio = options.aspectRatio;

	// body-swap requires resolution — default when the Options collection is empty
	if (op.slug === 'body-swap' && !payload.resolution) {
		payload.resolution = '1k';
	}

	const extra = op.extra?.(options) ?? {};
	const extraAssets = (extra.assets ?? {}) as IDataObject;
	delete extra.assets;
	Object.assign(payload, extra);

	const merged = { ...extraAssets, ...assets };
	if (Object.keys(merged).length) payload.assets = merged;
	if (Object.keys(style).length || op.requiresStyle) payload.style = style;

	return payload;
}
