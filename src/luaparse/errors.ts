export class Error {
	message: string;
	name: string;

	constructor(message?: string) {
		this.message = message || "";
		this.name = "Error";
		this.setErrorMessage();
	}

	setErrorMessage() {
		setmetatable(this, {
			__tostring: () => {
				return `${this.name}: ${this.message}`;
			},
		});
	}
}

export class SyntaxError {
	line: number;
	index: number;
	column: number;
	message: string;
	name: string;

	constructor(message?: string) {
		this.message = message || "";
		this.name = "SyntaxError";
		this.line = 0;
		this.index = 0;
		this.column = 0;
		this.setErrorMessage();
	}

	setErrorMessage() {
		setmetatable(this, {
			__tostring: () => {
				return `${this.name}: ${this.message} at line ${this.line}, column ${this.column}, index: ${this.index}`;
			},
		});
	}
}
