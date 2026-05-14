const { withMainActivity } = require("@expo/config-plugins");

const DISPATCH_KEY_EVENT = `
  // Shared debounce across both dispatchKeyEvent and onGenericMotionEvent.
  // Many controllers fire BOTH a KeyEvent and a hat MotionEvent for one D-pad press;
  // this prevents that from registering as two inputs.
  private val lastEmittedMs = mutableMapOf<Int, Long>()

  override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean {
    if (event.action == android.view.KeyEvent.ACTION_DOWN) {
      val kc = event.keyCode
      val now = System.currentTimeMillis()
      if (now - (lastEmittedMs[kc] ?: 0L) >= 100L) {
        lastEmittedMs[kc] = now
        val params = com.facebook.react.bridge.Arguments.createMap().apply {
          putInt("keyCode", kc)
        }
        try {
          val app = application as? com.facebook.react.ReactApplication
          val ctx = app?.reactHost?.currentReactContext
            ?: app?.reactNativeHost?.reactInstanceManager?.currentReactContext
          ctx?.emitDeviceEvent("GamepadKeyDown", params)
        } catch (_: Exception) {}
      }
    }
    return super.dispatchKeyEvent(event)
  }

  private var hatX = 0f
  private var hatY = 0f
  private var stickX = 0f
  private var stickY = 0f

  override fun onGenericMotionEvent(event: android.view.MotionEvent): Boolean {
    val isJoystick = (event.source and android.view.InputDevice.SOURCE_JOYSTICK) ==
      android.view.InputDevice.SOURCE_JOYSTICK
    if (isJoystick && event.action == android.view.MotionEvent.ACTION_MOVE) {
      val newHatX   = event.getAxisValue(android.view.MotionEvent.AXIS_HAT_X)
      val newHatY   = event.getAxisValue(android.view.MotionEvent.AXIS_HAT_Y)
      val newStickX = event.getAxisValue(android.view.MotionEvent.AXIS_X)
      val newStickY = event.getAxisValue(android.view.MotionEvent.AXIS_Y)
      fun emit(keyCode: Int) {
        val now = System.currentTimeMillis()
        if (now - (lastEmittedMs[keyCode] ?: 0L) < 100L) return
        lastEmittedMs[keyCode] = now
        val p = com.facebook.react.bridge.Arguments.createMap().apply { putInt("keyCode", keyCode) }
        try {
          val app = application as? com.facebook.react.ReactApplication
          val ctx = app?.reactHost?.currentReactContext
            ?: app?.reactNativeHost?.reactInstanceManager?.currentReactContext
          ctx?.emitDeviceEvent("GamepadKeyDown", p)
        } catch (_: Exception) {}
      }
      if (newHatX   <= -0.5f && hatX   > -0.5f) emit(21)
      if (newHatX   >=  0.5f && hatX   <  0.5f) emit(22)
      if (newHatY   <= -0.5f && hatY   > -0.5f) emit(19)
      if (newHatY   >=  0.5f && hatY   <  0.5f) emit(20)
      if (newStickX <= -0.5f && stickX > -0.5f) emit(21)
      if (newStickX >=  0.5f && stickX <  0.5f) emit(22)
      if (newStickY <= -0.5f && stickY > -0.5f) emit(19)
      if (newStickY >=  0.5f && stickY <  0.5f) emit(20)
      hatX = newHatX; hatY = newHatY; stickX = newStickX; stickY = newStickY
    }
    return super.onGenericMotionEvent(event)
  }
`;

module.exports = function withGamepadKeyEvents(config) {
	return withMainActivity(config, (config) => {
		const { contents, language } = config.modResults;
		if (language !== "kotlin") {
			console.warn(
				"[withGamepadKeyEvents] MainActivity is not Kotlin — skipping patch",
			);
			return config;
		}
		if (contents.includes("override fun dispatchKeyEvent")) {
			return config; // already patched
		}
		const lastBrace = contents.lastIndexOf("\n}");
		if (lastBrace === -1) {
			console.warn(
				"[withGamepadKeyEvents] Could not find closing brace in MainActivity.kt",
			);
			return config;
		}
		config.modResults.contents = `${contents.substring(0, lastBrace) + DISPATCH_KEY_EVENT}\n}`;
		return config;
	});
};
