declare module "gettext-parser" {
	import type { Transform, TransformOptions } from "node:stream";

	export interface PoTranslation {
		msgid: string;
		msgid_plural?: string;
		msgstr: string[];
		msgctxt?: string;
		comments?: {
			translator?: string;
			reference?: string;
			extracted?: string;
			flag?: string;
			previous?: string;
		};
	}

	export interface PoData {
		headers: Record<string, string>;
		translations: Record<string, Record<string, PoTranslation>>;
		charset?: string;
	}

	export interface PoParseOptions {
		/** Charset used when a Buffer input does not declare one (default "iso-8859-1"). */
		defaultCharset?: string;
		/** Throw on duplicate msgids and plural-form mismatches (default false). */
		validation?: boolean;
	}

	export interface PoCompileOptions {
		/** Line length at which strings are folded; 0 or false disables folding (default 76). */
		foldLength?: number | false;
		/** Sort entries by msgid, or with the given comparator (default false). */
		sort?: boolean | ((a: PoTranslation, b: PoTranslation) => number);
		/** Escape newlines and quotes (default true). */
		escapeCharacters?: boolean;
		/** Line ending of the output (default "\n"). */
		eol?: string;
	}

	export const po: {
		parse(input: string | Buffer, options?: PoParseOptions): PoData;
		compile(data: PoData, options?: PoCompileOptions): Buffer;
		/** Transform stream that emits the parsed PoData once the input ends. */
		createParseStream(options?: PoParseOptions, transformOptions?: TransformOptions): Transform;
	};
}
