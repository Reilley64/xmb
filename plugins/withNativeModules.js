const {
	AndroidConfig,
	withAndroidManifest,
	withDangerousMod,
	withMainApplication,
} = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const PKG = "com.anonymous.myexpoapp";
const PKG_PATH = PKG.replace(/\./g, "/");

// ─── Kotlin source files ──────────────────────────────────────────────────────

const FOLDER_PICKER_MODULE_KT = `package ${PKG}

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class FolderPickerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "FolderPicker"

    @ReactMethod
    fun checkManageStoragePermission(promise: Promise) {
        promise.resolve(
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
                Environment.isExternalStorageManager()
            else
                true
        )
    }

    @ReactMethod
    fun requestManageStoragePermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !Environment.isExternalStorageManager()) {
            val uri = Uri.parse("package:\${reactApplicationContext.packageName}")
            val intent = Intent(
                Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, uri
            ).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            try {
                reactApplicationContext.currentActivity?.startActivity(intent)
            } catch (_: Exception) {
                reactApplicationContext.currentActivity?.startActivity(
                    Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                )
            }
        }
    }

}
`;

const FOLDER_PICKER_PACKAGE_KT = `package ${PKG}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class FolderPickerPackage : ReactPackage {
    override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> =
        listOf(FolderPickerModule(ctx))

    override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
`;

const GAME_LAUNCHER_MODULE_KT = `package ${PKG}

import android.content.ClipData
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class GameLauncherModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "GameLauncher"

    private fun buildDocUri(treeUri: Uri, path: String): Uri? {
        if (!path.startsWith("/storage/")) return null
        val rest = path.removePrefix("/storage/")
        val slash = rest.indexOf('/')
        if (slash == -1) return null
        val vol = rest.substring(0, slash)
        val rel = rest.substring(slash + 1)
        val docId = if (vol == "emulated") {
            "primary:\${rel.substringAfter('/')}"
        } else {
            "$vol:$rel"
        }
        return try {
            DocumentsContract.buildDocumentUriUsingTree(treeUri, docId)
        } catch (_: Exception) {
            null
        }
    }

    @ReactMethod
    fun launchIntent(params: ReadableMap, promise: Promise) {
        try {
            val pkg = params.getString("pkg")
                ?: return promise.reject("MISSING_PKG", "pkg is required")
            val activity = params.getString("activity")
                ?: return promise.reject("MISSING_ACTIVITY", "activity is required")

            val treeUri = if (params.hasKey("safTreeUri") && !params.isNull("safTreeUri"))
                Uri.parse(params.getString("safTreeUri")!!) else null

            if (treeUri != null) {
                try {
                    reactApplicationContext.contentResolver.takePersistableUriPermission(
                        treeUri, Intent.FLAG_GRANT_READ_URI_PERMISSION
                    )
                } catch (_: Exception) {}
            }

            val intent = Intent().apply {
                component = ComponentName(pkg, activity)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

                if (params.hasKey("action") && !params.isNull("action"))
                    action = params.getString("action")

                if (params.hasKey("dataUri") && !params.isNull("dataUri"))
                    data = Uri.parse(params.getString("dataUri"))

                if (params.hasKey("clearTask") && params.getBoolean("clearTask"))
                    addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK)

                if (params.hasKey("clearTop") && params.getBoolean("clearTop"))
                    addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)

                if (params.hasKey("extras") && !params.isNull("extras")) {
                    val extras = params.getMap("extras")!!
                    val iter = extras.keySetIterator()
                    val grantUris = mutableListOf<Uri>()
                    while (iter.hasNextKey()) {
                        val key = iter.nextKey()
                        val value = extras.getString(key) ?: continue
                        if (treeUri != null && value.startsWith("/storage/")) {
                            val docUri = buildDocUri(treeUri, value)
                            if (docUri != null) {
                                grantUris.add(docUri)
                                putExtra(key, docUri.toString())
                            } else {
                                putExtra(key, value)
                            }
                        } else {
                            putExtra(key, value)
                        }
                    }
                    if (grantUris.isNotEmpty()) {
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        val cd = ClipData.newRawUri("", grantUris[0])
                        for (i in 1 until grantUris.size) cd.addItem(ClipData.Item(grantUris[i]))
                        clipData = cd
                    }
                }
            }

            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("LAUNCH_ERROR", e.message, e)
        }
    }
}
`;

const GAME_LAUNCHER_PACKAGE_KT = `package ${PKG}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class GameLauncherPackage : ReactPackage {
    override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> =
        listOf(GameLauncherModule(ctx))

    override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
`;

// ─── Plugin steps ─────────────────────────────────────────────────────────────

function withKotlinFiles(config) {
	return withDangerousMod(config, [
		"android",
		(config) => {
			const dir = path.join(
				config.modRequest.platformProjectRoot,
				"app/src/main/java",
				PKG_PATH,
			);
			fs.mkdirSync(dir, { recursive: true });
			const files = {
				"FolderPickerModule.kt": FOLDER_PICKER_MODULE_KT,
				"FolderPickerPackage.kt": FOLDER_PICKER_PACKAGE_KT,
				"GameLauncherModule.kt": GAME_LAUNCHER_MODULE_KT,
				"GameLauncherPackage.kt": GAME_LAUNCHER_PACKAGE_KT,
			};
			for (const [name, content] of Object.entries(files)) {
				fs.writeFileSync(path.join(dir, name), content);
			}
			return config;
		},
	]);
}

function withPackageRegistration(config) {
	return withMainApplication(config, (config) => {
		const { contents } = config.modResults;
		if (contents.includes("FolderPickerPackage()")) return config;
		config.modResults.contents = contents.replace(
			"PackageList(this).packages.apply {",
			`PackageList(this).packages.apply {\n              add(FolderPickerPackage())\n              add(GameLauncherPackage())`,
		);
		return config;
	});
}

function withPermissions(config) {
	return withAndroidManifest(config, (config) => {
		const existing = (
			config.modResults.manifest["uses-permission"] ?? []
		).map((p) => p.$?.["android:name"]);
		for (const perm of [
			"android.permission.MANAGE_EXTERNAL_STORAGE",
			"android.permission.SYSTEM_ALERT_WINDOW",
		]) {
			if (!existing.includes(perm)) {
				AndroidConfig.Permissions.addPermission(config.modResults, perm);
			}
		}
		return config;
	});
}

module.exports = function withNativeModules(config) {
	config = withKotlinFiles(config);
	config = withPackageRegistration(config);
	config = withPermissions(config);
	return config;
};
