import {
  FiArrowLeft,
  FiBellOff,
  FiChevronDown,
  FiChevronRight,
  FiClock,
  FiImage,
  FiLink,
  FiMic,
  FiMoreVertical,
  FiPhone,
  FiSearch,
  FiVideo,
  FiVolume2,
  FiVolumeX
} from "react-icons/fi";
import { useChat, DISAPPEARING_MESSAGE_OPTIONS } from "./hooks/useChat";

export default function ChatHeader({ onOpenUtilityPanel, onOpenSearch }) {
  const {
    isConversationRoute,
    navigate,
    activeContact,
    goToProfile,
    headerPresenceText,
    headerMenuWrapRef,
    showCallMenu,
    setShowCallMenu,
    showHeaderMenu,
    setShowHeaderMenu,
    setShowWallpaperPanel,
    setActiveUtilityPanel,
    callActive,
    incomingCall,
    callMenuRef,
    startOutgoingCall,
    headerMenuRef,
    toggleSpeaker,
    isSpeakerOn,
    activeMuted,
    setActiveContactMuted,
    activeDisappearingValue,
    setActiveDisappearingSetting,
    translatorEnabled,
    setTranslatorEnabled,
    signAssistAutoSpeak,
    setAutoSpeakEnabled,
    translatorLang,
    setTranslatorLang,
    TRANSLATE_LANG_OPTIONS,
    speechLang,
    setSpeechLang,
    speechLangOptions,
    speechVoiceGender,
    setSpeechVoiceGender,
    showSpeechTypingMic,
    setShowSpeechTypingMic,
    translatorError,
    blockActiveContact,
    activeContactBlocked
  } = useChat();

  if (!activeContact) return null;

  const openUtilityPanel = (panel) => {
    if (typeof onOpenUtilityPanel === "function") {
      onOpenUtilityPanel(panel);
    } else {
      setActiveUtilityPanel(panel);
      setShowHeaderMenu(false);
      setShowCallMenu(false);
      setShowWallpaperPanel(false);
    }
  };

  const handleUtilityRowMouseDown = (event, panel) => {
    event.preventDefault();
    event.stopPropagation();
    openUtilityPanel(panel);
  };

  const openSearchPanel = () => {
    if (typeof onOpenSearch === "function") {
      onOpenSearch();
      return;
    }
    openUtilityPanel("search");
  };

  const exitChatPage = () => {
    setShowHeaderMenu(false);
    setShowCallMenu(false);
    setShowWallpaperPanel(false);
    setActiveUtilityPanel("");
    if (isConversationRoute) {
      navigate("/chat");
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/feed");
  };

  return (
    <header className="chat-header wa-header">
      <div className="chat-header-main-wrap">
        <button type="button" className="chat-back-btn chat-exit-action" onClick={exitChatPage} title="Exit chat">
          <FiArrowLeft />
        </button>
        <button type="button" className="chat-header-main" onClick={() => goToProfile(activeContact)}>
          <span className="chat-avatar">
            {activeContact.profilePic ? (
              <img src={activeContact.profilePic} alt={activeContact.name} className="chat-avatar-img" />
            ) : (
              activeContact.avatar
            )}
          </span>
          <span className="wa-header-meta">
            <h3>{activeContact.name}</h3>
            <small>{headerPresenceText}</small>
          </span>
        </button>
      </div>

      <div className="chat-header-actions" ref={headerMenuWrapRef}>
        <div className="chat-call-menu-wrap">
          <button
            type="button"
            className={`call-action call-action-menu ${showCallMenu ? "is-active" : ""}`}
            title="Call options"
            onClick={() => {
              if (callActive || !!incomingCall) return;
              setShowCallMenu((prev) => !prev);
              setShowHeaderMenu(false);
              setShowWallpaperPanel(false);
              setActiveUtilityPanel("");
            }}
            disabled={callActive || !!incomingCall}
            aria-haspopup="menu"
            aria-expanded={showCallMenu}
          >
            <FiPhone className="call-action-icon" />
            <FiChevronDown className="call-action-caret" />
          </button>
          {showCallMenu && (
            <div className="chat-call-menu" ref={callMenuRef} role="menu">
              <button
                type="button"
                className="chat-call-menu-item"
                onClick={() => {
                  startOutgoingCall("audio");
                  setShowCallMenu(false);
                }}
                role="menuitem"
              >
                <FiPhone /> Voice call
              </button>
              <button
                type="button"
                className="chat-call-menu-item"
                onClick={() => {
                  startOutgoingCall("video");
                  setShowCallMenu(false);
                }}
                role="menuitem"
              >
                <FiVideo /> Video call
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          className="call-action"
          title="Search in chat"
          onClick={openSearchPanel}
          aria-label="Search in chat"
        >
          <FiSearch />
        </button>
        <button
          type="button"
          className="call-action"
          title="More options"
          onClick={() => {
            setShowHeaderMenu((prev) => !prev);
            setShowCallMenu(false);
            setShowWallpaperPanel(false);
            setActiveUtilityPanel("");
          }}
        >
          <FiMoreVertical />
        </button>
        {showHeaderMenu && (
          <aside className="chat-header-menu" ref={headerMenuRef}>
            {callActive && (
              <button
                type="button"
                className="chat-header-menu-row"
                onClick={() => {
                  toggleSpeaker();
                  setShowHeaderMenu(false);
                }}
                title="Speaker on/off"
              >
                {isSpeakerOn ? <FiVolume2 /> : <FiVolumeX />} {isSpeakerOn ? "Speaker on" : "Speaker off"}
              </button>
            )}
            <button
              type="button"
              className="chat-header-menu-row chat-header-menu-link"
              data-panel="media"
              onMouseDown={(event) => handleUtilityRowMouseDown(event, "media")}
              onClick={() => openUtilityPanel("media")}
            >
              <span className="chat-menu-action-start">
                <span className="chat-menu-action-icon">
                  <FiImage />
                </span>
                <strong>Media</strong>
              </span>
              <FiChevronRight />
            </button>
            <button
              type="button"
              className="chat-header-menu-row chat-header-menu-link"
              data-panel="links-documents"
              onMouseDown={(event) => handleUtilityRowMouseDown(event, "links-documents")}
              onClick={() => openUtilityPanel("links-documents")}
            >
              <span className="chat-menu-action-start">
                <span className="chat-menu-action-icon">
                  <FiLink />
                </span>
                <strong>Links and documents</strong>
              </span>
              <FiChevronRight />
            </button>
            <div className="chat-translate-card">
              <label className="chat-header-menu-row chat-switch-row">
                <span className="chat-menu-action-start">
                  <span className="chat-menu-action-icon">
                    <FiBellOff />
                  </span>
                  <strong>Mute notifications</strong>
                </span>
                <span className="chat-switch">
                  <input
                    type="checkbox"
                    checked={activeMuted}
                    onChange={(e) => setActiveContactMuted(e.target.checked)}
                  />
                  <span className="chat-switch-track" />
                </span>
              </label>
            </div>
            <label className="chat-header-menu-row chat-language-row">
              <span className="chat-menu-action-start">
                <span className="chat-menu-action-icon">
                  <FiClock />
                </span>
                <strong>Disappearing messages</strong>
              </span>
              <select
                className="chat-translate-select"
                value={activeDisappearingValue}
                onChange={(e) => setActiveDisappearingSetting(e.target.value)}
              >
                {DISAPPEARING_MESSAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="chat-translate-card">
              <label className="chat-header-menu-row chat-switch-row">
                <span className="chat-menu-label-group">
                  <strong>Translator</strong>
                </span>
                <span className="chat-switch">
                  <input
                    type="checkbox"
                    checked={translatorEnabled}
                    onChange={(e) => setTranslatorEnabled(e.target.checked)}
                  />
                  <span className="chat-switch-track" />
                </span>
              </label>
            </div>
            <div className="chat-translate-card">
              <label className="chat-header-menu-row chat-switch-row">
                <span className="chat-menu-label-group">
                  <strong>Auto-speak</strong>
                </span>
                <span className="chat-switch">
                  <input
                    type="checkbox"
                    checked={signAssistAutoSpeak}
                    onChange={(e) => setAutoSpeakEnabled(e.target.checked)}
                  />
                  <span className="chat-switch-track" />
                </span>
              </label>
            </div>
            <div className="chat-translate-card">
              <label className="chat-header-menu-row chat-switch-row">
                <span className="chat-menu-action-start">
                  <span className="chat-menu-action-icon">
                    <FiMic />
                  </span>
                  <strong>Speak-to-type mic</strong>
                </span>
                <span className="chat-switch">
                  <input
                    type="checkbox"
                    checked={showSpeechTypingMic}
                    onChange={(e) => setShowSpeechTypingMic(e.target.checked)}
                  />
                  <span className="chat-switch-track" />
                </span>
              </label>
            </div>
            {translatorEnabled && (
              <label className="chat-header-menu-row chat-language-row">
                <span className="chat-menu-label-group">
                  <strong>Language</strong>
                </span>
                <select
                  className="chat-translate-select"
                  value={translatorLang}
                  onChange={(e) => setTranslatorLang(e.target.value)}
                >
                  {TRANSLATE_LANG_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="chat-header-menu-row chat-language-row">
              <span className="chat-menu-label-group">
                <strong>Speak language</strong>
              </span>
              <select className="chat-translate-select" value={speechLang} onChange={(e) => setSpeechLang(e.target.value)}>
                {speechLangOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="chat-header-menu-row chat-language-row">
              <span className="chat-menu-label-group">
                <strong>Voice</strong>
              </span>
              <select
                className="chat-translate-select"
                value={speechVoiceGender}
                onChange={(e) => setSpeechVoiceGender(e.target.value)}
              >
                <option value="female">Female voice</option>
                <option value="male">Male voice</option>
              </select>
            </label>
            <button
              type="button"
              className="chat-header-menu-row chat-header-menu-link"
              onClick={() => {
                setShowWallpaperPanel(true);
                setShowHeaderMenu(false);
                setShowCallMenu(false);
              }}
            >
              <span className="chat-menu-action-start">
                <span className="chat-menu-action-icon">
                  <FiImage />
                </span>
                <strong>Chat wallpaper</strong>
              </span>
              <FiChevronRight />
            </button>
            {translatorError && <p className="chat-translate-error">{translatorError}</p>}
            <button
              type="button"
              className="chat-header-menu-row chat-header-danger-btn"
              onClick={blockActiveContact}
              disabled={activeContactBlocked}
            >
              {activeContactBlocked ? "User blocked" : "Block user"}
            </button>
          </aside>
        )}
      </div>
    </header>
  );
}
