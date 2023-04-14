import type {
	Chunk,
	ElseClause,
	ElseifClause,
	Expression,
	Identifier,
	IfClause,
	IndexExpression,
	MemberExpression,
	Statement,
	TableConstructorExpression,
	TableKey,
	TableKeyString,
	TableValue,
	VarargLiteral,
} from "../luaparse/ast";

export function clauseManager(clause: (IfClause | ElseifClause | ElseClause)[], options: Options) {
	let code = "";
	clause.forEach((node) => {
		let shouldClose = clause.indexOf(node) === clause.size() - 1;
		code = code + ClauseHandler(node, options, shouldClose);
	});

	return code;
}

export function ClauseHandler(
	clause: IfClause | ElseifClause | ElseClause,
	options: Options,
	shouldClose: boolean,
): string {
	let code = ``;
	switch (clause.type) {
		case "IfClause":
			code =
				code +
				CodeBlockHandler(clause.body, options, "if", `${shouldClose ? "end" : ""}`, "then", clause.condition);
			break;
		case "ElseifClause":
			code =
				code +
				CodeBlockHandler(
					clause.body,
					options,
					"elseif",
					`${shouldClose ? "end" : ""}`,
					"then",
					clause.condition,
				);
			break;
		case "ElseClause":
			code = code + CodeBlockHandler(clause.body, options, "else", `${shouldClose ? "end" : ""}`);
			break;
	}

	return code;
}

export function CodeBlockHandler(
	block: Statement[],
	options: Options,
	prefix: string,
	endWord: string | undefined,
	startWord?: string,
	expression?: Expression,
): string {
	let code = ``;
	let newOptions = { ...options };
	newOptions.nestedIn++;
	code =
		code +
		`${expression ? prefix + " " + ExpressionHandler(expression, options) : prefix}${
			startWord ? " " + startWord : ""
		}${options.newLine}`;
	block.forEach((statement) => {
		code = code + StatementHandler(statement, newOptions);
	});
	code = code + `${" ".rep(options.spaces * options.nestedIn)}${endWord ? endWord + options.codeSeparator : ""}`;
	return code;
}

export function funcNameResolver(identifier: Identifier | MemberExpression | undefined, options: Options): string {
	let code = "";
	if (identifier) {
		code = IdentifierHandler(identifier, options);
	}

	return code;
}

export function ExpressionJoiner(expressions: Expression[], options: Options): string {
	return expressions
		.map((expression) => {
			return ExpressionHandler(expression, options);
		})
		.join(", ");
}

export function ExpressionHandler(expression: Expression, options: Options, useParentheses = false): string {
	let code = "";
	switch (expression.type) {
		case "Identifier":
			code = IdentifierHandler(expression, options);
			break;
		case "StringLiteral":
			code = `${useParentheses ? "(" : ""}${expression.raw}${useParentheses ? ")" : ""}`;
			break;
		case "NumericLiteral":
			code = `${useParentheses ? "(" : ""}${expression.value}${useParentheses ? ")" : ""}`;
			break;
		case "BooleanLiteral":
			code = `${useParentheses ? "(" : ""}${expression.value}${useParentheses ? ")" : ""}`;
			break;
		case "NilLiteral":
			code = "nil";
			break;
		case "VarargLiteral":
			code = expression.raw!;
			break;
		case "BinaryExpression":
			code = `(${ExpressionHandler(expression.left, options)} ${expression.operator} ${ExpressionHandler(
				expression.right,
				options,
			)})`;
			break;
		case "LogicalExpression":
			code = `${ExpressionHandler(expression.left, options)} ${expression.operator} ${ExpressionHandler(
				expression.right,
				options,
			)}`;
			break;
		case "UnaryExpression":
			code = `${expression.operator} ${ExpressionHandler(expression.argument, options)}`;
			break;
		case "MemberExpression":
			code = `${ExpressionHandler(expression.base, options, true)}${expression.indexer}${
				expression.identifier.name
			}`;
			break;
		case "IndexExpression":
			code = `${expression.base.type === "Identifier" ? "" : "("}${ExpressionHandler(expression.base, options)}${
				expression.base.type === "Identifier" ? "" : ")"
			}[${ExpressionHandler(expression.index, options)}]`;
			break;
		case "CallExpression":
			code = `${ExpressionHandler(expression.base, options)}(${ExpressionJoiner(expression.arguments, options)})`;
			break;
		case "TableCallExpression":
			code = `${useParentheses ? "(" : ""}${ExpressionHandler(expression.base, options)}${
				useParentheses ? ")" : ""
			}(${ExpressionHandler(expression.arguments, options)})`;
			break;
		case "StringCallExpression":
			code = `${ExpressionHandler(expression.base, options)}(${ExpressionHandler(expression.argument, options)})`;
			break;
		case "TableConstructorExpression":
			code = `${useParentheses ? "(" : "("}{${TableConstructionHandler(expression.fields, options)}${
				expression.fields.size() === 0 ? "" : " ".rep(options.spaces * options.nestedIn)
			}}${useParentheses ? ")" : ")"}`;
			break;
		case "FunctionDeclaration":
			// eslint-disable-next-line no-case-declarations
			const newOptions = { ...options };
			newOptions.nestedIn++;
			code = `(function(${IdentifierJoiner(expression.parameters, newOptions)})${options.newLine}${expression.body
				.map((statement) => {
					return StatementHandler(statement, newOptions);
				})
				.join("")}${" ".rep(options.spaces * options.nestedIn)}end)`;
	}

	return code;
}

export function IdentifierHandler(
	identifier: Identifier | VarargLiteral | MemberExpression | IndexExpression,
	options: Options,
): string {
	let code = "";
	switch (identifier.type) {
		case "Identifier":
			code = identifier.name;
			break;
		case "VarargLiteral":
			code = identifier.raw!;
			break;
		case "MemberExpression":
			code = `${ExpressionHandler(identifier.base, options)}${identifier.indexer}${identifier.identifier.name}`;
			break;
		case "IndexExpression":
			code = `${ExpressionHandler(identifier.base, options)}[${ExpressionHandler(identifier.index, options)}]`;
			break;
	}

	return code;
}

export function IdentifierJoiner(
	identifiers: (Identifier | VarargLiteral | MemberExpression | IndexExpression)[],
	options: Options,
): string {
	return identifiers
		.map((identifier) => {
			return IdentifierHandler(identifier, options);
		})
		.join(", ");
}

export function StatementHandler(statement: Statement, options: Options): string {
	let code = `${" ".rep(options.spaces * options.nestedIn)}`;
	switch (statement.type) {
		case "LocalStatement":
			code =
				code +
				`local ${IdentifierJoiner(statement.variables, options)}${
					statement.init.size() > 0
						? " = " + ExpressionJoiner(statement.init, options) + options.codeSeparator
						: options.codeSeparator
				}`;
			break;
		case "FunctionDeclaration":
			// eslint-disable-next-line no-case-declarations
			const newOptions = { ...options };
			newOptions.nestedIn++;
			code = `${" ".rep(options.spaces * options.nestedIn)}function ${funcNameResolver(
				statement.identifier,
				newOptions,
			)}(${IdentifierJoiner(statement.parameters, options)})${options.newLine}${statement.body
				.map((statement) => {
					return StatementHandler(statement, newOptions);
				})
				.join("")}${" ".rep(options.spaces * options.nestedIn)}end${options.codeSeparator}`;
			break;
		case "CallStatement":
			code = code + `${ExpressionHandler(statement.expression, options)}${options.codeSeparator}`;
			break;
		case "AssignmentStatement":
			code =
				code +
				`${IdentifierJoiner(statement.variables, options)} = ${ExpressionJoiner(statement.init, options)}${
					options.codeSeparator
				}`;
			break;
		case "IfStatement":
			code = code + clauseManager(statement.clauses, options);
			break;
		case "ReturnStatement":
			code = code + `return ${ExpressionJoiner(statement.arguments, options)}${options.codeSeparator}`;
			break;
		case "WhileStatement":
			code = code + CodeBlockHandler(statement.body, options, "while", "end", "do", statement.condition);
			break;
		case "BreakStatement":
			code = code + `break${options.codeSeparator}`;
			break;
		case "DoStatement":
			code = code + CodeBlockHandler(statement.body, options, "do", "end");
			break;
		case "RepeatStatement":
			code =
				code +
				CodeBlockHandler(
					statement.body,
					options,
					"rep",
					`until ${ExpressionHandler(statement.condition, options)}`,
				);
			break;
		case "ForNumericStatement":
			code =
				code +
				CodeBlockHandler(
					statement.body,
					options,
					`for ${IdentifierHandler(statement.variable, options)} = ${ExpressionHandler(
						statement.start,
						options,
					)}, ${ExpressionHandler(statement.end, options)}${
						statement.step ? `, ${ExpressionHandler(statement.step, options)}` : ""
					}`,
					"end",
					"do",
				);
			break;
		case "ForGenericStatement":
			code =
				code +
				CodeBlockHandler(
					statement.body,
					options,
					`for ${IdentifierJoiner(statement.variables, options)} in ${ExpressionJoiner(
						statement.iterators,
						options,
					)}`,
					"end",
					"do",
				);
			break;
		case "GotoStatement":
			code = code + `goto ${IdentifierHandler(statement.label, options)}${options.codeSeparator}`;
			break;
		case "LabelStatement":
			code = code + `::${IdentifierHandler(statement.label, options)}::${options.codeSeparator}`;
			break;
	}

	return code;
}

export function TableConstructionHandler(fields: (TableKey | TableKeyString | TableValue)[], options: Options): string {
	let code = fields.size() === 0 ? "" : options.newLine;
	let newOptions = { ...options };
	newOptions.nestedIn++;

	fields.forEach((field, index) => {
		let isLast = index === fields.size() - 1;
		let end1 = `${isLast ? options.newLine : `,${options.newLine}`}`;
		let spaces = " ".rep(options.spaces * newOptions.nestedIn);
		switch (field.type) {
			case "TableKey":
				code =
					code +
					`${spaces}[${ExpressionHandler(field.key, newOptions)}] = ${ExpressionHandler(
						field.value,
						newOptions,
					)}${end1}`;
				break;
			case "TableKeyString":
				code = code + `${spaces}${field.key.name} = ${ExpressionHandler(field.value, newOptions)}${end1}`;
				break;
			case "TableValue":
				code = code + `${spaces}${ExpressionHandler(field.value, newOptions)}${end1}`;
				break;
		}
	});

	return code;
}

import { Options } from "./types";

export function renderAst(
	ast: Chunk,
	options: Options = {
		codeSeparator: ";\n",
		spaces: 2,
		nestedIn: 0,
		newLine: "\n",
	},
): string {
	let code = "";
	ast.body.forEach((node) => {
		code = code + StatementHandler(node, options);
	});

	return code;
}

/*
"LabelStatement"      CHECK
"BreakStatement"      CHECK
"GotoStatement"       CHECK
"ReturnStatement"     CHECK
"IfStatement"         CHECK
"WhileStatement"      CHECK
"DoStatement"         CHECK
"RepeatStatement"     CHECK
"LocalStatement"      CHECK
"AssignmentStatement" CHECK
"CallStatement"       CHECK
"FunctionDeclaration" CHECK
"ForNumericStatement" CHECK
"ForGenericStatement" CHECK
*/
