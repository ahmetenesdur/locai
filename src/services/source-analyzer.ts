import { Project, Node, CallExpression } from "ts-morph";
import { log } from "../utils/logger.js";
import path from "path";
import { CodeContext } from "../types/context.js";

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
			} catch (error: any) {
				console.warn(`Error during source analysis: ${error.message}`);
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

	private processFile(sourceFile: any) {
		sourceFile.forEachDescendant((node: any) => {
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
		const relativePath = path.relative(this.rootDir, fullFilePath);
		const line = node.getStartLineNumber();

		// Extract component name
		let componentName = undefined;
		// Use getAncestors() to find the parent safely
		const componentNode = node
			.getAncestors()
			.find(
				(n) =>
					Node.isFunctionDeclaration(n) ||
					Node.isClassDeclaration(n) ||
					Node.isVariableDeclaration(n)
			);

		if (componentNode) {
			if (
				Node.isFunctionDeclaration(componentNode) ||
				Node.isClassDeclaration(componentNode)
			) {
				componentName = componentNode.getName();
			} else if (Node.isVariableDeclaration(componentNode)) {
				componentName = componentNode.getName();
			}
		}

		// Extract comments
		// Look for leading comments on the statement
		const statement = node
			.getAncestors()
			.find(
				(n) =>
					Node.isExpressionStatement(n) ||
					Node.isVariableStatement(n) ||
					Node.isJsxElement(n) ||
					Node.isJsxExpression(n)
			);
		const comments: string[] = [];

		const targetNode = statement || node;
		const ranges = targetNode.getLeadingCommentRanges();
		for (const range of ranges) {
			comments.push(
				range
					.getText()
					.replace(/^\/\/\s*/, "")
					.replace(/^\/\*\s*/, "")
					.replace(/\s*\*\/$/, "")
			);
		}

		// Get props (simple heuristic for JSX)
		const props: Record<string, string> = {};
		const jsxElement = node
			.getAncestors()
			.find((n) => Node.isJsxOpeningElement(n) || Node.isJsxSelfClosingElement(n));

		if (
			jsxElement &&
			(Node.isJsxOpeningElement(jsxElement) || Node.isJsxSelfClosingElement(jsxElement))
		) {
			jsxElement.getAttributes().forEach((attr) => {
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
		}

		// Code Snippet (surrounding lines)
		// Check for node.getParent() to avoid error if node is root (unlikely for call expression)
		const parent = node.getParent();
		const snippet = parent ? parent.getText() : node.getText();

		const context: CodeContext = {
			filePath: relativePath,
			line,
			component: componentName,
			usageSnippet: snippet.length > 200 ? snippet.substring(0, 200) + "..." : snippet,
			comments: comments.length > 0 ? comments : undefined,
			props: Object.keys(props).length > 0 ? props : undefined,
		};

		if (!this.keyUsageMap.has(key)) {
			this.keyUsageMap.set(key, []);
		}
		this.keyUsageMap.get(key)?.push(context);
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
