(function (window, document) {
    'use strict';

    if (window.__GGEMU_BRIDGE_INSTALLED__) {
        return;
    }

    window.__GGEMU_BRIDGE_INSTALLED__ = true;

    var DEFAULT_CONFIG = {
        sdkUrl: 'https://ggemu.com/api/ggemu-sdk.js',
        debug: false,
        parentOrigin: '*',
        game: 'temple-run-2',
        engine: 'babylonjs',
        captureFps: 60,
        useCaptureMirror: true,
        autoStartLive: true,
        autoStartLiveDelay: 800,
        autoStartLiveRetryDelay: 2000,
        autoStartLiveMaxAttempts: 3,
        logInputs: false
    };

    var KEY_CODE_BY_CODE = {
        ArrowLeft: 37,
        ArrowUp: 38,
        ArrowRight: 39,
        ArrowDown: 40,
        Space: 32,
        Enter: 13,
        Escape: 27,
        Tab: 9
    };

    var KEY_CODE_BY_KEY = {
        ' ': 32,
        ArrowLeft: 37,
        ArrowUp: 38,
        ArrowRight: 39,
        ArrowDown: 40,
        Enter: 13,
        Escape: 27,
        Tab: 9
    };

    var state = {
        canvas: null,
        captureCanvas: null,
        captureContext: null,
        masterGain: null,
        sdkInitialized: false,
        sdkScriptLoading: false,
        sdkEventsBound: false,
        canvasRegistered: false,
        captureStreamRegistered: false,
        audioRegistered: false,
        readySent: false,
        liveStarted: false,
        liveStartRequested: false,
        liveStartAttempts: 0,
        liveStartTimer: null,
        firstInteractionTriggered: false,
        canvasObserver: null,
        mirrorLoopStarted: false,
        mirrorDrawFailed: false,
        inputDebugInstalled: false
    };

    var config = buildConfig();
    var bridge = {
        config: config,
        state: state,
        sdk: getGGEMU,
        refresh: refresh,
        loadSdk: ensureSdkScript,
        dispatchInput: handleSdkInput,
        scheduleAutoStartLive: scheduleAutoStartLive,
        captureScreenshot: function (options) {
            return callSdk('captureScreenshot', options);
        },
        startRecording: function (options) {
            return callSdk('startRecording', options);
        },
        stopRecording: function () {
            return callSdk('stopRecording');
        },
        requestLiveRoom: function (options) {
            return callSdk('requestLiveRoom', options);
        },
        startLive: function (options) {
            return callSdk('startLive', options);
        },
        stopLive: function () {
            return callSdk('stopLive');
        }
    };

    window.__GGEMU_BRIDGE__ = bridge;
    window.GGEMUBridge = bridge;

    installWebGLHooks();
    installAudioHooks();
    installInputDebugHooks();
    installCanvasObserver();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', refresh);
    } else {
        refresh();
    }

    ensureSdkScript();

    function buildConfig() {
        var source = window.__GGEMU_CONFIG__ || {};
        var merged = {};
        copyProperties(DEFAULT_CONFIG, merged);
        copyProperties(source, merged);
        window.__GGEMU_CONFIG__ = merged;
        return merged;
    }

    function copyProperties(source, target) {
        var key;
        for (key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
                target[key] = source[key];
            }
        }
    }

    function getGGEMU() {
        if (window.GGEMU && typeof window.GGEMU.init === 'function') {
            return window.GGEMU;
        }

        return null;
    }

    function log() {
        if (!config.debug || !window.console || typeof window.console.log !== 'function') {
            return;
        }

        var args = ['[GGEMU Bridge]'];
        var index;

        for (index = 0; index < arguments.length; index += 1) {
            args.push(arguments[index]);
        }

        window.console.log.apply(window.console, args);
    }

    function shouldLogInputs() {
        return !!config.logInputs;
    }

    function logInput(label, payload) {
        if (!shouldLogInputs() || !window.console || typeof window.console.log !== 'function') {
            return;
        }

        window.console.log('[GGEMU Input]', label, payload);
    }

    function warn() {
        if (!window.console || typeof window.console.warn !== 'function') {
            return;
        }

        var args = ['[GGEMU Bridge]'];
        var index;

        for (index = 0; index < arguments.length; index += 1) {
            args.push(arguments[index]);
        }

        window.console.warn.apply(window.console, args);
    }

    function installCanvasObserver() {
        var target = document.documentElement || document.body;

        if (!window.MutationObserver || !target) {
            window.setInterval(refresh, 500);
            return;
        }

        state.canvasObserver = new window.MutationObserver(function () {
            refresh();
        });
        state.canvasObserver.observe(target, {
            childList: true,
            subtree: true
        });
    }

    function refresh() {
        updateCanvas(findCanvas());
        initializeSdk();
        syncSdkState();
    }

    function findCanvas() {
        return document.getElementById('app') || document.querySelector('canvas');
    }

    function updateCanvas(canvas) {
        if (!canvas) {
            return;
        }

        if (state.canvas === canvas) {
            return;
        }

        state.canvas = canvas;
        state.canvasRegistered = false;
        state.captureStreamRegistered = false;
        state.readySent = false;
        ensureCaptureCanvas();
        startCaptureMirrorLoop();
        attachCanvasEvents(canvas);
        attachCanvasInputDebug(canvas);
        log('Canvas detected');
    }

    function ensureCaptureCanvas() {
        if (!config.useCaptureMirror) {
            state.captureCanvas = null;
            state.captureContext = null;
            return;
        }

        if (!state.captureCanvas) {
            state.captureCanvas = document.createElement('canvas');
            state.captureCanvas.setAttribute('data-ggemu-capture-mirror', 'true');
            state.captureContext = state.captureCanvas.getContext('2d', {
                alpha: false
            });
        }

        syncCaptureCanvasSize();
    }

    function syncCaptureCanvasSize() {
        var width;
        var height;

        if (!state.canvas || !state.captureCanvas) {
            return;
        }

        width = state.canvas.width || state.canvas.clientWidth || 0;
        height = state.canvas.height || state.canvas.clientHeight || 0;

        if (width <= 0 || height <= 0) {
            return;
        }

        if (state.captureCanvas.width !== width) {
            state.captureCanvas.width = width;
        }

        if (state.captureCanvas.height !== height) {
            state.captureCanvas.height = height;
        }
    }

    function startCaptureMirrorLoop() {
        if (!config.useCaptureMirror || state.mirrorLoopStarted) {
            return;
        }

        state.mirrorLoopStarted = true;
        scheduleCaptureMirrorFrame();
    }

    function scheduleCaptureMirrorFrame() {
        var raf = window.requestAnimationFrame || function (callback) {
            return window.setTimeout(callback, 16);
        };

        raf(function () {
            drawCaptureMirrorFrame();
            scheduleCaptureMirrorFrame();
        });
    }

    function drawCaptureMirrorFrame() {
        if (!state.canvas || !state.captureCanvas || !state.captureContext) {
            return;
        }

        syncCaptureCanvasSize();

        if (state.captureCanvas.width <= 0 || state.captureCanvas.height <= 0) {
            return;
        }

        try {
            state.captureContext.drawImage(
                state.canvas,
                0,
                0,
                state.captureCanvas.width,
                state.captureCanvas.height
            );
            state.mirrorDrawFailed = false;
        } catch (error) {
            if (!state.mirrorDrawFailed) {
                state.mirrorDrawFailed = true;
                warn('Failed to draw capture mirror frame:', error);
            }
        }
    }

    function attachCanvasEvents(canvas) {
        if (canvas.__ggemuBridgeEventsAttached) {
            return;
        }

        canvas.__ggemuBridgeEventsAttached = true;
        canvas.addEventListener('mousedown', function () {
            focusCanvas();
        });
        canvas.addEventListener('touchstart', function () {
            focusCanvas();
        }, {
            passive: true
        });
    }

    function attachCanvasInputDebug(canvas) {
        if (!shouldLogInputs() || !canvas || canvas.__ggemuInputDebugAttached) {
            return;
        }

        canvas.__ggemuInputDebugAttached = true;
        canvas.addEventListener('keydown', function (event) {
            logInput('canvas keydown', serializeKeyboardEvent(event));
        });
        canvas.addEventListener('keyup', function (event) {
            logInput('canvas keyup', serializeKeyboardEvent(event));
        });
    }

    function installInputDebugHooks() {
        if (!shouldLogInputs() || state.inputDebugInstalled) {
            return;
        }

        state.inputDebugInstalled = true;

        if (document && typeof document.addEventListener === 'function') {
            document.addEventListener('keydown', function (event) {
                logInput('document keydown', serializeKeyboardEvent(event));
            });
            document.addEventListener('keyup', function (event) {
                logInput('document keyup', serializeKeyboardEvent(event));
            });
        }

        if (window && typeof window.addEventListener === 'function') {
            window.addEventListener('keydown', function (event) {
                logInput('window keydown', serializeKeyboardEvent(event));
            });
            window.addEventListener('keyup', function (event) {
                logInput('window keyup', serializeKeyboardEvent(event));
            });
        }
    }

    function ensureSdkScript() {
        var sdk;
        var script;

        sdk = getGGEMU();
        if (sdk) {
            initializeSdk();
            return;
        }

        if (state.sdkScriptLoading) {
            return;
        }

        state.sdkScriptLoading = true;
        script = document.createElement('script');
        script.src = config.sdkUrl;
        script.async = true;
        script.onload = function () {
            state.sdkScriptLoading = false;
            initializeSdk();
            syncSdkState();
        };
        script.onerror = function () {
            state.sdkScriptLoading = false;
            warn('Failed to load GGEMU SDK:', config.sdkUrl);
        };
        document.head.appendChild(script);
    }

    function initializeSdk() {
        var sdk;
        var initOptions;

        if (state.sdkInitialized) {
            return;
        }

        sdk = getGGEMU();
        if (!sdk) {
            return;
        }

        initOptions = {
            debug: !!config.debug,
            parentOrigin: config.parentOrigin
        };

        if (config.roomId) {
            initOptions.roomId = config.roomId;
        }

        if (config.streamName) {
            initOptions.streamName = config.streamName;
        }

        try {
            sdk.init(initOptions);
            sdk.setInputHandler(handleSdkInput);
            bindSdkEvents(sdk);
            state.sdkInitialized = true;
            log('SDK initialized');
        } catch (error) {
            warn('Failed to initialize GGEMU SDK:', error);
        }
    }

    function bindSdkEvents(sdk) {
        var infoEvents;

        if (state.sdkEventsBound || !sdk || typeof sdk.on !== 'function') {
            return;
        }

        state.sdkEventsBound = true;
        infoEvents = [
            'ggemu:sdk-ready',
            'ggemu:ready',
            'ggemu:live-room-ready',
            'ggemu:live-started',
            'ggemu:live-stopped',
            'ggemu:recording-started',
            'ggemu:recording-stopped'
        ];

        infoEvents.forEach(function (eventName) {
            sdk.on(eventName, function (payload) {
                log(eventName, payload);
            });
        });

        sdk.on('ggemu:ready', function () {
            scheduleAutoStartLive(config.autoStartLiveDelay);
        });

        sdk.on('ggemu:live-started', function () {
            state.liveStarted = true;
            state.liveStartRequested = false;
            clearLiveStartTimer();
        });

        sdk.on('ggemu:live-stopped', function () {
            state.liveStarted = false;
            state.liveStartRequested = false;
        });

        sdk.on('ggemu:error', function (payload) {
            warn('ggemu:error', payload);
        });

        if (config.debug) {
            sdk.on('ggemu:input', function (payload) {
                log('ggemu:input', payload);
            });
        }
    }

    function syncSdkState() {
        if (!state.sdkInitialized) {
            return;
        }

        registerCanvas();
        registerCaptureStream();
        registerAudio();
        sendReady();
    }

    function registerCanvas() {
        var sdk = getGGEMU();
        var captureCanvas = getRegisteredCanvas();

        if (!sdk || !captureCanvas || state.canvasRegistered) {
            return;
        }

        try {
            sdk.registerCanvas(captureCanvas);
            state.canvasRegistered = true;
            log('Canvas registered');
        } catch (error) {
            warn('Failed to register canvas:', error);
        }
    }

    function registerCaptureStream() {
        var sdk = getGGEMU();

        if (
            !sdk ||
            !state.captureCanvas ||
            state.captureStreamRegistered ||
            typeof sdk.registerCaptureStream !== 'function' ||
            typeof state.captureCanvas.captureStream !== 'function'
        ) {
            return;
        }

        try {
            sdk.registerCaptureStream(function () {
                var stream = state.captureCanvas.captureStream(config.captureFps);

                return {
                    stream: stream,
                    stop: function () {
                        stream.getTracks().forEach(function (track) {
                            track.stop();
                        });
                    }
                };
            });
            state.captureStreamRegistered = true;
            log('Capture stream registered');
        } catch (error) {
            warn('Failed to register capture stream:', error);
        }
    }

    function registerAudio() {
        var sdk = getGGEMU();

        if (!sdk || !state.masterGain || state.audioRegistered) {
            return;
        }

        try {
            sdk.registerAudioNode(state.masterGain);
            state.audioRegistered = true;
            log('Audio node registered');
        } catch (error) {
            warn('Failed to register audio node:', error);
        }
    }

    function sendReady() {
        var sdk = getGGEMU();

        if (!sdk || !state.canvasRegistered || state.readySent) {
            return;
        }

        try {
            sdk.setReady({
                game: config.game,
                engine: config.engine
            });
            state.readySent = true;
            scheduleAutoStartLive(config.autoStartLiveDelay);
            log('Ready sent');
        } catch (error) {
            warn('Failed to send ready state:', error);
        }
    }

    function clearLiveStartTimer() {
        if (!state.liveStartTimer) {
            return;
        }

        window.clearTimeout(state.liveStartTimer);
        state.liveStartTimer = null;
    }

    function scheduleAutoStartLive(delayMs) {
        if (!config.autoStartLive || state.liveStarted || state.liveStartRequested) {
            return;
        }

        if (state.liveStartAttempts >= config.autoStartLiveMaxAttempts) {
            return;
        }

        clearLiveStartTimer();
        state.liveStartTimer = window.setTimeout(function () {
            state.liveStartTimer = null;
            startLiveAutomatically();
        }, Math.max(0, delayMs || 0));
    }

    function startLiveAutomatically() {
        if (!config.autoStartLive || state.liveStarted || state.liveStartRequested) {
            return;
        }

        if (state.liveStartAttempts >= config.autoStartLiveMaxAttempts) {
            return;
        }

        state.liveStartRequested = true;
        state.liveStartAttempts += 1;

        callSdk('startLive').then(function () {
            log('Auto start live requested');
        }, function (error) {
            warn('Auto start live failed:', error);
            scheduleAutoStartLive(config.autoStartLiveRetryDelay);
        }).then(function () {
            state.liveStartRequested = false;
        });
    }

    function installAudioHooks() {
        wrapAudioContextPrototype(window.AudioContext && window.AudioContext.prototype);
        wrapAudioContextPrototype(window.webkitAudioContext && window.webkitAudioContext.prototype);
    }

    function installWebGLHooks() {
        wrapCanvasGetContext(window.HTMLCanvasElement && window.HTMLCanvasElement.prototype);
    }

    function wrapCanvasGetContext(prototype) {
        var originalGetContext;

        if (!prototype || prototype.__ggemuGetContextWrapped || typeof prototype.getContext !== 'function') {
            return;
        }

        originalGetContext = prototype.getContext;
        prototype.__ggemuGetContextWrapped = true;
        prototype.getContext = function (contextType, attributes) {
            var normalizedContextType = typeof contextType === 'string' ? contextType.toLowerCase() : '';

            if (isWebGLContextType(normalizedContextType)) {
                attributes = mergeWebGLContextAttributes(attributes);
            }

            return originalGetContext.call(this, contextType, attributes);
        };
    }

    function isWebGLContextType(contextType) {
        return contextType === 'webgl' ||
            contextType === 'experimental-webgl' ||
            contextType === 'webgl2' ||
            contextType === 'experimental-webgl2';
    }

    function mergeWebGLContextAttributes(attributes) {
        var mergedAttributes = {};

        if (attributes) {
            copyProperties(attributes, mergedAttributes);
        }

        mergedAttributes.preserveDrawingBuffer = true;
        return mergedAttributes;
    }

    function wrapAudioContextPrototype(prototype) {
        var originalCreateGain;

        if (!prototype || prototype.__ggemuCreateGainWrapped || typeof prototype.createGain !== 'function') {
            return;
        }

        originalCreateGain = prototype.createGain;
        prototype.__ggemuCreateGainWrapped = true;
        prototype.createGain = function () {
            var gainNode = originalCreateGain.apply(this, arguments);
            wrapGainNode(gainNode, this);
            return gainNode;
        };
    }

    function wrapGainNode(gainNode, context) {
        var originalConnect;

        if (!gainNode || gainNode.__ggemuConnectWrapped || typeof gainNode.connect !== 'function') {
            return;
        }

        originalConnect = gainNode.connect;
        gainNode.__ggemuConnectWrapped = true;
        gainNode.connect = function () {
            var destination = arguments[0];

            if (!state.masterGain && isContextDestination(destination, context)) {
                state.masterGain = gainNode;
                state.audioRegistered = false;
                log('Master gain detected');
                syncSdkState();
            }

            return originalConnect.apply(this, arguments);
        };
    }

    function isContextDestination(destination, context) {
        return !!(
            destination &&
            context &&
            context.destination &&
            destination === context.destination
        );
    }

    function handleSdkInput(input) {
        var resolvedInput;

        if (!input || (input.action !== 'keydown' && input.action !== 'keyup')) {
            return true;
        }

        triggerFirstInteraction();
        focusCanvas();

        resolvedInput = normalizeInput(input);
        window.__GGEMU_LAST_INPUT__ = {
            raw: cloneInput(input),
            normalized: cloneInput(resolvedInput),
            timestamp: Date.now()
        };
        logInput('sdk input', window.__GGEMU_LAST_INPUT__);
        dispatchKeyboardInput(input.action, resolvedInput);

        return true;
    }

    function dispatchKeyboardInput(type, input) {
        var activeElementEvent;
        var canvasEvent;
        var documentEvent;
        var windowEvent;

        if (state.canvas && typeof state.canvas.dispatchEvent === 'function') {
            canvasEvent = createKeyboardEvent(type, input, {
                bubbles: false
            });
            logInput('dispatch canvas', serializeKeyboardEvent(canvasEvent));
            state.canvas.dispatchEvent(canvasEvent);
        }

        if (
            document &&
            document.activeElement &&
            document.activeElement !== state.canvas &&
            typeof document.activeElement.dispatchEvent === 'function'
        ) {
            activeElementEvent = createKeyboardEvent(type, input, {
                bubbles: false
            });
            logInput('dispatch activeElement', {
                target: describeEventTarget(document.activeElement),
                event: serializeKeyboardEvent(activeElementEvent)
            });
            document.activeElement.dispatchEvent(activeElementEvent);
        }

        if (document && typeof document.dispatchEvent === 'function') {
            documentEvent = createKeyboardEvent(type, input, {
                bubbles: false
            });
            logInput('dispatch document', serializeKeyboardEvent(documentEvent));
            document.dispatchEvent(documentEvent);
        }

        if (window && typeof window.dispatchEvent === 'function') {
            windowEvent = createKeyboardEvent(type, input, {
                bubbles: false
            });
            logInput('dispatch window', serializeKeyboardEvent(windowEvent));
            window.dispatchEvent(windowEvent);
        }
    }

    function getRegisteredCanvas() {
        if (config.useCaptureMirror && state.captureCanvas) {
            return state.captureCanvas;
        }

        return state.canvas;
    }

    function triggerFirstInteraction() {
        var clickEvent;

        if (state.firstInteractionTriggered) {
            return;
        }

        state.firstInteractionTriggered = true;

        try {
            clickEvent = new window.MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            });
        } catch (error) {
            clickEvent = document.createEvent('MouseEvents');
            clickEvent.initEvent('click', true, true);
        }

        window.dispatchEvent(clickEvent);
    }

    function focusCanvas() {
        if (!state.canvas || typeof state.canvas.focus !== 'function') {
            return;
        }

        try {
            state.canvas.focus({
                preventScroll: true
            });
        } catch (error) {
            state.canvas.focus();
        }
    }

    function normalizeInput(input) {
        var key = normalizeKey(input.key, input.code);
        var code = normalizeCode(input.code, key);

        return {
            key: key,
            code: code,
            repeat: !!input.repeat,
            keyCode: resolveKeyCode(key, code)
        };
    }

    function normalizeKey(key, code) {
        if (typeof key === 'string' && key.length > 0) {
            if (key === 'Space' || key === 'Spacebar' || key === 'space') {
                return ' ';
            }

            return key;
        }

        if (code === 'Space' || code === 'space') {
            return ' ';
        }

        if (code === 'ArrowLeft' || code === 'ArrowUp' || code === 'ArrowRight' || code === 'ArrowDown') {
            return code;
        }

        if (code === 'Enter' || code === 'Escape' || code === 'Tab') {
            return code;
        }

        if (code && /^Key[A-Z]$/.test(code)) {
            return code.slice(3).toLowerCase();
        }

        if (code && /^Digit[0-9]$/.test(code)) {
            return code.slice(5);
        }

        return '';
    }

    function normalizeCode(code, key) {
        if (typeof code === 'string' && code.length > 0) {
            return code;
        }

        if (key === ' ') {
            return 'Space';
        }

        if (key === 'ArrowLeft' || key === 'ArrowUp' || key === 'ArrowRight' || key === 'ArrowDown') {
            return key;
        }

        if (key === 'Enter' || key === 'Escape' || key === 'Tab') {
            return key;
        }

        if (typeof key === 'string' && key.length === 1) {
            if (/^[a-z]$/i.test(key)) {
                return 'Key' + key.toUpperCase();
            }

            if (/^[0-9]$/.test(key)) {
                return 'Digit' + key;
            }
        }

        return '';
    }

    function resolveKeyCode(key, code) {
        if (KEY_CODE_BY_CODE[code]) {
            return KEY_CODE_BY_CODE[code];
        }

        if (KEY_CODE_BY_KEY[key]) {
            return KEY_CODE_BY_KEY[key];
        }

        if (typeof key === 'string' && key.length === 1) {
            return key.toUpperCase().charCodeAt(0);
        }

        return 0;
    }

    function createKeyboardEvent(type, input, overrides) {
        var event;
        var eventOptions = {
            key: input.key,
            code: input.code,
            repeat: input.repeat,
            bubbles: false,
            cancelable: true,
            view: window
        };

        if (overrides) {
            copyProperties(overrides, eventOptions);
        }

        try {
            event = new window.Event(type, {
                bubbles: !!eventOptions.bubbles,
                cancelable: !!eventOptions.cancelable
            });
        } catch (error) {
            event = document.createEvent('Event');
            event.initEvent(type, !!eventOptions.bubbles, !!eventOptions.cancelable);
        }

        setEventProperty(event, 'type', type);
        patchReadonlyProperty(event, 'key', input.key);
        patchReadonlyProperty(event, 'code', input.code);
        patchReadonlyProperty(event, 'repeat', input.repeat);
        patchReadonlyProperty(event, 'keyCode', input.keyCode);
        patchReadonlyProperty(event, 'which', input.keyCode);
        patchReadonlyProperty(event, 'charCode', input.keyCode);
        patchReadonlyProperty(event, 'bubbles', !!eventOptions.bubbles);
        patchReadonlyProperty(event, 'cancelable', !!eventOptions.cancelable);

        return event;
    }

    function setEventProperty(target, propertyName, value) {
        try {
            target[propertyName] = value;
        } catch (error) {
            patchReadonlyProperty(target, propertyName, value);
        }
    }

    function serializeKeyboardEvent(event) {
        return {
            type: event && event.type,
            key: event && event.key,
            code: event && event.code,
            keyCode: event && event.keyCode,
            which: event && event.which,
            charCode: event && event.charCode,
            repeat: !!(event && event.repeat),
            bubbles: !!(event && event.bubbles),
            cancelable: !!(event && event.cancelable),
            target: describeEventTarget(event && event.target),
            activeElement: describeEventTarget(document && document.activeElement)
        };
    }

    function describeEventTarget(target) {
        if (!target) {
            return 'null';
        }

        if (target === window) {
            return 'window';
        }

        if (target === document) {
            return 'document';
        }

        if (target.tagName) {
            return target.tagName.toLowerCase() + (target.id ? '#' + target.id : '');
        }

        return Object.prototype.toString.call(target);
    }

    function cloneInput(input) {
        var copy = {};

        if (!input) {
            return input;
        }

        copyProperties(input, copy);
        return copy;
    }

    function patchReadonlyProperty(target, propertyName, value) {
        try {
            Object.defineProperty(target, propertyName, {
                configurable: true,
                enumerable: true,
                get: function () {
                    return value;
                }
            });
        } catch (error) {}
    }

    function waitForSdkMethod(methodName, timeoutMs) {
        return new Promise(function (resolve, reject) {
            var startedAt = Date.now();
            var timer = null;

            function finish(error, sdk) {
                if (timer) {
                    window.clearInterval(timer);
                }

                if (error) {
                    reject(error);
                    return;
                }

                resolve(sdk);
            }

            function isMethodReady() {
                if (methodName === 'captureScreenshot' || methodName === 'startRecording' || methodName === 'startLive') {
                    return state.canvasRegistered;
                }

                return true;
            }

            function check() {
                var sdk = getGGEMU();

                refresh();
                ensureSdkScript();

                if (sdk && state.sdkInitialized && typeof sdk[methodName] === 'function' && isMethodReady()) {
                    finish(null, sdk);
                    return;
                }

                if (Date.now() - startedAt >= timeoutMs) {
                    finish(new Error('GGEMU SDK is not ready'));
                }
            }

            timer = window.setInterval(check, 100);
            check();
        });
    }

    function callSdk(methodName) {
        var args = Array.prototype.slice.call(arguments, 1);

        return waitForSdkMethod(methodName, 10000).then(function (sdk) {
            try {
                if (methodName === 'captureScreenshot' || methodName === 'startRecording' || methodName === 'startLive') {
                    drawCaptureMirrorFrame();
                }

                return sdk[methodName].apply(sdk, args);
            } catch (error) {
                return Promise.reject(error);
            }
        });
    }
}(window, document));
