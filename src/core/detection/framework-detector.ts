import { promises as fs } from "fs";
import path from "path";

export interface DetectedConfig {
	framework: "next" | "vue" | "react" | "flutter" | "unknown";
	localesDir?: string;
	fileFormat?: "json" | "yaml" | "po" | "arb" | "properties";
	source?: string;
}

export class FrameworkDetector {
	static async detect(projectRoot: string): Promise<DetectedConfig | null> {
		try {
			// Check for package.json (Web projects)
			const packageJsonPath = path.join(projectRoot, "package.json");
			try {
				const content = await fs.readFile(packageJsonPath, "utf8");
				const pkg = JSON.parse(content);

				const deps = { ...pkg.dependencies, ...pkg.devDependencies };

				if (deps.next) {
					// Next.js
					// Check for next-intl or next-i18next
					if (deps["next-intl"]) {
						return { framework: "next", localesDir: "messages", fileFormat: "json" };
					}
					if (deps["next-i18next"]) {
						return {
							framework: "next",
							localesDir: "public/locales",
							fileFormat: "json",
						};
					}
					return { framework: "next", localesDir: "public/locales", fileFormat: "json" }; // Default Next.js
				}

				if (deps.vue || deps.nuxt) {
					// Vue/Nuxt
					if (deps["@nuxtjs/i18n"])
						return { framework: "vue", localesDir: "locales", fileFormat: "json" };
					return { framework: "vue", localesDir: "src/locales", fileFormat: "json" };
				}

				if (deps["react-i18next"] || deps.react) {
					return { framework: "react", localesDir: "public/locales", fileFormat: "json" };
				}
			} catch (e) {
				// No package.json or invalid
			}

			// Check for pubspec.yaml (Flutter)
			const pubspecPath = path.join(projectRoot, "pubspec.yaml");
			try {
				await fs.access(pubspecPath);
				return { framework: "flutter", localesDir: "lib/l10n", fileFormat: "arb" };
			} catch {
				// No pubspec.yaml
			}

			return { framework: "unknown" };
		} catch (error) {
			console.warn("Framework detection failed:", error);
			return null;
		}
	}
}
