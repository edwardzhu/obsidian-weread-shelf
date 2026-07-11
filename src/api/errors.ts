export class WereadGatewayError extends Error {
	constructor(
		public readonly code: number,
		message: string,
	) {
		super(message);
		this.name = 'WereadGatewayError';
	}
}

export class WereadUpgradeRequiredError extends Error {
	constructor(public readonly instruction: string) {
		super(instruction);
		this.name = 'WereadUpgradeRequiredError';
	}
}
