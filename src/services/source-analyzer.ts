import {
	Project,
	Node,
	CallExpression,
	SourceFile,
	JsxOpeningElement,
	JsxSelfClosingElement,
	ts,
} from "ts-morph";
import { log } from "../utils/logger.js";
import path from "path";
import { CodeContext } from "../types/context.js";

/** Longest usage snippet kept for a key, in characters. */
const MAX_SNIPPET_LENGTH = 200;
/** Source spans wider than this cannot shrink to a snippet, so they are not printed. */
const MAX_SNIPPET_SOURCE_WIDTH = 10 * MAX_SNIPPET_LENGTH;
/** Tooling directives (`eslint-disable-next-line`, `@ts-expect-error`, ...) say nothing about the text. */
const DIRECTIVE_COMMENT =
	/^(eslint-|@ts-|prettier-ignore\b|istanbul ignore\b|c8 ignore\b|biome-ignore\b)/;
/** Prints code without comments, for the usage snippet. */
const printer = ts.createPrinter({ removeComments: true });

/** Comment text without its markers (`//`, `/*`, `*\/`, JSDoc `*`), on one line. */
const commentText = (comment: string): string =>
	comment
		.replace(/^\/\/+|^\/\*+|\*+\/$/g, "")
		.replace(/^\s*\*+/gm, "")
		.replace(/\s+/g, " ")
		.trim();

/** Functions and methods: code in them runs later, not where they are written. */
const isFunction = (node: Node): boolean =>
	Node.isFunctionLikeDeclaration(node) || Node.isFunctionExpression(node);

export class SourceCodeAnalyzer {
	private project: Project;
	private keyUsageMap: Map<string, CodeContext[]> = new Map();
	private rootDir: string;
	private initPromise: Promise<void> | null = null;

	constructor(rootDir: string = process.cwd()) {
		this.rootDir = rootDir;
		// Initialize with default settings, but don't add files yet for performance
		this.project = new Project({
			skipAddingFilesFromTsConfig: true,
			compilerOptions: {
				allowJs: true,
				jsx: 1, // Preserve
			},
		});
	}

	public initialize(
		globPatterns: string[] = [
			"src/**/*.{ts,tsx}",
			"app/**/*.{ts,tsx}",
			"components/**/*.{ts,tsx}",
		]
	): Promise<void> {
		if (this.initPromise) return this.initPromise;

		this.initPromise = (async () => {
			await new Promise((resolve) => setTimeout(resolve, 0)); // Force async execution for race condition safety
			try {
				// Add source files
				log(`Analyzing source code in ${this.rootDir}...`);

				// Exclude node_modules explicitly just in case
				this.project.addSourceFilesAtPaths(globPatterns);

				const sourceFiles = this.project.getSourceFiles();
				log(`Found ${sourceFiles.length} source files for context analysis.`);

				for (const sourceFile of sourceFiles) {
					this.processFile(sourceFile);
				}

				log(
					`Source analysis complete. Context extracted for ${this.keyUsageMap.size} keys.`
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.warn(`Error during source analysis: ${message}`);
				// Don't throw to prevent blocking the whole app, just log
			}
		})();

		return this.initPromise;
	}

	public async ensureInitialized(): Promise<void> {
		if (this.initPromise) {
			await this.initPromise;
		}
	}

	private processFile(sourceFile: SourceFile) {
		sourceFile.forEachDescendant((node) => {
			if (Node.isCallExpression(node)) {
				this.processCallExpression(node, sourceFile.getFilePath());
			}
		});
	}

	private processCallExpression(node: CallExpression, filePath: string) {
		// Match t('key') or useTranslations().t('key') pattern
		// This is a heuristic match
		const expression = node.getExpression();
		// Check if expression is accessible
		if (!expression) return;

		const expressionText = expression.getText();

		// Simple check for 't' function calls
		if (expressionText.endsWith(".t") || expressionText === "t") {
			const args = node.getArguments();
			if (args.length > 0 && Node.isStringLiteral(args[0])) {
				const key = args[0].getLiteralText();
				this.extractContext(key, node, filePath);
			}
		}
	}

	private extractContext(key: string, node: Node, fullFilePath: string) {
		const component = this.findComponent(node);
		const comments = this.getComments(node, component?.declaration);

		// Props of the JSX element the text belongs to
		const props: Record<string, string> = {};
		this.findJsxElement(node)
			?.getAttributes()
			.forEach((attr) => {
				if (Node.isJsxAttribute(attr)) {
					// Safe name extraction
					const nameNode = attr.getNameNode();
					const name = nameNode ? nameNode.getText() : "unknown";

					const initializer = attr.getInitializer();
					let value = initializer ? initializer.getText() : "true";
					// Strip quotes if string literal
					if (
						(value.startsWith('"') && value.endsWith('"')) ||
						(value.startsWith("'") && value.endsWith("'"))
					) {
						value = value.substring(1, value.length - 1);
					}
					props[name] = value;
				}
			});

		const context: CodeContext = {
			filePath: path.relative(this.rootDir, fullFilePath),
			line: node.getStartLineNumber(),
			component: component?.name,
			usageSnippet: this.getSnippet(node),
			comments: comments.length > 0 ? comments : undefined,
			props: Object.keys(props).length > 0 ? props : undefined,
		};

		if (!this.keyUsageMap.has(key)) {
			this.keyUsageMap.set(key, []);
		}
		this.keyUsageMap.get(key)?.push(context);
	}

	/**
	 * The component the call is in: the nearest enclosing function, class or function-valued
	 * variable whose name starts with an uppercase letter, otherwise the nearest one of any name.
	 * A variable counts only when the call is inside a function in its initializer
	 * (`const Dialog = () => ...`), so `const label = t("key")` does not name a component.
	 */
	private findComponent(node: Node): { name: string; declaration: Node } | undefined {
		let nearest: { name: string; declaration: Node } | undefined;
		let insideFunction = false;

		for (const ancestor of node.getAncestors()) {
			let found: { name: string; declaration: Node } | undefined;
			if (
				Node.isFunctionDeclaration(ancestor) ||
				Node.isFunctionExpression(ancestor) ||
				Node.isClassDeclaration(ancestor)
			) {
				const name = ancestor.getName();
				if (name) found = { name, declaration: ancestor };
			} else if (
				insideFunction &&
				Node.isVariableDeclaration(ancestor) &&
				Node.isIdentifier(ancestor.getNameNode())
			) {
				found = {
					name: ancestor.getName(),
					declaration: ancestor.getVariableStatement() ?? ancestor,
				};
			}
			insideFunction ||= isFunction(ancestor);

			if (found && /^[A-Z]/.test(found.name)) return found;
			nearest ??= found;
		}
		return nearest;
	}

	/**
	 * The JSX element the text belongs to: the one whose attribute holds the call
	 * (`<Button title={t("key")} />`) or whose child it is (`<Button>{t("key")}</Button>`).
	 * A call inside a nested function (`onClick={() => alert(t("key"))}`) belongs to none.
	 */
	private findJsxElement(node: Node): JsxOpeningElement | JsxSelfClosingElement | undefined {
		for (const ancestor of node.getAncestors()) {
			if (Node.isJsxOpeningElement(ancestor) || Node.isJsxSelfClosingElement(ancestor)) {
				return ancestor;
			}
			if (Node.isJsxElement(ancestor)) return ancestor.getOpeningElement();
			if (
				Node.isJsxFragment(ancestor) ||
				Node.isStatement(ancestor) ||
				isFunction(ancestor)
			) {
				return undefined;
			}
		}
		return undefined;
	}

	/**
	 * Comments about the call, nearest first: comments right above the call's expression, JSX
	 * attribute, JSX element or statement, `{/* ... *\/}` comments right before its JSX element,
	 * and the comment above its component. Tooling directives are left out.
	 */
	private getComments(node: Node, component: Node | undefined): string[] {
		// Raw comments by start position; nested nodes share their leading comments
		const found = new Map<number, string>();

		for (
			let current: Node | undefined = node;
			current && !Node.isSourceFile(current);
			current = current.getParent()
		) {
			for (const range of current.getLeadingCommentRanges()) {
				found.set(range.getPos(), range.getText());
			}
			const parent = current.getParent();
			if (Node.isJsxElement(parent) || Node.isJsxFragment(parent)) {
				// `{/* ... */}` children right before this one. Compiler nodes, so a long list
				// of children is not wrapped again for every call in it.
				const sourceFile = current.getSourceFile().compilerNode;
				const siblings = parent.compilerNode.children;
				const self = current.compilerNode;
				for (let i = siblings.findIndex((child) => child === self) - 1; i >= 0; i--) {
					const sibling = siblings[i];
					if (ts.isJsxText(sibling) && sibling.containsOnlyTriviaWhiteSpaces) continue;
					if (!ts.isJsxExpression(sibling) || sibling.expression) break;
					const text = sibling.getText(sourceFile);
					for (const match of text.matchAll(/\/\*[\s\S]*?\*\/|\/\/.*/g)) {
						found.set(sibling.getStart(sourceFile) + match.index, match[0]);
					}
				}
			}
			if (Node.isStatement(current)) break;
		}
		for (const range of component?.getLeadingCommentRanges() ?? []) {
			found.set(range.getPos(), range.getText());
		}

		return [...found.values()]
			.map(commentText)
			.filter((text) => text && !DIRECTIVE_COMMENT.test(text));
	}

	/**
	 * The code around the call with comments removed: the largest of the call, its enclosing
	 * expressions and its statement that fits in MAX_SNIPPET_LENGTH characters.
	 */
	private getSnippet(node: Node): string {
		const print = (target: Node) =>
			printer
				.printNode(
					ts.EmitHint.Unspecified,
					target.compilerNode,
					target.getSourceFile().compilerNode
				)
				.replace(/\s+/g, " ")
				.trim();

		let snippet = print(node);
		for (const ancestor of node.getAncestors()) {
			if (Node.isSourceFile(ancestor) || ancestor.getWidth() > MAX_SNIPPET_SOURCE_WIDTH) {
				break;
			}
			const text = print(ancestor);
			if (text.length > MAX_SNIPPET_LENGTH) break;
			snippet = text;
			if (Node.isStatement(ancestor)) break;
		}
		return snippet.length > MAX_SNIPPET_LENGTH
			? `${snippet.substring(0, MAX_SNIPPET_LENGTH)}...`
			: snippet;
	}

	public getContext(key: string): CodeContext | undefined {
		// Return duplicate functionality: prefer the first usage found or merge?
		// For now return the first usage that has comments, or just the first usage.
		const usages = this.keyUsageMap.get(key);
		if (!usages || usages.length === 0) return undefined;

		// Prioritize usage with comments
		return usages.find((u) => u.comments && u.comments.length > 0) || usages[0];
	}
}
