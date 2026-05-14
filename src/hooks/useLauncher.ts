import { Effect } from "effect";
import { useCallback, useState } from "react";

import type { Game, System } from "@/data/systems";
import type { LaunchIntent } from "@/services/launcher";
import { launchRom, resolveCommands } from "@/services/launcher";

export function useLauncher(systems: System[]) {
	const [pendingLaunch, setPendingLaunch] = useState<{
		game: Game;
		intents: LaunchIntent[];
	} | null>(null);
	const [launchError, setLaunchError] = useState<string | null>(null);

	const handleLaunchError = useCallback(
		(e: unknown) =>
			Effect.sync(() => {
				console.error("[launchRom]", e);
				setLaunchError("Failed to launch emulator");
			}),
		[],
	);

	const launch = useCallback(
		async (game: Game, system: System) => {
			setLaunchError(null);
			const launchable = await Effect.runPromise(
				resolveCommands(system.commands, game.file_path).pipe(
					Effect.orElseSucceed(() => [] as LaunchIntent[]),
				),
			);
			if (launchable.length === 0) {
				setLaunchError(`No emulator found for ${system.name}`);
				return;
			}
			if (launchable.length === 1) {
				Effect.runFork(
					launchRom(game, launchable[0]).pipe(Effect.catchAll(handleLaunchError)),
				);
			} else {
				setPendingLaunch({ game, intents: launchable });
			}
		},
		[handleLaunchError],
	);

	const launchFromRecent = useCallback(
		(game: Game) => {
			const system = systems.find((s) => s.id === game.system_id);
			if (system) launch(game, system);
			else setLaunchError(`No system found for "${game.title}"`);
		},
		[launch, systems],
	);

	const confirmPendingLaunch = useCallback(
		(intent: LaunchIntent) => {
			if (!pendingLaunch) return;
			const { game } = pendingLaunch;
			setPendingLaunch(null);
			Effect.runFork(
				launchRom(game, intent).pipe(Effect.catchAll(handleLaunchError)),
			);
		},
		[handleLaunchError, pendingLaunch],
	);

	const cancelPendingLaunch = useCallback(() => setPendingLaunch(null), []);
	const clearError = useCallback(() => setLaunchError(null), []);

	return {
		pendingLaunch,
		launchError,
		launch,
		launchFromRecent,
		confirmPendingLaunch,
		cancelPendingLaunch,
		clearError,
	};
}
