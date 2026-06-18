(function(global) {
    'use strict';

    if (!global) {
        return;
    }

    if (global.GGEMU && global.GGEMU.version) {
        return;
    }

    var CHANNEL = 'ggemu-sdk';
    var DEFAULT_CONFIG = {"sdkVersion":"0.1.4","srsApiOrigin":"https://srs.dashu.ai","srsWebRtcHost":"srs.dashu.ai","gameId":"","roomId":"","streamName":"","parentOrigin":"*","fps":30,"maxBitrateKbps":2200,"maxFramerate":30,"debug":false};
    var RECORDER_MIME_TYPES = ["video/mp4; codecs=\"avc1.42E01E,mp4a.40.2\"","video/mp4","video/webm; codecs=vp9,opus","video/webm"];
    function normalizeString(value) {
        return String(value || '').trim();
    }

    function normalizeNumber(value, fallbackValue) {
        var nextValue = Number(value);

        return Number.isFinite(nextValue) ? nextValue : fallbackValue;
    }

    function isFunction(value) {
        return typeof value === 'function';
    }

    function isObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    function isMediaStream(value) {
        return Boolean(
            value &&
            isFunction(value.getTracks) &&
            isFunction(value.getVideoTracks) &&
            isFunction(value.getAudioTracks)
        );
    }

    function isBlob(value) {
        return typeof Blob !== 'undefined' && value instanceof Blob;
    }

    function cloneValue(value) {
        if (value === undefined) {
            return null;
        }

        if (value === null) {
            return null;
        }

        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return value;
        }

        if (isBlob(value)) {
            return value;
        }

        if (Array.isArray(value)) {
            return value.map(cloneValue);
        }

        if (isObject(value)) {
            var clonedObject = {};

            Object.keys(value).forEach(function(key) {
                clonedObject[key] = cloneValue(value[key]);
            });

            return clonedObject;
        }

        if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
            return value.slice(0);
        }

        if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(value)) {
            return value.slice ? value.slice() : value;
        }

        if (value instanceof Date) {
            return value.toISOString();
        }

        try {
            return structuredClone(value);
        } catch (error) {
            return null;
        }
    }

    function createSdkError(code, message, details) {
        var error = new Error(message);
        error.code = code;
        error.details = details === undefined ? null : details;
        return error;
    }

    function assertSdk(condition, code, message, details) {
        if (!condition) {
            throw createSdkError(code, message, details);
        }
    }

    function firstVideoTrack(stream) {
        return isMediaStream(stream) ? (stream.getVideoTracks()[0] || null) : null;
    }

    function firstAudioTrack(stream) {
        return isMediaStream(stream) ? (stream.getAudioTracks()[0] || null) : null;
    }

    function cloneTrack(track) {
        if (!track) {
            return { track: null, owned: false };
        }

        if (isFunction(track.clone)) {
            try {
                return { track: track.clone(), owned: true };
            } catch (error) {
            }
        }

        return { track: track, owned: false };
    }

    function stopTrack(track) {
        if (!track || !isFunction(track.stop)) {
            return;
        }

        try {
            track.stop();
        } catch (error) {
        }
    }

    function buildWebRtcUrl(host, streamName) {
        return 'webrtc://' + host + '/live/' + streamName;
    }

    function resolveRecorderOptions() {
        var recorderOptions = {
            videoBitsPerSecond: 4000000,
            audioBitsPerSecond: 128000,
        };
        var supportedMimeType = RECORDER_MIME_TYPES.find(function(mimeType) {
            return typeof MediaRecorder === 'undefined'
                || typeof MediaRecorder.isTypeSupported !== 'function'
                || MediaRecorder.isTypeSupported(mimeType);
        });

        if (supportedMimeType) {
            recorderOptions.mimeType = supportedMimeType;
        }

        return recorderOptions;
    }

    function createSdk() {
        var listeners = new Map();
        var state = {
            config: Object.assign({}, DEFAULT_CONFIG),
            ready: false,
            canvas: null,
            audioNode: null,
            audioDestination: null,
            audioStream: null,
            captureSource: null,
            pc: null,
            publishOwnedTracks: [],
            stopSourceCapture: null,
            liveActive: false,
            liveStartedAt: 0,
            recordingActive: false,
            recordingStartedAt: 0,
            recordingCountdown: 0,
            recordingRecorder: null,
            recordingChunks: [],
            recordingOwnedTracks: [],
            recordingStopSource: null,
            recordingTimer: 0,
            recordingStopPromise: null,
            pendingLiveRoomRequest: null,
            liveRoomRequestNonce: 0,
            pendingBagRequests: new Map(),
            bagRequestNonce: 0,
            lastBagState: null,
            pendingLeaderboardRequests: new Map(),
            leaderboardRequestNonce: 0,
            lastLeaderboardRun: null,
            lastStatus: {
                message: '',
                progress: null,
                extra: null,
            },
            lastError: null,
            messageHandler: null,
            lifecycleHandler: null,
            parentOrigin: DEFAULT_CONFIG.parentOrigin || '*',
            commandHandlers: Object.create(null),
            inputHandler: null,
        };

        function isBrowserExtensionOrigin(origin) {
            var normalizedOrigin = normalizeString(origin);

            return (
                normalizedOrigin.indexOf('chrome-extension://') === 0 ||
                normalizedOrigin.indexOf('moz-extension://') === 0 ||
                normalizedOrigin.indexOf('safari-web-extension://') === 0
            );
        }

        function getKeyboardEventData(bindingValue) {
            var normalizedValue = normalizeString(bindingValue);

            if (!normalizedValue) {
                return null;
            }

            switch (normalizedValue) {
                case 'Enter':
                    return { key: 'Enter', code: 'Enter', keyCode: 13 };
                case 'Escape':
                    return { key: 'Escape', code: 'Escape', keyCode: 27 };
                case 'Space':
                case ' ':
                    return { key: ' ', code: 'Space', keyCode: 32 };
                case 'ArrowUp':
                    return { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 };
                case 'ArrowDown':
                    return { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 };
                case 'ArrowLeft':
                    return { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 };
                case 'ArrowRight':
                    return { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 };
                default:
                    if (/^[a-z]$/i.test(normalizedValue)) {
                        return {
                            key: normalizedValue.toLowerCase(),
                            code: 'Key' + normalizedValue.toUpperCase(),
                            keyCode: normalizedValue.toUpperCase().charCodeAt(0),
                        };
                    }

                    if (/^Key[A-Z]$/.test(normalizedValue)) {
                        return {
                            key: normalizedValue.slice(3).toLowerCase(),
                            code: normalizedValue,
                            keyCode: normalizedValue.slice(3).charCodeAt(0),
                        };
                    }

                    if (/^[0-9]$/.test(normalizedValue)) {
                        return {
                            key: normalizedValue,
                            code: 'Digit' + normalizedValue,
                            keyCode: normalizedValue.charCodeAt(0),
                        };
                    }

                    return {
                        key: normalizedValue,
                        code: normalizedValue,
                        keyCode: 0,
                    };
            }
        }

        function dispatchFallbackKeyboardEvent(inputEvent) {
            var keyboardEventData = getKeyboardEventData(inputEvent.code || inputEvent.key);
            var eventTargets = [];
            var keyboardEvent;
            var dispatched = false;

            if (!keyboardEventData || typeof global.KeyboardEvent !== 'function') {
                return false;
            }

            if (global.document && global.document.activeElement) {
                eventTargets.push(global.document.activeElement);
            }

            if (global.document) {
                eventTargets.push(global.document);
                if (global.document.body) {
                    eventTargets.push(global.document.body);
                }
            }

            eventTargets.push(global);

            keyboardEvent = new global.KeyboardEvent(inputEvent.action, {
                key: keyboardEventData.key,
                code: keyboardEventData.code,
                location: 0,
                bubbles: true,
                cancelable: true,
                composed: true,
                view: global,
                repeat: Boolean(inputEvent.repeat),
                ctrlKey: false,
                shiftKey: false,
                altKey: false,
                metaKey: false,
            });

            try {
                Object.defineProperty(keyboardEvent, 'keyCode', {
                    get: function() {
                        return keyboardEventData.keyCode;
                    },
                    configurable: true,
                });
                Object.defineProperty(keyboardEvent, 'which', {
                    get: function() {
                        return keyboardEventData.keyCode;
                    },
                    configurable: true,
                });
            } catch (error) {
            }

            eventTargets.forEach(function(target) {
                if (!target || !isFunction(target.dispatchEvent)) {
                    return;
                }

                try {
                    target.dispatchEvent(keyboardEvent);
                    dispatched = true;
                } catch (error) {
                }
            });

            return dispatched;
        }

        function log() {
            if (!state.config.debug || !global.console || !isFunction(global.console.info)) {
                return;
            }

            var args = Array.prototype.slice.call(arguments);
            args.unshift('[GGEMU SDK]');
            global.console.info.apply(global.console, args);
        }

        function postToParent(type, payload) {
            if (!global.parent || global.parent === global || !isFunction(global.parent.postMessage)) {
                return;
            }

            var targetOrigin = state.parentOrigin || state.config.parentOrigin || '*';

            global.parent.postMessage({
                channel: CHANNEL,
                source: 'ggemu-sdk',
                type: type,
                version: DEFAULT_CONFIG.sdkVersion,
                timestamp: Date.now(),
                payload: payload || {},
            }, targetOrigin);
        }

        function emit(type, payload) {
            var eventPayload = payload || {};
            var handlerSet = listeners.get(type);

            if (handlerSet) {
                handlerSet.forEach(function(handler) {
                    try {
                        handler(eventPayload);
                    } catch (error) {
                        setTimeout(function() {
                            throw error;
                        }, 0);
                    }
                });
            }

            postToParent(type, eventPayload);
        }

        function on(type, handler) {
            var key = normalizeString(type);

            assertSdk(key, 'GGEMU_EVENT_REQUIRED', 'on(type, handler) requires an event type.');
            assertSdk(isFunction(handler), 'GGEMU_HANDLER_REQUIRED', 'on(type, handler) requires a function handler.');

            if (!listeners.has(key)) {
                listeners.set(key, new Set());
            }

            listeners.get(key).add(handler);

            return api;
        }

        function off(type, handler) {
            var key = normalizeString(type);
            var handlerSet = listeners.get(key);

            if (!handlerSet) {
                return api;
            }

            if (handler) {
                handlerSet.delete(handler);
            } else {
                handlerSet.clear();
            }

            if (handlerSet.size === 0) {
                listeners.delete(key);
            }

            return api;
        }

        function getPublicState() {
            return {
                version: DEFAULT_CONFIG.sdkVersion,
                ready: state.ready,
                liveActive: state.liveActive,
                liveStartedAt: state.liveStartedAt || null,
                recording: {
                    active: state.recordingActive,
                    startedAt: state.recordingStartedAt || null,
                    countdown: state.recordingCountdown || 0,
                },
                config: {
                    gameId: normalizeString(state.config.gameId),
                    roomId: normalizeString(state.config.roomId),
                    streamName: normalizeString(state.config.streamName),
                    parentOrigin: state.parentOrigin || state.config.parentOrigin || '*',
                    fps: normalizeNumber(state.config.fps, DEFAULT_CONFIG.fps),
                    maxBitrateKbps: normalizeNumber(state.config.maxBitrateKbps, DEFAULT_CONFIG.maxBitrateKbps),
                    maxFramerate: normalizeNumber(state.config.maxFramerate, DEFAULT_CONFIG.maxFramerate),
                },
                capabilities: {
                    hasCanvas: Boolean(state.canvas),
                    hasAudioNode: Boolean(state.audioNode),
                    hasAudioStream: Boolean(state.audioStream),
                    hasCustomCapture: Boolean(state.captureSource),
                    supportsInputEvents: true,
                    srsConfigured: Boolean(
                        normalizeString(state.config.srsApiOrigin) &&
                        normalizeString(state.config.srsWebRtcHost)
                    ),
                },
                bag: cloneValue(state.lastBagState),
                lastStatus: cloneValue(state.lastStatus),
                lastError: cloneValue(state.lastError),
            };
        }

        function cleanupPublishRuntime() {
            if (state.pc) {
                try {
                    state.pc.close();
                } catch (error) {
                }

                state.pc = null;
            }

            if (state.publishOwnedTracks.length > 0) {
                state.publishOwnedTracks.forEach(stopTrack);
                state.publishOwnedTracks = [];
            }

            if (isFunction(state.stopSourceCapture)) {
                try {
                    state.stopSourceCapture();
                } catch (error) {
                }

                state.stopSourceCapture = null;
            }

            state.liveActive = false;
            state.liveStartedAt = 0;
        }

        function cleanupRecordingRuntime() {
            if (state.recordingTimer) {
                global.clearInterval(state.recordingTimer);
                state.recordingTimer = 0;
            }

            if (state.recordingRecorder && state.recordingRecorder.state !== 'inactive') {
                try {
                    state.recordingRecorder.ondataavailable = null;
                    state.recordingRecorder.onstop = null;
                    state.recordingRecorder.onerror = null;
                    state.recordingRecorder.stop();
                } catch (error) {
                }
            }

            if (state.recordingOwnedTracks.length > 0) {
                state.recordingOwnedTracks.forEach(stopTrack);
                state.recordingOwnedTracks = [];
            }

            if (isFunction(state.recordingStopSource)) {
                try {
                    state.recordingStopSource();
                } catch (error) {
                }

                state.recordingStopSource = null;
            }

            if (state.recordingStopPromise) {
                state.recordingStopPromise.reject(createSdkError(
                    'GGEMU_RECORDING_ABORTED',
                    'Recording was interrupted.'
                ));
                state.recordingStopPromise = null;
            }

            state.recordingActive = false;
            state.recordingStartedAt = 0;
            state.recordingCountdown = 0;
            state.recordingRecorder = null;
            state.recordingChunks = [];
        }

        function clearPendingLiveRoomRequest() {
            state.pendingLiveRoomRequest = null;
        }

        function clearPendingBagRequests(error) {
            state.pendingBagRequests.forEach(function(pendingRequest) {
                pendingRequest.reject(error);
            });
            state.pendingBagRequests.clear();
        }

        function clearPendingLeaderboardRequests(error) {
            state.pendingLeaderboardRequests.forEach(function(pendingRequest) {
                pendingRequest.reject(error);
            });
            state.pendingLeaderboardRequests.clear();
        }

        function resolveLiveRoomRequest(payload) {
            if (!state.pendingLiveRoomRequest) {
                mergeConfig(payload);
                emit('ggemu:live-room-ready', getPublicState());
                return;
            }

            var pendingRequest = state.pendingLiveRoomRequest;

            if (
                pendingRequest.requestId &&
                normalizeString(payload?.requestId) &&
                normalizeString(payload.requestId) !== pendingRequest.requestId
            ) {
                return;
            }

            mergeConfig(payload);
            clearPendingLiveRoomRequest();
            emit('ggemu:live-room-ready', getPublicState());
            pendingRequest.resolve(getPublicState());
        }

        function rejectLiveRoomRequest(payload) {
            var pendingRequest = state.pendingLiveRoomRequest;
            var error = createSdkError(
                normalizeString(payload?.code) || 'GGEMU_LIVE_ROOM_FAILED',
                normalizeString(payload?.message) || 'Failed to prepare live room.',
                payload
            );

            if (!pendingRequest) {
                reportError(error);
                return;
            }

            if (
                pendingRequest.requestId &&
                normalizeString(payload?.requestId) &&
                normalizeString(payload.requestId) !== pendingRequest.requestId
            ) {
                return;
            }

            clearPendingLiveRoomRequest();
            pendingRequest.reject(reportError(error));
        }

        function mergeConfig(nextConfig) {
            if (!isObject(nextConfig)) {
                return;
            }

            var allowedKeys = [
                'gameId',
                'roomId',
                'streamName',
                'parentOrigin',
                'fps',
                'maxBitrateKbps',
                'maxFramerate',
                'debug',
                'srsApiOrigin',
                'srsWebRtcHost',
            ];

            allowedKeys.forEach(function(key) {
                if (Object.prototype.hasOwnProperty.call(nextConfig, key)) {
                    state.config[key] = nextConfig[key];
                }
            });

            var normalizedParentOrigin = normalizeString(state.config.parentOrigin);

            if (normalizedParentOrigin) {
                state.parentOrigin = normalizedParentOrigin;
            }
        }

        function configure(nextConfig) {
            mergeConfig(nextConfig);
            return api;
        }

        function requestLiveRoom(nextConfig) {
            mergeConfig(nextConfig);

            if (normalizeString(state.config.roomId) && normalizeString(state.config.streamName)) {
                return Promise.resolve(getPublicState());
            }

            assertSdk(
                global.parent && global.parent !== global && isFunction(global.parent.postMessage),
                'GGEMU_PARENT_REQUIRED',
                'requestLiveRoom() requires a parent window bridge.'
            );

            if (state.pendingLiveRoomRequest?.promise) {
                return state.pendingLiveRoomRequest.promise;
            }

            state.liveRoomRequestNonce += 1;

            var requestId = 'live-room-' + Date.now() + '-' + state.liveRoomRequestNonce;
            var liveRoomPromise = new Promise(function(resolve, reject) {
                state.pendingLiveRoomRequest = {
                    requestId: requestId,
                    resolve: resolve,
                    reject: reject,
                    promise: null,
                };
            });

            state.pendingLiveRoomRequest.promise = liveRoomPromise;

            setStatus('Requesting live room...', null);
            postToParent('ggemu:request-live-room', {
                requestId: requestId,
                gameId: normalizeString(state.config.gameId),
                roomId: normalizeString(state.config.roomId),
                streamName: normalizeString(state.config.streamName),
            });

            return liveRoomPromise;
        }

        function normalizeBagAmount(input) {
            var value = isObject(input) ? input.amount : input;
            var amount = Math.floor(normalizeNumber(value, 0));

            return amount > 0 ? amount : 0;
        }

        function resolveBagCommandResult(payload) {
            var requestId = normalizeString(payload?.requestId);
            var pendingRequest = state.pendingBagRequests.get(requestId);
            var result = cloneValue(payload?.result);

            if (!pendingRequest) {
                return;
            }

            state.pendingBagRequests.delete(requestId);
            state.lastBagState = result;
            emit('ggemu:bag-updated', getPublicState());
            pendingRequest.resolve(result);
        }

        function rejectBagCommandResult(payload) {
            var requestId = normalizeString(payload?.requestId);
            var pendingRequest = state.pendingBagRequests.get(requestId);
            var error = createSdkError(
                normalizeString(payload?.code) || 'GGEMU_BAG_COMMAND_FAILED',
                normalizeString(payload?.message) || 'Bag command failed.',
                payload?.details
            );

            if (!pendingRequest) {
                reportError(error);
                return;
            }

            state.pendingBagRequests.delete(requestId);
            pendingRequest.reject(reportError(error));
        }

        function requestBagCommand(action, payload) {
            assertSdk(
                global.parent && global.parent !== global && isFunction(global.parent.postMessage),
                'GGEMU_PARENT_REQUIRED',
                'Bag commands require a parent window bridge.'
            );

            state.bagRequestNonce += 1;

            var requestId = 'bag-command-' + Date.now() + '-' + state.bagRequestNonce;
            var requestPayload = Object.assign({}, isObject(payload) ? payload : {}, {
                requestId: requestId,
                action: normalizeString(action),
            });

            return new Promise(function(resolve, reject) {
                state.pendingBagRequests.set(requestId, {
                    action: normalizeString(action),
                    resolve: resolve,
                    reject: reject,
                });
                postToParent('ggemu:bag-command', requestPayload);
            });
        }

        function getBagStatus() {
            return requestBagCommand('status', {});
        }

        function addBagCoins(payload) {
            var amount = normalizeBagAmount(payload);

            assertSdk(amount > 0, 'GGEMU_BAG_AMOUNT_REQUIRED', 'addBagCoins(amount) requires a positive integer amount.');

            return requestBagCommand('add', {
                amount: amount,
            });
        }

        function useBagCoins(payload) {
            var amount = normalizeBagAmount(payload);

            assertSdk(amount > 0, 'GGEMU_BAG_AMOUNT_REQUIRED', 'useBagCoins(amount) requires a positive integer amount.');

            return requestBagCommand('use', {
                amount: amount,
            });
        }

        function resolveLeaderboardCommandResult(payload) {
            var requestId = normalizeString(payload?.requestId);
            var pendingRequest = state.pendingLeaderboardRequests.get(requestId);
            var result = cloneValue(payload?.result);

            if (!pendingRequest) {
                return;
            }

            state.pendingLeaderboardRequests.delete(requestId);
            pendingRequest.resolve(result);
        }

        function rejectLeaderboardCommandResult(payload) {
            var requestId = normalizeString(payload?.requestId);
            var pendingRequest = state.pendingLeaderboardRequests.get(requestId);
            var error = createSdkError(
                normalizeString(payload?.code) || 'GGEMU_GAME_LOG_FAILED',
                normalizeString(payload?.message) || 'Game log command failed.',
                payload?.details
            );

            if (!pendingRequest) {
                reportError(error);
                return;
            }

            state.pendingLeaderboardRequests.delete(requestId);
            pendingRequest.reject(reportError(error));
        }

        function requestLeaderboardCommand(action, payload) {
            assertSdk(
                global.parent && global.parent !== global && isFunction(global.parent.postMessage),
                'GGEMU_PARENT_REQUIRED',
                'Game log commands require a parent window bridge.'
            );

            state.leaderboardRequestNonce += 1;

            var requestId = 'game-log-command-' + Date.now() + '-' + state.leaderboardRequestNonce;
            var requestPayload = Object.assign({}, isObject(payload) ? payload : {}, {
                requestId: requestId,
                action: normalizeString(action),
            });

            return new Promise(function(resolve, reject) {
                state.pendingLeaderboardRequests.set(requestId, {
                    action: normalizeString(action),
                    resolve: resolve,
                    reject: reject,
                });
                postToParent('ggemu:leaderboard-command', requestPayload);
            });
        }

        function logGameStart() {
            return requestLeaderboardCommand('start', {}).then(function(run) {
                state.lastLeaderboardRun = cloneValue(run);
                emit('ggemu:game-start-logged', {
                    run: cloneValue(state.lastLeaderboardRun),
                    state: getPublicState(),
                });

                return cloneValue(state.lastLeaderboardRun);
            });
        }

        async function logGameFinish(scoreData, options) {
            var resolvedOptions = isObject(options) ? options : {};
            var levelId = normalizeString(resolvedOptions.levelId || resolvedOptions.level_id) || 'default';

            assertSdk(state.lastLeaderboardRun, 'GGEMU_GAME_LOG_START_REQUIRED', 'logGameStart() must be called before logGameFinish().');
            assertSdk(isObject(scoreData), 'GGEMU_GAME_LOG_SCORE_REQUIRED', 'logGameFinish(scoreData) requires a score object.');

            var result = await requestLeaderboardCommand('finish', {
                level_id: levelId,
                score_data: cloneValue(scoreData),
            });

            state.lastLeaderboardRun = null;
            emit('ggemu:game-finish-logged', {
                result: cloneValue(result),
                state: getPublicState(),
            });

            return result;
        }

        function registerCanvas(canvas, nextConfig) {
            assertSdk(
                canvas && isFunction(canvas.captureStream),
                'GGEMU_INVALID_CANVAS',
                'registerCanvas(canvas) requires a capturable canvas.'
            );

            state.canvas = canvas;

            if (nextConfig) {
                mergeConfig(nextConfig);
            }

            emit('ggemu:canvas-registered', getPublicState());

            return api;
        }

        function registerAudioNode(audioNode) {
            assertSdk(
                audioNode &&
                isFunction(audioNode.connect) &&
                audioNode.context &&
                isFunction(audioNode.context.createMediaStreamDestination),
                'GGEMU_INVALID_AUDIO_NODE',
                'registerAudioNode(node) requires a Web Audio node from the game mix bus.'
            );

            if (state.audioNode && state.audioDestination && state.audioNode !== audioNode && isFunction(state.audioNode.disconnect)) {
                try {
                    state.audioNode.disconnect(state.audioDestination);
                } catch (error) {
                }
            }

            if (state.audioNode === audioNode && state.audioDestination) {
                return api;
            }

            state.audioNode = audioNode;
            state.audioDestination = audioNode.context.createMediaStreamDestination();
            audioNode.connect(state.audioDestination);

            emit('ggemu:audio-registered', getPublicState());

            return api;
        }

        function registerAudioStream(audioStream) {
            assertSdk(
                isMediaStream(audioStream),
                'GGEMU_INVALID_AUDIO_STREAM',
                'registerAudioStream(stream) requires a MediaStream.'
            );
            assertSdk(
                firstAudioTrack(audioStream),
                'GGEMU_AUDIO_TRACK_REQUIRED',
                'registerAudioStream(stream) requires at least one audio track.'
            );

            state.audioStream = audioStream;

            emit('ggemu:audio-registered', getPublicState());

            return api;
        }

        function registerCaptureStream(captureSource) {
            var isValidSource = isFunction(captureSource) ||
                isMediaStream(captureSource) ||
                (isObject(captureSource) && isMediaStream(captureSource.stream));

            assertSdk(
                isValidSource,
                'GGEMU_INVALID_CAPTURE_SOURCE',
                'registerCaptureStream(source) requires a MediaStream, a factory, or { stream, stop }.'
            );

            state.captureSource = captureSource;

            emit('ggemu:capture-registered', getPublicState());

            return api;
        }

        function registerCommandHandler(command, handler) {
            var normalizedCommand = normalizeString(command);

            assertSdk(
                normalizedCommand,
                'GGEMU_COMMAND_REQUIRED',
                'registerCommandHandler(command, handler) requires a command name.'
            );
            assertSdk(
                isFunction(handler),
                'GGEMU_HANDLER_REQUIRED',
                'registerCommandHandler(command, handler) requires a function handler.'
            );

            state.commandHandlers[normalizedCommand] = handler;

            return api;
        }

        function setInputHandler(handler) {
            if (handler != null) {
                assertSdk(
                    isFunction(handler),
                    'GGEMU_HANDLER_REQUIRED',
                    'setInputHandler(handler) requires a function handler.'
                );
            }

            state.inputHandler = handler || null;

            return api;
        }

        function setStatus(message, progress, extra) {
            var nextProgress = progress == null
                ? null
                : Math.max(0, Math.min(100, Math.round(normalizeNumber(progress, 0))));

            state.lastStatus = {
                message: normalizeString(message),
                progress: nextProgress,
                extra: extra === undefined ? null : cloneValue(extra),
            };

            emit('ggemu:status', getPublicState());

            return api;
        }

        function setReady(extra) {
            state.ready = true;

            if (extra !== undefined) {
                state.lastStatus.extra = cloneValue(extra);
            }

            emit('ggemu:ready', getPublicState());

            return api;
        }

        function clearError() {
            state.lastError = null;
        }

        function reportError(error) {
            var normalizedError = error && typeof error === 'object'
                ? error
                : createSdkError('GGEMU_UNKNOWN_ERROR', String(error || 'Unknown error.'));

            state.lastError = {
                code: normalizeString(normalizedError.code) || 'GGEMU_ERROR',
                message: normalizeString(normalizedError.message) || 'Unknown error.',
                details: cloneValue(normalizedError.details),
            };

            emit('ggemu:error', getPublicState());

            return normalizedError;
        }

        function resolveRegisteredAudioTrack() {
            if (state.audioStream) {
                return firstAudioTrack(state.audioStream);
            }

            if (state.audioDestination?.stream) {
                return firstAudioTrack(state.audioDestination.stream);
            }

            return null;
        }

        function resolveCaptureSource() {
            if (state.captureSource) {
                var resolvedSource = isFunction(state.captureSource)
                    ? state.captureSource(getPublicState())
                    : state.captureSource;
                var resolvedStream = isObject(resolvedSource) ? resolvedSource.stream : resolvedSource;
                var resolvedStop = isObject(resolvedSource) && isFunction(resolvedSource.stop)
                    ? resolvedSource.stop
                    : null;

                assertSdk(
                    isMediaStream(resolvedStream),
                    'GGEMU_INVALID_CAPTURE_SOURCE',
                    'registerCaptureStream(source) must resolve to a MediaStream.'
                );
                assertSdk(
                    firstVideoTrack(resolvedStream),
                    'GGEMU_VIDEO_TRACK_REQUIRED',
                    'Capture stream must provide at least one video track.'
                );

                return {
                    stream: resolvedStream,
                    stop: resolvedStop,
                };
            }

            assertSdk(
                state.canvas && isFunction(state.canvas.captureStream),
                'GGEMU_CANVAS_REQUIRED',
                'registerCanvas(canvas) is required before startLive().'
            );

            var targetFps = Math.max(1, Math.floor(normalizeNumber(state.config.fps, DEFAULT_CONFIG.fps)));
            var canvasStream = state.canvas.captureStream(targetFps);

            assertSdk(
                firstVideoTrack(canvasStream),
                'GGEMU_VIDEO_TRACK_REQUIRED',
                'Canvas captureStream() returned no video track.'
            );

            return {
                stream: canvasStream,
                stop: function() {
                    var tracks = canvasStream.getTracks();
                    tracks.forEach(stopTrack);
                },
            };
        }

        function injectInput(payload) {
            var action = normalizeString(payload && payload.action).toLowerCase();
            var key = normalizeString(payload && payload.key);
            var code = normalizeString(payload && payload.code);
            var inputEvent;
            var handled = false;

            assertSdk(
                action === 'keydown' || action === 'keyup',
                'GGEMU_INPUT_ACTION_INVALID',
                'Input event action must be keydown or keyup.',
                { action: action }
            );
            assertSdk(
                key || code,
                'GGEMU_INPUT_KEY_REQUIRED',
                'Input event requires key or code.',
                { key: key, code: code }
            );

            inputEvent = {
                action: action,
                key: key || code,
                code: code || key,
                repeat: Boolean(payload && payload.repeat),
                source: normalizeString(payload && payload.source) || 'host',
                timestamp: Date.now(),
            };

            emit('ggemu:input', {
                input: cloneValue(inputEvent),
                state: getPublicState(),
            });

            if (typeof global.CustomEvent === 'function' && isFunction(global.dispatchEvent)) {
                global.dispatchEvent(new global.CustomEvent('ggemu:input', {
                    detail: cloneValue(inputEvent),
                }));
            }

            if (isFunction(state.inputHandler)) {
                handled = state.inputHandler(cloneValue(inputEvent), getPublicState()) !== false;
            } else {
                handled = dispatchFallbackKeyboardEvent(inputEvent);
            }

            return {
                accepted: handled,
                input: inputEvent,
                handled: handled,
            };
        }

        function resolvePublishStream() {
            var captureDescriptor = resolveCaptureSource();
            var captureStream = captureDescriptor.stream;
            var videoTrackClone = cloneTrack(firstVideoTrack(captureStream));
            var audioSourceTrack = firstAudioTrack(captureStream) || resolveRegisteredAudioTrack();
            var audioTrackClone = audioSourceTrack ? cloneTrack(audioSourceTrack) : null;
            var publishTracks = [];
            var ownedTracks = [];

            assertSdk(
                videoTrackClone.track,
                'GGEMU_VIDEO_TRACK_REQUIRED',
                'Missing video track for live publishing.'
            );

            if ('contentHint' in videoTrackClone.track) {
                try {
                    videoTrackClone.track.contentHint = 'motion';
                } catch (error) {
                }
            }

            publishTracks.push(videoTrackClone.track);

            if (videoTrackClone.owned) {
                ownedTracks.push(videoTrackClone.track);
            }

            if (audioTrackClone?.track) {
                publishTracks.push(audioTrackClone.track);

                if (audioTrackClone.owned) {
                    ownedTracks.push(audioTrackClone.track);
                }
            }

            return {
                stream: new MediaStream(publishTracks),
                ownedTracks: ownedTracks,
                stopSource: captureDescriptor.stop,
            };
        }

        function resolveRecordingStream() {
            var captureDescriptor = resolveCaptureSource();
            var captureStream = captureDescriptor.stream;
            var videoTrackClone = cloneTrack(firstVideoTrack(captureStream));
            var audioSourceTrack = firstAudioTrack(captureStream) || resolveRegisteredAudioTrack();
            var audioTrackClone = audioSourceTrack ? cloneTrack(audioSourceTrack) : null;
            var recordingTracks = [];
            var ownedTracks = [];

            assertSdk(
                videoTrackClone.track,
                'GGEMU_VIDEO_TRACK_REQUIRED',
                'Missing video track for recording.'
            );

            recordingTracks.push(videoTrackClone.track);

            if (videoTrackClone.owned) {
                ownedTracks.push(videoTrackClone.track);
            }

            if (audioTrackClone && audioTrackClone.track) {
                recordingTracks.push(audioTrackClone.track);

                if (audioTrackClone.owned) {
                    ownedTracks.push(audioTrackClone.track);
                }
            }

            return {
                stream: new MediaStream(recordingTracks),
                ownedTracks: ownedTracks,
                stopSource: captureDescriptor.stop,
            };
        }

        function canvasToBlobAsync(canvas, mimeType, quality) {
            return new Promise(function(resolve, reject) {
                canvas.toBlob(function(blob) {
                    if (!blob) {
                        reject(createSdkError(
                            'GGEMU_SCREENSHOT_FAILED',
                            'Canvas export returned no data.'
                        ));
                        return;
                    }

                    resolve(blob);
                }, mimeType, quality);
            });
        }

        async function captureScreenshot(payload) {
            var canvas = state.canvas;
            var mimeType = normalizeString(payload?.mimeType) || 'image/jpeg';
            var quality = Math.max(0, Math.min(1, normalizeNumber(payload?.quality, 0.92)));

            assertSdk(
                canvas && isFunction(canvas.toBlob),
                'GGEMU_CANVAS_REQUIRED',
                'registerCanvas(canvas) is required before taking a screenshot.'
            );

            var blob = await canvasToBlobAsync(canvas, mimeType, quality);

            return {
                blob: blob,
                mimeType: normalizeString(blob.type) || mimeType,
                width: normalizeNumber(canvas.width, 0),
                height: normalizeNumber(canvas.height, 0),
            };
        }

        function emitRecordingProgress() {
            emit('ggemu:recording-progress', getPublicState());
        }

        function startRecording(payload) {
            var maxDuration = Math.max(1, Math.floor(normalizeNumber(payload?.maxDuration, 15)));
            var recorderOptions = resolveRecorderOptions();

            assertSdk(
                typeof MediaRecorder !== 'undefined',
                'GGEMU_MEDIA_RECORDER_UNAVAILABLE',
                'MediaRecorder is not available in this browser.'
            );

            if (state.recordingActive) {
                return getPublicState();
            }

            cleanupRecordingRuntime();

            var recordingDescriptor = resolveRecordingStream();
            var recorder = new MediaRecorder(recordingDescriptor.stream, recorderOptions);

            state.recordingActive = true;
            state.recordingStartedAt = Date.now();
            state.recordingCountdown = maxDuration;
            state.recordingRecorder = recorder;
            state.recordingChunks = [];
            state.recordingOwnedTracks = recordingDescriptor.ownedTracks;
            state.recordingStopSource = recordingDescriptor.stopSource;

            recorder.ondataavailable = function(event) {
                if (event.data && event.data.size > 0) {
                    state.recordingChunks.push(event.data);
                }
            };

            recorder.onerror = function(event) {
                var recordingError = createSdkError(
                    'GGEMU_RECORDING_FAILED',
                    normalizeString(event?.error?.message) || 'Recording failed.',
                    { event: cloneValue(event) }
                );
                var pendingStopPromise = state.recordingStopPromise;

                state.recordingStopPromise = null;
                cleanupRecordingRuntime();
                emit('ggemu:recording-stopped', getPublicState());

                if (pendingStopPromise) {
                    pendingStopPromise.reject(recordingError);
                }

                reportError(recordingError);
            };

            recorder.onstop = function() {
                var pendingStopPromise = state.recordingStopPromise;
                var mimeType = normalizeString(recorder.mimeType) || 'video/webm';
                var result = {
                    blob: new Blob(state.recordingChunks, { type: mimeType }),
                    mimeType: mimeType,
                    startedAt: state.recordingStartedAt || null,
                    endedAt: Date.now(),
                };

                state.recordingStopPromise = null;
                cleanupRecordingRuntime();
                emit('ggemu:recording-stopped', getPublicState());

                if (pendingStopPromise) {
                    pendingStopPromise.resolve(result);
                }
            };

            recorder.start();
            emit('ggemu:recording-started', getPublicState());
            emitRecordingProgress();

            state.recordingTimer = global.setInterval(function() {
                state.recordingCountdown = Math.max(0, state.recordingCountdown - 1);
                emitRecordingProgress();

                if (state.recordingCountdown <= 0) {
                    stopRecording()
                        .then(function(result) {
                            if (result) {
                                postToParent('ggemu:recording-result', {
                                    result: cloneValue(result),
                                });
                            }
                        })
                        .catch(function(error) {
                            reportError(error);
                        });
                }
            }, 1000);

            return getPublicState();
        }

        function stopRecording() {
            if (!state.recordingActive || !state.recordingRecorder) {
                return Promise.resolve(null);
            }

            if (state.recordingStopPromise?.promise) {
                return state.recordingStopPromise.promise;
            }

            var stopPromise = new Promise(function(resolve, reject) {
                state.recordingStopPromise = {
                    resolve: resolve,
                    reject: reject,
                    promise: null,
                };
            });

            state.recordingStopPromise.promise = stopPromise;

            if (state.recordingTimer) {
                global.clearInterval(state.recordingTimer);
                state.recordingTimer = 0;
            }

            if (state.recordingRecorder.state === 'inactive') {
                var pendingStopPromise = state.recordingStopPromise;

                state.recordingStopPromise = null;
                cleanupRecordingRuntime();
                emit('ggemu:recording-stopped', getPublicState());
                pendingStopPromise.resolve(null);
                return stopPromise;
            }

            state.recordingRecorder.stop();

            return stopPromise;
        }

        async function publishToSrs(stream, streamName) {
            var apiOrigin = normalizeString(state.config.srsApiOrigin);
            var webrtcHost = normalizeString(state.config.srsWebRtcHost);
            var normalizedStreamName = normalizeString(streamName);
            var audioTrack = firstAudioTrack(stream);
            var videoTrack = firstVideoTrack(stream);

            assertSdk(
                apiOrigin,
                'GGEMU_SRS_API_REQUIRED',
                'Missing SRS API origin.'
            );
            assertSdk(
                webrtcHost,
                'GGEMU_SRS_WEBRTC_HOST_REQUIRED',
                'Missing SRS WebRTC host.'
            );
            assertSdk(
                normalizedStreamName,
                'GGEMU_STREAM_NAME_REQUIRED',
                'Missing streamName.'
            );

            var apiEndpoint = apiOrigin + '/rtc/v1/publish/';
            var pc = new RTCPeerConnection({ iceServers: [] });

            state.pc = pc;

            function addOrderedTrack(track) {
                if (!track) {
                    return;
                }

                // Keep the offer m-line order stable across browsers.
                var transceiver = pc.addTransceiver(track, {
                    direction: 'sendonly',
                    streams: [stream],
                });
                var sender = transceiver.sender;

                if (track.kind !== 'video') {
                    return;
                }

                var params = sender.getParameters();

                if (!params.encodings) {
                    params.encodings = [{}];
                }

                if (params.encodings.length === 0) {
                    params.encodings.push({});
                }

                params.encodings[0].maxBitrate = Math.max(
                    200,
                    Math.floor(normalizeNumber(state.config.maxBitrateKbps, DEFAULT_CONFIG.maxBitrateKbps))
                ) * 1000;
                params.encodings[0].maxFramerate = Math.max(
                    1,
                    Math.floor(normalizeNumber(state.config.maxFramerate, DEFAULT_CONFIG.maxFramerate))
                );
                params.degradationPreference = 'maintain-resolution';

                sender.setParameters(params).catch(function() {
                });
            }

            addOrderedTrack(audioTrack);
            addOrderedTrack(videoTrack);

            var offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            var response = await global.fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    api: apiEndpoint,
                    streamurl: buildWebRtcUrl(webrtcHost, normalizedStreamName),
                    clientip: null,
                    sdp: pc.localDescription?.sdp || '',
                }),
                cache: 'no-store',
                credentials: 'omit',
                mode: 'cors',
            });
            var result = await response.json().catch(function() {
                return null;
            });

            if (!response.ok || !result || result.code !== 0 || !result.sdp) {
                throw createSdkError(
                    'GGEMU_SRS_PUBLISH_FAILED',
                    'Failed to publish stream to SRS.',
                    {
                        status: response.status,
                        response: cloneValue(result),
                    }
                );
            }

            await pc.setRemoteDescription(new RTCSessionDescription({
                type: 'answer',
                sdp: result.sdp,
            }));
        }

        async function startLive(nextConfig) {
            mergeConfig(nextConfig);
            clearError();
            cleanupPublishRuntime();

            if (!normalizeString(state.config.streamName)) {
                await requestLiveRoom();
            }

            assertSdk(
                normalizeString(state.config.streamName),
                'GGEMU_STREAM_NAME_REQUIRED',
                'startLive() requires config.streamName.'
            );

            setStatus('Starting live stream...', null);
            log('startLive', getPublicState());

            try {
                var publishDescriptor = resolvePublishStream();

                state.publishOwnedTracks = publishDescriptor.ownedTracks;
                state.stopSourceCapture = publishDescriptor.stopSource;

                await publishToSrs(publishDescriptor.stream, state.config.streamName);

                state.liveActive = true;
                state.liveStartedAt = Date.now();

                setStatus('Live stream started.', 100);
                emit('ggemu:live-started', getPublicState());

                return getPublicState();
            } catch (error) {
                cleanupPublishRuntime();
                throw reportError(error);
            }
        }

        function stopLive() {
            cleanupPublishRuntime();
            setStatus('Live stream stopped.', null);
            emit('ggemu:live-stopped', getPublicState());
            return api;
        }

        function postCommandResult(command, requestId, result) {
            postToParent('ggemu:command-result', {
                command: command,
                requestId: normalizeString(requestId),
                result: cloneValue(result),
            });
        }

        function postCommandError(command, requestId, error) {
            var normalizedError = reportError(error);

            postToParent('ggemu:command-error', {
                command: command,
                requestId: normalizeString(requestId),
                code: normalizeString(normalizedError.code) || 'GGEMU_COMMAND_FAILED',
                message: normalizeString(normalizedError.message) || 'Command failed.',
                details: cloneValue(normalizedError.details),
            });
        }

        function executeHostCommand(type, payload) {
            switch (type) {
                case 'ggemu:capture-screenshot':
                    return captureScreenshot(payload);
                case 'ggemu:start-recording':
                    return startRecording(payload);
                case 'ggemu:stop-recording':
                    return stopRecording();
                case 'ggemu:input-event':
                    return injectInput(payload);
                default:
                    if (!state.commandHandlers[type]) {
                        throw createSdkError(
                            'GGEMU_UNKNOWN_COMMAND',
                            'Unsupported host command: ' + type + '.',
                            { type: type }
                        );
                    }

                    return state.commandHandlers[type](payload, getPublicState());
            }
        }

        function handleHostMessage(event) {
            var data = event.data;
            var type;
            var payload;
            var isExtensionInputEvent;

            if (!isObject(data) || data.channel !== CHANNEL || data.source !== 'ggemu-host') {
                return;
            }

            type = normalizeString(data.type);
            payload = isObject(data.payload) ? data.payload : {};
            isExtensionInputEvent = (
                type === 'ggemu:input-event' &&
                isBrowserExtensionOrigin(event.origin)
            );

            if (
                state.parentOrigin !== '*' &&
                normalizeString(event.origin) &&
                event.origin !== state.parentOrigin &&
                !isExtensionInputEvent
            ) {
                return;
            }

            if (normalizeString(event.origin) && !isExtensionInputEvent) {
                state.parentOrigin = event.origin;
            }

            try {
                switch (type) {
                    case 'ggemu:init':
                        mergeConfig(payload);
                        emit('ggemu:host-linked', getPublicState());
                        return;
                    case 'ggemu:configure':
                        mergeConfig(payload);
                        emit('ggemu:state', getPublicState());
                        return;
                    case 'ggemu:ping':
                        postToParent('ggemu:pong', getPublicState());
                        return;
                    case 'ggemu:request-state':
                        postToParent('ggemu:state', getPublicState());
                        return;
                    case 'ggemu:live-room-ready':
                        resolveLiveRoomRequest(payload);
                        return;
                    case 'ggemu:live-room-error':
                        rejectLiveRoomRequest(payload);
                        return;
                    case 'ggemu:bag-command-result':
                        resolveBagCommandResult(payload);
                        return;
                    case 'ggemu:bag-command-error':
                        rejectBagCommandResult(payload);
                        return;
                    case 'ggemu:leaderboard-command-result':
                        resolveLeaderboardCommandResult(payload);
                        return;
                    case 'ggemu:leaderboard-command-error':
                        rejectLeaderboardCommandResult(payload);
                        return;
                    case 'ggemu:start-live':
                        Promise.resolve(startLive(payload)).catch(function(error) {
                            reportError(error);
                        });
                        return;
                    case 'ggemu:stop-live':
                        stopLive();
                        return;
                    default:
                        Promise.resolve(executeHostCommand(type, payload))
                            .then(function(result) {
                                postCommandResult(type, payload?.requestId, result);
                            })
                            .catch(function(error) {
                                postCommandError(type, payload?.requestId, error);
                            });
                }
            } catch (error) {
                reportError(error);
            }
        }

        function bindMessageBridge() {
            if (state.messageHandler) {
                return;
            }

            state.messageHandler = handleHostMessage;
            global.addEventListener('message', state.messageHandler);
        }

        function bindLifecycleBridge() {
            if (state.lifecycleHandler) {
                return;
            }

            state.lifecycleHandler = function() {
                cleanupRecordingRuntime();
                cleanupPublishRuntime();
                clearPendingLiveRoomRequest();
                clearPendingBagRequests(createSdkError(
                    'GGEMU_SDK_UNLOADED',
                    'SDK lifecycle was interrupted.'
                ));
                clearPendingLeaderboardRequests(createSdkError(
                    'GGEMU_SDK_UNLOADED',
                    'SDK lifecycle was interrupted.'
                ));
            };

            global.addEventListener('pagehide', state.lifecycleHandler);
            global.addEventListener('beforeunload', state.lifecycleHandler);
        }

        function init(nextConfig) {
            mergeConfig(nextConfig);
            bindMessageBridge();
            bindLifecycleBridge();
            emit('ggemu:sdk-ready', getPublicState());
            return api;
        }

        function destroy() {
            cleanupRecordingRuntime();
            cleanupPublishRuntime();

            if (state.audioNode && state.audioDestination && isFunction(state.audioNode.disconnect)) {
                try {
                    state.audioNode.disconnect(state.audioDestination);
                } catch (error) {
                }
            }

            state.audioNode = null;
            state.audioDestination = null;
            state.audioStream = null;
            state.captureSource = null;
            state.canvas = null;
            state.ready = false;

            if (state.messageHandler) {
                global.removeEventListener('message', state.messageHandler);
                state.messageHandler = null;
            }

            if (state.lifecycleHandler) {
                global.removeEventListener('pagehide', state.lifecycleHandler);
                global.removeEventListener('beforeunload', state.lifecycleHandler);
                state.lifecycleHandler = null;
            }

            clearPendingLiveRoomRequest();
            clearPendingBagRequests(createSdkError(
                'GGEMU_SDK_DESTROYED',
                'SDK was destroyed.'
            ));
            clearPendingLeaderboardRequests(createSdkError(
                'GGEMU_SDK_DESTROYED',
                'SDK was destroyed.'
            ));

            emit('ggemu:destroyed', {
                version: DEFAULT_CONFIG.sdkVersion,
            });
        }

        var api = {
            version: DEFAULT_CONFIG.sdkVersion,
            init: init,
            configure: configure,
            registerCanvas: registerCanvas,
            registerAudioNode: registerAudioNode,
            registerAudioStream: registerAudioStream,
            registerCaptureStream: registerCaptureStream,
            registerCommandHandler: registerCommandHandler,
            setInputHandler: setInputHandler,
            setStatus: setStatus,
            setReady: setReady,
            getState: getPublicState,
            getBagStatus: getBagStatus,
            addBagCoins: addBagCoins,
            useBagCoins: useBagCoins,
            logGameStart: logGameStart,
            logGameFinish: logGameFinish,
            requestLiveRoom: requestLiveRoom,
            startLive: startLive,
            stopLive: stopLive,
            captureScreenshot: captureScreenshot,
            startRecording: startRecording,
            stopRecording: stopRecording,
            destroy: destroy,
            on: on,
            off: off,
        };

        bindMessageBridge();
        bindLifecycleBridge();

        setTimeout(function() {
            emit('ggemu:sdk-loaded', getPublicState());
        }, 0);

        return api;
    }

    global.GGEMU = createSdk();
})(window);
