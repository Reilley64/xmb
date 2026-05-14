import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	errorCodes,
	isErrorWithCode,
	pickDirectory,
} from "@react-native-documents/picker";
import { Effect } from "effect";
import { useState } from "react";
import { NativeModules } from "react-native";
import { GameItem } from "@/components/molecules/game-item";
import { SettingsItem } from "@/components/molecules/settings-item";
import { EmulatorPicker } from "@/components/organisms/emulator-picker";
import { MenuList } from "@/components/organisms/menu-list";
import { XmbLayout } from "@/components/templates/xmb-layout";
import type { Game, System } from "@/data/systems";
import { useControllerInput } from "@/hooks/useControllerInput";
import { useRomLibrary } from "@/hooks/useRomLibrary";
import { getFindRules } from "@/services/findRules";
import type { LaunchIntent } from "@/services/launcher";
import { launchRom, resolveCommands } from "@/services/launcher";
import { getSystemConfig } from "@/services/systemConfig";

// content://com.android.externalstorage.documents/tree/primary%3AROMs → /storage/emulated/0/ROMs
function contentUriToPath(uri: string): string {
	const treeIdx = uri.indexOf("/tree/");
	if (treeIdx === -1) return uri;
	const docId = decodeURIComponent(uri.slice(treeIdx + 6));
	if (docId.startsWith("primary:"))
		return `/storage/emulated/0/${docId.slice(8)}`;
	const colon = docId.indexOf(":");
	return colon !== -1
		? `/storage/${docId.slice(0, colon)}/${docId.slice(colon + 1)}`
		: docId;
}

export function Xmb() {
	const { systems, recentGames, setRomBasePath, refresh } = useRomLibrary();
	const recentShown = recentGames.length > 0;
	const recentOffset = recentShown ? 1 : 0;
	const [colIdx, setColIdx] = useState(1);
	const [pendingLaunch, setPendingLaunch] = useState<{
		game: Game;
		intents: LaunchIntent[];
	} | null>(null);

	function navCol(delta: -1 | 1) {
		setColIdx((prev) =>
			Math.max(0, Math.min(systems.length + recentOffset, prev + delta)),
		);
	}

	function handleRecentGameConfirm(game: Game) {
		const system = systems.find((s) => s.id === game.system_id);
		if (!system) return;
		handleGameConfirm(game, system);
	}

	async function handleGameConfirm(game: Game, system: System) {
		const launchable = await Effect.runPromise(
			resolveCommands(system.commands, game.file_path).pipe(
				Effect.orElseSucceed(() => [] as LaunchIntent[]),
			),
		);
		if (launchable.length === 0) return;
		if (launchable.length === 1) {
			Effect.runFork(
				launchRom(game, launchable[0]).pipe(
					Effect.catchAll((e) =>
						Effect.sync(() => console.error("[launchRom]", e)),
					),
				),
			);
		} else {
			setPendingLaunch({ game, intents: launchable });
		}
	}

	async function handleChooseRomsFolder() {
		const hasPermission: boolean =
			(await NativeModules.FolderPicker?.checkManageStoragePermission?.()) ??
			false;
		if (!hasPermission) {
			NativeModules.FolderPicker?.requestManageStoragePermission?.();
			return;
		}
		try {
			const result = await pickDirectory();
			if (result?.uri) {
				await AsyncStorage.setItem("romSafTreeUri", result.uri);
				const path = contentUriToPath(result.uri);
				await setRomBasePath(path);
			}
		} catch (e) {
			if (!isErrorWithCode(e) || e.code !== errorCodes.OPERATION_CANCELED)
				throw e;
		}
	}

	async function handleRefreshSystemConfig() {
		await Effect.runPromise(
			Effect.all([getSystemConfig(true), getFindRules(true)], {
				concurrency: "unbounded",
			}).pipe(Effect.catchAll(() => Effect.void)),
		);
		await refresh();
	}

	useControllerInput({
		onLeft: pendingLaunch ? undefined : () => navCol(-1),
		onRight: pendingLaunch ? undefined : () => navCol(1),
		onBack: pendingLaunch ? () => setPendingLaunch(null) : undefined,
	});

	return (
		<XmbLayout
			colIdx={colIdx}
			overlay={
				pendingLaunch ? (
					<EmulatorPicker
						intents={pendingLaunch.intents}
						onSelect={(intent) => {
							setPendingLaunch(null);
							Effect.runFork(
								launchRom(pendingLaunch.game, intent).pipe(
									Effect.catchAll((e) =>
										Effect.sync(() => console.error("[launchRom]", e)),
									),
								),
							);
						}}
						onCancel={() => setPendingLaunch(null)}
					/>
				) : undefined
			}
		>
			<MenuList
				icon={require("../../../assets/settings.webp")}
				isSelected={colIdx === 0}
				isNavigable={!pendingLaunch}
				title="Settings"
			>
				<SettingsItem
					title="Choose ROMs folder"
					onConfirm={handleChooseRomsFolder}
				/>
				<SettingsItem
					title="Refresh system config"
					onConfirm={handleRefreshSystemConfig}
				/>
			</MenuList>

			{recentShown && (
				<MenuList
					key="recent"
					icon={require("../../../assets/recent.webp")}
					isSelected={colIdx === 1}
					isNavigable={!pendingLaunch}
					title="Recent"
				>
					{recentGames.map((game) => (
						<GameItem
							key={game.id}
							title={game.title}
							onConfirm={() => handleRecentGameConfirm(game)}
						/>
					))}
				</MenuList>
			)}

			{systems.map((system, index) => (
				<MenuList
					key={system.id}
					icon={require("../../../assets/consoles/default.webp")}
					isSelected={colIdx === index + 1 + recentOffset}
					isNavigable={!pendingLaunch}
					title={system.shortName}
				>
					{system.games.map((game) => (
						<GameItem
							key={game.id}
							title={game.title}
							onConfirm={() => handleGameConfirm(game, system)}
						/>
					))}
				</MenuList>
			))}
		</XmbLayout>
	);
}
