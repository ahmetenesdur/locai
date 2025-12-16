declare module "gettext-parser" {
	export interface PoTranslation {
		msgid: string;
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

	export const po: {
		parse(input: string | Buffer, options?: any): PoData;
		compile(data: PoData, options?: any): Buffer;
		createParseStream(options?: any): any;
	};
}
