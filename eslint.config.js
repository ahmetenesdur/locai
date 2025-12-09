import globals from "globals";
import pluginJs from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";

/** @type {import('eslint').Linter.Config[]} */
export default [
	{
		ignores: [
			"**/node_modules/**",
			"**/dist/**",
			"**/coverage/**",
			".localize-cache/**",
			"docs/**",
			"test-glossary/**",
		],
	},
	{
		languageOptions: {
			globals: {
				...globals.node,
				...globals.es2021,
			},
			sourceType: "module",
		},
	},
	pluginJs.configs.recommended,
	eslintConfigPrettier,
	{
		rules: {
			"no-unused-vars": [
				"warn",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
				},
			],
			"no-console": "off",
			"prefer-const": "warn",
			"no-undef": "error",
		},
	},
];
