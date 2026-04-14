import { MdSignLanguage } from "react-icons/md";
import {
  FiMic,
  FiMicOff,
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
import { useChat, FORCE_BEAUTY_FILTER, GROUP_CALL_MAX, VIDEO_FILTER_PRESETS, CALL_VIDEO_QUALITY_PRESETS } from "./hooks/useChat";

export default function VideoCall({ placement = "page" }) {
  const ctx = useChat();

  if (placement === "page") {
    const {
      isConversationRoute,
      callActive,
      callState,
      groupCallActive,
      navigate,
      activeContactId,
      pipActive,
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
        {!isConversationRoute && callActive && (callState.mode === "video" || groupCallActive) && (
          <button
            type="button"
            className="call-return-banner"
            onClick={() => {
              const targetId = callState.peerId && callState.peerId !== "group" ? callState.peerId : activeContactId;
              if (targetId) {
                navigate(`/chat/${targetId}`);
              }
            }}
          >
            Return to call {pipActive ? "(PiP closed)" : ""}
          </button>
        )}

        {groupInviteOpen && (
          <div className="group-call-overlay" role="dialog" aria-label="Start group call">
            <div className="group-call-card">
              <h3>Start group video call</h3>
              <p>Select up to {GROUP_CALL_MAX} people</p>
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
                  onClick={groupCallActive ? addPeopleToGroupCall : startGroupCall}
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
    upgradeCallToVideo,
    finishCall,
    showVideoCallScreen,
    groupCallActive,
    localVideoRef,
    remoteVideoRef,
    pipDismissedRef,
    pipEnabled,
    navigate,
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
    hasRemoteVideo,
    hasRemoteAudio,
    localVideoPos,
    startLocalVideoDrag,
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
    signAssistStatus
  } = ctx;

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
          <div className="active-call-popup-actions">
            <button type="button" className="call-ring-toggle" onClick={toggleMute}>
              {isMuted ? "Unmute mic" : "Mute mic"}
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
      {callActive && !incomingCall && !showVideoCallScreen && (
        <button
          type="button"
          className="call-floating-end"
          onClick={() => finishCall(true)}
          title="End call"
        >
          <FiPhoneOff /> End call
        </button>
      )}

      {showVideoCallScreen && (
        <div className="wa-video-call-screen" role="dialog" aria-live="polite" aria-label="Video call screen">
          {groupCallActive ? (
            <div className="wa-video-grid">
              <div className="wa-video-tile is-local">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
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
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted
                className={`wa-video-remote ${remoteIsScreenShare ? "is-screen" : "is-mirror"}`}
                data-allow-simultaneous="true"
              />
              {!hasRemoteVideo && !hasRemoteAudio && (
                <div className="wa-video-remote-indicator" aria-live="polite">
                  <span className="wa-video-remote-indicator-icon">◎</span>
                  <span className="wa-video-remote-indicator-text">Camera off</span>
                </div>
              )}
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`wa-video-local ${isScreenSharing ? "is-screen" : "is-mirror"} ${localVideoPos ? "is-dragged" : ""}`}
                style={{
                  filter: activeVideoFilter.css,
                  ...(localVideoPos
                    ? { left: `${localVideoPos.x}px`, top: `${localVideoPos.y}px`, right: "auto", bottom: "auto" }
                    : {})
                }}
                onPointerDown={startLocalVideoDrag}
                data-allow-simultaneous="true"
              />
            </>
          )}
          <div className="wa-video-top">
            <button
              type="button"
              className="wa-video-exit"
              onClick={() => {
                const el = remoteVideoRef.current;
                pipDismissedRef.current = false;
                if (pipEnabled && el && typeof el.requestPictureInPicture === "function") {
                  el.requestPictureInPicture?.().catch(() => {});
                }
                navigate(-1);
              }}
              title="Exit call"
            >
              Exit
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
              </div>
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
          <div className="wa-video-controls">
            {callActive && (
              <button
                type="button"
                className="call-control"
                onClick={openGroupInvite}
                title="Add people"
              >
                <FiUserPlus />
              </button>
            )}
            <button type="button" className="call-control" onClick={toggleMute} title="Mute mic">
              {isMuted ? <FiMicOff /> : <FiMic />}
            </button>
            <button type="button" className="call-control" onClick={toggleSpeaker} title="Speaker on/off">
              {isSpeakerOn ? <FiVolume2 /> : <FiVolumeX />}
            </button>
            <button
              type="button"
              className={`call-control ${isScreenSharing ? "is-active" : ""}`}
              onClick={toggleScreenShare}
              title="Screen share"
              disabled={callState.mode !== "video" || callState.phase === "idle"}
            >
              <FiMonitor />
            </button>
            <button type="button" className="call-control" onClick={toggleCamera} title="Camera on/off">
              {isCameraOff ? <FiVideoOff /> : <FiVideo />}
            </button>
            <button
              type="button"
              className={`call-control ${showVideoQualityPanel ? "is-active" : ""}`}
              onClick={() => {
                setShowVideoFilters(false);
                setShowVideoQualityPanel((prev) => !prev);
              }}
              title={`Video quality${callVideoQualityLabel ? ` (${callVideoQualityLabel})` : ""}`}
              disabled={callState.mode !== "video" || callState.phase === "idle"}
            >
              <span className="wa-quality-chip">{callVideoQualityPreset?.short || "SD"}</span>
            </button>
            {!FORCE_BEAUTY_FILTER && (
              <button
                type="button"
                className={`call-control ${showVideoFilters ? "is-active" : ""}`}
                onClick={() => {
                  setShowVideoQualityPanel(false);
                  setShowVideoFilters((prev) => !prev);
                }}
                title="Video filters"
              >
                <FiSmile />
              </button>
            )}
            <button
              type="button"
              className={`call-control ${signAssistEnabled ? "is-active" : ""}`}
              onClick={() => setSignAssistEnabled((prev) => !prev)}
              title="Sign assist"
            >
              <MdSignLanguage />
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
