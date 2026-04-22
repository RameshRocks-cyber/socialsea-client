import { useEffect, useRef, useState } from "react";
import { SETTINGS_KEY } from "../pages/soundPrefs";
import "./GestureCursor.css";

const GESTURE_MEDIAPIPE_WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const GESTURE_HAND_MODEL_ASSET =
  "https://storage.googleapis.com/mediapipe-assets/hand_landmarker.task";
const GESTURE_CLICK_COOLDOWN_MS = 120;
const GESTURE_CLICK_HOLD_FRAMES = 1;
const GESTURE_MOVE_GAIN = 1.0;
const GESTURE_STICKY_MOVE_GAIN = 1.0;
const GESTURE_MOVE_SENSITIVITY = 1.6;
const GESTURE_FINGER_SMOOTH_MIN = 0.34;
const GESTURE_FINGER_SMOOTH_MAX = 0.82;
const GESTURE_FINGER_SMOOTH_DIST = 70;
const GESTURE_DEADZONE_PX = 0.8;
const GESTURE_CLICK_PINCH_RATIO = 0.22;
const GESTURE_GRAB_PINCH_START_RATIO = 0.26;
const GESTURE_GRAB_PINCH_HOLD_RATIO = 0.34;
const GESTURE_BUDDY_GRAB_SNAP_PX = 170;
const GESTURE_FINGER_EXTEND_MARGIN = 0.08;
const GESTURE_SCROLL_PX_PER_SEC = 900;
const GESTURE_TARGET_FPS = 60;
const GESTURE_CAMERA_WIDTH = 960;
const GESTURE_CAMERA_HEIGHT = 540;
const GESTURE_CURSOR_KEY = "socialsea_gesture_cursor_enabled_v1";

const readGestureEnabled = () => {
  try {
    const direct = localStorage.getItem(GESTURE_CURSOR_KEY);
    if (direct === "true") return true;
    if (direct === "false") return false;
  } catch {
    // ignore fallback-key read issues
  }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.gestureCursorEnabled);
  } catch {
    return false;
  }
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export default function GestureCursor() {
  const [enabled, setEnabled] = useState(readGestureEnabled);
  const runningRef = useRef(false);
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const detectFrameRef = useRef(0);
  const handLandmarkerRef = useRef(null);
  const cursorRef = useRef(null);
  const cursorPosRef = useRef({ x: 0, y: 0, active: false });
  const prevLeftClickPinchRef = useRef(false);
  const prevRightClickPinchRef = useRef(false);
  const leftClickHoldFramesRef = useRef(0);
  const rightClickHoldFramesRef = useRef(0);
  const okMoveActiveRef = useRef(false);
  const gestureAnchorRef = useRef({ fingerX: 0, fingerY: 0, cursorX: 0, cursorY: 0 });
  const lastLeftClickAtRef = useRef(0);
  const lastRightClickAtRef = useRef(0);
  const cursorFlashTimerRef = useRef(0);
  const smoothFingerRef = useRef({ x: 0, y: 0, active: false });
  const lastScrollAtRef = useRef(0);
  const grabActiveRef = useRef(false);
  const grabTargetRef = useRef(null);
  const grabPointerIdRef = useRef(10);
  const lastDetectAtRef = useRef(0);

  const resolveSafeScreenPos = (screenPos) => {
    const fallbackX = cursorPosRef.current?.active ? cursorPosRef.current.x : screenPos?.x;
    const fallbackY = cursorPosRef.current?.active ? cursorPosRef.current.y : screenPos?.y;
    if (!Number.isFinite(fallbackX) || !Number.isFinite(fallbackY)) return null;
    return {
      x: clamp(Number(fallbackX), 0, window.innerWidth),
      y: clamp(Number(fallbackY), 0, window.innerHeight)
    };
  };

  const dispatchPointerEvent = (el, type, screenPos, extra = {}) => {
    if (!el) return false;
    const pos = resolveSafeScreenPos(screenPos);
    if (!pos) return false;
    const payload = {
      bubbles: true,
      cancelable: true,
      clientX: pos.x,
      clientY: pos.y,
      button: 0,
      buttons: type === "pointerdown" || type === "pointermove" || type === "mousedown" ? 1 : 0,
      ...extra
    };
    try {
      if (typeof PointerEvent !== "undefined" && type.startsWith("pointer")) {
        return el.dispatchEvent(new PointerEvent(type, { pointerType: "mouse", ...payload }));
      }
      if (type.startsWith("mouse") || type === "click" || type === "dblclick" || type === "auxclick") {
        return el.dispatchEvent(new MouseEvent(type, payload));
      }
      return el.dispatchEvent(new Event(type, payload));
    } catch {
      return false;
    }
  };

  const findBuddyTarget = (screenPos) => {
    const pos = resolveSafeScreenPos(screenPos);
    if (!pos) return null;
    const elements = typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(pos.x, pos.y)
      : [document.elementFromPoint(pos.x, pos.y)];
    for (const el of elements || []) {
      if (!el || !(el instanceof Element)) continue;
      const target = el.closest(".ss-shimeji-trigger");
      if (target) return target;
    }
    const allTriggers = Array.from(document.querySelectorAll(".ss-shimeji-trigger"));
    let nearest = null;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (const node of allTriggers) {
      if (!(node instanceof Element)) continue;
      const rect = node.getBoundingClientRect?.();
      if (!rect || !Number.isFinite(rect.left)) continue;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.hypot(cx - pos.x, cy - pos.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = node;
      }
    }
    if (nearest && nearestDist <= GESTURE_BUDDY_GRAB_SNAP_PX) return nearest;
    return null;
  };

  useEffect(() => {
    const refresh = (event) => {
      const eventFlag = event?.detail?.gestureCursorEnabled;
      if (typeof eventFlag === "boolean") {
        setEnabled(eventFlag);
        return;
      }
      setEnabled(readGestureEnabled());
    };
    const onStorage = (event) => {
      if (!event || event.key === SETTINGS_KEY || event.key === GESTURE_CURSOR_KEY) refresh();
    };
    window.addEventListener("ss-settings-update", refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("ss-settings-update", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }
    start().catch((error) => {
      console.error("Gesture cursor failed to start:", error);
      stop();
    });
    return () => {
      stop();
    };
  }, [enabled]);

  const hideCursor = () => {
    const el = cursorRef.current;
    if (cursorFlashTimerRef.current) {
      clearTimeout(cursorFlashTimerRef.current);
      cursorFlashTimerRef.current = 0;
    }
    if (el) {
      el.classList.remove("is-active", "is-click");
    }
    cursorPosRef.current = { x: 0, y: 0, active: false };
  };

  const mapCursorToScreen = (cursor, videoEl) => {
    if (!videoEl || !cursor) return null;
    const vw = Number(videoEl.videoWidth || videoEl.width || 1);
    const vh = Number(videoEl.videoHeight || videoEl.height || 1);
    if (!vw || !vh) return null;
    let nx = Number(cursor.x) / vw;
    let ny = Number(cursor.y) / vh;
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
    nx = clamp(1 - nx, 0, 1);
    ny = clamp(ny, 0, 1);
    return { x: nx * window.innerWidth, y: ny * window.innerHeight };
  };

  const setCursorPositionFromScreen = (screenPos, gain = GESTURE_MOVE_GAIN) => {
    const el = cursorRef.current;
    if (!el || !screenPos) {
      hideCursor();
      return;
    }
    const prev = cursorPosRef.current;
    const dx = screenPos.x - (prev.active ? prev.x : screenPos.x);
    const dy = screenPos.y - (prev.active ? prev.y : screenPos.y);
    const dist = Math.hypot(dx, dy);
    if (prev.active && dist < GESTURE_DEADZONE_PX) {
      return;
    }
    const alpha = !prev.active ? 1 : clamp(dist / 120, 0.55, 1);
    const nextX = prev.active ? prev.x + dx * alpha * gain : screenPos.x;
    const nextY = prev.active ? prev.y + dy * alpha * gain : screenPos.y;
    cursorPosRef.current = { x: nextX, y: nextY, active: true };
    el.style.setProperty("--cursor-x", `${nextX}px`);
    el.style.setProperty("--cursor-y", `${nextY}px`);
    el.classList.add("is-active");
  };

  const flashCursor = () => {
    const el = cursorRef.current;
    if (!el) return;
    el.classList.add("is-click");
    if (cursorFlashTimerRef.current) clearTimeout(cursorFlashTimerRef.current);
    cursorFlashTimerRef.current = setTimeout(() => {
      if (el) el.classList.remove("is-click");
    }, 200);
  };

  const triggerClick = (screenPos, clickType = "left") => {
    const isRightClick = clickType === "right";
    const mouseButton = isRightClick ? 2 : 0;
    const mouseButtons = isRightClick ? 2 : 1;
    const { x, y, active } = cursorPosRef.current;
    const hasScreenPos =
      Number.isFinite(screenPos?.x) && Number.isFinite(screenPos?.y);
    if (!active && !hasScreenPos) return false;
    const clickX = Number(active ? x : (hasScreenPos ? screenPos.x : x));
    const clickY = Number(active ? y : (hasScreenPos ? screenPos.y : y));
    const safeX = clamp(clickX, 0, window.innerWidth);
    const safeY = clamp(clickY, 0, window.innerHeight);
    const candidates = typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(safeX, safeY)
      : [document.elementFromPoint(safeX, safeY)];
    const dispatchPointer = (el, type, extra = {}) => {
      if (!el) return false;
      const payload = {
        bubbles: true,
        cancelable: true,
        clientX: safeX,
        clientY: safeY,
        button: mouseButton,
        buttons:
          type === "pointerdown" ||
          type === "mousedown" ||
          type === "pointermove" ||
          type === "mousemove"
            ? mouseButtons
            : 0,
        ...extra
      };
      try {
        if (typeof PointerEvent !== "undefined" && type.startsWith("pointer")) {
          return el.dispatchEvent(new PointerEvent(type, { pointerType: "mouse", ...payload }));
        }
        if (type.startsWith("mouse") || type === "click" || type === "dblclick" || type === "auxclick") {
          return el.dispatchEvent(new MouseEvent(type, payload));
        }
        return el.dispatchEvent(new Event(type, payload));
      } catch {
        return false;
      }
    };
    const tryDispatch = (el) => {
      if (!(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect?.();
      if (rect && rect.width === 0 && rect.height === 0) return false;
      const downOk = dispatchPointer(el, "pointerdown");
      const mouseDownOk = dispatchPointer(el, "mousedown");
      dispatchPointer(el, "pointerup");
      dispatchPointer(el, "mouseup");
      if (isRightClick) {
        const contextOk = dispatchPointer(el, "contextmenu");
        const auxOk = dispatchPointer(el, "auxclick");
        return contextOk || auxOk || mouseDownOk || downOk;
      }
      const clickOk = dispatchPointer(el, "click");
      const dispatched = clickOk || mouseDownOk || downOk;
      if (!dispatched && typeof el.click === "function") {
        try {
          el.click();
          return true;
        } catch {
          // ignore
        }
      }
      return dispatched;
    };
    const interactiveSelector = [
      "button",
      "a",
      "[role=\"button\"]",
      "[role=\"link\"]",
      "[role=\"menuitem\"]",
      "input",
      "textarea",
      "select",
      "label",
      "video",
      ".chat-bubble",
      "[data-chat-msg-id]"
    ].join(", ");
    for (const el of candidates || []) {
      if (!el || !(el instanceof Element)) continue;
      const style = window.getComputedStyle(el);
      if (style?.pointerEvents === "none" || style?.visibility === "hidden" || style?.display === "none") {
        continue;
      }
      const clickable = el.closest(interactiveSelector) || null;
      if (clickable) {
        if (tryDispatch(clickable)) return true;
        continue;
      }
      const cursor = String(style?.cursor || "").toLowerCase();
      const looksInteractive =
        cursor === "pointer" ||
        cursor === "zoom-in" ||
        cursor === "zoom-out" ||
        cursor === "grab" ||
        cursor === "grabbing" ||
        el.getAttribute?.("onclick") != null ||
        (Number.isFinite(el.tabIndex) && el.tabIndex >= 0);
      if (looksInteractive && tryDispatch(el)) return true;
    }
    return false;
  };

  const toPixelLandmarks = (landmarks, videoEl) => {
    if (!Array.isArray(landmarks) || !videoEl) return [];
    const width = Number(videoEl.videoWidth || videoEl.width || 1);
    const height = Number(videoEl.videoHeight || videoEl.height || 1);
    return landmarks.map((pt) => [Number(pt.x) * width, Number(pt.y) * height, Number(pt.z) * width]);
  };

  const readHandState = (landmarks) => {
    if (!landmarks || landmarks.length < 21) return null;
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const indexPip = landmarks[6];
    const indexMcp = landmarks[5];
    const middleTip = landmarks[12];
    const middleMcp = landmarks[9];
    const middlePip = landmarks[10];
    const ringTip = landmarks[16];
    const ringPip = landmarks[14];
    const ringMcp = landmarks[13];
    const pinkyTip = landmarks[20];
    const pinkyPip = landmarks[18];
    const pinkyMcp = landmarks[17];
    const handSize = Math.hypot(middleMcp[0] - wrist[0], middleMcp[1] - wrist[1]) || 1;
    const thumbIndexDist = Math.hypot(thumbTip[0] - indexTip[0], thumbTip[1] - indexTip[1]);
    const thumbMiddleDist = Math.hypot(thumbTip[0] - middleTip[0], thumbTip[1] - middleTip[1]);
    const thumbRingDist = Math.hypot(thumbTip[0] - ringTip[0], thumbTip[1] - ringTip[1]);
    const okMove = thumbIndexDist < handSize * 0.26;
    const leftClickPinch = thumbMiddleDist < handSize * GESTURE_CLICK_PINCH_RATIO;
    const rightClickPinch = thumbRingDist < handSize * GESTURE_CLICK_PINCH_RATIO;
    const grabPinchStart =
      thumbIndexDist < handSize * GESTURE_GRAB_PINCH_START_RATIO &&
      thumbMiddleDist < handSize * GESTURE_GRAB_PINCH_START_RATIO;
    const grabPinchHold =
      thumbIndexDist < handSize * GESTURE_GRAB_PINCH_HOLD_RATIO &&
      thumbMiddleDist < handSize * GESTURE_GRAB_PINCH_HOLD_RATIO;
    const extendMargin = handSize * GESTURE_FINGER_EXTEND_MARGIN;
    const isExtended = (tip, pip, mcp) =>
      tip[1] < pip[1] - extendMargin && pip[1] < mcp[1] - extendMargin * 0.5;
    const indexExtended = isExtended(indexTip, indexPip, indexMcp);
    const middleExtended = isExtended(middleTip, middlePip, middleMcp);
    const ringExtended = isExtended(ringTip, ringPip, ringMcp);
    const pinkyExtended = isExtended(pinkyTip, pinkyPip, pinkyMcp);
    return {
      okMove,
      leftClickPinch,
      rightClickPinch,
      grabPinchStart,
      grabPinchHold,
      indexExtended,
      middleExtended,
      ringExtended,
      pinkyExtended,
      cursor: { x: indexTip[0], y: indexTip[1] }
    };
  };

  const smoothFingerPosition = (screenPos) => {
    if (!screenPos) return null;
    const smooth = smoothFingerRef.current;
    if (!smooth.active) {
      smooth.x = screenPos.x;
      smooth.y = screenPos.y;
      smooth.active = true;
      return { x: smooth.x, y: smooth.y };
    }
    const dx = screenPos.x - smooth.x;
    const dy = screenPos.y - smooth.y;
    const dist = Math.hypot(dx, dy);
    if (dist < GESTURE_DEADZONE_PX) {
      return { x: smooth.x, y: smooth.y };
    }
    const alpha = clamp(dist / GESTURE_FINGER_SMOOTH_DIST, GESTURE_FINGER_SMOOTH_MIN, GESTURE_FINGER_SMOOTH_MAX);
    smooth.x += dx * alpha;
    smooth.y += dy * alpha;
    return { x: smooth.x, y: smooth.y };
  };

  const findScrollableTarget = (screenPos, direction) => {
    if (!screenPos || !Number.isFinite(screenPos.x) || !Number.isFinite(screenPos.y)) {
      return null;
    }
    const elements = typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(screenPos.x, screenPos.y)
      : [document.elementFromPoint(screenPos.x, screenPos.y)];
    const canScrollInDirection = (el) => {
      if (!(el instanceof Element)) return false;
      const style = window.getComputedStyle(el);
      const overflowY = String(style?.overflowY || "").toLowerCase();
      if (overflowY !== "auto" && overflowY !== "scroll") return false;
      const maxScrollTop = el.scrollHeight - el.clientHeight;
      if (maxScrollTop <= 6) return false;
      if (direction > 0) return el.scrollTop < maxScrollTop - 2;
      return el.scrollTop > 2;
    };
    const findScrollableAncestor = (el) => {
      let current = el;
      while (current && current !== document.body) {
        if (canScrollInDirection(current)) return current;
        current = current.parentElement;
      }
      return null;
    };
    for (const el of elements || []) {
      if (!(el instanceof Element)) continue;
      const target = findScrollableAncestor(el);
      if (target) return target;
    }
    return null;
  };

  const scrollByDirection = (direction, screenPos) => {
    const now = performance.now();
    const last = lastScrollAtRef.current || now;
    const deltaMs = Math.min(now - last, 100);
    lastScrollAtRef.current = now;
    const amount = (GESTURE_SCROLL_PX_PER_SEC * deltaMs) / 1000;
    if (!Number.isFinite(amount) || amount <= 0) return;
    const target = findScrollableTarget(screenPos, direction);
    if (target?.scrollBy) {
      target.scrollBy({ top: amount * direction, left: 0, behavior: "auto" });
      return;
    }
    window.scrollBy({ top: amount * direction, left: 0, behavior: "auto" });
  };

  const stop = () => {
    runningRef.current = false;
    okMoveActiveRef.current = false;
    prevLeftClickPinchRef.current = false;
    prevRightClickPinchRef.current = false;
    leftClickHoldFramesRef.current = 0;
    rightClickHoldFramesRef.current = 0;
    smoothFingerRef.current = { x: 0, y: 0, active: false };
    lastScrollAtRef.current = 0;
    grabActiveRef.current = false;
    grabTargetRef.current = null;
    lastDetectAtRef.current = 0;
    hideCursor();
    if (detectFrameRef.current) {
      cancelAnimationFrame(detectFrameRef.current);
      detectFrameRef.current = 0;
    }
    if (cameraVideoRef.current) {
      cameraVideoRef.current.pause();
      cameraVideoRef.current.srcObject = null;
      cameraVideoRef.current = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
  };

  const start = async () => {
    if (runningRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera access is not supported");
    }
    if (!handLandmarkerRef.current) {
      const vision = await import("@mediapipe/tasks-vision");
      const { FilesetResolver, HandLandmarker } = vision;
      const fileset = await FilesetResolver.forVisionTasks(GESTURE_MEDIAPIPE_WASM_BASE);
      handLandmarkerRef.current = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: GESTURE_HAND_MODEL_ASSET, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: GESTURE_CAMERA_WIDTH, max: 1280 },
        height: { ideal: GESTURE_CAMERA_HEIGHT, max: 720 },
        frameRate: { ideal: 60, max: 60 }
      },
      audio: false
    });
    cameraStreamRef.current = stream;

    const hiddenVideo = document.createElement("video");
    hiddenVideo.autoplay = true;
    hiddenVideo.muted = true;
    hiddenVideo.playsInline = true;
    hiddenVideo.srcObject = stream;
    cameraVideoRef.current = hiddenVideo;
    await hiddenVideo.play();

    runningRef.current = true;

    const detect = () => {
      if (!runningRef.current || !cameraVideoRef.current || !handLandmarkerRef.current) return;
      const nowPerf = performance.now();
      const minFrameGap = 1000 / GESTURE_TARGET_FPS;
      if (nowPerf - (lastDetectAtRef.current || 0) < minFrameGap) {
        detectFrameRef.current = requestAnimationFrame(detect);
        return;
      }
      lastDetectAtRef.current = nowPerf;
      try {
        const results = handLandmarkerRef.current.detectForVideo(cameraVideoRef.current, nowPerf);
        const landmarks = results?.landmarks?.[0];
        if (landmarks && landmarks.length) {
          const pixelLandmarks = toPixelLandmarks(landmarks, cameraVideoRef.current);
          const handState = readHandState(pixelLandmarks);
          const screenPos = mapCursorToScreen(handState?.cursor || null, cameraVideoRef.current);
          const smoothPos = handState?.okMove ? smoothFingerPosition(screenPos) : null;
          const wantsScrollDown =
            handState?.indexExtended &&
            handState?.middleExtended &&
            !handState?.ringExtended &&
            !handState?.pinkyExtended &&
            !handState?.okMove;
          const wantsScrollUp =
            handState?.indexExtended &&
            !handState?.middleExtended &&
            !handState?.ringExtended &&
            !handState?.pinkyExtended &&
            !handState?.okMove;
          if (handState?.okMove && smoothPos) {
            if (!okMoveActiveRef.current) {
              okMoveActiveRef.current = true;
              const baseX = cursorPosRef.current.active ? cursorPosRef.current.x : smoothPos.x;
              const baseY = cursorPosRef.current.active ? cursorPosRef.current.y : smoothPos.y;
              gestureAnchorRef.current = {
                fingerX: smoothPos.x,
                fingerY: smoothPos.y,
                cursorX: baseX,
                cursorY: baseY
              };
              if (!cursorPosRef.current.active) {
                setCursorPositionFromScreen({ x: baseX, y: baseY }, GESTURE_STICKY_MOVE_GAIN);
              }
            }
            const anchor = gestureAnchorRef.current;
            const nextX = clamp(
              anchor.cursorX + (smoothPos.x - anchor.fingerX) * GESTURE_MOVE_SENSITIVITY,
              0,
              window.innerWidth
            );
            const nextY = clamp(
              anchor.cursorY + (smoothPos.y - anchor.fingerY) * GESTURE_MOVE_SENSITIVITY,
              0,
              window.innerHeight
            );
            setCursorPositionFromScreen({ x: nextX, y: nextY }, GESTURE_STICKY_MOVE_GAIN);
          } else {
            okMoveActiveRef.current = false;
            smoothFingerRef.current.active = false;
            if (cursorPosRef.current.active && cursorRef.current) {
              cursorRef.current.classList.add("is-active");
            }
          }
          if (wantsScrollDown) {
            scrollByDirection(1, screenPos);
          } else if (wantsScrollUp) {
            scrollByDirection(-1, screenPos);
          } else {
            lastScrollAtRef.current = 0;
          }
          const now = Date.now();
          const shouldGrab = grabActiveRef.current ? Boolean(handState?.grabPinchHold) : Boolean(handState?.grabPinchStart);
          if (shouldGrab) {
            leftClickHoldFramesRef.current = 0;
            rightClickHoldFramesRef.current = 0;
            prevLeftClickPinchRef.current = false;
            prevRightClickPinchRef.current = false;
            const activePos = resolveSafeScreenPos(screenPos);
            if (!grabActiveRef.current) {
              const target = findBuddyTarget(activePos);
              if (target) {
                grabActiveRef.current = true;
                grabTargetRef.current = target;
                grabPointerIdRef.current += 1;
                const pointerId = grabPointerIdRef.current;
                dispatchPointerEvent(target, "pointerdown", activePos, { pointerId, buttons: 1 });
                dispatchPointerEvent(target, "mousedown", activePos, { pointerId, buttons: 1 });
              }
            } else if (grabTargetRef.current) {
              const target = grabTargetRef.current;
              const pointerId = grabPointerIdRef.current;
              dispatchPointerEvent(target, "pointermove", activePos, { pointerId, buttons: 1 });
              dispatchPointerEvent(target, "mousemove", activePos, { pointerId, buttons: 1 });
            }
          } else if (grabActiveRef.current) {
            const target = grabTargetRef.current;
            if (target) {
              const pointerId = grabPointerIdRef.current;
              const activePos = resolveSafeScreenPos(screenPos);
              dispatchPointerEvent(target, "pointerup", activePos, { pointerId, buttons: 0 });
              dispatchPointerEvent(target, "mouseup", activePos, { pointerId, buttons: 0 });
            }
            grabActiveRef.current = false;
            grabTargetRef.current = null;
          }

          const canHandleClickGesture =
            !shouldGrab &&
            !grabActiveRef.current &&
            !handState?.okMove &&
            !wantsScrollDown &&
            !wantsScrollUp;
          if (canHandleClickGesture) {
            const leftClickGesture = handState?.leftClickPinch && !handState?.rightClickPinch;
            const rightClickGesture = handState?.rightClickPinch && !handState?.leftClickPinch;

            if (leftClickGesture) {
              leftClickHoldFramesRef.current += 1;
              if (
                !prevLeftClickPinchRef.current &&
                leftClickHoldFramesRef.current >= GESTURE_CLICK_HOLD_FRAMES &&
                now - lastLeftClickAtRef.current > GESTURE_CLICK_COOLDOWN_MS
              ) {
                lastLeftClickAtRef.current = now;
                prevLeftClickPinchRef.current = true;
                if (triggerClick(screenPos, "left")) flashCursor();
              }
            } else {
              leftClickHoldFramesRef.current = 0;
              prevLeftClickPinchRef.current = false;
            }

            if (rightClickGesture) {
              rightClickHoldFramesRef.current += 1;
              if (
                !prevRightClickPinchRef.current &&
                rightClickHoldFramesRef.current >= GESTURE_CLICK_HOLD_FRAMES &&
                now - lastRightClickAtRef.current > GESTURE_CLICK_COOLDOWN_MS
              ) {
                lastRightClickAtRef.current = now;
                prevRightClickPinchRef.current = true;
                if (triggerClick(screenPos, "right")) flashCursor();
              }
            } else {
              rightClickHoldFramesRef.current = 0;
              prevRightClickPinchRef.current = false;
            }
          } else {
            leftClickHoldFramesRef.current = 0;
            rightClickHoldFramesRef.current = 0;
            prevLeftClickPinchRef.current = false;
            prevRightClickPinchRef.current = false;
          }
        } else {
          if (cursorPosRef.current.active && cursorRef.current) {
            cursorRef.current.classList.add("is-active");
          } else {
            hideCursor();
          }
          if (grabActiveRef.current) {
            const target = grabTargetRef.current;
            if (target) {
              const pointerId = grabPointerIdRef.current;
              dispatchPointerEvent(target, "pointerup", null, { pointerId, buttons: 0 });
              dispatchPointerEvent(target, "mouseup", null, { pointerId, buttons: 0 });
            }
            grabActiveRef.current = false;
            grabTargetRef.current = null;
          }
          okMoveActiveRef.current = false;
          prevLeftClickPinchRef.current = false;
          prevRightClickPinchRef.current = false;
          leftClickHoldFramesRef.current = 0;
          rightClickHoldFramesRef.current = 0;
        }
      } catch {
        // ignore per-frame gesture failures
      }
      detectFrameRef.current = requestAnimationFrame(detect);
    };
    detectFrameRef.current = requestAnimationFrame(detect);
  };

  if (!enabled) return null;

  return (
    <div className="gesture-cursor" ref={cursorRef} aria-hidden="true">
      <svg className="gesture-cursor-arrow" viewBox="0 0 24 24">
        <path d="M4 4 L20 12 L4 20 L7 12 Z" fill="currentColor" />
      </svg>
      <span className="gesture-cursor-ring" />
    </div>
  );
}
