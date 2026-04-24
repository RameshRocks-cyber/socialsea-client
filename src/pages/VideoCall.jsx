import { useCallback, useEffect, useState } from "react";
import { MdPictureInPictureAlt, MdSignLanguage } from "react-icons/md";
import {
  FiMic,
  FiMicOff,
  FiMaximize2,
  FiMoreVertical,
  FiMonitor,
  FiPhone,
  FiPhoneOff,
  FiSmile,
  FiUserPlus,
  FiVideo,
  FiVideoOff,
  FiVolume2,
  FiVolumeX
} from "react-icons/fi";
import { useChat, FORCE_BEAUTY_FILTER, VIDEO_FILTER_PRESETS, CALL_VIDEO_QUALITY_PRESETS } from "./hooks/useChat";
import "./Chat.css";

export default function VideoCall({ placement = "page" }) {
  const ctx = useChat();

  if (placement === "page") {
    const {
      groupCallActive,
      groupInviteOpen,
      contacts,
      myUserId,
      groupInviteIds,
      getContactDisplayName,
      toggleGroupInvite,
      addPeopleToGroupCall,
      startGroupCall,
      setGroupInviteOpen
    } = ctx;

    return (
      <>
        {groupInviteOpen && (
          <div className="group-call-overlay" role="dialog" aria-label="Start group call">
            <div className="group-call-card">
              <h3>Start group video call</h3>
              <p>Select people for the call</p>
              <div className="group-call-list">
                {contacts
                  .filter((c) => String(c?.id || "") !== String(myUserId))
                  .map((c) => {
                    const checked = groupInviteIds.includes(String(c.id));
                    const displayName = getContactDisplayName(c);
                    return (
                      <label key={c.id} className="group-call-item">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleGroupInvite(c.id)}
                        />
                        <span>{displayName}</span>
                      </label>
                    );
                  })}
                {contacts.length === 0 && <p className="group-call-empty">No contacts available.</p>}
              </div>
              <div className="group-call-actions">
                <button
                  type="button"
                  className="group-call-start"
                  disabled={groupInviteIds.length === 0}
                  onClick={() =>
                    groupCallActive
                      ? addPeopleToGroupCall()
                      : startGroupCall()
                  }
                >
                  {groupCallActive ? "Add people" : "Start call"}
                </button>
                <button type="button" className="group-call-cancel" onClick={() => setGroupInviteOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  const {
    remoteAudioRef,
    incomingCall,
    incomingCallPopupRef,
    incomingCallPopupPos,
    startIncomingCallPopupDrag,
    resetIncomingCallPopupPos,
    acceptIncomingCall,
    declineIncomingCall,
    toggleIncomingRingtoneMute,
    ringtoneMuted,
    callActive,
    callState,
    activeCallPopupRef,
    activeCallPopupPos,
    startActiveCallPopupDrag,
    resetActiveCallPopupPos,
    callStatusText,
    callError,
    callDurationSec,
    formatCallDuration,
    toggleMute,
    isMuted,
    isCallRecording,
    callRecordingError,
    callRecordingSupported,
    toggleCallRecording,
    upgradeCallToVideo,
    finishCall,
    showVideoCallScreen,
    groupCallActive,
    localVideoRef,
    remoteVideoRef,
    videoCallMinimized,
    setVideoCallMinimized,
    showVideoFilters,
    setShowVideoFilters,
    videoFilterId,
    setVideoFilterId,
    callVideoQualityId,
    callVideoQualityPreset,
    callVideoQualityLabel,
    showVideoQualityPanel,
    setShowVideoQualityPanel,
    setCallVideoQuality,
    activeVideoFilter,
    openGroupInvite,
    isSpeakerOn,
    toggleSpeaker,
    toggleScreenShare,
    isScreenSharing,
    isCameraOff,
    toggleCamera,
    groupRemoteTiles,
    isScreenShareStream,
    remoteIsScreenShare,
    isLocalVideoPrimary,
    setLocalVideoAsPrimary,
    setRemoteVideoAsPrimary,
    hasRemoteVideo,
    hasRemoteAudio,
    localVideoPos,
    startLocalVideoDrag,
    miniVideoPos,
    startMiniVideoDrag,
    signAssistEnabled,
    setSignAssistEnabled,
    signAssistAutoSpeak,
    setAutoSpeakEnabled,
    signAssistContinuousMode,
    setContinuousModeEnabled,
    captureSignAssistFromVideo,
    signAssistBusy,
    signAssistVoiceGender,
    setSignAssistVoiceGender,
    signAssistText,
    setSignAssistText,
    sendSignAssistMessage,
    signAssistStatus,
    signAssistDebugOpen,
    setSignAssistDebugOpen,
    signAssistDebug
  } = ctx;

  const [showCallMoreMenu, setShowCallMoreMenu] = useState(false);
  const isLocalPrimaryView = !groupCallActive && isLocalVideoPrimary;
  const remoteDisplayedStream =
    remoteVideoRef.current?.srcObject instanceof MediaStream ? remoteVideoRef.current.srcObject : null;
  const remoteShouldUseScreenStyle = remoteIsScreenShare || isScreenShareStream(remoteDisplayedStream);
  const keepVideoPlaying = useCallback((event) => {
    event?.currentTarget?.play?.().catch(() => {});
  }, []);

  useEffect(() => {
    if (!showVideoCallScreen) setShowCallMoreMenu(false);
  }, [showVideoCallScreen]);

  useEffect(() => {
    if (groupCallActive) return;
    if (remoteShouldUseScreenStyle) {
      setRemoteVideoAsPrimary();
      return;
    }
    if (isScreenSharing) {
      setLocalVideoAsPrimary();
    }
  }, [
    groupCallActive,
    remoteShouldUseScreenStyle,
    isScreenSharing,
    setRemoteVideoAsPrimary,
    setLocalVideoAsPrimary
  ]);

  const showVideoCallMini =
    callActive && (callState.mode === "video" || groupCallActive) && Boolean(videoCallMinimized);
  const canSwapPrimaryViews = !groupCallActive && !remoteShouldUseScreenStyle && !isScreenSharing;
  const signDebugTime = signAssistDebug?.lastDetectionAt
    ? new Date(signAssistDebug.lastDetectionAt).toLocaleTimeString()
    : "--";

  const setLocalVideoElement = useCallback(
    (el) => {
      if (!el) return;
      const previous = localVideoRef.current;
      if (
        previous &&
        previous !== el &&
        previous.srcObject instanceof MediaStream &&
        el.srcObject !== previous.srcObject
      ) {
        try {
          el.srcObject = previous.srcObject;
          el.play?.().catch(() => {});
        } catch {
          // ignore stream handoff failures
        }
      }
      localVideoRef.current = el;
    },
    [localVideoRef]
  );

  const setRemoteVideoElement = useCallback(
    (el) => {
      if (!el) return;
      const previous = remoteVideoRef.current;
      if (
        previous &&
        previous !== el &&
        previous.srcObject instanceof MediaStream &&
        el.srcObject !== previous.srcObject
      ) {
        try {
          el.srcObject = previous.srcObject;
          el.play?.().catch(() => {});
        } catch {
          // ignore stream handoff failures
        }
      }
      remoteVideoRef.current = el;
    },
    [remoteVideoRef]
  );

  return (
    <>
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: "none" }} aria-hidden="true" />
      {incomingCall && (
        <div
          ref={incomingCallPopupRef}
          className={`incoming-call-popup ${incomingCallPopupPos ? "is-dragged" : ""}`}
          style={
            incomingCallPopupPos
              ? {
                  left: `${incomingCallPopupPos.x}px`,
                  top: `${incomingCallPopupPos.y}px`,
                  right: "auto",
                  bottom: "auto"
                }
              : undefined
          }
          role="dialog"
          aria-live="polite"
          aria-label="Incoming call controls"
        >
          <div
            className="call-popup-handle"
            onPointerDown={startIncomingCallPopupDrag}
            onDoubleClick={resetIncomingCallPopupPos}
            title="Drag to move (double-click to reset)"
            aria-hidden="true"
          >
            <span className="call-popup-grip" aria-hidden="true" />
          </div>
          <p className="incoming-call-popup-title">
            {incomingCall.mode === "video" ? "Incoming video call" : "Incoming audio call"}
          </p>
          <p className="incoming-call-popup-subtitle">{incomingCall.fromName} is calling</p>
          <div className="incoming-call-popup-actions">
            <button type="button" className="call-accept" onClick={acceptIncomingCall}>
              {incomingCall.mode === "video" ? <FiVideo /> : <FiPhone />} Attend
            </button>
            <button type="button" className="call-decline" onClick={declineIncomingCall}>
              <FiPhoneOff /> Decline
            </button>
            <button type="button" className="call-ring-toggle" onClick={toggleIncomingRingtoneMute}>
              {ringtoneMuted ? "Unmute ring" : "Mute ring"}
            </button>
          </div>
        </div>
      )}
      {callActive && callState.mode === "audio" && (
        <div
          ref={activeCallPopupRef}
          className={`active-call-popup ${activeCallPopupPos ? "is-dragged" : ""}`}
          style={
            activeCallPopupPos
              ? {
                  left: `${activeCallPopupPos.x}px`,
                  top: `${activeCallPopupPos.y}px`,
                  right: "auto",
                  bottom: "auto"
                }
              : undefined
          }
          role="status"
          aria-live="polite"
          aria-label="Active call controls"
        >
          <div
            className="call-popup-handle"
            onPointerDown={startActiveCallPopupDrag}
            onDoubleClick={resetActiveCallPopupPos}
            title="Drag to move (double-click to reset)"
            aria-hidden="true"
          >
            <span className="call-popup-grip" aria-hidden="true" />
          </div>
          <p className="active-call-popup-title">
            {callState.mode === "video" ? "Video call" : "Audio call"} with {callState.peerName || "User"}
          </p>
          <p className="active-call-popup-subtitle">
            {callStatusText} - Total {formatCallDuration(callDurationSec)}
          </p>
          {isCallRecording && <p className="active-call-popup-subtitle">Recording audio...</p>}
          {callRecordingError && <p className="call-error">{callRecordingError}</p>}
          <div className="active-call-popup-actions">
            <button type="button" className="call-ring-toggle" onClick={toggleMute}>
              {isMuted ? "Unmute mic" : "Mute mic"}
            </button>
            <button
              type="button"
              className="call-ring-toggle"
              onClick={toggleCallRecording}
              disabled={!callRecordingSupported}
            >
              {isCallRecording ? "Stop recording" : "Record call"}
            </button>
            <button type="button" className="call-ring-toggle" onClick={upgradeCallToVideo}>
              Switch to video
            </button>
            <button type="button" className="call-decline" onClick={() => finishCall(true)}>
              <FiPhoneOff /> End Call
            </button>
          </div>
        </div>
      )}
      {callActive && callState.mode === "audio" && !incomingCall && (
        <button
          type="button"
          className="call-floating-end"
          onClick={() => finishCall(true)}
          title="End call"
        >
          <FiPhoneOff /> End call
        </button>
      )}

      {showVideoCallMini && (
        <>
          <button
            type="button"
            className="wa-call-mini-bar"
            onClick={() => setVideoCallMinimized(false)}
            title="Return to call"
          >
            <span className="wa-call-mini-bar-title">
              {groupCallActive ? "Group video call" : "Video call"}
            </span>
            <span className="wa-call-mini-bar-sub">
              {callStatusText} - {formatCallDuration(callDurationSec)} - Tap to return
            </span>
          </button>

          <div
            className="wa-video-mini"
            role="button"
            tabIndex={0}
            onClick={() => setVideoCallMinimized(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setVideoCallMinimized(false);
              }
            }}
            aria-label="Return to video call"
            title="Return to call"
            style={
              miniVideoPos
                ? {
                    left: `${miniVideoPos.x}px`,
                    top: `${miniVideoPos.y}px`,
                    right: "auto",
                    bottom: "auto"
                  }
                : undefined
            }
          >
            <div
              className="wa-video-mini-drag"
              onPointerDown={startMiniVideoDrag}
              onClick={(event) => event.stopPropagation()}
              title="Drag call window"
              aria-hidden="true"
            />
            {groupCallActive ? (
              <>
                {groupRemoteTiles?.[0]?.stream ? (
                  <video
                    autoPlay
                    playsInline
                    muted
                    className={`wa-video-mini-remote ${
                      isScreenShareStream(groupRemoteTiles[0].stream) ? "is-screen" : "is-mirror"
                    }`}
                    data-allow-simultaneous="true"
                    ref={(el) => {
                      const stream = groupRemoteTiles[0].stream;
                      if (!el || !stream) return;
                      if (el.srcObject !== stream) el.srcObject = stream;
                      el.play?.().catch(() => {});
                    }}
                  />
                ) : (
                  <div className="wa-video-mini-fallback" aria-live="polite">
                    Waiting...
                  </div>
                )}
                <video
                  ref={setLocalVideoElement}
                  autoPlay
                  playsInline
                  muted
                  className={`wa-video-mini-local ${isScreenSharing ? "is-screen" : "is-mirror"}`}
                  style={{ filter: activeVideoFilter.css }}
                  data-allow-simultaneous="true"
                />
              </>
            ) : (
              <>
                <video
                  ref={setRemoteVideoElement}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={keepVideoPlaying}
                  onCanPlay={keepVideoPlaying}
                  className={`wa-video-mini-remote ${remoteShouldUseScreenStyle ? "is-screen" : "is-mirror"}`}
                  data-allow-simultaneous="true"
                />
                <video
                  ref={setLocalVideoElement}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={keepVideoPlaying}
                  onCanPlay={keepVideoPlaying}
                  className={`wa-video-mini-local ${isScreenSharing ? "is-screen" : "is-mirror"}`}
                  style={{ filter: activeVideoFilter.css }}
                  data-allow-simultaneous="true"
                />
              </>
            )}

            <button
              type="button"
              className="wa-video-mini-hangup"
              onClick={(event) => {
                event.stopPropagation();
                finishCall(true);
              }}
              title="End call"
              aria-label="End call"
            >
              <FiPhoneOff />
            </button>
            <button
              type="button"
              className="wa-video-mini-expand"
              onClick={(event) => {
                event.stopPropagation();
                setVideoCallMinimized(false);
              }}
              title="Return to call"
              aria-label="Return to call"
            >
              <FiMaximize2 />
            </button>
          </div>
        </>
      )}

      {showVideoCallScreen && (
        <div
          className={`wa-video-call-screen ${isLocalPrimaryView ? "is-local-primary" : ""}`}
          role="dialog"
          aria-live="polite"
          aria-label="Video call screen"
        >
          {groupCallActive ? (
            <div className="wa-video-grid">
              <div className="wa-video-tile is-local">
                <video
                  ref={setLocalVideoElement}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={keepVideoPlaying}
                  onCanPlay={keepVideoPlaying}
                  className={`wa-video-local ${isScreenSharing ? "is-screen" : "is-mirror"}`}
                  style={{ filter: activeVideoFilter.css }}
                  data-allow-simultaneous="true"
                />
                <span className="wa-video-name">You</span>
              </div>
              {groupRemoteTiles.map((tile) => (
                <div className="wa-video-tile" key={tile.peerId}>
                  <video
                    autoPlay
                    playsInline
                    onLoadedMetadata={keepVideoPlaying}
                    onCanPlay={keepVideoPlaying}
                    className={`wa-video-remote ${isScreenShareStream(tile.stream) ? "is-screen" : "is-mirror"}`}
                    data-allow-simultaneous="true"
                    ref={(el) => {
                      if (!el || !tile.stream) return;
                      if (el.srcObject !== tile.stream) el.srcObject = tile.stream;
                      el.play?.().catch(() => {});
                    }}
                  />
                  <span className="wa-video-name">{tile.name}</span>
                </div>
              ))}
              {groupRemoteTiles.length === 0 && (
                <div className="wa-video-remote-fallback" aria-live="polite">
                  <div className="wa-video-avatar">G</div>
                  <p>Waiting for others to join...</p>
                </div>
              )}
            </div>
          ) : (
            <>
              <video
                ref={setRemoteVideoElement}
                autoPlay
                playsInline
                muted
                onClick={() => {
                  if (isLocalPrimaryView && canSwapPrimaryViews) setRemoteVideoAsPrimary();
                }}
                onLoadedMetadata={keepVideoPlaying}
                onCanPlay={keepVideoPlaying}
                className={`wa-video-remote ${remoteShouldUseScreenStyle ? "is-screen" : "is-mirror"} ${
                  isLocalPrimaryView && canSwapPrimaryViews ? "is-thumbnail is-tappable" : isLocalPrimaryView ? "is-thumbnail" : "is-main"
                }`}
                data-allow-simultaneous="true"
              />
              {!hasRemoteVideo && !hasRemoteAudio && (
                <div className="wa-video-remote-indicator" aria-live="polite">
                  <span className="wa-video-remote-indicator-icon">◎</span>
                  <span className="wa-video-remote-indicator-text">Camera off</span>
                </div>
              )}
                <video
                  ref={setLocalVideoElement}
                  autoPlay
                  playsInline
                  muted
                  onClick={() => {
                    if (!isLocalPrimaryView && canSwapPrimaryViews) setLocalVideoAsPrimary();
                  }}
                  onLoadedMetadata={keepVideoPlaying}
                  onCanPlay={keepVideoPlaying}
                  className={`wa-video-local ${isScreenSharing ? "is-screen" : "is-mirror"} ${
                    isLocalPrimaryView ? "is-main" : canSwapPrimaryViews ? "is-thumbnail is-tappable" : "is-thumbnail"
                  } ${localVideoPos ? "is-dragged" : ""}`}
                style={{
                  filter: activeVideoFilter.css,
                  ...(!isLocalPrimaryView && localVideoPos
                    ? { left: `${localVideoPos.x}px`, top: `${localVideoPos.y}px`, right: "auto", bottom: "auto" }
                    : {})
                }}
                onPointerDown={isLocalPrimaryView ? undefined : startLocalVideoDrag}
                data-allow-simultaneous="true"
              />
            </>
          )}
          <div className="wa-video-top">
            <button
              type="button"
              className="wa-video-exit"
              onClick={() => {
                setVideoCallMinimized(true);
              }}
              title="Picture in picture"
              aria-label="Picture in picture"
            >
              <MdPictureInPictureAlt />
            </button>
            <p className="wa-video-peer">{callState.peerName || "User"}</p>
            <p className="wa-video-state">
              {callStatusText} - {formatCallDuration(callDurationSec)}
            </p>
            {callError && <p className="call-error wa-video-error">{callError}</p>}
          </div>
          {signAssistEnabled && (
            <div className="wa-sign-assist-panel" role="region" aria-label="Sign assist">
              <div className="wa-sign-assist-head">
                <strong>Sign Assist</strong>
                <label className="wa-sign-assist-auto">
                  <input
                    type="checkbox"
                    checked={signAssistAutoSpeak}
                    onChange={(e) => setAutoSpeakEnabled(e.target.checked)}
                  />
                  Auto-speak incoming
                </label>
                <label className="wa-sign-assist-auto">
                  <input
                    type="checkbox"
                    checked={signAssistContinuousMode}
                    onChange={(e) => setContinuousModeEnabled(e.target.checked)}
                  />
                  Continuous mode
                </label>
                <button
                  type="button"
                  className="wa-sign-assist-debug-toggle"
                  onClick={() => setSignAssistDebugOpen((prev) => !prev)}
                >
                  {signAssistDebugOpen ? "Hide Debug" : "Debug"}
                </button>
              </div>
              {signAssistDebugOpen && (
                <div className="wa-sign-assist-debug" role="status" aria-live="polite">
                  <div><span>Local model</span><strong>{signAssistDebug?.localModelStatus || "idle"}</strong></div>
                  <div><span>Sequence model</span><strong>{signAssistDebug?.sequenceModelStatus || "idle"}</strong></div>
                  <div><span>API</span><strong>{signAssistDebug?.apiStatus || "idle"}</strong></div>
                  <div><span>Last detect</span><strong>{signAssistDebug?.lastDetection || "--"}</strong></div>
                  <div><span>Source</span><strong>{signAssistDebug?.lastDetectionSource || "--"}</strong></div>
                  <div><span>At</span><strong>{signDebugTime}</strong></div>
                  <div><span>Error</span><strong>{signAssistDebug?.lastError || "--"}</strong></div>
                </div>
              )}
              <div className="wa-sign-assist-row">
                <button
                  type="button"
                  className="wa-sign-assist-capture"
                  onClick={captureSignAssistFromVideo}
                  disabled={signAssistBusy}
                >
                  {signAssistBusy ? "Capturing..." : "Capture Sign"}
                </button>
                <select
                  className="wa-sign-assist-gender"
                  value={signAssistVoiceGender}
                  onChange={(e) => setSignAssistVoiceGender(e.target.value)}
                  title="Voice gender"
                >
                  <option value="female">Female voice</option>
                  <option value="male">Male voice</option>
                </select>
              </div>
              <textarea
                className="wa-sign-assist-input"
                rows={2}
                placeholder="Type or edit translated sign text..."
                value={signAssistText}
                onChange={(e) => setSignAssistText(e.target.value)}
              />
              <div className="wa-sign-assist-actions">
                <button type="button" className="wa-sign-assist-send" onClick={sendSignAssistMessage}>
                  Send Sign Message
                </button>
                <button
                  type="button"
                  className="wa-sign-assist-toggle"
                  onClick={() => setSignAssistEnabled(false)}
                >
                  Hide
                </button>
              </div>
              {signAssistStatus && <p className="wa-sign-assist-status">{signAssistStatus}</p>}
            </div>
          )}
          {showVideoQualityPanel && (
            <div className="wa-video-quality-panel" role="listbox" aria-label="Video quality">
              <div className="wa-quality-grid">
                {CALL_VIDEO_QUALITY_PRESETS.map((preset) => {
                  const selected = callVideoQualityId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`wa-quality-option ${selected ? "is-selected" : ""}`}
                      onClick={() => setCallVideoQuality(preset.id)}
                      title={`${preset.label} (${preset.height}p, ${preset.frameRate}fps)`}
                    >
                      <span className="wa-quality-option-main">
                        <strong>{preset.label}</strong>
                        <small>
                          {preset.height}p • {preset.frameRate}fps
                        </small>
                      </span>
                      <span className="wa-quality-pill">{preset.short}</span>
                    </button>
                  );
                })}
              </div>
              <div className="wa-quality-selected-label">
                {(callVideoQualityPreset?.label || "Quality") + (callVideoQualityLabel ? ` • ${callVideoQualityLabel}` : "")}
              </div>
            </div>
          )}
          {!FORCE_BEAUTY_FILTER && showVideoFilters && (
            <div className="wa-video-filter-panel" role="listbox" aria-label="Video filters">
              <div className="wa-filter-circle-grid">
                {VIDEO_FILTER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    role="option"
                    aria-selected={videoFilterId === preset.id}
                    className={`wa-filter-circle ${videoFilterId === preset.id ? "is-selected" : ""}`}
                    onClick={() => setVideoFilterId(preset.id)}
                    title={preset.label}
                  >
                    <span>{preset.short || preset.label.slice(0, 1)}</span>
                  </button>
                ))}
              </div>
              <div className="wa-filter-selected-label">{activeVideoFilter?.label || "Beauty"}</div>
            </div>
          )}

          {showCallMoreMenu && (
            <div
              className="wa-video-more-backdrop"
              onClick={() => setShowCallMoreMenu(false)}
              role="presentation"
            >
              <aside
                className="wa-video-more-menu"
                role="menu"
                aria-label="Call options"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="wa-video-more-item"
                  onClick={() => {
                    setShowCallMoreMenu(false);
                    openGroupInvite();
                  }}
                >
                  <FiUserPlus /> Add people
                </button>

                <button
                  type="button"
                  className="wa-video-more-item"
                  onClick={() => {
                    setShowCallMoreMenu(false);
                    toggleScreenShare();
                  }}
                  disabled={callState.mode !== "video" || callState.phase === "idle"}
                >
                  <FiMonitor /> {isScreenSharing ? "Stop screen share" : "Screen share"}
                  <span className={`wa-video-more-meta ${isScreenSharing ? "is-on" : ""}`}>
                    {isScreenSharing ? "On" : ""}
                  </span>
                </button>

                <button
                  type="button"
                  className="wa-video-more-item"
                  onClick={() => {
                    setShowCallMoreMenu(false);
                    setShowVideoFilters(false);
                    setShowVideoQualityPanel((prev) => !prev);
                  }}
                  disabled={callState.mode !== "video" || callState.phase === "idle"}
                >
                  <span className="wa-video-more-pill">{callVideoQualityPreset?.short || "SD"}</span> Video quality
                  <span className="wa-video-more-meta">{callVideoQualityLabel || ""}</span>
                </button>

                {!FORCE_BEAUTY_FILTER && (
                  <button
                    type="button"
                    className="wa-video-more-item"
                    onClick={() => {
                      setShowCallMoreMenu(false);
                      setShowVideoQualityPanel(false);
                      setShowVideoFilters((prev) => !prev);
                    }}
                  >
                    <FiSmile /> Video filters
                    <span className={`wa-video-more-meta ${showVideoFilters ? "is-on" : ""}`}>
                      {showVideoFilters ? "On" : ""}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  className="wa-video-more-item"
                  onClick={() => {
                    setShowCallMoreMenu(false);
                    setSignAssistEnabled((prev) => !prev);
                  }}
                >
                  <MdSignLanguage /> Sign assist
                  <span className={`wa-video-more-meta ${signAssistEnabled ? "is-on" : ""}`}>
                    {signAssistEnabled ? "On" : ""}
                  </span>
                </button>

                <button
                  type="button"
                  className="wa-video-more-item"
                  onClick={() => {
                    setShowCallMoreMenu(false);
                    toggleSpeaker();
                  }}
                >
                  {isSpeakerOn ? <FiVolume2 /> : <FiVolumeX />} Speaker
                  <span className={`wa-video-more-meta ${isSpeakerOn ? "is-on" : ""}`}>
                    {isSpeakerOn ? "On" : "Off"}
                  </span>
                </button>

                <button
                  type="button"
                  className="wa-video-more-item"
                  onClick={() => {
                    setShowCallMoreMenu(false);
                    toggleCamera();
                  }}
                  disabled={callState.mode !== "video" || callState.phase === "idle"}
                >
                  {isCameraOff ? <FiVideoOff /> : <FiVideo />} Camera
                  <span className={`wa-video-more-meta ${!isCameraOff ? "is-on" : ""}`}>
                    {isCameraOff ? "Off" : "On"}
                  </span>
                </button>

                <button
                  type="button"
                  className="wa-video-more-item"
                  onClick={() => {
                    setShowCallMoreMenu(false);
                    toggleMute();
                  }}
                >
                  {isMuted ? <FiMicOff /> : <FiMic />} Microphone
                  <span className={`wa-video-more-meta ${!isMuted ? "is-on" : ""}`}>
                    {isMuted ? "Muted" : "On"}
                  </span>
                </button>

                <button
                  type="button"
                  className="wa-video-more-item is-danger"
                  onClick={() => {
                    setShowCallMoreMenu(false);
                    finishCall(true);
                  }}
                >
                  <FiPhoneOff /> End call
                </button>
              </aside>
            </div>
          )}
          <div className="wa-video-controls">
            <button type="button" className="call-control" onClick={toggleMute} title="Mute mic">
              {isMuted ? <FiMicOff /> : <FiMic />}
            </button>
            <button type="button" className="call-control" onClick={toggleSpeaker} title="Speaker on/off">
              {isSpeakerOn ? <FiVolume2 /> : <FiVolumeX />}
            </button>
            <button type="button" className="call-control" onClick={toggleCamera} title="Camera on/off">
              {isCameraOff ? <FiVideoOff /> : <FiVideo />}
            </button>
            <button
              type="button"
              className={`call-control ${showCallMoreMenu ? "is-active" : ""}`}
              onClick={() => {
                setShowVideoFilters(false);
                setShowVideoQualityPanel(false);
                setShowCallMoreMenu((prev) => !prev);
              }}
              title="More options"
            >
              <FiMoreVertical />
            </button>
            <button
              type="button"
              className="call-hangup"
              onClick={() => finishCall(true)}
              title="End call"
            >
              <FiPhoneOff />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
