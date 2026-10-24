import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class MagicHourApi implements ICredentialType {
	name = 'magicHourApi';

	icon = 'file:magichour.svg' as const;

	displayName = 'Magic Hour API';

	documentationUrl = 'https://docs.magichour.ai/get-started/authentication';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Your Magic Hour API key. Create one at https://magichour.ai/developer?tab=api-keys. Generations are billed to this account.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// Cheap call that requires a valid key but spends no generation credits.
	// List endpoints 404; upload-urls is the reliable auth probe (401 on bad key).
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.magichour.ai/v1',
			url: '/files/upload-urls',
			method: 'POST',
			body: {
				items: [{ type: 'image', extension: 'png' }],
			},
		},
	};
}
