import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
	{
		ignores: [
			"**/node_modules/**",
			"**/dist/**",
			"**/coverage/**",
			".localize-cache/**",
			"docs/**",
			"test-glossary/**",
			// Sample source files that the source analyzer tests parse; not project code.
			"tests/fixtures/**",
		],
	},
	{
		linterOptions: {
			reportUnusedDisableDirectives: "error",
		},
		languageOptions: {
			globals: {
				...globals.node,
				...globals.es2021,
			},
			sourceType: "module",
		},
	},
	pluginJs.configs.recommended,
	tseslint.configs.recommended,
	{
		rules: {
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
				},
			],
			"no-console": "off",
			"prefer-const": "error",
		},
	},
	eslintConfigPrettier
);
