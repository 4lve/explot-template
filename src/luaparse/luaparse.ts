/* eslint-disable no-constant-condition */
/* eslint-disable no-case-declarations */
/* eslint-disable no-extra-boolean-cast */
/* eslint-disable @typescript-eslint/no-inferrable-types */
import {
	LuaAstBuilder,
	Identifier,
	LabelStatement,
	BreakStatement,
	GotoStatement,
	Expression,
	ReturnStatement,
	IfClauses,
	IfStatement,
	Block,
	IfClause,
	ElseifClause,
	ElseClause,
	WhileStatement,
	DoStatement,
	RepeatStatement,
	LocalStatement,
	MemberExpression,
	IndexExpression,
	AssignmentStatement,
	CallExpression,
	CallStatement,
	VarargLiteral,
	FunctionDeclaration,
	FunctionExpression,
	ForNumericStatement,
	ForGenericStatement,
	Chunk,
	Literal,
	TableKey,
	TableKeyString,
	TableValue,
	TableConstructorExpression,
	BinaryOperator,
	LogicalOperator,
	BinaryExpression,
	LogicalExpression,
	UnaryOperator,
	UnaryExpression,
	Indexer,
	TableCallExpression,
	StringLiteral,
	StringCallExpression,
	Comment,
	Node,
	TextRange,
	Location,
	Statement,
	PrimaryExpression,
} from "./ast";

import { Object, String, Arr } from "luaUtils";
import { Error, SyntaxError } from "./errors";

export const version = "0.2.1";

const parseInt = (str: string, radix: number) => {
	const val = tonumber(str, radix);
	if (!val) {
		return 0 / 0; // NaN
	}
	return math.floor(val);
};

let input: string, options: ParserOptions, length: number, features: LuaFeatures, encodingMode: EncodingMode;

interface LuaFeatures {
	labels?: boolean;
	emptyStatement?: boolean;
	hexEscapes?: boolean;
	skipWhitespaceEscape?: boolean;
	strictEscapes?: boolean;
	unicodeEscapes?: boolean;
	relaxedBreak?: boolean;
	bitwiseOperators?: boolean;
	integerDivision?: boolean;
	contextualGoto?: boolean;

	extendedIdentifiers?: boolean;
}

interface ParserOptions {
	/** Explicitly tell the parser when the input ends. */
	wait: boolean;
	/** Store comments as an array in the chunk object. */
	comments: boolean;
	/**
	 * Track identifier scopes by adding an isLocal attribute to each
	 * identifier-node.
	 */
	scope: boolean;
	/**
	 * Store location information on each syntax node as
	 * `loc: { start: { line, column }, end: { line, column } }`.
	 */
	locations: boolean;
	/**
	 * Store the start and end character locations on each syntax node as
	 * `range: [start, end]`.
	 */
	ranges: boolean;
	/**
	 * A callback which will be invoked when a syntax node has been completed.
	 * The node which has been created will be passed as the only parameter.
	 */
	onCreateNode: undefined | Callback;
	/** A callback which will be invoked when a new scope is created. */
	onCreateScope: undefined | Callback;
	/** A callback which will be invoked when the current scope is destroyed. */
	onDestroyScope: undefined | Callback;
	/**
	 * A callback which will be invoked when a local variable is declared in the current scope.
	 * The variable's name will be passed as the only parameter
	 */
	onLocalDeclaration: undefined | Callback;
	/**
	 * The version of Lua targeted by the parser (string; allowed values are
	 * '5.1', '5.2', '5.3').
	 */
	luaVersion: "5.1" | "5.2" | "5.3" | "LuaJIT";
	/** Encoding mode: how to interpret code units higher than U+007F in input */
	encodingMode: string;
	/** Other options */
	[option: string]: unknown;
}

/**
 * Options can be set either globally on the parser object through
 * defaultOptions, or during the parse call.
 */
export const defaultOptions: ParserOptions = {
	wait: false,
	comments: true,
	scope: false,
	locations: false,
	ranges: false,
	onCreateNode: undefined,
	onCreateScope: undefined,
	onDestroyScope: undefined,
	onLocalDeclaration: undefined,
	luaVersion: "5.1",
	encodingMode: "none",
};

function encodeUTF8(codepoint: number, highMask: number = 0): string {
	if (codepoint < 0x80) {
		return String.fromCharCode(codepoint);
	} else if (codepoint < 0x800) {
		return String.fromCharCode(highMask | 0xc0 | (codepoint >> 6), highMask | 0x80 | (codepoint & 0x3f));
	} else if (codepoint < 0x10000) {
		return String.fromCharCode(
			highMask | 0xe0 | (codepoint >> 12),
			highMask | 0x80 | ((codepoint >> 6) & 0x3f),
			highMask | 0x80 | (codepoint & 0x3f),
		);
	} /* istanbul ignore else */ else if (codepoint < 0x110000) {
		return String.fromCharCode(
			highMask | 0xf0 | (codepoint >> 18),
			highMask | 0x80 | ((codepoint >> 12) & 0x3f),
			highMask | 0x80 | ((codepoint >> 6) & 0x3f),
			highMask | 0x80 | (codepoint & 0x3f),
		);
	} else {
		// TODO: Lua 5.4 allows up to six-byte sequences, as in UTF-8:1993
		warn("Lua 5.4 six-byte sequences is not fupported!", codepoint, highMask);
		return "";
	}
}

function toHex(num: number, digits: number): string {
	let result = string.format("%x", num);
	while (result.size() < digits) result = "0" + result;
	return result;
}

interface EncodingMode {
	discardStrings?: boolean;
	fixup: (s: any) => any;
	encodeByte: (b?: number, _?: any) => string;
	encodeUTF8: (c: number, _?: any) => string;
}

const encodingModes: { [encodingMode: string]: EncodingMode } = {
	/**
	 * `pseudo-latin1` encoding mode: assume the input was decoded with the latin1 encoding
	 * WARNING: latin1 does **NOT** mean cp1252 here like in the bone-headed WHATWG standard;
	 * it means true ISO/IEC 8859-1 identity-mapped to Basic Latin and Latin-1 Supplement blocks
	 */
	"pseudo-latin1": {
		fixup: function (this: void, s) {
			return s;
		},
		encodeByte: (value?: number) => {
			if (value === undefined) return "";
			return String.fromCharCode(value);
		},
		encodeUTF8: (codepoint: number) => {
			return encodeUTF8(codepoint);
		},
	},

	/** `x-user-defined` encoding mode: assume the input was decoded with the WHATWG `x-user-defined` encoding */
	"x-user-defined": {
		fixup: function (this: void, s) {
			return s;
		},
		encodeByte: (value?: number) => {
			if (value === undefined) return "";
			if (value >= 0x80) return String.fromCharCode(value | 0xf700);
			return String.fromCharCode(value);
		},
		encodeUTF8: function (this: void, codepoint) {
			return encodeUTF8(codepoint, 0xf700);
		},
	},

	/** `none` encoding mode: disregard intrepretation of string literals, leave identifiers as-is */
	none: {
		discardStrings: false,
		fixup: function (this: void, s) {
			return s;
		},
		encodeByte: function (this: void, value) {
			return "";
		},
		encodeUTF8: function (this: void, codepoint) {
			return "";
		},
	},
};

/**
 * The available tokens expressed as enum flags so they can be checked with
 * bitwise operations.
 */
export enum TokenType {
	EOF = 1,
	StringLiteral = 2,
	Keyword = 4,
	Identifier = 8,
	NumericLiteral = 16,
	Punctuator = 32,
	BooleanLiteral = 64,
	NilLiteral = 128,
	VarargLiteral = 256,
}

/**
 * As this parser is a bit different from luas own, the error messages
 * will be different in some situations.
 */
export let errors = {
	unexpected: "unexpected %1 '%2' near '%3'",
	unexpectedEOF: "unexpected symbol near '<eof>'",
	expected: "'%1' expected near '%2'",
	expectedToken: "%1 expected near '%2'",
	unfinishedString: "unfinished string near '%1'",
	malformedNumber: "malformed number near '%1'",
	decimalEscapeTooLarge: "decimal escape too large near '%1'",
	invalidEscape: "invalid escape sequence near '%1'",
	hexadecimalDigitExpected: "hexadecimal digit expected near '%1'",
	braceExpected: "missing '%1' near '%2'",
	tooLargeCodepoint: "UTF-8 value too large near '%1'",
	unfinishedLongString: "unfinished long string (starting at line %1) near '%2'",
	unfinishedLongComment: "unfinished long comment (starting at line %1) near '%2'",
	ambiguousSyntax: "ambiguous syntax (function call x new statement) near '%1'",
	noLoopToBreak: "no loop to break near '%1'",
	labelAlreadyDefined: "label '%1' already defined on line %2",
	labelNotVisible: "no visible label '%1' for <goto>",
	gotoJumpInLocalScope: "<goto %1> jumps into the scope of local '%2'",
	cannotUseVararg: "cannot use '...' outside a vararg function near '%1'",
	invalidCodeUnit: "code unit U+%1 is not allowed in the current encoding mode",
};

// ### Abstract Syntax Tree
//
// The default AST structure is inspired by the Mozilla Parser API but can
// easily be customized by overriding these functions.

export class DefaultLuaAstBuilder implements LuaAstBuilder {
	labelStatement(this: void, label: Identifier): LabelStatement {
		return {
			type: "LabelStatement",
			label: label,
		};
	}

	breakStatement(this: void): BreakStatement {
		return {
			type: "BreakStatement",
		};
	}

	gotoStatement(this: void, label: Identifier): GotoStatement {
		return {
			type: "GotoStatement",
			label: label,
		};
	}

	returnStatement(this: void, args: Expression[]): ReturnStatement {
		return {
			type: "ReturnStatement",
			arguments: args,
		};
	}

	ifStatement(this: void, clauses: IfClauses): IfStatement {
		return {
			type: "IfStatement",
			clauses: clauses,
		};
	}

	ifClause(this: void, condition: Expression, body: Block): IfClause {
		return {
			type: "IfClause",
			condition: condition,
			body: body,
		};
	}
	elseifClause(this: void, condition: Expression, body: Block): ElseifClause {
		return {
			type: "ElseifClause",
			condition: condition,
			body: body,
		};
	}
	elseClause(this: void, body: Block): ElseClause {
		return {
			type: "ElseClause",
			body: body,
		};
	}

	whileStatement(this: void, condition: Expression, body: Block): WhileStatement {
		return {
			type: "WhileStatement",
			condition: condition,
			body: body,
		};
	}

	doStatement(this: void, body: Block): DoStatement {
		return {
			type: "DoStatement",
			body: body,
		};
	}

	repeatStatement(this: void, condition: Expression, body: Block): RepeatStatement {
		return {
			type: "RepeatStatement",
			condition: condition,
			body: body,
		};
	}

	localStatement(this: void, variables: Identifier[], init: Expression[]): LocalStatement {
		return {
			type: "LocalStatement",
			variables: variables,
			init: init,
		};
	}

	assignmentStatement(
		this: void,
		variables: Array<Identifier | MemberExpression | IndexExpression>,
		init: Expression[],
	): AssignmentStatement {
		return {
			type: "AssignmentStatement",
			variables: variables,
			init: init,
		};
	}

	callStatement(this: void, expression: CallExpression): CallStatement {
		return {
			type: "CallStatement",
			expression: expression,
		};
	}

	functionStatement(
		this: void,
		identifier: Identifier | MemberExpression | undefined,
		parameters: Array<Identifier | VarargLiteral>,
		isLocal: boolean,
		body: Block,
	): FunctionDeclaration | FunctionExpression {
		return {
			type: "FunctionDeclaration",
			identifier: identifier,
			isLocal: isLocal,
			parameters: parameters,
			body: body,
		} as FunctionDeclaration | FunctionDeclaration;
	}

	forNumericStatement(
		this: void,
		variable: Identifier,
		start: Expression,
		end234: Expression,
		step: Expression | undefined,
		body: Block,
	): ForNumericStatement {
		return {
			type: "ForNumericStatement",
			variable: variable,
			start: start,
			end: end234,
			step: step,
			body: body,
		};
	}

	forGenericStatement(
		this: void,
		variables: Identifier[],
		iterators: Expression[],
		body: Block,
	): ForGenericStatement {
		return {
			type: "ForGenericStatement",
			variables: variables,
			iterators: iterators,
			body: body,
		};
	}

	chunk(this: void, body: Block): Chunk {
		return {
			type: "Chunk",
			body: body,
		};
	}

	identifier(this: void, name: string): Identifier {
		return {
			type: "Identifier",
			name: name,
		};
	}

	literal(this: void, type24: TokenType, value: string | number | boolean | undefined, raw: string): Literal {
		const strType =
			type24 === TokenType.StringLiteral
				? "StringLiteral"
				: type24 === TokenType.NumericLiteral
				? "NumericLiteral"
				: type24 === TokenType.BooleanLiteral
				? "BooleanLiteral"
				: type24 === TokenType.NilLiteral
				? "NilLiteral"
				: "VarargLiteral";

		return {
			type: strType,
			value: value,
			raw: raw,
		} as Literal;
	}

	tableKey(this: void, key: Expression, value: Expression): TableKey {
		return {
			type: "TableKey",
			key: key,
			value: value,
		};
	}
	tableKeyString(this: void, key: Identifier, value: Expression): TableKeyString {
		return {
			type: "TableKeyString",
			key: key,
			value: value,
		};
	}
	tableValue(this: void, value: Expression): TableValue {
		return {
			type: "TableValue",
			value: value,
		};
	}

	tableConstructorExpression(
		this: void,
		fields: Array<TableKey | TableKeyString | TableValue>,
	): TableConstructorExpression {
		return {
			type: "TableConstructorExpression",
			fields: fields,
		};
	}
	binaryExpression(
		this: void,
		operator: BinaryOperator | LogicalOperator,
		left: Expression,
		right: Expression,
	): BinaryExpression | LogicalExpression {
		let typesef: "LogicalExpression" | "BinaryExpression" =
			"and" === operator || "or" === operator ? "LogicalExpression" : "BinaryExpression";

		return {
			type: typesef,
			operator: operator,
			left: left,
			right: right,
		} as BinaryExpression | LogicalExpression;
	}
	unaryExpression(this: void, operator: UnaryOperator, argument: Expression): UnaryExpression {
		return {
			type: "UnaryExpression",
			operator: operator,
			argument: argument,
		};
	}
	memberExpression(
		this: void,
		base: Identifier | Expression,
		indexer: Indexer,
		identifier: Identifier,
	): MemberExpression {
		return {
			type: "MemberExpression",
			indexer: indexer,
			identifier: identifier,
			base: base,
		};
	}

	indexExpression(this: void, base: Expression, index: Expression): IndexExpression {
		return {
			type: "IndexExpression",
			base: base,
			index: index,
		};
	}

	callExpression(this: void, base: Identifier | MemberExpression, args: Expression[]): CallExpression {
		return {
			type: "CallExpression",
			base: base,
			arguments: args,
		};
	}

	tableCallExpression(
		this: void,
		base: Identifier | MemberExpression,
		args: TableConstructorExpression,
	): TableCallExpression {
		return {
			type: "TableCallExpression",
			base: base,
			arguments: args,
		};
	}

	stringCallExpression(
		this: void,
		base: Identifier | MemberExpression,
		argument: StringLiteral,
	): StringCallExpression {
		return {
			type: "StringCallExpression",
			base: base,
			argument: argument,
		};
	}

	comment(this: void, value: string, raw: string): Comment {
		return {
			type: "Comment",
			value: value,
			raw: raw,
		};
	}
}

export let ast: LuaAstBuilder = new DefaultLuaAstBuilder();

/**
 * Wrap up the node object.
 *
 * @param node
 */
function finishNode<T extends Node>(node: T): T {
	// Pop a `Marker` off the location-array and attach its location data.
	if (trackLocations) {
		const location = (locations as Marker[]).pop();
		if (!!location) {
			location.complete();
			location.bless(node);
		}
	}
	if (options.onCreateNode) options.onCreateNode(node);
	return node;
}

/**
 * Iterate through an array of objects and return the index of an object
 * with a matching property.
 *
 * @param array
 * @param property
 * @param element
 */
function indexOfObject(array: Identifier[], property: "name", element: string): number {
	for (let i = 0, length = array.size(); i < length; ++i) {
		if (array[i][property] === element) return i;
	}
	return -1;
}

// ### Error functions

/**
 * XXX: Eliminate this function and change the error type to be different from SyntaxError.
 * This will unfortunately be a breaking change, because some downstream users depend
 * on the error thrown being an instance of SyntaxError. For example, the Ace editor:
 * <https://github.com/ajaxorg/ace/blob/4c7e5eb3f5d5ca9434847be51834a4e41661b852/lib/ace/mode/lua_worker.js#L55>
 *
 * @param e
 */
function fixupError<T>(e: T): T {
	return e;
}

/** #### Raise an exception.
 *
 * Raise an exception by passing a token, a string format and its paramters.
 * The passed tokens location will automatically be added to the error
 * message if it exists, if not it will default to the lexers current
 * position.
 *
 * Example:
 *
 *     // [1:0] expected [ near (
 *     raise(token, "expected %1 near %2", '[', token.value);
 *
 * @param token
 * @param args
 */
function raise(token: Token | undefined, ...args: unknown[]): never {
	let message = String.sprintf(args[0] as string, ...Arr.slice(args, 1)),
		errorawdaw,
		col;

	if (token === undefined || typeIs(token.line, "nil")) {
		col = index - lineStart + 1;
		errorawdaw = new SyntaxError(message);
		errorawdaw.index = index;
		errorawdaw.line = line;
		errorawdaw.column = col;
	} else {
		col = token.range[0] - token.lineStart;
		errorawdaw = new SyntaxError(message);
		errorawdaw.line = token.line;
		errorawdaw.index = token.range[0];
		errorawdaw.column = col;
	}
	throw errorawdaw;
}

function tokenValue(token: Token) {
	const raw = String.slice(input, token.range[0], token.range[1]);
	if (raw) return raw;
	return token.value;
}

/**
 * #### Raise an unexpected token error.
 *
 * Example:
 *
 *     // expected <name> near '0'
 *     raiseUnexpectedToken('<name>', token);
 */
function raiseUnexpectedToken(typeuawd: string, token: Token): never {
	raise(token, errors.expectedToken, typeuawd, tokenValue(token));
	throw new Error("This should not happen");
}

/**
 * #### Raise a general unexpected error
 *
 * Usage should pass either a token object or a symbol string which was
 * expected. We can also specify a nearby token such as <eof>, this will
 * default to the currently active token.
 *
 * Example:
 *
 *     // Unexpected symbol 'end' near '<eof>'
 *     unexpected(token);
 *
 * If there's no token in the buffer it means we have reached <eof>.
 */
function unexpected(found: Token | string): never {
	const near = tokenValue(lookahead);
	if (typeIs(found, "table") && !typeIs(found.type, "nil")) {
		let type234;
		switch (found.type) {
			case TokenType.StringLiteral:
				type234 = "string";
				break;
			case TokenType.Keyword:
				type234 = "keyword";
				break;
			case TokenType.Identifier:
				type234 = "identifier";
				break;
			case TokenType.NumericLiteral:
				type234 = "number";
				break;
			case TokenType.Punctuator:
				type234 = "symbol";
				break;
			case TokenType.BooleanLiteral:
				type234 = "boolean";
				break;
			case TokenType.NilLiteral:
				return raise(found, errors.unexpected, "symbol", "nil", near);
			case TokenType.EOF:
				return raise(found, errors.unexpectedEOF);
		}
		return raise(found, errors.unexpected, type234, tokenValue(found), near);
	}
	// found is not Token
	// TODO: Fix it
	return raise(/* found */ undefined, errors.unexpected, "symbol", found, near);
}

/**
 * Lexer
 * -----
 *
 * The lexer, or the tokenizer reads the input string character by character
 * and derives a token left-right. To be as efficient as possible the lexer
 * prioritizes the common cases such as identifiers. It also works with
 * character codes instead of characters as string comparisons was the
 * biggest bottleneck of the parser.
 *
 * If `options.comments` is enabled, all comments encountered will be stored
 * in an array which later will be appended to the chunk object. If disabled,
 * they will simply be disregarded.
 *
 * When the lexer has derived a valid token, it will be returned as an object
 * containing its value and as well as its position in the input string (this
 * is always enabled to provide proper debug messages).
 *
 * `lex()` starts lexing and returns the following token in the stream.
 */
interface Token {
	type: TokenType;
	value: string | boolean | number | undefined;
	range: TextRange;
	line: number;
	lineStart: number;
	lastLine?: number;
	lastLineStart?: number;
}

let index: number,
	token: Token,
	previousToken: Token,
	lookahead: Token,
	comments: Comment[],
	tokenStart: number,
	line: number,
	lineStart: number;

export function lex(): Token {
	skipWhiteSpace();

	// Skip comments beginning with --

	while (45 === String.charCodeAt(input, index) && 45 === String.charCodeAt(input, index + 1)) {
		scanComment();
		skipWhiteSpace();
	}
	if (index >= length) {
		return {
			type: TokenType.EOF,
			value: "<eof>",
			line: line,
			lineStart: lineStart,
			range: [index, index],
		};
	}

	const charCode = String.charCodeAt(input, index),
		nextgfrsg = String.charCodeAt(input, index + 1);

	// Memorize the range index where the token begins.
	tokenStart = index;
	if (isIdentifierStart(charCode)) return scanIdentifierOrKeyword();

	switch (charCode) {
		case 39: // '
		case 34: // '"
			return scanStringLiteral();

		case 48:
		case 49:
		case 50:
		case 51:
		case 52:
		case 53:
		case 54:
		case 55:
		case 56:
		case 57: // 0-9
			return scanNumericLiteral();

		case 46: // .
			// If the dot is followed by a digit it's a float.
			if (isDecDigit(nextgfrsg)) return scanNumericLiteral();
			if (46 === nextgfrsg) {
				if (46 === String.charCodeAt(input, index + 2)) return scanVarargLiteral();
				return scanPunctuator("..");
			}
			return scanPunctuator(".");

		case 61: // =
			if (61 === nextgfrsg) return scanPunctuator("==");
			return scanPunctuator("=");

		case 62: // >
			if (features.bitwiseOperators) if (62 === nextgfrsg) return scanPunctuator(">>");
			if (61 === nextgfrsg) return scanPunctuator(">=");
			return scanPunctuator(">");

		case 60: // <
			if (features.bitwiseOperators) if (60 === nextgfrsg) return scanPunctuator("<<");
			if (61 === nextgfrsg) return scanPunctuator("<=");
			return scanPunctuator("<");

		case 126: // ~
			if (61 === nextgfrsg) return scanPunctuator("~=");
			if (!features.bitwiseOperators) break;
			return scanPunctuator("~");

		case 58: // :
			if (features.labels) if (58 === nextgfrsg) return scanPunctuator("::");
			return scanPunctuator(":");

		case 91: // [
			// Check for a multiline string, they begin with [= or [[
			if (91 === nextgfrsg || 61 === nextgfrsg) return scanLongStringLiteral();
			return scanPunctuator("[");

		case 47: // /
			// Check for integer division op (//)
			if (features.integerDivision) if (47 === nextgfrsg) return scanPunctuator("//");
			return scanPunctuator("/");

		case 38:
		case 124: // & |
			if (!features.bitwiseOperators) break;

		/* fall through */
		case 42:
		case 94:
		case 37:
		case 44:
		case 123:
		case 125:
		case 93:
		case 40:
		case 41:
		case 59:
		case 35:
		case 45:
		case 43: // * ^ % , { } ] ( ) ; # - +
			return scanPunctuator(String.charAt(input, index));
	}
	return unexpected(String.charAt(input, index));
}

/**
 * Whitespace has no semantic meaning in lua so simply skip ahead while
 * tracking the encounted newlines. Any kind of eol sequence is counted as a
 * single line.
 */
function consumeEOL() {
	const charCode = String.charCodeAt(input, index);
	const peekCharCode = String.charCodeAt(input, index + 1);

	if (isLineTerminator(charCode)) {
		// Count \n\r and \r\n as one newline.
		if (10 === charCode && 13 === peekCharCode) ++index;
		if (13 === charCode && 10 === peekCharCode) ++index;
		++line;
		lineStart = ++index;

		return true;
	}
	return false;
}

function skipWhiteSpace() {
	while (index < length) {
		const charCode = String.charCodeAt(input, index);
		if (isWhiteSpace(charCode)) {
			++index;
		} else if (!consumeEOL()) {
			break;
		}
	}
}

/**
 * Identifiers, keywords, booleans and nil all look the same syntax wise. We
 * simply go through them one by one and defaulting to an identifier if no
 * previous case matched.
 */
function scanIdentifierOrKeyword(): Token {
	let value: string | boolean | undefined, typeiawdf: number;

	// Slicing the input string is prefered before string concatenation in a
	// loop for performance reasons.
	while (isIdentifierPart(String.charCodeAt(input, ++index)));
	value = String.slice(input, tokenStart, index); // No ENCODE HEHE

	// Decide on the token type and possibly cast the value.
	if (isKeyword(value as string)) {
		typeiawdf = TokenType.Keyword;
	} else if ("true" === value || "false" === value) {
		typeiawdf = TokenType.BooleanLiteral;
		value = "true" === value;
	} else if ("nil" === value) {
		typeiawdf = TokenType.NilLiteral;
		value = undefined;
	} else {
		typeiawdf = TokenType.Identifier;
	}

	return {
		type: typeiawdf,
		value: value,
		line: line,
		lineStart: lineStart,
		range: [tokenStart, index],
	};
}

/**
 * Once a punctuator reaches this function it should already have been
 * validated so we simply return it as a token.
 */
function scanPunctuator(value: string): Token {
	index += value.size();
	return {
		type: TokenType.Punctuator,
		value: value,
		line: line,
		lineStart: lineStart,
		range: [tokenStart, index],
	};
}

/** A vararg literal consists of three dots. */
function scanVarargLiteral(): Token {
	index += 3;
	return {
		type: TokenType.VarargLiteral,
		value: "...",
		line: line,
		lineStart: lineStart,
		range: [tokenStart, index],
	};
}

/** Find the string literal by matching the delimiter marks used. */
function scanStringLiteral(): Token {
	let delimiter = String.charCodeAt(input, index++),
		beginLine = line,
		beginLineStart = lineStart,
		stringStart = index,
		stringer = "",
		charCode;

	for (;;) {
		charCode = String.charCodeAt(input, index++);
		if (delimiter === charCode) break;
		// EOF or `\n` terminates a string literal. If we haven't found the
		// ending delimiter by now, raise an exception.
		if (index > length || isLineTerminator(charCode)) {
			stringer += String.slice(input, stringStart, index - 1);
			raise(undefined, errors.unfinishedString, String.slice(input, stringStart, index - 1));
		}
		if (92 === charCode) {
			// backslash
			if (!encodingMode.discardStrings) {
				const beforeEscape = String.slice(input, stringStart, index - 1);
				stringer += encodingMode.fixup(beforeEscape);
			}
			const escapeValue = readEscapeSequence();
			if (!encodingMode.discardStrings) stringer += escapeValue;
			stringStart = index;
		}
	}
	if (!encodingMode.discardStrings) {
		stringer += encodingMode.encodeByte();
		stringer += encodingMode.fixup(String.slice(input, stringStart, index - 1));
	}

	return {
		type: TokenType.StringLiteral,
		value: stringer,
		line: beginLine,
		lineStart: beginLineStart,
		lastLine: line,
		lastLineStart: lineStart,
		range: [tokenStart, index],
	};
}

/**
 * Expect a multiline string literal and return it as a regular string
 * literal, if it doesn't validate into a valid multiline string, throw an
 * exception.
 */
function scanLongStringLiteral(): Token {
	const beginLine = line,
		beginLineStart = lineStart,
		stringshit = readLongString(false);
	// Fail if it's not a multiline literal.
	if (false === stringshit) raise(token, errors.expected, "[", tokenValue(token));

	return {
		type: TokenType.StringLiteral,
		value: encodingMode.discardStrings ? undefined : encodingMode.fixup(stringshit),
		line: beginLine,
		lineStart: beginLineStart,
		lastLine: line,
		lastLineStart: lineStart,
		range: [tokenStart, index],
	};
}

/**
 * Numeric literals will be returned as floating-point numbers instead of
 * strings. The raw value should be retrieved from slicing the input string
 * later on in the process.
 *
 * If a hexadecimal number is encountered, it will be converted.
 */
function scanNumericLiteral(): Token {
	const character = String.charAt(input, index),
		nexter = String.charAt(input, index + 1);

	const value =
		"0" === character && !!nexter && String.indexOf("xX", nexter) >= 0 ? readHexLiteral() : readDecLiteral();

	return {
		type: TokenType.NumericLiteral,
		value: value,
		line: line,
		lineStart: lineStart,
		range: [tokenStart, index],
	};
}

/**
 * Lua hexadecimals have an optional fraction part and an optional binary
 * exoponent part. These are not included in JavaScript so we will compute
 * all three parts separately and then sum them up at the end of the function
 * with the following algorithm.
 *
 *     Digit := toDec(digit)
 *     Fraction := toDec(fraction) / 16 ^ fractionCount
 *     BinaryExp := 2 ^ binaryExp
 *     Number := ( Digit + Fraction ) * BinaryExp
 */
function readHexLiteral() {
	let fraction: number | string = 0, // defaults to 0 as it gets summed
		binaryExponent = 1, // defaults to 1 as it gets multiplied
		binarySign = 1, // positive
		digit,
		fractionStart,
		exponentStart,
		digitStart;

	digitStart = index += 2; // Skip 0x part

	// A minimum of one hex digit is required.

	if (!isHexDigit(String.charCodeAt(input, index)))
		raise(undefined, errors.malformedNumber, String.slice(input, tokenStart, index));

	while (isHexDigit(String.charCodeAt(input, index))) ++index;
	// Convert the hexadecimal digit to base 10.
	digit = parseInt(String.slice(input, digitStart, index), 16);

	// Fraction part i optional.
	if ("." === String.charAt(input, index)) {
		fractionStart = ++index;

		while (isHexDigit(String.charCodeAt(input, index))) ++index;
		fraction = String.slice(input, fractionStart, index);

		// Empty fraction parts should default to 0, others should be converted
		// 0.x form so we can use summation at the end.
		fraction = fractionStart === index ? 0 : parseInt(fraction as string, 16) / math.pow(16, index - fractionStart);
	}

	// Binary exponents are optional
	if (!!String.charAt(input, index) && String.indexOf("pP", String.charAt(input, index)) >= 0) {
		++index;

		// Sign part is optional and defaults to 1 (positive).
		if (!!String.charAt(input, index) && String.indexOf("+-", String.charAt(input, index)) >= 0)
			binarySign = "+" === String.charAt(input, index++) ? 1 : -1;

		exponentStart = index;

		// The binary exponent sign requires a decimal digit.
		if (!isDecDigit(String.charCodeAt(input, index)))
			raise(undefined, errors.malformedNumber, String.slice(input, tokenStart, index));

		while (isDecDigit(String.charCodeAt(input, index))) ++index;
		binaryExponent = parseInt(String.slice(input, exponentStart, index), 10);

		// Calculate the binary exponent of the number.
		binaryExponent = math.pow(2, binaryExponent * binarySign);
	}

	return (digit + fraction) * binaryExponent;
}

/**
 * Decimal numbers are exactly the same in Lua and in JavaScript, because of
 * this we check where the token ends and then parse it with native
 * functions.
 */
function readDecLiteral() {
	while (isDecDigit(String.charCodeAt(input, index))) ++index;
	// Fraction part is optional
	if ("." === String.charAt(input, index)) {
		++index;
		// Fraction part defaults to 0
		while (isDecDigit(String.charCodeAt(input, index))) ++index;
	}
	// Exponent part is optional.
	if (!!String.charAt(input, index) && String.indexOf("eE", String.charAt(input, index)) >= 0) {
		++index;
		// Sign part is optional.
		if (!!String.charAt(input, index) && String.indexOf("+-", String.charAt(input, index)) >= 0) ++index;
		// An exponent is required to contain at least one decimal digit.
		if (!isDecDigit(String.charCodeAt(input, index)))
			raise(undefined, errors.malformedNumber, String.slice(input, tokenStart, index));

		while (isDecDigit(String.charCodeAt(input, index))) ++index;
	}

	return tonumber(String.slice(input, tokenStart, index));
}

function readUnicodeEscapeSequence() {
	const sequenceStart = index++;

	if (String.charAt(input, index++) !== "{")
		raise(undefined, errors.braceExpected, "{", "\\" + String.slice(input, sequenceStart, index));
	if (!isHexDigit(String.charCodeAt(input, index)))
		raise(undefined, errors.hexadecimalDigitExpected, "\\" + String.slice(input, sequenceStart, index));

	while (String.charCodeAt(input, index) === 0x30) ++index;
	const escStart = index;

	while (isHexDigit(String.charCodeAt(input, index))) {
		++index;
		if (index - escStart > 6)
			raise(undefined, errors.tooLargeCodepoint, "\\" + String.slice(input, sequenceStart, index));
	}

	const b = String.charAt(input, index++);
	if (b !== "}") {
		if (b === '"' || b === "'")
			raise(undefined, errors.braceExpected, "}", "\\" + String.slice(input, sequenceStart, index--));
		else raise(undefined, errors.hexadecimalDigitExpected, "\\" + String.slice(input, sequenceStart, index));
	}

	const codepoint = parseInt(String.slice(input, escStart, index - 1) || "0", 16);
	const frag = "\\" + String.slice(input, sequenceStart, index);

	if (codepoint > 0x10ffff) {
		raise(undefined, errors.tooLargeCodepoint, frag);
	}

	return encodingMode.encodeUTF8(codepoint, frag);
}

/** Translate escape sequences to the actual characters. */
function readEscapeSequence() {
	const sequenceStart = index;
	switch (String.charAt(input, index)) {
		// Lua allow the following escape sequences.
		case "a":
			++index;
			return "\x07";
		case "n":
			++index;
			return "\n";
		case "r":
			++index;
			return "\r";
		case "t":
			++index;
			return "\t";
		case "v":
			++index;
			return "\x0b";
		case "b":
			++index;
			return "\b";
		case "f":
			++index;
			return "\f";

		// Backslash at the end of the line. We treat all line endings as equivalent,
		// and as representing the [LF] character (code 10). Lua 5.1 through 5.3
		// have been verified to behave the same way.
		case "\r":
		case "\n":
			consumeEOL();
			return "\n";

		case "0":
		case "1":
		case "2":
		case "3":
		case "4":
		case "5":
		case "6":
		case "7":
		case "8":
		case "9":
			// \ddd, where ddd is a sequence of up to three decimal digits.
			while (isDecDigit(String.charCodeAt(input, index)) && index - sequenceStart < 3) ++index;

			const frag = String.slice(input, sequenceStart, index);
			const ddd = parseInt(frag, 10);
			if (ddd > 255) {
				raise(undefined, errors.decimalEscapeTooLarge, "\\" + ddd);
			}
			return encodingMode.encodeByte(ddd, "\\" + frag);

		case "z":
			if (features.skipWhitespaceEscape) {
				++index;
				skipWhiteSpace();
				return "";
			}
			break;

		case "x":
			if (features.hexEscapes) {
				// \xXX, where XX is a sequence of exactly two hexadecimal digits
				if (
					isHexDigit(String.charCodeAt(input, index + 1)) &&
					isHexDigit(String.charCodeAt(input, index + 2))
				) {
					index += 3;
					return encodingMode.encodeByte(
						parseInt(String.slice(input, sequenceStart + 1, index), 16),
						"\\" + String.slice(input, sequenceStart, index),
					);
				}
				raise(undefined, errors.hexadecimalDigitExpected, "\\" + String.slice(input, sequenceStart, index + 2));
			}
			break;

		case "u":
			if (features.unicodeEscapes) return readUnicodeEscapeSequence();
			break;

		case "\\":
		case '"':
		case "'":
			return String.charAt(input, index++);
	}

	if (features.strictEscapes)
		raise(undefined, errors.invalidEscape, "\\" + String.slice(input, sequenceStart, index + 1));
	return String.charAt(input, index++);
}

/**
 * Comments begin with -- after which it will be decided if they are
 * multiline comments or not.
 *
 * The multiline functionality works the exact same way as with string
 * literals so we reuse the functionality.
 */
function scanComment() {
	tokenStart = index;
	index += 2; // --

	const character = String.charAt(input, index);
	let content: string | boolean = "",
		isLong = false;
	const commentStart = index,
		lineStartComment = lineStart,
		lineComment = line;

	if ("[" === character) {
		content = readLongString(true);
		// This wasn't a multiline comment after all.
		if (false === content) content = character;
		else isLong = true;
	}
	// Scan until next line as long as it's not a multiline comment.
	if (!isLong) {
		while (index < length) {
			if (isLineTerminator(String.charCodeAt(input, index))) break;
			++index;
		}
		if (options.comments) content = String.slice(input, commentStart, index);
	}

	if (options.comments) {
		const node = ast.comment(content, String.slice(input, tokenStart, index));

		// `Marker`s depend on tokens available in the parser and as comments are
		// intercepted in the lexer all location data is set manually.
		if (options.locations) {
			node.loc = {
				start: { line: lineComment, column: tokenStart - lineStartComment },
				end: { line: line, column: index - lineStart },
			};
		}
		if (options.ranges) {
			node.range = [tokenStart, index];
		}
		if (options.onCreateNode) options.onCreateNode(node);
		comments.push(node);
	}
}

/**
 * Read a multiline string by calculating the depth of `=` characters and
 * then appending until an equal depth is found.
 */
function readLongString(isComment: boolean) {
	let level = 0,
		content = "",
		terminator = false,
		character: string,
		stringStart: number;
	const firstLine = line;

	++index; // [

	// Calculate the depth of the comment.
	while ("=" === String.charAt(input, index + level)) ++level;
	// Exit, this is not a long string afterall.
	if ("[" !== String.charAt(input, index + level)) return false;

	index += level + 1;

	// If the first character is a newline, ignore it and begin on next line.
	if (isLineTerminator(String.charCodeAt(input, index))) consumeEOL();

	stringStart = index;
	while (index < length) {
		// To keep track of line numbers run the `consumeEOL()` which increments
		// its counter.
		while (isLineTerminator(String.charCodeAt(input, index))) consumeEOL();

		character = String.charAt(input, index++);

		// Once the delimiter is found, iterate through the depth count and see
		// if it matches.
		if ("]" === character) {
			terminator = true;
			for (let i = 0; i < level; ++i) {
				if ("=" !== String.charAt(input, index + i)) terminator = false;
			}
			if ("]" !== String.charAt(input, index + level)) terminator = false;
		}

		// We reached the end of the multiline string. Get out now.
		if (terminator) {
			content += String.slice(input, stringStart, index - 1);
			index += level + 1;
			return content;
		}
	}

	raise(undefined, isComment ? errors.unfinishedLongComment : errors.unfinishedLongString, firstLine, "<eof>");
	throw new Error("This should not happen");
}

/**
 * ## Lex functions and helpers.
 *
 * Read the next token.
 *
 * This is actually done by setting the current token to the lookahead and
 * reading in the new lookahead token.
 */
function nextLex() {
	previousToken = token;
	token = lookahead;
	lookahead = lex();
}

/**
 * Consume a token if its value matches. Once consumed or not, return the
 * success of the operation.
 */
function consume(value: string) {
	if (value === token.value) {
		nextLex();
		return true;
	}
	return false;
}

/** Expect the next token value to match. If not, throw an exception. */
function expect(value: string) {
	if (value === token.value) nextLex();
	else raise(token, errors.expected, value, tokenValue(token));
}

// ### Validation functions

function isWhiteSpace(charCode: number) {
	return 9 === charCode || 32 === charCode || 0xb === charCode || 0xc === charCode;
}

function isLineTerminator(charCode: number) {
	return 10 === charCode || 13 === charCode;
}

function isDecDigit(charCode: number) {
	return charCode >= 48 && charCode <= 57;
}

function isHexDigit(charCode: number) {
	return (
		(charCode >= 48 && charCode <= 57) || (charCode >= 97 && charCode <= 102) || (charCode >= 65 && charCode <= 70)
	);
}

/**
 * From [Lua 5.2](http://www.lua.org/manual/5.2/manual.html#8.1) onwards
 * identifiers cannot use 'locale-dependent' letters (i.e. dependent on the C locale).
 * On the other hand, LuaJIT allows arbitrary octets ≥ 128 in identifiers.
 */
function isIdentifierStart(charCode: number) {
	if ((charCode >= 65 && charCode <= 90) || (charCode >= 97 && charCode <= 122) || 95 === charCode) return true;
	if (features.extendedIdentifiers && charCode >= 128) return true;
	return false;
}

function isIdentifierPart(charCode: number) {
	if (
		(charCode >= 65 && charCode <= 90) ||
		(charCode >= 97 && charCode <= 122) ||
		95 === charCode ||
		(charCode >= 48 && charCode <= 57)
	)
		return true;
	if (features.extendedIdentifiers && charCode >= 128) return true;
	return false;
}

/**
 * [3.1 Lexical Conventions](http://www.lua.org/manual/5.2/manual.html#3.1)
 *
 * `true`, `false` and `nil` will not be considered keywords, but literals.
 */
function isKeyword(id: string) {
	switch (id.size()) {
		case 2:
			return "do" === id || "if" === id || "in" === id || "or" === id;
		case 3:
			return "and" === id || "end" === id || "for" === id || "not" === id;
		case 4:
			if ("else" === id || "then" === id) return true;
			if (features.labels && !features.contextualGoto) return "goto" === id;
			return false;
		case 5:
			return "break" === id || "local" === id || "until" === id || "while" === id;
		case 6:
			return "elseif" === id || "repeat" === id || "return" === id;
		case 8:
			return "function" === id;
	}
	return false;
}

function isUnary(token: Token) {
	if (TokenType.Punctuator === token.type) return String.indexOf("#-~", token.value as string) >= 0;
	if (TokenType.Keyword === token.type) return "not" === token.value;
	return false;
}

/** Check if the token syntactically closes a block. */
function isBlockFollow(token: Token) {
	if (TokenType.EOF === token.type) return true;
	if (TokenType.Keyword !== token.type) return false;
	switch (token.value) {
		case "else":
		case "elseif":
		case "end":
		case "until":
			return true;
		default:
			return false;
	}
}

// Scope
// -----

// Store each block scope as a an array of identifier names. Each scope is
// stored in an FILO-array.
let scopes: string[][],
	// The current scope index
	scopeDepth: number,
	// A list of all global identifier nodes.
	globals: Identifier[];

/** Create a new scope inheriting all declarations from the previous scope. */
function createScope() {
	const scope = [...scopes[scopeDepth++]];
	scopes.push(scope);
	if (options.onCreateScope) options.onCreateScope();
}

/** Exit and remove the current scope. */
function destroyScope() {
	const scope = scopes.pop();
	--scopeDepth;
	if (options.onDestroyScope) options.onDestroyScope();
}

/** Add identifier name to the current scope if it doesnt already exist. */
function scopeIdentifierName(name: string) {
	if (options.onLocalDeclaration) options.onLocalDeclaration(name);
	if (-1 !== scopes[scopeDepth].indexOf(name)) return;
	scopes[scopeDepth].push(name);
}

/** Add identifier to the current scope */
function scopeIdentifier(node: Identifier) {
	scopeIdentifierName(node.name);
	attachScope(node, true);
}

/**
 * Attach scope information to node. If the node is global, store it in the
 * globals array so we can return the information to the user.
 */
function attachScope(node: Identifier, isLocal: boolean) {
	if (!isLocal && -1 === indexOfObject(globals, "name", node.name)) globals.push(node);

	node.isLocal = isLocal;
}

/** Is the identifier name available in this scope. */
function scopeHasName(name: string) {
	return -1 !== scopes[scopeDepth].indexOf(name);
}

/**
 * Location tracking
 * -----------------
 *
 * Locations are stored in FILO-array as a `Marker` object consisting of both
 * `loc` and `range` data. Once a `Marker` is popped off the list an end
 * location is added and the data is attached to a syntax node.
 */
let locations: (Marker | undefined)[] = [],
	trackLocations: boolean;

function createLocationMarker(): Marker {
	return new Marker(token);
}

class Marker {
	public loc: Location | undefined = undefined;
	public range: TextRange | undefined = undefined;

	constructor(token: Token) {
		if (options.locations) {
			this.loc = {
				start: {
					line: token.line,
					column: token.range[0] - token.lineStart,
				},
				end: {
					line: 0,
					column: 0,
				},
			};
		}
		if (options.ranges) this.range = [token.range[0], 0];
	}

	/**
	 * Complete the location data stored in the `Marker` by adding the location
	 * of the *previous token* as an end location.
	 */
	public complete() {
		if (options.locations && !!this.loc) {
			this.loc.end.line = previousToken.lastLine || previousToken.line;
			this.loc.end.column = previousToken.range[1] - (previousToken.lastLineStart || previousToken.lineStart);
		}
		if (options.ranges && !!this.range) {
			this.range[1] = previousToken.range[1];
		}
	}

	public bless(node: Node) {
		if (this.loc) {
			const loc = this.loc;
			node.loc = {
				start: {
					line: loc.start.line,
					column: loc.start.column,
				},
				end: {
					line: loc.end.line,
					column: loc.end.column,
				},
			};
		}
		if (this.range) {
			node.range = [this.range[0], this.range[1]];
		}
	}
}

/** Create a new `Marker` and add it to the FILO-array. */
function markLocation() {
	if (trackLocations) (locations as Marker[]).push(createLocationMarker());
}

/** Push an arbitrary `Marker` object onto the FILO-array. */
function pushLocation(marker: Marker | undefined) {
	if (trackLocations) (locations as Marker[]).push(marker as Marker);
}

// Control flow tracking
// ---------------------
// A context object that validates loop breaks and `goto`-based control flow.

interface Label {
	localCount: number;
	line: number;
}

interface Scope {
	labels: { [key: string]: Label };
	locals: {
		name: string;
		token: Token;
	}[];
	deferredGotos: Goto[];
	isLoop: boolean;
}

interface Goto {
	maxDepth: number;
	target: string;
	token: Token;
	localCounts: number[];
}

interface FlowContext {
	allowVararg?: boolean;
	isInLoop(): boolean;
	pushScope(isLoop?: boolean): void;
	popScope(): void;

	addGoto(target?: string, token?: Token): void;
	addLabel(target?: string, token?: Token): void;

	addLocal(name?: string, token?: Token): void;
	raiseDeferredErrors(): void;
}

class FullFlowContext implements FlowContext {
	public allowVararg?: boolean;

	constructor(public scopes: Scope[] = [], public pendingGotos: Goto[] = []) {}

	public isInLoop() {
		let i = this.scopes.size();
		while (i-- > 0) {
			if (this.scopes[i].isLoop) return true;
		}
		return false;
	}

	public pushScope(isLoop?: boolean) {
		const scope: Scope = {
			labels: {},
			locals: [],
			deferredGotos: [],
			isLoop: !!isLoop,
		};
		this.scopes.push(scope);
	}

	public popScope() {
		for (let i = 0; i < this.pendingGotos.size(); ++i) {
			const theGoto = this.pendingGotos[i];
			if (theGoto.maxDepth >= this.scopes.size())
				if (--theGoto.maxDepth <= 0) raise(theGoto.token, errors.labelNotVisible, theGoto.target);
		}

		this.scopes.pop();
	}

	public addGoto(target: string, token: Token) {
		const localCounts: number[] = [];

		for (let i = 0; i < this.scopes.size(); ++i) {
			const scope = this.scopes[i];
			localCounts.push(scope.locals.size());
			if (scope.labels[target]) return;
		}

		this.pendingGotos.push({
			maxDepth: this.scopes.size(),
			target: target,
			token: token,
			localCounts: localCounts,
		});
	}

	public addLabel(name: string, token: Token) {
		const scope = this.currentScope();

		if (scope.labels[name]) {
			raise(token, errors.labelAlreadyDefined, name, scope.labels[name].line);
		} else {
			const newGotos: Goto[] = [];

			for (let i = 0; i < this.pendingGotos.size(); ++i) {
				const theGoto = this.pendingGotos[i];

				if (theGoto.maxDepth >= this.scopes.size() && theGoto.target === name) {
					if (theGoto.localCounts[this.scopes.size() - 1] < scope.locals.size()) {
						scope.deferredGotos.push(theGoto);
					}
					continue;
				}

				newGotos.push(theGoto);
			}

			this.pendingGotos = newGotos;
		}

		scope.labels[name] = {
			localCount: scope.locals.size(),
			line: token.line,
		};
	}

	public addLocal(name: string, token: Token) {
		this.currentScope().locals.push({
			name: name,
			token: token,
		});
	}

	public currentScope() {
		return this.scopes[this.scopes.size() - 1];
	}

	public raiseDeferredErrors() {
		const scope = this.currentScope();
		const bads = scope.deferredGotos;
		for (let i = 0; i < bads.size(); ++i) {
			const theGoto = bads[i];
			raise(
				theGoto.token,
				errors.gotoJumpInLocalScope,
				theGoto.target,
				scope.locals[theGoto.localCounts[this.scopes.size() - 1]].name,
			);
		}
		// Would be dead code currently, but may be useful later
		// if (bads.size())
		//   scope.deferredGotos = [];
	}
}

/**
 * Simplified context that only checks the validity of loop breaks.
 */
class LoopFlowContext implements FlowContext {
	public allowVararg?: boolean;

	constructor(public level = 0, public loopLevels: number[] = []) {}

	public isInLoop() {
		return !!this.loopLevels.size();
	}

	public pushScope(isLoop?: boolean) {
		++this.level;
		if (!!isLoop) {
			this.loopLevels.push(this.level);
		}
	}

	public popScope() {
		const levels = this.loopLevels;
		const levlen = levels.size();
		if (levlen) {
			if (levels[levlen - 1] === this.level) levels.pop();
		}
		--this.level;
	}

	public addGoto() {
		throw new Error("This should never happen");
	}

	public addLabel() {
		throw new Error("This should never happen");
	}

	public addLocal() {}
	public raiseDeferredErrors() {}
}

function makeFlowContext(): FlowContext {
	return features.labels ? new FullFlowContext() : new LoopFlowContext();
}

// Parse functions
// ---------------

// Chunk is the main program object. Syntactically it's the same as a block.
//
//     chunk ::= block

function parseChunk() {
	nextLex();
	markLocation();
	if (options.scope) createScope();
	const flowContext = makeFlowContext();
	flowContext.allowVararg = true;
	flowContext.pushScope();
	const body = parseBlock(flowContext);
	flowContext.popScope();
	if (options.scope) destroyScope();
	if (TokenType.EOF !== token.type) unexpected(token);
	// If the body is empty no previousToken exists when finishNode runs.
	if (trackLocations && !body.size()) previousToken = token;
	return finishNode(ast.chunk(body));
}

// A block contains a list of statements with an optional return statement
// as its last statement.
//
//     block ::= {stat} [retstat]

function parseBlock(flowContext: FlowContext): Block {
	let block: Block = [],
		statement: Statement | undefined;

	while (!isBlockFollow(token)) {
		// Return has to be the last statement in a block.
		// Likewise 'break' in Lua older than 5.2
		if ("return" === token.value || (!features.relaxedBreak && "break" === token.value)) {
			block.push(parseStatement(flowContext) as ReturnStatement | BreakStatement);
			break;
		}
		statement = parseStatement(flowContext);
		consume(";");
		// Statements are only added if they are returned, this allows us to
		// ignore some statements, such as EmptyStatement.
		if (statement) block.push(statement);
	}

	// Doesn't really need an ast node
	return block;
}

// There are two types of statements, simple and compound.
//
//     statement ::= break | goto | do | while | repeat | return
//          | if | for | function | local | label | assignment
//          | functioncall | ';'

function parseStatement(flowContext: FlowContext): Statement | undefined {
	markLocation();

	if (TokenType.Punctuator === token.type) {
		if (consume("::")) return parseLabelStatement(flowContext);
	}

	// When a `;` is encounted, simply eat it without storing it.
	if (features.emptyStatement) {
		if (consume(";")) {
			if (trackLocations) (locations as Marker[]).pop();
			return;
		}
	}

	flowContext.raiseDeferredErrors();

	if (TokenType.Keyword === token.type) {
		switch (token.value) {
			case "local":
				nextLex();
				return parseLocalStatement(flowContext);
			case "if":
				nextLex();
				return parseIfStatement(flowContext);
			case "return":
				nextLex();
				return parseReturnStatement(flowContext);
			case "function":
				nextLex();
				const name = parseFunctionName();
				return parseFunctionDeclaration(name) as FunctionDeclaration;
			case "while":
				nextLex();
				return parseWhileStatement(flowContext);
			case "for":
				nextLex();
				return parseForStatement(flowContext);
			case "repeat":
				nextLex();
				return parseRepeatStatement(flowContext);
			case "break":
				nextLex();
				if (!flowContext.isInLoop()) raise(token, errors.noLoopToBreak, token.value);
				return parseBreakStatement();
			case "do":
				nextLex();
				return parseDoStatement(flowContext);
			case "goto":
				nextLex();
				return parseGotoStatement(flowContext);
		}
	}

	if (
		features.contextualGoto &&
		token.type === TokenType.Identifier &&
		token.value === "goto" &&
		lookahead.type === TokenType.Identifier &&
		lookahead.value !== "goto"
	) {
		nextLex();
		return parseGotoStatement(flowContext);
	}

	// Assignments memorizes the location and pushes it manually for wrapper nodes.
	if (trackLocations) (locations as Marker[]).pop();

	return parseAssignmentOrCallStatement(flowContext);
}

// ## Statements

//     label ::= '::' Name '::'

function parseLabelStatement(flowContext: FlowContext) {
	const nameToken: Token = token,
		label = parseIdentifier();

	if (options.scope) {
		scopeIdentifierName("::" + nameToken.value + "::");
		attachScope(label, true);
	}

	expect("::");

	flowContext.addLabel(nameToken.value as string, nameToken);
	return finishNode(ast.labelStatement(label));
}

//     break ::= 'break'

function parseBreakStatement() {
	return finishNode(ast.breakStatement());
}

//     goto ::= 'goto' Name

function parseGotoStatement(flowContext: FlowContext) {
	const name = token.value as string,
		gotoToken = previousToken,
		label = parseIdentifier();

	flowContext.addGoto(name, gotoToken);
	return finishNode(ast.gotoStatement(label));
}

//     do ::= 'do' block 'end'

function parseDoStatement(flowContext: FlowContext) {
	if (options.scope) createScope();
	flowContext.pushScope();
	const body = parseBlock(flowContext);
	flowContext.popScope();
	if (options.scope) destroyScope();
	expect("end");
	return finishNode(ast.doStatement(body));
}

//     while ::= 'while' exp 'do' block 'end'

function parseWhileStatement(flowContext: FlowContext) {
	const condition = parseExpectedExpression(flowContext);
	expect("do");
	if (options.scope) createScope();
	flowContext.pushScope(true);
	const body = parseBlock(flowContext);
	flowContext.popScope();
	if (options.scope) destroyScope();
	expect("end");
	return finishNode(ast.whileStatement(condition, body));
}

//     repeat ::= 'repeat' block 'until' exp

function parseRepeatStatement(flowContext: FlowContext) {
	if (options.scope) createScope();
	flowContext.pushScope(true);
	const body = parseBlock(flowContext);
	expect("until");
	flowContext.raiseDeferredErrors();
	const condition = parseExpectedExpression(flowContext);
	flowContext.popScope();
	if (options.scope) destroyScope();
	return finishNode(ast.repeatStatement(condition, body));
}

//     retstat ::= 'return' [exp {',' exp}] [';']

function parseReturnStatement(flowContext: FlowContext) {
	let expressions: Expression[] = [];

	if ("end" !== token.value) {
		let expression = parseExpression(flowContext);

		if (undefined !== expression) expressions.push(expression);
		while (consume(",")) {
			expression = parseExpectedExpression(flowContext);
			expressions.push(expression);
		}
		consume(";"); // grammar tells us ; is optional here.
	}
	return finishNode(ast.returnStatement(expressions));
}

//     if ::= 'if' exp 'then' block {elif} ['else' block] 'end'
//     elif ::= 'elseif' exp 'then' block

function parseIfStatement(flowContext: FlowContext) {
	let clauses: IfClauses,
		condition: Expression,
		body: Block,
		marker: Marker | undefined = undefined;

	// IfClauses begin at the same location as the parent IfStatement.
	// It ends at the start of `end`, `else`, or `elseif`.
	if (trackLocations) {
		marker = locations[(locations as Marker[]).size() - 1];
		(locations as Marker[]).push(marker as Marker);
	}
	condition = parseExpectedExpression(flowContext);
	expect("then");
	if (options.scope) createScope();
	flowContext.pushScope();
	body = parseBlock(flowContext);
	flowContext.popScope();
	if (options.scope) destroyScope();
	clauses = [finishNode(ast.ifClause(condition, body))];

	if (trackLocations) marker = createLocationMarker();
	while (consume("elseif")) {
		pushLocation(marker);
		condition = parseExpectedExpression(flowContext);
		expect("then");
		if (options.scope) createScope();
		flowContext.pushScope();
		body = parseBlock(flowContext);
		flowContext.popScope();
		if (options.scope) destroyScope();
		clauses.push(finishNode(ast.elseifClause(condition, body)));
		if (trackLocations) marker = createLocationMarker();
	}

	if (consume("else")) {
		// Include the `else` in the location of ElseClause.
		if (trackLocations) {
			marker = new Marker(previousToken);
			(locations as Marker[]).push(marker as Marker);
		}
		if (options.scope) createScope();
		flowContext.pushScope();
		body = parseBlock(flowContext);
		flowContext.popScope();
		if (options.scope) destroyScope();
		clauses.push(finishNode(ast.elseClause(body)));
	}

	expect("end");
	return finishNode(ast.ifStatement(clauses));
}

// There are two types of for statements, generic and numeric.
//
//     for ::= Name '=' exp ',' exp [',' exp] 'do' block 'end'
//     for ::= namelist 'in' explist 'do' block 'end'
//     namelist ::= Name {',' Name}
//     explist ::= exp {',' exp}

function parseForStatement(flowContext: FlowContext) {
	let variable = parseIdentifier(),
		body: Block;

	// The start-identifier is local.

	if (options.scope) {
		createScope();
		scopeIdentifier(variable);
	}

	// If the first expression is followed by a `=` punctuator, this is a
	// Numeric For Statement.
	if (consume("=")) {
		// Start expression
		const start = parseExpectedExpression(flowContext);
		expect(",");
		// End expression
		const er = parseExpectedExpression(flowContext);
		// Optional step expression
		const step = consume(",") ? parseExpectedExpression(flowContext) : undefined;

		expect("do");
		flowContext.pushScope(true);
		body = parseBlock(flowContext);
		flowContext.popScope();
		expect("end");
		if (options.scope) destroyScope();

		return finishNode(ast.forNumericStatement(variable, start, er, step, body));
	}
	// If not, it's a Generic For Statement
	else {
		// The namelist can contain one or more identifiers.
		const variables = [variable];
		while (consume(",")) {
			variable = parseIdentifier();
			// Each variable in the namelist is locally scoped.
			if (options.scope) scopeIdentifier(variable);
			variables.push(variable);
		}
		expect("in");
		const iterators = [];

		// One or more expressions in the explist.
		do {
			const expression = parseExpectedExpression(flowContext);
			iterators.push(expression);
		} while (consume(","));

		expect("do");
		flowContext.pushScope(true);
		body = parseBlock(flowContext);
		flowContext.popScope();
		expect("end");
		if (options.scope) destroyScope();

		return finishNode(ast.forGenericStatement(variables, iterators, body));
	}
}

// Local statements can either be variable assignments or function
// definitions. If a function definition is found, it will be delegated to
// `parseFunctionDeclaration()` with the isLocal flag.
//
// This AST structure might change into a local assignment with a function
// child.
//
//     local ::= 'local' 'function' Name funcdecl
//        | 'local' Name {',' Name} ['=' exp {',' exp}]

function parseLocalStatement(flowContext: FlowContext) {
	let name: Identifier,
		declToken = previousToken;

	if (TokenType.Identifier === token.type) {
		let variables: Identifier[] = [],
			init: Expression[] = [];

		do {
			name = parseIdentifier();

			variables.push(name);
			flowContext.addLocal(name.name, declToken);
		} while (consume(","));

		if (consume("=")) {
			do {
				const expression = parseExpectedExpression(flowContext);
				init.push(expression);
			} while (consume(","));
		}

		// Declarations doesn't exist before the statement has been evaluated.
		// Therefore assignments can't use their declarator. And the identifiers
		// shouldn't be added to the scope until the statement is complete.
		if (options.scope) {
			for (let i = 0, l = variables.size(); i < l; ++i) {
				scopeIdentifier(variables[i]);
			}
		}

		return finishNode(ast.localStatement(variables, init));
	}
	if (consume("function")) {
		name = parseIdentifier();
		flowContext.addLocal(name.name, declToken);

		if (options.scope) {
			scopeIdentifier(name);
			createScope();
		}

		// MemberExpressions are not allowed in local function statements.
		return parseFunctionDeclaration(name, true) as FunctionDeclaration;
	} else {
		raiseUnexpectedToken("<name>", token);
	}
}

//     assignment ::= varlist '=' explist
//     const ::= Name | prefixexp '[' exp ']' | prefixexp '.' Name
//     varlist ::= const {',' const}
//     explist ::= exp {',' exp}
//
//     call ::= callexp
//     callexp ::= prefixexp args | prefixexp ':' Name args

function parseAssignmentOrCallStatement(flowContext: FlowContext) {
	// Keep a reference to the previous token for better error messages in case
	// of invalid statement
	// Warning: 'previous' is declared but its value is never read.
	let previous = token,
		marker: Marker | undefined = undefined,
		startMarker: Marker | undefined = undefined;
	let lvalue, base: Expression, name;

	let targets: Expression[] = [];

	if (trackLocations) startMarker = createLocationMarker();

	do {
		if (trackLocations) marker = createLocationMarker();

		if (TokenType.Identifier === token.type) {
			name = token.value as string;
			base = parseIdentifier();
			// Set the parent scope.
			if (options.scope) attachScope(base as Identifier, scopeHasName(name));
			lvalue = true;
		} else if ("(" === token.value) {
			nextLex();
			base = parseExpectedExpression(flowContext);
			expect(")");
			lvalue = false;
		} else {
			return unexpected(token);
		}

		let shouldBreak = false;

		while (!shouldBreak) {
			switch (TokenType.StringLiteral === token.type ? '"' : token.value) {
				case ".":
				case "[":
					lvalue = true;
					break;
				case ":":
				case "(":
				case "{":
				case '"':
					lvalue = undefined;
					break;
				default:
					shouldBreak = true;
			}

			if (!shouldBreak) {
				base = parsePrefixExpressionPart(base as Expression, marker, flowContext) as Expression;
			}
		}

		targets.push(base);

		if ("," !== token.value) break;

		if (!lvalue) {
			return unexpected(token);
		}

		nextLex();
	} while (true);
	if (targets.size() === 1 && lvalue === undefined) {
		pushLocation(marker);
		return finishNode(ast.callStatement(targets[0] as CallExpression));
	} else if (!lvalue) {
		return unexpected(token);
	}

	expect("=");

	const values = [];

	do {
		values.push(parseExpectedExpression(flowContext));
	} while (consume(","));

	pushLocation(startMarker);
	return finishNode(ast.assignmentStatement(targets as (Identifier | MemberExpression | IndexExpression)[], values));
}

// ### Non-statements

//     Identifier ::= Name

function parseIdentifier() {
	markLocation();
	const identifier = token.value as string;
	if (TokenType.Identifier !== token.type) raiseUnexpectedToken("<name>", token);

	nextLex();

	return finishNode(ast.identifier(identifier));
}

// Parse the functions parameters and body block. The name should already
// have been parsed and passed to this declaration function. By separating
// this we allow for anonymous functions in expressions.
//
// For local functions there's a boolean parameter which needs to be set
// when parsing the declaration.
//
//     funcdecl ::= '(' [parlist] ')' block 'end'
//     parlist ::= Name {',' Name} | [',' '...'] | '...'

function parseFunctionDeclaration(name: Identifier | MemberExpression | undefined, isLocal = false) {
	const flowContext = makeFlowContext();
	flowContext.pushScope();

	const parameters: (Identifier | VarargLiteral)[] = [];
	expect("(");

	// The declaration has arguments
	if (!consume(")")) {
		// Arguments are a comma separated list of identifiers, optionally ending
		// with a vararg.
		while (true) {
			if (TokenType.Identifier === token.type) {
				const parameter = parseIdentifier();
				// Function parameters are local.
				if (options.scope) scopeIdentifier(parameter);

				parameters.push(parameter);

				if (consume(",")) continue;
			}
			// No arguments are allowed after a vararg.
			else if (TokenType.VarargLiteral === token.type) {
				flowContext.allowVararg = true;
				parameters.push(parsePrimaryExpression(flowContext) as VarargLiteral);
			} else {
				raiseUnexpectedToken("<name> or '...'", token);
			}
			expect(")");
			break;
		}
	}
	const body = parseBlock(flowContext);
	flowContext.popScope();
	expect("end");
	if (options.scope) destroyScope();

	return finishNode(ast.functionStatement(name, parameters, isLocal, body));
}

// Parse the function name as identifiers and member expressions.
//
//     Name {'.' Name} [':' Name]

function parseFunctionName() {
	let base: Identifier | MemberExpression,
		name: Identifier,
		marker: Marker | undefined = undefined;

	if (trackLocations) marker = createLocationMarker();
	base = parseIdentifier();

	if (options.scope) {
		attachScope(base, scopeHasName(base.name));
		createScope();
	}

	while (consume(".")) {
		pushLocation(marker);
		name = parseIdentifier();
		base = finishNode(ast.memberExpression(base, ".", name));
	}

	if (consume(":")) {
		pushLocation(marker);
		name = parseIdentifier();
		base = finishNode(ast.memberExpression(base, ":", name));
		if (options.scope) scopeIdentifierName("self");
	}

	return base;
}

//     tableconstructor ::= '{' [fieldlist] '}'
//     fieldlist ::= field {fieldsep field} fieldsep
//     field ::= '[' exp ']' '=' exp | Name = 'exp' | exp
//
//     fieldsep ::= ',' | ';'

function parseTableConstructor(flowContext: FlowContext) {
	let fields = [],
		key,
		value;

	while (true) {
		markLocation();
		if (TokenType.Punctuator === token.type && consume("[")) {
			key = parseExpectedExpression(flowContext);
			expect("]");
			expect("=");
			value = parseExpectedExpression(flowContext);
			fields.push(finishNode(ast.tableKey(key, value)));
		} else if (TokenType.Identifier === token.type) {
			if ("=" === lookahead.value) {
				key = parseIdentifier();
				nextLex();
				value = parseExpectedExpression(flowContext);
				fields.push(finishNode(ast.tableKeyString(key, value)));
			} else {
				value = parseExpectedExpression(flowContext);
				fields.push(finishNode(ast.tableValue(value)));
			}
		} else {
			if (undefined === (value = parseExpression(flowContext))) {
				(locations as Marker[]).pop();
				break;
			}
			fields.push(finishNode(ast.tableValue(value)));
		}
		if (String.indexOf(",;", token.value as string) >= 0) {
			nextLex();
			continue;
		}
		break;
	}
	expect("}");
	return finishNode(ast.tableConstructorExpression(fields));
}

// Expression parser
// -----------------
//
// Expressions are evaluated and always return a value. If nothing is
// matched undefined will be returned.
//
//     exp ::= (unop exp | primary | prefixexp ) { binop exp }
//
//     primary ::= nil | false | true | Number | String | '...'
//          | functiondef | tableconstructor
//
//     prefixexp ::= (Name | '(' exp ')' ) { '[' exp ']'
//          | '.' Name | ':' Name args | args }
//

function parseExpression(flowContext: FlowContext): Expression | undefined {
	const expression = parseSubExpression(0, flowContext);
	return expression;
}

// Parse an expression expecting it to be valid.

function parseExpectedExpression(flowContext: FlowContext): Expression {
	const expression = parseExpression(flowContext);
	if (undefined === expression) raiseUnexpectedToken("<expression>", token);
	else return expression;
	throw new Error("This should not happen");
}

// Return the precedence priority of the operator.
//
// As unary `-` can't be distinguished from binary `-`, unary precedence
// isn't described in this table but in `parseSubExpression()` itself.
//
// As this function gets hit on every expression it's been optimized due to
// the expensive CompareICStub which took ~8% of the parse time.

function binaryPrecedence(operator: string) {
	const charCode = String.charCodeAt(operator, 0),
		length = operator.size();

	if (1 === length) {
		switch (charCode) {
			case 94:
				return 12; // ^
			case 42:
			case 47:
			case 37:
				return 10; // * / %
			case 43:
			case 45:
				return 9; // + -
			case 38:
				return 6; // &
			case 126:
				return 5; // ~
			case 124:
				return 4; // |
			case 60:
			case 62:
				return 3; // < >
		}
	} else if (2 === length) {
		switch (charCode) {
			case 47:
				return 10; // //
			case 46:
				return 8; // ..
			case 60:
			case 62:
				if ("<<" === operator || ">>" === operator) return 7; // << >>
				return 3; // <= >=
			case 61:
			case 126:
				return 3; // === ~=
			case 111:
				return 1; // or
		}
	} else if (97 === charCode && "and" === operator) return 2;
	return 0;
}

// Implement an operator-precedence parser to handle binary operator
// precedence.
//
// We use this algorithm because it's compact, it's fast and Lua core uses
// the same so we can be sure our expressions are parsed in the same manner
// without excessive amounts of tests.
//
//     exp ::= (unop exp | primary | prefixexp ) { binop exp }

function parseSubExpression(minPrecedence: number, flowContext: FlowContext): Expression | undefined {
	let operator = token.value as string,
		// The left-hand side in binary operations.
		expression: Expression | undefined = undefined,
		marker: Marker | undefined = undefined;

	if (trackLocations) marker = createLocationMarker();

	// UnaryExpression
	if (isUnary(token)) {
		markLocation();
		nextLex();
		const argument = parseSubExpression(10, flowContext);
		if (argument === undefined) return raiseUnexpectedToken("<expression>", token);
		expression = finishNode(ast.unaryExpression(operator as UnaryOperator, argument));
	}
	if (undefined === expression) {
		// PrimaryExpression
		expression = parsePrimaryExpression(flowContext);

		// PrefixExpression
		if (undefined === expression) {
			expression = parsePrefixExpression(flowContext);
		}
	}
	// This is not a valid left hand expression.
	if (undefined === expression) return undefined;

	let precedence: number;
	while (true) {
		operator = token.value as string;

		precedence =
			TokenType.Punctuator === token.type || TokenType.Keyword === token.type ? binaryPrecedence(operator) : 0;

		if (precedence === 0 || precedence <= minPrecedence) break;
		// Right-hand precedence operators
		if ("^" === operator || ".." === operator) --precedence;
		nextLex();
		const right = parseSubExpression(precedence, flowContext);
		if (undefined === right) return raiseUnexpectedToken("<expression>", token);
		// Push in the marker created before the loop to wrap its entirety.
		if (trackLocations) (locations as Marker[]).push(marker as Marker);

		expression = finishNode(ast.binaryExpression(operator as BinaryOperator | LogicalOperator, expression, right));
	}
	return expression;
}

//     prefixexp ::= prefix {suffix}
//     prefix ::= Name | '(' exp ')'
//     suffix ::= '[' exp ']' | '.' Name | ':' Name args | args
//
//     args ::= '(' [explist] ')' | tableconstructor | String

function parsePrefixExpressionPart(
	base: Expression,
	marker: Marker | undefined,
	flowContext: FlowContext,
): Expression | undefined {
	let expression: Expression, identifier: Identifier;

	if (TokenType.Punctuator === token.type) {
		switch (token.value) {
			case "[":
				pushLocation(marker);
				nextLex();
				expression = parseExpectedExpression(flowContext);
				expect("]");
				return finishNode(ast.indexExpression(base, expression));
			case ".":
				pushLocation(marker);
				nextLex();
				identifier = parseIdentifier();
				return finishNode(ast.memberExpression(base, ".", identifier));
			case ":":
				pushLocation(marker);
				nextLex();
				identifier = parseIdentifier();
				base = finishNode(ast.memberExpression(base, ":", identifier));
				// Once a : is found, this has to be a CallExpression, otherwise
				// throw an error.
				pushLocation(marker);
				return parseCallExpression(base as MemberExpression, flowContext) as Expression;
			case "(":
			case "{": // args
				pushLocation(marker);
				return parseCallExpression(base as Identifier | MemberExpression, flowContext) as Expression;
		}
	} else if (TokenType.StringLiteral === token.type) {
		pushLocation(marker);
		return parseCallExpression(base as Identifier | MemberExpression, flowContext) as Expression;
	}

	return undefined;
}

function parsePrefixExpression(flowContext: FlowContext): Expression | undefined {
	let base: Expression,
		name: string,
		marker: Marker | undefined = undefined;

	if (trackLocations) marker = createLocationMarker();

	// The prefix
	if (TokenType.Identifier === token.type) {
		name = token.value as string;
		base = parseIdentifier();
		// Set the parent scope.
		if (options.scope) attachScope(base as Identifier, scopeHasName(name));
	} else if (consume("(")) {
		base = parseExpectedExpression(flowContext);
		expect(")");
	} else {
		return undefined;
	}

	// The suffix
	for (;;) {
		const newBase = parsePrefixExpressionPart(base, marker, flowContext);
		if (newBase === undefined) break;
		base = newBase;
	}

	return base;
}

//     args ::= '(' [explist] ')' | tableconstructor | String

function parseCallExpression(base: Identifier | MemberExpression, flowContext: FlowContext) {
	if (TokenType.Punctuator === token.type) {
		switch (token.value) {
			case "(":
				if (!features.emptyStatement) {
					if (token.line !== previousToken.line) raise(undefined, errors.ambiguousSyntax, token.value);
				}
				nextLex();

				// List of expressions
				const expressions: Expression[] = [];
				let expression: Expression | undefined = parseExpression(flowContext);
				if (undefined !== expression) expressions.push(expression);
				while (consume(",")) {
					expression = parseExpectedExpression(flowContext);
					expressions.push(expression);
				}

				expect(")");
				return finishNode(ast.callExpression(base, expressions));

			case "{":
				markLocation();
				nextLex();
				const tbl: TableConstructorExpression = parseTableConstructor(flowContext);
				return finishNode(ast.tableCallExpression(base, tbl));
		}
	} else if (TokenType.StringLiteral === token.type) {
		return finishNode(ast.stringCallExpression(base, parsePrimaryExpression(flowContext) as StringLiteral));
	}

	raiseUnexpectedToken("function arguments", token);
}

//     primary ::= String | Numeric | nil | true | false
//          | functiondef | tableconstructor | '...'

function parsePrimaryExpression(flowContext: FlowContext): PrimaryExpression | undefined {
	const literals =
			TokenType.StringLiteral |
			TokenType.NumericLiteral |
			TokenType.BooleanLiteral |
			TokenType.NilLiteral |
			TokenType.VarargLiteral,
		value = token.value,
		typeer = token.type;
	let marker: Marker | undefined = undefined;

	if (trackLocations) marker = createLocationMarker();

	if (typeer === TokenType.VarargLiteral && !flowContext.allowVararg) {
		raise(token, errors.cannotUseVararg, token.value);
	}

	if (typeer & literals) {
		pushLocation(marker);
		const raw = String.slice(input, token.range[0], token.range[1]);
		nextLex();
		return finishNode(ast.literal(typeer, value, raw));
	} else if (TokenType.Keyword === typeer && "function" === value) {
		pushLocation(marker);
		nextLex();
		if (options.scope) createScope();
		return parseFunctionDeclaration(undefined) as FunctionExpression;
	} else if (consume("{")) {
		pushLocation(marker);
		return parseTableConstructor(flowContext);
	}
	return undefined;
}

// Parser
// ------

const versionFeatures: { [luaVersion: string]: LuaFeatures } = {
	"5.1": {},
	"5.2": {
		labels: true,
		emptyStatement: true,
		hexEscapes: true,
		skipWhitespaceEscape: true,
		strictEscapes: true,
		relaxedBreak: true,
	},
	"5.3": {
		labels: true,
		emptyStatement: true,
		hexEscapes: true,
		skipWhitespaceEscape: true,
		strictEscapes: true,
		unicodeEscapes: true,
		bitwiseOperators: true,
		integerDivision: true,
		relaxedBreak: true,
	},
	LuaJIT: {
		// XXX: LuaJIT language features may depend on compilation options; may need to
		// rethink how to handle this. Specifically, there is a LUAJIT_ENABLE_LUA52COMPAT
		// that removes contextual goto. Maybe add 'LuaJIT-5.2compat' as well?
		labels: true,
		contextualGoto: true,
		hexEscapes: true,
		skipWhitespaceEscape: true,
		strictEscapes: true,
		unicodeEscapes: true,
	},
};

/** workaround */
declare const exports: any;

/**
 * Export the main parser.
 *
 *   - `wait` Hold parsing until end() is called. Defaults to false
 *   - `comments` Store comments. Defaults to true.
 *   - `scope` Track identifier scope. Defaults to false.
 *   - `locations` Store location information. Defaults to false.
 *   - `ranges` Store the start and end character (locations as Marker[]). Defaults to
 *     false.
 *   - `onCreateNode` Callback which will be invoked when a syntax node is
 *     created.
 *   - `onCreateScope` Callback which will be invoked when a new scope is
 *     created.
 *   - `onDestroyScope` Callback which will be invoked when the current scope
 *     is destroyed.
 *
 * Example:
 *
 *     const parser = require('luaparser');
 *     parser.parse('i = 0');
 */
export function parse(_input?: string | Partial<ParserOptions>, _options?: Partial<ParserOptions>): Chunk {
	if (typeIs(_options, "nil") && typeIs(_input, "table")) {
		_options = _input;
		_input = undefined;
	}
	if (!_options) _options = {};

	input = typeIs(_input, "string") ? _input : "";
	options = Object.assign({}, defaultOptions, _options);

	// Rewind the lexer
	index = 0;
	line = 1;
	lineStart = 0;
	length = input.size();
	// When tracking identifier scope, initialize with an empty scope.
	scopes = [[]];
	scopeDepth = 0;
	globals = [];
	locations = [];

	if (!versionFeatures[options.luaVersion]) {
		throw new Error(String.sprintf("Lua version '%1' not supported", options.luaVersion));
	}

	features = Object.assign({}, versionFeatures[options.luaVersion]);
	if (options.extendedIdentifiers !== undefined) features.extendedIdentifiers = !!options.extendedIdentifiers;

	if (!encodingModes[options.encodingMode]) {
		throw new Error(String.sprintf("Encoding mode '%1' not supported", options.encodingMode));
	}

	encodingMode = encodingModes[options.encodingMode];

	if (options.comments) comments = [];
	if (!options.wait) return endshit();
	return exports;
}

export function write(_input: string | any) {
	input += String(_input);
	length = input.size();
	return exports;
}

export function endshit(_input?: string) {
	if ("nil" !== typeOf(_input)) write(_input);

	// Ignore shebangs.
	if (input && String.substr(input, 0, 2) === "#!") input = input.gsub("^.*", "%0")[0].gsub(".", " ")[0];

	length = input.size();
	trackLocations = options.locations || options.ranges;
	// Initialize with a lookahead token.
	lookahead = lex();

	const chunk = parseChunk();
	if (options.comments) chunk.comments = comments;
	if (options.scope) chunk.globals = globals;

	/* istanbul ignore if */
	if ((locations as Marker[]).size() > 0)
		throw new Error("Location tracking failed. This is most likely a bug in luaparse");

	return chunk;
}

/* vim: set sw=2 ts=2 et tw=79 : */
