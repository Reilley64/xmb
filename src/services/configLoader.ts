import { Effect, Either } from "effect";

import { ParseError } from "./errors";
import { fetchText } from "./http";

export function fetchBothAndMerge<T>(
	officialUrl: string,
	customUrl: string,
	parse: (text: string) => T,
	merge: (official: T, custom: T) => T,
	empty: T,
): Effect.Effect<T, never> {
	const parseEffect = (text: string): Effect.Effect<T, ParseError> =>
		Effect.try({
			try: () => parse(text),
			catch: (e) => new ParseError({ source: "xml", cause: e }),
		});

	const fetchAndParse = (url: string) =>
		fetchText(url).pipe(Effect.flatMap(parseEffect));

	return Effect.gen(function* () {
		const [officialResult, customResult] = yield* Effect.all(
			[fetchAndParse(officialUrl), fetchAndParse(customUrl)],
			{ mode: "either" },
		);
		const official = Either.isRight(officialResult) ? officialResult.right : empty;
		const custom = Either.isRight(customResult) ? customResult.right : empty;
		return merge(official, custom);
	});
}
